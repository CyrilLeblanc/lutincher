use std::time::Duration;

use sqlx::PgPool;

/// Shared application state injected into every handler.
#[derive(Clone)]
pub struct AppState {
    pool: PgPool,
    jwt_secret: String,
}

impl AppState {
    /// Connects to PostgreSQL, retrying while the database is still starting
    /// (10 attempts, 1 s apart).
    pub async fn connect(database_url: &str, jwt_secret: String) -> Result<Self, sqlx::Error> {
        const ATTEMPTS: u32 = 10;
        for attempt in 1..ATTEMPTS {
            match PgPool::connect(database_url).await {
                Ok(pool) => return Ok(Self { pool, jwt_secret }),
                Err(err) => {
                    tracing::warn!(attempt, error = %err, "database not ready, retrying in 1s");
                }
            }
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
        let pool = PgPool::connect(database_url).await?;
        Ok(Self { pool, jwt_secret })
    }

    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    /// HS256 secret shared by the REST extractors and the WS handshake.
    pub fn jwt_secret(&self) -> &str {
        &self.jwt_secret
    }
}
