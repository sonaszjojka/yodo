-- +goose Up
-- The canvas text of a drawing, computed by the client on save (ADR 0047). NULL
-- means "not indexed yet": existing rows stay NULL until the client indexes
-- them, and a save without the text clears the column so it can't go stale.
ALTER TABLE drawings ADD COLUMN search_text TEXT;

-- +goose Down
ALTER TABLE drawings DROP COLUMN search_text;
