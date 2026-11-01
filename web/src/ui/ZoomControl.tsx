import type { Point } from '../core/document/types.ts'
import type { Editor, EditorState } from '../core/editor/editor.ts'
import { useStore } from './useStore.ts'

/** Each ± click zooms by this ratio, so in and out undo each other. */
const STEP = 1.25

// Defined outside the component so the selector is a stable reference.
const selectZoom = (state: EditorState) => state.viewport.zoom

/** Buttons zoom around the middle of the window, where nothing else anchors. */
function screenCentre(): Point {
  return [window.innerWidth / 2, window.innerHeight / 2]
}

/** The zoom part of the editor's bottom bar (docs/ui.md). */
export function ZoomControl({ editor }: { editor: Editor }) {
  const zoom = useStore(editor.store, selectZoom)

  return (
    <div className="zoom-control">
      <button
        type="button"
        aria-label="Zoom out"
        onClick={() => editor.setZoom(zoom / STEP, screenCentre())}
      >
        −
      </button>
      <button
        type="button"
        className="zoom-value"
        aria-label="Reset zoom to 100%"
        title="Reset zoom (Ctrl/Cmd+0)"
        onClick={() => editor.setZoom(1, screenCentre())}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        aria-label="Zoom in"
        onClick={() => editor.setZoom(zoom * STEP, screenCentre())}
      >
        +
      </button>
    </div>
  )
}
