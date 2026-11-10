-- +goose Up
-- A drawing's revision for safe concurrent saves (ADR 0062): 1 on the first
-- save, +1 on every save, unchanged by a move, trash or restore. Existing rows
-- start at 1.
ALTER TABLE drawings ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;

-- +goose Down
ALTER TABLE drawings DROP COLUMN revision;
