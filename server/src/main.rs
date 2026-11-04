mod auctions;
mod auth;
mod config;
mod error;
mod lutins;
mod metrics;
mod routes;
mod state;
mod ws;

use axum::http::{header, Method};
use axum::Router;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing_subscriber::EnvFilter;

use crate::config::Config;
use crate::state::AppState;

#[tokio::main]
async fn main() {
    if let Err(err) = run().await {
        eprintln!("fatal: {err}");
        std::process::exit(1);
    }
}

async fn run() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .init();

    metrics::register_all();
    let config = Config::from_env()?;
    let (publish_tx, publish_rx) = ws::publish_channel();
    let broker = redis::Client::open(config.redis_url())?;
    let redis = redis::aio::ConnectionManager::new(broker.clone()).await?;
    let hub = ws::Hub::new(publish_tx, redis, config.instance().to_owned());
    let state = AppState::connect(
        config.database_url(),
        config.jwt_secret().to_owned(),
        hub,
        config.allowed_origins().to_vec(),
    )
    .await?;
    sqlx::migrate!("./migrations").run(state.pool()).await?;
    auth::seed::seed_admin(state.pool()).await?;
    lutins::seed::seed_demo(state.pool()).await?;

    // Real-time core, shared by every instance through Redis: the publisher
    // (journal `seq` → broadcast), the subscriber (broadcast → local tabs),
    // the presence sweep and the auction lifecycle scanner (~1 s pass).
    tokio::spawn(ws::run_publisher(
        publish_rx,
        state.pool().clone(),
        state.hub().clone(),
    ));
    tokio::spawn(ws::broker::run_subscriber(broker, state.hub().clone()));
    tokio::spawn(ws::presence::run_sweep(state.hub().clone()));
    tokio::spawn(auctions::scheduler::run(
        state.pool().clone(),
        state.hub().clone(),
    ));

    let origins = config
        .allowed_origins()
        .iter()
        .map(|origin| origin.parse())
        .collect::<Result<Vec<_>, _>>()?;
    let app = Router::new()
        .merge(routes::routes())
        .layer(
            CorsLayer::new()
                .allow_origin(AllowOrigin::list(origins))
                .allow_methods([Method::GET, Method::POST, Method::PUT, Method::PATCH, Method::DELETE])
                .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION]),
        )
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(config.bind_addr()).await?;
    tracing::info!(instance = config.instance(), "listening on http://{}", config.bind_addr());
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

/// Resolves when the process receives ctrl-c (graceful shutdown).
async fn shutdown_signal() {
    if let Err(err) = tokio::signal::ctrl_c().await {
        tracing::error!(error = %err, "failed to listen for ctrl-c");
    }
}
