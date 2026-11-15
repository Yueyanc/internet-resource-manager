-- name: GetAdministrator :one
SELECT username, password_hash FROM administrator WHERE id = 1;

-- name: CreateAdministrator :exec
INSERT INTO administrator (id, username, password_hash) VALUES (1, ?, ?);

-- name: CreateSession :exec
INSERT INTO sessions (token_hash, expires_at) VALUES (?, ?);

-- name: FindSession :one
SELECT token_hash FROM sessions WHERE token_hash = ? AND expires_at > ?;

-- name: DeleteSession :exec
DELETE FROM sessions WHERE token_hash = ?;

-- name: PruneSessions :exec
DELETE FROM sessions WHERE expires_at <= ?;
