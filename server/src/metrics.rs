//! Prometheus instrumentation (phase 5). Every series belongs to one api
//! instance: Prometheus scrapes each of them and Grafana aggregates the sum.
//! Served as text exposition at `GET /metrics` (routes/health.rs).

use std::sync::LazyLock;

use prometheus::{
    register_histogram, register_int_counter, register_int_counter_vec, register_int_gauge,
    Histogram, IntCounter, IntCounterVec, IntGauge,
};

/// Open WebSocket connections on this instance.
pub static CONNECTIONS: LazyLock<IntGauge> = LazyLock::new(|| {
    register_int_gauge!("lutincher_ws_connections", "Open WebSocket connections")
        .expect("metric name is valid")
});

/// Frames queued to client connections: the outbound message rate.
pub static FRAMES_SENT: LazyLock<IntCounter> = LazyLock::new(|| {
    register_int_counter!("lutincher_ws_frames_sent_total", "Frames queued to clients")
        .expect("metric name is valid")
});

/// Connections closed (client left, socket error, or broker reset).
pub static DISCONNECTS: LazyLock<IntCounter> = LazyLock::new(|| {
    register_int_counter!("lutincher_ws_disconnects_total", "WebSocket connections closed")
        .expect("metric name is valid")
});

/// Broker subscription losses; each one drops this instance's connections.
pub static BROKER_RESETS: LazyLock<IntCounter> = LazyLock::new(|| {
    register_int_counter!("lutincher_broker_resets_total", "Broker subscription losses")
        .expect("metric name is valid")
});

/// Bids accepted by the auction rules.
pub static BIDS_ACCEPTED: LazyLock<IntCounter> = LazyLock::new(|| {
    register_int_counter!("lutincher_bids_accepted_total", "Bids accepted")
        .expect("metric name is valid")
});

/// Error events sent to clients, by contract error code.
pub static ERRORS: LazyLock<IntCounterVec> = LazyLock::new(|| {
    register_int_counter_vec!("lutincher_errors_total", "Error events sent, by code", &["code"])
        .expect("metric name is valid")
});

/// Time from journal publish to local delivery (seconds).
pub static BROADCAST_LATENCY: LazyLock<Histogram> = LazyLock::new(|| {
    register_histogram!(
        "lutincher_broadcast_latency_seconds",
        "Time from journal publish to local delivery",
        vec![0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0]
    )
    .expect("metric name is valid")
});

/// Creates every series at startup. Lazy statics register on first use, so
/// without this a fresh instance would expose no series until its first event.
pub fn register_all() {
    LazyLock::force(&CONNECTIONS);
    LazyLock::force(&FRAMES_SENT);
    LazyLock::force(&DISCONNECTS);
    LazyLock::force(&BROKER_RESETS);
    LazyLock::force(&BIDS_ACCEPTED);
    LazyLock::force(&ERRORS);
    LazyLock::force(&BROADCAST_LATENCY);
}
