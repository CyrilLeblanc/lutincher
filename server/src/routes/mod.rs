pub mod auth;
pub mod health;
pub mod me;

use axum::Router;

use crate::error::AppError;
use crate::state::AppState;

/// Top-level REST router. Feature waves merge their modules here,
/// e.g. `.merge(lutins::routes())`.
pub fn routes() -> Router<AppState> {
    Router::new()
        .merge(health::routes())
        .merge(auth::routes())
        .merge(me::routes())
        .fallback(not_found)
}

/// JSON 404 for unmatched routes (axum's default is plain text).
async fn not_found() -> AppError {
    AppError::NotFound
}
