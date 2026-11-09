// Roadmap 2.7a: the export dialog saves the drawing or the selection as a PNG
// with or without background, light or dark, at a scale (ADR 0041).

import type { Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { editorCanvas, expectInk } from './canvas.ts'
import { expect, test } from './fixtures.ts'

type Rgba = [number, number, number, number]

const PAGE_LIGHT: Rgba = [0xf7, 0xf9, 0xf9, 255]
const PAGE_DARK: Rgba = [0x14, 0x15, 0x17, 255]
const INK_LIGHT = [0x1e, 0x1f, 0x22]
const INK_DARK = [0xe4, 0xe6, 0xe8]

async function dragRectangle(
  page: Page,
  from: [number, number],
  to: [number, number],
) {
  await page.getByRole('button', { name: /^Rectangle/ }).click()
  const box = await editorCanvas(page).boundingBox()
  if (!box) throw new Error('the editor canvas is not visible')
  await page.mouse.move(box.x + from[0], box.y + from[1])
  await page.mouse.down()
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 5 })
  await page.mouse.up()
}

async function newDrawing(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'New drawing' }).click()
  await page.waitForURL(/#\/d\/[^/]+$/)
}

/** Decodes a PNG in the page: its size, one pixel, and how much ink it has. */
async function inspectPng(page: Page, path: string, ink: number[]) {
  const base64 = (await readFile(path)).toString('base64')
  return page.evaluate(
    async ([data, wantInk]) => {
      const image = new Image()
      image.src = `data:image/png;base64,${data}`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(image, 0, 0)
      const { data: px } = ctx.getImageData(0, 0, canvas.width, canvas.height)
      let inkPixels = 0
      for (let i = 0; i < px.length; i += 4) {
        if (
          px[i + 3] > 250 &&
          Math.abs(px[i] - wantInk[0]) <= 6 &&
          Math.abs(px[i + 1] - wantInk[1]) <= 6 &&
          Math.abs(px[i + 2] - wantInk[2]) <= 6
        ) {
          inkPixels++
        }
      }
      return {
        width: image.width,
        height: image.height,
        corner: [...px.slice(8 * 4, 8 * 4 + 4)] as Rgba,
        inkPixels,
        centre: [
          ...ctx.getImageData(
            Math.floor(image.width / 2),
            Math.floor(image.height / 2),
            1,
            1,
          ).data,
        ] as Rgba,
      }
    },
    [base64, ink] as const,
  )
}

async function download(page: Page) {
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download' }).click(),
  ])
  return { name: file.suggestedFilename(), path: await file.path() }
}

test('exports the drawing as a PNG: size, background, dark version', async ({
  page,
}) => {
  await newDrawing(page)
  await dragRectangle(page, [200, 200], [420, 360])
  await expectInk(page)

  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Export', exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('File name').fill('my-sketch')

  // Light with a background, at the default 2x: (220 + 2 * 16) x (160 + 2 * 16).
  const light = await download(page)
  expect(light.name).toBe('my-sketch.png')
  const lightPng = await inspectPng(page, light.path, INK_LIGHT)
  expect(Math.abs(lightPng.width - 504)).toBeLessThanOrEqual(4)
  expect(Math.abs(lightPng.height - 384)).toBeLessThanOrEqual(4)
  expect(lightPng.corner).toEqual(PAGE_LIGHT)
  expect(lightPng.inkPixels).toBeGreaterThan(100)

  // 1x halves the size.
  await dialog.getByLabel('1x').check()
  const small = await inspectPng(page, (await download(page)).path, INK_LIGHT)
  expect(Math.abs(small.width * 2 - lightPng.width)).toBeLessThanOrEqual(4)

  // Without the background the corner is transparent.
  await dialog.getByLabel('Background').uncheck()
  const clear = await inspectPng(page, (await download(page)).path, INK_LIGHT)
  expect(clear.corner[3]).toBe(0)

  // Dark version: dark ink, and the dark page colour behind it.
  await dialog.getByLabel('Background').check()
  await dialog.getByLabel('Dark version').check()
  const dark = await inspectPng(page, (await download(page)).path, INK_DARK)
  expect(dark.corner).toEqual(PAGE_DARK)
  expect(dark.inkPixels).toBeGreaterThan(100)
})

