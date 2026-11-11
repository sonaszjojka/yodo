import { describe, expect, it } from 'vitest'
import { createDocument } from '../../../web/src/core/document/create.ts'
import type {
  ArrowElement,
  RectangleElement,
  TextElement,
  YodoDocument,
  YodoElement,
} from '../../../web/src/core/document/types.ts'
import { isElement } from '../../../web/src/core/document/validate.ts'
import type { Measure } from '../../../web/src/core/text/layout.ts'
import {
  addElements,
  connectElements,
  deleteElements,
  updateElements,
  type Applied,
} from './apply.ts'
import {
  newElementSpec,
  type ConnectionSpec,
  type ElementPatch,
  type NewElementSpec,
} from './spec.ts'

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

function byId<T extends YodoElement = YodoElement>(
  doc: YodoDocument,
  id: string,
): T {
  const element = doc.elements.find((e) => e.id === id)
  if (!element) throw new Error(`no ${id}`)
  return element as T
}

function add(doc: YodoDocument, specs: NewElementSpec[]) {
  return ok(addElements(doc, specs, measure)).doc
}

function update(doc: YodoDocument, patches: ElementPatch[]) {
  return ok(updateElements(doc, patches, measure)).doc
}

function connect(doc: YodoDocument, connections: ConnectionSpec[]) {
  return ok(connectElements(doc, connections)).doc
}

/** Two boxes side by side, 100 apart. */
function twoBoxes(): YodoDocument {
  return add(createDocument('t'), [
    { type: 'rectangle', id: 'a', x: 0, y: 0, width: 100, height: 50 },
    { type: 'rectangle', id: 'b', x: 200, y: 0, width: 100, height: 50 },
  ])
}

function ends(arrow: ArrowElement): [number, number][] {
  const first = arrow.points[0]!
  const last = arrow.points[arrow.points.length - 1]!
  return [
    [arrow.x + first[0], arrow.y + first[1]],
    [arrow.x + last[0], arrow.y + last[1]],
  ]
}

