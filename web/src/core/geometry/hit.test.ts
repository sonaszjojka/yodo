import { describe, expect, test } from 'vitest'
import { createLinear, createShape } from '../document/create.ts'
import type {
  PencilElement,
  Point,
  TextElement,
  YodoElement,
} from '../document/types.ts'
import { hitTest } from './hit.ts'
import { lineFromDrag } from './line.ts'

// Default stroke width is 2, so the effective tolerance is TOLERANCE + 1.
const TOLERANCE = 4
const REACH = TOLERANCE + 1

const BOX = { x: 0, y: 0, width: 100, height: 60 }

function filled<T extends YodoElement>(element: T): T {
  return { ...element, backgroundColor: '#F7E1DE' }
}

function hits(element: YodoElement, point: Point) {
  return hitTest(element, point, TOLERANCE)
}

describe('rectangle', () => {
  const rect = createShape('rectangle', BOX)

  test.each<[string, Point]>([
    ['on the top edge', [50, 0]],
    ['just inside the left edge', [REACH, 30]],
    ['just outside the right edge', [100 + REACH, 30]],
    ['on a corner', [100, 60]],
  ])('hits %s', (_, point) => {
    expect(hits(rect, point)).toBe(true)
  })

  test.each<[string, Point]>([
    ['beyond the tolerance outside', [100 + REACH + 1, 30]],
    ['in the empty middle', [50, 30]],
    ['beyond the tolerance inside', [REACH + 1, 30]],
  ])('misses %s when transparent', (_, point) => {
    expect(hits(rect, point)).toBe(false)
  })

  test('hits the middle when filled', () => {
    expect(hits(filled(rect), [50, 30])).toBe(true)
  })

  test('a thicker stroke reaches further', () => {
    const thick = { ...rect, strokeWidth: 10 }
    expect(hits(thick, [100 + TOLERANCE + 5, 30])).toBe(true)
    expect(hits(thick, [100 + TOLERANCE + 6, 30])).toBe(false)
  })
})

describe('diamond', () => {
  // Corners at (50, 0), (100, 30), (50, 60), (0, 30).
  const diamond = createShape('diamond', BOX)

  test.each<[string, Point]>([
    ['on the top corner', [50, 0]],
    ['on the middle of an edge', [75, 15]],
    ['on the left corner', [0, 30]],
  ])('hits %s', (_, point) => {
    expect(hits(diamond, point)).toBe(true)
  })

  test.each<[string, Point]>([
    ['in the bounding-box corner outside the shape', [5, 5]],
    ['in the empty middle', [50, 30]],
    ['far outside', [200, 30]],
  ])('misses %s when transparent', (_, point) => {
    expect(hits(diamond, point)).toBe(false)
  })

  test('hits the middle when filled, but not the box corner', () => {
    expect(hits(filled(diamond), [50, 30])).toBe(true)
    expect(hits(filled(diamond), [5, 5])).toBe(false)
  })
})

describe('ellipse', () => {
  // Centre (50, 30), semi-axes 50 and 30.
  const ellipse = createShape('ellipse', BOX)

  test.each<[string, Point]>([
    ['on the right end', [100, 30]],
    ['on the top', [50, 0]],
    ['just outside the bottom', [50, 60 + REACH]],
    ['just inside the left end', [REACH, 30]],
  ])('hits %s', (_, point) => {
    expect(hits(ellipse, point)).toBe(true)
  })

  test.each<[string, Point]>([
    ['in the bounding-box corner', [3, 3]],
    ['in the empty middle', [50, 30]],
    ['beyond the tolerance outside', [100 + REACH + 1, 30]],
  ])('misses %s when transparent', (_, point) => {
    expect(hits(ellipse, point)).toBe(false)
  })

  test('hits the middle when filled', () => {
    expect(hits(filled(ellipse), [50, 30])).toBe(true)
  })

  test('a circle hits exactly within the tolerance of its outline', () => {
    const circle = createShape('ellipse', {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    })
    const diagonal = (r: number): Point => [
      50 + r * Math.SQRT1_2,
      50 + r * Math.SQRT1_2,
    ]
    expect(hits(circle, diagonal(50 + REACH - 0.1))).toBe(true)
    expect(hits(circle, diagonal(50 + REACH + 0.1))).toBe(false)
    expect(hits(circle, diagonal(50 - REACH + 0.1))).toBe(true)
    expect(hits(circle, diagonal(50 - REACH - 0.1))).toBe(false)
  })
})

