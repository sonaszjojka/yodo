// Roadmap 3.2: Delete moves a drawing to Trash; it can be restored, deleted
// forever, or Trash emptied after a confirmation, in each usage mode (ADR 0035,
// 0046). Every test that looks inside Trash lives here and runs one after the
// other, because "Empty trash" is global and the self-hosted server is shared.

import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'
import { storedElements } from './storage.ts'

test.describe.configure({ mode: 'serial' })

/** Creates a drawing from the current Home view and returns its id. */
async function newDrawing(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'New drawing' }).click()
  await page.waitForURL(/#\/d\/[^/]+$/)
  const id = decodeURIComponent(new URL(page.url()).hash.slice('#/d/'.length))
  await page.getByRole('link', { name: 'Back to Home' }).click()
  return id
}

function card(page: Page, id: string): Locator {
  return page.locator('li.drawing-card', {
    has: page.locator(`a[href="#/d/${id}"]`),
  })
}

function row(page: Page, id: string): Locator {
  return page.locator(`li.trash-row[data-drawing-id="${id}"]`)
}

async function moveToTrash(page: Page, id: string) {
  await card(page, id)
    .getByRole('button', { name: /^More actions for/ })
    .click()
  await page.getByRole('menuitem', { name: 'Move to Trash' }).click()
  await expect(card(page, id)).toHaveCount(0)
}

test('trash, restore and delete a drawing forever', async ({ page, mode }) => {
  await page.goto('./')
  const id = await newDrawing(page)

  // Move to Trash needs no confirmation: the drawing leaves the grid.
  await moveToTrash(page, id)

  // It is in Trash, and stays there across a reload.
  await page.getByRole('link', { name: /^Trash/ }).click()
  await expect(page).toHaveURL(/#\/trash$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Trash')
  await expect(row(page, id)).toContainText('Deleted just now')
  await page.reload()
  await expect(row(page, id)).toBeVisible()
  // The document is still stored, so a restore brings it back whole.
  expect(await storedElements(page, mode, id)).toBe(0)

  // Restore puts it back among the cards.
  await row(page, id)
    .getByRole('button', { name: /^Restore/ })
    .click()
  await expect(row(page, id)).toHaveCount(0)
  await page.getByRole('link', { name: /^All drawings/ }).click()
  await expect(card(page, id)).toBeVisible()

  // Delete forever asks first; Cancel keeps it.
  await moveToTrash(page, id)
  await page.getByRole('link', { name: /^Trash/ }).click()
  await row(page, id)
    .getByRole('button', { name: /forever$/ })
    .click()
  const confirm = page.getByRole('dialog', { name: 'Delete forever' })
  await confirm.getByRole('button', { name: 'Cancel' }).click()
  await expect(row(page, id)).toBeVisible()

  await row(page, id)
    .getByRole('button', { name: /forever$/ })
    .click()
  await page
    .getByRole('dialog', { name: 'Delete forever' })
    .getByRole('button', { name: 'Delete forever' })
    .click()
  await expect(row(page, id)).toHaveCount(0)
  await page.reload()
  await expect(row(page, id)).toHaveCount(0)
  // Gone from the mode's own storage (ADR 0031).
  expect(await storedElements(page, mode, id)).toBeUndefined()
})

test('empty Trash asks first, then removes every drawing in it', async ({
  page,
}) => {
  await page.goto('./')
  const a = await newDrawing(page)
  const b = await newDrawing(page)
  const kept = await newDrawing(page)
  await moveToTrash(page, a)
  await moveToTrash(page, b)

  await page.getByRole('link', { name: /^Trash/ }).click()
  await expect(row(page, a)).toBeVisible()
  await expect(row(page, b)).toBeVisible()
  await page.getByRole('button', { name: 'Empty trash' }).click()
  const confirm = page.getByRole('dialog', { name: 'Empty trash' })
  await expect(confirm).toContainText('forever')
  await confirm.getByRole('button', { name: 'Cancel' }).click()
  await expect(row(page, a)).toBeVisible()

  await page.getByRole('button', { name: 'Empty trash' }).click()
  await page
    .getByRole('dialog', { name: 'Empty trash' })
    .getByRole('button', { name: 'Empty trash' })
    .click()
  await expect(page.locator('li.trash-row')).toHaveCount(0)
  await expect(page.getByText('Trash is empty')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Empty trash' })).toBeDisabled()

  // A live drawing is not touched.
  await page.getByRole('link', { name: /^All drawings/ }).click()
  await expect(card(page, kept)).toBeVisible()
})

test('deleting a folder moves its drawings to Trash, where they restore outside it', async ({
  page,
}) => {
  const name = `Work ${crypto.randomUUID().slice(0, 8)}`
  await page.goto('./')
  await page.getByRole('button', { name: 'New folder' }).click()
  await page
    .getByRole('dialog', { name: 'New folder' })
    .getByLabel('Name')
    .fill(name)
  await page
    .getByRole('dialog', { name: 'New folder' })
    .getByRole('button', { name: 'Create folder' })
    .click()
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
  await page.getByRole('button', { name: 'New drawing' }).click()
  await page.waitForURL(/#\/d\/[^/]+$/)
  const id = decodeURIComponent(new URL(page.url()).hash.slice('#/d/'.length))
  await page.getByRole('link', { name: 'Back to Home' }).click()

  await page
    .getByRole('button', { name: `More actions for folder ${name}` })
    .click()
  await page.getByRole('menuitem', { name: 'Delete folder' }).click()
  const confirm = page.getByRole('dialog', { name: 'Delete folder' })
  await expect(confirm).toContainText('Its 1 drawing will move to Trash')
  await confirm.getByRole('button', { name: 'Delete folder' }).click()

  await page.getByRole('link', { name: /^Trash/ }).click()
  await expect(row(page, id)).toBeVisible()
  await row(page, id)
    .getByRole('button', { name: /^Restore/ })
    .click()
  await page.getByRole('link', { name: /^All drawings/ }).click()
  // Back among the cards, and no longer in the (deleted) folder.
  await expect(card(page, id)).toBeVisible()
  await expect(card(page, id)).not.toContainText(name)
})

test('the Trash route opens directly and Back returns to it', async ({
  page,
}) => {
  await page.goto('./#/trash')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Trash')
  await expect(page.getByRole('link', { name: /^Trash/ })).toHaveAttribute(
    'aria-current',
    'page',
  )

  await page.getByRole('link', { name: /^All drawings/ }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'All drawings',
  )
  await page.goBack()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Trash')
  await page.goForward()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'All drawings',
  )
})
