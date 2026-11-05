// Roadmap 2.12: the performance benchmark of docs/product.md. On the generated
// reference board, pan and zoom must keep >= 55 fps and drawing a shape must
// not produce a frame over 32 ms. Run it with `npm run perf` (ADR 0041).

import { createHash } from 'node:crypto'
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import {
  ELEMENT_COUNTS,
  IMAGE_COUNT,
  IMAGE_PIXELS,
  START_VIEWPORT,
  generateBoard,
} from './board.ts'
import { recordRun, type GestureResult } from './record.ts'

const MIN_FPS = 55
const MAX_FRAME_MS = 32
const GESTURE_FRAMES = 240

interface StoredBoard {
  elements: {
    type: string
    x: number
    y: number
    width: number
    height: number
  }[]
  appState: { viewport: { x: number; y: number; zoom: number } }
}

/** An opaque, noisy ~2 MP picture as PNG bytes, made with a canvas in the page. */
async function makePng(page: Page, index: number): Promise<Buffer> {
  const base64 = await page.evaluate(
    async ({ width, height, index }) => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      // Blocks of random colour: real decoding work, yet a small file.
      let state = index + 1
      const next = () => {
        state = (Math.imul(state, 1664525) + 1013904223) | 0
        return (state >>> 8) & 0xff
      }
      for (let y = 0; y < height; y += 8) {
        for (let x = 0; x < width; x += 8) {
          ctx.fillStyle = `rgb(${next()},${next()},${next()})`
          ctx.fillRect(x, y, 8, 8)
        }
      }
      const blob = await new Promise<Blob>((done) =>
        canvas.toBlob((b) => done(b!), 'image/png'),
      )
      const bytes = new Uint8Array(await blob.arrayBuffer())
      let binary = ''
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      }
      return btoa(binary)
    },
    { ...IMAGE_PIXELS, index },
  )
  return Buffer.from(base64, 'base64')
}

/** A digest of what the canvas shows now, to prove a gesture changed it. */
function canvasDigest(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas.canvas')!
    const bytes = new TextEncoder().encode(canvas.toDataURL())
    const hash = await crypto.subtle.digest('SHA-256', bytes)
    return Array.from(new Uint8Array(hash), (b) => b.toString(16)).join('')
  })
}

