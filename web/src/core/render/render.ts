// Draws the scene on a Canvas 2D context with rough.js (ADR 0004). Takes only
// the parts of the canvas and rough.js APIs it uses, so tests can pass fakes.
import type { RoughCanvas } from 'roughjs/bin/canvas'
import type { Options } from 'roughjs/bin/core'
import type { Point, StrokeStyle, YodoElement } from '../document/types.ts'
import { arrowhead } from '../geometry/line.ts'
import { GAP, grow, HANDLE_SIZE, selectionFrame } from '../editor/frame.ts'
import { diamondPoints, type Bounds } from '../geometry/rect.ts'
import { worldToScreen, type Viewport } from '../geometry/viewport.ts'

export type SceneContext = Pick<
  CanvasRenderingContext2D,
  | 'setTransform'
  | 'clearRect'
  | 'save'
  | 'restore'
  | 'globalAlpha'
  | 'beginPath'
  | 'rect'
  | 'roundRect'
  | 'stroke'
  | 'fill'
  | 'strokeStyle'
  | 'fillStyle'
  | 'lineWidth'
  | 'font'
  | 'textAlign'
  | 'textBaseline'
  | 'measureText'
  | 'fillText'
>
/** The return value (a Drawable) is unused, so fakes may return nothing. */
export interface SceneRough {
  rectangle(...args: Parameters<RoughCanvas['rectangle']>): unknown
  polygon(...args: Parameters<RoughCanvas['polygon']>): unknown
  ellipse(...args: Parameters<RoughCanvas['ellipse']>): unknown
  linearPath(...args: Parameters<RoughCanvas['linearPath']>): unknown
}

/** The canvas's visible size in CSS pixels plus the device pixel ratio. */
export interface Surface {
  width: number
  height: number
  dpr: number
}

/**
 * The canvas backing-store size for a CSS size. Drawing at device pixels
 * instead of CSS pixels is what keeps lines sharp on HiDPI screens.
 */
export function canvasSize(cssWidth: number, cssHeight: number, dpr: number) {
  return {
    width: Math.round(cssWidth * dpr),
    height: Math.round(cssHeight * dpr),
  }
}

const DASHES: Record<StrokeStyle, number[] | undefined> = {
  solid: undefined,
  dashed: [8, 8],
  dotted: [2, 6],
}

/** The rough.js options shared by every element type. */
function roughOptions(element: YodoElement): Options {
  return {
    seed: element.seed,
    stroke: element.strokeColor,
    strokeWidth: element.strokeWidth,
    roughness: element.roughness,
    fill:
      element.backgroundColor === 'transparent'
        ? undefined
        : element.backgroundColor,
    fillStyle: element.fillStyle,
    strokeLineDash: DASHES[element.strokeStyle],
  }
}

function drawElement(rough: SceneRough, element: YodoElement) {
  const options = roughOptions(element)
  const { x, y, width, height } = element
  switch (element.type) {
    case 'rectangle':
      rough.rectangle(x, y, width, height, options)
      return
    case 'diamond':
      rough.polygon(diamondPoints(element), options)
      return
    case 'ellipse':
      rough.ellipse(x + width / 2, y + height / 2, width, height, options)
      return
    case 'line':
    case 'arrow': {
      const points = element.points.map(([dx, dy]): Point => [x + dx, y + dy])
      rough.linearPath(points, options)
      // Stored documents aren't validated, so fewer than two points can occur.
      const [from, to] = points.slice(-2)
      if (!from || !to) return
      const hasLength = from[0] !== to[0] || from[1] !== to[1]
      if (element.type === 'arrow' && element.endArrowhead && hasLength) {
        // Same seed, so the head keeps its wobble from frame to frame too.
        rough.linearPath(arrowhead(from, to), options)
      }
      return
    }
    case 'pencil':
    case 'text':
      // Their renderers arrive with their tools (roadmap 1.8, 1.9).
      return
  }
}

/** Editor UI drawn over the elements, in world coordinates. */
export interface Overlay {
  selected: readonly YodoElement[]
  marquee: Bounds | null
}

const NO_OVERLAY: Overlay = { selected: [], marquee: null }

