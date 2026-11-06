import { DotsThree, Plus, Trash } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { sortFolders, type Folder } from '../storage/folders.ts'
import {
  DeleteFolderDialog,
  FolderDialog,
  type FolderValues,
} from './FolderDialog.tsx'
import { FolderGlyph } from './FolderGlyph.tsx'
import { Logo } from './Logo.tsx'
import { isOutside } from './outsidePress.ts'
import { routeHash } from './route.ts'

export interface SidebarProps {
  folders: readonly Folder[]
  /** Drawings per folder; a folder with none is absent. */
  counts: ReadonlyMap<string, number>
  /** All drawings in the list, shown next to "All drawings". */
  total?: number
  /** The folder being viewed; undefined means All drawings. */
  selectedId?: string
  /** Drawings in Trash, shown next to "Trash"; the link is always there. */
  trashCount?: number
  /** Trash is the screen being viewed (ADR 0046). */
  trashSelected?: boolean
  onSaveFolder(values: FolderValues, existing?: Folder): void
  onDeleteFolder(folder: Folder): void
}

type DialogState =
  | { kind: 'create' }
  | { kind: 'edit'; folder: Folder }
  | { kind: 'delete'; folder: Folder }

/** Home's left sidebar (docs/ui.md, Home): logo, All drawings and the folder list. */
export function Sidebar({
  folders,
  counts,
  total,
  selectedId,
  trashCount,
  trashSelected = false,
  onSaveFolder,
  onDeleteFolder,
}: SidebarProps) {
  const [dialog, setDialog] = useState<DialogState>()
  const [open, setOpen] = useState(false)
  const show = (next: DialogState) => {
    setDialog(next)
    setOpen(true)
  }
  // Closing keeps `dialog`, so a closing dialog still has its folder to show.
  const close = () => setOpen(false)
  const editing = dialog?.kind === 'edit' ? dialog.folder : undefined
  const deleting = dialog?.kind === 'delete' ? dialog.folder : undefined

  return (
    <aside className="sidebar">
      <a className="sidebar-logo" href="#/" aria-label="Yodo, all drawings">
        <Logo />
      </a>
      <nav aria-label="Drawings">
        <a
          className="sidebar-link"
          href="#/"
          aria-current={
            selectedId === undefined && !trashSelected ? 'page' : undefined
          }
        >
          <span className="sidebar-link-name">All drawings</span>
          {total !== undefined && (
            <span className="sidebar-count">{total}</span>
          )}
        </a>
        <div className="sidebar-heading">
          <h2>Folders</h2>
          <button
            type="button"
            className="sidebar-add"
            aria-label="New folder"
            title="New folder"
            onClick={() => show({ kind: 'create' })}
          >
            <Plus size={18} weight="bold" />
          </button>
        </div>
        <ul className="folder-list">
          {sortFolders(folders).map((folder) => (
            <FolderRow
              key={folder.id}
              folder={folder}
              count={counts.get(folder.id) ?? 0}
              selected={folder.id === selectedId}
              onEdit={() => show({ kind: 'edit', folder })}
              onDelete={() => show({ kind: 'delete', folder })}
            />
          ))}
        </ul>
        {folders.length === 0 && (
          <p className="sidebar-empty">No folders yet.</p>
        )}
        <a
          className="sidebar-link sidebar-trash"
          href={routeHash({ name: 'trash' })}
          aria-current={trashSelected ? 'page' : undefined}
        >
          <Trash size={18} />
          <span className="sidebar-link-name">Trash</span>
          {trashCount !== undefined && (
            <span className="sidebar-count">{trashCount}</span>
          )}
        </a>
      </nav>
      <FolderDialog
        open={open && dialog?.kind !== 'delete'}
        folder={editing}
        onSave={(values) => onSaveFolder(values, editing)}
        onClose={close}
      />
      <DeleteFolderDialog
        open={open && dialog?.kind === 'delete'}
        folder={deleting}
        count={deleting ? (counts.get(deleting.id) ?? 0) : 0}
        onConfirm={() => deleting && onDeleteFolder(deleting)}
        onClose={close}
      />
    </aside>
  )
}

function FolderRow({
  folder,
  count,
  selected,
  onEdit,
  onDelete,
}: {
  folder: Folder
  count: number
  selected: boolean
  onEdit(): void
  onDelete(): void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const menu = menuRef.current!
    menu.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const onPointerDown = (event: PointerEvent) => {
      if (isOutside(event.target, menu, moreRef.current)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menuOpen])

  return (
    <li className="folder-row">
      <a
        className="sidebar-link"
        href={routeHash({ name: 'home', folderId: folder.id })}
        aria-current={selected ? 'page' : undefined}
      >
        <FolderGlyph icon={folder.icon} color={folder.color} />
        <span className="sidebar-link-name">{folder.name}</span>
        <span className="sidebar-count">{count}</span>
      </a>
      <button
        ref={moreRef}
        type="button"
        className="folder-more"
        aria-label={`More actions for folder ${folder.name}`}
        title="More actions"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <DotsThree size={18} weight="bold" />
      </button>
      {menuOpen && (
        <div
          ref={menuRef}
          className="menu folder-menu"
          role="menu"
          aria-label={`Actions for folder ${folder.name}`}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setMenuOpen(false)
              moreRef.current?.focus()
            }
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false)
              onEdit()
            }}
          >
            Edit folder
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-danger"
            onClick={() => {
              setMenuOpen(false)
              onDelete()
            }}
          >
            Delete folder
          </button>
        </div>
      )}
    </li>
  )
}