describe.each(['line', 'arrow'] as const)('%s', (type) => {
  // Drawn up-left, so its points are negative: (100, 60) → (0, 0).
  const line = createLinear(type, lineFromDrag([100, 60], [0, 0], false))

  test.each<[string, Point]>([
    ['at the start', [100, 60]],
    ['at the end', [0, 0]],
    ['in the middle', [50, 30]],
    ['just beside the middle', [50, 30 + REACH]],
  ])('hits %s', (_, point) => {
    expect(hits(line, point)).toBe(true)
  })

  test.each<[string, Point]>([
    ['beyond the tolerance beside it', [50, 30 + REACH * 2]],
    ['past the end along its direction', [-10, -6]],
    ['in the bounding-box corner', [100, 0]],
  ])('misses %s', (_, point) => {
    expect(hits(line, point)).toBe(false)
  })

  test('filling it changes nothing', () => {
    expect(hits(filled(line), [100, 0])).toBe(false)
  })
})

describe('pencil', () => {
  const pencil: PencilElement = {
    ...createLinear('line', lineFromDrag([0, 0], [0, 0], false)),
    type: 'pencil',
    width: 20,
    height: 10,
    points: [
      [0, 0],
      [10, 10],
      [20, 0],
    ],
  }

  test('hits along any segment of the stroke', () => {
    expect(hits(pencil, [5, 5])).toBe(true)
    expect(hits(pencil, [15, 5])).toBe(true)
  })

  test('misses the gap under the stroke', () => {
    expect(hits(pencil, [10, 0])).toBe(false)
  })
})

describe('text', () => {
  const text: TextElement = {
    ...createShape('rectangle', BOX),
    type: 'text',
    text: 'Hello',
    fontFamily: 'hand',
    fontSize: 20,
    textAlign: 'left',
  }

  test('hits anywhere in its box, transparent or not', () => {
    expect(hits(text, [50, 30])).toBe(true)
    expect(hits(text, [100 + REACH, 30])).toBe(true)
    expect(hits(text, [100 + REACH + 1, 30])).toBe(false)
  })
})

describe('labelled shapes (ADR 0026)', () => {
  const label = {
    text: 'Hi',
    fontFamily: 'hand',
    fontSize: 20,
    textAlign: 'center',
  } as const

  test.each(['rectangle', 'diamond', 'ellipse'] as const)(
    'a transparent %s with a label hits in its middle',
    (type) => {
      const shape = createShape(type, BOX)
      expect(hits(shape, [50, 30])).toBe(false)
      expect(hits({ ...shape, label }, [50, 30])).toBe(true)
    },
  )

  test('a labelled ellipse still misses outside its outline', () => {
    const ellipse = { ...createShape('ellipse', BOX), label }
    expect(hits(ellipse, [2, 2])).toBe(false)
  })
})

describe('round corners (roadmap 2.2b)', () => {
  const box = { x: 0, y: 0, width: 200, height: 200 }
  // Radius 32: the corner curve passes through (8, 8), the tip is empty.
  const rect = {
    ...createShape('rectangle', box),
    roundness: 'round' as const,
  }
  // Tip at (100, 0); its curve passes through about (100, 11.3).
  const diamond = {
    ...createShape('diamond', box),
    roundness: 'round' as const,
  }

  test('a round rectangle hits on its drawn corner curve', () => {
    expect(hits(rect, [8, 8])).toBe(true)
    expect(hits(rect, [100, 0])).toBe(true)
  })

  test('the empty corner tip outside the curve misses', () => {
    expect(hits(rect, [0, 0])).toBe(false)
    expect(hits(filled(rect), [1, 1])).toBe(false)
  })

  test('a transparent round rectangle still passes clicks through its middle', () => {
    expect(hits(rect, [100, 100])).toBe(false)
    expect(hits(filled(rect), [100, 100])).toBe(true)
  })

  test('a round diamond hits on its rounded tip, not the sharp one', () => {
    expect(hits(diamond, [100, 11])).toBe(true)
    expect(hits(diamond, [100, 0])).toBe(false)
  })
})
