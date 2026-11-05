import { DownloadSimple } from '@phosphor-icons/react'
import type { Editor } from '../core/editor/editor.ts'
import type { ImageRepository } from '../storage/images.ts'
import { exportDrawing, exportErrorMessage } from './yodoFile.ts'

/**
 * Downloads the open drawing as a `.yodo` file (ADR 0013). A stop-gap until
 * the Export dialog (roadmap 2.7) takes this over as its "Yodo file" tab.
 * It exports the editor's current document and view, not the last saved copy.
 */
export function ExportButton({
  editor,
  images,
  onError,
}: {
  editor: Editor
  /** Where the drawing's images are read from. */
  images: ImageRepository
  /** Called with a message when the export fails. */
  onError(message: string): void
}) {
  return (
    <button
      type="button"
      className="button panel-toggle"
      onClick={() => {
        // Like auto-save: the document plus the view as it is now.
        const { document, viewport } = editor.store.getState()
        exportDrawing(
          { ...document, appState: { ...document.appState, viewport } },
          images,
        ).catch((error: unknown) => {
          console.error('Could not export the drawing', error)
          onError(exportErrorMessage(error))
        })
      }}
    >
      <DownloadSimple size={18} aria-hidden />
      Export
    </button>
  )
}
