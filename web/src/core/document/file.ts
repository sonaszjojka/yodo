// The `.yodo` export file (ADR 0013): a drawing's document plus the images it
// references inlined as base64, as one JSON object. The images sit in a
// `files` section next to the document's own fields. That section exists only
// in the file, never in a stored document, so it needs no schema version.

import {
  DocumentError,
  migrateWith,
  type Migrations,
  migrations,
} from './migrate.ts'
import {
  CURRENT_SCHEMA_VERSION,
  type YodoDocument,
  type YodoElement,
} from './types.ts'
import { isElement, sanitizeElement } from './validate.ts'

/** One inlined image. `data` is the image's bytes as standard base64. */
export interface YodoFileEntry {
  mimeType: string
  data: string
}

/** Images by the content hash the document's `fileIds` refer to. */
export type YodoFiles = Record<string, YodoFileEntry>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Standard base64: the alphabet, then up to two "=" of padding. Kept flat (no
// repeated group) because the engine recurses per repetition and overflows the
// stack on multi-megabyte images; the length check makes it whole groups of 4.
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/

function isBase64(data: string): boolean {
  return data.length % 4 === 0 && BASE64.test(data)
}

function isFileEntry(value: unknown): value is YodoFileEntry {
  return (
    isRecord(value) &&
    typeof value.mimeType === 'string' &&
    value.mimeType.startsWith('image/') &&
    typeof value.data === 'string' &&
    isBase64(value.data)
  )
}

/**
 * The images `fileIds` names, taken from `files`. Throws `bad-files` for a
 * missing or malformed one; entries nobody references are left out.
 */
function pickFiles(fileIds: readonly string[], files: unknown): YodoFiles {
  if (files !== undefined && !isRecord(files)) {
    throw new DocumentError('bad-files', 'The images section is malformed')
  }
  const picked: YodoFiles = {}
  for (const fileId of fileIds) {
    const entry = files?.[fileId]
    if (!isFileEntry(entry)) {
      throw new DocumentError(
        'bad-files',
        `Image ${fileId} is missing or malformed`,
      )
    }
    picked[fileId] = { mimeType: entry.mimeType, data: entry.data }
  }
  return picked
}

/**
 * The export file's text for `doc` and its images. Only the images listed in
 * `doc.fileIds` are written; one without data in `files` is an error.
 */
export function serializeYodoFile(doc: YodoDocument, files: YodoFiles): string {
  return JSON.stringify({ ...doc, files: pickFiles(doc.fileIds, files) })
}

/**
 * Reads an export file. The document goes through the same migrations as a
 * stored one (ADR 0013); `steps` and `target` are only for tests that need a
 * version transition. The file is untrusted, so every element is checked and
 * any bad one rejects the whole file, rather than saving a drawing that would
 * crash the renderer.
 */
export function parseYodoFile(
  text: string,
  steps: Migrations = migrations,
  target: number = CURRENT_SCHEMA_VERSION,
): { document: YodoDocument; files: YodoFiles } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new DocumentError('invalid-json', 'The file is not valid JSON')
  }
  // Split the images off first, so migrations only ever see the document.
  const { files, ...rest } = isRecord(raw) ? raw : { files: undefined }
  const migrated = migrateWith(isRecord(raw) ? rest : raw, steps, target)

  const seen = new Set<string>()
  const elements: YodoElement[] = []
  for (const element of migrated.elements as unknown[]) {
    if (!isElement(element) || seen.has(element.id)) {
      throw new DocumentError('bad-elements', 'The file has a broken element')
    }
    seen.add(element.id)
    elements.push(sanitizeElement(element))
  }
  migrated.elements = elements

  const document = migrated as unknown as YodoDocument
  // An image element must have its picture in the file, or it would draw as a
  // broken placeholder after import.
  for (const element of document.elements) {
    if (
      element.type === 'image' &&
      !document.fileIds.includes(element.fileId)
    ) {
      throw new DocumentError(
        'bad-files',
        `Image ${element.fileId} is not listed in the file`,
      )
    }
  }
  return { document, files: pickFiles(document.fileIds, files) }
}
