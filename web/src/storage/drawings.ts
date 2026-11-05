// What the Home screen and the editor route do with drawings (ADR 0033), on top
// of `DrawingRepository`. Framework-free, so it's tested without React.

import { createDocument, randomId } from '../core/document/create.ts'
import {
  parseYodoFile,
  serializeYodoFile,
  type YodoFiles,
} from '../core/document/file.ts'
import { DocumentError } from '../core/document/migrate.ts'
import type { YodoDocument } from '../core/document/types.ts'
import { withFileIds } from './autosave.ts'
import { base64ToBlob, blobToBase64 } from './base64.ts'
import {
  decodeSize,
  HASH_PATTERN,
  IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  sha256Hex,
  type ImageRepository,
} from './images.ts'
import type { DrawingRepository, DrawingSummary } from './repository.ts'

export type LoadResult =
  | { status: 'loaded'; document: YodoDocument }
  | { status: 'not-found' }
  | { status: 'error'; error: unknown }

export interface LoadOptions {
  /**
   * A save to wait for first, e.g. the editor that just closed: over HTTP a
   * read could otherwise overtake it and return the older document.
   */
  after?: Promise<unknown>
}

/**
 * Opens one drawing for the editor. A failure is reported, never replaced by
 * a new drawing, so nothing gets saved over or around the stored one (#67).
 */
export async function loadDrawing(
  repository: DrawingRepository,
  id: string,
  { after }: LoadOptions = {},
): Promise<LoadResult> {
  try {
    await after
    const document = await repository.get(id)
    return document ? { status: 'loaded', document } : { status: 'not-found' }
  } catch (error) {
    return { status: 'error', error }
  }
}

/** Saves a new, empty drawing and returns its id, so a reload finds it. */
export async function createDrawing(
  repository: DrawingRepository,
): Promise<string> {
  const document = createDocument()
  await repository.save(document)
  return document.id
}

/**
 * The text of the `.yodo` file for `doc`: the document with its images
 * inlined as base64 (ADR 0013). The images come from `images`; one that is
 * missing fails the export with a `bad-files` error rather than writing a
 * file that cannot be imported.
 */
export async function exportYodo(
  doc: YodoDocument,
  images: ImageRepository,
): Promise<string> {
  // `fileIds` may lag behind the elements until the next save; the elements win.
  const current = withFileIds(doc)
  const files: YodoFiles = {}
  for (const fileId of current.fileIds) {
    const blob = await images.get(fileId)
    if (!blob) {
      throw new DocumentError('bad-files', `Image ${fileId} is not stored`)
    }
    files[fileId] = { mimeType: blob.type, data: await blobToBase64(blob) }
  }
  return serializeYodoFile(current, files)
}

export interface ImportOptions {
  /** Reads an image's size, failing for bytes that are not a picture. Defaults to the browser's decoder. */
  decode?: (blob: Blob) => Promise<{ width: number; height: number }>
}

/**
 * Saves the drawing in a `.yodo` file as a new drawing. It gets a fresh id,
 * so importing your own export never overwrites the original; the rest is as
 * exported. Every image is checked first (type, size, that it decodes, and
 * that its bytes hash to the id the drawing uses) and only then stored, so a
 * bad file leaves nothing behind. Returns the new id and the ids of the
 * images stored. Throws a `DocumentError` for a broken file.
 */
export async function importDrawing(
  repository: DrawingRepository,
  images: ImageRepository,
  text: string,
  { decode = decodeSize }: ImportOptions = {},
): Promise<{ id: string; fileIds: string[] }> {
  const { document, files } = parseYodoFile(text)
  const blobs = await Promise.all(
    Object.entries(files).map(async ([fileId, { mimeType, data }]) => {
      const blob = base64ToBlob(data, mimeType)
      if (
        !(IMAGE_TYPES as readonly string[]).includes(mimeType) ||
        blob.size > MAX_IMAGE_BYTES ||
        !HASH_PATTERN.test(fileId)
      ) {
        throw new DocumentError('bad-files', `Image ${fileId} is not allowed`)
      }
      // Hosted storage would keep any bytes under an image label, so check
      // here that they are a picture, as the server does for its own.
      const size = await decode(blob).catch(() => undefined)
      if (!size || !(size.width > 0 && size.height > 0)) {
        throw new DocumentError('bad-files', `Image ${fileId} is not a picture`)
      }
      if ((await sha256Hex(await blob.arrayBuffer())) !== fileId) {
        throw new DocumentError('bad-files', `Image ${fileId} is damaged`)
      }
      return blob
    }),
  )
  for (const blob of blobs) await images.put(blob)
  const id = randomId()
  await repository.save({ ...document, id })
  return { id, fileIds: Object.keys(files) }
}

/** A safe download name for a drawing: `<name>.yodo`. */
export function yodoFileName(name: string): string {
  // Control characters (code < 32, and DEL) and the characters Windows and
  // macOS forbid in file names become "_".
  const safe = Array.from(name, (char) => {
    const code = char.charCodeAt(0)
    return code < 32 || code === 127 || '/\\:*?"<>|'.includes(char) ? '_' : char
  })
    .join('')
    .trim()
    .replace(/\.+$/, '')
  return `${safe || 'Untitled'}.yodo`
}

/**
 * Renames a stored drawing; the name is trimmed. Resolves undefined, changing
 * nothing, for an empty name or a missing drawing. It saves the whole
 * document, so `updatedAt` moves: a rename counts as an edit.
 */
export async function renameDrawing(
  repository: DrawingRepository,
  id: string,
  name: string,
): Promise<DrawingSummary | undefined> {
  const trimmed = name.trim()
  if (!trimmed) return undefined
  const document = await repository.get(id)
  if (!document) return undefined
  return repository.save({ ...document, name: trimmed })
}

export type DrawingSort = 'recent' | 'name' | 'created'

const collator = new Intl.Collator(undefined, { sensitivity: 'base' })

const COMPARE: Record<
  DrawingSort,
  (a: DrawingSummary, b: DrawingSummary) => number
> = {
  recent: (a, b) => b.updatedAt - a.updatedAt,
  created: (a, b) => b.createdAt - a.createdAt,
  name: (a, b) => collator.compare(a.name, b.name),
}

/** A sorted copy; ties fall back to the id, so the order never flickers. */
export function sortDrawings(
  summaries: readonly DrawingSummary[],
  by: DrawingSort,
): DrawingSummary[] {
  return summaries.toSorted(
    (a, b) => COMPARE[by](a, b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
}
