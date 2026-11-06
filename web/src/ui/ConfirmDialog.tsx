import { ModalDialog } from './ModalDialog.tsx'

/**
 * A modal that asks before something that can't be undone. Cancel has the
 * focus, so Enter never confirms by accident. Styled like the folder dialogs.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  onConfirm(): void
  onClose(): void
}) {
  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      labelledBy="confirm-dialog-title"
      className="folder-dialog"
    >
      <div className="folder-form">
        <h2 id="confirm-dialog-title">{title}</h2>
        <p>{message}</p>
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
            {confirmLabel}
          </button>
        </div>
      </div>
    </ModalDialog>
  )
}
