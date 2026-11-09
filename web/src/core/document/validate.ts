// Structural checks for elements that come from outside the app, such as a
// clipboard payload (ADR 0039). Only Yodo writes documents, so these are not
// used for saved drawings; a pasted element is untrusted and a bad number or a
// missing `points` array would break rendering, so anything malformed is
// dropped rather than repaired.
import type { Point, TextLabel, YodoElement } from './types.ts'

/** An image id is the lowercase hex SHA-256 of its bytes (ADR 0040). */
const FILE_ID = /^[0-9a-f]{64}$/

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

export function isElement(value: unknown): value is YodoElement {
  if (!isRecord(value) || !hasBase(value)) return false
  // Geometry code tells lines from boxes by the presence of `points`, so a box
  // or text carrying that key (even null) would crash it.
  if (
    value.type !== 'line' &&
    value.type !== 'arrow' &&
    value.type !== 'pencil' &&
    'points' in value
  ) {
    return false
  }
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
    case 'image':
      return (
        typeof value.fileId === 'string' &&
        FILE_ID.test(value.fileId) &&
        (value.width as number) > 0 &&
        (value.height as number) > 0
      )
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

function isBinding(value: unknown) {
  if (
    !isRecord(value) ||
    typeof value.elementId !== 'string' ||
    value.elementId === ''
  ) {
    return false
  }
  // A shape binding has a box ratio (ADR 0048), a path binding a fraction of
  // the path's length (ADR 0054).
  return 'along' in value
    ? !('ratio' in value) &&
        isNumber(value.along) &&
        value.along >= 0 &&
        value.along <= 1
    : Array.isArray(value.ratio) &&
        value.ratio.length === 2 &&
        value.ratio.every(isNumber)
}

/**
 * A valid element with its optional fields checked: a malformed arrow binding
 * is removed (ADR 0048) and a `curved` that is not `true` is dropped (ADR
 * 0053), keeping the element, since it still draws fine without them.
 * Anything else comes back as it is.
 */
export function sanitizeElement(element: YodoElement): YodoElement {
  if (element.type === 'line') return sanitizeCurved(element)
  if (element.type !== 'arrow') return element
  const { startBinding, endBinding, ...rest } = sanitizeCurved(element)
  const kept = {
    ...(isBinding(startBinding) ? { startBinding } : {}),
    ...(isBinding(endBinding) ? { endBinding } : {}),
  }
  const same =
    (startBinding === undefined) === !('startBinding' in kept) &&
    (endBinding === undefined) === !('endBinding' in kept) &&
    rest.curved === element.curved
  return same ? element : { ...rest, ...kept }
}

function sanitizeCurved<T extends { curved?: true }>(element: T): T {
  if (element.curved === undefined || element.curved === true) return element
  const { curved: _dropped, ...rest } = element
  return rest as T
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
    result.push(sanitizeElement(item))
  }
  return result
}
