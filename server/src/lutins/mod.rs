//! Lutin generation: asset catalog (`manifest`) + deterministic build engine
//! (`engine`). Consumed by `routes/lutins.rs` and, for rarity values, by the
//! auctions/leaderboard wave.

pub mod engine;
pub mod manifest;
pub mod seed;

// Re-exported for the auctions/leaderboard wave (G); remove once consumed.
#[expect(unused_imports)]
pub use manifest::{Rarity, RARITY_VALUE};
