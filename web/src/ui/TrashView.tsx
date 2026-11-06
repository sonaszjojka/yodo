import { ArrowCounterClockwise, Trash } from '@phosphor-icons/react'
import { useState } from 'react'
import type { DrawingSummary } from '../storage/repository.ts'
import { ConfirmDialog } from './ConfirmDialog.tsx'
import { formatEdited } from './formatEdited.ts'
import {
  deleteForeverMessage,
  emptyTrashMessage,
  sortTrash,
  trashCountText,
  TRASH_RULE_TEXT,
} from './trashView.ts'

export interface TrashViewProps {
  trashed: readonly DrawingSummary[]
  /** Epoch milliseconds, for "Deleted 5 min ago". */
  now: number
  onRestore(id: string): void
  onDeleteForever(id: string): void
  onEmptyTrash(): void
}

type Confirming = { kind: 'empty' } | { kind: 'one'; drawing: DrawingSummary }

/**
 * The Trash screen (`docs/ui.md`, Trash): a bar with the count and Empty
 * trash, then a row per drawing with Restore and Delete forever. Both ways of
 * deleting for good ask first.
 */
export function TrashView({
  trashed,
  now,
  onRestore,
  onDeleteForever,
  onEmptyTrash,
}: TrashViewProps) {
  const [confirming, setConfirming] = useState<Confirming>()
  const [open, setOpen] = useState(false)
  const ask = (next: Confirming) => {
    setConfirming(next)
    setOpen(true)
  }
  // Closing keeps `confirming`, so a closing dialog still has its text.
  const close = () => setOpen(false)
  const one = confirming?.kind === 'one' ? confirming.drawing : undefined

  return (
    <section className="trash" aria-label="Trash">
      <div className="trash-bar">
        <span className="trash-count">{trashCountText(trashed.length)}</span>
        <span className="trash-rule">{TRASH_RULE_TEXT}</span>
        <button
          type="button"
          className="button"
          disabled={trashed.length === 0}
          onClick={() => ask({ kind: 'empty' })}
        >
          Empty trash
        </button>
      </div>
      {trashed.length > 0 && (
        <ul className="trash-list">
          {sortTrash(trashed).map((drawing) => (
            <li
              key={drawing.id}
              className="trash-row"
              data-drawing-id={drawing.id}
            >
              <span className="trash-name">{drawing.name}</span>
              <span className="trash-when">
                {formatEdited(
                  drawing.deletedAt ?? drawing.updatedAt,
                  now,
                  undefined,
                  'Deleted',
                )}
              </span>
              <button
                type="button"
                className="button"
                aria-label={`Restore ${drawing.name}`}
                onClick={() => onRestore(drawing.id)}
              >
                <ArrowCounterClockwise size={16} />
                Restore
              </button>
              <button
                type="button"
                className="trash-forever"
                aria-label={`Delete ${drawing.name} forever`}
                title="Delete forever"
                onClick={() => ask({ kind: 'one', drawing })}
              >
                <Trash size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={open && confirming?.kind === 'empty'}
        title="Empty trash"
        message={emptyTrashMessage(trashed.length)}
        confirmLabel="Empty trash"
        onConfirm={onEmptyTrash}
        onClose={close}
      />
      <ConfirmDialog
        open={open && one !== undefined}
        title="Delete forever"
        message={deleteForeverMessage(one?.name ?? '')}
        confirmLabel="Delete forever"
        onConfirm={() => one && onDeleteForever(one.id)}
        onClose={close}
      />
    </section>
  )
}
