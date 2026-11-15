-- +goose Up
CREATE TABLE ips (
    id TEXT PRIMARY KEY NOT NULL,
    preset_key TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL UNIQUE,
    version INTEGER NOT NULL CHECK (version IN (4, 6)),
    prefix_len INTEGER NOT NULL CHECK (prefix_len >= 1 AND prefix_len <= 128),
    network_scope TEXT NOT NULL DEFAULT 'overseas_exit',
    category TEXT NOT NULL DEFAULT 'cloud_vps',
    provider TEXT NOT NULL DEFAULT '',
    label TEXT NOT NULL DEFAULT '',
    region TEXT NOT NULL DEFAULT 'US',
    city TEXT NOT NULL DEFAULT '',
    asn INTEGER NOT NULL DEFAULT 0,
    asn_org TEXT NOT NULL DEFAULT '',
    ptr_record TEXT NOT NULL DEFAULT '',
    asn_type TEXT NOT NULL DEFAULT 'hosting',
    origin_type TEXT NOT NULL DEFAULT 'unknown',
    risk_level TEXT NOT NULL DEFAULT 'unassessed',
    purity_note TEXT NOT NULL DEFAULT '',
    unlocks_json TEXT NOT NULL DEFAULT '{}',
    tags_json TEXT NOT NULL DEFAULT '[]',
    manual_locks_json TEXT NOT NULL DEFAULT '[]',
    lookup_source TEXT NOT NULL DEFAULT '',
    lookup_checked_at TEXT NOT NULL DEFAULT '',
    lookup_error TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'primary',
    status TEXT NOT NULL DEFAULT 'active',
    review_cycle TEXT NOT NULL DEFAULT 'none',
    review_days INTEGER NOT NULL DEFAULT 0,
    next_review_date TEXT NOT NULL DEFAULT '',
    last_reviewed_at TEXT NOT NULL DEFAULT '',
    probe_mode TEXT NOT NULL DEFAULT 'none',
    probe_port INTEGER NOT NULL DEFAULT 0,
    probe_status TEXT NOT NULL DEFAULT 'unchecked',
    probe_latency_ms INTEGER NOT NULL DEFAULT 0,
    probe_checked_at TEXT NOT NULL DEFAULT '',
    probe_error TEXT NOT NULL DEFAULT '',
    subscription_id TEXT REFERENCES subscriptions(id) ON DELETE SET NULL,
    server_id TEXT,
    host_label TEXT NOT NULL DEFAULT '',
    console_url TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE ip_domains (
    ip_id TEXT NOT NULL REFERENCES ips(id) ON DELETE CASCADE,
    domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (ip_id, domain_id)
);

CREATE TABLE ip_accounts (
    ip_id TEXT NOT NULL REFERENCES ips(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (ip_id, account_id)
);

CREATE INDEX idx_ips_subscription ON ips(subscription_id);
CREATE INDEX idx_ip_domains_domain ON ip_domains(domain_id);
CREATE INDEX idx_ip_accounts_account ON ip_accounts(account_id);

-- +goose Down
DROP INDEX IF EXISTS idx_ip_accounts_account;
DROP INDEX IF EXISTS idx_ip_domains_domain;
DROP INDEX IF EXISTS idx_ips_subscription;
DROP TABLE IF EXISTS ip_accounts;
DROP TABLE IF EXISTS ip_domains;
DROP TABLE IF EXISTS ips;
