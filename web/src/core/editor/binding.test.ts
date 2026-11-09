import { describe, expect, test } from 'vitest'
import { createLinear, createShape } from '../document/create.ts'
import type {
  ArrowElement,
  ShapeBinding,
  YodoElement,
} from '../document/types.ts'
import { lineFromDrag } from '../geometry/line.ts'
import { resizeTransform } from '../geometry/resize.ts'
import {
  bindableAt,
  type BindableElement,
  dropEnd,
  moveEnd,
  bendLine,
  movePoint,
  followBindings,
  pointAlong,
  pointOf,
  remapBindings,
  snapToOutline,
  snapToPath,
  unbindDeleted,
} from './binding.ts'
import { moveElements, resizeElements } from './selection.ts'

const box = { x: 0, y: 0, width: 100, height: 100 }
const rect = createShape('rectangle', box)
const roundRect = { ...rect, id: 'round', roundness: 'round' as const }
const diamond = createShape('diamond', box)
const ellipse = createShape('ellipse', box)

function arrowBetween(
  from: BindableElement,
  to: BindableElement,
  start: [number, number],
  end: [number, number],
): ArrowElement {
  const a = createLinear('arrow', lineFromDrag(start, end, false))
  return {
    ...a,
    startBinding: snapToOutline(from, start).binding,
    endBinding: snapToOutline(to, end).binding,
  }
}

describe('snapToOutline', () => {
  test('a point outside a rectangle lands on the nearest edge', () => {
    const { point, binding } = snapToOutline(rect, [150, 40])
    expect(point).toEqual([100, 40])
    expect(binding).toEqual({ elementId: rect.id, ratio: [1, 0.4] })
  })

  test('a point inside lands on the nearest edge', () => {
    expect(snapToOutline(rect, [10, 50]).point).toEqual([0, 50])
  })

  test('a diamond is snapped to its slanted edge', () => {
    const [x, y] = snapToOutline(diamond, [0, 0]).point
    // The top-left edge runs from (0, 50) to (50, 0): x + y = 50.
    expect(x + y).toBeCloseTo(50, 5)
  })

  test('an ellipse is snapped onto its curve', () => {
    const [x, y] = snapToOutline(ellipse, [150, 50]).point
    expect(x).toBeCloseTo(100, 0)
    expect(y).toBeCloseTo(50, 0)
  })

  test('a round rectangle is snapped onto its curve, not the box corner', () => {
    const [x, y] = snapToOutline(roundRect, [-5, -5]).point
    // The corner is cut: the nearest drawn point is inside the box corner.
    expect(x).toBeGreaterThan(1)
    expect(y).toBeGreaterThan(1)
  })

  test('pointOf maps a ratio back into the box', () => {
    expect(pointOf({ ...rect, x: 10, y: 20, width: 200 }, [0.5, 0.25])).toEqual(
      [110, 45],
    )
  })
})

describe('bindableAt', () => {
  test('finds the topmost shape, including its empty middle', () => {
    expect(bindableAt([rect], [50, 50], 4)?.id).toBe(rect.id)
  })

  test('ignores pencil strokes and anything out of reach', () => {
    const stroke = {
      ...createLinear('line', lineFromDrag([0, 0], [100, 100], false)),
      type: 'pencil' as const,
    }
    expect(bindableAt([stroke], [50, 50], 4)).toBeNull()
    expect(bindableAt([rect], [300, 300], 4)).toBeNull()
  })
})

