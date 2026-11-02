import type { Editor } from '../core/editor/editor.ts'
import type { HistoryStatus } from '../core/history/history.ts'
import { useStore } from './useStore.ts'

// Defined outside the component so the selectors are stable references.
const selectCanUndo = (status: HistoryStatus) => status.canUndo
const selectCanRedo = (status: HistoryStatus) => status.canRedo

/** The undo/redo part of the editor's bottom bar (docs/ui.md). */
export function HistoryControl({ editor }: { editor: Editor }) {
  const canUndo = useStore(editor.history, selectCanUndo)
  const canRedo = useStore(editor.history, selectCanRedo)

  return (
    <div className="control-group">
      <button
        type="button"
        aria-label="Undo"
        title="Undo (Ctrl/Cmd+Z)"
        disabled={!canUndo}
        onClick={editor.undo}
      >
        ↶
      </button>
      <button
        type="button"
        aria-label="Redo"
        title="Redo (Shift+Ctrl/Cmd+Z)"
        disabled={!canRedo}
        onClick={editor.redo}
      >
        ↷
      </button>
    </div>
  )
}
