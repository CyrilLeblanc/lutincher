//! `GET /ws?token=<jwt>` — handshake: origin whitelist against the config,
//! then JWT verification (both refuse the upgrade with a plain HTTP status).

use axum::extract::ws::WebSocketUpgrade;
use axum::extract::{Query, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use std::collections::HashMap;

use crate::auth::token;
use crate::state::AppState;

use super::handler;

pub fn routes() -> Router<AppState> {
    Router::new().route("/ws", get(upgrade))
}

async fn upgrade(
    State(state): State<AppState>,
    Query(params): Query<HashMap<String, String>>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Response {
    // Browsers always send Origin on a WS handshake; a present but unknown
    // origin is refused before the upgrade. Non-browser clients (no Origin)
    // pass — they are not the cross-site threat this guards against.
    if let Some(origin) = headers.get(header::ORIGIN).and_then(|value| value.to_str().ok()) {
        if !state.allowed_origins().iter().any(|allowed| allowed == origin) {
            return StatusCode::FORBIDDEN.into_response();
        }
    }
    let Some(token_value) = params.get("token") else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    let claims = match token::verify(state.jwt_secret(), token_value) {
        Ok(claims) => claims,
        Err(_) => return StatusCode::UNAUTHORIZED.into_response(),
    };
    ws.on_upgrade(move |socket| handler::serve(socket, state, claims))
}
