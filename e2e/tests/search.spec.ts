// Roadmap 3.3: search finds drawings by name and by text on the canvas, in
// each usage mode (ADR 0035, 0047). The self-hosted server is shared with the
// other specs, so every string here is unique to this run.

import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'
import { storedElements } from './storage.ts'

async function newTextDrawing(page: Page, text: string): Promise<string> {
  await page.getByRole('button', { name: 'New drawing' }).click()
  await page.waitForURL(/#\/d\/[^/]+$/)
  const id = decodeURIComponent(new URL(page.url()).hash.slice('#/d/'.length))
  await page.getByRole('button', { name: /^Text/ }).click()
  const box = await page.locator('canvas.canvas').boundingBox()
  if (!box) throw new Error('the editor canvas is not visible')
  await page.mouse.click(box.x + 200, box.y + 200)
  await page.getByRole('textbox', { name: 'Text' }).fill(text)
  await page.keyboard.press('Escape')
  return id
}

test('finds a drawing by its name and by text on its canvas', async ({
  page,
  mode,
}) => {
  const token = Math.random().toString(36).slice(2, 8)
  const word = `zebra${token}`
  const nameWord = `atlas${token}`

  await page.goto('./')
  const id = await newTextDrawing(page, `meeting about ${word} budget`)
  await expect.poll(() => storedElements(page, mode, id)).toBe(1)
  await expect(page.getByRole('status')).toHaveText('Saved')
  await page.getByRole('link', { name: 'Back to Home' }).click()

  // Give the drawing a name that is not in its text.
  const card = page.locator('li.drawing-card', {
    has: page.locator(`a[href="#/d/${id}"]`),
  })
  await card.getByRole('button', { name: /^More actions for/ }).click()
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  await page.getByRole('textbox', { name: 'Drawing name' }).fill(nameWord)
  await page.keyboard.press('Enter')
  await expect(card).toContainText(nameWord)

  const search = page.getByRole('searchbox', { name: 'Search drawings' })

  // By canvas text: only the text section, with the match marked.
  await search.fill(word.toUpperCase())
  const textRow = page.locator(`a.search-row[href="#/d/${id}"]`)
  await expect(textRow).toContainText(`meeting about ${word} budget`)
  await expect(textRow.locator('mark')).toHaveText(word)
  await expect(page.getByRole('heading', { name: 'In names' })).toHaveCount(0)
  await expect(page.locator('.new-drawing-tile')).toHaveCount(0)

  // By name: a card in "In names", and nothing in the text section.
  await search.fill(nameWord)
  await expect(page.getByRole('heading', { name: 'In names' })).toBeVisible()
  await expect(card).toBeVisible()
  await expect(textRow).toHaveCount(0)

  // Nothing matches.
  await search.fill(`nothing${token}`)
  await expect(page.getByRole('status')).toContainText('No drawings match')

  // Escape clears the box and brings the normal grid back.
  await search.press('Escape')
  await expect(search).toHaveValue('')
  await expect(page.locator('.new-drawing-tile')).toBeVisible()

  // A text result opens its drawing.
  await search.fill(word)
  await textRow.click()
  await page.waitForURL((url) => url.hash === `#/d/${id}`)
})

test('a restored drawing is found again by its canvas text', async ({
  page,
  mode,
}) => {
  const word = `quokka${Math.random().toString(36).slice(2, 8)}`

  await page.goto('./')
  const id = await newTextDrawing(page, `about the ${word}`)
  await expect.poll(() => storedElements(page, mode, id)).toBe(1)
  await expect(page.getByRole('status')).toHaveText('Saved')
  await page.getByRole('link', { name: 'Back to Home' }).click()

  const search = page.getByRole('searchbox', { name: 'Search drawings' })
  await search.fill(word)
  const textRow = page.locator(`a.search-row[href="#/d/${id}"]`)
  await expect(textRow).toBeVisible()

  // Trash it. A trashed drawing is not searched. (Its row has no menu, so go
  // through the card with an empty search first.)
  await search.fill('')
  const card = page.locator('li.drawing-card', {
    has: page.locator(`a[href="#/d/${id}"]`),
  })
  await card.getByRole('button', { name: /^More actions for/ }).click()
  await page.getByRole('menuitem', { name: 'Move to Trash' }).click()
  await search.fill(word)
  await expect(page.getByRole('status')).toContainText('No drawings match')

  // Restore it from Trash and search again in the same Home.
  await page.getByRole('link', { name: /^Trash/ }).click()
  await page
    .locator(`li.trash-row[data-drawing-id="${id}"]`)
    .getByRole('button', { name: /^Restore/ })
    .click()
  await page.getByRole('link', { name: /^All drawings/ }).click()
  await expect(search).toHaveValue(word)
  await expect(textRow).toBeVisible()
})
