-- +goose Up
ALTER TABLE servers ADD COLUMN provider_connection_id TEXT REFERENCES provider_connections(id) ON DELETE SET NULL;
ALTER TABLE servers ADD COLUMN external_id TEXT NOT NULL DEFAULT '';
ALTER TABLE servers ADD COLUMN provider_meta_json TEXT NOT NULL DEFAULT '{}';

CREATE INDEX idx_servers_provider_connection ON servers(provider_connection_id);

ALTER TABLE ips ADD COLUMN provider_connection_id TEXT REFERENCES provider_connections(id) ON DELETE SET NULL;
ALTER TABLE ips ADD COLUMN external_id TEXT NOT NULL DEFAULT '';

CREATE INDEX idx_ips_provider_connection ON ips(provider_connection_id);

-- +goose Down
DROP INDEX IF EXISTS idx_ips_provider_connection;
ALTER TABLE ips DROP COLUMN external_id;
ALTER TABLE ips DROP COLUMN provider_connection_id;

DROP INDEX IF EXISTS idx_servers_provider_connection;
ALTER TABLE servers DROP COLUMN provider_meta_json;
ALTER TABLE servers DROP COLUMN external_id;
ALTER TABLE servers DROP COLUMN provider_connection_id;
