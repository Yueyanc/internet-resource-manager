-- name: ListIPs :many
SELECT * FROM ips
ORDER BY CASE role WHEN 'dedicated' THEN 0 WHEN 'primary' THEN 1 WHEN 'service' THEN 2 ELSE 3 END, provider, address, id;

-- name: GetIP :one
SELECT * FROM ips WHERE id = ?;

-- name: SaveIP :one
INSERT INTO ips (
    id, preset_key, address, version, prefix_len, network_scope, category,
    provider, label, region, city, asn, asn_org, ptr_record,
    asn_type, origin_type, risk_level, purity_note, unlocks_json, tags_json, manual_locks_json,
    lookup_source, lookup_checked_at, lookup_error,
    role, status, review_cycle, review_days, next_review_date, last_reviewed_at,
    probe_mode, probe_port, probe_status, probe_latency_ms, probe_checked_at, probe_error,
    subscription_id, server_id, host_label, console_url, notes, archived, created_at, updated_at
)
VALUES (
    ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?, ?, ?
)
ON CONFLICT(id) DO UPDATE SET
    preset_key = excluded.preset_key,
    address = excluded.address,
    version = excluded.version,
    prefix_len = excluded.prefix_len,
    network_scope = excluded.network_scope,
    category = excluded.category,
    provider = excluded.provider,
    label = excluded.label,
    region = excluded.region,
    city = excluded.city,
    asn = excluded.asn,
    asn_org = excluded.asn_org,
    ptr_record = excluded.ptr_record,
    asn_type = excluded.asn_type,
    origin_type = excluded.origin_type,
    risk_level = excluded.risk_level,
    purity_note = excluded.purity_note,
    unlocks_json = excluded.unlocks_json,
    tags_json = excluded.tags_json,
    manual_locks_json = excluded.manual_locks_json,
    lookup_source = excluded.lookup_source,
    lookup_checked_at = excluded.lookup_checked_at,
    lookup_error = excluded.lookup_error,
    role = excluded.role,
    status = excluded.status,
    review_cycle = excluded.review_cycle,
    review_days = excluded.review_days,
    next_review_date = excluded.next_review_date,
    last_reviewed_at = excluded.last_reviewed_at,
    probe_mode = excluded.probe_mode,
    probe_port = excluded.probe_port,
    probe_status = excluded.probe_status,
    probe_latency_ms = excluded.probe_latency_ms,
    probe_checked_at = excluded.probe_checked_at,
    probe_error = excluded.probe_error,
    subscription_id = excluded.subscription_id,
    server_id = excluded.server_id,
    host_label = excluded.host_label,
    console_url = excluded.console_url,
    notes = excluded.notes,
    archived = excluded.archived,
    updated_at = excluded.updated_at
RETURNING *;

-- name: ReviewIP :one
UPDATE ips
SET next_review_date = ?, last_reviewed_at = ?, updated_at = ?
WHERE id = ? AND next_review_date = ? AND archived = 0
RETURNING *;

-- name: UpdateIPLookup :one
UPDATE ips
SET region = ?, city = ?, asn = ?, asn_org = ?, ptr_record = ?,
    lookup_source = ?, lookup_checked_at = ?, lookup_error = ?, updated_at = ?
WHERE id = ?
RETURNING *;

-- name: UpdateIPProbe :one
UPDATE ips
SET probe_status = ?, probe_latency_ms = ?, probe_checked_at = ?, probe_error = ?, updated_at = ?
WHERE id = ?
RETURNING *;

-- name: DeleteIP :execrows
DELETE FROM ips WHERE id = ?;

-- name: ListAllIPDomains :many
SELECT ip_id, domain_id FROM ip_domains ORDER BY created_at, domain_id;

-- name: ListIPDomainsByIP :many
SELECT domain_id FROM ip_domains WHERE ip_id = ? ORDER BY created_at, domain_id;

-- name: DeleteIPDomains :exec
DELETE FROM ip_domains WHERE ip_id = ?;

-- name: InsertIPDomain :exec
INSERT INTO ip_domains (ip_id, domain_id, created_at) VALUES (?, ?, ?);

-- name: ListAllIPAccounts :many
SELECT ip_id, account_id FROM ip_accounts ORDER BY created_at, account_id;

-- name: ListIPAccountsByIP :many
SELECT account_id FROM ip_accounts WHERE ip_id = ? ORDER BY created_at, account_id;

-- name: DeleteIPAccounts :exec
DELETE FROM ip_accounts WHERE ip_id = ?;

-- name: InsertIPAccount :exec
INSERT INTO ip_accounts (ip_id, account_id, created_at) VALUES (?, ?, ?);
