// What the Export and Import buttons do, apart from the buttons (ADR 0013).

import { serializeYodoFile } from '../core/document/file.ts'
import { DocumentError } from '../core/document/migrate.ts'
import type { YodoDocument } from '../core/document/types.ts'
import { yodoFileName } from '../storage/drawings.ts'
import { downloadText } from './download.ts'

/** Downloads `doc` as `<name>.yodo`. */
export function exportDrawing(
  doc: YodoDocument,
  download: typeof downloadText = downloadText,
): void {
  // The app has no images yet (roadmap 2.6), so there is nothing to inline.
  download(
    yodoFileName(doc.name),
    serializeYodoFile(doc, {}),
    'application/json',
  )
}

const IMPORT_MESSAGES: Record<DocumentError['code'], string> = {
  'invalid-json': 'That file isn’t a Yodo file.',
  'not-yodo': 'That file isn’t a Yodo file.',
  'bad-version': 'That file isn’t a Yodo file.',
  'newer-version':
    'That file was made by a newer version of Yodo. Update Yodo to open it.',
  'migration-error': 'Couldn’t convert that file to this version of Yodo.',
  'bad-files': 'That file’s images are missing or damaged.',
  'bad-elements': 'That file has damaged drawing data, so it can’t be opened.',
  'images-unsupported': 'That drawing has images, which Yodo can’t import yet.',
}

/** What to tell the user when importing a file failed. */
export function importErrorMessage(error: unknown): string {
  return error instanceof DocumentError
    ? IMPORT_MESSAGES[error.code]
    : 'Couldn’t import that file. Try again.'
}
