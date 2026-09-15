FROM node:22-bookworm-slim AS web
WORKDIR /build/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build
FROM rust:1.94-slim-bookworm AS rust
RUN apt-get update && apt-get install -y --no-install-recommends build-essential pkg-config ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
COPY scripts/install-agent.sh ./scripts/install-agent.sh
COPY scripts/xray_collector.py ./scripts/xray_collector.py
RUN cargo build --release --locked -j 1 --workspace
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/* && useradd --system --uid 10001 --home /data stealthnet
WORKDIR /app
COPY --from=rust /build/target/release/stealthnet-api /usr/local/bin/stealthnet-api
COPY --from=rust /build/target/release/stealthnet-agent /tmp/stealthnet-agent
RUN mkdir -p /app/downloads && ARCH=$(uname -m) && mv /tmp/stealthnet-agent /app/downloads/stealthnet-agent-linux-$ARCH && cd /app/downloads && sha256sum stealthnet-agent-linux-$ARCH > stealthnet-agent-linux-$ARCH.sha256
COPY --from=web /build/web/dist /app/web
ENV WEB_DIR=/app/web DOWNLOAD_DIR=/app/downloads DATA_DIR=/data BIND_ADDR=0.0.0.0:8787
USER 10001
EXPOSE 8787
CMD ["/usr/local/bin/stealthnet-api"]
