// Which font files an SVG export embeds (ADR 0043). Pure: the bytes come in as
// base64 from the UI, so the core never fetches anything.
import type { FontFamily, YodoElement } from '../../document/types.ts'

export type FontSubset =
  'latin' | 'latin-ext' | 'cyrillic' | 'cyrillic-ext' | 'greek' | 'vietnamese'

/**
 * The `unicode-range` of each Fontsource subset file, copied from the
 * packages' `index.css`. Families differ: Caveat has no Greek or Vietnamese
 * file, and text in a script a family lacks falls back to the font stack.
 */
const RANGES: Record<FontFamily, Partial<Record<FontSubset, string>>> = {
  hand: {
    'cyrillic-ext':
      'U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F',
    cyrillic: 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116',
    'latin-ext':
      'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
    latin:
      'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  },
  sans: {
    'cyrillic-ext':
      'U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F',
    cyrillic: 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116',
    greek: 'U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF',
    vietnamese:
      'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB',
    'latin-ext':
      'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
    latin:
      'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  },
  mono: {
    'cyrillic-ext':
      'U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F',
    cyrillic: 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116',
    greek: 'U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF',
    vietnamese:
      'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB',
    'latin-ext':
      'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
    latin:
      'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  },
}

/** The CSS family name and weight range of each Fontsource package (ADR 0025). */
const FACES: Record<FontFamily, { css: string; weight: string }> = {
  hand: { css: 'Caveat Variable', weight: '400 700' },
  sans: { css: 'Manrope Variable', weight: '200 800' },
  mono: { css: 'JetBrains Mono Variable', weight: '100 800' },
}

export interface FontFile {
  family: FontFamily
  subset: FontSubset
}

export interface EmbeddedFont extends FontFile {
  base64: string
}

type Range = [from: number, to: number]

function parseRange(list: string): Range[] {
  return list.split(',').map((part): Range => {
    const [from, to = from] = part.replace(/U\+/g, '').split('-')
    return [parseInt(from!, 16), parseInt(to, 16)]
  })
}

/** The subsets a family has, with their parsed ranges. */
const SUBSETS = Object.fromEntries(
  Object.entries(RANGES).map(([family, subsets]) => [
    family,
    Object.entries(subsets).map(([subset, list]) => ({
      subset: subset as FontSubset,
      ranges: parseRange(list),
    })),
  ]),
) as Record<FontFamily, { subset: FontSubset; ranges: Range[] }[]>

function covers(ranges: readonly Range[], codePoint: number) {
  return ranges.some(([from, to]) => codePoint >= from && codePoint <= to)
}

/** Each (font family, text) pair an export draws: free text and shape labels. */
function textRuns(elements: readonly YodoElement[]) {
  const runs: { family: FontFamily; text: string }[] = []
  for (const element of elements) {
    if (element.type === 'text') {
      runs.push({ family: element.fontFamily, text: element.text })
    } else if ('label' in element && element.label?.text) {
      runs.push({ family: element.label.fontFamily, text: element.label.text })
    }
  }
  return runs
}

/** The families of the exported text, in order of first use. */
export function fontFamiliesUsed(
  elements: readonly YodoElement[],
): FontFamily[] {
  return [...new Set(textRuns(elements).map((run) => run.family))]
}

/** All exported text drawn in `family`. */
export function exportedText(
  elements: readonly YodoElement[],
  family: FontFamily,
) {
  return textRuns(elements)
    .filter((run) => run.family === family)
    .map((run) => run.text)
    .join('')
}

/**
 * The font files the text needs: for each family, the subsets that hold at
 * least one of its characters. A script the family has no file for (Greek in
 * Caveat, say) falls back to the font stack.
 */
export function neededFontFiles(elements: readonly YodoElement[]): FontFile[] {
  return fontFamiliesUsed(elements).flatMap((family) => {
    const points = [...exportedText(elements, family)].map((char) =>
      char.codePointAt(0)!,
    )
    return SUBSETS[family]
      .filter(({ ranges }) => points.some((point) => covers(ranges, point)))
      .map(({ subset }) => ({ family, subset }))
  })
}

/** The `@font-face` rules for the embedded files, one per family and subset. */
export function fontFaceCss(fonts: readonly EmbeddedFont[]) {
  return fonts
    .map(({ family, subset, base64 }) => {
      const face = FACES[family]
      return (
        `@font-face{font-family:'${face.css}';font-style:normal;` +
        `font-weight:${face.weight};` +
        `src:url(data:font/woff2;base64,${base64}) format('woff2');` +
        `unicode-range:${RANGES[family][subset]}}`
      )
    })
    .join('\n')
}
