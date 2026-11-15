-- name: CreateAgentEnrollToken :one
INSERT INTO agent_enroll_tokens (
    id, token_hash, target_server_id, name_hint, preset_key, docker_enabled,
    expires_at, used_at, result_server_id, created_at
)
VALUES (?, ?, ?, ?, ?, ?, ?, '', '', ?)
RETURNING *;

-- name: GetAgentEnrollTokenByID :one
SELECT * FROM agent_enroll_tokens WHERE id = ?;

-- name: GetAgentEnrollTokenByHash :one
SELECT * FROM agent_enroll_tokens WHERE token_hash = ?;

-- name: ConsumeAgentEnrollToken :execrows
UPDATE agent_enroll_tokens
SET used_at = ?, result_server_id = ?
WHERE id = ? AND used_at = '' AND expires_at > ?;

-- name: PruneExpiredAgentEnrollTokens :exec
DELETE FROM agent_enroll_tokens WHERE expires_at <= ? AND used_at = '';

-- name: ListServerAgents :many
SELECT * FROM server_agents ORDER BY server_id;

-- name: GetServerAgent :one
SELECT * FROM server_agents WHERE server_id = ?;

-- name: GetServerAgentByTokenHash :one
SELECT * FROM server_agents WHERE token_hash = ? AND mode = 'daemon';

-- name: UpsertServerAgent :one
INSERT INTO server_agents (
    server_id, mode, token_hash, agent_version, interval_sec,
    enrolled_at, last_reported_at, cpu_model, kernel_version, uptime_seconds,
    cpu_percent, load1, load5, load15,
    memory_used_bytes, memory_total_bytes, swap_used_bytes, swap_total_bytes,
    root_disk_used_bytes, root_disk_total_bytes,
    net_rx_bps, net_tx_bps,
    traffic_cycle_key, traffic_rx_bytes, traffic_tx_bytes,
    last_boot_rx_bytes, last_boot_tx_bytes,
    tcp_connections, docker_enabled, docker_available, docker_error, containers_json
)
VALUES (
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?,
    ?, ?,
    ?, ?, ?,
    ?, ?,
    ?, ?, ?, ?, ?
)
ON CONFLICT(server_id) DO UPDATE SET
    mode = excluded.mode,
    token_hash = excluded.token_hash,
    agent_version = excluded.agent_version,
    interval_sec = excluded.interval_sec,
    enrolled_at = excluded.enrolled_at,
    last_reported_at = excluded.last_reported_at,
    cpu_model = excluded.cpu_model,
    kernel_version = excluded.kernel_version,
    uptime_seconds = excluded.uptime_seconds,
    cpu_percent = excluded.cpu_percent,
    load1 = excluded.load1,
    load5 = excluded.load5,
    load15 = excluded.load15,
    memory_used_bytes = excluded.memory_used_bytes,
    memory_total_bytes = excluded.memory_total_bytes,
    swap_used_bytes = excluded.swap_used_bytes,
    swap_total_bytes = excluded.swap_total_bytes,
    root_disk_used_bytes = excluded.root_disk_used_bytes,
    root_disk_total_bytes = excluded.root_disk_total_bytes,
    net_rx_bps = excluded.net_rx_bps,
    net_tx_bps = excluded.net_tx_bps,
    traffic_cycle_key = excluded.traffic_cycle_key,
    traffic_rx_bytes = excluded.traffic_rx_bytes,
    traffic_tx_bytes = excluded.traffic_tx_bytes,
    last_boot_rx_bytes = excluded.last_boot_rx_bytes,
    last_boot_tx_bytes = excluded.last_boot_tx_bytes,
    tcp_connections = excluded.tcp_connections,
    docker_enabled = excluded.docker_enabled,
    docker_available = excluded.docker_available,
    docker_error = excluded.docker_error,
    containers_json = excluded.containers_json
RETURNING *;

-- name: DeleteServerAgent :execrows
DELETE FROM server_agents WHERE server_id = ?;
