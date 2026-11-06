-- name: ListFolders :many
-- ListFolders returns every folder.
SELECT id, name, icon, color, created_at
FROM folders;

-- name: UpsertFolder :one
-- UpsertFolder inserts or replaces a folder in one statement; created_at
-- survives a replace (ADR 0045).
INSERT INTO folders (id, name, icon, color, created_at)
VALUES (@id, @name, @icon, @color, @now)
ON CONFLICT (id) DO UPDATE SET
    name  = excluded.name,
    icon  = excluded.icon,
    color = excluded.color
RETURNING id, name, icon, color, created_at;

-- name: TrashFolderDrawings :exec
-- TrashFolderDrawings sends a folder's drawings to Trash and takes them out of
-- the folder, so a restore never points at a missing one. Drawings already in
-- Trash keep their deleted_at (ADR 0046).
UPDATE drawings
SET deleted_at = COALESCE(deleted_at, @now),
    folder_id  = NULL
WHERE folder_id = @folder_id;

-- name: DeleteFolder :exec
-- DeleteFolder removes a folder; a missing id is not an error. Its drawings
-- must already be out of it (TrashFolderDrawings): ON DELETE CASCADE would
-- delete any that are left (ADR 0045, 0046).
DELETE FROM folders
WHERE id = ?;
