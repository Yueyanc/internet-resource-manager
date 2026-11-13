-- name: ListDomains :many
SELECT id, name, notes, created_at FROM domains ORDER BY created_at DESC, id DESC;

-- name: CreateDomain :one
INSERT INTO domains (id, name, notes, created_at) VALUES (?, ?, ?, ?)
RETURNING id, name, notes, created_at;

-- name: DeleteDomain :execrows
DELETE FROM domains WHERE id = ?;
