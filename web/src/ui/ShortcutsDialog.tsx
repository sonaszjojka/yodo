import { Keyboard } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { filterShortcuts, SHORTCUT_GROUPS, type Shortcut } from './shortcuts.ts'

/** The keyboard icon in the editor's bottom bar (docs/ui.md). */
export function ShortcutsButton({ onClick }: { onClick(): void }) {
  return (
    <div className="control-group">
      <button
        type="button"
        aria-label="Keyboard shortcuts"
        title="Keyboard shortcuts (?)"
        onClick={onClick}
      >
        <Keyboard size={20} aria-hidden="true" />
      </button>
    </div>
  )
}

function Chords({ shortcut }: { shortcut: Shortcut }) {
  return (
    <span className="shortcut-keys">
      {shortcut.keys.map((chord, index) => (
        <span key={chord.join('+')} className="shortcut-chord">
          {index > 0 && <span className="shortcut-or">or</span>}
          {chord.map((key) => (
            <kbd key={key}>{key}</kbd>
          ))}
        </span>
      ))}
    </span>
  )
}

/** The search box and the list. Mounted only while open, so the search resets. */
function ShortcutsContent({ onClose }: { onClose(): void }) {
  const [query, setQuery] = useState('')
  const groups = filterShortcuts(SHORTCUT_GROUPS, query)

  return (
    <div className="shortcuts-body">
      <h2 id="shortcuts-title">Keyboard shortcuts</h2>
      <input
        type="search"
        aria-label="Search shortcuts"
        placeholder="Search shortcuts"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="shortcuts-list">
        {groups.map((group) => (
          <section key={group.title} aria-label={group.title}>
            <h3>{group.title}</h3>
            <ul>
              {group.shortcuts.map((shortcut) => (
                <li key={shortcut.action}>
                  <span>{shortcut.action}</span>
                  <Chords shortcut={shortcut} />
                </li>
              ))}
            </ul>
          </section>
        ))}
        {groups.length === 0 && (
          <p role="status" className="shortcuts-empty">
            No shortcut matches
          </p>
        )}
      </div>
      <button type="button" className="shortcuts-close" onClick={onClose}>
        Close
      </button>
    </div>
  )
}

/**
 * The searchable, grouped list of shortcuts (roadmap 2.10, docs/ui.md). A
 * native modal `<dialog>`: the browser traps focus, makes the page inert,
 * closes on Esc and returns focus to what opened it.
 */
export function ShortcutsDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose(): void
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current!
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="shortcuts-dialog"
      aria-labelledby="shortcuts-title"
      // Esc closes it natively; this keeps the owner's state in step.
      onClose={onClose}
      // The body fills the dialog, so a click on the dialog itself is the backdrop.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      {open && <ShortcutsContent onClose={onClose} />}
    </dialog>
  )
}
