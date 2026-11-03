import type { SaveStatus as Status } from '../storage/autosave.ts'
import type { Store } from '../core/store/store.ts'
import { useStore } from './useStore.ts'

const LABELS: Record<Status, string> = {
  saved: 'Saved',
  unsaved: 'Unsaved changes',
  saving: 'Saving…',
  error: "Couldn't save",
}

const identity = (status: Status) => status

/** The save status part of the editor's bottom bar (docs/ui.md, ADR 0032). */
export function SaveStatus({ status }: { status: Store<Status> }) {
  const value = useStore(status, identity)
  return (
    // role="status" makes screen readers announce changes politely.
    <div role="status" className={`save-status save-status-${value}`}>
      {LABELS[value]}
    </div>
  )
}
