import { DownloadSimple } from '@phosphor-icons/react'
import type { Editor } from '../core/editor/editor.ts'
import { exportDrawing } from './yodoFile.ts'

/**
 * Downloads the open drawing as a `.yodo` file (ADR 0013). A stop-gap until
 * the Export dialog (roadmap 2.7) takes this over as its "Yodo file" tab.
 * It exports the editor's current document and view, not the last saved copy.
 */
export function ExportButton({ editor }: { editor: Editor }) {
  return (
    <button
      type="button"
      className="button panel-toggle"
      onClick={() => {
        // Like auto-save: the document plus the view as it is now.
        const { document, viewport } = editor.store.getState()
        exportDrawing({
          ...document,
          appState: { ...document.appState, viewport },
        })
      }}
    >
      <DownloadSimple size={18} aria-hidden />
      Export
    </button>
  )
}
