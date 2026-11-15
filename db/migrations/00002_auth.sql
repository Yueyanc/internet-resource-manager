-- +goose Up
CREATE TABLE administrator (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL
);
CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY NOT NULL,
    expires_at INTEGER NOT NULL
);

-- +goose Down
DROP TABLE sessions;
DROP TABLE administrator;
