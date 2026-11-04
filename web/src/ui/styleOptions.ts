// The values the style bar offers (docs/ui.md). Colours are the stored
// light-theme values; dark mode adapts them when rendering (ADR 0015).
import type { FontFamily } from '../core/document/types.ts'

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

export const FONTS: Option<FontFamily>[] = [
  { value: 'hand', label: 'Hand' },
  { value: 'sans', label: 'Sans' },
  { value: 'mono', label: 'Mono' },
]

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
