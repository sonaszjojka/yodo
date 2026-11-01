// Draws the scene on a Canvas 2D context with rough.js (ADR 0004). Takes only
// the parts of the canvas and rough.js APIs it uses, so tests can pass fakes.
import type { RoughCanvas } from 'roughjs/bin/canvas'
import type { StrokeStyle, YodoElement } from '../document/types.ts'
import type { Viewport } from '../geometry/viewport.ts'

export type SceneContext = Pick<
  CanvasRenderingContext2D,
  'setTransform' | 'clearRect' | 'save' | 'restore' | 'globalAlpha'
>
/** The return value (a Drawable) is unused, so fakes may return nothing. */
export interface SceneRough {
  rectangle(...args: Parameters<RoughCanvas['rectangle']>): unknown
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
    // Other element types get their renderers with their tools (roadmap 1.4+).
    if (element.type !== 'rectangle') continue
    ctx.save()
    ctx.globalAlpha = element.opacity / 100
    rough.rectangle(element.x, element.y, element.width, element.height, {
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
    })
    ctx.restore()
  }
}
