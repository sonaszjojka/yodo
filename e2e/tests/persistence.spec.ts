// Roadmap 1.16: draw → reload → open from Home, in each usage mode (ADR 0035).

import { expectInk, inkPixels } from './canvas.ts'
import { expect, test } from './fixtures.ts'
import { storedElements } from './storage.ts'

test('a drawing survives a reload and opens again from Home', async ({
  page,
  mode,
}) => {
  const apiRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/api/drawings')) apiRequests.push(request.url())
  })

  await page.goto('./')
  await page.getByRole('button', { name: 'New drawing' }).click()
  await page.waitForURL(/#\/d\/[^/]+$/)
  const id = decodeURIComponent(new URL(page.url()).hash.slice('#/d/'.length))
  // A new drawing is empty, so any ink later comes from what we draw.
  await expect.poll(() => inkPixels(page)).toBe(0)

  await page.getByRole('button', { name: /^Rectangle/ }).click()
  const box = await page.locator('canvas.canvas').boundingBox()
  if (!box) throw new Error('the editor canvas is not visible')
  await page.mouse.move(box.x + 200, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(box.x + 400, box.y + 350, { steps: 5 })
  await page.mouse.up()
  await expectInk(page)

  // Auto-save is debounced (ADR 0032); wait for it to reach the store.
  await expect.poll(() => storedElements(page, mode, id)).toBe(1)
  await expect(page.getByRole('status')).toHaveText('Saved')

  await page.reload()
  await expectInk(page)

  await page.getByRole('link', { name: 'Back to Home' }).click()
  await page.locator(`a[href="#/d/${id}"]`).click()
  await page.waitForURL((url) => url.hash === `#/d/${id}`)
  await expectInk(page)

  if (mode === 'hosted') expect(apiRequests).toEqual([])
})
