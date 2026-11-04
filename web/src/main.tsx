import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// The canvas fonts (Hand, Sans, Mono), bundled from Fontsource (ADR 0025).
import '@fontsource-variable/caveat'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource-variable/manrope'
import { DEFAULT_FONT_SIZE } from './core/document/create.ts'
import { FONT_STACKS, fontOf } from './core/text/layout.ts'
import { detectRepository } from './storage/detect.ts'
import './ui/index.css'
import { Root } from './ui/Root.tsx'

// Start loading the canvas fonts now: the canvas only asks for one when text
// is drawn, and would draw and measure a fallback until it arrives (the style
// bar measures text as soon as its font is picked).
for (const family of Object.keys(FONT_STACKS) as (keyof typeof FONT_STACKS)[]) {
  void document.fonts.load(fontOf(family, DEFAULT_FONT_SIZE))
}

// The Go server's API if it answers, otherwise IndexedDB (ADR 0031). The base
// URL keeps the probe under /yodo/ on GitHub Pages.
const { mode, repository } = await detectRepository({
  baseUrl: new URL('./', document.baseURI),
})
console.info(`Yodo storage: ${mode}`)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root repository={repository} />
  </StrictMode>,
)
