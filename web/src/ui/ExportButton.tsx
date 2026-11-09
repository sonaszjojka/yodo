import { Export } from '@phosphor-icons/react'

/**
 * The one top-right export button (docs/ui.md, Editor). It opens the export
 * dialog, whose tabs cover PNG, SVG and the `.yodo` file (ADR 0056). Never
 * disabled: an empty drawing can still be exported as a `.yodo` file.
 */
export function ExportButton({ onOpen }: { onOpen(): void }) {
  return (
    <button
      type="button"
      className="button panel-toggle"
      title="Export (Shift+Ctrl/Cmd+E)"
      onClick={onOpen}
    >
      <Export size={18} aria-hidden />
      Export
    </button>
  )
}
