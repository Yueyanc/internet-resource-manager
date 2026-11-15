-- +goose Up
UPDATE server_agents SET interval_sec = 5 WHERE mode = 'daemon' AND interval_sec = 20;

-- +goose Down
UPDATE server_agents SET interval_sec = 20 WHERE mode = 'daemon' AND interval_sec = 5;
