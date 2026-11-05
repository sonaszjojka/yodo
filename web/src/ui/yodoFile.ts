// What the Export and Import buttons do, apart from the buttons (ADR 0013).

import { DocumentError } from '../core/document/migrate.ts'
import type { YodoDocument } from '../core/document/types.ts'
import {
  exportYodo,
  importDrawing,
  yodoFileName,
  type ImportOptions,
} from '../storage/drawings.ts'
import type { ImageRepository } from '../storage/images.ts'
import type { DrawingRepository } from '../storage/repository.ts'
import type { ImageCache } from './imageCache.ts'
import { downloadText } from './download.ts'

/** Downloads `doc`, with its images, as `<name>.yodo`. Throws if an image is gone. */
export async function exportDrawing(
  doc: YodoDocument,
  images: ImageRepository,
  download: typeof downloadText = downloadText,
): Promise<void> {
  download(
    yodoFileName(doc.name),
    await exportYodo(doc, images),
    'application/json',
  )
}

/**
 * Imports the file's text as a new drawing and returns its id. The shared
 * image cache may have marked one of these pictures as missing earlier, so it
 * is told to look again now that the bytes are stored.
 */
export async function importFile(
  repository: DrawingRepository,
  images: ImageRepository,
  imageCache: ImageCache,
  text: string,
  options?: ImportOptions,
): Promise<string> {
  const { id, fileIds } = await importDrawing(repository, images, text, options)
  for (const fileId of fileIds) imageCache.refresh(fileId)
  return id
}

const IMPORT_MESSAGES: Record<DocumentError['code'], string> = {
  'invalid-json': 'That file isn’t a Yodo file.',
  'not-yodo': 'That file isn’t a Yodo file.',
  'bad-version': 'That file isn’t a Yodo file.',
  'newer-version':
    'That file was made by a newer version of Yodo. Update Yodo to open it.',
  'migration-error': 'Couldn’t convert that file to this version of Yodo.',
  'bad-files': 'The images in that file are missing or damaged.',
  'bad-elements': 'That file has damaged drawing data, so it can’t be opened.',
  'images-unsupported': 'That drawing has images, which Yodo can’t import yet.',
}

/** What to tell the user when exporting failed. */
export function exportErrorMessage(error: unknown): string {
  return error instanceof DocumentError && error.code === 'bad-files'
    ? 'Couldn’t export: an image in this drawing is missing.'
    : 'Couldn’t export the drawing. Try again.'
}

/** What to tell the user when importing a file failed. */
export function importErrorMessage(error: unknown): string {
  return error instanceof DocumentError
    ? IMPORT_MESSAGES[error.code]
    : 'Couldn’t import that file. Try again.'
}
