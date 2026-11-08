// Draws the scene on a Canvas 2D context with rough.js (ADR 0004). Takes only
// the parts of the canvas and rough.js APIs it uses, so tests can pass fakes.
import type { RoughCanvas } from 'roughjs/bin/canvas'
import type { Options } from 'roughjs/bin/core'
import type {
  FontFamily,
  ImageElement,
  NoteElement,
  PencilElement,
  Point,
  StrokeStyle,
  TextAlign,
  YodoElement,
} from '../document/types.ts'
import { adaptColor, type Theme } from './colors.ts'
import { smoothPath } from '../geometry/freehand.ts'
import { drawnBounds, headFrom, isCurved } from '../geometry/curve.ts'
import { ARROWHEAD_LENGTH, arrowhead } from '../geometry/line.ts'
import {
  drawsBoxFrame,
  handleLine,
  lineHandles,
  GAP,
  grow,
  HANDLE_SIZE,
  selectionFrame,
} from '../geometry/frame.ts'
import { bindOutline, isBindable } from '../editor/binding.ts'
import {
  cornerRadius,
  diamondPoints,
  roundedPolygonPath,
  type Bounds,
} from '../geometry/rect.ts'
import { worldToScreen, type Viewport } from '../geometry/viewport.ts'
import {
  fontOf,
  labelBox,
  layoutText,
  LINE_HEIGHT,
  MIN_LABEL_EMS,
  type Measure,
} from '../text/layout.ts'

export type SceneContext = Pick<
  CanvasRenderingContext2D,
  | 'setTransform'
  | 'clearRect'
  | 'fillRect'
  | 'save'
  | 'restore'
  | 'globalAlpha'
  | 'beginPath'
  | 'rect'
  | 'drawImage'
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
  | 'moveTo'
  | 'lineTo'
  | 'quadraticCurveTo'
  | 'lineCap'
  | 'lineJoin'
  | 'setLineDash'
  | 'shadowColor'
  | 'shadowBlur'
  | 'shadowOffsetY'
>
/** The return value (a Drawable) is unused, so fakes may return nothing. */
export interface SceneRough {
  rectangle(...args: Parameters<RoughCanvas['rectangle']>): unknown
  polygon(...args: Parameters<RoughCanvas['polygon']>): unknown
  ellipse(...args: Parameters<RoughCanvas['ellipse']>): unknown
  linearPath(...args: Parameters<RoughCanvas['linearPath']>): unknown
  curve(...args: Parameters<RoughCanvas['curve']>): unknown
  path(...args: Parameters<RoughCanvas['path']>): unknown
}

/** The canvas's visible size in CSS pixels plus the device pixel ratio. */
export interface Surface {
  width: number
  height: number
  dpr: number
  /** Colours are adapted for this theme (ADR 0015); light when omitted. */
  theme?: Theme
  /**
   * The decoded picture of an image element, or undefined while it loads or
   * if it is missing (a placeholder is drawn then; ADR 0040).
   */
  images?: (fileId: string) => CanvasImageSource | undefined

