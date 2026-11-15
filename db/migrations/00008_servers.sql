-- +goose Up
CREATE TABLE servers (
    id TEXT PRIMARY KEY NOT NULL,
    preset_key TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    hostname TEXT NOT NULL DEFAULT '',
    provider TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT 'vps',
    status TEXT NOT NULL DEFAULT 'active',
    region TEXT NOT NULL DEFAULT 'HK',
    datacenter TEXT NOT NULL DEFAULT '',
    os TEXT NOT NULL DEFAULT '',
    arch TEXT NOT NULL DEFAULT 'amd64',
    cpu_cores INTEGER NOT NULL DEFAULT 0 CHECK (cpu_cores >= 0),
    memory_mb INTEGER NOT NULL DEFAULT 0 CHECK (memory_mb >= 0),
    disk_gb INTEGER NOT NULL DEFAULT 0 CHECK (disk_gb >= 0),
    disk_type TEXT NOT NULL DEFAULT '',
    bandwidth_mbps INTEGER NOT NULL DEFAULT 0 CHECK (bandwidth_mbps >= 0),
    traffic_gb INTEGER NOT NULL DEFAULT 0 CHECK (traffic_gb >= 0),
    traffic_rule TEXT NOT NULL DEFAULT 'both',
    traffic_reset_day INTEGER NOT NULL DEFAULT 0 CHECK (traffic_reset_day >= 0 AND traffic_reset_day <= 31),
    ipv4 TEXT NOT NULL DEFAULT '',
    ipv6 TEXT NOT NULL DEFAULT '',
    private_ip TEXT NOT NULL DEFAULT '',
    port_note TEXT NOT NULL DEFAULT '',
    ssh_port INTEGER NOT NULL DEFAULT 22 CHECK (ssh_port >= 0 AND ssh_port <= 65535),
    ssh_user TEXT NOT NULL DEFAULT '',
    console_url TEXT NOT NULL DEFAULT '',
    subscription_id TEXT REFERENCES subscriptions(id) ON DELETE SET NULL,
    account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
    expire_date TEXT NOT NULL DEFAULT '',
    tags_json TEXT NOT NULL DEFAULT '[]',
    notes TEXT NOT NULL DEFAULT '',
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE server_domains (
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (server_id, domain_id)
);

CREATE INDEX idx_servers_subscription ON servers(subscription_id);
CREATE INDEX idx_servers_account ON servers(account_id);
CREATE INDEX idx_server_domains_domain ON server_domains(domain_id);
CREATE INDEX idx_ips_server ON ips(server_id);

-- +goose Down
DROP INDEX IF EXISTS idx_ips_server;
DROP INDEX IF EXISTS idx_server_domains_domain;
DROP INDEX IF EXISTS idx_servers_account;
DROP INDEX IF EXISTS idx_servers_subscription;
DROP TABLE IF EXISTS server_domains;
DROP TABLE IF EXISTS servers;
