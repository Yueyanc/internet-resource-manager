-- name: ListProviderConnections :many
SELECT * FROM provider_connections
ORDER BY created_at DESC, id DESC;

-- name: ListProviderConnectionsByProvider :many
SELECT * FROM provider_connections
WHERE provider = ?
ORDER BY created_at DESC, id DESC;

-- name: GetProviderConnection :one
SELECT * FROM provider_connections
WHERE id = ?;

-- name: SaveProviderConnection :one
INSERT INTO provider_connections (
    id, provider, label, account_id, token_hint,
    secret_ciphertext, secret_nonce, scopes_json, external_account_name,
    status, last_synced_at, last_error, stats_json, created_at, updated_at
)
VALUES (
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?
)
ON CONFLICT(id) DO UPDATE SET
    label = excluded.label,
    account_id = excluded.account_id,
    token_hint = excluded.token_hint,
    secret_ciphertext = excluded.secret_ciphertext,
    secret_nonce = excluded.secret_nonce,
    scopes_json = excluded.scopes_json,
    external_account_name = excluded.external_account_name,
    status = excluded.status,
    last_synced_at = excluded.last_synced_at,
    last_error = excluded.last_error,
    stats_json = excluded.stats_json,
    updated_at = excluded.updated_at
RETURNING *;

-- name: UpdateProviderConnectionSyncState :one
UPDATE provider_connections
SET status = ?,
    last_synced_at = ?,
    last_error = ?,
    scopes_json = ?,
    external_account_name = ?,
    stats_json = ?,
    updated_at = ?
WHERE id = ?
RETURNING *;

-- name: DeleteProviderConnection :execrows
DELETE FROM provider_connections WHERE id = ?;
