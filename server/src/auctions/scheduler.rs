//! Background lifecycle of the sales: a periodic scan (~1 s) opens due
//! auctions and closes expired ones (cahier §3.3), plus the admin-triggered
//! game close (§3.4). Deadlines live in the database — nothing time-critical
//! is held in memory, so the scan period is coarse on purpose.

use chrono::Utc;
use serde_json::{json, Value};
use sqlx::PgPool;
use std::time::Duration;

use crate::error::AppError;
use crate::ws::Hub;

use super::{standings, store};

/// Scan period; also bounds the delay between a deadline and its closure.
const SCAN_PERIOD: Duration = Duration::from_secs(1);

/// Runs the scan loop until the process exits.
pub async fn run(pool: PgPool, hub: Hub) {
    let mut ticker = tokio::time::interval(SCAN_PERIOD);
    // The first tick fires immediately: sales due at startup open at once.
    loop {
        ticker.tick().await;
        if let Err(err) = tick(&pool, &hub).await {
            tracing::error!(error = %err, "auction scan failed");
        }
    }
}

/// One scan pass: open, then close (a sale opened now can only be due after
/// `duration_s`, so the two passes never race on the same row).
async fn tick(pool: &PgPool, hub: &Hub) -> Result<(), AppError> {
    let now = Utc::now();
    for auction in store::open_due(pool).await? {
        hub.publish_all(auction.started_event(now)).await;
    }
    for closed in store::close_due(pool).await? {
        if let (Some(winner), Some(price)) = (closed.winner_id, closed.final_price) {
            store::debit_winner(pool, winner, price as i64).await?;
        }
        hub.publish_all(json!({
            "type": "auction_ended",
            "auction_id": closed.id,
            "winner": closed.winner,
            "amount": closed.final_price,
        }))
        .await;
        // Every settled sale changes the standings: push the live board.
        let board = standings::leaderboard(pool).await?;
        hub.publish_all(json!({
            "type": "leaderboard",
            "rows": board.iter().map(|row| row.to_view()).collect::<Vec<_>>(),
        }))
        .await;
    }
    Ok(())
}

/// Closes the game (admin): flags it, broadcasts the frozen podium. Sales in
/// flight end normally — the scanner just opens nothing new afterwards.
pub async fn close_game(pool: &PgPool, hub: &Hub) -> Result<Vec<Value>, AppError> {
    standings::close_game(pool).await?;
    let podium = podium(pool).await?;
    hub.publish_all(json!({ "type": "game_closed", "podium": &podium })).await;
    Ok(podium)
}

/// Top 3 of the final standings (cahier §3.4: value, then points, then count).
pub async fn podium(pool: &PgPool) -> Result<Vec<Value>, AppError> {
    Ok(standings::leaderboard(pool).await?.iter().take(3).map(|row| row.to_view()).collect())
}
