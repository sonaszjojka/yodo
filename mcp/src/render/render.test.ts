import { createCanvas, loadImage } from '@napi-rs/canvas'
import { describe, expect, it } from 'vitest'
import {
  BUILT_IN_STYLE,
  createShape,
  createText,
} from '../../../web/src/core/document/create.ts'
import type { YodoElement } from '../../../web/src/core/document/types.ts'
import type { Bounds } from '../../../web/src/core/geometry/rect.ts'
import {
  DARK_CANVAS,
  LIGHT_CANVAS,
} from '../../../web/src/core/render/colors.ts'
import { nodeMeasure } from './measure.ts'
import {
  fitScale,
  MAX_RENDER_SIDE,
  renderPng,
  renderSvg,
  selectForRender,
  type Selection,
} from './render.ts'

const measure = nodeMeasure()

function rect(id: string, bounds: Bounds, style = BUILT_IN_STYLE) {
  return { ...createShape('rectangle', bounds, 7, style), id }
}

const a = rect('a', { x: 0, y: 0, width: 100, height: 50 })
const b = rect('b', { x: 300, y: 200, width: 40, height: 40 })
const elements: YodoElement[] = [a, b]

function selected(result: Selection | { error: string }): Selection {
  if ('error' in result) throw new Error(result.error)
  return result
}

async function pixels(png: Buffer) {
  const image = await loadImage(png)
  const canvas = createCanvas(image.width, image.height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, 0, 0)
  const data = ctx.getImageData(0, 0, image.width, image.height)
  return {
    width: image.width,
    height: image.height,
    at(x: number, y: number) {
      const i = (y * image.width + x) * 4
      return [...data.data.subarray(i, i + 3)]
    },
    /** Whether any pixel is darker than `limit` in every channel. */
    hasInk(limit = 100) {
      for (let i = 0; i < data.data.length; i += 4) {
        if (
          Math.max(data.data[i]!, data.data[i + 1]!, data.data[i + 2]!) < limit
        )
          return true
      }
      return false
    },
  }
}

function hex(color: string) {
  return [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16))
}

describe('selectForRender', () => {
  it('takes every element, framed as the export frames it', () => {
    const { elements: picked, frame } = selected(
      selectForRender(elements, { kind: 'all' }, measure),
    )
    expect(picked.map((e) => e.id)).toEqual(['a', 'b'])
    expect(frame.x).toBeLessThan(0)
    expect(frame.x + frame.width).toBeGreaterThan(340)
  })

  it('takes the given ids in document order', () => {
    const { elements: picked, frame } = selected(
      selectForRender(elements, { kind: 'ids', ids: ['b'] }, measure),
    )
    expect(picked.map((e) => e.id)).toEqual(['b'])
    expect(frame.x).toBeGreaterThan(250)
  })

  it('names the ids that are not in the drawing', () => {
    const result = selectForRender(
      elements,
      { kind: 'ids', ids: ['a', 'nope', 'gone'] },
      measure,
    )
    expect(result).toEqual({
      error: expect.stringContaining('"nope", "gone"'),
    })
  })

  it('frames a region exactly and keeps what crosses it', () => {
    const region = { x: 50, y: -10, width: 20, height: 20 }
    const { elements: picked, frame } = selected(
      selectForRender(elements, { kind: 'region', region }, measure),
    )
    expect(picked.map((e) => e.id)).toEqual(['a'])
    expect(frame).toEqual(region)
  })

  it('keeps an element whose painted stroke alone crosses the region', async () => {
    // The stroke is centred on x = 100, so 8 px of it paints x 96–104: the
    // region sees stroke pixels though the box starts at x = 100.
    const thick = rect(
      'thick',
      { x: 100, y: 100, width: 100, height: 100 },
      { ...BUILT_IN_STYLE, strokeWidth: 8, roughness: 0 },
    )
    const region = { x: 97, y: 120, width: 2, height: 40 }
    const selection = selected(
      selectForRender([thick], { kind: 'region', region }, measure),
    )
    expect(selection.elements.map((e) => e.id)).toEqual(['thick'])
    const png = await pixels(
      renderPng(selection.elements, selection.frame, {
        theme: 'light',
        scale: 1,
      }),
    )
    expect(png.hasInk()).toBe(true)
  })

  it('refuses an empty region, an empty drawing and an empty id list', () => {
    expect(
      selectForRender(
        elements,
        { kind: 'region', region: { x: 1000, y: 1000, width: 10, height: 10 } },
        measure,
      ),
    ).toEqual({ error: expect.stringContaining('Nothing') })
    expect(selectForRender([], { kind: 'all' }, measure)).toEqual({
      error: expect.stringContaining('no elements'),
    })
  })
})

describe('fitScale', () => {
  it('keeps the asked scale when the image fits', () => {
    expect(fitScale({ x: 0, y: 0, width: 400, height: 300 }, 2)).toBe(2)
  })

  it(`shrinks so the longer side is at most ${MAX_RENDER_SIDE} px`, () => {
    const frame = { x: 0, y: 0, width: 5000, height: 1000 }
    const scale = fitScale(frame, 1)
    expect(Math.ceil(frame.width * scale)).toBeLessThanOrEqual(MAX_RENDER_SIDE)
    expect(scale).toBeCloseTo(MAX_RENDER_SIDE / 5000)
  })
})

describe('renderPng', () => {
  const frame = { x: -20, y: -20, width: 160, height: 100 }

  it('is a PNG of the frame at the scale', async () => {
    const png = renderPng([a], frame, { theme: 'light', scale: 2 })
    expect([...png.subarray(0, 8)]).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ])
    const image = await pixels(png)
    expect([image.width, image.height]).toEqual([320, 200])
    expect(image.hasInk()).toBe(true)
  })

  it('paints the page colour of the theme', async () => {
    const light = await pixels(
      renderPng([a], frame, { theme: 'light', scale: 1 }),
    )
    const dark = await pixels(
      renderPng([a], frame, { theme: 'dark', scale: 1 }),
    )
    expect(light.at(1, 1)).toEqual(hex(LIGHT_CANVAS))
    expect(dark.at(1, 1)).toEqual(hex(DARK_CANVAS))
  })
})

describe('renderSvg', () => {
  const frame = { x: -20, y: -20, width: 300, height: 100 }

  it('embeds only the fonts the text uses', () => {
    const label = {
      ...createText([0, 0], 3, { ...BUILT_IN_STYLE, fontFamily: 'mono' }),
      text: 'Hello',
      width: 60,
      height: 25,
    }
    const svg = renderSvg([label], frame, { theme: 'light' })
    expect(svg).toContain('<svg')
    expect(svg).toContain("font-family:'JetBrains Mono Variable'")
    expect(svg).not.toContain('Caveat')
  })

  it('paints the page colour of the theme', () => {
    expect(renderSvg([a], frame, { theme: 'dark' })).toContain(
      `fill="${DARK_CANVAS}"`,
    )
    expect(renderSvg([a], frame, { theme: 'light' })).toContain(
      `fill="${LIGHT_CANVAS}"`,
    )
  })
})
