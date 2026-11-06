// Roadmap 3.1: create, rename and delete folders with an icon and colour, put
// drawings in them, and keep it all across a reload, in each usage mode
// (ADR 0035, 0045).

import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

/** Creates a drawing from the current Home view and returns its id. */
async function newDrawing(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'New drawing' }).click()
  await page.waitForURL(/#\/d\/[^/]+$/)
  return decodeURIComponent(new URL(page.url()).hash.slice('#/d/'.length))
}

function card(page: Page, id: string): Locator {
  return page.locator('li.drawing-card', {
    has: page.locator(`a[href="#/d/${id}"]`),
  })
}

function folderLink(page: Page, name: string): Locator {
  return page.locator('.folder-row a', { hasText: name })
}

test('create, rename, fill and delete a folder', async ({ page, mode }) => {
  const folderRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/api/folders')) {
      folderRequests.push(request.url())
    }
  })
  const name = `Work ${crypto.randomUUID().slice(0, 8)}`
  const renamed = `${name} (renamed)`

  await page.goto('./')

  // Create, with an icon and a colour chosen in the picker.
  await page.getByRole('button', { name: 'New folder' }).click()
  const dialog = page.getByRole('dialog', { name: 'New folder' })
  await expect(
    dialog.getByRole('button', { name: 'Create folder' }),
  ).toBeDisabled()
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByRole('radio', { name: 'star' }).check()
  await dialog.getByRole('radio', { name: 'Brick' }).check()
  await dialog.getByRole('button', { name: 'Create folder' }).click()

  // The new folder opens: titled, current in the sidebar, empty.
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
  await expect(folderLink(page, name)).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('li.drawing-card')).toHaveCount(0)
  await expect(folderLink(page, name).locator('svg')).toHaveCSS(
    'color',
    /rgb\(194, 69, 61\)|rgb\(240, 138, 128\)/,
  )

  // A drawing made inside the folder belongs to it.
  const inside = await newDrawing(page)
  await page.getByRole('link', { name: 'Back to Home' }).click()
  await folderLink(page, name).click()
  await expect(card(page, inside)).toBeVisible()
  await expect(folderLink(page, name)).toContainText('1')

  // A loose drawing can be moved in from All drawings.
  await page.getByRole('link', { name: 'All drawings' }).first().click()
  await page.getByRole('button', { name: 'New drawing' }).click()
  await page.waitForURL(/#\/d\/[^/]+$/)
  const loose = decodeURIComponent(
    new URL(page.url()).hash.slice('#/d/'.length),
  )
  await page.getByRole('link', { name: 'Back to Home' }).click()
  await expect(card(page, loose)).toBeVisible()
  await expect(card(page, inside)).toContainText(name)
  await card(page, loose)
    .getByRole('button', { name: /^More actions for/ })
    .click()
  await page.getByRole('menuitem', { name: 'Move to folder…' }).click()
  await page.getByRole('menuitemradio', { name }).click()
  await expect(card(page, loose)).toContainText(name)
  await expect(folderLink(page, name)).toContainText('2')

  // Rename it and change its icon.
  await page
    .getByRole('button', { name: `More actions for folder ${name}` })
    .click()
  await page.getByRole('menuitem', { name: 'Edit folder' }).click()
  const edit = page.getByRole('dialog', { name: 'Edit folder' })
  await expect(edit.getByLabel('Name')).toHaveValue(name)
  await expect(edit.getByRole('radio', { name: 'star' })).toBeChecked()
  await edit.getByLabel('Name').fill(renamed)
  await edit.getByRole('radio', { name: 'rocket' }).check()
  await edit.getByRole('button', { name: 'Save' }).click()
  await expect(folderLink(page, renamed)).toBeVisible()

  // Everything survives a reload, and the folder route reopens the folder.
  await folderLink(page, renamed).click()
  await page.reload()
  await expect(
    page.getByRole('heading', { level: 1, name: renamed }),
  ).toBeVisible()
  await expect(card(page, inside)).toBeVisible()
  await expect(card(page, loose)).toBeVisible()

  // Delete asks first, says how many drawings go, and removes them.
  await page
    .getByRole('button', { name: `More actions for folder ${renamed}` })
    .click()
  await page.getByRole('menuitem', { name: 'Delete folder' }).click()
  const confirm = page.getByRole('dialog', { name: 'Delete folder' })
  await expect(confirm).toContainText('its 2 drawings')
  await confirm.getByRole('button', { name: 'Cancel' }).click()
  await expect(folderLink(page, renamed)).toBeVisible()

  await page
    .getByRole('button', { name: `More actions for folder ${renamed}` })
    .click()
  await page.getByRole('menuitem', { name: 'Delete folder' }).click()
  await page
    .getByRole('dialog', { name: 'Delete folder' })
    .getByRole('button', { name: 'Delete folder' })
    .click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'All drawings',
  )
  await expect(folderLink(page, renamed)).toHaveCount(0)
  await expect(card(page, inside)).toHaveCount(0)
  await expect(card(page, loose)).toHaveCount(0)

  await page.reload()
  await expect(folderLink(page, renamed)).toHaveCount(0)
  await expect(card(page, inside)).toHaveCount(0)

  // The mode's own storage was used (ADR 0031).
  if (mode === 'hosted') expect(folderRequests).toEqual([])
  else expect(folderRequests.length).toBeGreaterThan(0)
})

test('a folder route for a missing folder falls back to All drawings', async ({
  page,
}) => {
  await page.goto('./#/f/does-not-exist')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'All drawings',
  )
  await expect(page.getByRole('alert')).toHaveText(
    'That folder doesn’t exist any more.',
  )
})
