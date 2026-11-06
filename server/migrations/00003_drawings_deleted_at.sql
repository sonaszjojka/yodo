-- +goose Up
-- Trash (ADR 0046): a trashed drawing keeps its row, document and folder and
-- gets the epoch-millisecond time it was trashed. NULL means live, so existing
-- drawings stay where they are.
ALTER TABLE drawings ADD COLUMN deleted_at INTEGER;

CREATE INDEX drawings_deleted_at ON drawings (deleted_at);

-- +goose Down
DROP INDEX drawings_deleted_at;

ALTER TABLE drawings DROP COLUMN deleted_at;
