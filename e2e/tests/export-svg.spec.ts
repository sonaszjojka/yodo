// Roadmap 2.7b: the export dialog's SVG tab saves the drawing or the selection
// as an SVG file with the same options as PNG, minus the scale (ADR 0043).

import type { Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { editorCanvas, expectInk } from './canvas.ts'
import { expect, test } from './fixtures.ts'

async function dragRectangle(
  page: Page,
  from: [number, number],
  to: [number, number],
) {
  await page.getByRole('button', { name: /^Rectangle/ }).click()
  const box = await editorCanvas(page).boundingBox()
  if (!box) throw new Error('the editor canvas is not visible')
  await page.mouse.move(box.x + from[0], box.y + from[1])
  await page.mouse.down()
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 5 })
  await page.mouse.up()
}

async function newDrawing(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'New drawing' }).click()
  await page.waitForURL(/#\/d\/[^/]+$/)
}

async function openSvgTab(page: Page) {
  await page.getByRole('button', { name: 'Export image' }).click()
  const dialog = page.getByRole('dialog', { name: 'Export image' })
  await dialog.getByRole('tab', { name: 'SVG' }).click()
  return dialog
}

async function download(page: Page) {
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download' }).click(),
  ])
  return { name: file.suggestedFilename(), path: (await file.path())! }
}

/**
 * Parses the file in the page (so a malformed SVG fails), and draws it as an
 * <img> to count its ink and read the pixel in the middle.
 */
async function inspectSvg(page: Page, path: string) {
  const source = await readFile(path, 'utf8')
  return page.evaluate(async (svgText) => {
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
    const root = doc.documentElement
    const parseError = doc.querySelector('parsererror')?.textContent ?? null
    const image = new Image()
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(image.width)
    canvas.height = Math.ceil(image.height)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(image, 0, 0)
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    let ink = 0
    for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) ink++
    const rects = [...doc.querySelectorAll('svg > rect')]
    return {
      parseError,
      tag: root.tagName,
      viewBox: root.getAttribute('viewBox'),
      width: Number(root.getAttribute('width')),
      height: Number(root.getAttribute('height')),
      paths: doc.querySelectorAll('path').length,
      pageFill: rects[0]?.getAttribute('fill') ?? null,
      fontFaces:
        doc.querySelector('style')?.textContent?.match(/@font-face/g)?.length ??
        0,
      hasLatinExt: !!doc
        .querySelector('style')
        ?.textContent?.includes('U+0100-02BA'),
      texts: [...doc.querySelectorAll('text')].map((t) => t.textContent),
      imageHrefs: [...doc.querySelectorAll('image')].map(
        (i) => i.getAttribute('href') ?? '',
      ),
      ink,
      centre: [
        ...ctx.getImageData(
          Math.floor(canvas.width / 2),
          Math.floor(canvas.height / 2),
          1,
          1,
        ).data,
      ],
    }
  }, source)
}