describe('followBindings', () => {
  const a = createShape('rectangle', { x: 0, y: 0, width: 100, height: 100 })
  const b = createShape('rectangle', { x: 300, y: 0, width: 100, height: 100 })

  test('moving the target moves the bound end only', () => {
    const arrow = arrowBetween(a, b, [100, 50], [300, 50])
    const moved = moveElements([a, b, arrow], new Set([b.id]), 0, 100)
    const result = moved[2] as ArrowElement
    expect([result.x, result.y]).toEqual([100, 50])
    expect(result.points).toEqual([
      [0, 0],
      [200, 100],
    ])
    expect(result.startBinding).toEqual(arrow.startBinding)
  })

  test('moving the source moves the start and rebases the origin', () => {
    const arrow = arrowBetween(a, b, [100, 50], [300, 50])
    const moved = moveElements([a, b, arrow], new Set([a.id]), -20, 30)
    const result = moved[2] as ArrowElement
    expect([result.x, result.y]).toEqual([80, 80])
    expect(result.points[1]).toEqual([220, -30])
    expect([result.width, result.height]).toEqual([220, 30])
  })

  test('moving the arrow and both shapes together keeps it attached', () => {
    const arrow = arrowBetween(a, b, [100, 50], [300, 50])
    const ids = new Set([a.id, b.id, arrow.id])
    const result = moveElements([a, b, arrow], ids, 10, 10)[2] as ArrowElement
    expect(result.startBinding).toBeDefined()
    expect(result.endBinding).toBeDefined()
    expect([result.x, result.y]).toEqual([110, 60])
    expect(result.points).toEqual([
      [0, 0],
      [200, 0],
    ])
  })

  test('moving the arrow alone detaches it', () => {
    const arrow = arrowBetween(a, b, [100, 50], [300, 50])
    const result = moveElements([a, b, arrow], new Set([arrow.id]), 0, 40)[2]
    expect(result).not.toHaveProperty('startBinding')
    expect(result).not.toHaveProperty('endBinding')
  })

  test('moving the arrow with only its source keeps just that end', () => {
    const arrow = arrowBetween(a, b, [100, 50], [300, 50])
    const ids = new Set([arrow.id, a.id])
    const result = moveElements([a, b, arrow], ids, 0, 40)[2]
    expect(result).toHaveProperty('startBinding')
    expect(result).not.toHaveProperty('endBinding')
  })

  test('resizing the target keeps the end on its edge', () => {
    const arrow = arrowBetween(a, b, [100, 50], [300, 25])
    const t = resizeTransform(
      { x: 300, y: 0, width: 100, height: 100 },
      'se',
      [400, 100],
      [500, 300],
      false,
    )
    const result = resizeElements([a, b, arrow], new Set([b.id]), t)[2]
    const end = (result as ArrowElement).points[1]!
    // Ratio (0, 0.25) of a box now 200 wide and 300 tall.
    expect([result.x + end[0], result.y + end[1]]).toEqual([300, 75])
  })

  test('a round shape keeps the end on its curve across the radius cap', () => {
    const small = {
      ...createShape('rectangle', { x: 0, y: 0, width: 100, height: 100 }),
      roundness: 'round' as const,
    }
    const arrow = createLinear('arrow', lineFromDrag([-50, -50], [0, 0], false))
    const attached: ArrowElement = {
      ...arrow,
      endBinding: snapToOutline(small, [0, 0]).binding,
    }
    const t = resizeTransform(
      { x: 0, y: 0, width: 100, height: 100 },
      'se',
      [100, 100],
      [400, 400],
      false,
    )
    const [shape, result] = resizeElements(
      [small, attached],
      new Set([small.id]),
      t,
    ) as [typeof small, ArrowElement]
    const [ex, ey] = [
      result.x + result.points[1]![0],
      result.y + result.points[1]![1],
    ]
    // Radius is now 32 (was 25): the corner curve is cut by about 9.4 on the diagonal.
    const rebound = snapToOutline(shape, [ex, ey]).point
    expect(Math.hypot(ex - rebound[0], ey - rebound[1])).toBeLessThan(0.01)
    // The plain ratio point (25, 25) is off the curve; the end was moved onto it.
    expect(Math.hypot(ex - 25, ey - 25)).toBeGreaterThan(1)
  })

  test('a bend keeps its world position when one end moves', () => {
    const bent: ArrowElement = {
      ...arrowBetween(a, b, [100, 50], [300, 50]),
      points: [
        [0, 0],
        [100, -80],
        [200, 0],
      ],
      width: 200,
      height: 80,
    }
    const arrow = moveElements(
      [a, b, bent],
      new Set([b.id]),
      0,
      100,
    )[2] as ArrowElement
    expect(arrow.points).toEqual([
      [0, 0],
      [100, -80],
      [200, 100],
    ])
    expect(arrow.height).toBe(180)
  })

  test('a binding to a missing or unbindable element is cleared', () => {
    const arrow = arrowBetween(a, b, [100, 50], [300, 50])
    const line = {
      ...createLinear('line', lineFromDrag([0, 0], [5, 5], false)),
      id: b.id,
    }
    const result = followBindings([a, line, arrow], new Set([a.id]))[2]
    expect(result).toHaveProperty('startBinding')
    expect(result).not.toHaveProperty('endBinding')
  })

  test('elements that are not involved keep their identity', () => {
    const arrow = arrowBetween(a, b, [100, 50], [300, 50])
    const other = createShape('ellipse', box)
    const result = moveElements([a, b, arrow, other], new Set([b.id]), 5, 0)
    expect(result[0]).toBe(a)
    expect(result[3]).toBe(other)
  })
})

