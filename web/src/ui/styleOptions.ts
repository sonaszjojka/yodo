// The values the style bar offers (docs/ui.md). Colours are the stored
// light-theme values; dark mode adapts them when rendering (ADR 0015).
import { stylesOf } from '../core/editor/style.ts'
import type {
  FillStyle,
  FontFamily,
  Roundness,
  StrokeStyle,
  TextAlign,
  YodoElement,
} from '../core/document/types.ts'

export interface Option<T> {
  value: T
  label: string
}

export const STROKES: Option<string>[] = [
  { value: '#1E1F22', label: 'Ink' },
  { value: '#6B7280', label: 'Graphite' },
  { value: '#C2453D', label: 'Brick' },
  { value: '#D9822B', label: 'Amber' },
  { value: '#3F8F5A', label: 'Green' },
  { value: '#1F8A8A', label: 'Teal' },
  { value: '#3A6FD8', label: 'Blue' },
  { value: '#7A5AF8', label: 'Violet' },
]

export const FILLS: Option<string>[] = [
  { value: 'transparent', label: 'None' },
  { value: '#F7E1DE', label: 'Rose' },
  { value: '#F9EBD6', label: 'Sand' },
  { value: '#E2F0E5', label: 'Sage' },
  { value: '#DDF0EF', label: 'Mist' },
  { value: '#E0E9FB', label: 'Sky' },
  { value: '#ECE6FD', label: 'Lilac' },
  { value: '#EEF0F2', label: 'Fog' },
]

/**
 * The fills `selected` can take: a selection of only notes can't be
 * unfilled, so "None" is left out (ADR 0038).
 */
export function fillsFor(selected: readonly YodoElement[]): Option<string>[] {
  const fillable = selected.filter((element) =>
    stylesOf(element).includes('backgroundColor'),
  )
  return fillable.length > 0 && fillable.every(({ type }) => type === 'note')
    ? FILLS.filter(({ value }) => value !== 'transparent')
    : FILLS
}

export const WIDTHS: Option<number>[] = [
  { value: 1, label: 'Thin' },
  { value: 2, label: 'Bold' },
  { value: 4, label: 'Extra bold' },
]

/** rough.js roughness: 1 is the default hand-drawn look, 0 straight lines. */
export const LOOKS: Option<number>[] = [
  { value: 1, label: 'Hand-drawn' },
  { value: 0, label: 'Clean' },
]

/** Corners of rectangles and diamonds (roadmap 2.2b). */
export const CORNERS: Option<Roundness>[] = [
  { value: 'sharp', label: 'Sharp' },
  { value: 'round', label: 'Round' },
]

export const FONTS: Option<FontFamily>[] = [
  { value: 'hand', label: 'Hand' },
  { value: 'sans', label: 'Sans' },
  { value: 'mono', label: 'Mono' },
]

/** rough.js fill patterns, shown when a shape has a fill. */
export const FILL_STYLES: Option<FillStyle>[] = [
  { value: 'hachure', label: 'Hatched' },
  { value: 'cross-hatch', label: 'Cross-hatched' },
  { value: 'solid', label: 'Solid' },
]

export const STROKE_STYLES: Option<StrokeStyle>[] = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
]

export const ALIGNMENTS: Option<TextAlign>[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Centre' },
  { value: 'right', label: 'Right' },
]

/** The exact font sizes the panel accepts, in px. */
export const MIN_FONT_SIZE = 8
export const MAX_FONT_SIZE = 200

/** The S/M/L/XL steps; M is `DEFAULT_FONT_SIZE`. */
export const SIZES: Option<number>[] = [
  { value: 16, label: 'S' },
  { value: 20, label: 'M' },
  { value: 28, label: 'L' },
  { value: 36, label: 'XL' },
]

/** The option's label, 'Mixed', or 'Custom' for a value not offered here. */
export function labelOf<T>(options: Option<T>[], value: T | 'mixed'): string {
  if (value === 'mixed') return 'Mixed'
  return options.find((option) => option.value === value)?.label ?? 'Custom'
}