  /** Painted under the elements; transparent when omitted (exports, ADR 0041). */
  background?: string
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

export const DASHES: Record<StrokeStyle, number[] | undefined> = {
  solid: undefined,
  dashed: [8, 8],
  dotted: [2, 6],
}

/** The rough.js options shared by every element type. */
export function roughOptions(element: YodoElement, theme: Theme): Options {
  return {
    seed: element.seed,
    stroke: adaptColor(element.strokeColor, theme, 'stroke'),
    strokeWidth: element.strokeWidth,
    roughness: element.roughness,
    fill:
      element.backgroundColor === 'transparent'
        ? undefined
        : adaptColor(element.backgroundColor, theme, 'fill'),
    fillStyle: element.fillStyle,
    strokeLineDash: DASHES[element.strokeStyle],
  }
}

/**
 * A pencil stroke: a plain, smoothed canvas path with no rough.js wobble
 * (ADR 0024). The caller's save/restore resets the style set here.
 */
function drawStroke(ctx: SceneContext, element: PencilElement, theme: Theme) {
  const path = smoothPath(
    element.points.map(([dx, dy]): Point => [element.x + dx, element.y + dy]),
  )
  if (path.length === 0) return
  ctx.beginPath()
  for (const step of path) {
    if (step.type === 'move') ctx.moveTo(...step.to)
    else if (step.type === 'line') ctx.lineTo(...step.to)
    else ctx.quadraticCurveTo(...step.control, ...step.to)
  }
  ctx.strokeStyle = adaptColor(element.strokeColor, theme, 'stroke')
  ctx.lineWidth = element.strokeWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.setLineDash(DASHES[element.strokeStyle] ?? [])
  ctx.stroke()
}

/** Where an aligned line starts in a box of this left edge and width. */
export function alignedX(align: TextAlign, left: number, width: number) {
  if (align === 'center') return left + width / 2
  return align === 'right' ? left + width : left
}

/**
 * Draws `lines` from `top` down. Each line is centred in its line box, which
 * matches how CSS places a line in the editing textarea (ADR 0027).
 */
function drawLines(
  ctx: SceneContext,
  lines: readonly string[],
  style: { family: FontFamily; size: number; align: TextAlign; color: string },
  box: { left: number; top: number; width: number },
) {
  const lineHeight = style.size * LINE_HEIGHT
  ctx.font = fontOf(style.family, style.size)
  ctx.fillStyle = style.color
  ctx.textAlign = style.align
  ctx.textBaseline = 'middle'
  const x = alignedX(style.align, box.left, box.width)
  lines.forEach((line, i) => {
    ctx.fillText(line, x, box.top + (i + 0.5) * lineHeight)
  })
}

/** A measure on the scene's own context; the caller's save/restore resets the font. */
function contextMeasure(ctx: SceneContext): Measure {
  return (text, font) => {
    ctx.font = font
    return ctx.measureText(text).width
  }
}

/** A shape's label, wrapped to its label box and centred in it (ADR 0026). */
function drawLabel(
  ctx: SceneContext,
  shape: Extract<
    YodoElement,
    { type: 'rectangle' | 'diamond' | 'ellipse' | 'note' }
  >,
  theme: Theme,
) {
  const { label } = shape
  if (!label?.text) return
  const box = labelBox(shape, label.fontSize * MIN_LABEL_EMS)
  const layout = layoutText(
    label.text,
    label.fontFamily,
    label.fontSize,
    contextMeasure(ctx),
    box.width,
  )
  drawLines(
    ctx,
    layout.lines,
    {
      family: label.fontFamily,
      size: label.fontSize,
      align: label.textAlign,
      color: adaptColor(shape.strokeColor, theme, 'stroke'),
    },
    {
      left: box.x,
      top: box.y + (box.height - layout.height) / 2,
      width: box.width,
    },
  )
}

/** The note's corner radius and shadow, in world units (ADR 0038). */
export const NOTE_RADIUS = 4
export const NOTE_SHADOW = {
  blur: 10,
  offsetY: 3,
  color: 'rgba(0, 0, 0, 0.22)',
}

/**
 * A note: a plain rounded box with a soft shadow, no rough.js (ADR 0038). The
 * shadow is set inside its own save/restore so it never reaches the text.
 */
function drawNote(ctx: SceneContext, note: NoteElement, theme: Theme) {
  ctx.save()
  ctx.fillStyle = adaptColor(note.backgroundColor, theme, 'fill')
  ctx.shadowColor = NOTE_SHADOW.color
  ctx.shadowBlur = NOTE_SHADOW.blur
  ctx.shadowOffsetY = NOTE_SHADOW.offsetY
  ctx.beginPath()
  ctx.roundRect(note.x, note.y, note.width, note.height, NOTE_RADIUS)
  ctx.fill()
  ctx.restore()
  drawLabel(ctx, note, theme)
}

/** The stand-in for an image that is loading or missing, per theme. */
export const IMAGE_PLACEHOLDER = {
  light: { fill: '#e9ecef', line: '#adb5bd' },
  dark: { fill: '#2b2f36', line: '#5c636e' },
}

/**
 * An image: its picture when loaded, otherwise a plain grey box. Pictures keep
 * their colours in dark mode: the theme adaptation is for drawing colours
 * only (ADR 0015).
 */
function drawImage(
  ctx: SceneContext,
  image: ImageElement,
  theme: Theme,
  source: CanvasImageSource | undefined,
) {
  const { x, y, width, height } = image
  if (source) {
    ctx.drawImage(source, x, y, width, height)
    return
  }
  const colors = IMAGE_PLACEHOLDER[theme]
  ctx.fillStyle = colors.fill
  ctx.strokeStyle = colors.line
  ctx.lineWidth = 1
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.rect(x, y, width, height)
  ctx.fill()
  ctx.stroke()
}

function drawElement(
  ctx: SceneContext,
  rough: SceneRough,
  element: YodoElement,
  theme: Theme,
  images: Surface['images'],
) {
  const options = roughOptions(element, theme)
  const { x, y, width, height } = element
  switch (element.type) {
    case 'rectangle':
      if (element.roundness === 'round') {
        const corners: Point[] = [
          [x, y],
          [x + width, y],
          [x + width, y + height],
          [x, y + height],
        ]
        rough.path(roundedPolygonPath(corners, cornerRadius(element)), options)
      } else {
        rough.rectangle(x, y, width, height, options)
      }
      drawLabel(ctx, element, theme)
      return
    case 'diamond':
      if (element.roundness === 'round') {
        rough.path(
          roundedPolygonPath(diamondPoints(element), cornerRadius(element)),
          options,
        )
      } else {
        rough.polygon(diamondPoints(element), options)
      }
      drawLabel(ctx, element, theme)
      return
    case 'ellipse':
      rough.ellipse(x + width / 2, y + height / 2, width, height, options)
      drawLabel(ctx, element, theme)
      return
    case 'note':
      drawNote(ctx, element, theme)
      return
    case 'image':
      drawImage(ctx, element, theme, images?.(element.fileId))
      return
    case 'line':
    case 'arrow': {
      const points = element.points.map(([dx, dy]): Point => [x + dx, y + dy])
      const curved = isCurved(element)
      if (curved) rough.curve(points, options)
      else rough.linearPath(points, options)
      // Stored documents aren't validated, so fewer than two points can occur.
      if (points.length < 2) return
      const to = points.at(-1)!
      const from = headFrom(points, curved)
      const hasLength = from[0] !== to[0] || from[1] !== to[1]
      if (element.type === 'arrow' && element.endArrowhead && hasLength) {
        // Same seed, so the head keeps its wobble from frame to frame too.
        rough.linearPath(arrowhead(from, to), options)
      }
      return
    }
    case 'pencil':
      drawStroke(ctx, element, theme)
      return
    case 'text':
      // Free text doesn't wrap: its lines are its paragraphs.
      drawLines(
        ctx,
        element.text.split('\n'),
        {
          family: element.fontFamily,
          size: element.fontSize,
          align: element.textAlign,
          color: adaptColor(element.strokeColor, theme, 'stroke'),
        },
        { left: x, top: y, width },
      )
      return
  }
}

/** Editor UI drawn over the elements, in world coordinates. */
export interface Overlay {
  selected: readonly YodoElement[]
  marquee: Bounds | null
  /** The shape an arrow end would attach to (ADR 0052). */
  bindTarget?: YodoElement | null
}

const NO_OVERLAY: Overlay = { selected: [], marquee: null }

// Overlay look from docs/ui.md "Selection", in screen px, with the accent
// tokens of each theme. Gap and handle size live in frame.ts.
interface OverlayColors {
  accent: string
  accentSoft: string
  handleFill: string
  badgeText: string
}
const OVERLAY_COLORS: Record<Theme, OverlayColors> = {
  light: {
    accent: '#0F766E',
    accentSoft: '#E3F2EF',
    handleFill: '#FFFFFF',
    badgeText: '#FFFFFF',
  },
  dark: {
    accent: '#4FD1C5',
    accentSoft: '#1D3836',
    handleFill: '#1C1E21',
    badgeText: '#062420',
  },
}
const OUTLINE_WIDTH = 1.25
/** The outline of the shape an arrow end would attach to. */
const BIND_OUTLINE_WIDTH = 2.5
const ELEMENT_OUTLINE_WIDTH = 1
const HANDLE_RADIUS = 2
const BADGE_FONT = '600 11px Manrope, system-ui, sans-serif'
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
  colors: OverlayColors,
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
  ctx.fillStyle = colors.accent
  ctx.fill()
  ctx.fillStyle = colors.badgeText
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
  colors: OverlayColors,
) {
  const px = 1 / viewport.zoom
  ctx.save()
  ctx.strokeStyle = colors.accent
  const frame = selectionFrame(overlay.selected, px)
  const line = handleLine(overlay.selected)
  if (line) {
    // One selected line or arrow: handles on its points instead of a box
    // (ADR 0052, 0053). The mid-handle that bends a straight one is hollow.
    ctx.lineWidth = OUTLINE_WIDTH * px
    for (const { handle, at } of lineHandles(line)) {
      ctx.beginPath()
      const size = HANDLE_SIZE * px
      ctx.roundRect(at[0] - size / 2, at[1] - size / 2, size, size, size / 2)
      if (handle.kind === 'point') {
        ctx.fillStyle = colors.handleFill
        ctx.fill()
      }
      ctx.stroke()
    }
  }
  if (frame && drawsBoxFrame(overlay.selected)) {
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
    ctx.fillStyle = colors.handleFill
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
    drawSizeBadge(ctx, frame.box, outline, viewport, dpr, colors)
  }
  const { bindTarget } = overlay
  if (bindTarget && isBindable(bindTarget)) {
    const outline = bindOutline(bindTarget)
    ctx.beginPath()
    outline.forEach(([x, y], i) =>
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y),
    )
    ctx.lineTo(outline[0]![0], outline[0]![1])
    ctx.lineWidth = BIND_OUTLINE_WIDTH * px
    ctx.stroke()
  }
  if (overlay.marquee) {
    const { x, y, width, height } = overlay.marquee
    ctx.beginPath()
    ctx.rect(x, y, width, height)
    ctx.fillStyle = colors.accentSoft
    ctx.globalAlpha = 0.5
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.lineWidth = px
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * `box` grown to hold the element's label, which is not clipped and may
 * overflow a small shape (ADR 0026): it is at least `MIN_LABEL_EMS` wide,
 * centred on the shape, and as tall as its wrapped lines. The line count is an
 * upper bound (a character is at most one em wide), so this never undercounts.
 */
function withLabel(element: YodoElement, box: Bounds): Bounds {
  if (!('label' in element) || !element.label?.text) return box
  const { text, fontSize } = element.label
  const width = Math.max(
    labelBox(element, fontSize * MIN_LABEL_EMS).width,
    box.width,
  )
  const lines =
    Math.ceil((text.length * fontSize) / width) + text.split('\n').length
  const height = Math.max(box.height, lines * fontSize * LINE_HEIGHT)
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  return { x: cx - width / 2, y: cy - height / 2, width, height }
}

/** How far rough.js may move an outline, as a share of the box's larger side. */
const ROUGH_SHARE = 0.1

/**
 * Screen pixels kept around every element: a note's shadow (blur 10, offset 3)
 * is fixed in screen pixels, so in world units it grows as the camera zooms out.
 */
const SCREEN_MARGIN = 16

/**
 * Whether any part of `element` could land inside `view` (world units). The
 * element's box grows by a margin for what the box leaves out: stroke width,
 * rough.js wobble and an arrowhead. A rotated element is judged by the circle
 * around its box, which holds it at any angle. Cheap and generous: drawing a
 * few extra elements is fine, skipping a visible one is not.
 */
function mayBeVisible(
  element: YodoElement,
  view: Bounds,
  zoom: number,
): boolean {
  const box = withLabel(element, drawnBounds(element))
  // rough.js bends a shape by a share of its size, so big shapes need more.
  const margin =
    ARROWHEAD_LENGTH +
    element.strokeWidth * 2 +
    element.roughness * 8 +
    Math.max(box.width, box.height) * ROUGH_SHARE +
    SCREEN_MARGIN / zoom
  let { x, y, width, height } = box
  if (element.angle !== 0) {
    const radius = Math.hypot(width, height) / 2
    x += width / 2 - radius
    y += height / 2 - radius
    width = height = radius * 2
  }
  return (
    x + width + margin >= view.x &&
    x - margin <= view.x + view.width &&
    y + height + margin >= view.y &&
    y - margin <= view.y + view.height
  )
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
  const theme = surface.theme ?? 'light'
  // Clear in CSS pixels, before the camera transform applies.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, surface.width, surface.height)
  if (surface.background) {
    ctx.fillStyle = surface.background
    ctx.fillRect(0, 0, surface.width, surface.height)
  }
  // One transform maps world units to device pixels, so elements below draw
  // in world coordinates: device = (world - (x, y)) * zoom * dpr.
  const scale = dpr * viewport.zoom
  ctx.setTransform(scale, 0, 0, scale, -viewport.x * scale, -viewport.y * scale)

  // Only what can reach the window is drawn: on a big board most elements are
  // off screen, and rough.js is the expensive part of a frame.
  const view: Bounds = {
    x: viewport.x,
    y: viewport.y,
    width: surface.width / viewport.zoom,
    height: surface.height / viewport.zoom,
  }
  for (const element of elements) {
    if (!mayBeVisible(element, view, viewport.zoom)) continue
    ctx.save()
    ctx.globalAlpha = element.opacity / 100
    drawElement(ctx, rough, element, theme, surface.images)
    ctx.restore()
  }
  drawOverlay(ctx, overlay, viewport, dpr, OVERLAY_COLORS[theme])
}
