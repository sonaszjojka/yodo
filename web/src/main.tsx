import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// The Hand canvas font, bundled from its Fontsource package (ADR 0025).
import '@fontsource-variable/caveat'
import { DEFAULT_FONT_SIZE } from './core/document/create.ts'
import { fontOf } from './core/text/layout.ts'
import './ui/index.css'
import { App } from './ui/App.tsx'

// Start loading the canvas font now: the canvas only asks for it when text
// is drawn, and would draw a fallback until it arrives.
void document.fonts.load(fontOf('hand', DEFAULT_FONT_SIZE))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
