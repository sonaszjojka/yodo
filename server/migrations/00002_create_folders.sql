-- +goose Up
-- Folders and a drawing's membership (ADR 0045). Deleting a folder deletes its
-- drawings (ON DELETE CASCADE; foreign_keys is on for every connection, ADR 0010).
-- icon and color are keys the client defines, so the server stores them as text.
CREATE TABLE folders (
    id         TEXT    PRIMARY KEY NOT NULL,
    name       TEXT    NOT NULL,
    icon       TEXT    NOT NULL,
    color      TEXT    NOT NULL,
    created_at INTEGER NOT NULL
) STRICT;

ALTER TABLE drawings ADD COLUMN folder_id TEXT REFERENCES folders (id) ON DELETE CASCADE;

CREATE INDEX drawings_folder_id ON drawings (folder_id);

-- +goose Down
-- SQLite cannot drop a column that carries a foreign key, so rebuild the table.
DROP INDEX drawings_folder_id;

CREATE TABLE drawings_old (
    id             TEXT    PRIMARY KEY NOT NULL,
    name           TEXT    NOT NULL,
    schema_version INTEGER NOT NULL,
    document       TEXT    NOT NULL,
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL
) STRICT;

INSERT INTO drawings_old (id, name, schema_version, document, created_at, updated_at)
SELECT id, name, schema_version, document, created_at, updated_at FROM drawings;

DROP TABLE drawings;
ALTER TABLE drawings_old RENAME TO drawings;
DROP TABLE folders;
