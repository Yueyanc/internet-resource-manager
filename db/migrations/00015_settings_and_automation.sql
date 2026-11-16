-- +goose Up
ALTER TABLE sessions ADD COLUMN user_agent TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN ip_address TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN created_at TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN last_seen_at TEXT NOT NULL DEFAULT '';

ALTER TABLE preferences ADD COLUMN rates_updated_at TEXT NOT NULL DEFAULT '';

CREATE TABLE automation_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    config_json TEXT NOT NULL,
    secret_ciphertext BLOB NOT NULL DEFAULT x'',
    secret_nonce BLOB NOT NULL DEFAULT x'',
    state_json TEXT NOT NULL DEFAULT '{}',
    last_run_at TEXT NOT NULL DEFAULT '',
    last_status TEXT NOT NULL DEFAULT '',
    last_error TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT ''
);

INSERT INTO automation_settings (id, config_json, state_json)
VALUES (
    1,
    '{"expiryLeadDays":14,"dailyDigestHour":9,"notifyOnServerOffline":true,"trafficAlertThresholdPct":85,"autoAdvanceSubscriptions":true,"autoSyncEnabled":true,"autoSyncIntervalHours":6,"telegramEnabled":false,"telegramChatId":"","barkEnabled":false,"barkServerUrl":"https://api.day.app","webhookEnabled":false}',
    '{}'
);

-- +goose Down
DROP TABLE IF EXISTS automation_settings;

ALTER TABLE preferences DROP COLUMN rates_updated_at;

ALTER TABLE sessions DROP COLUMN last_seen_at;
ALTER TABLE sessions DROP COLUMN created_at;
ALTER TABLE sessions DROP COLUMN ip_address;
ALTER TABLE sessions DROP COLUMN user_agent;
