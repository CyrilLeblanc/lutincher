//! JWT (HS256) minting and verification. Claims shape, reused by the REST
//! extractors and the WebSocket handshake (`/ws?token=<jwt>`):
//!
//! ```json
//! { "sub": "<user uuid>", "username": "alice", "role": "player",
//!   "iat": 1730000000, "exp": 1730086400 }
//! ```

use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// `iss` claim identifying tokens minted by this API.
pub const ISSUER: &str = "lutincher";
/// Token lifetime: 24 hours.
const TTL_SECONDS: i64 = 24 * 60 * 60;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    /// User id (UUID).
    pub sub: Uuid,
    pub username: String,
    /// `player` or `admin` (constrained by the users table).
    pub role: String,
    /// Issued-at (unix seconds).
    pub iat: i64,
    /// Expiry (unix seconds).
    pub exp: i64,
}

/// Signs a fresh 24 h token for the given user.
pub fn mint(
    secret: &str,
    user_id: Uuid,
    username: &str,
    role: &str,
) -> Result<String, jsonwebtoken::errors::Error> {
    let now = chrono::Utc::now().timestamp();
    let claims = Claims {
        sub: user_id,
        username: username.to_owned(),
        role: role.to_owned(),
        iat: now,
        exp: now + TTL_SECONDS,
    };
    jsonwebtoken::encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
}

/// Verifies signature, expiry and issuer; returns the claims.
pub fn verify(secret: &str, token: &str) -> Result<Claims, jsonwebtoken::errors::Error> {
    let mut validation = Validation::new(Algorithm::HS256);
    validation.set_issuer(&[ISSUER]);
    validation.validate_aud = false;
    jsonwebtoken::decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )
    .map(|data| data.claims)
}
