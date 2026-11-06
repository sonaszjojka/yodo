// What Home shows for the selected folder (ADR 0045). Pure, so it is tested
// without React.

import type { Folder } from '../storage/folders.ts'
import type { DrawingSummary } from '../storage/repository.ts'

/** The drawings to list: every drawing, or only those in one folder. */
export function drawingsInView(
  drawings: readonly DrawingSummary[],
  folderId: string | undefined,
): DrawingSummary[] {
  return folderId === undefined
    ? [...drawings]
    : drawings.filter((d) => d.folderId === folderId)
}

/** How many drawings each folder holds; a folder with none is absent. */
export function folderCounts(
  drawings: readonly DrawingSummary[],
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const { folderId } of drawings) {
    if (folderId !== undefined)
      counts.set(folderId, (counts.get(folderId) ?? 0) + 1)
  }
  return counts
}

/** The folder a drawing is in, if it still exists. */
export function folderOf(
  drawing: DrawingSummary,
  folders: readonly Folder[],
): Folder | undefined {
  return drawing.folderId === undefined
    ? undefined
    : folders.find((f) => f.id === drawing.folderId)
}

/** The confirmation text for deleting a folder, which deletes its drawings (ADR 0045). */
export function deleteFolderMessage(name: string, count: number): string {
  if (count === 0) return `Delete the folder “${name}”? It has no drawings.`
  const drawings = count === 1 ? '1 drawing' : `${count} drawings`
  return `Delete the folder “${name}” and its ${drawings}? This can’t be undone.`
}

/** The folder the route names, or undefined for All drawings or a folder that is gone. */
export function activeFolder(
  folders: readonly Folder[],
  folderId: string | undefined,
): Folder | undefined {
  return folderId === undefined
    ? undefined
    : folders.find((f) => f.id === folderId)
}
