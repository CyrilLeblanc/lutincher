//! Cross-instance fan-out over Redis pub/sub (phase 4). Every journalled batch
//! is PUBLISHed, frame by frame, in one Redis transaction on [`CHANNEL`]; each
//! api instance SUBSCRIBEs and hands the frames to its own connections. Redis is
//! a pipe, not a store: the journal stays the source of truth, so a frame
//! missed during an outage is recovered by `sync`.

use std::time::Duration;

use futures_util::{Stream, StreamExt};
use redis::aio::ConnectionManager;
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use super::Hub;
use crate::metrics;

/// Pub/sub channel carrying every journalled event.
const CHANNEL: &str = "lutincher:events";
/// Pause before resubscribing after a failed or lost subscription.
const RETRY_DELAY: Duration = Duration::from_secs(1);

/// Wire format on the channel: the stamped event, its audience (`null` =
/// everyone, otherwise the user's tabs only) and the publish time in unix ms,
/// which the receiving instances turn into the broadcast latency.
#[derive(Debug, Deserialize)]
struct Envelope {
    user: Option<Uuid>,
    event: Value,
    at: i64,
}

/// Publishes a batch of stamped events in one round trip, as one Redis
/// transaction: subscribers receive the frames in order, or none of them.
pub async fn publish_batch(
    broker: &mut ConnectionManager,
    frames: &[(Option<Uuid>, Value)],
) -> redis::RedisResult<()> {
    let at = chrono::Utc::now().timestamp_millis();
    let mut pipe = redis::pipe();
    pipe.atomic();
    for (user, event) in frames {
        let payload = json!({ "user": user, "event": event, "at": at }).to_string();
        pipe.cmd("PUBLISH").arg(CHANNEL).arg(payload).ignore();
    }
    pipe.query_async::<()>(broker).await
}

/// Runs for the life of the process: subscribes, delivers, resubscribes.
///
/// Local connections are dropped on both edges of a subscription. Frames
/// published while it was down cannot be replayed live, so every client
/// reconnects and resyncs from the journal.
pub async fn run_subscriber(client: redis::Client, hub: Hub) {
    loop {
        match subscribe(&client).await {
            Ok(messages) => {
                hub.drop_connections();
                tracing::info!(instance = hub.instance(), "subscribed to the event channel");
                deliver(messages, &hub).await;
                hub.drop_connections();
                metrics::BROKER_RESETS.inc();
                tracing::warn!(instance = hub.instance(), "event subscription lost");
            }
            Err(err) => tracing::warn!(error = %err, "event subscription failed, retrying"),
        }
        tokio::time::sleep(RETRY_DELAY).await;
    }
}

async fn subscribe(client: &redis::Client) -> redis::RedisResult<impl Stream<Item = redis::Msg>> {
    let mut pubsub = client.get_async_pubsub().await?;
    pubsub.subscribe(CHANNEL).await?;
    Ok(pubsub.into_on_message())
}

/// Hands each frame to the local connections it targets, in arrival order
/// (one subscription, so the order is the publish order).
async fn deliver(messages: impl Stream<Item = redis::Msg>, hub: &Hub) {
    let mut messages = std::pin::pin!(messages);
    while let Some(message) = messages.next().await {
        let Ok(payload) = message.get_payload::<String>() else {
            continue;
        };
        let Ok(envelope) = serde_json::from_str::<Envelope>(&payload) else {
            tracing::warn!("malformed broker frame dropped");
            continue;
        };
        let elapsed_ms = chrono::Utc::now().timestamp_millis() - envelope.at;
        metrics::BROADCAST_LATENCY.observe(elapsed_ms.max(0) as f64 / 1000.0);
        let text = envelope.event.to_string();
        match envelope.user {
            None => hub.broadcast_all(&text),
            Some(user) => hub.send_to_user(user, &text),
        }
    }
}
