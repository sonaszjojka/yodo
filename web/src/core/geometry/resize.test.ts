import { describe, expect, test } from 'vitest'
import { createLinear, createShape, createText } from '../document/create.ts'
import { lineFromDrag } from './line.ts'
import {
  canResize,
  flippedHandle,
  resizeTransform,
  scaleElement,
} from './resize.ts'

const box = { x: 0, y: 0, width: 100, height: 50 }

describe('resizeTransform', () => {
  test('a corner scales both axes from the opposite corner', () => {
    expect(resizeTransform(box, 'se', [100, 50], [150, 100], false)).toEqual({
      anchor: [0, 0],
      sx: 1.5,
      sy: 2,
    })
    expect(resizeTransform(box, 'nw', [0, 0], [50, 25], false)).toEqual({
      anchor: [100, 50],
      sx: 0.5,
      sy: 0.5,
    })
  })

  test('a side scales only its axis, from the opposite side', () => {
    expect(resizeTransform(box, 'e', [100, 25], [120, 90], false)).toEqual({
      anchor: [0, 25],
      sx: 1.2,
      sy: 1,
    })
    expect(resizeTransform(box, 'n', [50, 0], [80, 25], false)).toEqual({
      anchor: [50, 50],
      sx: 1,
      sy: 0.5,
    })
  })

  test('the grab offset is kept: only the pointer delta counts', () => {
    // Grabbed 3 units outside the corner (the handle sits on the outline).
    const t = resizeTransform(box, 'se', [103, 53], [153, 103], false)
    expect(t).toMatchObject({ sx: 1.5, sy: 2 })
  })

  test('dragging past the opposite side flips (negative scale)', () => {
    const t = resizeTransform(box, 'e', [100, 25], [-50, 25], false)
    expect(t).toMatchObject({ anchor: [0, 25], sx: -0.5, sy: 1 })
  })

  test('Shift on a corner keeps proportions, taking the larger scale', () => {
    const t = resizeTransform(box, 'se', [100, 50], [150, 60], true)
    expect(t).toMatchObject({ sx: 1.5, sy: 1.5 })
  })

  test('Shift on a corner keeps each axis direction when flipped', () => {
    const t = resizeTransform(box, 'se', [100, 50], [-200, 60], true)
    expect(t).toMatchObject({ sx: -2, sy: 2 })
  })

  test('Shift on a side scales the other axis around the centre', () => {
    const t = resizeTransform(box, 'e', [100, 25], [200, 25], true)
    expect(t).toEqual({ anchor: [0, 25], sx: 2, sy: 2 })
  })

  test('an axis with no size keeps scale 1', () => {
    const flat = { x: 0, y: 0, width: 100, height: 0 }
    expect(resizeTransform(flat, 'se', [100, 0], [200, 40], false)).toEqual({
      anchor: [0, 0],
      sx: 2,
      sy: 1,
    })
    expect(resizeTransform(flat, 's', [50, 0], [50, 40], false)).toMatchObject({
      sx: 1,
      sy: 1,
    })
  })

  test('Shift ignores an axis with no size', () => {
    const flat = { x: 0, y: 0, width: 100, height: 0 }
    const t = resizeTransform(flat, 'se', [100, 0], [50, 0], true)
    expect(t).toMatchObject({ sx: 0.5 })
  })

  test('a side dragged onto the opposite side keeps 1 unit, so it stays resizable', () => {
    expect(resizeTransform(box, 'e', [100, 25], [0, 25], false)).toMatchObject({
      sx: 0.01,
      sy: 1,
    })
    expect(resizeTransform(box, 'n', [50, 0], [50, 50], false)).toMatchObject({
      sx: 1,
      sy: 0.02,
    })
  })

  test('Shift onto the opposite corner shrinks to the minimum, not back to full size', () => {
    // 100×50 keeps its ratio, so the short side sets the minimum: 2×1.
    const t = resizeTransform(box, 'se', [100, 50], [0, 0], true)
    expect(t).toMatchObject({ sx: 0.02, sy: 0.02 })
  })

  test('Shift with no axis to scale keeps scale 1', () => {
    const flat = { x: 0, y: 0, width: 100, height: 0 }
    const t = resizeTransform(flat, 's', [50, 0], [50, 40], true)
    expect(t).toMatchObject({ sx: 1, sy: 1 })
  })
})

