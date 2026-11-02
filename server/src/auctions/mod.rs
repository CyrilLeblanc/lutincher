//! Auction domain (cahier des charges §3.3–§3.4):
//! - `logic`: pure rules — bid validation, anti-sniping, countdown;
//! - `view`: row shapes rendered to the wire contract;
//! - `store`: SQL access (implicit escrow, order-guarded writes);
//! - `standings`: leaderboard, collections, game state;
//! - `scheduler`: background open/close scan and game close.

pub mod logic;
pub mod scheduler;
pub mod standings;
pub mod store;
pub mod view;
