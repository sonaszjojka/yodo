import { useState } from 'react'
import { createDocument } from '../core/document/create.ts'
import { createEditor } from '../core/editor/editor.ts'
import type { DrawingRepository } from '../storage/repository.ts'
import { Canvas } from './Canvas.tsx'
import { HistoryControl } from './HistoryControl.tsx'
import { createCanvasMeasure } from './measure.ts'
import { TextEditor } from './TextEditor.tsx'
import { Toolbar } from './Toolbar.tsx'
import { ZoomControl } from './ZoomControl.tsx'

export interface AppProps {
  /** Where drawings are stored, picked at startup (ADR 0031). */
  repository: DrawingRepository
}

// The editor on a fresh, unsaved drawing. `repository` is not used yet:
// auto-save (1.14) and Home (1.15) read and write through it.
export function App(_props: AppProps) {
  // A lazy initialiser creates the editor once, not on every render.
  const [editor] = useState(() =>
    createEditor(createDocument(), { measure: createCanvasMeasure() }),
  )
  return (
    <>
      <Canvas editor={editor} />
      <TextEditor editor={editor} />
      <Toolbar editor={editor} />
      <div className="bottom-bar">
        <HistoryControl editor={editor} />
        <ZoomControl editor={editor} />
      </div>
    </>
  )
}
