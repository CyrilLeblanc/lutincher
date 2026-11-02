pub mod health;

use axum::Router;

use crate::error::AppError;
use crate::state::AppState;

/// Top-level REST router. Feature waves merge their modules here,
/// e.g. `.merge(auth::routes())`.
pub fn routes() -> Router<AppState> {
    Router::new()
        .merge(health::routes())
        .fallback(not_found)
}

/// JSON 404 for unmatched routes (axum's default is plain text).
async fn not_found() -> AppError {
    AppError::NotFound
}
