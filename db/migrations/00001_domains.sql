-- +goose Up
CREATE TABLE domains (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL UNIQUE,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

-- +goose Down
DROP TABLE domains;
