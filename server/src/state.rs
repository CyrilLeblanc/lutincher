use std::time::Duration;

use sqlx::PgPool;

use crate::ws::Hub;

/// Shared application state injected into every handler.
#[derive(Clone)]
pub struct AppState {
    pool: PgPool,
    jwt_secret: String,
    /// WebSocket hub: connection registry + ordered publish pipeline.
    hub: Hub,
    /// Origin whitelist enforced at the WS handshake.
    allowed_origins: Vec<String>,
}

impl AppState {
    /// Connects to PostgreSQL, retrying while the database is still starting
    /// (10 attempts, 1 s apart).
    pub async fn connect(
        database_url: &str,
        jwt_secret: String,
        hub: Hub,
        allowed_origins: Vec<String>,
    ) -> Result<Self, sqlx::Error> {
        const ATTEMPTS: u32 = 10;
        for attempt in 1..ATTEMPTS {
            match PgPool::connect(database_url).await {
                Ok(pool) => {
                    return Ok(Self { pool, jwt_secret, hub, allowed_origins })
                }
                Err(err) => {
                    tracing::warn!(attempt, error = %err, "database not ready, retrying in 1s");
                }
            }
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
        let pool = PgPool::connect(database_url).await?;
        Ok(Self { pool, jwt_secret, hub, allowed_origins })
    }

    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    /// HS256 secret shared by the REST extractors and the WS handshake.
    pub fn jwt_secret(&self) -> &str {
        &self.jwt_secret
    }

    /// Real-time hub shared by the WS handlers, the REST routes and the
    /// background tasks.
    pub fn hub(&self) -> &Hub {
        &self.hub
    }

    /// Origins allowed to open the WebSocket (config `ALLOWED_ORIGINS`).
    pub fn allowed_origins(&self) -> &[String] {
        &self.allowed_origins
    }
}