/** Starts timing animation frames in the page. */
function startFrames(page: Page) {
  return page.evaluate(() => {
    const frames: number[] = []
    const state = { running: true, frames }
    const tick = (time: number) => {
      frames.push(time)
      if (state.running) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    ;(window as unknown as { __frames: typeof state }).__frames = state
  })
}

/** Stops timing and summarises the frame intervals. */
function stopFrames(page: Page): Promise<GestureResult> {
  return page.evaluate(async () => {
    const state = (
      window as unknown as {
        __frames: { running: boolean; frames: number[] }
      }
    ).__frames
    // Two more frames, so the last change has been drawn.
    await new Promise((done) =>
      requestAnimationFrame(() => requestAnimationFrame(done)),
    )
    state.running = false
    const { frames } = state
    const intervals = frames.slice(1).map((time, i) => time - frames[i]!)
    const sorted = [...intervals].sort((a, b) => a - b)
    const span = frames[frames.length - 1]! - frames[0]!
    return {
      fps: (intervals.length / span) * 1000,
      maxFrameMs: sorted[sorted.length - 1]!,
      p95FrameMs: sorted[Math.floor(sorted.length * 0.95)]!,
    }
  })
}

/**
 * Sends one wheel event per animation frame to the canvas (so it reaches the
 * window listener, as a real one does) while frames are timed in the page.
 */
async function wheelGesture(
  page: Page,
  event: (frame: number) => {
    deltaX: number
    deltaY: number
    ctrlKey: boolean
  },
  frames = GESTURE_FRAMES,
): Promise<GestureResult> {
  await startFrames(page)
  await page.evaluate(
    async ({ frames, source }) => {
      const make = new Function(`return (${source})`)() as (frame: number) => {
        deltaX: number
        deltaY: number
        ctrlKey: boolean
      }
      const canvas = document.querySelector<HTMLCanvasElement>('canvas.canvas')!
      await new Promise<void>((done) => {
        let frame = 0
        const step = () => {
          if (frame >= frames) return done()
          canvas.dispatchEvent(
            new WheelEvent('wheel', {
              bubbles: true,
              cancelable: true,
              clientX: window.innerWidth / 2,
              clientY: window.innerHeight / 2,
              ...make(frame++),
            }),
          )
          requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
      })
    },
    { frames, source: event.toString() },
  )
  return stopFrames(page)
}

async function storedBoard(page: Page, id: string): Promise<StoredBoard> {
  const response = await page.request.get(`api/drawings/${id}`)
  expect(response.status()).toBe(200)
  return (await response.json()) as StoredBoard
}

test('the reference board stays smooth', async ({
  page,
  browser,
}, testInfo) => {
  const origin = new URL(testInfo.project.use.baseURL!).origin
  const headers = { Origin: origin }

  // Seed: 5 noisy ~2 MP pictures, then the 1,000-element board.
  await page.goto('./')
  const hashes: string[] = []
  for (let i = 0; i < IMAGE_COUNT; i++) {
    const png = await makePng(page, i)
    const hash = createHash('sha256').update(png).digest('hex')
    const response = await page.request.put(`api/images/${hash}`, {
      data: png,
      headers: { ...headers, 'Content-Type': 'image/png' },
    })
    expect(response.status()).toBeLessThan(300)
    hashes.push(hash)
  }
  const id = 'perf-reference-board'
  const board = generateBoard(id, hashes)
  const put = await page.request.put(`api/drawings/${id}`, {
    data: board,
    headers,
  })
  expect(put.status()).toBeLessThan(300)

  // The stored board is the one the product asks for.
  const seeded = await storedBoard(page, id)
  const count = (type: string) =>
    seeded.elements.filter((e) => e.type === type).length
  expect(seeded.elements.length).toBe(
    ELEMENT_COUNTS.shapes +
      ELEMENT_COUNTS.linear +
      ELEMENT_COUNTS.pencil +
      ELEMENT_COUNTS.text +
      IMAGE_COUNT,
  )
  expect(count('image')).toBe(IMAGE_COUNT)
  expect(count('pencil')).toBe(ELEMENT_COUNTS.pencil)
  expect(count('text')).toBe(ELEMENT_COUNTS.text)

  // Open it, and wait until all pictures have arrived and been drawn.
  const imageResponses = new Set<string>()
  page.on('response', (response) => {
    if (response.url().includes('/api/images/') && response.ok()) {
      imageResponses.add(response.url())
    }
  })
  await page.goto(`./#/d/${id}`)
  await expect(page.locator('canvas.canvas')).toBeVisible()
  await expect
    .poll(() => imageResponses.size, { timeout: 30_000 })
    .toBe(IMAGE_COUNT)
  await page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done)),
      ),
  )

  // Warm up (fonts, shaders, JIT) with a short pan out and back, so the
  // camera is where it started.
  await wheelGesture(
    page,
    (frame) => ({ deltaX: frame < 30 ? 10 : -10, deltaY: 0, ctrlKey: false }),
    60,
  )

  // Pan: a steady diagonal drag across the board, then part of the way back.
  // At zoom 0.25 these deltas move the camera 40 x 24 world units a frame:
  // from (3000, 2000) out to (9400, 5840) and back to (6200, 3920), so the
  // camera stays over the board throughout.
  const beforePan = await canvasDigest(page)
  const pan = await wheelGesture(page, (frame) => ({
    deltaX: frame < 160 ? 10 : -10,
    deltaY: frame < 160 ? 6 : -6,
    ctrlKey: false,
  }))
  expect(await canvasDigest(page)).not.toBe(beforePan)

  // Draw: a rectangle with real pointer events, dragged in many small moves.
  await page.getByRole('button', { name: /^Rectangle/ }).click()
  const box = (await page.locator('canvas.canvas').boundingBox())!
  const from = { x: box.x + 400, y: box.y + 300 }
  const drag = { width: 300, height: 200 }
  const beforeDraw = await canvasDigest(page)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await startFrames(page)
  await page.mouse.move(from.x + drag.width, from.y + drag.height, {
    steps: 120,
  })
  await page.mouse.up()
  const draw = await stopFrames(page)
  expect(await canvasDigest(page)).not.toBe(beforeDraw)

  // Auto-save is debounced (ADR 0032): the new rectangle must reach the store,
  // at the size dragged (screen pixels / zoom), and the pan must be saved too.
  await expect
    .poll(async () => (await storedBoard(page, id)).elements.length, {
      timeout: 10_000,
    })
    .toBe(seeded.elements.length + 1)
  const drawn = await storedBoard(page, id)
  const rectangle = drawn.elements[drawn.elements.length - 1]!
  expect(rectangle.type).toBe('rectangle')
  expect(rectangle.width).toBeCloseTo(drag.width / START_VIEWPORT.zoom, 0)
  expect(rectangle.height).toBeCloseTo(drag.height / START_VIEWPORT.zoom, 0)
  expect(drawn.appState.viewport.x).not.toBe(START_VIEWPORT.x)
  // The drawing was measured over the board, not an empty view: plenty of
  // elements start inside the window at the saved camera.
  const { viewport } = drawn.appState
  const inView = drawn.elements.filter(
    (e) =>
      e.x >= viewport.x &&
      e.x <= viewport.x + 1440 / viewport.zoom &&
      e.y >= viewport.y &&
      e.y <= viewport.y + 900 / viewport.zoom,
  ).length
  expect(inView).toBeGreaterThan(100)

  // Zoom: out for two thirds of the gesture, back in for the rest, around the
  // middle of the window.
  await page.keyboard.press('Escape')
  const beforeZoom = await canvasDigest(page)
  const zoom = await wheelGesture(page, (frame) => ({
    deltaX: 0,
    deltaY: frame < 160 ? 20 : -20,
    ctrlKey: true,
  }))
  expect(await canvasDigest(page)).not.toBe(beforeZoom)

  const results = { pan, zoom, draw }
  const report = JSON.stringify(results, null, 2)
  console.log(report)
  await testInfo.attach('results.json', { body: report })
  if (process.env.PERF_RECORD === '1') {
    recordRun(
      {
        chrome: browser.version(),
        channel: testInfo.project.use.channel ?? 'chromium',
        headless: testInfo.project.use.headless ?? true,
        viewport: testInfo.project.use.viewport!,
        deviceScaleFactor: testInfo.project.use.deviceScaleFactor ?? 1,
      },
      results,
      process.env.PERF_NOTE,
    )
  }

  expect.soft(pan.fps, 'pan fps').toBeGreaterThanOrEqual(MIN_FPS)
  expect.soft(zoom.fps, 'zoom fps').toBeGreaterThanOrEqual(MIN_FPS)
  expect
    .soft(draw.maxFrameMs, 'draw: slowest frame (ms)')
    .toBeLessThanOrEqual(MAX_FRAME_MS)
})
