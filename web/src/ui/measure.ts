import { estimateMeasure, type Measure } from '../core/text/layout.ts'

/**
 * Measures text with an off-screen canvas, so sizes match what the scene's
 * canvas draws (ADR 0027). Falls back to the estimate without a 2D context.
 */
export function createCanvasMeasure(): Measure {
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return estimateMeasure
  return (text, font) => {
    ctx.font = font
    return ctx.measureText(text).width
  }
}