describe('addElements', () => {
  it('builds every spec type as a valid element with the built-in style', () => {
    const { doc, ids } = ok(
      addElements(
        createDocument('t'),
        [
          { type: 'rectangle', x: 0, y: 0, width: 10, height: 10 },
          { type: 'diamond', x: 0, y: 0, width: 10, height: 10 },
          { type: 'ellipse', x: 0, y: 0, width: 10, height: 10 },
          { type: 'note', x: 0, y: 0 },
          { type: 'text', x: 0, y: 0, text: 'hi' },
          {
            type: 'line',
            points: [
              [0, 0],
              [10, 10],
            ],
          },
          {
            type: 'arrow',
            points: [
              [0, 0],
              [10, 0],
            ],
          },
        ],
        measure,
      ),
    )
    expect(ids).toHaveLength(7)
    expect(new Set(ids).size).toBe(7)
    expect(doc.elements.map((e) => e.type)).toEqual([
      'rectangle',
      'diamond',
      'ellipse',
      'note',
      'text',
      'line',
      'arrow',
    ])
    expect(doc.elements.every(isElement)).toBe(true)
    expect(doc.elements[0]).toMatchObject({
      strokeColor: '#1E1F22',
      angle: 0,
      roundness: 'sharp',
    })
    expect(doc.elements[3]).toMatchObject({ width: 200, height: 200 })
    expect(byId<ArrowElement>(doc, ids[6]!).endArrowhead).toBe('arrow')
  })

  it('stores absolute points relative to the first one', () => {
    const doc = add(createDocument('t'), [
      {
        type: 'line',
        id: 'l',
        points: [
          [50, 20],
          [10, 80],
          [90, 60],
        ],
      },
    ])
    expect(byId(doc, 'l')).toMatchObject({
      x: 50,
      y: 20,
      width: 80,
      height: 60,
      points: [
        [0, 0],
        [-40, 60],
        [40, 40],
      ],
    })
  })

  it('applies the spec style and keeps an agent id', () => {
    const doc = add(createDocument('t'), [
      {
        type: 'ellipse',
        id: 'e1',
        x: 1,
        y: 2,
        width: 3,
        height: 4,
        strokeColor: '#ff0000',
        backgroundColor: '#00ff00',
        fillStyle: 'solid',
        opacity: 50,
      },
    ])
    expect(byId(doc, 'e1')).toMatchObject({
      type: 'ellipse',
      strokeColor: '#ff0000',
      backgroundColor: '#00ff00',
      fillStyle: 'solid',
      opacity: 50,
    })
  })

  it('rejects an id already in the drawing or repeated in the call', () => {
    const doc = twoBoxes()
    const spec = { type: 'rectangle', x: 0, y: 0, width: 1, height: 1 } as const
    expect(errorOf(addElements(doc, [{ ...spec, id: 'a' }], measure))).toMatch(
      /"a" is already used/,
    )
    expect(
      errorOf(
        addElements(
          doc,
          [
            { ...spec, id: 'c' },
            { ...spec, id: 'c' },
          ],
          measure,
        ),
      ),
    ).toMatch(/"c" is already used/)
  })

  it('refuses a malformed id or a transparent note in the schema', () => {
    const base = { type: 'rectangle', x: 0, y: 0, width: 1, height: 1 }
    expect(newElementSpec.safeParse({ ...base, id: 'a b' }).success).toBe(false)
    expect(
      newElementSpec.safeParse({
        type: 'note',
        x: 0,
        y: 0,
        backgroundColor: 'transparent',
      }).success,
    ).toBe(false)
  })

  it('sizes text with the measure', () => {
    const doc = add(createDocument('t'), [
      { type: 'text', id: 't', x: 5, y: 5, text: 'hello\nab', fontSize: 20 },
    ])
    expect(byId<TextElement>(doc, 't')).toMatchObject({
      width: 50,
      height: 2 * 20 * 1.25,
      text: 'hello\nab',
    })
  })

  it('centres a label by default, keeps a chosen alignment and grows the box', () => {
    const doc = add(createDocument('t'), [
      {
        type: 'rectangle',
        id: 'c',
        x: 0,
        y: 0,
        width: 100,
        height: 40,
        label: 'Log in',
      },
      {
        type: 'rectangle',
        id: 'r',
        x: 0,
        y: 0,
        width: 100,
        height: 20,
        label: 'one two three four five six',
        textAlign: 'right',
        fontFamily: 'sans',
      },
    ])
    expect(byId<RectangleElement>(doc, 'c').label).toMatchObject({
      text: 'Log in',
      textAlign: 'center',
      fontFamily: 'hand',
    })
    const right = byId<RectangleElement>(doc, 'r')
    expect(right.label).toMatchObject({
      textAlign: 'right',
      fontFamily: 'sans',
    })
    expect(right.height).toBeGreaterThan(20)
  })
})

