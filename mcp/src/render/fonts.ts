// The Fontsource files (ADR 0025) bundled into the server (ADR 0065): `?inline`
// turns each one into a base64 `data:` URL inside `dist/index.js`, so the
// server needs no font files beside it. The same bytes are registered with
// `@napi-rs/canvas` for measuring and drawing text, and embedded in SVGs.
import caveatCyrillic from '@fontsource-variable/caveat/files/caveat-cyrillic-wght-normal.woff2?inline'
import caveatCyrillicExt from '@fontsource-variable/caveat/files/caveat-cyrillic-ext-wght-normal.woff2?inline'
import caveatLatin from '@fontsource-variable/caveat/files/caveat-latin-wght-normal.woff2?inline'
import caveatLatinExt from '@fontsource-variable/caveat/files/caveat-latin-ext-wght-normal.woff2?inline'
import jetbrainsMonoCyrillic from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-cyrillic-wght-normal.woff2?inline'
import jetbrainsMonoCyrillicExt from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-cyrillic-ext-wght-normal.woff2?inline'
import jetbrainsMonoGreek from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-greek-wght-normal.woff2?inline'
import jetbrainsMonoLatin from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?inline'
import jetbrainsMonoLatinExt from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-ext-wght-normal.woff2?inline'
import jetbrainsMonoVietnamese from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-vietnamese-wght-normal.woff2?inline'
import manropeCyrillic from '@fontsource-variable/manrope/files/manrope-cyrillic-wght-normal.woff2?inline'
import manropeCyrillicExt from '@fontsource-variable/manrope/files/manrope-cyrillic-ext-wght-normal.woff2?inline'
import manropeGreek from '@fontsource-variable/manrope/files/manrope-greek-wght-normal.woff2?inline'
import manropeLatin from '@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2?inline'
import manropeLatinExt from '@fontsource-variable/manrope/files/manrope-latin-ext-wght-normal.woff2?inline'
import manropeVietnamese from '@fontsource-variable/manrope/files/manrope-vietnamese-wght-normal.woff2?inline'
import { GlobalFonts } from '@napi-rs/canvas'
import type { FontFamily } from '../../../web/src/core/document/types.ts'
import type {
  EmbeddedFont,
  FontFile,
  FontSubset,
} from '../../../web/src/core/export/svg/fonts.ts'

function base64Of(dataUrl: string): string {
  const comma = dataUrl.indexOf(',')
  if (!dataUrl.startsWith('data:') || comma < 0) {
    throw new Error('A bundled font is not an inline data: URL')
  }
  return dataUrl.slice(comma + 1)
}

/** Each family's subset files as base64, keyed like `core/export/svg/fonts.ts`. */
export const FONT_FILES: Record<
  FontFamily,
  Partial<Record<FontSubset, string>>
> = {
  hand: {
    latin: base64Of(caveatLatin),
    'latin-ext': base64Of(caveatLatinExt),
    cyrillic: base64Of(caveatCyrillic),
    'cyrillic-ext': base64Of(caveatCyrillicExt),
  },
  sans: {
    latin: base64Of(manropeLatin),
    'latin-ext': base64Of(manropeLatinExt),
    cyrillic: base64Of(manropeCyrillic),
    'cyrillic-ext': base64Of(manropeCyrillicExt),
    greek: base64Of(manropeGreek),
    vietnamese: base64Of(manropeVietnamese),
  },
  mono: {
    latin: base64Of(jetbrainsMonoLatin),
    'latin-ext': base64Of(jetbrainsMonoLatinExt),
    cyrillic: base64Of(jetbrainsMonoCyrillic),
    'cyrillic-ext': base64Of(jetbrainsMonoCyrillicExt),
    greek: base64Of(jetbrainsMonoGreek),
    vietnamese: base64Of(jetbrainsMonoVietnamese),
  },
}

/**
 * The CSS family names of `FONT_STACKS` (`core/text/layout.ts`), so a canvas
 * `font` string built by `fontOf` picks the registered faces.
 */
const FAMILY_NAMES: Record<FontFamily, string> = {
  hand: 'Caveat Variable',
  sans: 'Manrope Variable',
  mono: 'JetBrains Mono Variable',
}

let registered = false

/** Registers every subset with `@napi-rs/canvas`, once per process. */
export function registerFonts() {
  if (registered) return
  for (const family of Object.keys(FONT_FILES) as FontFamily[]) {
    for (const [subset, base64] of Object.entries(FONT_FILES[family])) {
      const face = GlobalFonts.register(
        Buffer.from(base64, 'base64'),
        FAMILY_NAMES[family],
      )
      if (!face) {
        throw new Error(`Could not register the ${family} ${subset} font`)
      }
    }
  }
  registered = true
}

/** The given files with their bytes, for `fontFaceCss`. */
export function embeddedFonts(files: readonly FontFile[]): EmbeddedFont[] {
  return files.flatMap((file) => {
    const base64 = FONT_FILES[file.family][file.subset]
    return base64 ? [{ ...file, base64 }] : []
  })
}
