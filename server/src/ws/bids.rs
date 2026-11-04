//! Bid pipeline behind the `bid` message: rate limit → game-closed guard →
//! pure rule check (`auctions::logic::check_bid`) → order-guarded SQL apply
//! → journal + broadcast (`bid` to everyone, `outbid` to the outbid user).

use chrono::Utc;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::auctions::logic::{self, BidOutcome, BidRejection};
use crate::auctions::{standings, store};
use crate::auth::token::Claims;
use crate::metrics;
use crate::state::AppState;
use crate::ws::{self, error_code, limits, Audience, Hub};

/// Body of a `bid` message, decoded strictly (unknown fields rejected).
#[derive(Debug, serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct BidMsg {
    auction_id: Uuid,
    amount: i64,
}

pub async fn handle(state: &AppState, hub: &Hub, claims: &Claims, value: &Value) {
    let Some(msg) = ws::parse_message::<BidMsg>(value) else {
        ws::send_error(hub, claims.sub, error_code::MALFORMED_MESSAGE,
            "malformed bid message").await;
        return;
    };
    let mut broker = hub.redis();
    match limits::bid_allowed(&mut broker, claims.sub).await {
        Ok(true) => {}
        Ok(false) => {
            ws::send_error(hub, claims.sub, error_code::RATE_LIMITED,
                "more than 5 bids per 10 s").await;
            return;
        }
        Err(err) => {
            tracing::error!(error = %err, "bid rate limit check failed");
            return;
        }
    }
    let pool = state.pool();
    // Game closed: no new bid; sales in flight end on their own (cahier §3.4).
    match standings::game_closed(pool).await {
        Ok(false) => {}
        Ok(true) => {
            ws::send_error(hub, claims.sub, error_code::FORBIDDEN, "game is closed").await;
            return;
        }
        Err(err) => {
            tracing::error!(error = %err, "game state read failed");
            return;
        }
    }
    let row = match store::bid_row(pool, msg.auction_id).await {
        Ok(Some(row)) => row,
        Ok(None) => {
            ws::send_error(hub, claims.sub, error_code::AUCTION_NOT_OPEN,
                "unknown auction").await;
            return;
        }
        Err(err) => {
            tracing::error!(error = %err, "auction read failed");
            return;
        }
    };
    // No deadline means never opened: not open, from the client's viewpoint.
    let Some(ctx) = row.to_context() else {
        ws::send_error(hub, claims.sub, error_code::AUCTION_NOT_OPEN,
            "auction is not open").await;
        return;
    };
    let available = match store::points_available(pool, claims.sub, msg.auction_id).await {
        Ok(Some(available)) => available,
        Ok(None) => {
            tracing::error!("bidder row missing while placing a bid");
            return;
        }
        Err(err) => {
            tracing::error!(error = %err, "funds read failed");
            return;
        }
    };
    match logic::check_bid(&ctx, Utc::now(), msg.amount, available) {
        Err(rejection) => {
            let (code, detail) = describe(&rejection);
            ws::send_error(hub, claims.sub, code, &detail).await;
        }
        Ok(outcome) => apply(state, hub, claims, &msg, outcome).await,
    }
}

/// Applies the validated bid. The SQL order-guard makes this idempotent: a
/// replayed or concurrent bid either raises the amount or changes nothing.
async fn apply(state: &AppState, hub: &Hub, claims: &Claims, msg: &BidMsg, outcome: BidOutcome) {
    let pool = state.pool();
    match store::apply_bid(pool, msg.auction_id, claims.sub, msg.amount, outcome.new_ends_at).await
    {
        Err(err) => tracing::error!(error = %err, "bid apply failed"),
        Ok(None) => {
            // Order guard rejected the write: someone bid first or the sale
            // just closed. Re-read to tell the client which failure it was.
            let status = store::bid_row(pool, msg.auction_id)
                .await
                .ok()
                .flatten()
                .map(|row| row.status);
            let (code, detail) = if status.as_deref() == Some("open") {
                (error_code::BID_TOO_LOW, "outbid in the meantime, bid higher".to_owned())
            } else {
                (error_code::AUCTION_NOT_OPEN, "auction is not open".to_owned())
            };
            ws::send_error(hub, claims.sub, code, &detail).await;
        }
        Ok(Some(applied)) => {
            metrics::BIDS_ACCEPTED.inc();
            if let Err(err) = store::record_bid(pool, msg.auction_id, claims.sub, msg.amount).await
            {
                tracing::error!(error = %err, "bid history insert failed");
            }
            // `ends_in_s` recomputed from the possibly extended deadline: the
            // server clock stays the single source of truth (cahier §3.3).
            hub.publish_all(json!({
                "type": "bid",
                "auction_id": msg.auction_id,
                "amount": msg.amount,
                "bidder": claims.username,
                "ends_in_s": logic::ends_in_s(outcome.new_ends_at, Utc::now()),
            }))
            .await;
            if let Some(prev) = applied.prev_bidder {
                if prev != claims.sub {
                    hub.publish(
                        Audience::User(prev),
                        json!({
                            "type": "outbid",
                            "auction_id": msg.auction_id,
                            "by": claims.username,
                            "amount": msg.amount,
                        }),
                    )
                    .await;
                }
            }
        }
    }
}

/// Maps a pure-rule rejection to a contract error code + detail.
fn describe(rejection: &BidRejection) -> (&'static str, String) {
    match rejection {
        BidRejection::AuctionNotOpen => {
            (error_code::AUCTION_NOT_OPEN, "auction is not open".to_owned())
        }
        BidRejection::BidTooLow { minimum } => {
            (error_code::BID_TOO_LOW, format!("bid below the minimum of {minimum}"))
        }
        BidRejection::InsufficientFunds { available, needed } => (
            error_code::INSUFFICIENT_FUNDS,
            format!("{needed} needed, only {available} available"),
        ),
    }
}
