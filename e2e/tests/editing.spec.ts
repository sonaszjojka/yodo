// Roadmap 3.6: the MVP's key flows, each proved in both usage modes (ADR 0035).
//
//   1. Draw and keep       persistence.spec.ts
//   2. Edit                this file: text, attached arrow, bent line, move, undo/redo
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
    // The tool stays active after an element (ADR 0050).
    await expect(tool(page, 'Rectangle')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await tool(page, 'Ellipse').click()
    await drag(page, [600, 150], [800, 300])
    await expect(tool(page, 'Ellipse')).toHaveAttribute('aria-pressed', 'true')
    await expectInk(page)
    await saved(2)
  })

  await test.step('type a label into the rectangle', async () => {
    await page.keyboard.press('Escape')
    await expect(tool(page, 'Select')).toHaveAttribute('aria-pressed', 'true')
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

  await test.step('the Text tool makes free text over the rectangle, not a label', async () => {
    await tool(page, 'Text').click()
    await page.locator('canvas.canvas').click({ position: { x: 200, y: 190 } })
    await page.getByRole('textbox', { name: 'Text' }).fill('Over')
    await page.keyboard.press('Escape')
    const elements = await saved(3)
    expect(elements.find((e) => e.type === 'text')?.text).toBe('Over')
    expect(elements.find((e) => e.type === 'rectangle')?.label?.text).toBe(
      'Plan',
    )
    // Undo removes just the free text, so the later steps see two shapes.
    await page.keyboard.press('Escape')
    await page.keyboard.press('ControlOrMeta+z')
    await saved(2)
  })

  await test.step('Enter on the selected rectangle edits its label', async () => {
    await tool(page, 'Select').click()
    // The rectangle has no fill: click its left edge to select it.
    await page.locator('canvas.canvas').click({ position: { x: 150, y: 225 } })
    await page.keyboard.press('Enter')
    await expect(page.getByRole('textbox', { name: 'Text' })).toHaveValue(
      'Plan',
    )
    await page.keyboard.press('Escape')
    await saved(2)
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

test('re-attach an arrow by dragging its end, then move and resize the shape, and detach it', async ({
  page,
  mode,
}) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'New drawing' }).click()
  await page.waitForURL(/#\/d\/[^/]+$/)
  const id = decodeURIComponent(new URL(page.url()).hash.slice('#/d/'.length))

  /** The stored arrow, once auto-save (ADR 0032) has stored it. */
  async function storedArrow() {
    return (await storedDocument(page, mode, id))?.find(
      (e) => e.type === 'arrow',
    )
  }

  await test.step('draw an ellipse and a free arrow below it', async () => {
    await tool(page, 'Ellipse').click()
    await drag(page, [600, 150], [800, 300])
    await tool(page, 'Arrow').click()
    await drag(page, [200, 450], [450, 450])
    await expect.poll(storedArrow).toBeDefined()
    const arrow = (await storedArrow())!
    expect(arrow.startBinding).toBeUndefined()
    expect(arrow.endBinding).toBeUndefined()
  })

  await test.step('dragging the selected arrow end onto the ellipse attaches it', async () => {
    await tool(page, 'Select').click()
    await page.locator('canvas.canvas').click({ position: { x: 325, y: 450 } })
    await drag(page, [450, 450], [700, 225])
    await expect
      .poll(async () => (await storedArrow())?.endBinding)
      .toBeDefined()
    const elements = (await storedDocument(page, mode, id))!
    const ellipse = elements.find((e) => e.type === 'ellipse')!
    const arrow = elements.find((e) => e.type === 'arrow')!
    expect(arrow.endBinding?.elementId).toBe(ellipse.id)
    expect(arrow.startBinding).toBeUndefined()
  })

  let attachedEnd: number[]
  await test.step('moving the ellipse keeps the arrow attached', async () => {
    const before = arrowEnds((await storedArrow())!).end
    // The ellipse has no fill: grab it by its right edge.
    await drag(page, [800, 225], [800, 275])
    await expect
      .poll(async () => arrowEnds((await storedArrow())!).end[1])
      .toBeGreaterThan(before[1]! + 20)
    const arrow = (await storedArrow())!
    expect(arrow.endBinding).toBeDefined()
    attachedEnd = arrowEnds(arrow).end
  })

  await test.step('resizing the ellipse keeps the arrow end on its outline', async () => {
    const before = (await storedDocument(page, mode, id))!.find(
      (e) => e.type === 'ellipse',
    )!
    // The ellipse is still selected from the move. Pull its bottom-right
    // corner handle, which sits just outside the box (stroke and gap).
    const corner = [before.x + before.width + 8, before.y + before.height + 8]
    await drag(
      page,
      [corner[0]!, corner[1]!],
      [corner[0]! + 100, corner[1]! + 100],
    )
    await expect
      .poll(async () => {
        const ellipse = (await storedDocument(page, mode, id))!.find(
          (e) => e.type === 'ellipse',
        )!
        return ellipse.width
      })
      .toBeGreaterThan(before.width + 50)
    const elements = (await storedDocument(page, mode, id))!
    const ellipse = elements.find((e) => e.type === 'ellipse')!
    const arrow = elements.find((e) => e.type === 'arrow')!
    expect(arrow.endBinding?.elementId).toBe(ellipse.id)
    // The end lies on the resized ellipse's curve.
    const [x, y] = arrowEnds(arrow).end
    const [rx, ry] = [ellipse.width / 2, ellipse.height / 2]
    const onCurve =
      ((x! - ellipse.x - rx) / rx) ** 2 + ((y! - ellipse.y - ry) / ry) ** 2
    expect(onCurve).toBeCloseTo(1, 1)
    attachedEnd = [x!, y!]
  })

  await test.step('dragging the end away detaches it', async () => {
    const { start, end } = arrowEnds((await storedArrow())!)
    expect(end).toEqual(attachedEnd)
    // Select the arrow by its middle, then pull its end into empty space.
    await page.locator('canvas.canvas').click({
      position: { x: (start[0]! + end[0]!) / 2, y: (start[1]! + end[1]!) / 2 },
    })
    await drag(page, [end[0]!, end[1]!], [450, 520])
    await expect
      .poll(async () => (await storedArrow())?.endBinding)
      .toBeUndefined()
    expect(arrowEnds((await storedArrow())!).end).toEqual([450, 520])
  })
})

test('bend a line by its mid-handle, move a point, and undo', async ({
  page,
  mode,
}) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'New drawing' }).click()
  await page.waitForURL(/#\/d\/[^/]+$/)
  const id = decodeURIComponent(new URL(page.url()).hash.slice('#/d/'.length))

  async function storedLine() {
    return (await storedDocument(page, mode, id))?.find(
      (e) => e.type === 'line',
    )
  }

  await test.step('draw a straight line and select it', async () => {
    await tool(page, 'Line').click()
    await drag(page, [200, 400], [500, 400])
    await expect.poll(storedLine).toBeDefined()
    expect((await storedLine())!.points).toHaveLength(2)
    await tool(page, 'Select').click()
    await page.locator('canvas.canvas').click({ position: { x: 300, y: 400 } })
  })

  await test.step('dragging the mid-handle bends it into a curve', async () => {
    await drag(page, [350, 400], [350, 300])
    await expect.poll(async () => (await storedLine())?.points?.length).toBe(3)
    const line = (await storedLine())!
    expect(line.curved).toBe(true)
    const [, middle] = line.points!
    expect(line.y + middle![1]).toBeCloseTo(300, 0)
  })

  await test.step('dragging the new point moves just that point', async () => {
    await drag(page, [350, 300], [380, 250])
    await expect
      .poll(async () => {
        const line = await storedLine()
        return line && line.y + line.points![1]![1]
      })
      .toBeCloseTo(250, 0)
    expect((await storedLine())!.points).toHaveLength(3)
  })

  await test.step('undo takes the point back, then the bend', async () => {
    await page.keyboard.press('ControlOrMeta+z')
    await expect
      .poll(async () => {
        const line = await storedLine()
        return line && line.y + line.points![1]![1]
      })
      .toBeCloseTo(300, 0)
    await page.keyboard.press('ControlOrMeta+z')
    await expect.poll(async () => (await storedLine())?.points).toHaveLength(2)
    expect((await storedLine())!.curved).toBeUndefined()
  })
})

