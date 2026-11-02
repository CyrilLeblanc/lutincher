//! Player standings: `GET /api/leaderboard` (live board, cahier §3.4) and
//! `GET /api/me/collection` (lutins won by the caller).

use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use serde_json::{json, Value};

use crate::auctions::standings;
use crate::auth::AuthUser;
use crate::error::AppError;
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/leaderboard", get(leaderboard))
        .route("/api/me/collection", get(collection))
}

async fn leaderboard(State(state): State<AppState>, _user: AuthUser) -> Result<Json<Value>, AppError> {
    let rows = standings::leaderboard(state.pool())
        .await?
        .iter()
        .map(|row| row.to_view())
        .collect::<Vec<_>>();
    Ok(Json(json!({ "rows": rows })))
}

async fn collection(State(state): State<AppState>, user: AuthUser) -> Result<Json<Value>, AppError> {
    let lutins = standings::collection(state.pool(), user.id)
        .await?
        .iter()
        .map(|item| item.to_view())
        .collect::<Vec<_>>();
    Ok(Json(json!({ "lutins": lutins })))
}
