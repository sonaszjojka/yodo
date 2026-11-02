import {
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import type { Editor, EditorState } from '../core/editor/editor.ts'
import { editBox, type TextEdit } from '../core/editor/text.ts'
import { worldToScreen } from '../core/geometry/viewport.ts'
import { fontOf, LINE_HEIGHT } from '../core/text/layout.ts'
import { useStore } from './useStore.ts'

/**
 * Extra width (CSS px) for the caret and sub-pixel differences between the
 * canvas and the DOM measuring the same text, so free text never scrolls.
 */
const CARET_ROOM = 2

const selectEditing = (state: EditorState) => state.editing
const selectDocument = (state: EditorState) => state.document
const selectViewport = (state: EditorState) => state.viewport

/** Identifies one edit, so a new edit remounts the textarea (focus, select). */
function editKey(edit: TextEdit) {
  return edit.target === 'new' ? edit.element.id : `${edit.target}:${edit.id}`
}

/**
 * The textarea over the canvas while text is edited (ADR 0027). It is a
 * controlled view of `editing` in the core, laid out with the same core
 * function the canvas draws with, scaled by the zoom.
 */
export function TextEditor({ editor }: { editor: Editor }) {
  const editing = useStore(editor.store, selectEditing)
  const doc = useStore(editor.store, selectDocument)
  const viewport = useStore(editor.store, selectViewport)
  if (!editing) return null
  const box = editBox(doc, editing, editor.measure)
  if (!box) return null

  const { zoom } = viewport
  const [left, top] = worldToScreen(viewport, [box.x, box.y])
  const width = box.width * zoom + (box.wraps ? 0 : CARET_ROOM)
  return (
    <EditingArea
      key={editKey(editing)}
      editor={editor}
      text={editing.text}
      selectAll={editing.target !== 'new'}
      wraps={box.wraps}
      style={{
        left,
        top,
        width,
        height: box.height * zoom,
        font: fontOf(box.fontFamily, box.fontSize * zoom),
        lineHeight: LINE_HEIGHT,
        textAlign: box.textAlign,
        color: box.color,
      }}
    />
  )
}

function EditingArea({
  editor,
  text,
  selectAll,
  wraps,
  style,
}: {
  editor: Editor
  text: string
  selectAll: boolean
  wraps: boolean
  style: CSSProperties
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  // Once per edit (each edit remounts by key, and `selectAll` is fixed for
  // it): focus, and select existing text so typing replaces it.
  useEffect(() => {
    const area = ref.current!
    area.focus()
    if (selectAll) area.select()
  }, [selectAll])

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const mod = event.metaKey || event.ctrlKey
    // Enter adds a line; Escape or Cmd/Ctrl+Enter finish the edit.
    if (event.key === 'Escape' || (event.key === 'Enter' && mod)) {
      event.preventDefault()
      editor.commitText()
    }
  }

  return (
    <textarea
      ref={ref}
      className="text-editor"
      aria-label="Text"
      value={text}
      wrap={wraps ? 'soft' : 'off'}
      style={style}
      onChange={(event) => editor.setEditingText(event.target.value)}
      onBlur={() => editor.commitText()}
      onKeyDown={onKeyDown}
    />
  )
}
