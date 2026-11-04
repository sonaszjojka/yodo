import { expect, type Page } from '@playwright/test'

/**
 * The editor canvas. Each redraw clears it to transparent, so any pixel with
 * alpha > 0 is something drawn.
 */
export function editorCanvas(page: Page) {
  return page.locator('canvas.canvas')
}

/** How many pixels of the editor canvas are not transparent. */
export function inkPixels(page: Page): Promise<number> {
  return editorCanvas(page).evaluate((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('the editor canvas has no 2D context')
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    let count = 0
    for (let alpha = 3; alpha < data.length; alpha += 4) {
      if (data[alpha] > 0) count++
    }
    return count
  })
}

/** Waits until the canvas shows a drawing (a rectangle's outline at least). */
export async function expectInk(page: Page) {
  await expect.poll(() => inkPixels(page)).toBeGreaterThan(100)
}
