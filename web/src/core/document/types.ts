// The drawing document format (ADR 0013). Bump CURRENT_SCHEMA_VERSION and add
// a migration in migrate.ts on every breaking change; adding a new element
// type or an optional field is not breaking.

export const CURRENT_SCHEMA_VERSION = 1

export type StrokeStyle = 'solid' | 'dashed' | 'dotted'
export type FillStyle = 'hachure' | 'cross-hatch' | 'solid'
export type FontFamily = 'hand' | 'sans' | 'mono'
export type TextAlign = 'left' | 'center' | 'right'

/** A point relative to its element's (x, y). */
export type Point = [x: number, y: number]

export interface BaseElement {
  id: string
  x: number
  y: number
  width: number
  height: number
  /** Rotation in radians, around the element's centre. */
  angle: number
  /** Fixed rough.js seed so the hand-drawn look is stable (ADR 0004). */
  seed: number
  /** Light-theme colour value, adapted when rendering dark (ADR 0015). */
  strokeColor: string
  /** Light-theme colour value or 'transparent' (ADR 0015). */
  backgroundColor: string
  fillStyle: FillStyle
  strokeWidth: number
  strokeStyle: StrokeStyle
  /** 0 draws clean lines; higher values look more hand-drawn. */
  roughness: number
  /** 0–100. */
  opacity: number
}

/**
 * Text inside a shape (ADR 0026), drawn in the shape's `strokeColor`, wrapped
 * to its inner box and centred vertically.
 */
export interface TextLabel {
  text: string
  fontFamily: FontFamily
  fontSize: number
  textAlign: TextAlign
}

export interface RectangleElement extends BaseElement {
  type: 'rectangle'
  label?: TextLabel
}

export interface DiamondElement extends BaseElement {
  type: 'diamond'
  label?: TextLabel
}

export interface EllipseElement extends BaseElement {
  type: 'ellipse'
  label?: TextLabel
}

export interface LineElement extends BaseElement {
  type: 'line'
  points: Point[]
}

export interface ArrowElement extends BaseElement {
  type: 'arrow'
  points: Point[]
  endArrowhead: 'arrow' | null
}

export interface PencilElement extends BaseElement {
  type: 'pencil'
  points: Point[]
}

export interface TextElement extends BaseElement {
  type: 'text'
  text: string
  fontFamily: FontFamily
  fontSize: number
  textAlign: TextAlign
}

/** Discriminated union: narrow on `element.type`. */
export type YodoElement =
  | RectangleElement
  | DiamondElement
  | EllipseElement
  | LineElement
  | ArrowElement
  | PencilElement
  | TextElement

export interface AppState {
  /** The visible part of the infinite canvas, in world coordinates. */
  viewport: { x: number; y: number; zoom: number }
}

export interface YodoDocument {
  type: 'yodo'
  schemaVersion: typeof CURRENT_SCHEMA_VERSION
  id: string
  name: string
  elements: YodoElement[]
  appState: AppState
  /** Content hashes of the images this drawing references (ADR 0013). */
  fileIds: string[]
}
