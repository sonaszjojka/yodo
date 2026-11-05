import { describe, expect, test, vi } from 'vitest'
import { createThemeStore, resolveTheme } from './themeStore.ts'

function fakeQuery(matches = false) {
  const listeners = new Set<() => void>()
  return {
    matches,
    addEventListener: (_: 'change', fn: () => void) => void listeners.add(fn),
    removeEventListener: (_: 'change', fn: () => void) =>
      void listeners.delete(fn),
    /** Like the OS switching theme. */
    flip(next: boolean) {
      this.matches = next
      listeners.forEach((fn) => fn())
    },
    listeners,
  }
}

function fakeRoot() {
  const attrs = new Map<string, string>()
  return {
    setAttribute: (name: string, value: string) => void attrs.set(name, value),
    removeAttribute: (name: string) => void attrs.delete(name),
    attrs,
  }
}

describe('resolveTheme', () => {
  test.each([
    ['system', false, 'light'],
    ['system', true, 'dark'],
    ['light', true, 'light'],
    ['dark', false, 'dark'],
  ] as const)(
    '%s with prefersDark=%s is %s',
    (choice, prefersDark, expected) => {
      expect(resolveTheme(choice, prefersDark)).toBe(expected)
    },
  )
})

describe('theme store', () => {
  test('applies the initial choice to the root', () => {
    const root = fakeRoot()
    createThemeStore({
      initial: 'dark',
      query: fakeQuery(),
      root,
      save: vi.fn(),
    })
    expect(root.attrs.get('data-theme')).toBe('dark')
  })

  test('system leaves the root to the stylesheet', () => {
    const root = fakeRoot()
    const store = createThemeStore({
      initial: 'dark',
      query: fakeQuery(),
      root,
      save: vi.fn(),
    })
    store.setChoice('system')
    expect(root.attrs.has('data-theme')).toBe(false)
  })

  test('setChoice applies, saves and notifies', () => {
    const root = fakeRoot()
    const save = vi.fn()
    const store = createThemeStore({
      initial: 'system',
      query: fakeQuery(),
      root,
      save,
    })
    const listener = vi.fn()
    store.subscribe(listener)
    store.setChoice('light')
    expect(root.attrs.get('data-theme')).toBe('light')
    expect(save).toHaveBeenCalledWith('light')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.getChoice()).toBe('light')
    expect(store.getTheme()).toBe('light')
  })

  test('with system, an OS change reaches subscribers and the resolved theme', () => {
    const query = fakeQuery(false)
    const store = createThemeStore({
      initial: 'system',
      query,
      root: fakeRoot(),
      save: vi.fn(),
    })
    const listener = vi.fn()
    store.subscribe(listener)
    expect(store.getTheme()).toBe('light')
    query.flip(true)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.getTheme()).toBe('dark')
  })

  test('an explicit choice ignores the OS', () => {
    const query = fakeQuery(false)
    const store = createThemeStore({
      initial: 'light',
      query,
      root: fakeRoot(),
      save: vi.fn(),
    })
    query.flip(true)
    expect(store.getTheme()).toBe('light')
  })

  test('watches the OS only while someone subscribes', () => {
    const query = fakeQuery()
    const store = createThemeStore({
      initial: 'system',
      query,
      root: fakeRoot(),
      save: vi.fn(),
    })
    expect(query.listeners.size).toBe(0)
    const stop = store.subscribe(() => {})
    expect(query.listeners.size).toBe(1)
    stop()
    expect(query.listeners.size).toBe(0)
  })

  test('works without a window (tests, static rendering)', () => {
    const store = createThemeStore({
      initial: 'system',
      query: null,
      root: null,
      save: vi.fn(),
    })
    expect(store.getTheme()).toBe('light')
    expect(() => store.setChoice('dark')).not.toThrow()
    expect(store.getTheme()).toBe('dark')
  })
})