describe('updateElements', () => {
  it('moves a shape and its bound arrow follows', () => {
    let doc = connect(twoBoxes(), [{ from: 'a', to: 'b', id: 'ab' }])
    const before = ends(byId<ArrowElement>(doc, 'ab'))
    doc = update(doc, [{ id: 'b', y: 100 }])
    const arrow = byId<ArrowElement>(doc, 'ab')
    expect(arrow.endBinding?.elementId).toBe('b')
    expect(ends(arrow)[1][1]).toBeGreaterThan(before[1][1])
  })

  it('detaches a bound arrow that is moved on its own', () => {
    let doc = connect(twoBoxes(), [{ from: 'a', to: 'b', id: 'ab' }])
    doc = update(doc, [{ id: 'ab', y: 300 }])
    const arrow = byId<ArrowElement>(doc, 'ab')
    expect(arrow.startBinding).toBeUndefined()
    expect(arrow.endBinding).toBeUndefined()
  })

  it('detaches only the end a points patch moves, even with the same box', () => {
    let doc = connect(twoBoxes(), [{ from: 'a', to: 'b', id: 'ab' }])
    const [start, end] = ends(byId<ArrowElement>(doc, 'ab'))
    // A bend that keeps both ends gives a new box, but no end moved.
    doc = update(doc, [{ id: 'ab', points: [start, [150, 25], end] }])
    let arrow = byId<ArrowElement>(doc, 'ab')
    expect(arrow.startBinding?.elementId).toBe('a')
    expect(arrow.endBinding?.elementId).toBe('b')
    // Swap the bend's role: the end moves inside the old box.
    doc = update(doc, [{ id: 'ab', points: [start, end, [150, 25]] }])
    arrow = byId<ArrowElement>(doc, 'ab')
    expect(arrow.startBinding?.elementId).toBe('a')
    expect(arrow.endBinding).toBeUndefined()
  })

  it('makes an arrow attached along a line follow when the line is curved', () => {
    let doc = add(createDocument('t'), [
      {
        type: 'line',
        id: 'l',
        points: [
          [0, 0],
          [100, 100],
          [200, 0],
        ],
      },
      { type: 'rectangle', id: 'box', x: 0, y: 300, width: 50, height: 50 },
    ])
    doc = connect(doc, [{ from: 'box', to: 'l', id: 'arr' }])
    const along = byId<ArrowElement>(doc, 'arr').endBinding
    expect(along && 'along' in along).toBe(true)
    const before = ends(byId<ArrowElement>(doc, 'arr'))[1]
    doc = update(doc, [{ id: 'l', curved: true }])
    expect(byId(doc, 'l')).toMatchObject({ curved: true })
    const after = ends(byId<ArrowElement>(doc, 'arr'))[1]
    expect(after).not.toEqual(before)
    expect(byId<ArrowElement>(doc, 'arr').endBinding?.elementId).toBe('l')
  })

  it('sets, restyles and removes a label, keeping its alignment', () => {
    let doc = twoBoxes()
    doc = update(doc, [{ id: 'a', label: 'Start', textAlign: 'left' }])
    expect(byId<RectangleElement>(doc, 'a').label).toMatchObject({
      text: 'Start',
      textAlign: 'left',
    })
    doc = update(doc, [{ id: 'a', fontSize: 30 }])
    expect(byId<RectangleElement>(doc, 'a').label).toMatchObject({
      text: 'Start',
      textAlign: 'left',
      fontSize: 30,
    })
    doc = update(doc, [{ id: 'a', label: '' }])
    expect(byId<RectangleElement>(doc, 'a').label).toBeUndefined()
  })

  it('re-measures text when its text or size changes', () => {
    let doc = add(createDocument('t'), [
      { type: 'text', id: 't', x: 0, y: 0, text: 'ab' },
    ])
    doc = update(doc, [{ id: 't', text: 'abcd' }])
    expect(byId(doc, 't').width).toBe(40)
  })

  it('refuses a field the element type does not have', () => {
    const doc = add(twoBoxes(), [
      { type: 'text', id: 't', x: 0, y: 0, text: 'ab' },
    ])
    expect(
      errorOf(updateElements(doc, [{ id: 't', width: 5 }], measure)),
    ).toMatch(/"t" is a text.*width/)
    expect(
      errorOf(
        updateElements(
          doc,
          [
            {
              id: 'a',
              points: [
                [0, 0],
                [1, 1],
              ],
            },
          ],
          measure,
        ),
      ),
    ).toMatch(/points/)
  })

  it('refuses a font change on a box without a label', () => {
    expect(
      errorOf(updateElements(twoBoxes(), [{ id: 'a', fontSize: 30 }], measure)),
    ).toMatch(/no label/)
  })

  it('refuses a transparent note', () => {
    const doc = add(createDocument('t'), [
      { type: 'note', id: 'n', x: 0, y: 0 },
    ])
    expect(
      errorOf(
        updateElements(
          doc,
          [{ id: 'n', backgroundColor: 'transparent' }],
          measure,
        ),
      ),
    ).toMatch(/note.*transparent/)
  })

  it('refuses an unknown id and changes nothing', () => {
    const doc = twoBoxes()
    expect(
      errorOf(
        updateElements(
          doc,
          [
            { id: 'a', x: 5 },
            { id: 'zz', x: 1 },
          ],
          measure,
        ),
      ),
    ).toMatch(/No element with id "zz"/)
  })
})

