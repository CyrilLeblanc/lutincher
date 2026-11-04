//! Append-only event journal: the source of every `seq` and of the resync
//! replay (contract §5). Events are journalled and published in batches: one
//! transaction per batch, see [`append_and_publish_batch`].

use redis::aio::ConnectionManager;
use serde_json::{json, Value};
use sqlx::PgPool;
use uuid::Uuid;

use super::{broker, Audience, Publish};

/// Advisory lock serializing journal inserts across api instances
/// (the bytes spell "Lutin").
const JOURNAL_LOCK: i64 = 0x004C_7574_696E;

/// Failure of [`append_and_publish_batch`]; the transaction is rolled back.
#[derive(Debug, thiserror::Error)]
pub enum PublishError {
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("broker error: {0}")]
    Broker(#[from] redis::RedisError),
}

/// Journals a batch of events, stamps their `seq` and publishes them to every
/// instance, in queue order.
///
/// The advisory lock is held until COMMIT, so two instances never interleave:
/// the publish order equals the `seq` order. A failure before COMMIT rolls the
/// whole batch back, and the batch is dropped (logged by the caller).
pub async fn append_and_publish_batch(
    pool: &PgPool,
    broker_conn: &mut ConnectionManager,
    batch: &[Publish],
) -> Result<(), PublishError> {
    let mut tx = pool.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock($1)")
        .bind(JOURNAL_LOCK)
        .execute(&mut *tx)
        .await?;
    // One INSERT for the whole batch. The seqs grow with the VALUES rows, so
    // sorting the returned seqs restores the batch order.
    let mut insert = sqlx::QueryBuilder::new("WITH inserted AS (INSERT INTO events (type, payload) ");
    insert.push_values(batch, |mut row, publish| {
        row.push_bind(event_type(&publish.event)).push_bind(&publish.event);
    });
    insert.push(" RETURNING seq) SELECT seq FROM inserted ORDER BY seq");
    let seqs = insert.build_query_scalar::<i64>().fetch_all(&mut *tx).await?;
    let frames: Vec<(Option<Uuid>, Value)> = batch
        .iter()
        .zip(seqs)
        .map(|(publish, seq)| (user_of(&publish.audience), stamped(&publish.event, seq)))
        .collect();
    broker::publish_batch(broker_conn, &frames).await?;
    tx.commit().await?;
    Ok(())
}

/// The `type` of an event, kept in its own column.
fn event_type(event: &Value) -> &str {
    event.get("type").and_then(Value::as_str).unwrap_or("unknown")
}

/// The user an audience targets; `None` reaches every connection.
fn user_of(audience: &Audience) -> Option<Uuid> {
    match audience {
        Audience::All => None,
        Audience::User(user) => Some(*user),
    }
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
