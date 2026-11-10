// Roadmap 5.1: two tabs on one drawing never overwrite each other silently
// (ADR 0062). Both pages share one browser context, so they share IndexedDB
// in hosted mode and the server in self-hosted mode.

import type { Page } from '@playwright/test'
import { expectInk, inkPixels } from './canvas.ts'
import { expect, test } from './fixtures.ts'
import { storedDocument } from './storage.ts'

async function newDrawing(page: Page): Promise<string> {
  await page.goto('./')
  await page.getByRole('button', { name: 'New drawing' }).click()
  await page.waitForURL(/#\/d\/[^/]+$/)
  return decodeURIComponent(new URL(page.url()).hash.slice('#/d/'.length))
}

async function open(page: Page, id: string) {
  await page.goto(`./#/d/${encodeURIComponent(id)}`)
  await expect(page.locator('canvas.canvas')).toBeVisible()
}

/** Draws a shape with the tool and waits until it is saved. */
async function draw(page: Page, tool: RegExp, at: number) {
  await page.getByRole('button', { name: tool }).click()
  const box = await page.locator('canvas.canvas').boundingBox()
  if (!box) throw new Error('the editor canvas is not visible')
  await page.mouse.move(box.x + at, box.y + at)
  await page.mouse.down()
  await page.mouse.move(box.x + at + 150, box.y + at + 100, { steps: 5 })
  await page.mouse.up()
  await expectInk(page)
}

test('a tab shows changes saved in another tab when it gets focus', async ({
  page,
  context,
  mode,
}) => {
  const id = await newDrawing(page)
  const other = await context.newPage()
  await open(other, id)
  await expect.poll(() => inkPixels(other)).toBe(0)

  await draw(page, /^Rectangle/, 200)
  await expect
    .poll(async () => (await storedDocument(page, mode, id))?.length)
    .toBe(1)

  await other.evaluate(() => window.dispatchEvent(new Event('focus')))

  await expect(other.locator('.notice')).toHaveText(
    'Updated with changes made elsewhere.',
  )
  await expectInk(other)
  expect((await storedDocument(page, mode, id))?.length).toBe(1)
})

test('a save that finds a newer version keeps the local one as a copy', async ({
  page,
  context,
  mode,
}) => {
  const id = await newDrawing(page)
  const other = await context.newPage()
  await open(other, id)

  // This tab saves first …
  await draw(page, /^Rectangle/, 200)
  await expect
    .poll(async () =>
      (await storedDocument(page, mode, id))?.map((e) => e.type),
    )
    .toEqual(['rectangle'])

  // … so the other tab's save, still at the old revision, conflicts.
  await draw(other, /^Ellipse/, 100)
  const notice = other.locator('.notice')
  await expect(notice).toContainText(
    'This drawing was changed elsewhere. Your version was saved as a copy.',
  )

  // Their version stays, and the editor now shows it.
  expect((await storedDocument(page, mode, id))?.map((e) => e.type)).toEqual([
    'rectangle',
  ])
  await expect(other).toHaveURL((url) => url.hash === `#/d/${id}`)

  // The local version is in the copy.
  await notice.getByRole('link', { name: 'Open copy' }).click()
  await other.waitForURL((url) => url.hash !== `#/d/${id}`)
  const copyId = decodeURIComponent(
    new URL(other.url()).hash.slice('#/d/'.length),
  )
  expect(
    (await storedDocument(other, mode, copyId))?.map((e) => e.type),
  ).toEqual(['ellipse'])

  await other.getByRole('link', { name: 'Back to Home' }).click()
  await expect(other.locator(`a[href="#/d/${id}"]`)).toBeVisible()
  await expect(other.locator(`a[href="#/d/${copyId}"]`)).toContainText(
    '(conflicted copy)',
  )
})
