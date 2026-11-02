//! WebSocket hub: connection registry (several tabs per user), ordered
//! publish pipeline and per-user bid rate limiting.
//!
//! Delivery guarantees (cahier §6 "reconnexion"):
//! - live: AT MOST ONCE — fan-out uses `try_send`; a full or dead channel
//!   simply drops the frame;
//! - after resync: AT LEAST ONCE — every broadcast is first appended to the
//!   `events` journal (which allocates `seq`), then `sync` replays it;
//! - ORDER: total — the single publisher task serializes journal insert and
//!   broadcast, so clients observe events in strict `seq` order;
//! - duplicates (a replay racing a late live frame) are filtered client-side
//!   by `seq` (web/src/socket/auctionSocket.ts).

pub mod bids;
pub mod handler;
pub mod journal;
pub mod routes;

use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use serde_json::{json, Value};
use tokio::sync::mpsc;
use uuid::Uuid;

/// Recipient of a published event.
#[derive(Debug, Clone)]
pub enum Audience {
    /// Every live connection.
    All,
    /// Only the connections of one user (`outbid`, `error`).
    User(Uuid),
}

/// Event queued for journalling + broadcast; `event` carries its own `type`.
#[derive(Debug)]
pub struct Publish {
    pub audience: Audience,
    pub event: Value,
}

/// Error codes of the `error` WS event (contract §5).
pub mod error_code {
    pub const FORBIDDEN: &str = "forbidden";
    pub const BID_TOO_LOW: &str = "bid_too_low";
    pub const INSUFFICIENT_FUNDS: &str = "insufficient_funds";
    pub const AUCTION_NOT_OPEN: &str = "auction_not_open";
    pub const MALFORMED_MESSAGE: &str = "malformed_message";
    pub const MESSAGE_TOO_LARGE: &str = "message_too_large";
    pub const RATE_LIMITED: &str = "rate_limited";
}

/// Bid rate limit: 5 bids per sliding 10 s window, per user (cahier §6).
const BID_WINDOW: Duration = Duration::from_secs(10);
const BID_MAX: usize = 5;

/// One live connection: owner plus its outbound channel.
struct Conn {
    user: Uuid,
    username: String,
    tx: mpsc::Sender<String>,
}

struct HubInner {
    conns: Mutex<HashMap<u64, Conn>>,
    next_conn: AtomicU64,
    publish_tx: mpsc::Sender<Publish>,
    /// Sliding bid windows, keyed by user (shared across their tabs).
    bid_windows: Mutex<HashMap<Uuid, VecDeque<Instant>>>,
}

/// Shared hub handle; clone freely.
#[derive(Clone)]
pub struct Hub {
    inner: Arc<HubInner>,
}

/// Locks without panicking on a poisoned mutex (a panicked owner cannot
/// corrupt these plain maps).
fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Publish-pipeline capacity; producers await when full (backpressure), the
/// publisher drains in journal order.
const PUBLISH_CAPACITY: usize = 256;

/// Creates the publish channel feeding [`run_publisher`]; pass the sender to
/// [`Hub::new`], the receiver to the publisher task.
pub fn publish_channel() -> (mpsc::Sender<Publish>, mpsc::Receiver<Publish>) {
    mpsc::channel(PUBLISH_CAPACITY)
}

impl Hub {
    pub fn new(publish_tx: mpsc::Sender<Publish>) -> Self {
        Self {
            inner: Arc::new(HubInner {
                conns: Mutex::new(HashMap::new()),
                next_conn: AtomicU64::new(1),
                publish_tx,
                bid_windows: Mutex::new(HashMap::new()),
            }),
        }
    }

    /// Registers a connection and returns its handle.
    pub fn register(&self, user: Uuid, username: &str, tx: mpsc::Sender<String>) -> u64 {
        let id = self.inner.next_conn.fetch_add(1, Ordering::Relaxed);
        lock(&self.inner.conns).insert(
            id,
            Conn {
                user,
                username: username.to_owned(),
                tx,
            },
        );
        id
    }

