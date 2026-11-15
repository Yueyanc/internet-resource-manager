-- name: GetVaultConfig :one
SELECT * FROM vault_config WHERE id = 1;

-- name: CreateVaultConfig :one
INSERT INTO vault_config (
    id, kdf_salt, kdf_iterations, wrapped_vault_key,
    recovery_salt, wrapped_recovery_key, key_version, created_at, updated_at
)
VALUES (1, ?, ?, ?, ?, ?, 1, ?, ?)
RETURNING *;

-- name: UpdateVaultConfigKeys :one
UPDATE vault_config
SET kdf_salt = ?,
    kdf_iterations = ?,
    wrapped_vault_key = ?,
    recovery_salt = ?,
    wrapped_recovery_key = ?,
    updated_at = ?
WHERE id = 1 AND key_version = ?
RETURNING *;

-- name: ListAccountSecretSummaries :many
SELECT account_id, key_version, has_password, has_totp, has_recovery_codes, updated_at
FROM account_secrets
ORDER BY account_id;

-- name: ListAccountSecrets :many
SELECT * FROM account_secrets ORDER BY account_id;

-- name: GetAccountSecret :one
SELECT * FROM account_secrets WHERE account_id = ?;

-- name: SaveAccountSecret :one
INSERT INTO account_secrets (
    account_id, key_version, ciphertext,
    has_password, has_totp, has_recovery_codes, updated_at
)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(account_id) DO UPDATE SET
    key_version = excluded.key_version,
    ciphertext = excluded.ciphertext,
    has_password = excluded.has_password,
    has_totp = excluded.has_totp,
    has_recovery_codes = excluded.has_recovery_codes,
    updated_at = excluded.updated_at
RETURNING *;

-- name: DeleteAccountSecret :execrows
DELETE FROM account_secrets WHERE account_id = ?;
