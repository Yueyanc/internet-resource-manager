-- +goose Up
CREATE TABLE subscriptions (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
    currency TEXT NOT NULL,
    cycle TEXT NOT NULL,
    interval_days INTEGER NOT NULL DEFAULT 0,
    due_date TEXT NOT NULL,
    category TEXT NOT NULL,
    renewal_mode TEXT NOT NULL,
    intention TEXT NOT NULL,
    renewal_amount_minor INTEGER NOT NULL DEFAULT 0,
    account TEXT NOT NULL DEFAULT '',
    payment_method TEXT NOT NULL DEFAULT '',
    management_url TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE preferences (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    base_currency TEXT NOT NULL,
    rates_json TEXT NOT NULL
);
INSERT INTO preferences VALUES (1, 'CNY', '{"CNY":1,"USD":7.2,"HKD":0.92,"EUR":7.8,"GBP":9.2,"JPY":0.048}');

-- +goose Down
DROP TABLE preferences;
DROP TABLE subscriptions;
