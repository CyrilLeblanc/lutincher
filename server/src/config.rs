use std::net::SocketAddr;

/// Environment-driven configuration, loaded once at startup.
#[derive(Debug, Clone)]
pub struct Config {
    database_url: String,
    /// HS256 secret for auth tokens.
    jwt_secret: String,
    /// Broker shared by all api instances (fan-out, presence, rate limits).
    redis_url: String,
    /// Name of this instance, shown in logs and `/healthz`.
    instance: String,
    bind_addr: SocketAddr,
    allowed_origins: Vec<String>,
}

impl Config {
    /// Reads configuration from the environment. The error message lists the
    /// first invalid or missing variable.
    pub fn from_env() -> Result<Self, String> {
        let database_url = env_required("DATABASE_URL")?;
        let jwt_secret = env_required("JWT_SECRET")?;
        let redis_url = env_required("REDIS_URL")?;
        let instance = env_or("INSTANCE_NAME", "api");
        let bind_addr = env_or("BIND_ADDR", "0.0.0.0:3000")
            .parse()
            .map_err(|err| format!("invalid BIND_ADDR: {err}"))?;
        let allowed_origins = env_or("ALLOWED_ORIGINS", "http://localhost:5173")
            .split(',')
            .map(|origin| origin.trim().to_owned())
            .filter(|origin| !origin.is_empty())
            .collect();

        Ok(Self {
            database_url,
            jwt_secret,
            redis_url,
            instance,
            bind_addr,
            allowed_origins,
        })
    }

    pub fn database_url(&self) -> &str {
        &self.database_url
    }

    /// HS256 secret used to sign and verify auth tokens.
    pub fn jwt_secret(&self) -> &str {
        &self.jwt_secret
    }

    pub fn redis_url(&self) -> &str {
        &self.redis_url
    }

    pub fn instance(&self) -> &str {
        &self.instance
    }

    pub fn bind_addr(&self) -> SocketAddr {
        self.bind_addr
    }

    pub fn allowed_origins(&self) -> &[String] {
        &self.allowed_origins
    }
}

/// Required variable; fails with its name when absent.
fn env_required(name: &str) -> Result<String, String> {
    std::env::var(name).map_err(|_| format!("missing required environment variable {name}"))
}

/// Variable with a default value.
fn env_or(name: &str, default: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| default.to_owned())
}
