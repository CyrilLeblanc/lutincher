//! `POST /api/auth/register` and `POST /api/auth/login`.
//! Registration awards the default 1000 points (schema default) and
//! auto-logs the user in by returning a token immediately.

use axum::extract::rejection::JsonRejection;
use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::post;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::auth::{password, token};
use crate::error::AppError;
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/auth/register", post(register))
        .route("/api/auth/login", post(login))
}

/// Credentials accepted by both endpoints.
#[derive(Debug, Deserialize)]
struct Credentials {
    username: String,
    password: String,
}

/// Public user projection returned alongside the token.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
struct PublicUser {
    id: Uuid,
    username: String,
    role: String,
    points_total: i32,
}

/// Shared response body: `{token, user}`.
#[derive(Debug, Serialize)]
struct AuthResponse {
    token: String,
    user: PublicUser,
}

async fn register(
    State(state): State<AppState>,
    body: Result<Json<Credentials>, JsonRejection>,
) -> Result<(StatusCode, Json<AuthResponse>), AppError> {
    let Json(credentials) = body.map_err(|rejection| AppError::Validation(rejection.body_text()))?;
    validate(&credentials)?;
    let hash = password::hash(&credentials.password)?;
    let user = sqlx::query_as::<_, PublicUser>(
        "INSERT INTO users (username, password_hash) VALUES ($1, $2) \
         RETURNING id, username, role, points_total",
    )
    .bind(&credentials.username)
    .bind(&hash)
    .fetch_one(state.pool())
    .await
    .map_err(|err| AppError::unique_violation_or(err, AppError::UsernameTaken))?;
    Ok((StatusCode::CREATED, Json(auth_response(&state, &user)?)))
}

async fn login(
    State(state): State<AppState>,
    body: Result<Json<Credentials>, JsonRejection>,
) -> Result<Json<AuthResponse>, AppError> {
    let Json(credentials) = body.map_err(|rejection| AppError::Validation(rejection.body_text()))?;
    #[derive(Debug, sqlx::FromRow)]
    struct LoginUser {
        id: Uuid,
        username: String,
        role: String,
        points_total: i32,
        password_hash: String,
    }
    let row = sqlx::query_as::<_, LoginUser>(
        "SELECT id, username, role, points_total, password_hash \
         FROM users WHERE username = $1",
    )
    .bind(&credentials.username)
    .fetch_optional(state.pool())
    .await?;
    // Same generic error for unknown user and wrong password.
    let Some(row) = row else {
        return Err(AppError::InvalidCredentials);
    };
    if !password::verify(&credentials.password, &row.password_hash)? {
        return Err(AppError::InvalidCredentials);
    }
    let user = PublicUser {
        id: row.id,
        username: row.username,
        role: row.role,
        points_total: row.points_total,
    };
    Ok(Json(auth_response(&state, &user)?))
}

/// Username: 3-30 characters in `[a-zA-Z0-9_-]`; password: at least 4 characters.
fn validate(credentials: &Credentials) -> Result<(), AppError> {
    let username = &credentials.username;
    let charset_ok = username
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-');
    if !charset_ok || !(3..=30).contains(&username.len()) {
        return Err(AppError::Validation(
            "username must be 3-30 characters (letters, digits, '_' or '-')".to_owned(),
        ));
    }
    if credentials.password.chars().count() < 4 {
        return Err(AppError::Validation(
            "password must be at least 4 characters".to_owned(),
        ));
    }
    Ok(())
}

/// Mints the token for an authenticated/registered user.
fn auth_response(state: &AppState, user: &PublicUser) -> Result<AuthResponse, AppError> {
    let token = token::mint(state.jwt_secret(), user.id, &user.username, &user.role).map_err(
        |err| {
            tracing::error!(error = %err, "failed to mint jwt");
            AppError::Internal
        },
    )?;
    Ok(AuthResponse { token, user: user.clone() })
}
