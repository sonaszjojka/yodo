// What `render_drawing` draws and how (roadmap 5.5, ADR 0065). It picks the
// elements and frame with the export's own helpers, then draws them as the app
// exports them: PNG through `renderExport` on a `@napi-rs/canvas` canvas
// (ADR 0041), SVG through `buildSvg` (ADR 0043). Image elements are drawn as
// the export's placeholder: the server has no image bytes yet.
import { createCanvas } from '@napi-rs/canvas'
import rough from 'roughjs'
import type { YodoElement } from '../../../web/src/core/document/types.ts'
import {
  exportElements,
  exportFrame,
  renderExport,
} from '../../../web/src/core/export/exportScene.ts'
import {
  fontFaceCss,
  neededFontFiles,
} from '../../../web/src/core/export/svg/fonts.ts'
import { buildSvg } from '../../../web/src/core/export/svg/svgScene.ts'
import type { Bounds } from '../../../web/src/core/geometry/rect.ts'
import type { Theme } from '../../../web/src/core/render/colors.ts'
import {
  mayBeVisible,
  type SceneRough,
} from '../../../web/src/core/render/render.ts'
import type { Measure } from '../../../web/src/core/text/layout.ts'
import { embeddedFonts } from './fonts.ts'
import { nodeMeasure } from './measure.ts'

export type RenderTarget =
  | { kind: 'all' }
  | { kind: 'ids'; ids: readonly string[] }
  | { kind: 'region'; region: Bounds }

export interface Selection {
  elements: YodoElement[]
  /** The world-space area the image shows. */
  frame: Bounds
}

/**
 * The longer side of a PNG, in pixels. Big enough to read labels, small
 * enough for an agent's context; `region` zooms in on a large drawing.
 */
export const MAX_RENDER_SIDE = 2048

function quoted(ids: readonly string[]) {
  return ids.map((id) => JSON.stringify(id)).join(', ')
}

/** The elements and frame of a render, or why there is nothing to draw. */
export function selectForRender(
  elements: readonly YodoElement[],
  target: RenderTarget,
  measure: Measure,
): Selection | { error: string } {
  if (elements.length === 0) return { error: 'The drawing has no elements.' }
  if (target.kind === 'region') {
    const { region } = target
    // The renderer's own culling test: generous for strokes, rough.js wobble,
    // arrowheads, rotation and shadows, so nothing visible in the region is
    // left out. An extra element is clipped away by the frame.
    const picked = elements.filter((element) =>
      mayBeVisible(element, region, 1),
    )
    if (picked.length === 0) {
      return { error: 'Nothing is drawn in that region.' }
    }
    return { elements: picked, frame: { ...region } }
  }
  let picked: YodoElement[]
  if (target.kind === 'ids') {
    const known = new Set(elements.map((element) => element.id))
    const missing = target.ids.filter((id) => !known.has(id))
    if (missing.length > 0) {
      return {
        error: `No element with id ${quoted(missing)} in this drawing. Call get_drawing for its element ids.`,
      }
    }
    picked = exportElements(elements, target.ids, 'selection')
  } else {
    picked = [...elements]
  }
  const frame = exportFrame(picked, measure)
  if (!frame) return { error: 'The drawing has no elements.' }
  return { elements: picked, frame }
}

/** `requested`, reduced so the image's longer side fits `MAX_RENDER_SIDE`. */
export function fitScale(frame: Bounds, requested: number): number {
  const longer = Math.max(frame.width, frame.height)
  return Math.min(requested, MAX_RENDER_SIDE / longer)
}

export interface PngOptions {
  theme: Theme
  scale: number
}

/** The PNG of `elements` in `frame`, on the page colour of the theme. */
export function renderPng(
  elements: readonly YodoElement[],
  frame: Bounds,
  { theme, scale }: PngOptions,
): Buffer {
  nodeMeasure() // registers the fonts the canvas draws text with
  const canvas = createCanvas(1, 1)
  // rough.js only calls getContext('2d') on the canvas it's given.
  const roughCanvas: SceneRough = rough.canvas(
    canvas as unknown as Parameters<typeof rough.canvas>[0],
  )
  renderExport(canvas, roughCanvas, elements, frame, {
    scale,
    theme,
    background: true,
  })
  return canvas.toBuffer('image/png')
}

/** The SVG file of `elements` in `frame`, with the fonts its text uses. */
export function renderSvg(
  elements: readonly YodoElement[],
  frame: Bounds,
  { theme }: { theme: Theme },
): string {
  return buildSvg(
    elements,
    frame,
    { theme, background: true },
    {
      measure: nodeMeasure(),
      generator: rough.generator(),
      fontCss: fontFaceCss(embeddedFonts(neededFontFiles(elements))),
      imageData: () => undefined,
    },
  )
}
