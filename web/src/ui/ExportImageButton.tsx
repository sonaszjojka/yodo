import { Export } from '@phosphor-icons/react'
import type { Editor, EditorState } from '../core/editor/editor.ts'
import { useStore } from './useStore.ts'

const selectEmpty = (state: EditorState) => state.document.elements.length === 0

/** The top-right button that opens the export dialog (docs/ui.md, Editor). */
export function ExportImageButton({
  editor,
  onOpen,
}: {
  editor: Editor
  onOpen(): void
}) {
  const empty = useStore(editor.store, selectEmpty)
  return (
    <button
      type="button"
      className="button panel-toggle"
      disabled={empty}
      title={
        empty ? 'Nothing to export yet' : 'Export image (Shift+Ctrl/Cmd+E)'
      }
      onClick={onOpen}
    >
      <Export size={18} aria-hidden />
      Export image
    </button>
  )
}
