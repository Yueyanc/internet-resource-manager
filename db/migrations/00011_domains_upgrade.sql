-- +goose Up
ALTER TABLE domains ADD COLUMN preset_key TEXT NOT NULL DEFAULT '';
ALTER TABLE domains ADD COLUMN registrar TEXT NOT NULL DEFAULT '';
ALTER TABLE domains ADD COLUMN dns_provider TEXT NOT NULL DEFAULT '';
ALTER TABLE domains ADD COLUMN purpose TEXT NOT NULL DEFAULT 'prod';
ALTER TABLE domains ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE domains ADD COLUMN expire_date TEXT NOT NULL DEFAULT '';
ALTER TABLE domains ADD COLUMN auto_renew INTEGER NOT NULL DEFAULT 1;
ALTER TABLE domains ADD COLUMN whois_privacy INTEGER NOT NULL DEFAULT 1;
ALTER TABLE domains ADD COLUMN icp_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE domains ADD COLUMN icp_number TEXT NOT NULL DEFAULT '';
ALTER TABLE domains ADD COLUMN management_url TEXT NOT NULL DEFAULT '';
ALTER TABLE domains ADD COLUMN subscription_id TEXT REFERENCES subscriptions(id) ON DELETE SET NULL;
ALTER TABLE domains ADD COLUMN registrar_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE domains ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE domains ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE domains ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';

UPDATE domains SET updated_at = created_at WHERE updated_at = '';

CREATE INDEX idx_domains_subscription ON domains(subscription_id);
CREATE INDEX idx_domains_registrar_account ON domains(registrar_account_id);

-- +goose Down
DROP INDEX IF EXISTS idx_domains_registrar_account;
DROP INDEX IF EXISTS idx_domains_subscription;
ALTER TABLE domains DROP COLUMN updated_at;
ALTER TABLE domains DROP COLUMN archived;
ALTER TABLE domains DROP COLUMN tags_json;
ALTER TABLE domains DROP COLUMN registrar_account_id;
ALTER TABLE domains DROP COLUMN subscription_id;
ALTER TABLE domains DROP COLUMN management_url;
ALTER TABLE domains DROP COLUMN icp_number;
ALTER TABLE domains DROP COLUMN icp_status;
ALTER TABLE domains DROP COLUMN whois_privacy;
ALTER TABLE domains DROP COLUMN auto_renew;
ALTER TABLE domains DROP COLUMN expire_date;
ALTER TABLE domains DROP COLUMN status;
ALTER TABLE domains DROP COLUMN purpose;
ALTER TABLE domains DROP COLUMN dns_provider;
ALTER TABLE domains DROP COLUMN registrar;
ALTER TABLE domains DROP COLUMN preset_key;
