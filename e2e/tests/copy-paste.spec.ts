// Roadmap 2.5: copy in one drawing, paste in another, in each usage mode
// (ADR 0035, 0039).

import { expectInk, inkPixels } from './canvas.ts'
import { expect, test } from './fixtures.ts'
import { storedElements } from './storage.ts'

test('elements copied in one drawing paste into another and are saved', async ({
  page,
  mode,
}) => {
  await page.goto('./')

  // Drawing one: a rectangle, selected with Select all, copied.
  await page.getByRole('button', { name: 'New drawing' }).click()
  await page.waitForURL(/#\/d\/[^/]+$/)
  await page.getByRole('button', { name: /^Rectangle/ }).click()
  const box = await page.locator('canvas.canvas').boundingBox()
  if (!box) throw new Error('the editor canvas is not visible')
  await page.mouse.move(box.x + 200, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(box.x + 400, box.y + 350, { steps: 5 })
  await page.mouse.up()
  await expectInk(page)
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('ControlOrMeta+c')
  await expect(page.getByRole('status')).toHaveText('Saved')

  // Drawing two starts empty; pasting brings the rectangle over.
  await page.getByRole('link', { name: 'Back to Home' }).click()
  await page.getByRole('button', { name: 'New drawing' }).click()
  await page.waitForURL(/#\/d\/[^/]+$/)
  const id = decodeURIComponent(new URL(page.url()).hash.slice('#/d/'.length))
  await expect.poll(() => inkPixels(page)).toBe(0)
  await page.keyboard.press('ControlOrMeta+v')
  await expectInk(page)

  // Auto-save is debounced (ADR 0032); the mode's own store must have it.
  await expect.poll(() => storedElements(page, mode, id)).toBe(1)
  await expect(page.getByRole('status')).toHaveText('Saved')
  await page.reload()
  await expectInk(page)
})
