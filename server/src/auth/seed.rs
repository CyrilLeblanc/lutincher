//! Startup seeding of the admin account (cahier des charges §2: the admin
//! account is created by seed, not by registration).

use sqlx::PgPool;
use uuid::Uuid;

use super::extractors::ROLE_ADMIN;
use super::password;

/// Failures raised while seeding the admin account at startup.
#[derive(Debug, thiserror::Error)]
pub enum SeedAdminError {
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("password hashing failed: {0}")]
    Hash(#[from] argon2::password_hash::Error),
}

/// Creates the admin user (`ADMIN_USERNAME`/`ADMIN_PASSWORD`, defaults
/// `admin`/`lutincher`) if it does not exist yet. Idempotent.
pub async fn seed_admin(pool: &PgPool) -> Result<(), SeedAdminError> {
    let username = std::env::var("ADMIN_USERNAME").unwrap_or_else(|_| "admin".to_owned());
    let password = match std::env::var("ADMIN_PASSWORD") {
        Ok(value) if !value.is_empty() => value,
        _ => {
            tracing::warn!("ADMIN_PASSWORD not set; using the default value (local dev only)");
            "lutincher".to_owned()
        }
    };
    let hash = password::hash(&password)?;
    let inserted = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) \
         ON CONFLICT (username) DO NOTHING RETURNING id",
    )
    .bind(&username)
    .bind(&hash)
    .bind(ROLE_ADMIN)
    .fetch_optional(pool)
    .await?;
    match inserted {
        Some(_) => tracing::info!(username, "admin account created"),
        None => tracing::info!(username, "admin account already present"),
    }
    Ok(())
}
