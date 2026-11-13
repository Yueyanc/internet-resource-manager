FROM node:24-bookworm-slim AS web
WORKDIR /src
RUN corepack enable && corepack prepare pnpm@12.11.2 --activate
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @irm/web build

FROM golang:1.27-bookworm AS server
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=web /src/internal/webui/assets ./internal/webui/assets
RUN CGO_ENABLED=0 go build -trimpath -o /out/server ./apps/server

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 irm \
    && useradd --uid 10001 --gid irm --no-create-home irm \
    && mkdir /data && chown irm:irm /data
WORKDIR /app
COPY --from=server /out/server /app/server
USER irm
ENV IRM_LISTEN_ADDR=0.0.0.0:8787 IRM_DATA_DIR=/data
EXPOSE 8787
ENTRYPOINT ["/app/server"]
