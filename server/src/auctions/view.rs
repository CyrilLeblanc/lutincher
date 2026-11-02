//! Auction projection shared by REST snapshots and `auction_started` events:
//! one DB row shape (joined with its lutin and current bidder) rendered as
//! the `AuctionView` of the wire contract (web/src/socket/contract.ts).

use chrono::{DateTime, Utc};
use serde_json::{json, Value};
use uuid::Uuid;

use super::logic;

/// Auction row joined with its lutin; `FromRow` target of every view query.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct AuctionRow {
    pub id: Uuid,
    pub start_price: i32,
    pub increment: i32,
    pub duration_s: i32,
    pub status: String,
    pub current_amount: Option<i32>,
    pub ends_at: Option<DateTime<Utc>>,
    pub current_bidder: Option<String>,
    pub lutin_id: Uuid,
    pub lutin_seed: i64,
    pub lutin_name: String,
    pub lutin_rarity: String,
    pub lutin_manifest: Value,
}

impl AuctionRow {
    /// Contract `AuctionView`. `ends_in_s` is null while the sale is only
    /// scheduled; otherwise it is derived from the server clock (source of
    /// truth, cahier §3.3).
    pub fn to_view(&self, now: DateTime<Utc>) -> Value {
        json!({
            "id": self.id,
            "lutin": {
                "id": self.lutin_id,
                "seed": self.lutin_seed,
                "name": self.lutin_name,
                "rarity": self.lutin_rarity,
                // Kept so the front could rebuild the portrait without a fetch.
                "manifest": self.lutin_manifest,
            },
            "start_price": self.start_price,
            "increment": self.increment,
            "duration_s": self.duration_s,
            "status": self.status,
            "ends_in_s": self.ends_at.map(|ends| logic::ends_in_s(ends, now)),
            "current_amount": self.current_amount,
            "current_bidder": self.current_bidder,
        })
    }

    /// Payload (without `seq`, stamped by the journal) of `auction_started`.
    pub fn started_event(&self, now: DateTime<Utc>) -> Value {
        json!({ "type": "auction_started", "auction": self.to_view(now) })
    }
}

/// One `GET /api/me/collection` entry: a won lutin; its collection value is
/// derived from the rarity in Rust (single mapping, see [`logic::rarity_value`]).
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct CollectionItem {
    pub id: Uuid,
    pub seed: i64,
    pub name: String,
    pub rarity: String,
}

impl CollectionItem {
    pub fn to_view(&self) -> Value {
        json!({
            "id": self.id,
            "seed": self.seed,
            "name": self.name,
            "rarity": self.rarity,
            "value": logic::rarity_value(&self.rarity),
        })
    }
}
