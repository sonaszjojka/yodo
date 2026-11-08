import { Keyboard } from '@phosphor-icons/react'
import { useState } from 'react'
import { ShortcutsDialog } from './ShortcutsDialog.tsx'
import { ThemeSwitch } from './ThemeSwitch.tsx'
import { useTheme } from './useTheme.ts'

/**
 * The bottom of Home's sidebar (`docs/ui.md`, Home): the settings that
 * exist so far, Theme and the shortcuts list. About joins it later.
 */
export function SidebarFooter() {
  const { choice, setChoice } = useTheme()
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  return (
    <div className="sidebar-footer">
      <ThemeSwitch choice={choice} onChoose={setChoice} />
      <button
        type="button"
        className="sidebar-link"
        onClick={() => setShortcutsOpen(true)}
      >
        <Keyboard size={18} aria-hidden="true" />
        <span className="sidebar-link-name">Keyboard shortcuts</span>
      </button>
      <ShortcutsDialog
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
    </div>
  )
}
