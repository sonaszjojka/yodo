// What an image export draws and how big it is (ADR 0041). Pure, so the
// dialog's options are unit-tested without a canvas. The drawing itself is
// `renderExport`, which reuses the editor's `renderScene`.
import type { YodoElement } from '../document/types.ts'
import { elementBounds, unionBounds, type Bounds } from '../geometry/rect.ts'
import { canvasColor, type Theme } from '../render/colors.ts'
import {
  renderScene,
  type SceneContext,
  type SceneRough,
} from '../render/render.ts'
import {
  labelBox,
  layoutText,
  MIN_LABEL_EMS,
  type Measure,
} from '../text/layout.ts'

export type ExportScope = 'all' | 'selection'

/** Space around the exported elements, in world units. */
export const EXPORT_PADDING = 16
/** Browsers refuse canvases past about these limits (Safari is the tightest). */
const MAX_SIDE = 16384
const MAX_AREA = 64_000_000

/** The elements an export draws, in document order. */
export function exportElements(
  elements: readonly YodoElement[],
  selectedIds: readonly string[],
  scope: ExportScope,
): YodoElement[] {
  if (scope === 'all') return [...elements]
  const selected = new Set(selectedIds)
  return elements.filter((element) => selected.has(element.id))
}

/**
 * The box a shape's label text covers. It can stick out of the shape (ADR
 * 0026: a label overflows after a resize), and the renderer doesn't clip it,
 * so an export must include it. Mirrors `drawLabel` in `render.ts`.
 */
function labelTextBounds(
  element: YodoElement,
  measure: Measure,
): Bounds | null {
  if (
    !('label' in element) ||
    !element.label?.text ||
    (element.type !== 'rectangle' &&
      element.type !== 'diamond' &&
      element.type !== 'ellipse' &&
      element.type !== 'note')
  ) {
    return null
  }
  const { label } = element
  const box = labelBox(element, label.fontSize * MIN_LABEL_EMS)
  const layout = layoutText(
    label.text,
    label.fontFamily,
    label.fontSize,
    measure,
    box.width,
  )
  const left =
    label.textAlign === 'center'
      ? box.x + (box.width - layout.width) / 2
      : label.textAlign === 'right'
        ? box.x + box.width - layout.width
        : box.x
  return {
    x: left,
    y: box.y + (box.height - layout.height) / 2,
    width: layout.width,
    height: layout.height,
  }
}

/**
 * The world-space frame of an export: everything drawn, plus `padding`.
 * `undefined` when there is nothing to export.
 */
export function exportFrame(
  elements: readonly YodoElement[],
  measure: Measure,
  padding = EXPORT_PADDING,
): Bounds | undefined {
  const boxes = elements.flatMap((element) => {
    const label = labelTextBounds(element, measure)
    return label ? [elementBounds(element), label] : [elementBounds(element)]
  })
  const union = unionBounds(boxes)
  if (!union) return undefined
  return {
    x: union.x - padding,
    y: union.y - padding,
    width: union.width + 2 * padding,
    height: union.height + 2 * padding,
  }
}

/** The PNG's size in whole pixels. */
export function exportSize(frame: Bounds, scale: number) {
  return {
    width: Math.ceil(frame.width * scale),
    height: Math.ceil(frame.height * scale),
  }
}

/** Whether a canvas of this frame at this scale is within browser limits. */
export function scaleFits(frame: Bounds, scale: number) {
  const { width, height } = exportSize(frame, scale)
  return Math.max(width, height) <= MAX_SIDE && width * height <= MAX_AREA
}

export interface ExportOptions {
  scale: number
  theme: Theme
  /** Paint the page colour under the drawing; transparent when false. */
  background: boolean
}

/** Draws `elements` into `canvas`, sized to the frame at `options.scale`. */
export function renderExport(
  canvas: {
    width: number
    height: number
    getContext(id: '2d'): SceneContext | null
  },
  rough: SceneRough,
  elements: readonly YodoElement[],
  frame: Bounds,
  options: ExportOptions,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('The export canvas has no 2D context')
  const { width, height } = exportSize(frame, options.scale)
  canvas.width = width
  canvas.height = height
  // dpr 1 with the zoom as the scale: the surface is in canvas pixels, so
  // renderScene's CSS-pixel size is the canvas size.
  renderScene(
    ctx,
    rough,
    elements,
    {
      width,
      height,
      dpr: 1,
      theme: options.theme,
      background: options.background ? canvasColor(options.theme) : undefined,
    },
    { x: frame.x, y: frame.y, zoom: options.scale },
  )
}
