import { afterEach, expect, test, vi } from 'vitest'
import {
  createDocument,
  createLinear,
  createShape,
  randomSeed,
} from './create.ts'
import { loadDocument } from './migrate.ts'
import { CURRENT_SCHEMA_VERSION } from './types.ts'

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

test('creates an empty document at the current schema version', () => {
  const doc = createDocument()

  expect(doc).toEqual({
    type: 'yodo',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: expect.stringMatching(UUID),
    name: 'Untitled',
    elements: [],
    appState: { viewport: { x: 0, y: 0, zoom: 1 } },
    fileIds: [],
  })
})

test('uses the given name and a new id each time', () => {
  const a = createDocument('Plan')
  const b = createDocument('Plan')

  expect(a.name).toBe('Plan')
  expect(a.id).not.toBe(b.id)
})

test('survives a save and load round trip', () => {
  const doc = createDocument('Round trip')
  expect(loadDocument(JSON.stringify(doc))).toEqual(doc)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

test('creates an id where crypto.randomUUID is missing (plain HTTP)', () => {
  // Browsers expose randomUUID only in secure contexts, e.g. not on
  // http://192.168.1.10:8080; getRandomValues is available everywhere.
  vi.stubGlobal('crypto', {
    getRandomValues: crypto.getRandomValues.bind(crypto),
  })

  const a = createDocument()
  const b = createDocument()

  expect(a.id).toMatch(UUID)
  expect(a.id).not.toBe(b.id)
})

test('randomSeed is a positive 31-bit integer, never 0', () => {
  // rough.js treats seed 0 as "pick a new random seed on every draw".
  for (let i = 0; i < 1000; i++) {
    const seed = randomSeed()
    expect(Number.isInteger(seed)).toBe(true)
    expect(seed).toBeGreaterThanOrEqual(1)
    expect(seed).toBeLessThanOrEqual(2 ** 31 - 1)
  }
})

test('createShape uses the given bounds and seed with default styles', () => {
  const rect = createShape('rectangle', { x: 1, y: 2, width: 3, height: 4 }, 42)

  expect(rect).toEqual({
    type: 'rectangle',
    id: expect.stringMatching(UUID),
    x: 1,
    y: 2,
    width: 3,
    height: 4,
    angle: 0,
    seed: 42,
    strokeColor: '#1E1F22',
    backgroundColor: 'transparent',
    fillStyle: 'hachure',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 1,
    opacity: 100,
  })
})

test('createShape picks a random seed when none is given', () => {
  const rect = createShape('rectangle', { x: 0, y: 0, width: 1, height: 1 })
  expect(rect.seed).toBeGreaterThanOrEqual(1)
})

test.each(['diamond', 'ellipse'] as const)('createShape makes a %s', (type) => {
  const shape = createShape(type, { x: 0, y: 0, width: 5, height: 6 }, 1)
  expect(shape).toMatchObject({ type, width: 5, height: 6, seed: 1 })
})

const GEOMETRY = {
  x: 1,
  y: 2,
  width: 30,
  height: 40,
  points: [
    [0, 0],
    [-30, 40],
  ] as [number, number][],
}

test('createLinear makes a line with the given geometry and seed', () => {
  const line = createLinear('line', GEOMETRY, 9)

  expect(line).toMatchObject({ type: 'line', ...GEOMETRY, seed: 9, angle: 0 })
  expect(line).not.toHaveProperty('endArrowhead')
})

test('createLinear gives an arrow an arrowhead at the end', () => {
  const arrow = createLinear('arrow', GEOMETRY, 9)

  expect(arrow).toMatchObject({ type: 'arrow', endArrowhead: 'arrow' })
})
