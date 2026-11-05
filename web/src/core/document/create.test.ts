import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  createDocument,
  createImage,
  createLinear,
  createPencil,
  createShape,
  createText,
  BUILT_IN_STYLE,
  DEFAULT_FONT_SIZE,
  randomSeed,
  type ElementStyle,
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
    roundness: 'sharp',
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

test('rectangles and diamonds take the corners of the style; ellipses have none', () => {
  const style = { ...BUILT_IN_STYLE, roundness: 'round' as const }
  const box = { x: 0, y: 0, width: 5, height: 6 }
  expect(createShape('rectangle', box, 1, style).roundness).toBe('round')
  expect(createShape('diamond', box, 1, style).roundness).toBe('round')
  expect('roundness' in createShape('ellipse', box, 1, style)).toBe(false)
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

test('createPencil uses the given stroke geometry and seed with default styles', () => {
  const geometry = {
    x: 5,
    y: 6,
    width: 10,
    height: 4,
    points: [
      [0, 0],
      [10, 4],
    ] as [number, number][],
  }

  expect(createPencil(geometry, 9)).toMatchObject({
    type: 'pencil',
    id: expect.stringMatching(UUID),
    ...geometry,
    seed: 9,
    strokeColor: '#1E1F22',
    strokeWidth: 2,
    opacity: 100,
  })
})

describe('createText', () => {
  test('is an empty text at the point in the default style', () => {
    const text = createText([10, 20], 7)
    expect(text).toMatchObject({
      type: 'text',
      x: 10,
      y: 20,
      width: 0,
      height: 0,
      seed: 7,
      text: '',
      fontFamily: 'hand',
      fontSize: DEFAULT_FONT_SIZE,
      textAlign: 'left',
      strokeColor: '#1E1F22',
    })
  })
})

describe('a given style (the editor defaults, ADR 0036)', () => {
  const style: ElementStyle = {
    ...BUILT_IN_STYLE,
    strokeColor: '#C2453D',
    backgroundColor: '#E0E9FB',
    fillStyle: 'solid',
    strokeWidth: 4,
    strokeStyle: 'dashed',
    roughness: 0,
    opacity: 50,
    fontFamily: 'mono',
    fontSize: 36,
    textAlign: 'right',
  }
  const box = { x: 0, y: 0, width: 10, height: 10 }
  const elementStyle = {
    strokeColor: '#C2453D',
    backgroundColor: '#E0E9FB',
    fillStyle: 'solid',
    strokeWidth: 4,
    strokeStyle: 'dashed',
    roughness: 0,
    opacity: 50,
  }

  test('BUILT_IN_STYLE is the style elements had before defaults existed', () => {
    expect(BUILT_IN_STYLE).toEqual({
      strokeColor: '#1E1F22',
      backgroundColor: 'transparent',
      fillStyle: 'hachure',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness: 1,
      roundness: 'sharp',
      opacity: 100,
      fontFamily: 'hand',
      fontSize: DEFAULT_FONT_SIZE,
      textAlign: 'left',
    })
  })

  test('shapes, lines and strokes take its element styles, no text fields', () => {
    const geometry = {
      ...box,
      points: [
        [0, 0],
        [10, 10],
      ] as [number, number][],
    }
    for (const element of [
      createShape('ellipse', box, 1, style),
      createLinear('arrow', geometry, 1, style),
      createPencil(geometry, 1, style),
    ]) {
      expect(element).toMatchObject(elementStyle)
      expect('fontFamily' in element).toBe(false)
    }
  })

  test('text takes its font, size and alignment too', () => {
    expect(createText([0, 0], 1, style)).toMatchObject({
      ...elementStyle,
      fontFamily: 'mono',
      fontSize: 36,
      textAlign: 'right',
    })
  })
})

describe('createImage', () => {
  const view = { x: 100, y: 200, width: 1000, height: 500 }
  const fileId = 'a'.repeat(64)

  test('keeps a small image at its natural size, centred on the view', () => {
    const image = createImage(fileId, { width: 100, height: 50 }, view)
    expect(image).toMatchObject({
      type: 'image',
      fileId,
      x: 100 + (1000 - 100) / 2,
      y: 200 + (500 - 50) / 2,
      width: 100,
      height: 50,
      angle: 0,
      roughness: 0,
    })
    expect(image.id).toMatch(UUID)
  })

  test('scales a large image down to 40% of the view, keeping its shape', () => {
    // 4000x1000 is limited by the width: 400 wide, so 100 tall.
    const wide = createImage(fileId, { width: 4000, height: 1000 }, view)
    expect([wide.width, wide.height]).toEqual([400, 100])
    // 1000x2000 is limited by the height: 200 tall, so 100 wide.
    const tall = createImage(fileId, { width: 1000, height: 2000 }, view)
    expect([tall.width, tall.height]).toEqual([100, 200])
  })
})
