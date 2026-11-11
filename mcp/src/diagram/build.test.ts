import { describe, expect, it } from 'vitest'
import {
  createDocument,
  createShape,
} from '../../../web/src/core/document/create.ts'
import type {
  ArrowElement,
  Point,
  TextElement,
  YodoDocument,
  YodoElement,
} from '../../../web/src/core/document/types.ts'
import { followBindings } from '../../../web/src/core/editor/binding.ts'
import type { Bounds } from '../../../web/src/core/geometry/rect.ts'
import {
  heightForLabel,
  labelBox,
  layoutText,
  type Measure,
} from '../../../web/src/core/text/layout.ts'
import type { Applied } from '../write/apply.ts'
import type { DiagramEdge, DiagramNode } from '../write/spec.ts'
import { addDiagram, clearLabel, type DiagramSpec } from './build.ts'
import type { Direction } from './layout.ts'

/** Ten units per character, whatever the font. */
const measure: Measure = (text) => text.length * 10

function ok(result: Applied): { doc: YodoDocument; ids: string[] } {
  if ('error' in result) throw new Error(result.error)
  return result
}

function errorOf(result: Applied): string {
  if (!('error' in result)) throw new Error('expected an error')
  return result.error
}

const node = (id: string, extra: Partial<DiagramNode> = {}): DiagramNode => ({
  id,
  label: id.toUpperCase(),
  ...extra,
})
const edge = (from: string, to: string, extra: Partial<DiagramEdge> = {}) => ({
  from,
  to,
  ...extra,
})

function diagram(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  direction: Direction = 'TB',
  extra: Partial<DiagramSpec> = {},
  doc: YodoDocument = createDocument('d'),
) {
  return ok(addDiagram(doc, { nodes, edges, direction, ...extra }, measure))
}

const boxes = (doc: YodoDocument) =>
  doc.elements.filter((e) => e.type !== 'arrow' && e.type !== 'text')
const arrows = (doc: YodoDocument) =>
  doc.elements.filter((e): e is ArrowElement => e.type === 'arrow')
const texts = (doc: YodoDocument) =>
  doc.elements.filter((e): e is TextElement => e.type === 'text')

function absolute(arrow: ArrowElement): Point[] {
  return arrow.points.map(([dx, dy]): Point => [arrow.x + dx, arrow.y + dy])
}

function shrink(b: Bounds, by: number): Bounds {
  return {
    x: b.x + by,
    y: b.y + by,
    width: b.width - 2 * by,
    height: b.height - 2 * by,
  }
}

/** Whether segment a–b passes through box `r` (Liang–Barsky clipping). */
function crosses(a: Point, b: Point, r: Bounds): boolean {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  let t0 = 0
  let t1 = 1
  const sides: [number, number][] = [
    [-dx, a[0] - r.x],
    [dx, r.x + r.width - a[0]],
    [-dy, a[1] - r.y],
    [dy, r.y + r.height - a[1]],
  ]
  for (const [p, q] of sides) {
    if (p === 0) {
      if (q < 0) return false
      continue
    }
    const t = q / p
    if (p < 0) t0 = Math.max(t0, t)
    else t1 = Math.min(t1, t)
    if (t0 > t1) return false
  }
  return true
}

function overlaps(a: Bounds, b: Bounds): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  )
}

function segments(arrow: ArrowElement): [Point, Point][] {
  const points = absolute(arrow)
  return points.slice(1).map((p, i) => [points[i]!, p])
}

/** No arrow passes through a node it doesn't start or end at. */
function expectNoCrossings(doc: YodoDocument) {
  for (const arrow of arrows(doc)) {
    const ends = new Set([
      arrow.startBinding?.elementId,
      arrow.endBinding?.elementId,
    ])
    for (const shape of boxes(doc)) {
      if (ends.has(shape.id)) continue
      for (const [a, b] of segments(arrow)) {
        expect(
          crosses(a, b, shrink(shape, 1)),
          `${arrow.id} crosses ${shape.id}`,
        ).toBe(false)
      }
    }
  }
}

