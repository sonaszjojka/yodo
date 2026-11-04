import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// The Hand canvas font, bundled from its Fontsource package (ADR 0025).
import '@fontsource-variable/caveat'
import { DEFAULT_FONT_SIZE } from './core/document/create.ts'
import { fontOf } from './core/text/layout.ts'
import { detectRepository } from './storage/detect.ts'
import './ui/index.css'
import { Root } from './ui/Root.tsx'

// Start loading the canvas font now: the canvas only asks for it when text
// is drawn, and would draw a fallback until it arrives.
void document.fonts.load(fontOf('hand', DEFAULT_FONT_SIZE))

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
