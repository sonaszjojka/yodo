// Roadmap 3.6: the MVP's key flows, each proved in both usage modes (ADR 0035).
//
//   1. Draw and keep       persistence.spec.ts
//   2. Edit                this file: text, attached arrow, move, undo/redo
//   3. Organise            folders.spec.ts, trash.spec.ts, search.spec.ts
//   4. Export and import   export-png, export-svg, yodo-file, excalidraw-import
//   5. Paste               copy-paste.spec.ts, images.spec.ts

import type { Page } from '@playwright/test'
import { expectInk } from './canvas.ts'
import { expect, test } from './fixtures.ts'
import { storedDocument, type StoredElement } from './storage.ts'

/** Drags with the left button, in canvas coordinates. */
async function drag(page: Page, from: [number, number], to: [number, number]) {
  const box = await page.locator('canvas.canvas').boundingBox()
  if (!box) throw new Error('the editor canvas is not visible')
  await page.mouse.move(box.x + from[0], box.y + from[1])
  await page.mouse.down()
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 8 })
  await page.mouse.up()
}

/** The tool button by name; the accessible name also carries its shortcut. */
function tool(page: Page, name: string) {
  return page.getByRole('button', { name: new RegExp(`^${name}`) })
}

/** Where the arrow's start and end are, in drawing coordinates. */
function arrowEnds(arrow: StoredElement) {
  const [first, last] = [arrow.points![0]!, arrow.points!.at(-1)!]
  return {
    start: [arrow.x + first[0], arrow.y + first[1]],
    end: [arrow.x + last[0], arrow.y + last[1]],
  }
}

test('draw shapes, label one, attach an arrow, move, undo and redo', async ({
  page,
  mode,
}) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'New drawing' }).click()
  await page.waitForURL(/#\/d\/[^/]+$/)
  const id = decodeURIComponent(new URL(page.url()).hash.slice('#/d/'.length))

  /** The stored elements once auto-save (ADR 0032) has caught up. */
  async function saved(count: number) {
    await expect
      .poll(async () => (await storedDocument(page, mode, id))?.length)
      .toBe(count)
    await expect(page.getByRole('status')).toHaveText('Saved')
    return (await storedDocument(page, mode, id))!
  }

  await test.step('draw a rectangle and an ellipse', async () => {
    await tool(page, 'Rectangle').click()
    await drag(page, [150, 150], [350, 300])
    await tool(page, 'Ellipse').click()
    await drag(page, [600, 150], [800, 300])
    await expectInk(page)
    await saved(2)
  })

  await test.step('type a label into the rectangle', async () => {
    await tool(page, 'Select').click()
    await page
      .locator('canvas.canvas')
      .dblclick({ position: { x: 250, y: 225 } })
    await page.getByRole('textbox', { name: 'Text' }).fill('Plan')
    await page.keyboard.press('Escape')
    const elements = await saved(2)
    expect(elements.find((e) => e.type === 'rectangle')?.label?.text).toBe(
      'Plan',
    )
  })

  let before: ReturnType<typeof arrowEnds>
  let rectangleId: string
  await test.step('draw an arrow from the rectangle to the ellipse', async () => {
    await tool(page, 'Arrow').click()
    await drag(page, [250, 270], [700, 225])
    const elements = await saved(3)
    const rectangle = elements.find((e) => e.type === 'rectangle')!
    const ellipse = elements.find((e) => e.type === 'ellipse')!
    const arrow = elements.find((e) => e.type === 'arrow')!
    rectangleId = rectangle.id
    expect(arrow.startBinding?.elementId).toBe(rectangle.id)
    expect(arrow.endBinding?.elementId).toBe(ellipse.id)
    before = arrowEnds(arrow)
  })

  await test.step('moving the rectangle drags the arrow start with it', async () => {
    await tool(page, 'Select').click()
    // Grab the rectangle by its left edge: the shape has no fill.
    await drag(page, [150, 225], [150, 325])
    const elements = await saved(3)
    expect(elements.find((e) => e.id === rectangleId)!.y).toBeGreaterThan(200)
    const after = arrowEnds(elements.find((e) => e.type === 'arrow')!)
    expect(after.start[1]).toBeCloseTo(before.start[1] + 100, 0)
    expect(after.end).toEqual(before.end)
  })

  await test.step('undo puts both back, redo moves them again', async () => {
    await page.keyboard.press('ControlOrMeta+z')
    let elements = await saved(3)
    expect(arrowEnds(elements.find((e) => e.type === 'arrow')!)).toEqual(before)
    await page.keyboard.press('ControlOrMeta+Shift+z')
    elements = await saved(3)
    expect(
      arrowEnds(elements.find((e) => e.type === 'arrow')!).start[1],
    ).toBeCloseTo(before.start[1] + 100, 0)
  })

  await test.step('everything survives a reload', async () => {
    await page.reload()
    await expectInk(page)
    const elements = (await storedDocument(page, mode, id))!
    expect(elements).toHaveLength(3)
    expect(elements.find((e) => e.type === 'rectangle')?.label?.text).toBe(
      'Plan',
    )
    // Reopening the label shows what was typed, not just what is stored.
    await page.getByRole('button', { name: 'Select' }).click()
    await page
      .locator('canvas.canvas')
      .dblclick({ position: { x: 250, y: 325 } })
    await expect(page.getByRole('textbox', { name: 'Text' })).toHaveValue(
      'Plan',
    )
  })
})