describe('scaleElement', () => {
  const rect = createShape('rectangle', { x: 10, y: 20, width: 40, height: 30 })

  test('maps a box through the anchor', () => {
    const scaled = scaleElement(rect, { anchor: [10, 20], sx: 2, sy: 0.5 })
    expect(scaled).toMatchObject({ x: 10, y: 20, width: 80, height: 15 })
    expect(scaled).toMatchObject({ id: rect.id, seed: rect.seed })
  })

  test('normalises a flipped box to a positive size', () => {
    const scaled = scaleElement(rect, { anchor: [10, 20], sx: -1, sy: 1 })
    expect(scaled).toMatchObject({ x: -30, y: 20, width: 40, height: 30 })
  })

  test('scales line points and mirrors them on a flip', () => {
    const line = createLinear('line', lineFromDrag([0, 0], [100, 50], false))
    const scaled = scaleElement(line, { anchor: [0, 0], sx: -0.5, sy: 2 })
    expect(scaled).toMatchObject({
      x: 0,
      y: 0,
      width: 50,
      height: 100,
      points: [
        [0, 0],
        [-50, 100],
      ],
    })
  })

  test('moves a line origin that is not the anchor', () => {
    const line = createLinear('arrow', lineFromDrag([10, 10], [20, 10], false))
    const scaled = scaleElement(line, { anchor: [0, 0], sx: 2, sy: 2 })
    expect(scaled).toMatchObject({ x: 20, y: 20, endArrowhead: 'arrow' })
  })
})

describe('canResize', () => {
  test('a handle resizes only if it pulls an axis that has a size', () => {
    const flat = { x: 0, y: 0, width: 100, height: 0 }
    expect(canResize(flat, 'n')).toBe(false)
    expect(canResize(flat, 'e')).toBe(true)
    expect(canResize(flat, 'se')).toBe(true)
    expect(canResize({ ...flat, width: 0 }, 'se')).toBe(false)
  })
})

describe('flippedHandle', () => {
  const t = { anchor: [0, 0] as [number, number], sx: 1, sy: 1 }
  test('a negative scale mirrors the handle on that axis', () => {
    expect(flippedHandle('se', t)).toBe('se')
    expect(flippedHandle('se', { ...t, sx: -1 })).toBe('sw')
    expect(flippedHandle('se', { ...t, sx: -1, sy: -1 })).toBe('nw')
    expect(flippedHandle('n', { ...t, sy: -0.5 })).toBe('s')
    expect(flippedHandle('n', { ...t, sx: -1 })).toBe('n')
  })
})

describe('scaleElement on text', () => {
  const text = {
    ...createText([10, 20], 1),
    text: 'Hi',
    width: 40,
    height: 25,
  }

  test('scales the font and box evenly, by the mean of both axes', () => {
    const scaled = scaleElement(text, { anchor: [10, 20], sx: 2, sy: 8 })
    expect(scaled).toMatchObject({
      x: 10,
      y: 20,
      width: 160,
      height: 100,
      fontSize: 4 * text.fontSize,
    })
  })

  test('never mirrors: a flip keeps the box at the transformed corner', () => {
    const scaled = scaleElement(text, { anchor: [50, 20], sx: -1, sy: 1 })
    expect(scaled).toMatchObject({ x: 50, y: 20, width: 40, height: 25 })
    expect(scaled).toMatchObject({ fontSize: text.fontSize })
  })

  test('a side handle keeps the opposite edge fixed and centres the other axis', () => {
    const wide = { ...text, x: 0, y: 0, width: 100, height: 20 }
    // The w handle dragged 100 px left: anchor is the right edge's middle.
    const scaled = scaleElement(wide, { anchor: [100, 10], sx: 2, sy: 1 })
    const s = Math.SQRT2
    expect(scaled.x + scaled.width).toBeCloseTo(100)
    expect(scaled.width).toBeCloseTo(100 * s)
    expect(scaled.y + scaled.height / 2).toBeCloseTo(10)
  })

  test('in a group, the edge nearest the anchor follows the group scale', () => {
    const far = { ...text, x: 100, y: 0, width: 50, height: 20 }
    const scaled = scaleElement(far, { anchor: [0, 0], sx: 2, sy: 0.5 })
    expect(scaled.x).toBeCloseTo(200)
    expect(scaled.y).toBeCloseTo(0)
  })

  test('a label keeps its font size when its shape scales', () => {
    const label = {
      text: 'Hi',
      fontFamily: 'hand',
      fontSize: 20,
      textAlign: 'center',
    } as const
    const shape = {
      ...createShape('rectangle', { x: 0, y: 0, width: 40, height: 30 }),
      label,
    }
    expect(scaleElement(shape, { anchor: [0, 0], sx: 3, sy: 3 })).toMatchObject(
      { label },
    )
  })
})
