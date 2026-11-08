// Roadmap 2.3: the theme choice recolours the UI and the canvas, is
// remembered, and "system" follows the OS live (ADR 0015, 0036).

import type { Page } from '@playwright/test'
import { editorCanvas, expectInk } from './canvas.ts'
import { expect, test } from './fixtures.ts'

type Rgb = [number, number, number]

const INK_LIGHT: Rgb = [0x1e, 0x1f, 0x22]
const INK_DARK: Rgb = [0xe4, 0xe6, 0xe8]
const ROSE_LIGHT: Rgb = [0xf7, 0xe1, 0xde]
const ROSE_DARK: Rgb = [0x3d, 0x26, 0x24]
const PAGE_DARK = 'rgb(20, 21, 23)'
const PAGE_LIGHT = 'rgb(247, 249, 249)'

/** How many canvas pixels are within a few levels of `color` and opaque. */
function pixelsNear(page: Page, color: Rgb): Promise<number> {
  return editorCanvas(page).evaluate((canvas: HTMLCanvasElement, want) => {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('the editor canvas has no 2D context')
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    let count = 0
    for (let i = 0; i < data.length; i += 4) {
      if (
        data[i + 3] > 250 &&
        Math.abs(data[i] - want[0]) <= 6 &&
        Math.abs(data[i + 1] - want[1]) <= 6 &&
        Math.abs(data[i + 2] - want[2]) <= 6
      ) {
        count++
      }
    }
    return count
  }, color)
}

/** A rectangle with an Ink stroke and a Rose fill, then nothing selected. */
async function drawReferenceScene(page: Page) {
  await page.getByRole('button', { name: /^Rectangle/ }).click()
  const box = await editorCanvas(page).boundingBox()
  if (!box) throw new Error('the editor canvas is not visible')
  await page.mouse.move(box.x + 200, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(box.x + 420, box.y + 360, { steps: 5 })
  await page.mouse.up()
  await expectInk(page)

  // The Rectangle tool stays active and selects nothing (ADR 0050): go back
  // to Select and pick the rectangle by its left edge to style it.
  await page.keyboard.press('Escape')
  await page.mouse.click(box.x + 200, box.y + 280)
  await page.getByRole('button', { name: /^Fill/ }).click()
  await page.getByRole('button', { name: 'Rose' }).click()
  // Click empty canvas so the selection overlay doesn't tint the sample.
  await page.mouse.click(box.x + 40, box.y + 600)
}

async function pageBackground(page: Page) {
  return page.evaluate(
    () => getComputedStyle(document.documentElement).backgroundColor,
  )
}

test('Dark in the sidebar recolours the page and the drawing, and is remembered', async ({
  page,
}) => {
  await page.goto('./')
  await page.emulateMedia({ colorScheme: 'light' })
  expect(await pageBackground(page)).toBe(PAGE_LIGHT)

  await page.getByRole('radio', { name: 'Dark' }).click()
  expect(await pageBackground(page)).toBe(PAGE_DARK)

  await page.getByRole('button', { name: 'New drawing' }).click()
  await page.waitForURL(/#\/d\/[^/]+$/)
  await drawReferenceScene(page)

  // The stored light colours are shown as their dark twins.
  await expect.poll(() => pixelsNear(page, INK_DARK)).toBeGreaterThan(50)
  await expect.poll(() => pixelsNear(page, ROSE_DARK)).toBeGreaterThan(20)
  expect(await pixelsNear(page, INK_LIGHT)).toBe(0)
  expect(await pixelsNear(page, ROSE_LIGHT)).toBe(0)

  // Auto-save is debounced (ADR 0032): wait for it before reloading.
  await expect(page.getByRole('status')).toHaveText('Saved')

  // The choice survives a reload, even with the OS saying light.
  await page.reload()
  expect(await pageBackground(page)).toBe(PAGE_DARK)
  await expectInk(page)
  await expect.poll(() => pixelsNear(page, INK_DARK)).toBeGreaterThan(50)
})

test('System follows the OS live, in the page and on the canvas', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('./')
  await page.getByRole('button', { name: 'New drawing' }).click()
  await page.waitForURL(/#\/d\/[^/]+$/)
  await drawReferenceScene(page)
  await expect.poll(() => pixelsNear(page, INK_LIGHT)).toBeGreaterThan(50)

  // No reload: the OS switches while the editor is open.
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect.poll(() => pageBackground(page)).toBe(PAGE_DARK)
  await expect.poll(() => pixelsNear(page, INK_DARK)).toBeGreaterThan(50)
  await expect.poll(() => pixelsNear(page, ROSE_DARK)).toBeGreaterThan(20)
  expect(await pixelsNear(page, INK_LIGHT)).toBe(0)

  await page.emulateMedia({ colorScheme: 'light' })
  await expect.poll(() => pixelsNear(page, INK_LIGHT)).toBeGreaterThan(50)
})

test('the Home theme switch moves and selects with the arrow keys', async ({
  page,
}) => {
  await page.goto('./')
  await page.emulateMedia({ colorScheme: 'light' })
  const system = page.getByRole('radio', { name: 'System' })
  const light = page.getByRole('radio', { name: 'Light' })
  const dark = page.getByRole('radio', { name: 'Dark' })

  // Only the checked radio is in the Tab order; arrows move focus and select.
  await system.focus()
  await page.keyboard.press('ArrowRight')
  await expect(light).toBeFocused()
  await expect(light).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('ArrowRight')
  await expect(dark).toBeFocused()
  await expect(dark).toHaveAttribute('aria-checked', 'true')
  expect(await pageBackground(page)).toBe(PAGE_DARK)

  // It wraps at both ends.
  await page.keyboard.press('ArrowRight')
  await expect(system).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(dark).toBeFocused()
  await expect(dark).toHaveAttribute('aria-checked', 'true')
})
