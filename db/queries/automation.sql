-- name: GetAutomationSettings :one
SELECT * FROM automation_settings WHERE id = 1;

-- name: SaveAutomationConfig :exec
UPDATE automation_settings
SET config_json = ?, secret_ciphertext = ?, secret_nonce = ?, updated_at = ?
WHERE id = 1;

-- name: UpdateAutomationRunState :exec
UPDATE automation_settings
SET state_json = ?, last_run_at = ?, last_status = ?, last_error = ?
WHERE id = 1;