describe('followBindings, review fixes', () => {
  const a = createShape('rectangle', { x: 0, y: 0, width: 100, height: 100 })

  test('a flipped resize mirrors the attachment to the other side', () => {
    const arrow = arrowBetween(a, a, [100, 50], [100, 50])
    const attached: ArrowElement = {
      ...createLinear('arrow', lineFromDrag([100, 50], [200, 50], false)),
      startBinding: arrow.startBinding,
    }
    // Flip the selection horizontally around x = 0.
    const flipped = resizeElements([a, attached], new Set([a.id]), {
      anchor: [0, 0],
      sx: -1,
      sy: 1,
    })
    const [shape, result] = flipped as [typeof a, ArrowElement]
    expect(shape.x).toBe(-100)
    expect([result.x, result.y]).toEqual([-100, 50])
    expect((result.startBinding as ShapeBinding).ratio).toEqual([0, 0.5])
  })

  test('an arrow with no points is detached instead of crashing', () => {
    const broken = {
      ...createLinear('arrow', lineFromDrag([0, 0], [10, 0], false)),
      points: [],
      endBinding: { elementId: a.id, ratio: [1, 0.5] as [number, number] },
    } as ArrowElement
    const result = moveElements([a, broken], new Set([a.id]), 5, 5)[1]
    expect(result).not.toHaveProperty('endBinding')
  })
})

describe('unbindDeleted', () => {
  test('clears bindings to deleted elements and leaves the arrow', () => {
    const a = createShape('rectangle', box)
    const b = createShape('rectangle', { ...box, x: 300 })
    const arrow = arrowBetween(a, b, [100, 50], [300, 50])
    const [result] = unbindDeleted([a, arrow], new Set([b.id])).filter(
      (e) => e.type === 'arrow',
    )
    expect(result).toHaveProperty('startBinding')
    expect(result).not.toHaveProperty('endBinding')
    expect((result as ArrowElement).points).toEqual(arrow.points)
  })

  test('returns the same elements when no arrow is affected', () => {
    const list = [rect, ellipse]
    expect(unbindDeleted(list, new Set(['gone']))).toBe(list)
  })
})

describe('remapBindings', () => {
  test('points the copy at the copied target and drops the rest', () => {
    const a = createShape('rectangle', box)
    const b = createShape('rectangle', { ...box, x: 300 })
    const arrow = arrowBetween(a, b, [100, 50], [300, 50])
    const [copy] = remapBindings([arrow], new Map([[a.id, 'a2']])) as [
      ArrowElement,
    ]
    expect(copy.startBinding?.elementId).toBe('a2')
    expect(copy.startBinding).toEqual({
      ...arrow.startBinding,
      elementId: 'a2',
    })
    expect(copy).not.toHaveProperty('endBinding')
  })
})

