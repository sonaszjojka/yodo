import { useState } from 'react'
import {
  cleanFolderName,
  DEFAULT_FOLDER_COLOR,
  DEFAULT_FOLDER_ICON,
  FOLDER_COLORS,
  FOLDER_ICONS,
  MAX_FOLDER_NAME_LENGTH,
  type Folder,
} from '../storage/folders.ts'
import { FolderGlyph } from './FolderGlyph.tsx'
import { FOLDER_COLOR_VALUES, folderCssColor } from './folderStyle.ts'
import { deleteFolderMessage } from './homeFolders.ts'
import { ModalDialog } from './ModalDialog.tsx'

/** What the person chose; the name is already trimmed and not empty. */
export interface FolderValues {
  name: string
  icon: string
  color: string
}

function iconLabel(key: string): string {
  return key.replace('-', ' ')
}

function FolderForm({
  folder,
  onSave,
  onClose,
}: {
  folder?: Folder
  onSave(values: FolderValues): void
  onClose(): void
}) {
  const [name, setName] = useState(folder?.name ?? '')
  const [icon, setIcon] = useState(folder?.icon ?? DEFAULT_FOLDER_ICON)
  const [color, setColor] = useState(folder?.color ?? DEFAULT_FOLDER_COLOR)
  const clean = cleanFolderName(name)

  return (
    <form
      className="folder-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (!clean) return
        onSave({ name: clean, icon, color })
        onClose()
      }}
    >
      <h2 id="folder-dialog-title">{folder ? 'Edit folder' : 'New folder'}</h2>
      <label className="folder-name-field">
        Name
        <input
          type="text"
          value={name}
          maxLength={MAX_FOLDER_NAME_LENGTH}
          autoFocus
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <fieldset>
        <legend>Icon</legend>
        <div className="folder-choices">
          {FOLDER_ICONS.map((key) => (
            <label key={key} className="folder-choice" title={iconLabel(key)}>
              <input
                type="radio"
                name="folder-icon"
                value={key}
                aria-label={iconLabel(key)}
                checked={icon === key}
                onChange={() => setIcon(key)}
              />
              <FolderGlyph icon={key} color={color} size={22} />
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Colour</legend>
        <div className="folder-choices">
          {FOLDER_COLORS.map((key) => (
            <label
              key={key}
              className="folder-choice folder-swatch"
              title={FOLDER_COLOR_VALUES[key].label}
            >
              <input
                type="radio"
                name="folder-color"
                value={key}
                aria-label={FOLDER_COLOR_VALUES[key].label}
                checked={color === key}
                onChange={() => setColor(key)}
              />
              <span style={{ background: folderCssColor(key) }} />
            </label>
          ))}
        </div>
      </fieldset>
      <div className="folder-dialog-actions">
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="button-primary" disabled={!clean}>
          {folder ? 'Save' : 'Create folder'}
        </button>
      </div>
    </form>
  )
}

/** Creates a folder, or edits `folder`'s name, icon and colour (docs/ui.md, Folder icons). */
export function FolderDialog({
  open,
  folder,
  onSave,
  onClose,
}: {
  open: boolean
  folder?: Folder
  onSave(values: FolderValues): void
  onClose(): void
}) {
  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      labelledBy="folder-dialog-title"
      className="folder-dialog"
    >
      <FolderForm folder={folder} onSave={onSave} onClose={onClose} />
    </ModalDialog>
  )
}

/** Asks before deleting a folder, which deletes its drawings too (ADR 0045). */
export function DeleteFolderDialog({
  open,
  folder,
  count,
  onConfirm,
  onClose,
}: {
  open: boolean
  folder?: Folder
  count: number
  onConfirm(): void
  onClose(): void
}) {
  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      labelledBy="delete-folder-title"
      className="folder-dialog"
    >
      <div className="folder-form">
        <h2 id="delete-folder-title">Delete folder</h2>
        <p>{deleteFolderMessage(folder?.name ?? '', count)}</p>
        <div className="folder-dialog-actions">
          <button type="button" className="button" onClick={onClose} autoFocus>
            Cancel
          </button>
          <button
            type="button"
            className="button-danger"
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            Delete folder
          </button>
        </div>
      </div>
    </ModalDialog>
  )
}