// Overlay look from docs/ui.md "Selection", in screen px; light theme only
// until dark mode (roadmap M2). Gap and handle size live in frame.ts.
const ACCENT = '#0F766E'
const ACCENT_SOFT = '#E3F2EF'
const HANDLE_FILL = '#FFFFFF'
const OUTLINE_WIDTH = 1.25
const ELEMENT_OUTLINE_WIDTH = 1
const HANDLE_RADIUS = 2
const BADGE_FONT = '600 11px Manrope, system-ui, sans-serif'
const BADGE_TEXT = '#FFFFFF'
/** Space between the outline and the badge, the badge's height and side padding. */
const BADGE_OFFSET = 8
const BADGE_HEIGHT = 18
const BADGE_PADDING = 6

function strokeBox(ctx: SceneContext, box: Bounds, lineWidth: number) {
  ctx.beginPath()
  ctx.rect(box.x, box.y, box.width, box.height)
  ctx.lineWidth = lineWidth
  ctx.stroke()
}

/**
 * The size badge under the selection, e.g. `220 × 120`. Drawn in screen
 * pixels (only the pixel ratio applied), so the text stays crisp at any zoom.
 */
function drawSizeBadge(
  ctx: SceneContext,
  box: Bounds,
  outline: Bounds,
  viewport: Viewport,
  dpr: number,
) {
  const text = `${Math.round(box.width)} × ${Math.round(box.height)}`
  const [cx, bottom] = worldToScreen(viewport, [
    outline.x + outline.width / 2,
    outline.y + outline.height,
  ])
  ctx.save()
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.font = BADGE_FONT
  const width = ctx.measureText(text).width + 2 * BADGE_PADDING
  const top = bottom + BADGE_OFFSET
  ctx.beginPath()
  ctx.roundRect(cx - width / 2, top, width, BADGE_HEIGHT, BADGE_HEIGHT / 2)
  ctx.fillStyle = ACCENT
  ctx.fill()
  ctx.fillStyle = BADGE_TEXT
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, cx, top + BADGE_HEIGHT / 2)
  ctx.restore()
}

/**
 * Draws the selection and box-select overlay. `px` is one screen pixel in
 * world units (1 / zoom), so the overlay keeps its size at any zoom.
 */
function drawOverlay(
  ctx: SceneContext,
  overlay: Overlay,
  viewport: Viewport,
  dpr: number,
) {
  const px = 1 / viewport.zoom
  ctx.save()
  ctx.strokeStyle = ACCENT
  const frame = selectionFrame(overlay.selected, px)
  if (frame) {
    const { elementBoxes, outline } = frame
    // With several selected, a thin outline shows which ones are in the group.
    if (elementBoxes.length > 1) {
      for (const box of elementBoxes) {
        strokeBox(ctx, grow(box, GAP * px), ELEMENT_OUTLINE_WIDTH * px)
      }
    }
    strokeBox(ctx, outline, OUTLINE_WIDTH * px)
    // Corner handles; the sides between them resize too, without a handle.
    const size = HANDLE_SIZE * px
    ctx.fillStyle = HANDLE_FILL
    ctx.lineWidth = OUTLINE_WIDTH * px
    for (const cx of [outline.x, outline.x + outline.width]) {
      for (const cy of [outline.y, outline.y + outline.height]) {
        ctx.beginPath()
        ctx.roundRect(
          cx - size / 2,
          cy - size / 2,
          size,
          size,
          HANDLE_RADIUS * px,
        )
        ctx.fill()
        ctx.stroke()
      }
    }
    drawSizeBadge(ctx, frame.box, outline, viewport, dpr)
  }
  if (overlay.marquee) {
    const { x, y, width, height } = overlay.marquee
    ctx.beginPath()
    ctx.rect(x, y, width, height)
    ctx.fillStyle = ACCENT_SOFT
    ctx.globalAlpha = 0.5
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.lineWidth = px
    ctx.stroke()
  }
  ctx.restore()
}

export function renderScene(
  ctx: SceneContext,
  rough: SceneRough,
  elements: readonly YodoElement[],
  surface: Surface,
  viewport: Viewport,
  overlay: Overlay = NO_OVERLAY,
) {
  const { dpr } = surface
  // Clear in CSS pixels, before the camera transform applies.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, surface.width, surface.height)
  // One transform maps world units to device pixels, so elements below draw
  // in world coordinates: device = (world - (x, y)) * zoom * dpr.
  const scale = dpr * viewport.zoom
  ctx.setTransform(scale, 0, 0, scale, -viewport.x * scale, -viewport.y * scale)

  for (const element of elements) {
    ctx.save()
    ctx.globalAlpha = element.opacity / 100
    drawElement(rough, element)
    ctx.restore()
  }
  drawOverlay(ctx, overlay, viewport, dpr)
}