test('exports only the selection, and the dialog does not edit the drawing behind it', async ({
  page,
}) => {
  await newDrawing(page)
  await dragRectangle(page, [100, 100], [500, 400])
  await dragRectangle(page, [600, 150], [700, 210])
  await expectInk(page)
  // The tool stays active and selects nothing (ADR 0050): select the small
  // rectangle by its left edge.
  await page.keyboard.press('Escape')
  const box = await editorCanvas(page).boundingBox()
  if (!box) throw new Error('the editor canvas is not visible')
  await page.mouse.click(box.x + 600, box.y + 180)

  await page.keyboard.press('ControlOrMeta+Shift+e')
  const dialog = page.getByRole('dialog', { name: 'Export', exact: true })
  await expect(dialog.getByLabel(/^Selection \(1\)/)).toBeChecked()

  const selection = await inspectPng(
    page,
    (await download(page)).path,
    INK_LIGHT,
  )
  // The small rectangle: (100 + 32) x (60 + 32) at 2x.
  expect(Math.abs(selection.width - 264)).toBeLessThanOrEqual(4)
  expect(Math.abs(selection.height - 184)).toBeLessThanOrEqual(4)

  await dialog.getByLabel('Whole drawing').check()
  const whole = await inspectPng(page, (await download(page)).path, INK_LIGHT)
  expect(whole.width).toBeGreaterThan(selection.width * 3)

  // Delete with focus on a dialog control must not delete the selection.
  await dialog.getByLabel('Whole drawing').focus()
  await page.keyboard.press('Delete')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await page.keyboard.press('ControlOrMeta+Shift+e')
  await expect(dialog.getByLabel(/^Selection \(1\)/)).toBeVisible()
})

test('Copy puts the PNG on the clipboard', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permissions: Chromium only')
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await newDrawing(page)
  await dragRectangle(page, [200, 200], [420, 360])
  await expectInk(page)

  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await page.getByRole('button', { name: 'Copy' }).click()
  await expect(page.getByText('Copied to the clipboard.')).toBeVisible()

  const type = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read()
    return item.types
  })
  expect(type).toContain('image/png')
})

test('Download waits until the image is drawn, even when fonts load late', async ({
  page,
}) => {
  await newDrawing(page)
  await dragRectangle(page, [200, 200], [420, 360])
  await expectInk(page)
  // Fonts that settle late: the preview's first draw waits for them.
  await page.evaluate(() => {
    const late = new Promise((resolve) => setTimeout(resolve, 1500))
    Object.defineProperty(document.fonts, 'ready', { get: () => late })
  })

  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const png = await inspectPng(page, (await download(page)).path, INK_LIGHT)

  // The drawn 504 x 384 image, not a blank default 300 x 150 canvas.
  expect(Math.abs(png.width - 504)).toBeLessThanOrEqual(4)
})

test('an exported drawing contains its pasted images, not placeholders', async ({
  page,
}) => {
  await newDrawing(page)
  await expect(editorCanvas(page)).toBeVisible()
  // A solid red PNG pasted as a screenshot tool would (see images.spec.ts).
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
    const event = new Event('paste', { bubbles: true })
    Object.defineProperty(event, 'clipboardData', { value: data })
    window.dispatchEvent(event)
  })

  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const png = await inspectPng(page, (await download(page)).path, INK_LIGHT)

  const [r, g, b, a] = png.centre
  expect(r).toBeGreaterThan(200)
  expect(g).toBeLessThan(60)
  expect(b).toBeLessThan(60)
  expect(a).toBe(255)
})
