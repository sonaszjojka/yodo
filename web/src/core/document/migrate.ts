// Load pipeline for drawing documents (ADR 0013). Every source (IndexedDB,
// the HTTP repository, `.yodo` import) loads through `loadDocument`, so old
// documents are migrated in exactly one place.

import { CURRENT_SCHEMA_VERSION, type YodoDocument } from './types.ts'

export type DocumentErrorCode =
  'invalid-json' | 'not-yodo' | 'bad-version' | 'newer-version'

export class DocumentError extends Error {
  readonly code: DocumentErrorCode

  constructor(code: DocumentErrorCode, message: string) {
    super(message)
    this.name = 'DocumentError'
    this.code = code
  }
}

/** A document of some schema version, before or during migration. */
export type RawDocument = Record<string, unknown> & { schemaVersion: number }

/** `migrations[n]` turns a version-n document into version n + 1. */
export type Migrations = Record<number, (doc: RawDocument) => RawDocument>

// Empty until v2: add `1: migrateV1toV2` here together with a v1 fixture test.
const migrations: Migrations = {}

/** Applies the migration steps from the document's version up to `target`. */
export function runMigrations(
  doc: RawDocument,
  steps: Migrations,
  target: number,
): RawDocument {
  let current = doc
  while (current.schemaVersion < target) {
    const step = steps[current.schemaVersion]
    if (!step) {
      throw new DocumentError(
        'bad-version',
        `No migration from schema version ${current.schemaVersion}`,
      )
    }
    current = step(current)
  }
  return current
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Checks the document envelope and migrates it to the current schema version.
 * Elements are not validated one by one: only Yodo writes them.
 */
export function migrate(raw: unknown): YodoDocument {
  if (!isRecord(raw) || raw.type !== 'yodo' || !Array.isArray(raw.elements)) {
    throw new DocumentError('not-yodo', 'Not a Yodo document')
  }
  const version = raw.schemaVersion
  if (
    typeof version !== 'number' ||
    !Number.isInteger(version) ||
    version < 1
  ) {
    throw new DocumentError('bad-version', `Invalid schema version: ${version}`)
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    // Refuse rather than load and silently drop data this app doesn't know.
    throw new DocumentError(
      'newer-version',
      `Schema version ${version} is newer than this app supports (${CURRENT_SCHEMA_VERSION})`,
    )
  }
  const doc = { ...raw, schemaVersion: version }
  return runMigrations(
    doc,
    migrations,
    CURRENT_SCHEMA_VERSION,
  ) as unknown as YodoDocument
}

/** Parses a stored or imported document and migrates it to the current version. */
export function loadDocument(json: string): YodoDocument {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new DocumentError('invalid-json', 'Document is not valid JSON')
  }
  return migrate(raw)
}
