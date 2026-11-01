// A minimal external store (ADR 0021). React reads it with
// useSyncExternalStore; the canvas and, later, undo/redo and auto-save
// subscribe to it directly. State is immutable: always pass a new object.

export type Listener = () => void

export interface Store<T> {
  getState(): T
  setState(next: T | ((prev: T) => T)): void
  /** Returns an unsubscribe function. */
  subscribe(listener: Listener): () => void
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial
  const listeners = new Set<Listener>()

  return {
    getState: () => state,
    setState(next) {
      const value =
        typeof next === 'function' ? (next as (prev: T) => T)(state) : next
      // Same reference means nothing changed: skip the notification.
      if (Object.is(value, state)) return
      state = value
      for (const listener of listeners) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
