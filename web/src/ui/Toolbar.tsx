import type { Editor, EditorState } from '../core/editor/editor.ts'
import { TOOLS } from './tools.ts'
import { useStore } from './useStore.ts'

const selectTool = (state: EditorState) => state.tool

/**
 * The editor's tool toolbar, top centre (`docs/ui.md`, Editor). The left
 * (menu, drawing name) and right (style panel, Export) parts arrive with
 * their features.
 */
export function Toolbar({ editor }: { editor: Editor }) {
  const active = useStore(editor.store, selectTool)

  return (
    <div className="toolbar" role="toolbar" aria-label="Tools">
      {TOOLS.map(({ tool, label, key, Icon }) => {
        const on = tool === active
        return (
          <button
            key={tool}
            type="button"
            className="tool-button"
            aria-label={`${label}, shortcut ${key}`}
            aria-pressed={on}
            title={`${label} (${key})`}
            onClick={() => editor.setTool(tool)}
          >
            <Icon size={20} weight={on ? 'fill' : 'regular'} aria-hidden />
            <span className="tool-key" aria-hidden>
              {key}
            </span>
          </button>
        )
      })}
    </div>
  )
}
