-- name: ListDrawings :many
-- ListDrawings returns every live drawing's summary, without documents (ADR 0046).
SELECT id, name, created_at, updated_at, folder_id, deleted_at, revision
FROM drawings
WHERE deleted_at IS NULL;

-- name: ListTrashedDrawings :many
-- ListTrashedDrawings returns the summaries of the drawings in Trash.
SELECT id, name, created_at, updated_at, folder_id, deleted_at, revision
FROM drawings
WHERE deleted_at IS NOT NULL;

-- name: GetDrawingDocument :one
-- GetDrawingDocument returns the stored document JSON and its revision, read
-- together so the ETag always describes the body (ADR 0062).
SELECT document, revision
FROM drawings
WHERE id = ?;

-- name: GetDrawingRevision :one
-- GetDrawingRevision returns a drawing's revision without its document, for
-- HEAD and for the ETag of a 412 (ADR 0062).
SELECT revision
FROM drawings
WHERE id = ?;

-- name: UpsertDrawing :one
-- UpsertDrawing inserts or replaces a drawing in one statement, so created_at
-- survives a replace without a read-then-write race (ADR 0030). deleted_at is
-- not in the update set: auto-save keeps a trashed drawing in Trash (ADR 0046).
-- search_text is replaced with the request's value, NULL when the client sent
-- none, so the index never describes an older document (ADR 0047).
-- revision starts at 1 and goes up by one on every replace (ADR 0062).
INSERT INTO drawings (id, name, schema_version, document, created_at, updated_at, search_text, revision)
VALUES (@id, @name, @schema_version, @document, @now, @now, sqlc.narg('search_text'), 1)
ON CONFLICT (id) DO UPDATE SET
    name           = excluded.name,
    schema_version = excluded.schema_version,
    document       = excluded.document,
    updated_at     = excluded.updated_at,
    search_text    = excluded.search_text,
    revision       = drawings.revision + 1
RETURNING id, name, created_at, updated_at, folder_id, deleted_at, revision;

-- name: UpdateDrawingIfRevision :one
-- UpdateDrawingIfRevision replaces a drawing only if it is still at
-- @expected_revision: the check and the write are one statement, so two
-- conditional saves can never both succeed (ADR 0062). No row means a
-- conflict or a missing drawing. Like UpsertDrawing, it keeps created_at,
-- the folder and deleted_at.
UPDATE drawings
SET name           = @name,
    schema_version = @schema_version,
    document       = @document,
    updated_at     = @now,
    search_text    = sqlc.narg('search_text'),
    revision       = revision + 1
WHERE id = @id AND revision = @expected_revision
RETURNING id, name, created_at, updated_at, folder_id, deleted_at, revision;

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
RETURNING id, name, created_at, updated_at, folder_id, deleted_at, revision;

-- name: TrashDrawing :one
-- TrashDrawing moves a drawing to Trash. Like a move, it leaves updated_at
-- alone; a drawing already in Trash keeps its first deleted_at (ADR 0046).
UPDATE drawings
SET deleted_at = COALESCE(deleted_at, @now)
WHERE id = @id
RETURNING id, name, created_at, updated_at, folder_id, deleted_at, revision;

-- name: RestoreDrawing :one
-- RestoreDrawing takes a drawing out of Trash; a live drawing is unchanged.
UPDATE drawings
SET deleted_at = NULL
WHERE id = @id
RETURNING id, name, created_at, updated_at, folder_id, deleted_at, revision;

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

-- name: ListSearchIndex :many
-- ListSearchIndex returns the canvas text of every live drawing, NULL for one
-- that is not indexed yet (ADR 0047).
SELECT id, search_text
FROM drawings
WHERE deleted_at IS NULL;

-- name: SetSearchText :execrows
-- SetSearchText sets a drawing's canvas text and nothing else, so updated_at
-- stays: indexing is not editing (ADR 0047).
UPDATE drawings
SET search_text = @search_text
WHERE id = @id;

-- name: SetSearchTextIfUnset :exec
-- SetSearchTextIfUnset is the backfill: it never overwrites text that a save
-- stored meanwhile (ADR 0047).
UPDATE drawings
SET search_text = @search_text
WHERE id = @id AND search_text IS NULL;
