import { ArrowLeft } from '@phosphor-icons/react'
import type { Editor, EditorState } from '../core/editor/editor.ts'
import { routeHash } from './route.ts'
import { useStore } from './useStore.ts'

const selectName = (state: EditorState) => state.document.name

/**
 * The editor's top-left part (`docs/ui.md`, Editor): back to Home and the
 * drawing's name. Leaving unmounts the editor, which flushes its save.
 */
export function TopBar({ editor }: { editor: Editor }) {
  const name = useStore(editor.store, selectName)

  return (
    <div className="top-bar">
      <a
        className="tool-button"
        href={routeHash({ name: 'home' })}
        aria-label="Back to Home"
        title="Back to Home"
      >
        <ArrowLeft size={20} />
      </a>
      <span className="drawing-name">{name}</span>
    </div>
  )
}
