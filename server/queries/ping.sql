-- name: Ping :one
-- Ping runs a trivial query to check that the database answers.
SELECT 1;

-- sqlc needs at least one query to generate code; this one touches no table,
-- so the schema can stay empty. Remove it once real queries exist (roadmap 1.12).
