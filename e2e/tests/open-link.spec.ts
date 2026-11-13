// Roadmap 5.8: an `#/open/<data>` link (the `.yodo` text, raw deflate +
// base64url, ADR 0069) confirms, then imports a new drawing, in each usage
// mode. The data is built with Node's zlib, as any encoder could.

import { deflateRawSync } from 'node:zlib'
import type { Page } from '@playwright/test'
import { expectInk } from './canvas.ts'
import { expect, test } from './fixtures.ts'
import { storedElements } from './storage.ts'

/** A one-rectangle `.yodo` file, named so this test finds only its own cards. */
function yodoFile(name: string): string {
  return JSON.stringify({
    type: 'yodo',
    schemaVersion: 1,
    id: 'open-link-source',
    name,
    appState: { viewport: { x: 0, y: 0, zoom: 1 } },
    fileIds: [],
    files: {},
    elements: [
      {
        type: 'rectangle',
        id: 'box',
        x: 100,
        y: 100,
        width: 200,
        height: 120,
        angle: 0,
        seed: 7,
        strokeColor: '#1E1F22',
        backgroundColor: 'transparent',
        fillStyle: 'hachure',
        strokeWidth: 2,
        strokeStyle: 'solid',
        roughness: 1,
        opacity: 100,
      },
    ],
  })
}

function linkData(text: string): string {
  return deflateRawSync(Buffer.from(text, 'utf8')).toString('base64url')
}

function cards(page: Page, name: string) {
  return page.locator('li.drawing-card', { hasText: name })
}

test('an open link asks, then imports the drawing once', async ({
  page,
  mode,
}) => {
  const name = `From an agent ${test.info().testId}`
  await page.goto(`./#/open/${linkData(yodoFile(name))}`)

  await expect(
    page.getByRole('heading', { name: 'Open this drawing?' }),
  ).toBeVisible()
  await expect(page.getByText(name)).toBeVisible()
  await expect(page.getByText('1 element', { exact: false })).toBeVisible()

  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await page.waitForURL(/#\/d\/[^/]+$/)
  await expectInk(page)
  const id = decodeURIComponent(new URL(page.url()).hash.slice('#/d/'.length))
  expect(id).not.toBe('open-link-source')
  await expect.poll(() => storedElements(page, mode, id)).toBe(1)

  // The link's history entry was replaced, so Back doesn't return to it.
  await page.getByRole('link', { name: 'Back to Home' }).click()
  await expect(cards(page, name)).toHaveCount(1)
  await page.goBack() // to the editor
  await page.waitForURL(/#\/d\/[^/]+$/)
  await page.goBack() // past the link, to the blank page before it
  expect(page.url()).not.toContain('#/open/')
  await page.goto('./')
  await expect(cards(page, name)).toHaveCount(1)
})

test('Cancel imports nothing', async ({ page }) => {
  const name = `Cancelled ${test.info().testId}`
  await page.goto(`./#/open/${linkData(yodoFile(name))}`)
  await page.getByRole('button', { name: 'Cancel' }).click()
  await page.waitForURL(/#\/$/)
  await expect(page.getByRole('button', { name: 'New drawing' })).toBeVisible()
  await expect(cards(page, name)).toHaveCount(0)
})

test('a damaged link shows an error and imports nothing', async ({ page }) => {
  const name = `Damaged ${test.info().testId}`
  const data = linkData(yodoFile(name))
  await page.goto(`./#/open/${data.slice(0, data.length >> 1)}`)

  await expect(page.getByRole('alert')).toContainText(
    'This link is damaged or incomplete.',
  )
  await page.getByRole('link', { name: 'Back to Home' }).click()
  await expect(page.getByRole('button', { name: 'New drawing' })).toBeVisible()
  await expect(cards(page, name)).toHaveCount(0)
})
