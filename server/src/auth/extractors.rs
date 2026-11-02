//! Axum extractors shared by the REST routes and (later waves) admin routes.

use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum::http::header;
use uuid::Uuid;

use crate::error::AppError;
use crate::state::AppState;

use super::token;

/// Role value used by the users table and JWT claims for administrators.
pub const ROLE_ADMIN: &str = "admin";

/// Authenticated principal, decoded from `Authorization: Bearer <jwt>`.
/// Missing/invalid/expired tokens yield 401 `unauthorized`.
#[derive(Debug, Clone)]
pub struct AuthUser {
    pub id: Uuid,
    pub username: String,
    pub role: String,
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        let token = bearer_token(parts).ok_or(AppError::Unauthorized)?;
        let claims = token::verify(state.jwt_secret(), token).map_err(|_| AppError::Unauthorized)?;
        Ok(Self {
            id: claims.sub,
            username: claims.username,
            role: claims.role,
        })
    }
}

/// Admin guard wrapping [`AuthUser`]; valid token but non-admin role yields
/// 403 `forbidden`. Destructure with `.0` to reach the inner [`AuthUser`].
#[derive(Debug, Clone)]
#[expect(dead_code)] // consumed by the admin routes (wave E); remove once used
pub struct AdminUser(pub AuthUser);

impl FromRequestParts<AppState> for AdminUser {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        let user = AuthUser::from_request_parts(parts, state).await?;
        if user.role != ROLE_ADMIN {
            return Err(AppError::Forbidden);
        }
        Ok(Self(user))
    }
}

/// Extracts the raw bearer token from the Authorization header.
fn bearer_token(parts: &Parts) -> Option<&str> {
    parts
        .headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
}
