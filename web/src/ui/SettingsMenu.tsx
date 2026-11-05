import { Check, Gear } from '@phosphor-icons/react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { ThemeChoice } from '../storage/preferences.ts'
import { nextMenuIndex } from './menuKeys.ts'
import { isOutside } from './outsidePress.ts'
import { ShortcutsDialog } from './ShortcutsDialog.tsx'
import { useTheme } from './useTheme.ts'

const THEME_CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

/** The Theme group of the Settings menu: one radio per choice. */
export function ThemeOptions({
  choice,
  onChoose,
}: {
  choice: ThemeChoice
  onChoose(choice: ThemeChoice): void
}) {
  return (
    <div role="group" aria-label="Theme">
      <div className="menu-heading" aria-hidden="true">
        Theme
      </div>
      {THEME_CHOICES.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          role="menuitemradio"
          aria-checked={value === choice}
          onClick={() => onChoose(value)}
        >
          {label}
          {value === choice && <Check size={16} aria-hidden="true" />}
        </button>
      ))}
    </div>
  )
}

/**
 * Home's Settings menu (`docs/ui.md`, Home). Theme and the shortcuts
 * list exist so far; About joins it later.
 */
export function SettingsMenu() {
  const { choice, setChoice } = useTheme()
  const [open, setOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const menu = menuRef.current!
    menu.querySelector<HTMLElement>('[aria-checked="true"]')?.focus()
    // Any press outside the menu and its button closes it.
    const onPointerDown = (event: PointerEvent) => {
      if (isOutside(event.target, menu, buttonRef.current)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      setOpen(false)
      buttonRef.current?.focus()
      return
    }
    const items = [
      ...event.currentTarget.querySelectorAll<HTMLElement>(
        '[role="menuitemradio"], [role="menuitem"]',
      ),
    ]
    const next = nextMenuIndex(
      event.key,
      items.indexOf(document.activeElement as HTMLElement),
      items.length,
    )
    if (next === null) return
    event.preventDefault()
    items[next].focus()
  }

  return (
    <div className="settings">
      <button
        ref={buttonRef}
        type="button"
        className="tool-button"
        aria-label="Settings"
        title="Settings"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Gear size={22} />
      </button>
      {open && (
        <div
          ref={menuRef}
          className="menu settings-menu"
          role="menu"
          aria-label="Settings"
          onKeyDown={onKeyDown}
        >
          <ThemeOptions choice={choice} onChoose={setChoice} />
          <div className="menu-separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              setShortcutsOpen(true)
            }}
          >
            Keyboard shortcuts
          </button>
        </div>
      )}
      <ShortcutsDialog
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
    </div>
  )
}
