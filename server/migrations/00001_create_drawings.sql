-- +goose Up
-- Drawings as opaque JSON documents plus the metadata the API returns
-- (ADR 0013, 0030). Timestamps are epoch milliseconds, like DrawingSummary.
CREATE TABLE drawings (
    id             TEXT    PRIMARY KEY NOT NULL,
    name           TEXT    NOT NULL,
    schema_version INTEGER NOT NULL,
    document       TEXT    NOT NULL,
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL
) STRICT;

-- +goose Down
DROP TABLE drawings;
