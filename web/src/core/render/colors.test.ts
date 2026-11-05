import { describe, expect, test } from 'vitest'
import {
  adaptColor,
  canvasColor,
  contrastRatio,
  DARK_CANVAS,
  LIGHT_CANVAS,
} from './colors.ts'

// The dark twins from docs/ui.md, "Drawing palette".
const STROKE_TWINS: Record<string, string> = {
  '#1E1F22': '#E4E6E8',
  '#6B7280': '#9AA1AA',
  '#C2453D': '#F08A80',
  '#D9822B': '#F0AE63',
  '#3F8F5A': '#6CC28A',
  '#1F8A8A': '#5CC8C8',
  '#3A6FD8': '#8AB0F5',
  '#7A5AF8': '#A895FB',
}
const FILL_TWINS: Record<string, string> = {
  '#F7E1DE': '#3D2624',
  '#F9EBD6': '#3B2F1F',
  '#E2F0E5': '#1F3427',
  '#DDF0EF': '#183433',
  '#E0E9FB': '#1F2C45',
  '#ECE6FD': '#2C2545',
  '#EEF0F2': '#2A2D31',
}

function hueOf(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  if (d === 0) return 0
  const h =
    max === r
      ? ((g - b) / d) % 6
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4
  return (h * 60 + 360) % 360
}

describe('adaptColor', () => {
  test('light mode keeps every colour as stored', () => {
    for (const color of ['#1E1F22', '#abc', 'transparent', 'red']) {
      expect(adaptColor(color, 'light', 'stroke')).toBe(color)
      expect(adaptColor(color, 'light', 'fill')).toBe(color)
    }
  })

  test('dark mode maps every palette stroke to its twin', () => {
    for (const [light, dark] of Object.entries(STROKE_TWINS)) {
      expect(adaptColor(light, 'dark', 'stroke')).toBe(dark)
    }
  })

  test('dark mode maps every palette fill to its twin', () => {
    for (const [light, dark] of Object.entries(FILL_TWINS)) {
      expect(adaptColor(light, 'dark', 'fill')).toBe(dark)
    }
  })

  test('palette matching ignores case', () => {
    expect(adaptColor('#1e1f22', 'dark', 'stroke')).toBe('#E4E6E8')
  })

  test.each(['transparent', 'red', 'rgb(1, 2, 3)', '#12345678', '#12', ''])(
    'passes %j through unchanged',
    (color) => {
      expect(adaptColor(color, 'dark', 'stroke')).toBe(color)
    },
  )

  test('a custom stroke keeps its hue and is readable on the dark canvas', () => {
    for (const color of [
      '#000000',
      '#222222',
      '#800000',
      '#0b3d91',
      '#553311',
    ]) {
      const adapted = adaptColor(color, 'dark', 'stroke')
      expect(adapted).toMatch(/^#[0-9A-F]{6}$/)
      expect(contrastRatio(adapted, DARK_CANVAS)).toBeGreaterThanOrEqual(3)
    }
    const hue = hueOf(adaptColor('#800000', 'dark', 'stroke'))
    expect(Math.abs(hue - hueOf('#800000'))).toBeLessThan(8)
  })

  test('a custom fill turns dark and stays close to the canvas', () => {
    const adapted = adaptColor('#ffffff', 'dark', 'fill')
    expect(contrastRatio(adapted, DARK_CANVAS)).toBeLessThan(2)
    expect(adaptColor('#ffcc00', 'dark', 'fill')).not.toBe('#ffcc00')
  })

  test('expands short hex and is deterministic', () => {
    expect(adaptColor('#abc', 'dark', 'stroke')).toBe(
      adaptColor('#aabbcc', 'dark', 'stroke'),
    )
    expect(adaptColor('#336699', 'dark', 'fill')).toBe(
      adaptColor('#336699', 'dark', 'fill'),
    )
  })
})

describe('canvasColor', () => {
  test('is the page colour of each theme', () => {
    expect(canvasColor('light')).toBe('#f7f9f9')
    expect(canvasColor('dark')).toBe('#141517')
    expect(LIGHT_CANVAS).not.toBe(DARK_CANVAS)
  })
})
