-- name: ListServers :many
SELECT * FROM servers
ORDER BY archived, CASE status WHEN 'active' THEN 0 WHEN 'maintenance' THEN 1 WHEN 'standby' THEN 2 ELSE 3 END, name, id;

-- name: GetServer :one
SELECT * FROM servers WHERE id = ?;

-- name: SaveServer :one
INSERT INTO servers (
    id, preset_key, name, hostname, provider, kind, status, region, datacenter,
    os, arch, cpu_cores, memory_mb, disk_gb, disk_type, bandwidth_mbps,
    traffic_gb, traffic_rule, traffic_reset_day,
    ipv4, ipv6, private_ip, port_note, ssh_port, ssh_user, console_url,
    subscription_id, account_id, expire_date, tags_json, notes, archived,
    created_at, updated_at
)
VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?,
    ?, ?
)
ON CONFLICT(id) DO UPDATE SET
    preset_key = excluded.preset_key,
    name = excluded.name,
    hostname = excluded.hostname,
    provider = excluded.provider,
    kind = excluded.kind,
    status = excluded.status,
    region = excluded.region,
    datacenter = excluded.datacenter,
    os = excluded.os,
    arch = excluded.arch,
    cpu_cores = excluded.cpu_cores,
    memory_mb = excluded.memory_mb,
    disk_gb = excluded.disk_gb,
    disk_type = excluded.disk_type,
    bandwidth_mbps = excluded.bandwidth_mbps,
    traffic_gb = excluded.traffic_gb,
    traffic_rule = excluded.traffic_rule,
    traffic_reset_day = excluded.traffic_reset_day,
    ipv4 = excluded.ipv4,
    ipv6 = excluded.ipv6,
    private_ip = excluded.private_ip,
    port_note = excluded.port_note,
    ssh_port = excluded.ssh_port,
    ssh_user = excluded.ssh_user,
    console_url = excluded.console_url,
    subscription_id = excluded.subscription_id,
    account_id = excluded.account_id,
    expire_date = excluded.expire_date,
    tags_json = excluded.tags_json,
    notes = excluded.notes,
    archived = excluded.archived,
    updated_at = excluded.updated_at
RETURNING *;

-- name: DeleteServer :execrows
DELETE FROM servers WHERE id = ?;

-- name: ListAllServerDomains :many
SELECT server_id, domain_id FROM server_domains ORDER BY created_at, domain_id;

-- name: ListServerDomainsByServer :many
SELECT domain_id FROM server_domains WHERE server_id = ? ORDER BY created_at, domain_id;

-- name: DeleteServerDomains :exec
DELETE FROM server_domains WHERE server_id = ?;

-- name: InsertServerDomain :exec
INSERT INTO server_domains (server_id, domain_id, created_at) VALUES (?, ?, ?);

-- name: ListAllServerIPs :many
SELECT id, server_id FROM ips WHERE server_id IS NOT NULL AND server_id != '' ORDER BY address, id;

-- name: ListServerIPsByServer :many
SELECT id FROM ips WHERE server_id = ? ORDER BY address, id;

-- name: ClearServerIPs :exec
UPDATE ips SET server_id = NULL, updated_at = ? WHERE server_id = ?;

-- name: AssignIPToServer :exec
UPDATE ips SET server_id = ?, updated_at = ? WHERE id = ?;

-- name: UpdateServerSyncMeta :one
UPDATE servers
SET preset_key = ?,
    name = ?,
    hostname = ?,
    provider = ?,
    kind = ?,
    status = ?,
    region = ?,
    datacenter = ?,
    os = ?,
    arch = ?,
    cpu_cores = ?,
    memory_mb = ?,
    disk_gb = ?,
    disk_type = ?,
    bandwidth_mbps = ?,
    traffic_gb = ?,
    traffic_reset_day = ?,
    ipv4 = ?,
    ipv6 = ?,
    private_ip = ?,
    console_url = ?,
    account_id = ?,
    expire_date = ?,
    tags_json = ?,
    provider_connection_id = ?,
    external_id = ?,
    provider_meta_json = ?,
    updated_at = ?
WHERE id = ?
RETURNING *;