/** No label touches a node or any arrow, its own included. */
function expectClearLabels(doc: YodoDocument) {
  for (const label of texts(doc)) {
    for (const shape of boxes(doc)) {
      expect(overlaps(label, shape), `${label.text} on ${shape.id}`).toBe(false)
    }
    for (const arrow of arrows(doc)) {
      for (const [a, b] of segments(arrow)) {
        expect(crosses(a, b, label), `${label.text} on ${arrow.id}`).toBe(false)
      }
    }
  }
}

const DIRECTIONS: Direction[] = ['TB', 'BT', 'LR', 'RL']

describe('addDiagram', () => {
  describe('shapes', () => {
    it('makes one labelled shape per node, with the node id', () => {
      const { doc, ids } = diagram(
        [
          node('a'),
          node('b', { shape: 'diamond' }),
          node('c', { shape: 'ellipse' }),
        ],
        [],
      )
      expect(boxes(doc).map((e) => [e.id, e.type])).toEqual([
        ['a', 'rectangle'],
        ['b', 'diamond'],
        ['c', 'ellipse'],
      ])
      expect(ids).toEqual(['a', 'b', 'c'])
      for (const shape of boxes(doc)) {
        expect('label' in shape && shape.label?.text).toBe(
          shape.id.toUpperCase(),
        )
      }
    })

    it('sizes each shape to its label', () => {
      const long = 'A much longer label than the other'
      const { doc } = diagram(
        [node('a', { label: 'Hi' }), node('b', { label: long })],
        [],
      )
      const [short, wide] = boxes(doc) as Extract<
        YodoElement,
        { type: 'rectangle' }
      >[]
      expect(wide!.width).toBeGreaterThan(short!.width)
      const text = layoutText(long, 'hand', 20, measure, labelBox(wide!).width)
      expect(text.width).toBeLessThanOrEqual(labelBox(wide!).width)
      expect(wide!.height).toBeGreaterThanOrEqual(
        heightForLabel('rectangle', text.height),
      )
    })

    it('wraps a very long label instead of making a very wide shape', () => {
      const label = Array.from({ length: 12 }, () => 'word').join(' ')
      const { doc } = diagram([node('a', { label })], [])
      const shape = boxes(doc)[0] as Extract<YodoElement, { type: 'rectangle' }>
      expect(shape.width).toBeLessThan(label.length * 10)
      expect(shape.label!.text).toBe(label)
    })

    it('makes a diamond and an ellipse bigger than a rectangle with the same label', () => {
      const label = 'Same label'
      const { doc } = diagram(
        [
          node('r', { label }),
          node('d', { label, shape: 'diamond' }),
          node('e', { label, shape: 'ellipse' }),
        ],
        [],
      )
      const [r, d, e] = boxes(doc)
      expect(d!.width).toBeGreaterThan(r!.width)
      expect(e!.width).toBeGreaterThan(r!.width)
    })

    it('fills a coloured node solid and keeps the stroke colour', () => {
      const { doc } = diagram(
        [node('a', { backgroundColor: '#ffec99', strokeColor: '#e03131' })],
        [],
      )
      const shape = boxes(doc)[0] as Extract<YodoElement, { type: 'rectangle' }>
      expect(shape.backgroundColor).toBe('#ffec99')
      expect(shape.fillStyle).toBe('solid')
      expect(shape.strokeColor).toBe('#e03131')
    })
  })

  describe('arrows', () => {
    it('joins each edge with an arrow bound at both ends', () => {
      const { doc, ids } = diagram(
        [node('a'), node('b'), node('c')],
        [edge('a', 'b', { id: 'ab' }), edge('b', 'c', { endArrowhead: null })],
      )
      const [ab, bc] = arrows(doc)
      expect(ab!.id).toBe('ab')
      expect(ab!.startBinding?.elementId).toBe('a')
      expect(ab!.endBinding?.elementId).toBe('b')
      expect(bc!.startBinding?.elementId).toBe('b')
      expect(bc!.endBinding?.elementId).toBe('c')
      expect(bc!.endArrowhead).toBeNull()
      expect(ids.slice(0, 3)).toEqual(['a', 'b', 'c'])
      expect(ids).toContain('ab')
    })

    it('puts arrow ends on the outlines, so following bindings changes nothing', () => {
      for (const shape of ['rectangle', 'diamond', 'ellipse'] as const) {
        const { doc } = diagram(
          [node('a', { shape }), node('b', { shape }), node('c', { shape })],
          [edge('a', 'b'), edge('a', 'c'), edge('b', 'c')],
        )
        const followed = followBindings(doc.elements, new Set(['a', 'b', 'c']))
        for (const arrow of arrows(doc)) {
          const after = followed.find((e) => e.id === arrow.id) as ArrowElement
          const [p, q] = [absolute(arrow), absolute(after)]
          for (const i of [0, p.length - 1]) {
            expect(q[i]![0]).toBeCloseTo(p[i]![0], 3)
            expect(q[i]![1]).toBeCloseTo(p[i]![1], 3)
          }
        }
      }
    })

    it('makes a straight edge a two-point arrow', () => {
      const { doc } = diagram([node('a'), node('b')], [edge('a', 'b')])
      expect(arrows(doc)[0]!.points).toHaveLength(2)
    })

    it('draws nodes, then arrows, then labels', () => {
      const { doc } = diagram(
        [node('a'), node('b')],
        [edge('a', 'b', { label: 'go' })],
      )
      expect(doc.elements.map((e) => e.type)).toEqual([
        'rectangle',
        'rectangle',
        'arrow',
        'text',
      ])
    })
  })

  describe('simple graphs have no arrow through a shape', () => {
    const graphs: Record<string, [DiagramNode[], DiagramEdge[]]> = {
      chain: [
        [node('a'), node('b'), node('c'), node('d')],
        [edge('a', 'b'), edge('b', 'c'), edge('c', 'd')],
      ],
      'fan-out': [
        [node('a'), node('b'), node('c'), node('d')],
        [edge('a', 'b'), edge('a', 'c'), edge('a', 'd')],
      ],
      'fan-in': [
        [node('a'), node('b'), node('c'), node('d')],
        [edge('a', 'd'), edge('b', 'd'), edge('c', 'd')],
      ],
      'diamond DAG': [
        [node('a'), node('b'), node('c'), node('d')],
        [edge('a', 'b'), edge('a', 'c'), edge('b', 'd'), edge('c', 'd')],
      ],
      'skip edge': [
        [node('a'), node('b'), node('c')],
        [edge('a', 'b'), edge('b', 'c'), edge('a', 'c')],
      ],
      tree: [
        [node('r'), node('a'), node('b'), node('a1'), node('a2'), node('b1')],
        [
          edge('r', 'a'),
          edge('r', 'b'),
          edge('a', 'a1'),
          edge('a', 'a2'),
          edge('b', 'b1'),
        ],
      ],
      cycle: [
        [node('a'), node('b'), node('c')],
        [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')],
      ],
    }
    for (const [name, [nodes, edges]] of Object.entries(graphs)) {
      for (const direction of DIRECTIONS) {
        it(`${name}, ${direction}`, () => {
          expectNoCrossings(diagram(nodes, edges, direction).doc)
        })
      }
    }
  })

  describe('edge labels', () => {
    it('become centred text elements', () => {
      const { doc, ids } = diagram(
        [node('a'), node('b')],
        [edge('a', 'b', { label: 'yes' })],
      )
      const [label] = texts(doc)
      expect(label!.text).toBe('yes')
      expect(label!.textAlign).toBe('center')
      expect(ids.at(-1)).toBe(label!.id)
    })

    for (const direction of DIRECTIONS) {
      it(`stay clear of shapes and arrows for one edge, ${direction}`, () => {
        expectClearLabels(
          diagram(
            [node('a'), node('b')],
            [edge('a', 'b', { label: 'approved' })],
            direction,
          ).doc,
        )
      })
    }

    it('stay clear in a yes/no decision', () => {
      for (const direction of DIRECTIONS) {
        const { doc } = diagram(
          [
            node('start', { label: 'Start' }),
            node('ok', { label: 'Valid?', shape: 'diamond' }),
            node('save', { label: 'Save' }),
            node('fix', { label: 'Show error' }),
            node('end', { label: 'End', shape: 'ellipse' }),
          ],
          [
            edge('start', 'ok'),
            edge('ok', 'save', { label: 'yes' }),
            edge('ok', 'fix', { label: 'no' }),
            edge('save', 'end'),
            edge('fix', 'start', { label: 'retry' }),
          ],
          direction,
        )
        expectClearLabels(doc)
        expectNoCrossings(doc)
      }
    })

    it('stay clear in a fan-out with every edge labelled', () => {
      for (const direction of DIRECTIONS) {
        expectClearLabels(
          diagram(
            [node('a'), node('b'), node('c'), node('d')],
            [
              edge('a', 'b', { label: 'first' }),
              edge('a', 'c', { label: 'second one' }),
              edge('a', 'd', { label: 'third' }),
            ],
            direction,
          ).doc,
        )
      }
    })
  })

  describe('clearLabel', () => {
    it('moves a box off a segment along the normal, with a gap', () => {
      const moved = clearLabel(
        { x: 40, y: -5, width: 20, height: 10 },
        [
          [0, 0],
          [100, 0],
        ],
        [
          [
            [0, 0],
            [100, 0],
          ],
        ],
      )
      expect(moved.x).toBe(40)
      expect(Math.abs(moved.y + moved.height / 2)).toBeGreaterThanOrEqual(11)
      expect(crosses([0, 0], [100, 0], moved)).toBe(false)
    })

    it('leaves a box that is already clear where it is', () => {
      const box = { x: 40, y: 10, width: 20, height: 10 }
      expect(
        clearLabel(
          box,
          [
            [0, 0],
            [100, 0],
          ],
          [
            [
              [0, 0],
              [100, 0],
            ],
          ],
        ),
      ).toEqual(box)
    })
  })

  describe('placement', () => {
    it('starts a new drawing at the origin', () => {
      const { doc } = diagram([node('a'), node('b')], [edge('a', 'b')])
      expect(Math.min(...boxes(doc).map((e) => e.x))).toBe(0)
      expect(Math.min(...boxes(doc).map((e) => e.y))).toBe(0)
    })

    it('starts at the given x and y', () => {
      const { doc } = diagram([node('a')], [], 'TB', { x: 300, y: -40 })
      expect([boxes(doc)[0]!.x, boxes(doc)[0]!.y]).toEqual([300, -40])
    })

    it('goes below what an existing drawing already has', () => {
      const existing = {
        ...createShape('rectangle', { x: 50, y: 100, width: 400, height: 300 }),
        id: 'old',
      }
      const before = { ...createDocument('d'), elements: [existing] }
      const { doc } = diagram(
        [node('a'), node('b')],
        [edge('a', 'b')],
        'LR',
        {},
        before,
      )
      expect(doc.elements[0]).toBe(existing)
      for (const shape of boxes(doc).filter((e) => e.id !== 'old')) {
        expect(shape.y).toBeGreaterThanOrEqual(100 + 300 + 80)
        expect(overlaps(shape, existing)).toBe(false)
      }
      expect(
        Math.min(
          ...boxes(doc)
            .filter((e) => e.id !== 'old')
            .map((e) => e.x),
        ),
      ).toBe(50)
    })
  })

  describe('errors', () => {
    const run = (
      nodes: DiagramNode[],
      edges: DiagramEdge[],
      doc?: YodoDocument,
    ) =>
      addDiagram(
        doc ?? createDocument('d'),
        { nodes, edges, direction: 'TB' },
        measure,
      )

    it('rejects an edge to a node that is not in the call', () => {
      expect(errorOf(run([node('a')], [edge('a', 'zz')]))).toContain('"zz"')
    })

    it('rejects two nodes with one id', () => {
      expect(errorOf(run([node('a'), node('a')], []))).toContain('"a"')
    })

    it('rejects an edge from a node to itself', () => {
      expect(errorOf(run([node('a')], [edge('a', 'a')]))).toContain('"a"')
    })

    it('rejects an id the drawing already has', () => {
      const existing = {
        ...createShape('rectangle', { x: 0, y: 0, width: 10, height: 10 }),
        id: 'a',
      }
      const doc = { ...createDocument('d'), elements: [existing] }
      expect(errorOf(run([node('a')], [], doc))).toContain('"a"')
    })

    it('rejects an edge id that is a node id', () => {
      expect(
        errorOf(run([node('a'), node('b')], [edge('a', 'b', { id: 'a' })])),
      ).toContain('"a"')
    })
  })
})
