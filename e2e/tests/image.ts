// Helpers for the image tests: paste a red picture and check it was drawn.

import type { Locator, Page } from '@playwright/test'
import { expect } from './fixtures.ts'

/** Pastes a solid red PNG, 240 x 120 pixels, as a screenshot tool would. */
export async function pasteRedImage(page: Page) {
  await page.evaluate(async () => {
    const source = document.createElement('canvas')
    source.width = 240
    source.height = 120
    const ctx = source.getContext('2d')!
    ctx.fillStyle = '#ff0000'
    ctx.fillRect(0, 0, 240, 120)
    const blob = await new Promise<Blob>((done) =>
      source.toBlob((b) => done(b!), 'image/png'),
    )
    const data = new DataTransfer()
    data.items.add(new File([blob], 'shot.png', { type: 'image/png' }))
    // A plain Event with `clipboardData` set: Firefox ignores that option on
    // the ClipboardEvent constructor.
    const event = new Event('paste', { bubbles: true })
    Object.defineProperty(event, 'clipboardData', { value: data })
    window.dispatchEvent(event)
  })
}

/** The colour of the pixel in the middle of a canvas, as [r, g, b, a]. */
export function centrePixel(canvas: Locator) {
  return canvas.evaluate((element: HTMLCanvasElement) => {
    const ctx = element.getContext('2d')!
    const { data } = ctx.getImageData(
      Math.floor(element.width / 2),
      Math.floor(element.height / 2),
      1,
      1,
    )
    return [...data]
  })
}

/** Red enough to be the image and not its grey placeholder or the page. */
export function isRed([r, g, b, a]: number[]) {
  return r! > 200 && g! < 60 && b! < 60 && a === 255
}

/** Waits for the middle of the canvas to be the red image, not its placeholder. */
export async function expectRedCentre(canvas: Locator) {
  await expect.poll(async () => isRed(await centrePixel(canvas))).toBe(true)
}
