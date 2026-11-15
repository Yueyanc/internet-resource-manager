-- name: ListDomains :many
SELECT * FROM domains
ORDER BY archived, CASE status WHEN 'active' THEN 0 WHEN 'transferring' THEN 1 WHEN 'parked' THEN 2 ELSE 3 END, created_at DESC, id DESC;

-- name: GetDomain :one
SELECT * FROM domains WHERE id = ?;

-- name: SaveDomain :one
INSERT INTO domains (
    id, preset_key, name, registrar, dns_provider, purpose, status,
    expire_date, auto_renew, whois_privacy, icp_status, icp_number,
    management_url, subscription_id, registrar_account_id,
    tags_json, notes, archived, created_at, updated_at
)
VALUES (
    ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?, ?, ?
)
ON CONFLICT(id) DO UPDATE SET
    preset_key = excluded.preset_key,
    name = excluded.name,
    registrar = excluded.registrar,
    dns_provider = excluded.dns_provider,
    purpose = excluded.purpose,
    status = excluded.status,
    expire_date = excluded.expire_date,
    auto_renew = excluded.auto_renew,
    whois_privacy = excluded.whois_privacy,
    icp_status = excluded.icp_status,
    icp_number = excluded.icp_number,
    management_url = excluded.management_url,
    subscription_id = excluded.subscription_id,
    registrar_account_id = excluded.registrar_account_id,
    tags_json = excluded.tags_json,
    notes = excluded.notes,
    archived = excluded.archived,
    updated_at = excluded.updated_at
RETURNING *;

-- name: DeleteDomain :execrows
DELETE FROM domains WHERE id = ?;

-- name: ListDomainServersByDomain :many
SELECT server_id FROM server_domains WHERE domain_id = ? ORDER BY created_at, server_id;

-- name: DeleteDomainServers :exec
DELETE FROM server_domains WHERE domain_id = ?;

-- name: ListDomainIPsByDomain :many
SELECT ip_id FROM ip_domains WHERE domain_id = ? ORDER BY created_at, ip_id;

-- name: DeleteDomainIPs :exec
DELETE FROM ip_domains WHERE domain_id = ?;
