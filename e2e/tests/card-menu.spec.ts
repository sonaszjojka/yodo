// Roadmap 3.5: a drawing card's ⋯ button and right-click open the same menu
// with every action from docs/ui.md, in each usage mode (ADR 0035).

import { readFile } from 'node:fs/promises'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

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

/** Renames the drawing, so the test can tell it and its copy apart. */
async function rename(page: Page, id: string, name: string) {
  await card(page, id)
    .getByRole('button', { name: /^More actions for/ })
    .click()
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  // The card has no link while it is renamed, so look the input up on the page.
  await page.getByLabel('Drawing name').fill(name)
  await page.keyboard.press('Enter')
  await expect(card(page, id)).toContainText(name)
}

const ITEMS = [
  'Open',
  'Open in new tab',
  'Rename',
  'Duplicate',
  'Move to folder…',
  'Export as .yodo',
  'Move to Trash',
]

test('the ⋯ button and a right-click open the same full menu', async ({
  page,
}) => {
  await page.goto('./')
  const id = await newDrawing(page)

  await card(page, id)
    .getByRole('button', { name: /^More actions for/ })
    .click()
  await expect(page.getByRole('menuitem')).toHaveText(ITEMS)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)

  await card(page, id).click({ button: 'right' })
  await expect(page.getByRole('menuitem')).toHaveText(ITEMS)
})

test('Open in new tab opens the drawing in another tab', async ({
  page,
  context,
}) => {
  await page.goto('./')
  const id = await newDrawing(page)

  await card(page, id)
    .getByRole('button', { name: /^More actions for/ })
    .click()
  const [tab] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('menuitem', { name: 'Open in new tab' }).click(),
  ])

  await expect(tab).toHaveURL(new RegExp(`#/d/${id}$`))
  await expect(tab.locator('canvas.canvas')).toBeVisible()
  // This tab stays on Home with the menu closed.
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(card(page, id)).toBeVisible()
})

test('Duplicate saves a copy next to the drawing, in its folder', async ({
  page,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8)
  const folder = `Copies ${suffix}`
  const name = `Plan ${suffix}`
  await page.goto('./')

  // A loose drawing is copied loose.
  const loose = await newDrawing(page)
  await rename(page, loose, name)
  await card(page, loose)
    .getByRole('button', { name: /^More actions for/ })
    .click()
  await page.getByRole('menuitem', { name: 'Duplicate' }).click()
  const looseCopy = page.locator('li.drawing-card', {
    hasText: `${name} copy`,
  })
  await expect(looseCopy).toHaveCount(1)
  await expect(card(page, loose)).toContainText(name)

  // A drawing in a folder is copied into the same folder, and the copy stays
  // after a reload.
  await page.getByRole('button', { name: 'New folder' }).click()
  const dialog = page.getByRole('dialog', { name: 'New folder' })
  await dialog.getByLabel('Name').fill(folder)
  await dialog.getByRole('button', { name: 'Create folder' }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: folder }),
  ).toBeVisible()
  const inside = await newDrawing(page)
  await page.locator('.folder-row a', { hasText: folder }).click()
  await rename(page, inside, `In ${name}`)
  await card(page, inside)
    .getByRole('button', { name: /^More actions for/ })
    .click()
  await page.getByRole('menuitem', { name: 'Duplicate' }).click()
  await expect(
    page.locator('li.drawing-card', { hasText: `In ${name} copy` }),
  ).toHaveCount(1)
  await expect(
    page.locator('.folder-row a', { hasText: folder }),
  ).toContainText('2')

  await page.reload()
  await expect(
    page.locator('li.drawing-card', { hasText: `In ${name} copy` }),
  ).toHaveCount(1)
})

test('Export as .yodo downloads the drawing without opening it', async ({
  page,
}) => {
  // No spaces: WebKit turns them into underscores in the suggested file name.
  const name = `Export-${crypto.randomUUID().slice(0, 8)}`
  await page.goto('./')
  const id = await newDrawing(page)
  await rename(page, id, name)

  await card(page, id)
    .getByRole('button', { name: /^More actions for/ })
    .click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'Export as .yodo' }).click(),
  ])

  expect(download.suggestedFilename()).toBe(`${name}.yodo`)
  const file = test.info().outputPath('export.yodo')
  await download.saveAs(file)
  const text = await readFile(file, 'utf8')
  expect(JSON.parse(text)).toMatchObject({ name })
  await expect(page).toHaveURL(/#\/?$|\/$/)
})

test('the menu stays on screen for a card near the top', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 500 })
  await page.goto('./')
  await newDrawing(page)

  const first = page.locator('li.drawing-card').first()
  await first.getByRole('button', { name: /^More actions for/ }).click()
  const box = await page.getByRole('menu').boundingBox()
  expect(box).not.toBeNull()
  expect(box!.y).toBeGreaterThanOrEqual(0)
  await expect(
    page.getByRole('menuitem', { name: 'Open', exact: true }),
  ).toBeInViewport()
})
