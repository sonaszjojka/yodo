// Roadmap 2.7c: the exported PNG and SVG of a few reference scenes, each in
// light and dark, match their committed baselines (ADR 0044). Run it through
// `npm run test:visual`: the baselines belong to the pinned Docker image.

import type { Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { scenes } from './scenes.ts'

async function importScene(page: Page, document: Record<string, unknown>) {
  await page.goto('./')
  await page.getByTestId('import-file').setInputFiles({
    name: 'scene.yodo',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(document)),
  })
  await page.waitForURL(/#\/d\/[^/]+$/)
  await expect(page.locator('canvas.canvas')).toBeVisible()
}

async function download(page: Page) {
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download' }).click(),
  ])
  return readFile((await file.path())!)
}

/** Draws the SVG file as an image in a blank page and screenshots it. */
async function rasterise(page: Page, svg: Buffer) {
  const blank = await page.context().newPage()
  try {
    await blank.setContent('<body style="margin:0"><img id="svg"></body>')
    await blank.evaluate(async (text) => {
      const image = document.getElementById('svg') as HTMLImageElement
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`
      await image.decode()
    }, svg.toString('utf8'))
    return await blank.locator('#svg').screenshot()
  } finally {
    await blank.close()
  }
}

for (const { name, document } of scenes) {
  test(`export of the ${name} scene matches the baselines`, async ({
    page,
  }) => {
    await importScene(page, document)
    await page.getByRole('button', { name: 'Export image' }).click()
    const dialog = page.getByRole('dialog', { name: 'Export image' })
    await expect(dialog).toBeVisible()
    const dark = dialog.getByLabel('Dark version')

    // The PNG tab is the default.
    expect(await download(page)).toMatchSnapshot(`${name}-light-png.png`)
    await dark.check()
    expect(await download(page)).toMatchSnapshot(`${name}-dark-png.png`)

    await dialog.getByRole('tab', { name: 'SVG' }).click()
    expect(await rasterise(page, await download(page))).toMatchSnapshot(
      `${name}-dark-svg.png`,
    )
    await dark.uncheck()
    expect(await rasterise(page, await download(page))).toMatchSnapshot(
      `${name}-light-svg.png`,
    )
  })
}
