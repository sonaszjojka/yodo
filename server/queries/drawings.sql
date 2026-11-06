-- name: ListDrawings :many
-- ListDrawings returns every live drawing's summary, without documents (ADR 0046).
SELECT id, name, created_at, updated_at, folder_id, deleted_at
FROM drawings
WHERE deleted_at IS NULL;

-- name: ListTrashedDrawings :many
-- ListTrashedDrawings returns the summaries of the drawings in Trash.
SELECT id, name, created_at, updated_at, folder_id, deleted_at
FROM drawings
WHERE deleted_at IS NOT NULL;

-- name: GetDrawingDocument :one
-- GetDrawingDocument returns the stored document JSON.
SELECT document
FROM drawings
WHERE id = ?;

-- name: UpsertDrawing :one
-- UpsertDrawing inserts or replaces a drawing in one statement, so created_at
-- survives a replace without a read-then-write race (ADR 0030). deleted_at is
-- not in the update set: auto-save keeps a trashed drawing in Trash (ADR 0046).
INSERT INTO drawings (id, name, schema_version, document, created_at, updated_at)
VALUES (@id, @name, @schema_version, @document, @now, @now)
ON CONFLICT (id) DO UPDATE SET
    name           = excluded.name,
    schema_version = excluded.schema_version,
    document       = excluded.document,
    updated_at     = excluded.updated_at
RETURNING id, name, created_at, updated_at, folder_id, deleted_at;

-- name: DeleteDrawing :exec
-- DeleteDrawing removes a drawing; a missing id is not an error.
DELETE FROM drawings
WHERE id = ?;

-- name: SetDrawingFolder :one
-- SetDrawingFolder moves a drawing into a folder, or out of any folder when
-- folder_id is NULL. It leaves updated_at alone: moving is not editing (ADR 0045).
UPDATE drawings
SET folder_id = @folder_id
WHERE id = @id
RETURNING id, name, created_at, updated_at, folder_id, deleted_at;

-- name: TrashDrawing :one
-- TrashDrawing moves a drawing to Trash. Like a move, it leaves updated_at
-- alone; a drawing already in Trash keeps its first deleted_at (ADR 0046).
UPDATE drawings
SET deleted_at = COALESCE(deleted_at, @now)
WHERE id = @id
RETURNING id, name, created_at, updated_at, folder_id, deleted_at;

-- name: RestoreDrawing :one
-- RestoreDrawing takes a drawing out of Trash; a live drawing is unchanged.
UPDATE drawings
SET deleted_at = NULL
WHERE id = @id
RETURNING id, name, created_at, updated_at, folder_id, deleted_at;

-- name: DeleteTrashedDrawings :exec
-- DeleteTrashedDrawings removes every drawing in Trash (empty Trash).
DELETE FROM drawings
WHERE deleted_at IS NOT NULL;

-- name: DeleteTrashedDrawingsBefore :exec
-- DeleteTrashedDrawingsBefore removes the drawings trashed before @cutoff. One
-- statement, so a drawing restored a moment ago is never removed by a stale
-- caller (ADR 0046).
DELETE FROM drawings
WHERE deleted_at IS NOT NULL
  AND deleted_at < @cutoff;
