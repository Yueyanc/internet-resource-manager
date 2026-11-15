-- +goose Up
CREATE TABLE vault_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    kdf_salt TEXT NOT NULL,
    kdf_iterations INTEGER NOT NULL,
    wrapped_vault_key TEXT NOT NULL,
    recovery_salt TEXT NOT NULL,
    wrapped_recovery_key TEXT NOT NULL,
    key_version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE account_secrets (
    account_id TEXT PRIMARY KEY NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    key_version INTEGER NOT NULL DEFAULT 1,
    ciphertext TEXT NOT NULL,
    has_password INTEGER NOT NULL DEFAULT 0,
    has_totp INTEGER NOT NULL DEFAULT 0,
    has_recovery_codes INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);

-- +goose Down
DROP TABLE account_secrets;
DROP TABLE vault_config;
