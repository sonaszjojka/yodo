import { describe, expect, test } from 'vitest'
import {
  createLinear,
  createShape,
  createText,
  DEFAULT_LABEL,
} from '../../document/create.ts'
import type { FontFamily } from '../../document/types.ts'
import {
  exportedText,
  fontFaceCss,
  fontFamiliesUsed,
  neededFontFiles,
} from './fonts.ts'

const freeText = (value: string, fontFamily: FontFamily) => ({
  ...createText([0, 0]),
  text: value,
  fontFamily,
})
const sans = {
  ...createShape('rectangle', { x: 0, y: 0, width: 100, height: 50 }),
  label: { ...DEFAULT_LABEL, text: 'Hello', fontFamily: 'sans' as const },
}
const hand = freeText('Hello Łódź', 'hand')

describe('fontFamiliesUsed', () => {
  test('lists the families of free text and labels, once each', () => {
    expect(fontFamiliesUsed([sans, hand, sans])).toEqual(['sans', 'hand'])
  })

  test('ignores elements without text', () => {
    expect(
      fontFamiliesUsed([
        createLinear('line', { x: 0, y: 0, width: 0, height: 0, points: [] }),
      ]),
    ).toEqual([])
    expect(
      fontFamiliesUsed([
        createShape('ellipse', { x: 0, y: 0, width: 1, height: 1 }),
      ]),
    ).toEqual([])
  })
})

describe('neededFontFiles', () => {
  test('plain latin text needs only the latin file', () => {
    expect(neededFontFiles([sans])).toEqual([
      { family: 'sans', subset: 'latin' },
    ])
  })

  test('Polish letters also need the latin-ext file of that family', () => {
    const subsets = neededFontFiles([hand]).map((file) => file.subset)
    expect(subsets.sort()).toEqual(['latin', 'latin-ext'])
  })

  test('latin-ext text in another family does not pull its files in', () => {
    expect(
      neededFontFiles([sans, hand]).filter((f) => f.family === 'sans'),
    ).toEqual([{ family: 'sans', subset: 'latin' }])
  })

  test('Cyrillic text needs the cyrillic file of its family', () => {
    expect(neededFontFiles([freeText('Привет', 'sans')])).toEqual([
      { family: 'sans', subset: 'cyrillic' },
    ])
  })

  test('Greek and Vietnamese text get their own files', () => {
    expect(neededFontFiles([freeText('Γειά', 'mono')])).toEqual([
      { family: 'mono', subset: 'greek' },
    ])
    expect(neededFontFiles([freeText('Việt', 'sans')])).toContainEqual({
      family: 'sans',
      subset: 'vietnamese',
    })
  })

  test('a family without a file for the script falls back to its font stack', () => {
    // Caveat has no Greek file.
    expect(neededFontFiles([freeText('Γειά', 'hand')])).toEqual([])
  })

  test('mixed scripts embed every subset that is used', () => {
    const files = neededFontFiles([freeText('Hi Привет Łódź', 'sans')])
    expect(files.map((file) => file.subset).sort()).toEqual([
      'cyrillic',
      'latin',
      'latin-ext',
    ])
  })
})

describe('exportedText', () => {
  test('joins the text of labels and free text by family', () => {
    expect(exportedText([sans, hand], 'hand')).toBe('Hello Łódź')
  })
})

describe('fontFaceCss', () => {
  test('writes one @font-face per file with its unicode-range', () => {
    const css = fontFaceCss([
      { family: 'hand', subset: 'latin', base64: 'AAAA' },
      { family: 'hand', subset: 'latin-ext', base64: 'BBBB' },
    ])
    expect(css.match(/@font-face/g)).toHaveLength(2)
    expect(css).toContain("font-family:'Caveat Variable'")
    expect(css).toContain('url(data:font/woff2;base64,AAAA)')
    expect(css).toContain('url(data:font/woff2;base64,BBBB)')
    expect(css).toContain('unicode-range:U+0000-00FF')
    expect(css).toContain('unicode-range:U+0100-02BA')
    expect(css).toContain('font-weight:400 700')
  })

  test('is empty without files', () => {
    expect(fontFaceCss([])).toBe('')
  })
})
