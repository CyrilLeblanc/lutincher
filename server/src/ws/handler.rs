//! Per-connection loop: inbound parsing and limits (malformed/oversized
//! frames never take the connection nor the server down), dispatch to the
//! bid pipeline or the sync replay, outbound fan-out, presence bookkeeping.

use axum::extract::ws::{Message, WebSocket};
use serde_json::{json, Value};
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::auth::token::Claims;
use crate::metrics;
use crate::state::AppState;
use crate::ws::{self, error_code, journal, presence, Hub};

/// Outbound channel per connection; a full channel drops frames
/// (at-most-once live, the resync covers the loss).
const OUTBOUND_CAPACITY: usize = 32;
/// Hard cap on inbound text frames, in bytes (cahier §6).
const MAX_MESSAGE_BYTES: usize = 512;
/// Sync replay batch size (keeps each replay query bounded).
const SYNC_BATCH: i64 = 500;

/// Serves one connection until it closes; presence is announced on both ends.
pub async fn serve(mut socket: WebSocket, state: AppState, claims: Claims) {
    let (tx, mut rx) = mpsc::channel::<String>(OUTBOUND_CAPACITY);
    let hub = state.hub().clone();
    // The registry holds the only sender: dropping the registration (broker
    // reset) closes `rx` and ends this loop.
    let conn = hub.register(claims.sub, tx);
    // Presence is keyed by connection, not by user: two tabs stay two entries.
    let presence_id = Uuid::new_v4();
    presence::join(&hub, presence_id, &claims.username).await;
    tracing::info!(instance = hub.instance(), user = %claims.username, "websocket opened");

    loop {
        tokio::select! {
            outbound = rx.recv() => {
                match outbound {
                    Some(text) => {
                        if socket.send(Message::Text(text.into())).await.is_err() {
                            break;
                        }
                    }
                    // All senders dropped: nothing more can arrive.
                    None => break,
                }
            }
            inbound = socket.recv() => {
                match inbound {
                    Some(Ok(Message::Text(text))) => {
                        if !handle_text(&state, &hub, conn, &claims, presence_id, &text).await {
                            break;
                        }
                    }
                    // JSON-text protocol: binary frames are malformed input.
                    Some(Ok(Message::Binary(_))) => {
                        ws::send_error(&hub, claims.sub, error_code::MALFORMED_MESSAGE,
                            "text frames only").await;
                    }
                    // Tungstenite answers pings itself: keepalive, nothing to do.
                    Some(Ok(Message::Ping(_))) | Some(Ok(Message::Pong(_))) => {}
                    Some(Ok(Message::Close(_))) => break,
                    Some(Err(err)) => {
                        tracing::debug!(error = %err, "websocket receive failed");
                        break;
                    }
                    None => break,
                }
            }
        }
    }
    hub.unregister(conn);
    presence::leave(&hub, presence_id).await;
    metrics::DISCONNECTS.inc();
    tracing::info!(instance = hub.instance(), user = %claims.username, "websocket closed");
}

/// Decodes one inbound text frame; false closes the connection.
async fn handle_text(
    state: &AppState,
    hub: &Hub,
    conn: u64,
    claims: &Claims,
    presence_id: Uuid,
    text: &str,
) -> bool {
    if text.len() > MAX_MESSAGE_BYTES {
        ws::send_error(hub, claims.sub, error_code::MESSAGE_TOO_LARGE,
            "message exceeds 512 bytes").await;
        return true;
    }
    let Ok(value) = serde_json::from_str::<Value>(text) else {
        ws::send_error(hub, claims.sub, error_code::MALFORMED_MESSAGE,
            "invalid json").await;
        return true;
    };
    let kind = value.get("type").and_then(Value::as_str);
    match kind {
        // Client heartbeat (every 10 s): renews this tab's presence entry.
        Some("ping") => presence::heartbeat(hub, presence_id, &claims.username).await,
        Some("sync") => handle_sync(state, hub, conn, claims, &value).await,
        Some("bid") => super::bids::handle(state, hub, claims, &value).await,
        _ => {
            ws::send_error(hub, claims.sub, error_code::MALFORMED_MESSAGE,
                "unknown or missing message type").await;
        }
    }
    true
}

/// Body of a `sync` message.
#[derive(Debug, serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct SyncMsg {
    last_seq: i64,
}

/// Replays the journal after `last_seq` as ONE `sync` envelope, sent directly
/// on the connection (a replay carries existing seqs: no journal entry).
async fn handle_sync(
    state: &AppState,
    hub: &Hub,
    conn: u64,
    claims: &Claims,
    value: &Value,
) {
    let Some(msg) = ws::parse_message::<SyncMsg>(value) else {
        ws::send_error(hub, claims.sub, error_code::MALFORMED_MESSAGE,
            "malformed sync message").await;
        return;
    };
    if msg.last_seq < 0 {
        ws::send_error(hub, claims.sub, error_code::MALFORMED_MESSAGE,
            "last_seq must be >= 0").await;
        return;
    }
    let pool = state.pool();
    let mut events = Vec::new();
    let mut cursor = msg.last_seq;
    loop {
        let batch = match journal::events_after(pool, cursor, SYNC_BATCH).await {
            Ok(batch) => batch,
            Err(err) => {
                tracing::error!(error = %err, "sync replay query failed");
                return;
            }
        };
        let fetched = batch.len();
        for (seq, mut payload) in batch {
            // Stored payloads carry no seq: re-stamp from the journal row.
            payload["seq"] = json!(seq);
            events.push(payload);
            cursor = seq;
        }
        if fetched < SYNC_BATCH as usize {
            break;
        }
    }
    let envelope = json!({ "type": "sync", "events": events, "seq": cursor }).to_string();
    hub.send_to_conn(conn, &envelope);
}
