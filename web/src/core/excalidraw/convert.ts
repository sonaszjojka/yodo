// Converts an Excalidraw file into a Yodo document (ADR 0014): a one-way,
// tolerant, pure mapping. Anything Yodo cannot represent is skipped or
// simplified and counted in the returned summary instead of being silent.
// Images are resolved through an injected function so this module stays free
// of storage and the DOM (ADR 0002).
import { createDocument, randomId, randomSeed } from '../document/create.ts'
import type {
  ArrowElement,
  FillStyle,
  FontFamily,
  Point,
  StrokeStyle,
  YodoDocument,
  YodoElement,
} from '../document/types.ts'
import { MAX_PASTE_ELEMENTS, parseElements } from '../document/validate.ts'
import { attachEnd, isBindable } from '../editor/binding.ts'
import { elementBounds, unionBounds } from '../geometry/rect.ts'
import { layoutText, type Measure } from '../text/layout.ts'

/** A problem with the file as a whole, worded for the person who picked it. */
export class ExcalidrawImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExcalidrawImportError'
  }
}

export interface SummaryEntry {
  /** A plural noun phrase, e.g. "frames". */
  reason: string
  count: number
}

export interface ImportSummary {
  /** Elements in the new drawing. */
  imported: number
  /** Things left out of the drawing. */
  skipped: SummaryEntry[]
  /** Things imported with less detail than in Excalidraw. */
  simplified: SummaryEntry[]
}

export interface ConvertOptions {
  /** Sizes text the way the app draws it. */
  measure: Measure
  /**
   * Stores one image from the file's `files` and returns its Yodo `fileId`
   * (ADR 0040), or undefined when it cannot be used. A thrown error aborts the
   * conversion, so a failing store never produces a half-imported drawing.
   */
  resolveImage(
    sourceId: string,
    dataUrl: string,
  ): Promise<{ fileId: string } | undefined>
  /** The drawing's name; defaults to "Imported drawing". */
  name?: string
}

export interface Conversion {
  document: YodoDocument
  summary: ImportSummary
}

type Raw = Record<string, unknown>

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' && value !== '' ? value : fallback
}

function pick<T extends string>(
  value: unknown,
  options: readonly T[],
  fallback: T,
): T {
  return options.includes(value as T) ? (value as T) : fallback
}

const STROKE_STYLES = ['solid', 'dashed', 'dotted'] as const
const ALIGNS = ['left', 'center', 'right'] as const
const FILL_STYLES = ['hachure', 'cross-hatch', 'solid'] as const

/** Excalidraw's numeric font ids (old and new) in Yodo's three families. */
const FONT_FAMILIES: Record<number, FontFamily> = {
  1: 'hand',
  2: 'sans',
  3: 'mono',
  5: 'hand',
  6: 'sans',
  8: 'mono',
  9: 'sans',
}

const DEFAULT_STROKE = '#1E1F22'
/** Gap between the view's top-left corner and the imported content. */
const VIEW_MARGIN = 40

function fontOf(value: unknown): FontFamily {
  return (typeof value === 'number' && FONT_FAMILIES[value]) || 'hand'
}

function points(value: unknown): Point[] | undefined {
  if (!Array.isArray(value) || value.length > 100_000) return undefined
  const result: Point[] = []
  for (const p of value) {
    if (!Array.isArray(p) || p.length < 2) return undefined
    const [x, y] = p as unknown[]
    if (typeof x !== 'number' || typeof y !== 'number') return undefined
    if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined
    result.push([x, y])
  }
  return result
}

function pointsBox(list: Point[]) {
  const xs = list.map(([x]) => x)
  const ys = list.map(([, y]) => y)
  return {
    width: Math.max(0, ...xs) - Math.min(0, ...xs),
    height: Math.max(0, ...ys) - Math.min(0, ...ys),
  }
}

