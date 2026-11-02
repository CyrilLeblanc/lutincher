//! Lutin REST endpoints: public SVG rendering, admin parts catalog, preview,
//! creation and inventory (PLAN, "compléments REST").
//!
//! `GET /api/lutins/{file}` parses the trailing `.svg` itself because the
//! router does not support dynamic suffixes (`{id}.svg`).

use std::collections::BTreeMap;

use axum::extract::rejection::JsonRejection;
use axum::extract::{Path, State};
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::auth::extractors::AdminUser;
use crate::error::AppError;
use crate::lutins::engine::{self, Overrides};
use crate::lutins::manifest::{catalog, warmup, Rarity};
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    warmup(); // fail fast at startup on a broken asset pack
    Router::new()
        .route("/api/lutins/{file}", get(lutin_svg))
        .route("/api/admin/lutins", get(inventory).post(create))
        .route("/api/admin/lutins/parts", get(parts))
        .route("/api/admin/lutins/preview", post(preview))
}

/// Shared input of preview and creation.
#[derive(Debug, Deserialize)]
struct GenerateInput {
    /// Absent = random (the drawn value is returned).
    seed: Option<u64>,
    /// Absent = 60/30/9/1 roll.
    rarity: Option<Rarity>,
    /// slot_id -> asset_id, validated against the catalog.
    overrides: Option<Overrides>,
    /// Primes over the generated name in both preview and create responses.
    name: Option<String>,
}

/// `GET /api/lutins/{id}.svg` — public; renders a stored lutin manifest.
async fn lutin_svg(
    State(state): State<AppState>,
    Path(file): Path<String>,
) -> Result<Response, AppError> {
    let id = file
        .strip_suffix(".svg")
        .and_then(|raw| Uuid::parse_str(raw).ok())
        .ok_or(AppError::NotFound)?;
    let manifest = sqlx::query_scalar::<_, Value>("SELECT manifest FROM lutins WHERE id = $1")
        .bind(id)
        .fetch_optional(state.pool())
        .await?
        .ok_or(AppError::NotFound)?;
    let parts: BTreeMap<String, String> = serde_json::from_value(manifest).map_err(|err| {
        tracing::error!(error = %err, lutin = %id, "stored manifest is not a parts map");
        AppError::Internal
    })?;
    let svg = engine::assemble_svg(&parts).map_err(|err| {
        tracing::error!(error = %err, lutin = %id, "stored manifest references unknown assets");
        AppError::Internal
    })?;
    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "image/svg+xml"),
            (header::CACHE_CONTROL, "public, max-age=31536000, immutable"),
        ],
        svg,
    )
        .into_response())
}

/// `GET /api/admin/lutins/parts` — the whole catalog, fragments excluded.
async fn parts(AdminUser(_admin): AdminUser) -> Json<Value> {
    Json(catalog().raw().clone())
}

/// `POST /api/admin/lutins/preview` — full build (SVG included), nothing persisted.
async fn preview(
    AdminUser(_admin): AdminUser,
    body: Result<Json<GenerateInput>, JsonRejection>,
) -> Result<Json<Value>, AppError> {
    let Json(input) = body.map_err(|rejection| AppError::Validation(rejection.body_text()))?;
    let seed = resolve_seed(input.seed)?;
    let overrides = input.overrides.unwrap_or_default();
    let build = engine::generate(seed, input.rarity, &overrides)
        .map_err(|err| AppError::Validation(err.to_string()))?;
    // A provided name primes over the generated one (same rule as create).
    let name = resolve_name(input.name.as_deref(), &build.name)?;
    let svg = engine::assemble_svg(&build.manifest).map_err(|err| {
        // Freshly generated manifests always assemble; this is a server bug.
        tracing::error!(error = %err, "generated manifest failed to assemble");
        AppError::Internal
    })?;
    Ok(Json(json!({
        "seed": seed,
        "rarity": build.rarity,
        "name": name,
        "manifest": build.manifest,
        "svg": svg,
    })))
}

/// `POST /api/admin/lutins` — generate + persist one lutin, 201 on success.
async fn create(
    AdminUser(_admin): AdminUser,
    State(state): State<AppState>,
    body: Result<Json<GenerateInput>, JsonRejection>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    let Json(input) = body.map_err(|rejection| AppError::Validation(rejection.body_text()))?;
    let seed = resolve_seed(input.seed)?;
    let overrides = input.overrides.unwrap_or_default();
    let build = engine::generate(seed, input.rarity, &overrides)
        .map_err(|err| AppError::Validation(err.to_string()))?;
    let name = resolve_name(input.name.as_deref(), &build.name)?;
    let manifest = serde_json::to_value(&build.manifest).map_err(|err| {
        tracing::error!(error = %err, "failed to serialize lutin manifest");
        AppError::Internal
    })?;
    let id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO lutins (seed, name, rarity, manifest) VALUES ($1, $2, $3, $4) \
         RETURNING id",
    )
    .bind(seed as i64)
    .bind(&name)
    .bind(build.rarity.as_str())
    .bind(manifest)
    .fetch_one(state.pool())
    .await?;
    Ok((
        StatusCode::CREATED,
        Json(json!({
            "id": id,
            "seed": seed,
            "name": name,
            "rarity": build.rarity,
            "manifest": build.manifest,
        })),
    ))
}

#[derive(Debug, sqlx::FromRow)]
struct InventoryRow {
    id: Uuid,
    seed: i64,
    name: String,
    rarity: String,
    manifest: Value,
}

/// `GET /api/admin/lutins` — stock not referenced by any auction.
async fn inventory(
    AdminUser(_admin): AdminUser,
    State(state): State<AppState>,
) -> Result<Json<Value>, AppError> {
    let rows = sqlx::query_as::<_, InventoryRow>(
        "SELECT l.id, l.seed, l.name, l.rarity, l.manifest \
         FROM lutins l LEFT JOIN auctions a ON a.lutin_id = l.id \
         WHERE a.id IS NULL ORDER BY l.created_at DESC, l.id",
    )
    .fetch_all(state.pool())
    .await?;
    Ok(Json(json!(rows
        .iter()
        .map(|row| json!({
            "id": row.id,
            "seed": row.seed as u64,
            "name": row.name,
            "rarity": row.rarity,
            "manifest": row.manifest,
        }))
        .collect::<Vec<_>>())))
}

/// Random 63-bit seed when absent; explicit seeds must fit the BIGINT column.
fn resolve_seed(seed: Option<u64>) -> Result<u64, AppError> {
    match seed {
        Some(seed) if seed > i64::MAX as u64 => Err(AppError::Validation(
            "seed must be at most 2^63 - 1".to_owned(),
        )),
        Some(seed) => Ok(seed),
        None => Ok(rand::random::<u64>() & i64::MAX as u64),
    }
}

/// Custom name validation; falls back to the generated name when absent.
fn resolve_name(custom: Option<&str>, generated: &str) -> Result<String, AppError> {
    let Some(name) = custom else {
        return Ok(generated.to_owned());
    };
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 80 {
        return Err(AppError::Validation("name must be 1-80 characters".to_owned()));
    }
    Ok(name.to_owned())
}
