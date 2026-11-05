// Load pipeline for drawing documents (ADR 0013). Every source (IndexedDB,
// the HTTP repository, `.yodo` import) loads through `loadDocument`, so old
// documents are migrated in exactly one place.

import { CURRENT_SCHEMA_VERSION, type YodoDocument } from './types.ts'

export type DocumentErrorCode =
  | 'invalid-json'
  | 'not-yodo'
  | 'bad-version'
  | 'newer-version'
  /** A bug in the app's migration steps, not in the user's data. */
  | 'migration-error'
  /** A `.yodo` file's images are missing or malformed. */
  | 'bad-files'
  /** A `.yodo` file has an element the app can't draw. */
  | 'bad-elements'
  /** A `.yodo` file with images, which the app can't store yet (roadmap 2.6). */
  | 'images-unsupported'

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
export const migrations: Migrations = {}

/** Applies the migration steps from the document's version up to `target`. */
export function runMigrations(
  doc: RawDocument,
  steps: Migrations,
  target: number,
): RawDocument {
  let current = doc
  while (current.schemaVersion < target) {
    const from = current.schemaVersion
    const step = steps[from]
    if (!step) {
      throw new DocumentError(
        'migration-error',
        `No migration from schema version ${from}`,
      )
    }
    current = step(current)
    // Each step must advance exactly one version; otherwise the loop could
    // spin forever or skip steps.
    if (current.schemaVersion !== from + 1) {
      throw new DocumentError(
        'migration-error',
        `Migration from schema version ${from} returned version ${String(current.schemaVersion)}`,
      )
    }
  }
  return current
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Checks the current-version envelope. Elements are not validated one by one:
 * only Yodo writes them.
 */
function hasCurrentEnvelope(doc: Record<string, unknown>): boolean {
  const { appState, fileIds } = doc
  const viewport = isRecord(appState) ? appState.viewport : undefined
  return (
    typeof doc.id === 'string' &&
    typeof doc.name === 'string' &&
    Array.isArray(doc.elements) &&
    isRecord(viewport) &&
    isFiniteNumber(viewport.x) &&
    isFiniteNumber(viewport.y) &&
    isFiniteNumber(viewport.zoom) &&
    Array.isArray(fileIds) &&
    fileIds.every((fileId) => typeof fileId === 'string')
  )
}

/** Shows an unchecked value in an error message without throwing. */
function display(value: unknown): string {
  return typeof value === 'object' || typeof value === 'symbol'
    ? typeof value
    : String(value)
}

/**
 * `migrate` with the steps and target passed in, so tests can use fake steps.
 * Before migrating it checks only what every version shares (`type` and
 * `schemaVersion`); the full envelope is checked on the migrated result.
 */
export function migrateWith(
  raw: unknown,
  steps: Migrations,
  target: number,
): RawDocument {
  if (!isRecord(raw) || raw.type !== 'yodo') {
    throw new DocumentError('not-yodo', 'Not a Yodo document')
  }
  const version = raw.schemaVersion
  if (
    typeof version !== 'number' ||
    !Number.isInteger(version) ||
    version < 1
  ) {
    throw new DocumentError(
      'bad-version',
      `Invalid schema version: ${display(version)}`,
    )
  }
  if (version > target) {
    // Refuse rather than load and silently drop data this app doesn't know.
    throw new DocumentError(
      'newer-version',
      `Schema version ${version} is newer than this app supports (${target})`,
    )
  }
  // Deep copy only when steps will run, so they can't change the caller's
  // object; a current document is returned without copying a large drawing.
  const doc: RawDocument =
    version < target
      ? structuredClone({ ...raw, schemaVersion: version })
      : { ...raw, schemaVersion: version }
  const result = runMigrations(doc, steps, target)
  if (!hasCurrentEnvelope(result)) {
    throw new DocumentError('not-yodo', 'Not a valid Yodo document')
  }
  return result
}

/** Checks the document envelope and migrates it to the current schema version. */
export function migrate(raw: unknown): YodoDocument {
  // Safe after migrateWith: the version is CURRENT and the envelope is checked.
  return migrateWith(
    raw,
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
