// Folders and their repository (ADR 0045). A drawing's folder is metadata on
// its summary (`DrawingSummary.folderId`), not part of the document; the
// folders themselves live behind this interface, like drawings do (ADR 0005).

import { randomId } from '../core/document/create.ts'

/** Folder colours: the drawing palette's stroke names (`docs/ui.md`). */
export const FOLDER_COLORS = [
  'ink',
  'graphite',
  'brick',
  'amber',
  'green',
  'teal',
  'blue',
  'violet',
] as const
export type FolderColor = (typeof FOLDER_COLORS)[number]

/** Folder icons: keys the UI maps to Phosphor icons (ADR 0028). */
export const FOLDER_ICONS = [
  'folder',
  'briefcase',
  'house',
  'book',
  'star',
  'heart',
  'lightbulb',
  'code',
  'palette',
  'camera',
  'music-notes',
  'rocket',
] as const
export type FolderIcon = (typeof FOLDER_ICONS)[number]

export const DEFAULT_FOLDER_ICON: FolderIcon = 'folder'
export const DEFAULT_FOLDER_COLOR: FolderColor = 'graphite'

/** The longest folder name the server accepts. */
export const MAX_FOLDER_NAME_LENGTH = 200

export interface Folder {
  id: string
  name: string
  /** A `FolderIcon`; anything else is shown as the default icon. */
  icon: string
  /** A `FolderColor`; anything else is shown as the default colour. */
  color: string
  /** Epoch milliseconds of the first save. */
  createdAt: number
}

/** What the UI chooses; the repository adds `createdAt`. */
export type FolderInput = Omit<Folder, 'createdAt'>

export interface FolderRepository {
  /** Every folder, in no particular order. */
  list(): Promise<Folder[]>
  /** Inserts or replaces the folder `folder.id`; keeps its `createdAt`. */
  save(folder: FolderInput): Promise<Folder>
  /**
   * Removes the folder and every drawing in it (ADR 0045); removing a
   * missing id is not an error.
   */
  delete(id: string): Promise<void>
}

/** A folder name as stored: trimmed. Empty means the name is not usable. */
export function cleanFolderName(name: string): string {
  return name.trim().slice(0, MAX_FOLDER_NAME_LENGTH)
}

/** Creates a folder with a fresh id. Resolves undefined for an empty name. */
export async function createFolder(
  repository: FolderRepository,
  {
    name,
    icon = DEFAULT_FOLDER_ICON,
    color = DEFAULT_FOLDER_COLOR,
  }: { name: string; icon?: string; color?: string },
): Promise<Folder | undefined> {
  const clean = cleanFolderName(name)
  if (!clean) return undefined
  return repository.save({ id: randomId(), name: clean, icon, color })
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base' })

/** A copy sorted by name; ties fall back to the id, so the order never flickers. */
export function sortFolders(folders: readonly Folder[]): Folder[] {
  return folders.toSorted(
    (a, b) =>
      collator.compare(a.name, b.name) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
}
