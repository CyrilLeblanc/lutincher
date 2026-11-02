//! `GET /api/auctions` and `GET /api/auctions/{id}`: REST snapshots of the
//! visible sales (`scheduled` + `open`). The WebSocket only carries deltas
//! from there on (cahier §5).

use axum::extract::{Path, State};
use axum::routing::get;
use axum::{Json, Router};
use chrono::Utc;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::auctions::store;
use crate::auth::AuthUser;
use crate::error::AppError;
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/auctions", get(list))
        .route("/api/auctions/{id}", get(show))
}

async fn list(State(state): State<AppState>, _user: AuthUser) -> Result<Json<Value>, AppError> {
    let now = Utc::now();
    let auctions = store::list_active(state.pool())
        .await?
        .iter()
        .map(|row| row.to_view(now))
        .collect::<Vec<_>>();
    Ok(Json(json!({ "auctions": auctions })))
}

async fn show(
    State(state): State<AppState>,
    _user: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    let row = store::view(state.pool(), id).await?.ok_or(AppError::NotFound)?;
    Ok(Json(row.to_view(Utc::now())))
}