describe('moveEnd', () => {
  const free = createLinear('arrow', lineFromDrag([0, 300], [100, 300], false))
  const binding = { elementId: 'x', ratio: [0, 0.5] as [number, number] }

  test('puts the end at the point and binds it', () => {
    const moved = moveEnd(free, 'end', [200, 50], binding)
    expect(moved).toMatchObject({
      x: 0,
      y: 300,
      width: 200,
      height: 250,
      points: [
        [0, 0],
        [200, -250],
      ],
      endBinding: binding,
    })
    expect(moved).not.toHaveProperty('startBinding')
  })

  test('with no binding it frees the end and keeps the other one', () => {
    const attached = { ...free, startBinding: binding, endBinding: binding }
    const moved = moveEnd(attached, 'end', [5, 5], null)
    expect(moved).not.toHaveProperty('endBinding')
    expect(moved.startBinding).toEqual(binding)
  })

  test('moving the start rebases the origin and keeps the end and a bend', () => {
    const bent: ArrowElement = {
      ...free,
      points: [
        [0, 0],
        [50, 40],
        [100, 0],
      ],
    }
    const moved = moveEnd(bent, 'start', [-20, 290], null)
    const world = moved.points.map(([px, py]) => [moved.x + px, moved.y + py])
    expect(world).toEqual([
      [-20, 290],
      [50, 340],
      [100, 300],
    ])
  })
})

describe('dropEnd', () => {
  const target = { ...rect, id: 'target', backgroundColor: '#E0E9FB' }
  const other = {
    ...createShape('rectangle', { x: 300, y: 0, width: 100, height: 100 }),
    id: 'other',
  }
  const free = createLinear('arrow', lineFromDrag([0, 300], [100, 300], false))

  test('snaps onto the outline of the shape under the point', () => {
    const drop = dropEnd([target, free], free, 'end', [90, 50], 6)
    expect(drop.point).toEqual([100, 50])
    expect(drop.binding).toEqual({ elementId: 'target', ratio: [1, 0.5] })
    expect(drop.target).toBe(target)
  })

  test('stays free over empty space', () => {
    expect(dropEnd([target, free], free, 'end', [500, 500], 6)).toEqual({
      point: [500, 500],
      binding: null,
      target: null,
    })
  })

  test('the shape at the other end is no target', () => {
    const attached = {
      ...free,
      startBinding: { elementId: 'target', ratio: [0, 0] as [number, number] },
    }
    const drop = dropEnd(
      [target, other, attached],
      attached,
      'end',
      [50, 50],
      6,
    )
    expect(drop.binding).toBeNull()
    expect(drop.target).toBeNull()
  })
})

describe('bending and moving points (ADR 0053)', () => {
  const line = createLinear('line', lineFromDrag([10, 10], [110, 10], false))
  const arrow = arrowBetween(
    rect,
    { ...rect, id: 'far', x: 300 },
    [100, 50],
    [300, 50],
  )

  test('bendLine inserts a point where it is dragged and makes a curve', () => {
    const bent = bendLine(line, [60, 70])
    expect(bent.curved).toBe(true)
    expect(bent.points).toEqual([
      [0, 0],
      [50, 60],
      [100, 0],
    ])
    expect(bent.x).toBe(10)
  })

  test('the first point stays the origin, so points can be negative', () => {
    const bent = bendLine(line, [60, -40])
    expect(bent).toMatchObject({ x: 10, y: 10, width: 100, height: 50 })
    expect(bent.points[1]).toEqual([50, -50])
  })

  test('bending a bound arrow keeps its bindings and ends', () => {
    const bent = bendLine(arrow, [200, 0])
    expect(bent.startBinding).toEqual(arrow.startBinding)
    expect(bent.endBinding).toEqual(arrow.endBinding)
    expect(bent.points).toHaveLength(3)
    expect(bent.points.at(-1)).toEqual(arrow.points.at(-1))
  })

  test('movePoint moves one point and recomputes the box', () => {
    const bent = bendLine(line, [60, 70])
    const moved = movePoint(bent, 1, [60, 10 - 30])
    expect(moved.points).toEqual([
      [0, 0],
      [50, -30],
      [100, 0],
    ])
    expect(moved).toMatchObject({ width: 100, height: 30, curved: true })
  })

  test('followBindings keeps the curve of an arrow that follows its shape', () => {
    const bent = bendLine(arrow, [200, 0])
    const [, , followed] = followBindings(
      [rect, { ...rect, id: 'far', x: 300 }, bent],
      new Set(['far']),
    ) as ArrowElement[]
    expect(followed!.curved).toBe(true)
  })
})

