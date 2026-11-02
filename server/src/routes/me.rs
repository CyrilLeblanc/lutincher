//! `GET /api/me` — profile, balance and implicit-escrow reservations.
//!
//! Available points = `points_total − Σ(auctions.current_amount)` over the
//! open auctions where the caller is the current bidder (PLAN, "escrow
//! implicite"). Identity comes from the verified token; balances from the DB.

use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use serde_json::{json, Value};

use crate::auth::AuthUser;
use crate::error::AppError;
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new().route("/api/me", get(me))
}

#[derive(Debug, sqlx::FromRow)]
struct BalanceRow {
    points_total: i32,
    reserved_total: i32,
    reserved: Value,
}

async fn me(State(state): State<AppState>, user: AuthUser) -> Result<Json<Value>, AppError> {
    let row = sqlx::query_as::<_, BalanceRow>(
        "SELECT u.points_total, \
                COALESCE((SELECT SUM(a.current_amount) FROM auctions a \
                           WHERE a.current_bidder = u.id AND a.status = 'open'), 0)::int \
                  AS reserved_total, \
                COALESCE((SELECT json_agg(json_build_object('auction_id', a.id, \
                                                            'amount', a.current_amount) \
                                          ORDER BY a.id) \
                            FROM auctions a \
                           WHERE a.current_bidder = u.id AND a.status = 'open'), \
                         '[]'::json) AS reserved \
         FROM users u WHERE u.id = $1",
    )
    .bind(user.id)
    .fetch_one(state.pool())
    .await?;
    Ok(Json(json!({
        "id": user.id,
        "username": user.username,
        "role": user.role,
        "points_total": row.points_total,
        "points_available": row.points_total - row.reserved_total,
        "reserved": row.reserved,
    })))
}
