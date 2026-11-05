// Copy, cut, paste, select all and duplicate from the keyboard (roadmap 2.5).
// Copy, cut and paste use the browser's own clipboard events so no permission
// is needed (ADR 0039). Written against small structural types so tests can
// pass plain objects.
import type { Editor } from '../core/editor/editor.ts'
import type { Bounds } from '../core/geometry/rect.ts'

/** Typing in a field must not trigger canvas shortcuts. */
export function isEditable(target: EventTarget | null) {
  const element = target as {
    tagName?: string
    isContentEditable?: boolean
  } | null
  return (
    !!element &&
    (element.isContentEditable === true ||
      element.tagName === 'INPUT' ||
      element.tagName === 'TEXTAREA')
  )
}

export interface ClipboardLike {
  target: EventTarget | null
  clipboardData: Pick<DataTransfer, 'getData' | 'setData'> | null
  preventDefault(): void
}

/**
 * Handles `copy`, `cut` and `paste`. They are left to the browser when a text
 * field has focus (so editing text keeps its own clipboard), when nothing is
 * selected to copy, and when the pasted text isn't a Yodo payload.
 */
export function handleClipboardEvent(
  editor: Editor,
  type: 'copy' | 'cut' | 'paste',
  event: ClipboardLike,
  view: Bounds,
) {
  if (isEditable(event.target) || !event.clipboardData) return
  if (type === 'paste') {
    const text = event.clipboardData.getData('text/plain')
    if (editor.paste(text, view)) event.preventDefault()
    return
  }
  const text = type === 'copy' ? editor.copySelected() : editor.cutSelected()
  if (text === null) return
  event.clipboardData.setData('text/plain', text)
  event.preventDefault()
}

export interface ShortcutLike {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
  preventDefault(): void
}

/** Ctrl/Cmd+A selects all, Ctrl/Cmd+D duplicates. Returns whether it acted. */
export function handleEditShortcut(editor: Editor, event: ShortcutLike) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) {
    return false
  }
  const key = event.key.toLowerCase()
  if (key === 'a') editor.selectAll()
  else if (key === 'd') editor.duplicateSelected()
  else return false
  // The browser would select the page text, or bookmark the page.
  event.preventDefault()
  return true
}
