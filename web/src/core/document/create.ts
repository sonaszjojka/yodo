import type { Bounds } from '../geometry/rect.ts'
import {
  CURRENT_SCHEMA_VERSION,
  type RectangleElement,
  type YodoDocument,
} from './types.ts'

/**
 * A random UUID v4. `crypto.randomUUID` exists only in secure contexts (HTTPS,
 * localhost), so a self-hosted app opened over plain HTTP on a LAN address
 * falls back to `getRandomValues`, which is available everywhere.
 */
function randomId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40 // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80 // RFC 4122 variant
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-')
}

/** A new, empty drawing at the current schema version. */
export function createDocument(name = 'Untitled'): YodoDocument {
  return {
    type: 'yodo',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: randomId(),
    name,
    elements: [],
    appState: { viewport: { x: 0, y: 0, zoom: 1 } },
    fileIds: [],
  }
}

/**
 * A rough.js seed: an integer in [1, 2^31 - 1]. rough.js treats 0 as "random
 * on every draw", which would make a shape wobble each frame (ADR 0004).
 */
export function randomSeed(): number {
  const [value] = crypto.getRandomValues(new Uint32Array(1))
  return (value! % (2 ** 31 - 1)) + 1
}

/** A new rectangle with the default style (Ink stroke, docs/ui.md). */
export function createRectangle(
  bounds: Bounds,
  seed = randomSeed(),
): RectangleElement {
  return {
    type: 'rectangle',
    id: randomId(),
    ...bounds,
    angle: 0,
    seed,
    strokeColor: '#1E1F22',
    backgroundColor: 'transparent',
    fillStyle: 'hachure',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 1,
    opacity: 100,
  }
}
