//! WebSocket hub: connection registry (several tabs per user) and the ordered
//! publish pipeline. Every api instance runs one; they share state through
//! Redis (fan-out in `broker`, presence in `presence`, bid limits in `limits`).
//!
//! Delivery guarantees (cahier §6 "reconnexion"):
//! - ORDER: total — an event is journalled and published in one transaction
//!   under an advisory lock (see `journal`), so every instance receives events
//!   in strict `seq` order, whichever instance produced them;
//! - live: AT MOST ONCE — fan-out uses `try_send`; a full or dead channel drops
//!   the frame. A lost broker subscription drops the instance's connections, so
//!   their clients resync instead of silently missing frames (see `broker`);
//! - after resync: AT LEAST ONCE — every event is journalled before it is
//!   published, and `sync` replays the journal;
//! - duplicates (a replay racing a late live frame) are filtered client-side
//!   by `seq` (web/src/socket/auctionSocket.ts).

pub mod bids;
pub mod broker;
pub mod handler;
pub mod journal;
pub mod limits;
pub mod presence;
pub mod routes;

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

use redis::aio::ConnectionManager;
use serde_json::{json, Value};
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::metrics;

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

/// One live connection of this instance: owner plus its outbound channel.
struct Conn {
    user: Uuid,
    tx: mpsc::Sender<String>,
}

struct HubInner {
    conns: Mutex<HashMap<u64, Conn>>,
    next_conn: AtomicU64,
    publish_tx: mpsc::Sender<Publish>,
    /// Shared Redis connection (multiplexed, reconnects by itself).
    redis: ConnectionManager,
    /// This instance's name (`INSTANCE_NAME`), for logs and `/healthz`.
    instance: String,
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
    pub fn new(publish_tx: mpsc::Sender<Publish>, redis: ConnectionManager, instance: String) -> Self {
        Self {
            inner: Arc::new(HubInner {
                conns: Mutex::new(HashMap::new()),
                next_conn: AtomicU64::new(1),
                publish_tx,
                redis,
                instance,
            }),
        }
    }

    /// Clone of the shared Redis connection (cheap: multiplexed handle).
    pub fn redis(&self) -> ConnectionManager {
        self.inner.redis.clone()
    }

    pub fn instance(&self) -> &str {
        &self.inner.instance
    }

    /// Registers a connection and returns its handle.
    pub fn register(&self, user: Uuid, tx: mpsc::Sender<String>) -> u64 {
        let id = self.inner.next_conn.fetch_add(1, Ordering::Relaxed);
        let mut conns = lock(&self.inner.conns);
        conns.insert(id, Conn { user, tx });
        metrics::CONNECTIONS.set(conns.len() as i64);
        id
    }

    /// Drops a connection from the registry.
    pub fn unregister(&self, conn: u64) {
        let mut conns = lock(&self.inner.conns);
        conns.remove(&conn);
        metrics::CONNECTIONS.set(conns.len() as i64);
    }

    /// Closes every local connection: dropping their senders ends each
    /// connection loop, and the clients reconnect and resync.
    pub fn drop_connections(&self) {
        let mut conns = lock(&self.inner.conns);
        conns.clear();
        metrics::CONNECTIONS.set(0);
    }

    /// Non-blocking fan-out. Closed channels are pruned; full ones keep the
    /// connection but drop the frame (at-most-once live, see module docs).
    pub fn broadcast_all(&self, text: &str) {
        let mut conns = lock(&self.inner.conns);
        conns.retain(|_, conn| match conn.tx.try_send(text.to_owned()) {
            Ok(()) => {
                metrics::FRAMES_SENT.inc();
                true
            }
            Err(mpsc::error::TrySendError::Full(_)) => true,
            Err(mpsc::error::TrySendError::Closed(_)) => false,
        });
        metrics::CONNECTIONS.set(conns.len() as i64);
    }

    /// Non-blocking send to one connection (a `sync` reply). A full or gone
    /// connection drops the frame, like any live frame.
    pub fn send_to_conn(&self, conn: u64, text: &str) {
        if let Some(conn) = lock(&self.inner.conns).get(&conn) {
            let _ = conn.tx.try_send(text.to_owned());
        }
    }

    /// Non-blocking send to every tab of one user.
    pub fn send_to_user(&self, user: Uuid, text: &str) {
        let conns = lock(&self.inner.conns);
        for conn in conns.values().filter(|conn| conn.user == user) {
            if conn.tx.try_send(text.to_owned()).is_ok() {
                metrics::FRAMES_SENT.inc();
            }
        }
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
    metrics::ERRORS.with_label_values(&[code]).inc();
    hub.publish(
        Audience::User(user),
        json!({ "type": "error", "code": code, "detail": detail }),
    )
    .await;
}

/// Decodes a tagged client-message body after stripping `type`, strictly:
/// unknown fields or wrong types yield None (→ `malformed_message`).
pub fn parse_message<T: serde::de::DeserializeOwned>(value: &Value) -> Option<T> {
    let mut object = value.clone();
    object.as_object_mut()?.remove("type");
    serde_json::from_value(object).ok()
}

/// Single writer per instance: hands each queued event to the journal, which
/// stamps its `seq` and publishes it to every instance, in queue order.
pub async fn run_publisher(mut rx: mpsc::Receiver<Publish>, pool: sqlx::PgPool, hub: Hub) {
    let mut broker = hub.redis();
    while let Some(publish) = rx.recv().await {
        let event_type = publish
            .event
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_owned();
        if let Err(err) = journal::append_and_publish(
            &pool,
            &mut broker,
            &publish.audience,
            &event_type,
            &publish.event,
        )
        .await
        {
            tracing::error!(error = %err, "journal append or publish failed, event dropped");
        }
    }
}
