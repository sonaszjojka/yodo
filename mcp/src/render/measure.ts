// Text measurement in Node (ADR 0065): the canvas `measureText` the app uses
// (`web/src/ui/measure.ts`), on `@napi-rs/canvas` with the bundled fonts, so
// labels wrap and frames size as they do in the browser.
import { createCanvas } from '@napi-rs/canvas'
import type { Measure } from '../../../web/src/core/text/layout.ts'
import { registerFonts } from './fonts.ts'

let measure: Measure | undefined

/** One measure per process; the first call registers the fonts. */
export function nodeMeasure(): Measure {
  if (!measure) {
    registerFonts()
    const ctx = createCanvas(1, 1).getContext('2d')
    measure = (text, font) => {
      ctx.font = font
      return ctx.measureText(text).width
    }
  }
  return measure
}
