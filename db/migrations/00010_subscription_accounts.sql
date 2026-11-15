-- +goose Up
ALTER TABLE subscriptions ADD COLUMN account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE subscriptions ADD COLUMN billing_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL;
CREATE INDEX idx_subscriptions_account ON subscriptions(account_id);
CREATE INDEX idx_subscriptions_billing_account ON subscriptions(billing_account_id);

-- +goose Down
DROP INDEX IF EXISTS idx_subscriptions_billing_account;
DROP INDEX IF EXISTS idx_subscriptions_account;
ALTER TABLE subscriptions DROP COLUMN billing_account_id;
ALTER TABLE subscriptions DROP COLUMN account_id;
