// Text layout shared by the renderer, the editor and the editing textarea
// (ADR 0027): the same line breaks and sizes everywhere. Measuring needs a
// font engine, so callers pass one in; the core stays free of the DOM.
import type {
  DiamondElement,
  EllipseElement,
  FontFamily,
  RectangleElement,
} from '../document/types.ts'
import type { Bounds } from '../geometry/rect.ts'

/** The width of `text` drawn in the CSS `font`, in the font's px units. */
export type Measure = (text: string, font: string) => number

/** CSS font stacks; a font not loaded yet falls back to the next one (ADR 0025). */
export const FONT_STACKS: Record<FontFamily, string> = {
  hand: '"Caveat Variable", cursive',
  sans: 'Manrope, system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
}

/** Line height as a multiple of the font size, for the canvas and the textarea. */
export const LINE_HEIGHT = 1.25

/** Space between a shape's inner box and its label, in world units. */
export const LABEL_PADDING = 5

export function fontOf(family: FontFamily, size: number): string {
  return `${size}px ${FONT_STACKS[family]}`
}

/**
 * A rough width (0.55 em per character) for when no font engine is at hand,
 * such as in tests. The app passes a canvas-backed measure instead.
 */
export const estimateMeasure: Measure = (text, font) =>
  text.length * 0.55 * Number.parseFloat(font)

export interface TextLayout {
  lines: string[]
  /** The widest line. */
  width: number
  /** Every line, `LINE_HEIGHT` each. */
  height: number
}

/** Splits a word wider than `maxWidth` into pieces that fit (at least one character each). */
function breakWord(word: string, fits: (s: string) => boolean): string[] {
  const pieces: string[] = []
  let piece = ''
  for (const char of word) {
    if (piece && !fits(piece + char)) {
      pieces.push(piece)
      piece = char
    } else {
      piece += char
    }
  }
  return [...pieces, piece]
}

/** Greedy word wrap of one paragraph (no newlines). */
function wrap(paragraph: string, fits: (s: string) => boolean): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of paragraph.split(' ')) {
    const candidate = line ? `${line} ${word}` : word
    if (fits(candidate)) {
      line = candidate
      continue
    }
    if (line) lines.push(line)
    if (fits(word)) {
      line = word
    } else {
      const pieces = breakWord(word, fits)
      line = pieces.pop()!
      lines.push(...pieces)
    }
  }
  return [...lines, line]
}

/**
 * Lays out `text`: one line per newline, and with `maxWidth` also wrapped at
 * spaces (a longer word breaks between characters).
 */
export function layoutText(
  text: string,
  family: FontFamily,
  size: number,
  measure: Measure,
  maxWidth?: number,
): TextLayout {
  const font = fontOf(family, size)
  const width = (s: string) => measure(s, font)
  const paragraphs = text.split('\n')
  const lines =
    maxWidth === undefined
      ? paragraphs
      : paragraphs.flatMap((p) => wrap(p, (s) => width(s) <= maxWidth))
  return {
    lines,
    width: Math.max(0, ...lines.map(width)),
    height: lines.length * size * LINE_HEIGHT,
  }
}

type LabelledShape = RectangleElement | DiamondElement | EllipseElement

/** How much of each side of the box the shape's inside can hold text in. */
const INNER_RATIO: Record<LabelledShape['type'], number> = {
  rectangle: 1,
  // The largest rectangle with the box's proportions inside the shape.
  ellipse: Math.SQRT1_2,
  diamond: 0.5,
}

/** The box a shape's label wraps and centres in, in world coordinates. */
export function labelBox(shape: LabelledShape): Bounds {
  const ratio = INNER_RATIO[shape.type]
  const width = Math.max(0, shape.width * ratio - 2 * LABEL_PADDING)
  const height = Math.max(0, shape.height * ratio - 2 * LABEL_PADDING)
  return {
    x: shape.x + (shape.width - width) / 2,
    y: shape.y + (shape.height - height) / 2,
    width,
    height,
  }
}

/** The shape height whose label box holds `textHeight`: the inverse of `labelBox`. */
export function heightForLabel(
  type: LabelledShape['type'],
  textHeight: number,
): number {
  return (textHeight + 2 * LABEL_PADDING) / INNER_RATIO[type]
}
