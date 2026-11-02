//! Pure auction rules (cahier des charges §3.3): bid validation, implicit
//! escrow check, anti-sniping extension and countdown derivation.
//!
//! No I/O here: `now` is always an injected parameter so every rule is
//! unit-testable without a database, a clock or a runtime.

use chrono::{DateTime, Duration, Utc};

use crate::lutins::Rarity;

/// Collection value of each rarity tier (cahier §3.2). Single source of
/// truth: the lutins wave's tier table (`lutins::RARITY_VALUE`).
pub fn rarity_value(rarity: &str) -> i64 {
    match rarity {
        "rare" => Rarity::Rare.value(),
        "epique" => Rarity::Epique.value(),
        "legendaire" => Rarity::Legendaire.value(),
        // Constrained by the lutins CHECK; unknown ranks as the lowest tier.
        _ => Rarity::Commun.value(),
    }
}

/// Anti-sniping: a bid inside the last `ANTI_SNIPE_WINDOW_S` seconds pushes
/// the deadline back by `ANTI_SNIPE_EXTENSION_S`, with no ceiling (assumed).
pub const ANTI_SNIPE_WINDOW_S: i64 = 10;
pub const ANTI_SNIPE_EXTENSION_S: i64 = 10;

/// Immutable snapshot of an auction, enough to validate one bid.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BidContext {
    pub status: String,
    pub start_price: i64,
    pub increment: i64,
    /// Highest bid so far; `None` before the first bid.
    pub current_amount: Option<i64>,
    pub ends_at: DateTime<Utc>,
}

/// Why a bid was refused; callers map each case to a contract error code.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BidRejection {
    /// Auction not open, or deadline already reached.
    AuctionNotOpen,
    /// Bid below the minimum acceptable amount (carries the minimum).
    BidTooLow { minimum: i64 },
    /// Implicit escrow: spendable points below the amount.
    InsufficientFunds { available: i64, needed: i64 },
}

/// Accepted bid: new amount and the (possibly extended) deadline.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BidOutcome {
    pub amount: i64,
    pub new_ends_at: DateTime<Utc>,
    /// True when the anti-sniping rule moved the deadline.
    pub extended: bool,
}

/// Minimum acceptable amount: current + increment, or the start price for
/// the first bid (cahier §3.3).
pub fn minimum_bid(ctx: &BidContext) -> i64 {
    match ctx.current_amount {
        Some(current) => current + ctx.increment,
        None => ctx.start_price,
    }
}

/// Validates a bid against the rules, at instant `now`.
///
/// `available` is the spendable balance for THIS auction: the implicit-escrow
/// sum (PLAN) minus the reservation already held on this very auction, since
/// raising one's own bid replaces that reservation instead of adding to it.
pub fn check_bid(
    ctx: &BidContext,
    now: DateTime<Utc>,
    amount: i64,
    available: i64,
) -> Result<BidOutcome, BidRejection> {
    if ctx.status != "open" || now >= ctx.ends_at {
        return Err(BidRejection::AuctionNotOpen);
    }
    let minimum = minimum_bid(ctx);
    if amount < minimum {
        // Also covers non-positive amounts: start_price >= 1 is enforced at
        // creation, so the minimum is always >= 1.
        return Err(BidRejection::BidTooLow { minimum });
    }
    if amount > available {
        return Err(BidRejection::InsufficientFunds { available, needed: amount });
    }
    let (new_ends_at, extended) = anti_snipe(ctx.ends_at, now);
    Ok(BidOutcome { amount, new_ends_at, extended })
}

/// Anti-sniping extension: strictly inside the last window second → the
/// deadline becomes `now + extension`. Exactly at the boundary: no extension.
pub fn anti_snipe(ends_at: DateTime<Utc>, now: DateTime<Utc>) -> (DateTime<Utc>, bool) {
    let window = Duration::seconds(ANTI_SNIPE_WINDOW_S);
    if now > ends_at - window {
        (now + Duration::seconds(ANTI_SNIPE_EXTENSION_S), true)
    } else {
        (ends_at, false)
    }
}

