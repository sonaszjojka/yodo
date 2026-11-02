// Undo/redo as two stacks of immutable snapshots (ADR 0023). Generic, so it
// knows nothing about documents; the editor decides what a step is.
import { createStore, type Store } from '../store/store.ts'

export interface HistoryStatus {
  canUndo: boolean
  canRedo: boolean
}

export interface History<T> {
  /** Records `previous`, the state before a change, and clears redo. */
  record(previous: T): void
  /** The state to go back to from `current`, or null if there is none. */
  undo(current: T): T | null
  /** The state to go forward to from `current`, or null if there is none. */
  redo(current: T): T | null
  /** Whether undo and redo are available, for the UI's buttons. */
  status: Store<HistoryStatus>
}

/** The default number of steps kept; older ones are dropped. */
export const HISTORY_LIMIT = 100

export function createHistory<T>(limit = HISTORY_LIMIT): History<T> {
  const past: T[] = []
  const future: T[] = []
  const status = createStore<HistoryStatus>({ canUndo: false, canRedo: false })

  function update() {
    const canUndo = past.length > 0
    const canRedo = future.length > 0
    status.setState((prev) =>
      prev.canUndo === canUndo && prev.canRedo === canRedo
        ? prev
        : { canUndo, canRedo },
    )
  }

  /** Moves `current` onto `to` and returns the top of `from`. */
  function step(from: T[], to: T[], current: T) {
    const target = from.pop()
    if (target === undefined) return null
    to.push(current)
    update()
    return target
  }

  return {
    record(previous) {
      past.push(previous)
      if (past.length > limit) past.shift()
      future.length = 0
      update()
    },
    undo: (current) => step(past, future, current),
    redo: (current) => step(future, past, current),
    status,
  }
}
