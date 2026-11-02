use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

/// Typed API error, rendered as `{"code":"...","detail":"..."}` with codes in
/// snake_case aligned with the message contract (cahier des charges §5).
///
/// Variants are constructed progressively by the feature waves (auth, lutins,
/// auctions); `expect` will flag itself for removal once all are live.
#[derive(Debug, thiserror::Error)]
#[expect(dead_code)]
pub enum AppError {
    #[error("authentication required")]
    Unauthorized,
    #[error("insufficient permissions")]
    Forbidden,
    #[error("resource not found")]
    NotFound,
    #[error("{0}")]
    Validation(String),
    #[error("{0}")]
    Conflict(String),
    #[error("too many requests")]
    RateLimited,
    #[error("internal error")]
    Internal,
}

impl AppError {
    /// HTTP status and contract code for each variant.
    fn parts(&self) -> (StatusCode, &'static str) {
        match self {
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized"),
            AppError::Forbidden => (StatusCode::FORBIDDEN, "forbidden"),
            AppError::NotFound => (StatusCode::NOT_FOUND, "not_found"),
            AppError::Validation(_) => (StatusCode::BAD_REQUEST, "validation"),
            AppError::Conflict(_) => (StatusCode::CONFLICT, "conflict"),
            AppError::RateLimited => (StatusCode::TOO_MANY_REQUESTS, "rate_limited"),
            AppError::Internal => (StatusCode::INTERNAL_SERVER_ERROR, "internal"),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code) = self.parts();
        let detail = self.to_string();
        if status == StatusCode::INTERNAL_SERVER_ERROR {
            tracing::error!(code, %detail, "request failed");
        }
        (status, Json(json!({ "code": code, "detail": detail }))).into_response()
    }
}

/// Lets handlers use `?` on sqlx calls; internal details are logged, never sent.
impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        match err {
            sqlx::Error::RowNotFound => AppError::NotFound,
            other => {
                tracing::error!(error = %other, "database error");
                AppError::Internal
            }
        }
    }
}
