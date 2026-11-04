//! SQL access layer of the auction domain. Every write is order-guarded so a
//! replayed bid cannot double-apply (see [`apply_bid`]); the only funds write
//! of the whole system is the winner's debit in [`close_due`] (implicit escrow,
//! docs/PLAN.md).

use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::AppError;

use super::logic::BidContext;
use super::view::AuctionRow;

/// Auction view joined with its lutin and current bidder.
const AUCTION_VIEW_SELECT: &str = "SELECT a.id, a.start_price, a.increment, \
     a.duration_s, a.status, a.current_amount, a.ends_at, u.username AS current_bidder, \
     l.id AS lutin_id, l.seed AS lutin_seed, l.name AS lutin_name, \
     l.rarity AS lutin_rarity, l.manifest AS lutin_manifest \
     FROM auctions a JOIN lutins l ON l.id = a.lutin_id \
     LEFT JOIN users u ON u.id = a.current_bidder";

/// Creates a scheduled auction; validations (prices, game closed) are done by
/// the caller, existence/conflict checks here to stay close to the SQL truth.
pub async fn create_auction(
    pool: &PgPool,
    lutin_id: Uuid,
    start_price: i64,
    increment: i64,
    duration_s: i64,
    scheduled_at: DateTime<Utc>,
) -> Result<Uuid, AppError> {
    let lutin = sqlx::query_scalar::<_, Uuid>("SELECT id FROM lutins WHERE id = $1")
        .bind(lutin_id)
        .fetch_optional(pool)
        .await?;
    if lutin.is_none() {
        return Err(AppError::NotFound);
    }
    let active = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM auctions WHERE lutin_id = $1 AND status IN ('scheduled','open')",
    )
    .bind(lutin_id)
    .fetch_optional(pool)
    .await?;
    if active.is_some() {
        return Err(AppError::Conflict("lutin already in an active auction".to_owned()));
    }
    Ok(sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO auctions (lutin_id, start_price, increment, duration_s, scheduled_at) \
         VALUES ($1, $2, $3, $4, $5) RETURNING id",
    )
    .bind(lutin_id)
    .bind(start_price as i32)
    .bind(increment as i32)
    .bind(duration_s as i32)
    .bind(scheduled_at)
    .fetch_one(pool)
    .await?)
}

/// Full auction view (any status); `None` when the id is unknown.
pub async fn view(pool: &PgPool, id: Uuid) -> Result<Option<AuctionRow>, AppError> {
    let sql = format!("{AUCTION_VIEW_SELECT} WHERE a.id = $1");
    Ok(sqlx::query_as::<_, AuctionRow>(&sql)
        .bind(id)
        .fetch_optional(pool)
        .await?)
}

/// Sales visible to players: `scheduled` + `open`, soonest first.
pub async fn list_active(pool: &PgPool) -> Result<Vec<AuctionRow>, AppError> {
    let sql = format!(
        "{AUCTION_VIEW_SELECT} WHERE a.status IN ('scheduled','open') \
         ORDER BY (a.status = 'open') DESC, COALESCE(a.ends_at, a.scheduled_at), a.id"
    );
    Ok(sqlx::query_as::<_, AuctionRow>(&sql).fetch_all(pool).await?)
}

/// Row shape needed to validate one bid.
#[derive(Debug, sqlx::FromRow)]
pub struct BidRow {
    pub status: String,
    pub start_price: i32,
    pub increment: i32,
    pub current_amount: Option<i32>,
    pub ends_at: Option<DateTime<Utc>>,
}

impl BidRow {
    /// Pure-logic context; `None` when no deadline is set (not open yet).
    pub fn to_context(&self) -> Option<BidContext> {
        Some(BidContext {
            status: self.status.clone(),
            start_price: self.start_price as i64,
            increment: self.increment as i64,
            current_amount: self.current_amount.map(|amount| amount as i64),
            ends_at: self.ends_at?,
        })
    }
}

