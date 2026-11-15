-- +goose Up
CREATE TABLE accounts (
    id TEXT PRIMARY KEY NOT NULL,
    preset_key TEXT NOT NULL DEFAULT '',
    platform TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    identifier TEXT NOT NULL,
    uid TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL,
    ecosystem TEXT NOT NULL,
    region TEXT NOT NULL DEFAULT 'GLOBAL',
    role TEXT NOT NULL DEFAULT 'primary',
    status TEXT NOT NULL DEFAULT 'active',
    auth_method TEXT NOT NULL DEFAULT 'password',
    recovery_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
    recovery_email TEXT NOT NULL DEFAULT '',
    sso_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
    phone_hint TEXT NOT NULL DEFAULT '',
    two_factor TEXT NOT NULL DEFAULT 'none',
    recovery_codes TEXT NOT NULL DEFAULT 'not_applicable',
    kyc_status TEXT NOT NULL DEFAULT 'none',
    kyc_note TEXT NOT NULL DEFAULT '',
    keepalive_cycle TEXT NOT NULL DEFAULT 'none',
    keepalive_days INTEGER NOT NULL DEFAULT 0,
    next_checkin_date TEXT NOT NULL DEFAULT '',
    last_checked_at TEXT NOT NULL DEFAULT '',
    vault_reference TEXT NOT NULL DEFAULT '',
    security_url TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX idx_accounts_recovery ON accounts(recovery_account_id);
CREATE INDEX idx_accounts_sso ON accounts(sso_account_id);

-- +goose Down
DROP INDEX IF EXISTS idx_accounts_sso;
DROP INDEX IF EXISTS idx_accounts_recovery;
DROP TABLE accounts;
