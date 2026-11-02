//! Admin endpoints: schedule an auction (A2) and close the game (A4), plus
//! `GET /api/game` — page-load game state (after a reload the front no longer
//! holds the `game_closed` event in memory).

use axum::extract::rejection::JsonRejection;
use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::auctions::{scheduler, standings, store};
use crate::auth::extractors::AdminUser;
use crate::error::AppError;
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/admin/auctions", post(create_auction))
        .route("/api/admin/game/close", post(close_game))
        .route("/api/game", get(game_state))
}

/// Body of `POST /api/admin/auctions` (PLAN complements). `starts_at` absent
/// means "as soon as possible" (the scanner opens it on its next pass).
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct CreateAuctionBody {
    lutin_id: Uuid,
    start_price: i64,
    increment: i64,
    duration_s: i64,
    starts_at: Option<DateTime<Utc>>,
}

async fn create_auction(
    State(state): State<AppState>,
    _admin: AdminUser,
    body: Result<Json<CreateAuctionBody>, JsonRejection>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    let Json(body) = body.map_err(|rejection| AppError::Validation(rejection.body_text()))?;
    validate(&body)?;
    if standings::game_closed(state.pool()).await? {
        return Err(AppError::GameClosed);
    }
    let scheduled_at = body.starts_at.unwrap_or_else(Utc::now);
    let id = store::create_auction(
        state.pool(),
        body.lutin_id,
        body.start_price,
        body.increment,
        body.duration_s,
        scheduled_at,
    )
    .await?;
    // Just inserted: the row is there; Internal covers the impossible case.
    let row = store::view(state.pool(), id).await?.ok_or(AppError::Internal)?;
    Ok((StatusCode::CREATED, Json(row.to_view(Utc::now()))))
}

async fn close_game(State(state): State<AppState>, _admin: AdminUser) -> Result<Json<Value>, AppError> {
    let podium = scheduler::close_game(state.pool(), state.hub()).await?;
    Ok(Json(json!({ "podium": podium })))
}

/// Game state for a page load: the podium exists only once the game is closed
/// (frozen standings, cahier §3.4).
async fn game_state(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let closed = standings::game_closed(state.pool()).await?;
    let podium = if closed {
        json!(scheduler::podium(state.pool()).await?)
    } else {
        Value::Null
    };
    Ok(Json(json!({ "closed": closed, "podium": podium })))
}

/// Bounds keeping every later integer math sane (pure rules assume ≥ 1).
fn validate(body: &CreateAuctionBody) -> Result<(), AppError> {
    if body.start_price < 1 {
        return Err(AppError::Validation("start_price must be >= 1".to_owned()));
    }
    if body.increment < 1 {
        return Err(AppError::Validation("increment must be >= 1".to_owned()));
    }
    if !(1..=86_400).contains(&body.duration_s) {
        return Err(AppError::Validation("duration_s must be in 1..=86400".to_owned()));
    }
    Ok(())
}
