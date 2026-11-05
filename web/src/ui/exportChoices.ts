// The export dialog's options and the pure rules around them (ADR 0041), kept
// apart from the component so they are unit-tested without a DOM.
import { scaleFits, type ExportScope } from '../core/export/exportScene.ts'
import type { Bounds } from '../core/geometry/rect.ts'

export const SCALES = [1, 2, 3] as const

export type ExportFormat = 'png' | 'svg'

export interface ExportChoices {
  /** Which tab of the dialog is open (ADR 0043). */
  format: ExportFormat
  scope: ExportScope
  background: boolean
  /** Draw with the dark theme's colours (ADR 0015). */
  dark: boolean
  /** PNG only: SVG has no pixel size. */
  scale: number
  /** Without the `.png` / `.svg` extension. */
  fileName: string
}

/** Defaults: the selection if there is one, a background, 2x for HiDPI screens. */
export function initialChoices(
  drawingName: string,
  selectedCount: number,
): ExportChoices {
  return {
    format: 'png',
    scope: selectedCount > 0 ? 'selection' : 'all',
    background: true,
    dark: false,
    scale: 2,
    fileName: drawingName,
  }
}

/**
 * The scale to draw at: the wanted one, or the largest smaller one that fits
 * the browser's canvas limits. Undefined when even 1x is too big.
 */
export function fittingScale(frame: Bounds, wanted: number) {
  return [...SCALES]
    .reverse()
    .find((scale) => scale <= wanted && scaleFits(frame, scale))
}

/** A safe download name: no path or reserved characters, `.<ext>` added once. */
function exportFileName(name: string, extension: 'png' | 'svg') {
  const clean = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .trim()
    .replace(new RegExp(`\\.${extension}$`, 'i'), '')
    .trim()
    .replace(/^\.+/, '')
  return `${clean || 'drawing'}.${extension}`
}

export const pngFileName = (name: string) => exportFileName(name, 'png')
export const svgFileName = (name: string) => exportFileName(name, 'svg')
