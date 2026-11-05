// Which font files an SVG export embeds (ADR 0043). Pure: the bytes come in as
// base64 from the UI, so the core never fetches anything.
import type { FontFamily, YodoElement } from '../../document/types.ts'

export type FontSubset = 'latin' | 'latin-ext'

/** The `unicode-range` of each Fontsource subset (the same for every family). */
const RANGES: Record<FontSubset, string> = {
  latin:
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  'latin-ext':
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
}
const SUBSETS = Object.keys(RANGES) as FontSubset[]

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

const PARSED = Object.fromEntries(
  SUBSETS.map((subset) => [subset, parseRange(RANGES[subset])]),
) as Record<FontSubset, Range[]>

function covers(subset: FontSubset, codePoint: number) {
  return PARSED[subset].some(
    ([from, to]) => codePoint >= from && codePoint <= to,
  )
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
 * least one of its characters. Scripts without a file (cyrillic, greek,
 * vietnamese) fall back to the font stack.
 */
export function neededFontFiles(elements: readonly YodoElement[]): FontFile[] {
  return fontFamiliesUsed(elements).flatMap((family) => {
    const points = [...exportedText(elements, family)].map((char) =>
      char.codePointAt(0)!,
    )
    return SUBSETS.filter((subset) =>
      points.some((point) => covers(subset, point)),
    ).map((subset) => ({ family, subset }))
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
        `unicode-range:${RANGES[subset]}}`
      )
    })
    .join('\n')
}
