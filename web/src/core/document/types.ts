// The drawing document format (ADR 0013). Bump CURRENT_SCHEMA_VERSION and add
// a migration in migrate.ts on every breaking change; adding a new element
// type or an optional field is not breaking.

export const CURRENT_SCHEMA_VERSION = 1

export type StrokeStyle = 'solid' | 'dashed' | 'dotted'
export type FillStyle = 'hachure' | 'cross-hatch' | 'solid'
export type FontFamily = 'hand' | 'sans' | 'mono'
export type TextAlign = 'left' | 'center' | 'right'
/** Corners of a rectangle or diamond (roadmap 2.2b). */
export type Roundness = 'sharp' | 'round'

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

/**
 * Format note (ADR 0013): `roundness` was added in roadmap 2.2b as an optional
 * field, so schemaVersion stays 1 and no migration exists. Absent means
 * 'sharp', which is how every earlier document looks.
 */
interface Cornered {
  roundness?: Roundness
}

export interface RectangleElement extends BaseElement, Cornered {
  type: 'rectangle'
  label?: TextLabel
}

export interface DiamondElement extends BaseElement, Cornered {
  type: 'diamond'
  label?: TextLabel
}

export interface EllipseElement extends BaseElement {
  type: 'ellipse'
  label?: TextLabel
}

/**
 * A sticky note (roadmap 2.4, ADR 0038): a coloured box with a label. Its
 * colour is `backgroundColor` (never 'transparent'); `strokeColor` is the
 * text colour. It has no outline. Added as a new element type, so
 * schemaVersion stays 1.
 */
export interface NoteElement extends BaseElement {
  type: 'note'
  label?: TextLabel
}

/**
 * A pasted image (roadmap 2.6, ADR 0040). The bytes live in the image store,
 * keyed by `fileId` (the lowercase hex SHA-256 of the bytes); the element only
 * has a box and `opacity`. Added as a new element type, so schemaVersion stays
 * 1.
 */
export interface ImageElement extends BaseElement {
  type: 'image'
  fileId: string
}

/**
 * Format note (ADR 0053): `curved` is optional, so schemaVersion stays 1. With
 * it and at least three points, the element is a smooth curve through every
 * point instead of a polyline.
 */
export interface LineElement extends BaseElement {
  type: 'line'
  points: Point[]
  curved?: true
}

/**
 * One end of an arrow attached to a shape (roadmap 3.4, ADR 0048). `ratio` is
 * the end's place in the target's bounding box as fractions (0 to 1).
 */
export interface ShapeBinding {
  elementId: string
  ratio: Point
}

/**
 * One end of an arrow attached to a line or another arrow (ADR 0054). `along`
 * is the fraction (0 to 1) of the target's drawn length, from its first point.
 */
export interface PathBinding {
  elementId: string
  along: number
}

export type ArrowBinding = ShapeBinding | PathBinding

/**
 * Format note (ADR 0013, 0048, 0053, 0054): `startBinding`, `endBinding` and
 * `curved` are optional, so schemaVersion stays 1. The arrow's own geometry is
 * always kept in sync with its bindings.
 */
export interface ArrowElement extends BaseElement {
  type: 'arrow'
  points: Point[]
  endArrowhead: 'arrow' | null
  curved?: true
  startBinding?: ArrowBinding
  endBinding?: ArrowBinding
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
  | NoteElement
  | ImageElement
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
