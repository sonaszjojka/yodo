// The font bytes an SVG export embeds (ADR 0043), and the wait that makes the
// page's own fonts ready before text is measured. The files are Fontsource's
// (ADR 0025). They are imported as URLs and fetched on demand, so they never
// grow the main bundle.
import caveatLatin from '@fontsource-variable/caveat/files/caveat-latin-wght-normal.woff2?url'
import caveatLatinExt from '@fontsource-variable/caveat/files/caveat-latin-ext-wght-normal.woff2?url'
import caveatCyrillic from '@fontsource-variable/caveat/files/caveat-cyrillic-wght-normal.woff2?url'
import caveatCyrillicExt from '@fontsource-variable/caveat/files/caveat-cyrillic-ext-wght-normal.woff2?url'
import manropeLatin from '@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2?url'
import manropeLatinExt from '@fontsource-variable/manrope/files/manrope-latin-ext-wght-normal.woff2?url'
import manropeCyrillic from '@fontsource-variable/manrope/files/manrope-cyrillic-wght-normal.woff2?url'
import manropeCyrillicExt from '@fontsource-variable/manrope/files/manrope-cyrillic-ext-wght-normal.woff2?url'
import manropeGreek from '@fontsource-variable/manrope/files/manrope-greek-wght-normal.woff2?url'
import manropeVietnamese from '@fontsource-variable/manrope/files/manrope-vietnamese-wght-normal.woff2?url'
import jetbrainsMonoLatin from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?url'
import jetbrainsMonoLatinExt from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-ext-wght-normal.woff2?url'
import jetbrainsMonoCyrillic from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-cyrillic-wght-normal.woff2?url'
import jetbrainsMonoCyrillicExt from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-cyrillic-ext-wght-normal.woff2?url'
import jetbrainsMonoGreek from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-greek-wght-normal.woff2?url'
import jetbrainsMonoVietnamese from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-vietnamese-wght-normal.woff2?url'
import type {
  EmbeddedFont,
  FontFile,
  FontSubset,
} from '../core/export/svg/fonts.ts'
import { fontFamiliesUsed, exportedText } from '../core/export/svg/fonts.ts'
import type { FontFamily, YodoElement } from '../core/document/types.ts'
import { fontOf } from '../core/text/layout.ts'
import { blobToBase64 } from '../storage/base64.ts'

const URLS: Record<FontFamily, Partial<Record<FontSubset, string>>> = {
  hand: {
    latin: caveatLatin,
    'latin-ext': caveatLatinExt,
    cyrillic: caveatCyrillic,
    'cyrillic-ext': caveatCyrillicExt,
  },
  sans: {
    latin: manropeLatin,
    'latin-ext': manropeLatinExt,
    cyrillic: manropeCyrillic,
    'cyrillic-ext': manropeCyrillicExt,
    greek: manropeGreek,
    vietnamese: manropeVietnamese,
  },
  mono: {
    latin: jetbrainsMonoLatin,
    'latin-ext': jetbrainsMonoLatinExt,
    cyrillic: jetbrainsMonoCyrillic,
    'cyrillic-ext': jetbrainsMonoCyrillicExt,
    greek: jetbrainsMonoGreek,
    vietnamese: jetbrainsMonoVietnamese,
  },
}

export type Fetch = (url: string) => Promise<{
  ok: boolean
  blob(): Promise<Blob>
}>

/** The files as base64, each fetched once per page. */
export function createFontLoader(
  fetchFile: Fetch = (url) => fetch(url),
  urls = URLS,
) {
  const cache = new Map<string, Promise<string>>()
  function load({ family, subset }: FontFile): Promise<string> {
    const url = urls[family][subset]
    if (!url)
      return Promise.reject(new Error(`No ${subset} font for ${family}`))
    let loading = cache.get(url)
    if (!loading) {
      loading = fetchFile(url).then(async (response) => {
        if (!response.ok) throw new Error(`Could not load the font ${url}`)
        return blobToBase64(await response.blob())
      })
      // A failed load must not stick: the next export tries again.
      loading.catch(() => cache.delete(url))
      cache.set(url, loading)
    }
    return loading
  }
  return async (files: readonly FontFile[]): Promise<EmbeddedFont[]> =>
    Promise.all(
      files.map(async (file) => ({ ...file, base64: await load(file) })),
    )
}

export const loadEmbeddedFonts = createFontLoader()

/** The part of `document.fonts` this needs. */
export interface FontSet {
  load(font: string, text?: string): Promise<unknown>
  ready: Promise<unknown>
}

/**
 * Resolves once the fonts of the exported text are loaded on the page. The
 * canvas measure that wraps labels and sizes the frame uses these fonts, so
 * measuring before they arrive gives other line breaks than the embedded
 * fonts draw (ADR 0025). A font that fails to load is not waited for.
 */
export async function pageFontsReady(
  elements: readonly YodoElement[],
  fonts: FontSet,
) {
  await Promise.all(
    fontFamiliesUsed(elements).map((family) =>
      fonts
        .load(fontOf(family, 16), exportedText(elements, family))
        .catch(() => undefined),
    ),
  )
  await fonts.ready
}
