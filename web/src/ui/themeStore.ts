// The theme choice and the theme it resolves to (ADR 0015, 0036). Framework
// free, with the browser pieces passed in, so it runs in tests; useTheme.ts
// wires it to React and the real window.
import type { Theme } from '../core/render/colors.ts'
import type { ThemeChoice } from '../storage/preferences.ts'

/** `system` follows the OS; the other two are the user's explicit choice. */
export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): Theme {
  if (choice === 'system') return prefersDark ? 'dark' : 'light'
  return choice
}

/** The `MediaQueryList` part used here. */
export interface DarkQuery {
  readonly matches: boolean
  addEventListener(type: 'change', listener: () => void): void
  removeEventListener(type: 'change', listener: () => void): void
}

/** The `<html>` element part used here. */
export interface ThemeRoot {
  setAttribute(name: string, value: string): void
  removeAttribute(name: string): void
}

export interface ThemeStoreOptions {
  initial: ThemeChoice
  query: DarkQuery | null
  root: ThemeRoot | null
  save(choice: ThemeChoice): void
}

export interface ThemeStore {
  getChoice(): ThemeChoice
  /** The theme to draw with: the choice, or the OS setting for `system`. */
  getTheme(): Theme
  setChoice(choice: ThemeChoice): void
  subscribe(listener: () => void): () => void
}

export function createThemeStore({
  initial,
  query,
  root,
  save,
}: ThemeStoreOptions): ThemeStore {
  let choice = initial
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((listener) => listener())

  // With `system` the stylesheet follows the OS by itself (color-scheme), so
  // the attribute is only set for an explicit choice.
  function apply() {
    if (choice === 'system') root?.removeAttribute('data-theme')
    else root?.setAttribute('data-theme', choice)
  }
  apply()

  return {
    getChoice: () => choice,
    getTheme: () => resolveTheme(choice, query?.matches ?? false),
    setChoice(next) {
      if (next === choice) return
      choice = next
      apply()
      save(next)
      notify()
    },
    subscribe(listener) {
      // Watch the OS only while someone listens.
      if (listeners.size === 0) query?.addEventListener('change', notify)
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) query?.removeEventListener('change', notify)
      }
    },
  }
}
