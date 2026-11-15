-- name: ListAccounts :many
SELECT * FROM accounts ORDER BY CASE role WHEN 'hub' THEN 0 WHEN 'primary' THEN 1 ELSE 2 END, platform, id;

-- name: GetAccount :one
SELECT * FROM accounts WHERE id = ?;

-- name: SaveAccount :one
INSERT INTO accounts (
    id, preset_key, platform, label, identifier, uid, category, ecosystem, region,
    role, status, auth_method, recovery_account_id, recovery_email, sso_account_id,
    phone_hint, two_factor, recovery_codes, kyc_status, kyc_note,
    keepalive_cycle, keepalive_days, next_checkin_date, last_checked_at,
    vault_reference, security_url, notes, archived, created_at, updated_at
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
    preset_key = excluded.preset_key,
    platform = excluded.platform,
    label = excluded.label,
    identifier = excluded.identifier,
    uid = excluded.uid,
    category = excluded.category,
    ecosystem = excluded.ecosystem,
    region = excluded.region,
    role = excluded.role,
    status = excluded.status,
    auth_method = excluded.auth_method,
    recovery_account_id = excluded.recovery_account_id,
    recovery_email = excluded.recovery_email,
    sso_account_id = excluded.sso_account_id,
    phone_hint = excluded.phone_hint,
    two_factor = excluded.two_factor,
    recovery_codes = excluded.recovery_codes,
    kyc_status = excluded.kyc_status,
    kyc_note = excluded.kyc_note,
    keepalive_cycle = excluded.keepalive_cycle,
    keepalive_days = excluded.keepalive_days,
    next_checkin_date = excluded.next_checkin_date,
    last_checked_at = excluded.last_checked_at,
    vault_reference = excluded.vault_reference,
    security_url = excluded.security_url,
    notes = excluded.notes,
    archived = excluded.archived,
    updated_at = excluded.updated_at
RETURNING *;

-- name: CheckinAccount :one
UPDATE accounts
SET next_checkin_date = ?, last_checked_at = ?, updated_at = ?
WHERE id = ? AND next_checkin_date = ? AND archived = 0
RETURNING *;

-- name: DeleteAccount :execrows
DELETE FROM accounts WHERE id = ?;