/** The fields every Yodo element has, read from an Excalidraw element. */
function baseOf(raw: Raw) {
  const seed = raw.seed
  const fillStyle: FillStyle = pick(raw.fillStyle, FILL_STYLES, 'hachure')
  const strokeStyle: StrokeStyle = pick(raw.strokeStyle, STROKE_STYLES, 'solid')
  return {
    id: randomId(),
    x: num(raw.x, 0),
    y: num(raw.y, 0),
    width: Math.abs(num(raw.width, 0)),
    height: Math.abs(num(raw.height, 0)),
    // Yodo does not draw rotation yet; `noteLosses` reports it.
    angle: 0,
    seed:
      typeof seed === 'number' && Number.isInteger(seed) && seed > 0
        ? seed
        : randomSeed(),
    strokeColor: str(raw.strokeColor, DEFAULT_STROKE),
    backgroundColor: str(raw.backgroundColor, 'transparent'),
    fillStyle,
    strokeWidth: Math.max(0, num(raw.strokeWidth, 2)),
    strokeStyle,
    roughness: Math.max(0, num(raw.roughness, 1)),
    opacity: Math.min(100, Math.max(0, num(raw.opacity, 100))),
  }
}

class Counter {
  readonly #counts = new Map<string, number>()
  add(reason: string) {
    this.#counts.set(reason, (this.#counts.get(reason) ?? 0) + 1)
  }
  entries(): SummaryEntry[] {
    return [...this.#counts].map(([reason, count]) => ({ reason, count }))
  }
}

/** Element types Excalidraw has that Yodo drops, with the noun used for them. */
const SKIPPED_TYPES: Record<string, string> = {
  frame: 'frames',
  magicframe: 'frames',
  embeddable: 'embedded content',
  iframe: 'embedded content',
}

/** The source ids of the shapes an arrow end is attached to. */
type Attached = { start?: string; end?: string }

type Slot =
  | {
      kind: 'element'
      element: YodoElement
      rawId: string
      /** Source ids of the shapes an arrow is attached to. */
      attached?: Attached
    }
  | { kind: 'text'; raw: Raw; text: string }

const SHAPE_TYPES = ['rectangle', 'diamond', 'ellipse'] as const

/** Whether the element passes the same checks as pasted ones. */
function isValid(element: YodoElement): boolean {
  return parseElements([element]).length === 1
}

/** `container` with the text of `slot` as its label. */
function withLabel(
  container: YodoElement,
  slot: Extract<Slot, { kind: 'text' }>,
): YodoElement {
  const original =
    typeof slot.raw.originalText === 'string' && slot.raw.originalText !== ''
      ? slot.raw.originalText
      : slot.text
  return {
    ...container,
    label: {
      text: original,
      fontFamily: fontOf(slot.raw.fontFamily),
      fontSize: Math.max(1, num(slot.raw.fontSize, 20)),
      textAlign: pick(slot.raw.textAlign, ALIGNS, 'center'),
    },
  } as YodoElement
}

/**
 * Converts parsed Excalidraw JSON. Throws `ExcalidrawImportError` when the
 * input is not an Excalidraw file at all; individual elements that cannot be
 * converted are skipped and counted.
 */
export async function convertExcalidraw(
  input: unknown,
  { measure, resolveImage, name = 'Imported drawing' }: ConvertOptions,
): Promise<Conversion> {
  if (!isRecord(input) || input.type !== 'excalidraw') {
    throw new ExcalidrawImportError('This is not an Excalidraw file.')
  }
  if (!Array.isArray(input.elements)) {
    throw new ExcalidrawImportError('This Excalidraw file has no elements.')
  }
  if (input.elements.length > MAX_PASTE_ELEMENTS) {
    throw new ExcalidrawImportError('This Excalidraw file is too large.')
  }
  const files = isRecord(input.files) ? input.files : {}

  const skipped = new Counter()
  const simplified = new Counter()
  const slots: Slot[] = []
  /** Source id -> the converted shape that can hold a label. */
  const containers = new Map<string, YodoElement>()
  const images = new Map<string, Promise<{ fileId: string } | undefined>>()

  for (const raw of input.elements) {
    if (!isRecord(raw)) {
      skipped.add('unreadable elements')
      continue
    }
    if (raw.isDeleted === true) continue
    const type = raw.type
    if (typeof type !== 'string') {
      skipped.add('unreadable elements')
      continue
    }
    const element = await convertOne(raw, type)
    if (element === 'skip') continue
    if (element === 'invalid') {
      skipped.add('unreadable elements')
      continue
    }
    if (element.kind === 'element') {
      if (!isValid(element.element)) {
        skipped.add('unreadable elements')
        continue
      }
      if ((SHAPE_TYPES as readonly string[]).includes(element.element.type)) {
        if (element.rawId) containers.set(element.rawId, element.element)
      }
    }
    noteLosses(raw)
    slots.push(element)
  }

  /** Counts visual details of a kept element that Yodo does not draw. */
  function noteLosses(raw: Raw) {
    // Text inside a shape turns with the shape, which is counted itself.
    if (raw.type === 'text' && raw.containerId) return
    if (num(raw.angle, 0) !== 0) {
      simplified.add('rotated elements, shown unrotated')
    }
    const fill = raw.fillStyle
    if (
      typeof fill === 'string' &&
      !(FILL_STYLES as readonly string[]).includes(fill) &&
      str(raw.backgroundColor, 'transparent') !== 'transparent'
    ) {
      simplified.add(`${fill} fills, shown as hachure`)
    }
  }

  async function convertOne(
    raw: Raw,
    type: string,
  ): Promise<Slot | 'skip' | 'invalid'> {
    const base = baseOf(raw)
    const rawId = str(raw.id, '')
    switch (type) {
      case 'rectangle':
      case 'diamond':
        return {
          kind: 'element',
          rawId,
          element: {
            type,
            ...base,
            roundness: raw.roundness ? 'round' : 'sharp',
          },
        }
      case 'ellipse':
        return { kind: 'element', rawId, element: { type, ...base } }
      case 'line':
      case 'arrow':
      case 'freedraw': {
        const list = points(raw.points)
        if (!list || list.length < 2) return 'invalid'
        const linear = { ...base, ...pointsBox(list), points: list }
        if (type === 'line') {
          return { kind: 'element', rawId, element: { type, ...linear } }
        }
        if (type === 'freedraw') {
          return {
            kind: 'element',
            rawId,
            element: { type: 'pencil', ...linear },
          }
        }
        const end = raw.endArrowhead
        if (raw.startArrowhead || (end && end !== 'arrow')) {
          simplified.add('arrowheads')
        }
        return {
          kind: 'element',
          rawId,
          attached: {
            start: boundId(raw.startBinding),
            end: boundId(raw.endBinding),
          },
          element: {
            type: 'arrow',
            ...linear,
            endArrowhead: end ? 'arrow' : null,
          },
        }
      }
      case 'text': {
        const text = typeof raw.text === 'string' ? raw.text : ''
        if (text.trim() === '') return 'skip'
        return { kind: 'text', raw, text }
      }
      case 'image': {
        const sourceId = str(raw.fileId, '')
        const file = isRecord(files[sourceId]) ? files[sourceId] : undefined
        const dataUrl =
          file && typeof file.dataURL === 'string' ? file.dataURL : ''
        if (!dataUrl) {
          skipped.add('images missing from the file')
          return 'skip'
        }
        let pending = images.get(sourceId)
        if (!pending) {
          pending = resolveImage(sourceId, dataUrl)
          images.set(sourceId, pending)
        }
        const stored = await pending
        if (!stored) {
          skipped.add('images that could not be read')
          return 'skip'
        }
        return {
          kind: 'element',
          rawId,
          element: {
            type: 'image',
            ...base,
            roughness: 0,
            fileId: stored.fileId,
          },
        }
      }
      default:
        if (type in SKIPPED_TYPES) {
          skipped.add(SKIPPED_TYPES[type]!)
        } else if (type !== 'selection') {
          skipped.add(`${type} elements`)
        }
        return 'skip'
    }
  }

  // A shape takes the first valid text bound to it as its label (ADR 0026).
  const labelled = new Map<string, YodoElement>()
  const labelTexts = new Set<Slot>()
  for (const slot of slots) {
    if (slot.kind !== 'text') continue
    const id = str(slot.raw.containerId, '')
    const container = containers.get(id)
    if (!container || labelled.has(id)) continue
    const candidate = withLabel(container, slot)
    if (!isValid(candidate)) continue
    labelled.set(id, candidate)
    labelTexts.add(slot)
  }

  const elements: YodoElement[] = []
  /** Source id -> the converted element, for arrows to attach to. */
  const bySourceId = new Map<string, YodoElement>()
  const arrows: { index: number; attached: Attached }[] = []
  for (const slot of slots) {
    if (slot.kind === 'element') {
      const element = labelled.get(slot.rawId) ?? slot.element
      if (slot.rawId) bySourceId.set(slot.rawId, element)
      if (slot.attached)
        arrows.push({ index: elements.length, attached: slot.attached })
      elements.push(element)
      continue
    }
    if (labelTexts.has(slot)) continue
    if (slot.raw.containerId) {
      simplified.add('text on arrows or missing shapes, kept as plain text')
    }
    const family = fontOf(slot.raw.fontFamily)
    const size = Math.max(1, num(slot.raw.fontSize, 20))
    const { width, height } = layoutText(slot.text, family, size, measure)
    const textElement: YodoElement = {
      type: 'text',
      ...baseOf(slot.raw),
      width,
      height,
      text: slot.text,
      fontFamily: family,
      fontSize: size,
      textAlign: pick(slot.raw.textAlign, ALIGNS, 'left'),
    }
    if (isValid(textElement)) elements.push(textElement)
    else skipped.add('unreadable elements')
  }

  // Arrows attach to the converted shapes (ADR 0048). A binding to a shape
  // that was dropped, or that an arrow cannot attach to, is reported.
  for (const { index, attached } of arrows) {
    let arrow = elements[index] as ArrowElement
    for (const end of ['start', 'end'] as const) {
      const sourceId = attached[end]
      if (sourceId === undefined) continue
      const target = bySourceId.get(sourceId)
      if (target && isBindable(target)) arrow = attachEnd(arrow, end, target)
      else simplified.add('arrows no longer attached to shapes')
    }
    elements[index] = arrow
  }

  const result = parseElements(elements)
  const bounds = unionBounds(result.map(elementBounds))
  const document = createDocument(name)
  document.elements = result
  document.fileIds = [
    ...new Set(result.flatMap((e) => (e.type === 'image' ? [e.fileId] : []))),
  ]
  if (bounds) {
    document.appState.viewport = {
      x: bounds.x - VIEW_MARGIN,
      y: bounds.y - VIEW_MARGIN,
      zoom: 1,
    }
  }
  return {
    document,
    summary: {
      imported: result.length,
      skipped: skipped.entries(),
      simplified: simplified.entries(),
    },
  }
}

/** The source id an Excalidraw binding points at, if it has a usable one. */
function boundId(binding: unknown): string | undefined {
  if (!binding) return undefined
  // An unusable binding gets an id nothing has, so it is reported as lost.
  return isRecord(binding) && typeof binding.elementId === 'string'
    ? binding.elementId
    : ''
}

/** Short lines for the person importing, e.g. "Skipped frames (2)". */
export function describeSummary(summary: ImportSummary): string[] {
  return [
    ...summary.skipped.map((e) => `Skipped ${e.reason} (${e.count})`),
    ...summary.simplified.map((e) => `Simplified ${e.reason} (${e.count})`),
  ]
}

/** Whether anything was left out or reduced, so the person should be told. */
export function hasLosses(summary: ImportSummary): boolean {
  return summary.skipped.length > 0 || summary.simplified.length > 0
}
