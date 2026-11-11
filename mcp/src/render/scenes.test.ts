// The PNG `render_drawing` draws, compared with the app's own PNG export of the
// reference scenes (roadmap 5.5; the baselines are roadmap 2.7c, ADR 0044).
// The baselines come from Chromium in the pinned Playwright Docker image, and
// this test draws with `@napi-rs/canvas` (ADR 0065): both are Skia, but font
// hinting and anti-aliasing differ, so the check is "the same image within a
// small share of pixels", not an exact match.
import { readFile } from 'node:fs/promises'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { describe, expect, it } from 'vitest'
import { scenes } from '../../../e2e/visual/scenes.ts'
import { migrate } from '../../../web/src/core/document/migrate.ts'
import type { Theme } from '../../../web/src/core/render/colors.ts'
import { nodeMeasure } from './measure.ts'
import { renderPng, selectForRender } from './render.ts'

const BASELINES = new URL(
  '../../../e2e/visual/__screenshots__/',
  import.meta.url,
)

/** A pixel differs when a channel (alpha included) is off by more than this. */
const CHANNEL_TOLERANCE = 48
/**
 * The most pixels allowed to differ. Measured on 2026-11-11 (macOS arm64,
 * `@napi-rs/canvas` 1.1.0): shapes and mixed 0.000% in both themes (the same
 * Skia paths from the same rough.js seeds), text 1.110% light and 1.138%
 * dark (glyph advances differ by about 1%; no line wraps differently).
 */
const MAX_DIFF_SHARE = 0.02

async function decode(png: Buffer) {
  const image = await loadImage(png)
  const ctx = createCanvas(image.width, image.height).getContext('2d')
  ctx.drawImage(image, 0, 0)
  return ctx.getImageData(0, 0, image.width, image.height)
}

describe('render_drawing matches the export baselines', () => {
  const measure = nodeMeasure()

  for (const { name, document } of scenes) {
    for (const theme of ['light', 'dark'] as Theme[]) {
      it(`${name}, ${theme}`, async () => {
        const doc = migrate(document)
        const selection = selectForRender(
          doc.elements,
          { kind: 'all' },
          measure,
        )
        if ('error' in selection) throw new Error(selection.error)
        const baseline = await decode(
          await readFile(new URL(`${name}-${theme}-png.png`, BASELINES)),
        )
        // The baselines are exported at the dialog's default scale.
        const scale = baseline.width / selection.frame.width
        const ours = await decode(
          renderPng(selection.elements, selection.frame, { theme, scale }),
        )
        expect([ours.width, ours.height]).toEqual([
          baseline.width,
          baseline.height,
        ])
        let differing = 0
        for (let i = 0; i < ours.data.length; i += 4) {
          for (let c = 0; c < 4; c++) {
            if (
              Math.abs(ours.data[i + c]! - baseline.data[i + c]!) >
              CHANNEL_TOLERANCE
            ) {
              differing++
              break
            }
          }
        }
        const share = differing / (ours.width * ours.height)
        expect(share).toBeLessThan(MAX_DIFF_SHARE)
      })
    }
  }
})
