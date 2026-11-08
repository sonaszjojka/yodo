// Roadmap 2.10: the searchable shortcuts list, from the editor and from Home,
// in each usage mode (ADR 0035).

import { editorCanvas, expectInk, inkPixels } from './canvas.ts'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

async function openEditor(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'New drawing' }).click()
  await page.waitForURL(/#\/d\/[^/]+$/)
  await expect(editorCanvas(page)).toBeVisible()
}

/** The ink count once two reads 100 ms apart agree (the canvas has redrawn). */
async function settledInk(page: Page) {
  let last = -1
  await expect
    .poll(async () => {
      const now = await inkPixels(page)
      const same = now === last
      last = now
      return same
    })
    .toBe(true)
  return last
}

async function dragRectangle(page: Page) {
  await page.getByRole('button', { name: /^Rectangle/ }).click()
  const box = await editorCanvas(page).boundingBox()
  if (!box) throw new Error('the editor canvas is not visible')
  await page.mouse.move(box.x + 200, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(box.x + 400, box.y + 350, { steps: 5 })
  await page.mouse.up()
}

test('? opens a searchable list; Esc closes it and the search resets', async ({
  page,
}) => {
  await openEditor(page)
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' })

  await page.keyboard.press('?')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Tools' })).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Editing' })).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'View' })).toBeVisible()

  const search = dialog.getByRole('searchbox', { name: 'Search shortcuts' })
  await expect(search).toBeFocused()
  await search.fill('rect')
  await expect(dialog.getByRole('listitem')).toHaveCount(1)
  await search.fill('nothing like this')
  await expect(dialog.getByText('No shortcut matches')).toBeVisible()

  // Chromium's search box uses the first Esc to clear its text, so clear it.
  await search.fill('')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  // Closing with text still in the box: the next open starts empty.
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click()
  await search.fill('undo')
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click()
  await expect(search).toHaveValue('')
})

test('keys pressed in the dialog do not reach the drawing', async ({
  page,
}) => {
  await openEditor(page)
  await dragRectangle(page)
  await expectInk(page)
  await page.keyboard.press('ControlOrMeta+a')
  const before = await settledInk(page)
  await page.keyboard.press('?')
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(dialog).toBeVisible()

  // Move focus off the search box, onto Close, then try to edit the drawing.
  await dialog.getByRole('button', { name: 'Close' }).focus()
  await page.keyboard.press('e')
  await page.keyboard.press('Delete')
  await page.keyboard.press('ControlOrMeta+x')
  await page.keyboard.press('ControlOrMeta+v')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  // `e` would have picked the eraser; the drawing behind is untouched too.
  await expect(page.getByRole('button', { name: /^Eraser/ })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  expect(await settledInk(page)).toBe(before)
})

test('a Space held while the list opens does not leave the canvas panning', async ({
  page,
}) => {
  await openEditor(page)
  await page.getByRole('button', { name: /^Rectangle/ }).click()

  await page.keyboard.down(' ')
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click()
  await page.keyboard.up(' ')
  await page.keyboard.press('Escape')

  const box = await editorCanvas(page).boundingBox()
  if (!box) throw new Error('the editor canvas is not visible')
  await page.mouse.move(box.x + 200, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(box.x + 400, box.y + 350, { steps: 5 })
  await page.mouse.up()
  // Panning would draw nothing; the rectangle tool leaves ink.
  await expectInk(page)
})

test('Home: the sidebar Keyboard shortcuts button opens the list', async ({
  page,
}) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click()
  await expect(
    page.getByRole('dialog', { name: 'Keyboard shortcuts' }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('Ctrl+scroll over the dialog does not zoom the drawing behind it', async ({
  page,
  browserName,
}) => {
  // Playwright applies held modifiers to the wheel only in Chromium.
  test.skip(browserName !== 'chromium', 'wheel modifiers need Chromium')
  await openEditor(page)
  await page.keyboard.press('?')
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(dialog).toBeVisible()
  const zoom = page.locator('.zoom-value')
  await expect(zoom).toHaveText('100%')

  const box = await dialog.boundingBox()
  if (!box) throw new Error('the dialog is not visible')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -400)
  await page.keyboard.up('Control')

  // Zoom is applied in the next frame; give it time before checking.
  await page.waitForTimeout(300)
  await expect(zoom).toHaveText('100%')
})
