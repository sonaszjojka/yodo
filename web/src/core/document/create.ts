import { CURRENT_SCHEMA_VERSION, type YodoDocument } from './types.ts'

/** A new, empty drawing at the current schema version. */
export function createDocument(name = 'Untitled'): YodoDocument {
  return {
    type: 'yodo',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: crypto.randomUUID(),
    name,
    elements: [],
    appState: { viewport: { x: 0, y: 0, zoom: 1 } },
    fileIds: [],
  }
}
