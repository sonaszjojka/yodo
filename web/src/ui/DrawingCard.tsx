import { DotsThree } from '@phosphor-icons/react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type {
  DrawingRepository,
  DrawingSummary,
} from '../storage/repository.ts'
import { formatEdited } from './formatEdited.ts'
import { isOutside } from './outsidePress.ts'
import { navigate, routeHash } from './route.ts'
import { Thumbnail } from './Thumbnail.tsx'

export interface DrawingCardProps {
  summary: DrawingSummary
  repository: DrawingRepository
  /** Epoch milliseconds, for "Edited 5 min ago". */
  now: number
  onRename(name: string): void
}

/**
 * One drawing on Home (`docs/ui.md`, Drawing card). The ⋯ button and a
 * right-click open the same menu; only Open and Rename exist so far.
 */
export function DrawingCard({
  summary,
  repository,
  now,
  onRename,
}: DrawingCardProps) {
  const { id, name, updatedAt } = summary
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const route = { name: 'drawing', id } as const

  useEffect(() => {
    if (!menuOpen) return
    const menu = menuRef.current!
    menu.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    // Any press outside the menu and its ⋯ toggle closes it.
    const onPointerDown = (event: PointerEvent) => {
      if (isOutside(event.target, menu, moreRef.current)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menuOpen])

  const thumbnail = (
    <Thumbnail repository={repository} id={id} updatedAt={updatedAt} />
  )
  const edited = (
    <span className="drawing-card-edited">{formatEdited(updatedAt, now)}</span>
  )

  return (
    <li
      className="drawing-card"
      onContextMenu={(event) => {
        event.preventDefault()
        setMenuOpen(true)
      }}
    >
      {renaming ? (
        <div className="drawing-card-body">
          {thumbnail}
          <RenameInput
            name={name}
            onDone={(next) => {
              setRenaming(false)
              if (next !== undefined) onRename(next)
            }}
          />
          {edited}
        </div>
      ) : (
        <a className="drawing-card-body" href={routeHash(route)}>
          {thumbnail}
          <span className="drawing-card-name">{name}</span>
          {edited}
        </a>
      )}
      <button
        ref={moreRef}
        type="button"
        className="drawing-card-more"
        aria-label={`More actions for ${name}`}
        title="More actions"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <DotsThree size={20} weight="bold" />
      </button>
      {menuOpen && (
        <div
          ref={menuRef}
          className="menu"
          role="menu"
          aria-label={`Actions for ${name}`}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setMenuOpen(false)
          }}
        >
          <button type="button" role="menuitem" onClick={() => navigate(route)}>
            Open
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false)
              setRenaming(true)
            }}
          >
            Rename
          </button>
        </div>
      )}
    </li>
  )
}

/**
 * The name, editable in place. Enter or leaving the field commits, Escape
 * cancels; `onDone` gets undefined when nothing should change.
 */
function RenameInput({
  name,
  onDone,
}: {
  name: string
  onDone(name: string | undefined): void
}) {
  // Enter commits and unmounts the input, which then also fires blur.
  const done = useRef(false)
  function finish(value: string | undefined) {
    if (done.current) return
    done.current = true
    const trimmed = value?.trim()
    onDone(trimmed && trimmed !== name ? trimmed : undefined)
  }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') finish(event.currentTarget.value)
    if (event.key === 'Escape') finish(undefined)
  }

  return (
    <input
      className="drawing-card-rename"
      aria-label="Drawing name"
      defaultValue={name}
      autoFocus
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={onKeyDown}
      onBlur={(event) => finish(event.currentTarget.value)}
    />
  )
}
