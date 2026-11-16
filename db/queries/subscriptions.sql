-- name: ListSubscriptions :many
SELECT * FROM subscriptions ORDER BY due_date, id;

-- name: GetSubscription :one
SELECT * FROM subscriptions WHERE id = ?;

-- name: SaveSubscription :one
INSERT INTO subscriptions (
    id, preset_key, name, amount_minor, currency, cycle, interval_days, due_date,
    category, renewal_mode, intention, renewal_amount_minor,
    account_id, billing_account_id, account, payment_method, management_url, notes,
    archived, created_at, updated_at
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
    preset_key = excluded.preset_key,
    name = excluded.name,
    amount_minor = excluded.amount_minor,
    currency = excluded.currency,
    cycle = excluded.cycle,
    interval_days = excluded.interval_days,
    due_date = excluded.due_date,
    category = excluded.category,
    renewal_mode = excluded.renewal_mode,
    intention = excluded.intention,
    renewal_amount_minor = excluded.renewal_amount_minor,
    account_id = excluded.account_id,
    billing_account_id = excluded.billing_account_id,
    account = excluded.account,
    payment_method = excluded.payment_method,
    management_url = excluded.management_url,
    notes = excluded.notes,
    archived = excluded.archived,
    updated_at = excluded.updated_at
RETURNING *;

-- name: RenewSubscription :one
UPDATE subscriptions SET due_date = ?, updated_at = ? WHERE id = ? AND due_date = ? AND archived = 0 RETURNING *;

-- name: DeleteSubscription :execrows
DELETE FROM subscriptions WHERE id = ?;

-- name: GetPreferences :one
SELECT base_currency, rates_json, rates_updated_at FROM preferences WHERE id = 1;

-- name: SavePreferences :exec
UPDATE preferences SET base_currency = ?, rates_json = ?, rates_updated_at = ? WHERE id = 1;
