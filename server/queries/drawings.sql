-- name: ListDrawings :many
-- ListDrawings returns every drawing's summary, without documents.
SELECT id, name, created_at, updated_at
FROM drawings;

-- name: GetDrawingDocument :one
-- GetDrawingDocument returns the stored document JSON.
SELECT document
FROM drawings
WHERE id = ?;

-- name: UpsertDrawing :one
-- UpsertDrawing inserts or replaces a drawing in one statement, so created_at
-- survives a replace without a read-then-write race (ADR 0030).
INSERT INTO drawings (id, name, schema_version, document, created_at, updated_at)
VALUES (@id, @name, @schema_version, @document, @now, @now)
ON CONFLICT (id) DO UPDATE SET
    name           = excluded.name,
    schema_version = excluded.schema_version,
    document       = excluded.document,
    updated_at     = excluded.updated_at
RETURNING id, name, created_at, updated_at;

-- name: DeleteDrawing :exec
-- DeleteDrawing removes a drawing; a missing id is not an error.
DELETE FROM drawings
WHERE id = ?;