    /// Drops a connection from the registry.
    pub fn unregister(&self, conn: u64) {
        lock(&self.inner.conns).remove(&conn);
    }

    /// Distinct usernames behind at least one live connection, sorted
    /// (contract: `presence.online`).
    pub fn online_usernames(&self) -> Vec<String> {
        let conns = lock(&self.inner.conns);
        let mut names: Vec<String> = conns.values().map(|conn| conn.username.clone()).collect();
        names.sort();
        names.dedup();
        names
    }

    /// Non-blocking fan-out. Closed channels are pruned; full ones keep the
    /// connection but drop the frame (at-most-once live, see module docs).
    pub fn broadcast_all(&self, text: &str) {
        let mut conns = lock(&self.inner.conns);
        conns.retain(|_, conn| {
            !matches!(
                conn.tx.try_send(text.to_owned()),
                Err(mpsc::error::TrySendError::Closed(_))
            )
        });
    }

    /// Non-blocking send to every tab of one user.
    pub fn send_to_user(&self, user: Uuid, text: &str) {
        let conns = lock(&self.inner.conns);
        for conn in conns.values().filter(|conn| conn.user == user) {
            let _ = conn.tx.try_send(text.to_owned());
        }
    }

    /// Sliding-window check; records the attempt when allowed.
    pub fn bid_allowed(&self, user: Uuid) -> bool {
        let mut windows = lock(&self.inner.bid_windows);
        let now = Instant::now();
        let window = windows.entry(user).or_default();
        while window.front().is_some_and(|at| now.duration_since(*at) >= BID_WINDOW) {
            window.pop_front();
        }
        if window.len() >= BID_MAX {
            return false;
        }
        window.push_back(now);
        true
    }

    /// Queues one event for journalling + broadcast, in order.
    pub async fn publish(&self, audience: Audience, event: Value) {
        if let Err(err) = self.inner.publish_tx.send(Publish { audience, event }).await {
            tracing::error!(error = %err, "publish channel closed, event dropped");
        }
    }

    /// Broadcast-to-all shorthand.
    pub async fn publish_all(&self, event: Value) {
        self.publish(Audience::All, event).await;
    }
}

/// Queues a targeted `error` event. The journal gives it a `seq` (keeping the
/// client cursor monotonic) but `sync` never replays error rows.
pub async fn send_error(hub: &Hub, user: Uuid, code: &str, detail: &str) {
    hub.publish(
        Audience::User(user),
        json!({ "type": "error", "code": code, "detail": detail }),
    )
    .await;
}

/// Broadcasts the current presence after any connect/disconnect.
pub async fn publish_presence(hub: &Hub) {
    let online: Vec<Value> = hub
        .online_usernames()
        .into_iter()
        .map(|name| json!({ "user": name }))
        .collect();
    hub.publish_all(json!({ "type": "presence", "online": online })).await;
}

/// Decodes a tagged client-message body after stripping `type`, strictly:
/// unknown fields or wrong types yield None (→ `malformed_message`).
pub fn parse_message<T: serde::de::DeserializeOwned>(value: &Value) -> Option<T> {
    let mut object = value.clone();
    object.as_object_mut()?.remove("type");
    serde_json::from_value(object).ok()
}

/// Single-writer task: journal insert (allocating `seq`) strictly before the
/// broadcast, so every client sees journal order on the wire.
pub async fn run_publisher(mut rx: mpsc::Receiver<Publish>, pool: sqlx::PgPool, hub: Hub) {
    while let Some(publish) = rx.recv().await {
        let event_type = publish
            .event
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_owned();
        match journal::append(&pool, &event_type, &publish.event).await {
            Ok(seq) => {
                let mut event = publish.event;
                event["seq"] = json!(seq);
                let text = event.to_string();
                match publish.audience {
                    Audience::All => hub.broadcast_all(&text),
                    Audience::User(user) => hub.send_to_user(user, &text),
                }
            }
            Err(err) => tracing::error!(error = %err, "journal append failed, event dropped"),
        }
    }
}