describe('deleteElements', () => {
  it('removes the elements and unbinds arrows from them', () => {
    let doc = connect(twoBoxes(), [{ from: 'a', to: 'b', id: 'ab' }])
    const { doc: after, ids } = ok(deleteElements(doc, ['b']))
    doc = after
    expect(ids).toEqual(['b'])
    expect(doc.elements.map((e) => e.id)).toEqual(['a', 'ab'])
    const arrow = byId<ArrowElement>(doc, 'ab')
    expect(arrow.startBinding?.elementId).toBe('a')
    expect(arrow.endBinding).toBeUndefined()
  })

  it('refuses an unknown id', () => {
    expect(errorOf(deleteElements(twoBoxes(), ['nope']))).toMatch(/"nope"/)
  })
})

describe('connectElements', () => {
  it('binds both ends to the facing sides of two shapes', () => {
    const doc = connect(twoBoxes(), [{ from: 'a', to: 'b', id: 'ab' }])
    const arrow = byId<ArrowElement>(doc, 'ab')
    expect(arrow.startBinding?.elementId).toBe('a')
    expect(arrow.endBinding?.elementId).toBe('b')
    expect(arrow.endArrowhead).toBe('arrow')
    const [start, end] = ends(arrow)
    expect(start[0]).toBeCloseTo(100)
    expect(end[0]).toBeCloseTo(200)
    expect(isElement(arrow)).toBe(true)
  })

  it('chains onto an arrow made earlier in the same call', () => {
    const doc = add(twoBoxes(), [
      { type: 'rectangle', id: 'c', x: 100, y: 200, width: 100, height: 50 },
    ])
    const { doc: after, ids } = ok(
      connectElements(doc, [
        { from: 'a', to: 'b', id: 'ab' },
        { from: 'c', to: 'ab', id: 'c-ab', endArrowhead: null },
      ]),
    )
    expect(ids).toEqual(['ab', 'c-ab'])
    const chained = byId<ArrowElement>(after, 'c-ab')
    expect(chained.endBinding).toMatchObject({ elementId: 'ab' })
    expect(chained.endArrowhead).toBeNull()
  })

  it('refuses a missing, repeated or unbindable target', () => {
    const doc = add(twoBoxes(), [
      { type: 'text', id: 't', x: 0, y: 200, text: 'x' },
    ])
    expect(errorOf(connectElements(doc, [{ from: 'a', to: 'zz' }]))).toMatch(
      /No element with id "zz"/,
    )
    expect(errorOf(connectElements(doc, [{ from: 'a', to: 'a' }]))).toMatch(
      /itself/,
    )
    expect(errorOf(connectElements(doc, [{ from: 'a', to: 't' }]))).toMatch(
      /can't attach to a text/,
    )
    expect(
      errorOf(connectElements(doc, [{ from: 'a', to: 'b', id: 'a' }])),
    ).toMatch(/"a" is already used/)
  })

  it('refuses two shapes whose arrow would have no length', () => {
    const doc = add(createDocument('t'), [
      { type: 'rectangle', id: 'a', x: 0, y: 0, width: 100, height: 100 },
      { type: 'rectangle', id: 'b', x: 0, y: 0, width: 100, height: 100 },
    ])
    expect(errorOf(connectElements(doc, [{ from: 'a', to: 'b' }]))).toMatch(
      /overlap/,
    )
  })
})

describe('validation', () => {
  it('rejects the whole call when an element would be malformed', () => {
    // The schema stops NaN; a hand-built spec shows the validate.ts gate.
    const result = addElements(
      createDocument('t'),
      [
        { type: 'rectangle', id: 'fine', x: 0, y: 0, width: 1, height: 1 },
        {
          type: 'rectangle',
          id: 'bad',
          x: Number.NaN,
          y: 0,
          width: 1,
          height: 1,
        },
      ],
      measure,
    )
    expect(errorOf(result)).toMatch(/"bad".*isn't valid/)
  })
})