pub async fn bid_row(pool: &PgPool, id: Uuid) -> Result<Option<BidRow>, AppError> {
    Ok(sqlx::query_as::<_, BidRow>(
        "SELECT status, start_price, increment, current_amount, ends_at \
         FROM auctions WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?)
}

/// Spendable points for a bid on `for_auction`: total minus the escrow held on
/// the OTHER open auctions (a raise replaces the reservation on this one).
pub async fn points_available(
    pool: &PgPool,
    user: Uuid,
    for_auction: Uuid,
) -> Result<Option<i64>, AppError> {
    Ok(sqlx::query_scalar::<_, i64>(
        "SELECT u.points_total - COALESCE((SELECT SUM(a.current_amount) FROM auctions a \
             WHERE a.current_bidder = u.id AND a.status = 'open' AND a.id <> $2), 0) \
         FROM users u WHERE u.id = $1",
    )
    .bind(user)
    .bind(for_auction)
    .fetch_optional(pool)
    .await?)
}

/// Previous holder when the bid was applied; `None` when the order-guard
/// rejected it (outbid concurrently, closed, or game closed).
#[derive(Debug, sqlx::FromRow)]
pub struct AppliedBid {
    pub prev_bidder: Option<Uuid>,
}

pub async fn apply_bid(
    pool: &PgPool,
    auction_id: Uuid,
    user: Uuid,
    amount: i64,
    new_ends_at: DateTime<Utc>,
) -> Result<Option<AppliedBid>, AppError> {
    Ok(sqlx::query_as::<_, AppliedBid>(
        "WITH candidate AS ( \
           SELECT id, current_bidder FROM auctions \
            WHERE id = $1 AND status = 'open' \
              AND (current_amount IS NULL OR current_amount < $3) \
              AND NOT (SELECT closed FROM game_state WHERE id = 1) \
            FOR UPDATE) \
         UPDATE auctions a SET current_amount = $3, current_bidder = $2, ends_at = $4 \
          FROM candidate WHERE a.id = candidate.id \
         RETURNING candidate.current_bidder AS prev_bidder",
    )
    .bind(auction_id)
    .bind(user)
    .bind(amount as i32)
    .bind(new_ends_at)
    .fetch_optional(pool)
    .await?)
}

/// Append-only bid history (audit trail; the live amount lives on the auction).
pub async fn record_bid(
    pool: &PgPool,
    auction_id: Uuid,
    user: Uuid,
    amount: i64,
) -> Result<(), AppError> {
    sqlx::query("INSERT INTO bids (auction_id, user_id, amount) VALUES ($1, $2, $3)")
        .bind(auction_id)
        .bind(user)
        .bind(amount as i32)
        .execute(pool)
        .await?;
    Ok(())
}

/// A sale closed by the scanner, winner resolved (None when nobody bid).
#[derive(Debug, sqlx::FromRow)]
pub struct ClosedAuction {
    pub id: Uuid,
    pub final_price: Option<i32>,
    pub winner: Option<String>,
}

/// Opens every sale whose scheduled time has come (skipped once the game is
/// closed) and returns their views for `auction_started` events.
///
/// Two statements on purpose: with a data-modifying CTE the main query would
/// re-read `auctions` at its pre-statement snapshot (old status, null
/// `ends_at`) — re-selecting after the UPDATE returns the opened rows.
pub async fn open_due(pool: &PgPool) -> Result<Vec<AuctionRow>, AppError> {
    let ids = sqlx::query_scalar::<_, Uuid>(
        "UPDATE auctions \
            SET status = 'open', opened_at = now(), \
                ends_at = now() + (duration_s * interval '1 second') \
          WHERE status = 'scheduled' AND scheduled_at <= now() \
            AND NOT (SELECT closed FROM game_state WHERE id = 1) \
          RETURNING id",
    )
    .fetch_all(pool)
    .await?;
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let sql = format!("{AUCTION_VIEW_SELECT} WHERE a.id = ANY($1) ORDER BY a.id");
    Ok(sqlx::query_as::<_, AuctionRow>(&sql).bind(ids).fetch_all(pool).await?)
}

/// Closes every sale past its deadline, resolves its winner and debits the
/// winner — the ONLY funds write of the system (escrow is implicit during the
/// sale). One statement: a crash cannot close a sale without charging its
/// winner, nor charge a winner whose sale stayed open.
pub async fn close_due(pool: &PgPool) -> Result<Vec<ClosedAuction>, AppError> {
    Ok(sqlx::query_as::<_, ClosedAuction>(
        "WITH due AS (UPDATE auctions \
            SET status = 'ended', winner_id = current_bidder, final_price = current_amount \
          WHERE status = 'open' AND ends_at <= now() RETURNING id, winner_id, final_price), \
         debit AS (UPDATE users u SET points_total = u.points_total - d.final_price \
          FROM due d WHERE u.id = d.winner_id AND d.final_price IS NOT NULL RETURNING u.id) \
         SELECT d.id, d.final_price, u.username AS winner \
           FROM due d LEFT JOIN users u ON u.id = d.winner_id ORDER BY d.id",
    )
    .fetch_all(pool)
    .await?)
}
