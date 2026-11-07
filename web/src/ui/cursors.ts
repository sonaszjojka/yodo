import type { EditorState } from '../core/editor/editor.ts'
import type { Handle } from '../core/geometry/resize.ts'
import { ERASER_CURSOR } from './eraserCursor.ts'

/** Opposite handles resize along the same line, so they share a cursor. */
const HANDLE_CURSORS: Record<Handle, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
}

export function cursorFor(state: EditorState) {
  const { panning, tool, spaceHeld, move, resize, hoverHandle } = state
  if (panning) return 'grabbing'
  if (tool === 'hand' || spaceHeld) return 'grab'
  const handle = resize?.handle ?? hoverHandle
  if (handle) return HANDLE_CURSORS[handle]
  if (move) return 'move'
  if (tool === 'text') return 'text'
  if (tool === 'eraser') return ERASER_CURSOR
  return tool === 'select' ? 'default' : 'crosshair'
}