// Attaching to lines and arrows (roadmap 4.7, ADR 0054).
describe('path targets', () => {
  const target = createLinear('line', lineFromDrag([0, 0], [100, 0], false))
  const bentTarget = {
    ...createLinear('line', lineFromDrag([0, 0], [100, 0], false)),
    id: 'bent',
    points: [
      [0, 0],
      [50, 40],
      [100, 0],
    ] as [number, number][],
    curved: true as const,
  }
  const corner = {
    ...createLinear('line', lineFromDrag([0, 0], [100, 100], false)),
    id: 'corner',
    points: [
      [0, 0],
      [100, 0],
      [100, 100],
    ] as [number, number][],
  }

  function arrowTo(t: YodoElement, along: number): ArrowElement {
    const a = createLinear('arrow', lineFromDrag([0, 200], [0, 100], false))
    return { ...a, endBinding: { elementId: t.id, along } }
  }

  test('snapToPath lands on the nearest point and stores the arc-length fraction', () => {
    const { point, binding } = snapToPath(target, [25, 30])
    expect(point).toEqual([25, 0])
    expect(binding).toEqual({ elementId: target.id, along: 0.25 })
  })

  test('snapToPath follows a curve, and pointAlong inverts it', () => {
    const { point, binding } = snapToPath(bentTarget, [50, 60])
    expect(point[0]).toBeCloseTo(50, 0)
    expect(point[1]).toBeGreaterThan(20)
    const again = pointAlong(bentTarget, (binding as { along: number }).along)!
    expect(again[0]).toBeCloseTo(point[0], 3)
    expect(again[1]).toBeCloseTo(point[1], 3)
  })

  test('a zero-length or empty target resolves to its first point or nothing', () => {
    const dot = {
      ...target,
      points: [
        [0, 0],
        [0, 0],
      ] as [number, number][],
    }
    expect(snapToPath(dot, [5, 5]).binding).toMatchObject({ along: 0 })
    expect(pointAlong(dot, 0.7)).toEqual([0, 0])
    expect(pointAlong({ ...target, points: [] }, 0.5)).toBeNull()
  })

  test('bindableAt finds a line or arrow near the point, not far from it', () => {
    expect(bindableAt([target], [40, 3], 6)?.id).toBe(target.id)
    expect(bindableAt([target], [40, 30], 6)).toBeNull()
  })

  test('the attached end follows when the target moves', () => {
    const a = arrowTo(target, 0.5)
    const moved = moveElements([target, a], new Set([target.id]), 10, 20)
    const result = moved[1] as ArrowElement
    expect([
      result.x + result.points[1]![0],
      result.y + result.points[1]![1],
    ]).toEqual([60, 20])
  })

  test('the end follows a uniform resize of the target', () => {
    const a = arrowTo(target, 0.5)
    const t = resizeTransform(
      { x: 0, y: 0, width: 100, height: 0 },
      'e',
      [100, 0],
      [200, 0],
      false,
    )
    const result = resizeElements(
      [target, a],
      new Set([target.id]),
      t,
    )[1] as ArrowElement
    expect(result.x + result.points[1]![0]).toBeCloseTo(100, 5)
  })

  test('the end follows a mirrored resize on the same fraction of the path', () => {
    const a = arrowTo(corner, 0.5)
    const t = resizeTransform(
      { x: 0, y: 0, width: 100, height: 100 },
      'w',
      [0, 50],
      [200, 50],
      false,
    )
    const result = resizeElements(
      [corner, a],
      new Set([corner.id]),
      t,
    )[1] as ArrowElement
    // The corner (along 0.5) mirrors with the path: x 100 -> 100 (flipped about x = 100).
    expect(result.endBinding).toEqual({ elementId: corner.id, along: 0.5 })
  })

  test('non-uniform scaling keeps the arc-length fraction, so the end can slide off a corner', () => {
    const a = arrowTo(corner, 0.5)
    const t = resizeTransform(
      { x: 0, y: 0, width: 100, height: 100 },
      'e',
      [100, 50],
      [200, 50],
      false,
    )
    const resized = resizeElements([corner, a], new Set([corner.id]), t)
    const line = resized[0] as typeof corner
    const result = resized[1] as ArrowElement
    const end = [
      result.x + result.points[1]![0],
      result.y + result.points[1]![1],
    ]
    // Width doubled, height kept: the corner is at (200, 0) but along 0.5 is (150, 0).
    expect(line.points[1]![0]).toBe(200)
    expect(end).toEqual([150, 0])
  })

  test('editing the target (bend, point drag) moves the end with `edited`', () => {
    const a = arrowTo(target, 0.5)
    const bent = bendLine(target, [50, 40])
    const result = followBindings(
      [bent, a],
      new Set(),
      { x: false, y: false },
      new Set([bent.id]),
    )[1] as ArrowElement
    const end = [
      result.x + result.points[1]![0],
      result.y + result.points[1]![1],
    ]
    expect(end[1]).toBeGreaterThan(10)
    expect(end[0]).toBeCloseTo(50, 0)
  })

  test('moving the arrow without its target detaches the end', () => {
    const a = arrowTo(target, 0.5)
    const moved = moveElements(
      [target, a],
      new Set([a.id]),
      5,
      5,
    )[1] as ArrowElement
    expect(moved.endBinding).toBeUndefined()
  })

  test('a chain follows in one pass: shape -> arrow B -> arrow A', () => {
    const s = createShape('rectangle', box)
    const b = createLinear('arrow', lineFromDrag([100, 50], [300, 50], false))
    const bBound = { ...b, startBinding: snapToOutline(s, [100, 50]).binding }
    const a = arrowTo(bBound, 0.5)
    const result = moveElements([s, bBound, a], new Set([s.id]), 0, 100)
    const follower = result[2] as ArrowElement
    // B now runs (100, 150) to (300, 50); A hangs on its middle, (200, 100).
    expect([
      follower.x + follower.points[1]![0],
      follower.y + follower.points[1]![1],
    ]).toEqual([200, 100])
  })

  test('a binding of the wrong kind for its target is detached', () => {
    const a = {
      ...arrowTo(target, 0.5),
      endBinding: { elementId: rect.id, along: 0.5 },
    }
    const result = followBindings(
      [rect, a],
      new Set([rect.id]),
    )[1] as ArrowElement
    expect(result.endBinding).toBeUndefined()
  })

  test('a target that is gone or a self-binding detaches without looping', () => {
    const self = { ...arrowTo(target, 0.5) }
    const looped = { ...self, endBinding: { elementId: self.id, along: 0.5 } }
    expect(
      (followBindings([looped], new Set([looped.id]))[0] as ArrowElement)
        .endBinding,
    ).toBeUndefined()
    const a = { ...arrowTo(target, 0.5), id: 'a' }
    const b = { ...arrowTo(a, 0.5), id: 'b' }
    const cyc = { ...a, endBinding: { elementId: 'b', along: 0.5 } }
    const out = followBindings(
      [cyc, b],
      new Set(['a']),
      { x: false, y: false },
      new Set(['a']),
    )
    expect(out).toHaveLength(2)
  })

  test('dropEnd offers lines but never the arrow itself or its dependants', () => {
    const free = createLinear('arrow', lineFromDrag([0, 200], [0, 100], false))
    expect(dropEnd([target, free], free, 'start', [40, 2], 6).target?.id).toBe(
      target.id,
    )
    // b hangs on a, so a's start over b (or over a itself) would make a loop.
    const a = { ...free, id: 'a' }
    const b = {
      ...createLinear('arrow', lineFromDrag([0, 50], [60, 0], false)),
      id: 'b',
      endBinding: { elementId: 'a', along: 0.5 },
    }
    expect(dropEnd([a, b], a, 'start', [30, 25], 6).target).toBeNull()
    expect(dropEnd([a, b], a, 'start', [0, 150], 6).target).toBeNull()
  })

  test('delete unbinds and duplicate remaps a path binding', () => {
    const a = arrowTo(target, 0.5)
    expect(
      (unbindDeleted([target, a], new Set([target.id]))[1] as ArrowElement)
        .endBinding,
    ).toBeUndefined()
    const copy = remapBindings(
      [a],
      new Map([[target.id, 'copy']]),
    )[0] as ArrowElement
    expect(copy.endBinding).toEqual({ elementId: 'copy', along: 0.5 })
  })
})