test('attach an arrow to a line, then move the line and the arrow end follows', async ({
  page,
  mode,
}) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'New drawing' }).click()
  await page.waitForURL(/#\/d\/[^/]+$/)
  const id = decodeURIComponent(new URL(page.url()).hash.slice('#/d/'.length))

  async function stored(type: 'line' | 'arrow') {
    return (await storedDocument(page, mode, id))?.find((e) => e.type === type)
  }

  await test.step('draw a line and an arrow that ends on it', async () => {
    await tool(page, 'Line').click()
    await drag(page, [200, 400], [600, 400])
    await tool(page, 'Arrow').click()
    await drag(page, [300, 550], [300, 405])
    await expect.poll(() => stored('arrow')).toBeDefined()
  })

  const line =
    await test.step('the end is attached a quarter along the line', async () => {
      await expect
        .poll(async () => (await stored('arrow'))?.endBinding?.along)
        .toBeCloseTo(0.25, 2)
      const line = (await stored('line'))!
      expect((await stored('arrow'))!.endBinding!.elementId).toBe(line.id)
      expect(arrowEnds((await stored('arrow'))!).end).toEqual([300, 400])
      return line
    })

  await test.step('moving the line carries the arrow end with it', async () => {
    await tool(page, 'Select').click()
    await page.locator('canvas.canvas').click({ position: { x: 550, y: 400 } })
    await drag(page, [550, 400], [550, 500])
    await expect.poll(async () => (await stored('line'))?.y).toBe(line.y + 100)
    await expect
      .poll(async () => arrowEnds((await stored('arrow'))!).end)
      .toEqual([300, 500])
    expect((await stored('arrow'))!.endBinding!.along).toBeCloseTo(0.25, 2)
  })
})
