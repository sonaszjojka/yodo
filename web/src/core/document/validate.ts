// Structural checks for elements that come from outside the app, such as a
// clipboard payload (ADR 0039). Only Yodo writes documents, so these are not
// used for saved drawings; a pasted element is untrusted and a bad number or a
// missing `points` array would break rendering, so anything malformed is
// dropped rather than repaired.
import type { Point, TextLabel, YodoElement } from './types.ts'

/** A payload with more elements than this is refused whole. */
export const MAX_PASTE_ELEMENTS = 10_000
/** Points per line, arrow or stroke. */
const MAX_POINTS = 100_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function oneOf(value: unknown, options: readonly string[]) {
  return typeof value === 'string' && options.includes(value)
}

const FONTS = ['hand', 'sans', 'mono']
const ALIGNS = ['left', 'center', 'right']

function isLabel(value: unknown): value is TextLabel {
  return (
    isRecord(value) &&
    typeof value.text === 'string' &&
    oneOf(value.fontFamily, FONTS) &&
    isNumber(value.fontSize) &&
    oneOf(value.textAlign, ALIGNS)
  )
}

function isPoints(value: unknown): value is Point[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_POINTS &&
    value.every((p) => Array.isArray(p) && p.length === 2 && p.every(isNumber))
  )
}

function hasBase(e: Record<string, unknown>) {
  return (
    typeof e.id === 'string' &&
    e.id !== '' &&
    ['x', 'y', 'width', 'height', 'angle', 'seed', 'strokeWidth'].every((key) =>
      isNumber(e[key]),
    ) &&
    isNumber(e.roughness) &&
    isNumber(e.opacity) &&
    typeof e.strokeColor === 'string' &&
    typeof e.backgroundColor === 'string' &&
    oneOf(e.fillStyle, ['hachure', 'cross-hatch', 'solid']) &&
    oneOf(e.strokeStyle, ['solid', 'dashed', 'dotted'])
  )
}

function isOptionalLabel(e: Record<string, unknown>) {
  return e.label === undefined || isLabel(e.label)
}

function isElement(value: unknown): value is YodoElement {
  if (!isRecord(value) || !hasBase(value)) return false
  switch (value.type) {
    case 'rectangle':
    case 'diamond':
      return (
        isOptionalLabel(value) &&
        (value.roundness === undefined ||
          oneOf(value.roundness, ['sharp', 'round']))
      )
    case 'ellipse':
    case 'note':
      return isOptionalLabel(value)
    case 'line':
    case 'pencil':
      return isPoints(value.points)
    case 'arrow':
      return (
        isPoints(value.points) &&
        (value.endArrowhead === null || value.endArrowhead === 'arrow')
      )
    case 'text':
      return (
        typeof value.text === 'string' &&
        oneOf(value.fontFamily, FONTS) &&
        isNumber(value.fontSize) &&
        oneOf(value.textAlign, ALIGNS)
      )
    default:
      return false
  }
}

/**
 * The well-formed elements of an untrusted value, in order. Elements that are
 * malformed or repeat an earlier id are dropped; a value that is not an array,
 * or is longer than `MAX_PASTE_ELEMENTS`, gives none.
 */
export function parseElements(value: unknown): YodoElement[] {
  if (!Array.isArray(value) || value.length > MAX_PASTE_ELEMENTS) return []
  const seen = new Set<string>()
  const result: YodoElement[] = []
  for (const item of value) {
    if (!isElement(item) || seen.has(item.id)) continue
    seen.add(item.id)
    result.push(item)
  }
  return result
}
