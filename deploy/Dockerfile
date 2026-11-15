FROM node:24-bookworm-slim AS web
WORKDIR /src
RUN corepack enable && corepack prepare pnpm@12.11.2 --activate
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @irm/web build

FROM golang:1.27-bookworm AS server
ARG VERSION=0.1.0-dev
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=web /src/internal/webui/assets ./internal/webui/assets
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X main.version=${VERSION}" -o /out/server ./apps/server \
    && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /out/dist/irm-agent-linux-amd64 ./apps/agent \
    && CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -ldflags="-s -w" -o /out/dist/irm-agent-linux-arm64 ./apps/agent

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 irm \
    && useradd --uid 10001 --gid irm --no-create-home irm \
    && mkdir -p /data /app/dist && chown -R irm:irm /data /app
WORKDIR /app
COPY --from=server /out/server /app/server
COPY --from=server /out/dist/ /app/dist/
USER irm
ENV IRM_LISTEN_ADDR=0.0.0.0:8787 IRM_DATA_DIR=/data IRM_AGENT_BIN_DIR=/app/dist TZ=Asia/Shanghai
EXPOSE 8787
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 CMD ["/app/server", "-healthcheck"]
ENTRYPOINT ["/app/server"]
