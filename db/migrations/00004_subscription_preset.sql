-- +goose Up
ALTER TABLE subscriptions ADD COLUMN preset_key TEXT NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE subscriptions DROP COLUMN preset_key;
