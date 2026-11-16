-- name: GetAdministrator :one
SELECT username, password_hash FROM administrator WHERE id = 1;

-- name: CreateAdministrator :exec
INSERT INTO administrator (id, username, password_hash) VALUES (1, ?, ?);

-- name: UpdateAdministrator :exec
UPDATE administrator SET username = ?, password_hash = ? WHERE id = 1;

-- name: CreateSession :exec
INSERT INTO sessions (token_hash, expires_at, user_agent, ip_address, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?);

-- name: FindSession :one
SELECT token_hash, last_seen_at FROM sessions WHERE token_hash = ? AND expires_at > ?;

-- name: TouchSession :exec
UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?;

-- name: ListActiveSessions :many
SELECT token_hash, expires_at, user_agent, ip_address, created_at, last_seen_at
FROM sessions
WHERE expires_at > ?
ORDER BY last_seen_at DESC, expires_at DESC;

-- name: DeleteSession :exec
DELETE FROM sessions WHERE token_hash = ?;

-- name: DeleteSessionByPrefix :execrows
DELETE FROM sessions WHERE substr(token_hash, 1, 16) = ? AND token_hash != ?;

-- name: DeleteOtherSessions :execrows
DELETE FROM sessions WHERE token_hash != ?;

-- name: PruneSessions :exec
DELETE FROM sessions WHERE expires_at <= ?;
