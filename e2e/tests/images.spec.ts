// Roadmap 2.6: paste an image, see it, reload, find it on Home, in each usage
// mode (ADR 0035, 0040).

import type { Page } from '@playwright/test'
import { editorCanvas } from './canvas.ts'
import { expect, test } from './fixtures.ts'
import { expectRedCentre, pasteRedImage } from './image.ts'
import { hasStoredImage } from './storage.ts'

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
  await expectRedCentre(editorCanvas(page))

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
  await expectRedCentre(editorCanvas(page))

  // Home's thumbnail draws the picture, not a placeholder.
  await page.getByRole('link', { name: 'Back to Home' }).click()
  // This drawing's card; other tests share the self-hosted server's list.
  const thumbnail = page
    .locator(`a[href="#/d/${id}"]`)
    .locator('.thumbnail-canvas')
  await expectRedCentre(thumbnail)
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
