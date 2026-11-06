import { Check, DotsThree } from '@phosphor-icons/react'
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import type {
  DrawingRepository,
  DrawingSummary,
} from '../storage/repository.ts'
import { sortFolders, type Folder } from '../storage/folders.ts'
import { FolderGlyph } from './FolderGlyph.tsx'
import { formatEdited } from './formatEdited.ts'
import { isOutside } from './outsidePress.ts'
import { navigate, routeHash } from './route.ts'
import type { ImageCache } from './imageCache.ts'
import { Thumbnail } from './Thumbnail.tsx'

export interface DrawingCardProps {
  summary: DrawingSummary
  repository: DrawingRepository
  imageCache: ImageCache
  /** Epoch milliseconds, for "Edited 5 min ago". */
  now: number
  /** Every folder, for Move to folder and the folder shown on the card. */
  folders: readonly Folder[]
  /** Show the drawing's folder on the card (in All drawings, not inside a folder). */
  showFolder: boolean
  onRename(name: string): void
  onMove(folderId: string | null): void
}

/**
 * One drawing on Home (`docs/ui.md`, Drawing card). The ⋯ button and a
 * right-click open the same menu; Open, Rename and Move to folder exist so far.
 */
export function DrawingCard({
  summary,
  repository,
  imageCache,
  now,
  folders,
  showFolder,
  onRename,
  onMove,
}: DrawingCardProps) {
  const { id, name, updatedAt, folderId } = summary
  const folder = folders.find((f) => f.id === folderId)
  const [menuOpen, setMenuOpen] = useState(false)
  // The menu has a second page that lists the folders (Move to folder).
  const [movePage, setMovePage] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const route = { name: 'drawing', id } as const

  useEffect(() => {
    if (!menuOpen) return
    const menu = menuRef.current!
    // Runs again on the move page, so focus follows the page change.
    menu
      .querySelector<HTMLElement>('[role="menuitem"], [role="menuitemradio"]')
      ?.focus()
    // Any press outside the menu and its ⋯ toggle closes it.
    const onPointerDown = (event: PointerEvent) => {
      if (isOutside(event.target, menu, moreRef.current)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menuOpen, movePage])

  const thumbnail = (
    <Thumbnail
      repository={repository}
      imageCache={imageCache}
      id={id}
      updatedAt={updatedAt}
    />
  )
  const edited = (
    <span className="drawing-card-edited">
      {showFolder && folder && (
        <span className="drawing-card-folder">
          <FolderGlyph icon={folder.icon} color={folder.color} size={14} />
          {folder.name}
        </span>
      )}
      {showFolder && folder && ' · '}
      {formatEdited(updatedAt, now)}
    </span>
  )
  const closeMenu = () => {
    setMenuOpen(false)
    setMovePage(false)
  }

  return (
    <li
      className="drawing-card"
      onContextMenu={(event) => {
        event.preventDefault()
        setMovePage(false)
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
        onClick={() => {
          setMovePage(false)
          setMenuOpen((open) => !open)
        }}
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
          {movePage ? (
            <>
              <div className="menu-heading" aria-hidden="true">
                Move to folder
              </div>
              <div role="group" aria-label="Folders" className="menu-scroll">
                <MoveItem
                  label="No folder"
                  checked={folderId === undefined}
                  onChoose={() => {
                    closeMenu()
                    onMove(null)
                  }}
                />
                {sortFolders(folders).map((f) => (
                  <MoveItem
                    key={f.id}
                    label={f.name}
                    glyph={
                      <FolderGlyph icon={f.icon} color={f.color} size={16} />
                    }
                    checked={f.id === folderId}
                    onChoose={() => {
                      closeMenu()
                      onMove(f.id)
                    }}
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => navigate(route)}
              >
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
              <button
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                onClick={() => setMovePage(true)}
              >
                Move to folder…
              </button>
            </>
          )}
        </div>
      )}
    </li>
  )
}

function MoveItem({
  label,
  glyph,
  checked,
  onChoose,
}: {
  label: string
  glyph?: ReactNode
  checked: boolean
  onChoose(): void
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      className="menu-folder-item"
      onClick={onChoose}
    >
      {glyph}
      <span className="menu-folder-name">{label}</span>
      {checked && <Check size={16} aria-hidden="true" />}
    </button>
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
