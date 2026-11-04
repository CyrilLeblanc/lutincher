//! Presence shared by every instance (cahier §4.1 J8, §6 "Présence").
//!
//! One Redis key per live connection (`presence:conn:<id>` = username) that
//! expires after [`TTL_S`]. Each client heartbeat (`ping`, every 10 s) renews
//! it, so a tab that stops answering (crash, lost network) leaves the list
//! within the announced delay. The online list is the union of the live keys.
//! Only the instance whose `SET ... GET` flips the stored snapshot publishes
//! the new list, so one change yields one `presence` event whichever instance
//! noticed it.

use std::time::Duration;

use redis::aio::ConnectionManager;
use redis::AsyncCommands;
use serde_json::{json, Value};
use uuid::Uuid;

use super::Hub;

/// Lifetime of a connection key without heartbeat (clients ping every 10 s).
pub const TTL_S: u64 = 25;
/// How often each instance recomputes the union, so expired keys are noticed.
const SWEEP_PERIOD: Duration = Duration::from_secs(2);
const KEY_PREFIX: &str = "presence:conn:";
const SNAPSHOT_KEY: &str = "presence:snapshot";

fn conn_key(conn: Uuid) -> String {
    format!("{KEY_PREFIX}{conn}")
}

/// Marks a connection online and publishes the new list if it changed.
pub async fn join(hub: &Hub, conn: Uuid, username: &str) {
    heartbeat(hub, conn, username).await;
    publish_if_changed(hub).await;
}

/// Renews a connection's key (client `ping`). Recreates it if it had expired.
pub async fn heartbeat(hub: &Hub, conn: Uuid, username: &str) {
    let mut broker = hub.redis();
    if let Err(err) = broker.set_ex::<_, _, ()>(conn_key(conn), username, TTL_S).await {
        tracing::error!(error = %err, "presence heartbeat failed");
    }
}

/// Marks a connection offline and publishes the new list if it changed.
pub async fn leave(hub: &Hub, conn: Uuid) {
    let mut broker = hub.redis();
    if let Err(err) = broker.del::<_, ()>(conn_key(conn)).await {
        tracing::error!(error = %err, "presence removal failed");
    }
    publish_if_changed(hub).await;
}

/// Periodic sweep: an expired key changes the union without any event to
/// announce it, so every instance re-checks on a short period.
pub async fn run_sweep(hub: Hub) {
    let mut ticker = tokio::time::interval(SWEEP_PERIOD);
    loop {
        ticker.tick().await;
        publish_if_changed(&hub).await;
    }
}

/// Recomputes the online list and publishes it when it differs from the stored
/// snapshot. `SET ... GET` swaps the snapshot atomically, so concurrent callers
/// cannot both see the same change as new.
async fn publish_if_changed(hub: &Hub) {
    let mut broker = hub.redis();
    let names = match online(&mut broker).await {
        Ok(names) => names,
        Err(err) => {
            tracing::error!(error = %err, "presence read failed");
            return;
        }
    };
    let snapshot = json!(names).to_string();
    let previous: Option<String> = match redis::cmd("SET")
        .arg(SNAPSHOT_KEY)
        .arg(&snapshot)
        .arg("GET")
        .query_async(&mut broker)
        .await
    {
        Ok(previous) => previous,
        Err(err) => {
            tracing::error!(error = %err, "presence snapshot write failed");
            return;
        }
    };
    if previous.as_deref() == Some(snapshot.as_str()) {
        return;
    }
    let online: Vec<Value> = names.iter().map(|name| json!({ "user": name })).collect();
    hub.publish_all(json!({ "type": "presence", "online": online })).await;
}

/// Distinct usernames behind at least one live key, sorted.
async fn online(broker: &mut ConnectionManager) -> redis::RedisResult<Vec<String>> {
    let mut keys = Vec::new();
    {
        let mut iter = broker.scan_match::<_, String>(format!("{KEY_PREFIX}*")).await?;
        while let Some(key) = iter.next_item().await {
            keys.push(key?);
        }
    }
    if keys.is_empty() {
        return Ok(Vec::new());
    }
    // A key may expire between SCAN and MGET: those come back as None.
    let names: Vec<Option<String>> = broker.mget(&keys).await?;
    let mut names: Vec<String> = names.into_iter().flatten().collect();
    names.sort();
    names.dedup();
    Ok(names)
}
