import { useCallback, useSyncExternalStore } from 'react'
import type { Store } from '../core/store/store.ts'

/**
 * Reads a slice of a core store and re-renders only when that slice changes
 * (ADR 0021). The selector must return a stable value: a primitive or a
 * reference already in the state, never a new object.
 */
export function useStore<T, S>(store: Store<T>, selector: (state: T) => S): S {
  const getSnapshot = useCallback(
    () => selector(store.getState()),
    [store, selector],
  )
  // The same snapshot on the server, so static rendering (tests) works.
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot)
}
