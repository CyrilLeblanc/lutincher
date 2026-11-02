//! Player standings and game state (cahier §3.4): live leaderboard, won
//! lutins (ownership = sales won) and the single-row `game_state` flag.

use serde_json::{json, Value};
use sqlx::PgPool;
use std::collections::BTreeMap;
use uuid::Uuid;

use crate::error::AppError;

use super::logic;
use super::view::CollectionItem;

/// One leaderboard row: collection value first, then remaining points, then
/// lutin count as tie-breakers (cahier §3.4).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LeaderRow {
    pub username: String,
    pub value: i64,
    pub lutins: i64,
    pub points_total: i64,
}

impl LeaderRow {
    /// Contract `LeaderboardRow` (tie-break fields stay server-side).
    pub fn to_view(&self) -> Value {
        json!({ "user": self.username, "value": self.value, "lutins": self.lutins })
    }
}

/// Leaderboard aggregated in Rust so the rarity→value mapping lives once
/// ([`logic::rarity_value`]) instead of being duplicated in SQL.
pub async fn leaderboard(pool: &PgPool) -> Result<Vec<LeaderRow>, AppError> {
    #[derive(Debug, sqlx::FromRow)]
    struct WonLutin {
        username: String,
        points_total: i32,
        rarity: String,
    }
    let rows = sqlx::query_as::<_, WonLutin>(
        "SELECT u.username, u.points_total, l.rarity \
         FROM auctions a JOIN users u ON u.id = a.winner_id JOIN lutins l ON l.id = a.lutin_id \
         WHERE a.status = 'ended' AND a.winner_id IS NOT NULL ORDER BY u.username",
    )
    .fetch_all(pool)
    .await?;

    let mut by_user: BTreeMap<String, LeaderRow> = BTreeMap::new();
    for row in rows {
        let entry = by_user.entry(row.username.clone()).or_insert(LeaderRow {
            username: row.username.clone(),
            value: 0,
            lutins: 0,
            points_total: row.points_total as i64,
        });
        entry.value += logic::rarity_value(&row.rarity);
        entry.lutins += 1;
        entry.points_total = row.points_total as i64;
    }
    let mut board: Vec<LeaderRow> = by_user.into_values().collect();
    board.sort_by(|a, b| {
        b.value
            .cmp(&a.value)
            .then(b.points_total.cmp(&a.points_total))
            .then(b.lutins.cmp(&a.lutins))
            .then(a.username.cmp(&b.username))
    });
    Ok(board)
}

/// Lutins won by a user, oldest win first.
pub async fn collection(pool: &PgPool, user: Uuid) -> Result<Vec<CollectionItem>, AppError> {
    Ok(sqlx::query_as::<_, CollectionItem>(
        "SELECT l.id, l.seed, l.name, l.rarity \
         FROM auctions a JOIN lutins l ON l.id = a.lutin_id \
         WHERE a.winner_id = $1 AND a.status = 'ended' ORDER BY a.ends_at NULLS LAST, a.id",
    )
    .bind(user)
    .fetch_all(pool)
    .await?)
}

/// True once the game is closed (row seeded by migration 0002).
pub async fn game_closed(pool: &PgPool) -> Result<bool, AppError> {
    let closed = sqlx::query_scalar::<_, bool>("SELECT closed FROM game_state WHERE id = 1")
        .fetch_optional(pool)
        .await?;
    Ok(closed.unwrap_or(false))
}

/// Flags the game as closed; idempotent.
pub async fn close_game(pool: &PgPool) -> Result<(), AppError> {
    sqlx::query("UPDATE game_state SET closed = TRUE, closed_at = now() WHERE id = 1")
        .execute(pool)
        .await?;
    Ok(())
}
