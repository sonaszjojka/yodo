import type { LinearGeometry } from '../geometry/line.ts'
import type { Bounds } from '../geometry/rect.ts'
import {
  CURRENT_SCHEMA_VERSION,
  type ArrowElement,
  type BaseElement,
  type LineElement,
  type NoteElement,
  type PencilElement,
  type Point,
  type RectangleElement,
  type TextElement,
  type TextLabel,
  type YodoDocument,
  type YodoElement,
} from './types.ts'

/**
 * A random UUID v4. `crypto.randomUUID` exists only in secure contexts (HTTPS,
 * localhost), so a self-hosted app opened over plain HTTP on a LAN address
 * falls back to `getRandomValues`, which is available everywhere.
 */
export function randomId(): string {
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

/** The default text size: M in the S/M/L/XL steps of `docs/ui.md`. */
export const DEFAULT_FONT_SIZE = 20

/**
 * The style a new element gets: the editor's defaults (ADR 0036). The text
 * fields apply to new text, and font and size to new shape labels.
 */
export type ElementStyle = Pick<
  BaseElement,
  | 'strokeColor'
  | 'backgroundColor'
  | 'fillStyle'
  | 'strokeWidth'
  | 'strokeStyle'
  | 'roughness'
  | 'opacity'
> &
  Pick<TextElement, 'fontFamily' | 'fontSize' | 'textAlign'> &
  Required<Pick<RectangleElement, 'roundness'>>

/** The style before any defaults are changed (Ink stroke, docs/ui.md). */
export const BUILT_IN_STYLE: ElementStyle = {
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
}

/** Every field but the geometry, in `style` (its text fields left out). */
function defaults(
  seed: number,
  style: ElementStyle,
): Omit<BaseElement, keyof Bounds> {
  return {
    id: randomId(),
    angle: 0,
    seed,
    strokeColor: style.strokeColor,
    backgroundColor: style.backgroundColor,
    fillStyle: style.fillStyle,
    strokeWidth: style.strokeWidth,
    strokeStyle: style.strokeStyle,
    roughness: style.roughness,
    opacity: style.opacity,
  }
}

/** Elements defined by their bounding box. */
export type ShapeType = 'rectangle' | 'diamond' | 'ellipse'
/** Elements defined by a start point and points relative to it. */
export type LinearType = 'line' | 'arrow'

/** A new rectangle, diamond or ellipse filling `bounds`. */
export function createShape<T extends ShapeType>(
  type: T,
  bounds: Bounds,
  seed = randomSeed(),
  style = BUILT_IN_STYLE,
): Extract<YodoElement, { type: T }> {
  // Ellipses have no corners.
  const corners = type === 'ellipse' ? {} : { roundness: style.roundness }
  // TypeScript cannot narrow a generic `type` to one union member, hence the cast.
  return { type, ...defaults(seed, style), ...corners, ...bounds } as Extract<
    YodoElement,
    { type: T }
  >
}

/** The side of a note placed by a click, in world units. */
export const NOTE_SIZE = 200
/** A new note's colour: Sand from the fill palette, whatever the default fill is (ADR 0038). */
export const NOTE_COLOR = '#F9EBD6'

/**
 * A new note filling `bounds`: a solid, clean, outline-free box in
 * `NOTE_COLOR` (ADR 0038), with the text colour of `style`.
 */
export function createNote(
  bounds: Bounds,
  seed = randomSeed(),
  style = BUILT_IN_STYLE,
): NoteElement {
  return {
    type: 'note',
    ...defaults(seed, style),
    backgroundColor: NOTE_COLOR,
    fillStyle: 'solid',
    strokeWidth: 0,
    strokeStyle: 'solid',
    roughness: 0,
    ...bounds,
  }
}

/** A new line, or an arrow with an arrowhead at its end. */
export function createLinear(
  type: 'line',
  geometry: LinearGeometry,
  seed?: number,
  style?: ElementStyle,
): LineElement
export function createLinear(
  type: 'arrow',
  geometry: LinearGeometry,
  seed?: number,
  style?: ElementStyle,
): ArrowElement
export function createLinear(
  type: LinearType,
  geometry: LinearGeometry,
  seed?: number,
  style?: ElementStyle,
): LineElement | ArrowElement
export function createLinear(
  type: LinearType,
  geometry: LinearGeometry,
  seed = randomSeed(),
  style = BUILT_IN_STYLE,
): LineElement | ArrowElement {
  const base = { ...defaults(seed, style), ...geometry }
  return type === 'arrow'
    ? { type, ...base, endArrowhead: 'arrow' }
    : { type, ...base }
}

/** A new pencil stroke with the given geometry (see `geometry/freehand.ts`). */
export function createPencil(
  geometry: LinearGeometry,
  seed = randomSeed(),
  style = BUILT_IN_STYLE,
): PencilElement {
  return { type: 'pencil', ...defaults(seed, style), ...geometry }
}

/**
 * A new, empty text with its top-left at `at`. Its size is set from its text
 * when the edit is committed (ADR 0027).
 */
export function createText(
  at: Point,
  seed = randomSeed(),
  style = BUILT_IN_STYLE,
): TextElement {
  return {
    type: 'text',
    ...defaults(seed, style),
    x: at[0],
    y: at[1],
    width: 0,
    height: 0,
    text: '',
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    textAlign: style.textAlign,
  }
}

/** The style of a new shape label (ADR 0026); its text is filled in when editing. */
export const DEFAULT_LABEL: TextLabel = labelIn(BUILT_IN_STYLE)

/** A new, empty label in the font and size of `style`, always centred. */
export function labelIn(style: ElementStyle): TextLabel {
  return {
    text: '',
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    textAlign: 'center',
  }
}
