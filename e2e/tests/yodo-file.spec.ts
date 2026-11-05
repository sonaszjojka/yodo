// Roadmap 2.8: export a drawing to a `.yodo` file and import it again, in each
// usage mode (ADR 0013, 0035).

import { editorCanvas, expectInk } from './canvas.ts'
import { expect, test } from './fixtures.ts'
import { expectRedCentre, pasteRedImage } from './image.ts'
import { storedElements } from './storage.ts'

test('a drawing exported to a .yodo file imports as a new, identical drawing', async ({
  page,
  mode,
}) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'New drawing' }).click()
  await page.waitForURL(/#\/d\/[^/]+$/)
  const id = decodeURIComponent(new URL(page.url()).hash.slice('#/d/'.length))

  await page.getByRole('button', { name: /^Rectangle/ }).click()
  const box = await page.locator('canvas.canvas').boundingBox()
  if (!box) throw new Error('the editor canvas is not visible')
  await page.mouse.move(box.x + 200, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(box.x + 400, box.y + 350, { steps: 5 })
  await page.mouse.up()
  await expectInk(page)

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('Untitled.yodo')
  const file = test.info().outputPath('Untitled.yodo')
  await download.saveAs(file)

  await expect.poll(() => storedElements(page, mode, id)).toBe(1)
  await page.getByRole('link', { name: 'Back to Home' }).click()
  await page.getByLabel('Yodo file to import').setInputFiles(file)

  // The import opens the new drawing, which has the rectangle and its own id.
  await page.waitForURL(
    (url) => /^#\/d\/[^/]+$/.test(url.hash) && url.hash !== `#/d/${id}`,
  )
  await expectInk(page)
  const imported = decodeURIComponent(
    new URL(page.url()).hash.slice('#/d/'.length),
  )
  await expect.poll(() => storedElements(page, mode, imported)).toBe(1)
})

test('a drawing with a pasted image keeps the picture through export and import', async ({
  page,
}) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'New drawing' }).click()
  await page.waitForURL(/#\/d\/[^/]+$/)
  await expect(editorCanvas(page)).toBeVisible()
  const id = decodeURIComponent(new URL(page.url()).hash.slice('#/d/'.length))
  await pasteRedImage(page)
  await expectRedCentre(editorCanvas(page))
  // Auto-save has stored the drawing's image list before we export it.
  await expect(page.getByRole('status')).toHaveText('Saved')

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export' }).click(),
  ])
  const file = test.info().outputPath('with-image.yodo')
  await download.saveAs(file)

  await page.getByRole('link', { name: 'Back to Home' }).click()
  await page.getByLabel('Yodo file to import').setInputFiles(file)

  await page.waitForURL(
    (url) => /^#\/d\/[^/]+$/.test(url.hash) && url.hash !== `#/d/${id}`,
  )
  await expectRedCentre(editorCanvas(page))
})

test('importing something that is not a Yodo file shows a message', async ({
  page,
}) => {
  await page.goto('./')
  await page.getByLabel('Yodo file to import').setInputFiles({
    name: 'notes.yodo',
    mimeType: 'application/json',
    buffer: Buffer.from('not json'),
  })

  await expect(page.getByRole('alert')).toHaveText(
    'That file isn’t a Yodo file.',
  )
  await expect(page).toHaveURL(/#\/$|\/$/)
})
