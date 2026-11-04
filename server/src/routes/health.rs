use axum::extract::State;
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use prometheus::{Encoder, TextEncoder};
use serde_json::{json, Value};

use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/healthz", get(healthz))
        .route("/metrics", get(metrics))
}

/// Liveness plus the answering instance, so a load-balanced request shows
/// which api served it.
async fn healthz(State(state): State<AppState>) -> Json<Value> {
    Json(json!({ "status": "ok", "instance": state.hub().instance() }))
}

/// Prometheus text exposition of this instance's series (not proxied by nginx).
async fn metrics() -> Response {
    let encoder = TextEncoder::new();
    let mut body = Vec::new();
    match encoder.encode(&prometheus::gather(), &mut body) {
        Ok(()) => ([(header::CONTENT_TYPE, encoder.format_type().to_owned())], body).into_response(),
        Err(err) => {
            tracing::error!(error = %err, "metrics encoding failed");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}
