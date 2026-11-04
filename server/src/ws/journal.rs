//! Append-only event journal: the source of every `seq` and of the resync
//! replay (contract §5). An event is journalled and published in ONE
//! transaction by [`append_and_publish`].

use redis::aio::ConnectionManager;
use serde_json::{json, Value};
use sqlx::PgPool;

use super::{broker, Audience};

/// Advisory lock serializing journal inserts across api instances
/// (the bytes spell "Lutin").
const JOURNAL_LOCK: i64 = 0x004C_7574_696E;

/// Failure of [`append_and_publish`]; the transaction is rolled back.
#[derive(Debug, thiserror::Error)]
pub enum PublishError {
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("broker error: {0}")]
    Broker(#[from] redis::RedisError),
}

/// Journals one event, stamps its `seq` and publishes it to every instance.
///
/// The advisory lock is held until COMMIT, so two instances never interleave:
/// the publish order equals the `seq` order. A failure before COMMIT rolls
/// the insert back and the event is dropped (logged by the caller).
pub async fn append_and_publish(
    pool: &PgPool,
    broker_conn: &mut ConnectionManager,
    audience: &Audience,
    event_type: &str,
    event: &Value,
) -> Result<i64, PublishError> {
    let mut tx = pool.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock($1)")
        .bind(JOURNAL_LOCK)
        .execute(&mut *tx)
        .await?;
    // The stored payload carries no seq: sync re-stamps it from the row.
    let seq = sqlx::query_scalar::<_, i64>(
        "INSERT INTO events (type, payload) VALUES ($1, $2) RETURNING seq",
    )
    .bind(event_type)
    .bind(event)
    .fetch_one(&mut *tx)
    .await?;
    let user = match audience {
        Audience::All => None,
        Audience::User(user) => Some(*user),
    };
    broker::publish(broker_conn, user, &stamped(event, seq)).await?;
    tx.commit().await?;
    Ok(seq)
}

/// Copy of `event` carrying its journal `seq`.
fn stamped(event: &Value, seq: i64) -> Value {
    let mut event = event.clone();
    event["seq"] = json!(seq);
    event
}

/// Events strictly after `last_seq`, journal order, newest last.
///
/// `error` rows are excluded on purpose: they are targeted replies (a
/// player's rejected bid), so replaying them after a resync would leak one
/// user's failures to everyone.
pub async fn events_after(
    pool: &PgPool,
    last_seq: i64,
    limit: i64,
) -> Result<Vec<(i64, Value)>, sqlx::Error> {
    #[derive(Debug, sqlx::FromRow)]
    struct Row {
        seq: i64,
        payload: Value,
    }
    let rows = sqlx::query_as::<_, Row>(
        "SELECT seq, payload FROM events WHERE seq > $1 AND type <> 'error' \
         ORDER BY seq LIMIT $2",
    )
    .bind(last_seq)
    .bind(limit)
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(|row| (row.seq, row.payload)).collect())
}
