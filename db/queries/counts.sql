-- name: GetCounts :one
SELECT (SELECT count(*) FROM subscriptions WHERE archived = 0) AS subscriptions,
       (SELECT count(*) FROM accounts WHERE archived = 0) AS accounts,
       (SELECT count(*) FROM domains WHERE archived = 0) AS domains,
       (SELECT count(*) FROM ips WHERE archived = 0) AS ips,
       (SELECT count(*) FROM servers WHERE archived = 0) AS servers;
