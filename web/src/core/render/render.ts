// Draws the scene on a Canvas 2D context with rough.js (ADR 0004). Takes only
// the parts of the canvas and rough.js APIs it uses, so tests can pass fakes.
import type { RoughCanvas } from 'roughjs/bin/canvas'
import type { Options } from 'roughjs/bin/core'
import type { Point, StrokeStyle, YodoElement } from '../document/types.ts'
import { arrowhead } from '../geometry/line.ts'
import { diamondPoints } from '../geometry/rect.ts'
import type { Viewport } from '../geometry/viewport.ts'

export type SceneContext = Pick<
  CanvasRenderingContext2D,
  'setTransform' | 'clearRect' | 'save' | 'restore' | 'globalAlpha'
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
      const [from, to] = points.slice(-2) as [Point, Point]
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

export function renderScene(
  ctx: SceneContext,
  rough: SceneRough,
  elements: readonly YodoElement[],
  surface: Surface,
  viewport: Viewport,
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
}
