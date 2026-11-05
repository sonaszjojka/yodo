// Roadmap 2.6: paste an image, see it, reload, find it on Home, in each usage
// mode (ADR 0035, 0040).

import type { Locator, Page } from '@playwright/test'
import { editorCanvas } from './canvas.ts'
import { expect, test } from './fixtures.ts'
import { hasStoredImage } from './storage.ts'

/** Pastes a solid red PNG, 240 x 120 pixels, as a screenshot tool would. */
async function pasteRedImage(page: Page) {
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
function centrePixel(canvas: Locator) {
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
function expectRed(pixel: number[]) {
  expect(pixel[0]).toBeGreaterThan(200)
  expect(pixel[1]).toBeLessThan(60)
  expect(pixel[2]).toBeLessThan(60)
  expect(pixel[3]).toBe(255)
}

test('a pasted image shows, is stored, survives a reload and fills its thumbnail', async ({
  page,
  mode,
}) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'New drawing' }).click()
  await page.waitForURL(/#\/d\/[^/]+$/)
  // The route changes before the drawing has loaded; paste needs the editor.
  await expect(editorCanvas(page)).toBeVisible()
  const id = decodeURIComponent(new URL(page.url()).hash.slice('#/d/'.length))

  await pasteRedImage(page)
  await expect
    .poll(async () => (await centrePixel(editorCanvas(page)))[0])
    .toBeGreaterThan(200)
  expectRed(await centrePixel(editorCanvas(page)))

  // The blob is in the mode's own store, under its content hash, and the
  // saved drawing lists it.
  const fileIds = await expect
    .poll(async () => {
      const found = await savedFileIds(page, mode, id)
      return found.length
    })
    .toBe(1)
    .then(() => savedFileIds(page, mode, id))
  expect(await hasStoredImage(page, mode, fileIds[0]!)).toBe(true)

  await page.reload()
  await expect
    .poll(async () => (await centrePixel(editorCanvas(page)))[0])
    .toBeGreaterThan(200)
  expectRed(await centrePixel(editorCanvas(page)))

  // Home's thumbnail draws the picture, not a placeholder.
  await page.getByRole('link', { name: 'Back to Home' }).click()
  // This drawing's card; other tests share the self-hosted server's list.
  const thumbnail = page
    .locator(`a[href="#/d/${id}"]`)
    .locator('.thumbnail-canvas')
  await expect
    .poll(async () => (await centrePixel(thumbnail))[0])
    .toBeGreaterThan(200)
  expectRed(await centrePixel(thumbnail))
})

test('an unsupported pasted file is refused with a message', async ({
  page,
}) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'New drawing' }).click()
  await page.waitForURL(/#\/d\/[^/]+$/)
  // The route changes before the drawing has loaded; paste needs the editor.
  await expect(editorCanvas(page)).toBeVisible()

  await page.evaluate(() => {
    const data = new DataTransfer()
    data.items.add(new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' }))
    // A plain Event with `clipboardData` set: Firefox ignores that option on
    // the ClipboardEvent constructor.
    const event = new Event('paste', { bubbles: true })
    Object.defineProperty(event, 'clipboardData', { value: data })
    window.dispatchEvent(event)
  })

  await expect(page.getByText('Only PNG, JPEG, GIF and WebP')).toBeVisible()
})

/** The saved drawing's `fileIds`, from the mode's own store. */
async function savedFileIds(
  page: Page,
  mode: 'hosted' | 'self-hosted',
  id: string,
): Promise<string[]> {
  if (mode === 'self-hosted') {
    const response = await page.request.get(`api/drawings/${id}`)
    if (response.status() !== 200) return []
    return ((await response.json()) as { fileIds: string[] }).fileIds
  }
  return page.evaluate(
    (id) =>
      new Promise<string[]>((done, fail) => {
        const open = indexedDB.open('yodo-data')
        open.onerror = () => fail(open.error)
        open.onsuccess = () => {
          const db = open.result
          const get = db
            .transaction('documents')
            .objectStore('documents')
            .get(id) as IDBRequest<{ fileIds: string[] } | undefined>
          get.onerror = () => fail(get.error)
          get.onsuccess = () => {
            db.close()
            done(get.result?.fileIds ?? [])
          }
        }
      }),
    id,
  )
}
