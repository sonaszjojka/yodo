import { useSyncExternalStore } from 'react'
import { loadTheme, saveTheme } from '../storage/preferences.ts'
import { createThemeStore, type ThemeStore } from './themeStore.ts'

let store: ThemeStore | undefined

/**
 * The one theme store of the page, created on first use. `main.tsx` calls it
 * before the first render so the stored choice is on `<html>` right away.
 */
export function getThemeStore(): ThemeStore {
  store ??= createThemeStore({
    initial: loadTheme(),
    query:
      typeof window === 'undefined'
        ? null
        : window.matchMedia('(prefers-color-scheme: dark)'),
    root: typeof document === 'undefined' ? null : document.documentElement,
    save: saveTheme,
  })
  return store
}

/** The theme choice, the theme it resolves to, and the setter. */
export function useTheme() {
  const themeStore = getThemeStore()
  const choice = useSyncExternalStore(
    themeStore.subscribe,
    themeStore.getChoice,
    themeStore.getChoice,
  )
  const theme = useSyncExternalStore(
    themeStore.subscribe,
    themeStore.getTheme,
    themeStore.getTheme,
  )
  return { choice, theme, setChoice: themeStore.setChoice }
}
