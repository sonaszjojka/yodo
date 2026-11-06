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

-- name: DeleteFolder :exec
-- DeleteFolder removes a folder and, through ON DELETE CASCADE, its drawings;
-- a missing id is not an error.
DELETE FROM folders
WHERE id = ?;
