-- +goose Up
CREATE TABLE agent_enroll_tokens (
    id TEXT PRIMARY KEY NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    target_server_id TEXT REFERENCES servers(id) ON DELETE CASCADE,
    name_hint TEXT NOT NULL DEFAULT '',
    preset_key TEXT NOT NULL DEFAULT '',
    docker_enabled INTEGER NOT NULL DEFAULT 0 CHECK (docker_enabled IN (0, 1)),
    expires_at TEXT NOT NULL,
    used_at TEXT NOT NULL DEFAULT '',
    result_server_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE server_agents (
    server_id TEXT PRIMARY KEY NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    mode TEXT NOT NULL DEFAULT 'daemon' CHECK (mode IN ('daemon', 'snapshot')),
    token_hash TEXT NOT NULL UNIQUE,
    agent_version TEXT NOT NULL DEFAULT '',
    interval_sec INTEGER NOT NULL DEFAULT 20 CHECK (interval_sec >= 0),
    enrolled_at TEXT NOT NULL,
    last_reported_at TEXT NOT NULL DEFAULT '',
    cpu_model TEXT NOT NULL DEFAULT '',
    kernel_version TEXT NOT NULL DEFAULT '',
    uptime_seconds INTEGER NOT NULL DEFAULT 0,
    cpu_percent REAL NOT NULL DEFAULT 0,
    load1 REAL NOT NULL DEFAULT 0,
    load5 REAL NOT NULL DEFAULT 0,
    load15 REAL NOT NULL DEFAULT 0,
    memory_used_bytes INTEGER NOT NULL DEFAULT 0,
    memory_total_bytes INTEGER NOT NULL DEFAULT 0,
    swap_used_bytes INTEGER NOT NULL DEFAULT 0,
    swap_total_bytes INTEGER NOT NULL DEFAULT 0,
    root_disk_used_bytes INTEGER NOT NULL DEFAULT 0,
    root_disk_total_bytes INTEGER NOT NULL DEFAULT 0,
    net_rx_bps INTEGER NOT NULL DEFAULT 0,
    net_tx_bps INTEGER NOT NULL DEFAULT 0,
    traffic_cycle_key TEXT NOT NULL DEFAULT '',
    traffic_rx_bytes INTEGER NOT NULL DEFAULT 0,
    traffic_tx_bytes INTEGER NOT NULL DEFAULT 0,
    last_boot_rx_bytes INTEGER NOT NULL DEFAULT 0,
    last_boot_tx_bytes INTEGER NOT NULL DEFAULT 0,
    tcp_connections INTEGER NOT NULL DEFAULT 0,
    docker_enabled INTEGER NOT NULL DEFAULT 0 CHECK (docker_enabled IN (0, 1)),
    docker_available INTEGER NOT NULL DEFAULT 0 CHECK (docker_available IN (0, 1)),
    docker_error TEXT NOT NULL DEFAULT '',
    containers_json TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX idx_enroll_tokens_expires ON agent_enroll_tokens(expires_at);

-- +goose Down
DROP INDEX IF EXISTS idx_enroll_tokens_expires;
DROP TABLE IF EXISTS server_agents;
DROP TABLE IF EXISTS agent_enroll_tokens;
