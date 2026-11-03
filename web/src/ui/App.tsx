import { useState } from 'react'
import { createDocument } from '../core/document/create.ts'
import { createEditor } from '../core/editor/editor.ts'
import { Canvas } from './Canvas.tsx'
import { HistoryControl } from './HistoryControl.tsx'
import { createCanvasMeasure } from './measure.ts'
import { TextEditor } from './TextEditor.tsx'
import { Toolbar } from './Toolbar.tsx'
import { ZoomControl } from './ZoomControl.tsx'

// The editor on a fresh, unsaved drawing; Home and saving arrive in M1 (1.14, 1.15).
export function App() {
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