test('exports the drawing as an SVG: tab, size, background, dark version', async ({
  page,
}) => {
  await newDrawing(page)
  await dragRectangle(page, [200, 200], [420, 360])
  await expectInk(page)

  const dialog = await openSvgTab(page)
  // Same options as PNG, except the scale.
  await expect(dialog.getByRole('tab', { name: 'SVG' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(dialog.getByLabel('Whole drawing')).toBeVisible()
  await expect(dialog.getByLabel('Background')).toBeVisible()
  await expect(dialog.getByLabel('Dark version')).toBeVisible()
  await expect(dialog.getByLabel('2x')).toHaveCount(0)
  await expect(dialog.getByAltText('Preview of the exported SVG')).toBeVisible()

  await dialog.getByLabel('File name').fill('my-sketch')
  const light = await download(page)
  expect(light.name).toBe('my-sketch.svg')
  const lightSvg = await inspectSvg(page, light.path)
  expect(lightSvg.parseError).toBeNull()
  expect(lightSvg.tag).toBe('svg')
  // (220 + 2 * 16) x (160 + 2 * 16), at 1 unit per pixel.
  expect(Math.abs(lightSvg.width - 252)).toBeLessThanOrEqual(2)
  expect(Math.abs(lightSvg.height - 192)).toBeLessThanOrEqual(2)
  expect(lightSvg.paths).toBeGreaterThan(0)
  expect(lightSvg.pageFill).toBe('#f7f9f9')
  expect(lightSvg.ink).toBeGreaterThan(1000)

  // Without the background there is no page rectangle.
  await dialog.getByLabel('Background').uncheck()
  const clear = await inspectSvg(page, (await download(page)).path)
  expect(clear.pageFill).toBeNull()

  // The dark version paints the dark page colour.
  await dialog.getByLabel('Background').check()
  await dialog.getByLabel('Dark version').check()
  const dark = await inspectSvg(page, (await download(page)).path)
  expect(dark.pageFill).toBe('#141517')

  // Back on PNG the scale options and the picture are there again.
  await dialog.getByRole('tab', { name: 'PNG' }).click()
  await expect(dialog.getByLabel('2x')).toBeVisible()
  await expect(dialog.getByLabel('Preview of the exported image')).toBeVisible()
})

test('exports text with its font embedded, including Polish letters', async ({
  page,
}) => {
  await newDrawing(page)
  await page.getByRole('button', { name: /^Text/ }).click()
  const box = (await editorCanvas(page).boundingBox())!
  await page.mouse.click(box.x + 300, box.y + 250)
  await page.keyboard.type('Zażółć gęślą jaźń')
  await page.keyboard.press('Escape')
  await expectInk(page)

  const dialog = await openSvgTab(page)
  const svg = await inspectSvg(page, (await download(page)).path)
  expect(svg.texts).toEqual(['Zażółć gęślą jaźń'])
  expect(svg.fontFaces).toBe(2)
  expect(svg.hasLatinExt).toBe(true)
  await expect(dialog.getByRole('status')).not.toContainText('could not')
})

test('an exported SVG contains its pasted images as data URIs', async ({
  page,
}) => {
  await newDrawing(page)
  await expect(editorCanvas(page)).toBeVisible()
  await page.evaluate(async () => {
    const source = document.createElement('canvas')
    source.width = 240
    source.height = 120
    const ctx = source.getContext('2d')!
    ctx.fillStyle = '#ff0000'
    ctx.fillRect(0, 0, 240, 120)
    const blob = await new Promise<Blob>((done) =>
      source.toBlob((b) => done(b!), 'image/png'),
    )
    const data = new DataTransfer()
    data.items.add(new File([blob], 'shot.png', { type: 'image/png' }))
    const event = new Event('paste', { bubbles: true })
    Object.defineProperty(event, 'clipboardData', { value: data })
    window.dispatchEvent(event)
  })

  await openSvgTab(page)
  const svg = await inspectSvg(page, (await download(page)).path)
  expect(svg.imageHrefs).toHaveLength(1)
  expect(svg.imageHrefs[0]).toMatch(/^data:image\/png;base64,/)
  const [r, g, b, a] = svg.centre
  expect(r).toBeGreaterThan(200)
  expect(g).toBeLessThan(60)
  expect(b).toBeLessThan(60)
  expect(a).toBe(255)
})

test('Copy puts the SVG source on the clipboard', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'clipboard permissions: Chromium only')
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await newDrawing(page)
  await dragRectangle(page, [200, 200], [420, 360])
  await expectInk(page)

  await openSvgTab(page)
  await page.getByRole('button', { name: 'Copy' }).click()
  await expect(
    page.getByText('Copied the SVG code to the clipboard.'),
  ).toBeVisible()
  const text = await page.evaluate(() => navigator.clipboard.readText())
  expect(text.startsWith('<?xml')).toBe(true)
  expect(text).toContain('<svg ')
})