/// Whole seconds left, rounded up; 0 once the deadline has passed.
/// Invariant: `ends_in_s == 0` ⟺ no bid can be accepted anymore.
pub fn ends_in_s(ends_at: DateTime<Utc>, now: DateTime<Utc>) -> i64 {
    let millis = (ends_at - now).num_milliseconds();
    if millis <= 0 {
        0
    } else {
        (millis + 999) / 1000
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    /// Fixed reference instant; offsets below are relative to it.
    fn at(offset_s: i64) -> DateTime<Utc> {
        Utc.timestamp_opt(1_700_000_000, 0).unwrap() + Duration::seconds(offset_s)
    }

    fn ctx(current_amount: Option<i64>) -> BidContext {
        BidContext {
            status: "open".to_owned(),
            start_price: 50,
            increment: 10,
            current_amount,
            ends_at: at(90),
        }
    }

    #[test]
    fn first_bid_must_reach_the_start_price() {
        let now = at(0);
        assert_eq!(check_bid(&ctx(None), now, 50, 1000), Ok(BidOutcome {
            amount: 50,
            new_ends_at: at(90),
            extended: false,
        }));
        assert_eq!(
            check_bid(&ctx(None), now, 49, 1000),
            Err(BidRejection::BidTooLow { minimum: 50 })
        );
    }

    #[test]
    fn later_bid_must_reach_current_plus_increment() {
        let now = at(0);
        // Exact step is accepted…
        assert!(check_bid(&ctx(Some(50)), now, 60, 1000).is_ok());
        // …one below is refused, with the expected minimum.
        assert_eq!(
            check_bid(&ctx(Some(50)), now, 59, 1000),
            Err(BidRejection::BidTooLow { minimum: 60 })
        );
        // A higher-than-step bid is allowed (ascending auction).
        assert!(check_bid(&ctx(Some(50)), now, 200, 1000).is_ok());
    }

    #[test]
    fn non_positive_amounts_are_rejected() {
        assert_eq!(
            check_bid(&ctx(None), at(0), 0, 1000),
            Err(BidRejection::BidTooLow { minimum: 50 })
        );
        assert_eq!(
            check_bid(&ctx(Some(50)), at(0), -10, 1000),
            Err(BidRejection::BidTooLow { minimum: 60 })
        );
    }

    #[test]
    fn funds_must_cover_the_amount() {
        assert_eq!(
            check_bid(&ctx(None), at(0), 50, 49),
            Err(BidRejection::InsufficientFunds { available: 49, needed: 50 })
        );
        assert!(check_bid(&ctx(None), at(0), 50, 50).is_ok());
    }

    #[test]
    fn closed_or_expired_auctions_refuse_bids() {
        let mut closed = ctx(None);
        closed.status = "scheduled".to_owned();
        assert_eq!(
            check_bid(&closed, at(0), 50, 1000),
            Err(BidRejection::AuctionNotOpen)
        );
        // At the exact deadline the sale no longer accepts bids.
        assert_eq!(
            check_bid(&ctx(None), at(90), 50, 1000),
            Err(BidRejection::AuctionNotOpen)
        );
        assert_eq!(
            check_bid(&ctx(None), at(120), 50, 1000),
            Err(BidRejection::AuctionNotOpen)
        );
    }

    #[test]
    fn anti_sniping_extends_only_inside_the_last_ten_seconds() {
        // Exactly at ends_at - 10s: outside the window, no extension.
        assert_eq!(anti_snipe(at(90), at(80)), (at(90), false));
        // Strictly inside: deadline becomes now + 10s…
        assert_eq!(anti_snipe(at(90), at(81)), (at(91), true));
        // …even past the original deadline (the auction is closed then, but
        // the rule itself stays total: extension, no ceiling).
        assert_eq!(anti_snipe(at(90), at(95)), (at(105), true));
        // Early bid: untouched.
        assert_eq!(anti_snipe(at(90), at(0)), (at(90), false));
    }

    #[test]
    fn bid_in_the_last_seconds_extends_the_outcome_deadline() {
        let outcome = check_bid(&ctx(Some(50)), at(85), 60, 1000).unwrap();
        assert!(outcome.extended);
        assert_eq!(outcome.new_ends_at, at(95));
    }

    #[test]
    fn countdown_rounds_up_and_clamps_at_zero() {
        let end = at(100);
        assert_eq!(ends_in_s(end, at(0)), 100);
        assert_eq!(ends_in_s(end, at(90)), 10);
        // Any positive remainder keeps the counter at 1.
        assert_eq!(ends_in_s(end, at(99) + Duration::milliseconds(999)), 1);
        assert_eq!(ends_in_s(end, at(100)), 0);
        assert_eq!(ends_in_s(end, at(130)), 0);
    }
}
