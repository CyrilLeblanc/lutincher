# Build stage (rust:1-slim tracks Debian trixie; runtime is matched to it).
FROM rust:1-slim AS builder
WORKDIR /build

# Cache the dependency build behind a dummy binary.
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs \
 && cargo build --release && rm src/main.rs

COPY src ./src
COPY migrations ./migrations
RUN touch src/main.rs && cargo build --release

# Runtime stage: binary only (migrations are embedded by sqlx::migrate!).
FROM debian:trixie-slim
COPY --from=builder /build/target/release/lutincher-server /usr/local/bin/lutincher-server
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/lutincher-server"]
