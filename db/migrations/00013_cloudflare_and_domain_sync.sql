-- +goose Up
CREATE TABLE provider_connections (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
    token_hint TEXT NOT NULL DEFAULT '',
    secret_ciphertext BLOB NOT NULL,
    secret_nonce BLOB NOT NULL,
    scopes_json TEXT NOT NULL DEFAULT '[]',
    external_account_name TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'ok',
    last_synced_at TEXT NOT NULL DEFAULT '',
    last_error TEXT NOT NULL DEFAULT '',
    stats_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_provider_connections_provider ON provider_connections(provider);
CREATE INDEX idx_provider_connections_account ON provider_connections(account_id);

ALTER TABLE domains ADD COLUMN provider_connection_id TEXT REFERENCES provider_connections(id) ON DELETE SET NULL;
ALTER TABLE domains ADD COLUMN external_zone_id TEXT NOT NULL DEFAULT '';
ALTER TABLE domains ADD COLUMN dns_records_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE domains ADD COLUMN edge_meta_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE domains ADD COLUMN lookup_source TEXT NOT NULL DEFAULT '';
ALTER TABLE domains ADD COLUMN lookup_checked_at TEXT NOT NULL DEFAULT '';
ALTER TABLE domains ADD COLUMN lookup_error TEXT NOT NULL DEFAULT '';

CREATE INDEX idx_domains_provider_connection ON domains(provider_connection_id);

-- +goose Down
DROP INDEX IF EXISTS idx_domains_provider_connection;
ALTER TABLE domains DROP COLUMN lookup_error;
ALTER TABLE domains DROP COLUMN lookup_checked_at;
ALTER TABLE domains DROP COLUMN lookup_source;
ALTER TABLE domains DROP COLUMN edge_meta_json;
ALTER TABLE domains DROP COLUMN dns_records_json;
ALTER TABLE domains DROP COLUMN external_zone_id;
ALTER TABLE domains DROP COLUMN provider_connection_id;
DROP INDEX IF EXISTS idx_provider_connections_account;
DROP INDEX IF EXISTS idx_provider_connections_provider;
DROP TABLE IF EXISTS provider_connections;
