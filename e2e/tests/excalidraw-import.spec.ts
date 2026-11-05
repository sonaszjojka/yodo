// Roadmap 2.9: import an Excalidraw file, read what was left out, open the
// drawing and see its content, in each usage mode (ADR 0014, 0035).

import { editorCanvas, expectInk } from './canvas.ts'
import { expect, test } from './fixtures.ts'

const shape = {
  angle: 0,
  strokeColor: '#e03131',
  backgroundColor: '#ffc9c9',
  fillStyle: 'solid',
  strokeWidth: 2,
  strokeStyle: 'solid',
  roughness: 0,
  opacity: 100,
  seed: 7,
  isDeleted: false,
}

const file = JSON.stringify({
  type: 'excalidraw',
  version: 2,
  elements: [
    {
      ...shape,
      id: 'r',
      type: 'rectangle',
      x: -3000,
      y: -2000,
      width: 300,
      height: 200,
    },
    { ...shape, id: 'f', type: 'frame', x: 0, y: 0, width: 100, height: 100 },
  ],
  appState: {},
  files: {},
})

test('importing an Excalidraw file shows what was skipped and opens the drawing', async ({
  page,
}) => {
  await page.goto('./')
  await page.getByTestId('import-excalidraw').setInputFiles({
    name: 'sample.excalidraw',
    mimeType: 'application/json',
    buffer: Buffer.from(file),
  })

  const summary = page.getByRole('region', { name: 'Import summary' })
  await expect(summary).toContainText('Imported 1 element')
  await expect(summary).toContainText('Skipped frames (1)')

  // Dismissing the summary leaves the new drawing as a card on Home.
  const href = await summary
    .getByRole('link', { name: 'Open drawing' })
    .getAttribute('href')
  await summary.getByRole('button', { name: 'Dismiss' }).click()
  await expect(page.locator(`a[href="${href}"]`)).toBeVisible()
  await page.locator(`a[href="${href}"]`).click()
  await page.waitForURL(/#\/d\/[^/]+$/)
  // The rectangle is far from the origin; the view opens on it.
  await expectInk(page)
  await expect(editorCanvas(page)).toBeVisible()

  await page.reload()
  await expectInk(page)
})

test('a file that is not Excalidraw is refused with a message', async ({
  page,
}) => {
  await page.goto('./')
  await page.getByTestId('import-excalidraw').setInputFiles({
    name: 'other.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello":"world"}'),
  })

  await expect(page.getByRole('alert')).toContainText('not an Excalidraw file')
})
