//! Append-only event journal: the source of every `seq` and of the resync
//! replay (contract §5). One row per broadcast frame, inserted BEFORE the
//! broadcast by the single publisher task.

use serde_json::Value;
use sqlx::PgPool;

/// Appends one event and returns its global sequence number. The payload is
/// stored without `seq`; the publisher stamps it once INSERT returns.
pub async fn append(pool: &PgPool, event_type: &str, payload: &Value) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar::<_, i64>(
        "INSERT INTO events (type, payload) VALUES ($1, $2) RETURNING seq",
    )
    .bind(event_type)
    .bind(payload)
    .fetch_one(pool)
    .await
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
