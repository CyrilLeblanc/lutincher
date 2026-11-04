//! Demo seed (cahier §6: "admin, ~40 lutins, ventes prêtes"): on an empty
//! database, mints 40 lutins from fixed seeds and schedules 10 sales, one per
//! minute from now. Off with `SEED_DEMO=false` (load series, protocole-mesure:
//! no extra sale may run during a measurement).

use chrono::{Duration, Utc};
use sqlx::PgPool;

use super::engine::{self, LutinError, Overrides};

const LUTINS: u64 = 40;
const SALES: i64 = 10;
const SALE_EVERY_S: i64 = 60;
const SALE_DURATION_S: i32 = 90;
const SALE_INCREMENT: i32 = 10;
/// Serializes the seed between the two instances booting together.
const SEED_LOCK: i64 = 0x5EED;

/// Failures raised while seeding the demo data at startup.
#[derive(Debug, thiserror::Error)]
pub enum SeedDemoError {
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("lutin generation failed: {0}")]
    Lutin(#[from] LutinError),
    #[error("manifest serialization failed: {0}")]
    Json(#[from] serde_json::Error),
}

/// Seeds lutins and sales once: a database holding any lutin is left as is.
pub async fn seed_demo(pool: &PgPool) -> Result<(), SeedDemoError> {
    if std::env::var("SEED_DEMO").is_ok_and(|value| value == "false") {
        return Ok(());
    }
    let mut tx = pool.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock($1)")
        .bind(SEED_LOCK)
        .execute(&mut *tx)
        .await?;
    let present: i64 = sqlx::query_scalar("SELECT count(*) FROM lutins")
        .fetch_one(&mut *tx)
        .await?;
    if present > 0 {
        return Ok(());
    }
    let now = Utc::now();
    for index in 0..LUTINS {
        let build = engine::generate(index + 1, None, &Overrides::new())?;
        let id: uuid::Uuid = sqlx::query_scalar(
            "INSERT INTO lutins (seed, name, rarity, manifest) VALUES ($1, $2, $3, $4) \
             RETURNING id",
        )
        .bind((index + 1) as i64)
        .bind(&build.name)
        .bind(build.rarity.as_str())
        .bind(serde_json::to_value(&build.manifest)?)
        .fetch_one(&mut *tx)
        .await?;
        let slot = index as i64;
        if slot < SALES {
            // Start price = collection value: rarer lutins open higher.
            sqlx::query(
                "INSERT INTO auctions (lutin_id, start_price, increment, duration_s, scheduled_at) \
                 VALUES ($1, $2, $3, $4, $5)",
            )
            .bind(id)
            .bind(build.rarity.value() as i32)
            .bind(SALE_INCREMENT)
            .bind(SALE_DURATION_S)
            .bind(now + Duration::seconds(slot * SALE_EVERY_S))
            .execute(&mut *tx)
            .await?;
        }
    }
    tx.commit().await?;
    tracing::info!(lutins = LUTINS, sales = SALES, "demo data seeded");
    Ok(())
}
