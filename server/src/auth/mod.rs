//! Authentication: password hashing (Argon2id), JWT (HS256) minting and
//! verification, axum extractors and the startup admin seed.

pub mod extractors;
pub(crate) mod password;
pub mod seed;
pub(crate) mod token;

pub use extractors::AuthUser;
// AdminUser is consumed from wave E onwards: `use crate::auth::extractors::AdminUser;`.
