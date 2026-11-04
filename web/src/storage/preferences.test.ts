import { describe, expect, test } from 'vitest'
import { BUILT_IN_STYLE } from '../core/document/create.ts'
import {
  loadPanelLayout,
  loadStyleDefaults,
  PANEL_LAYOUT_KEY,
  savePanelLayout,
  saveStyleDefaults,
  STYLE_DEFAULTS_KEY,
  type PanelLayout,
} from './preferences.ts'

/** An in-memory `Storage` for the parts the preferences use. */
function fakeStorage(entries: Record<string, string> = {}) {
  const data = new Map(Object.entries(entries))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  }
}

/** A storage where every access throws, like blocked site data. */
const blocked = {
  getItem(): string | null {
    throw new DOMException('denied', 'SecurityError')
  },
  setItem(): void {
    throw new DOMException('full', 'QuotaExceededError')
  },
}

describe('style defaults', () => {
  test('nothing stored gives the built-in style', () => {
    expect(loadStyleDefaults(fakeStorage())).toEqual(BUILT_IN_STYLE)
  })

  test('round-trips through storage', () => {
    const storage = fakeStorage()
    const defaults = {
      ...BUILT_IN_STYLE,
      strokeColor: '#C2453D',
      fillStyle: 'solid' as const,
      strokeStyle: 'dotted' as const,
      opacity: 40,
      roundness: 'round' as const,
      fontFamily: 'mono' as const,
      fontSize: 13,
      textAlign: 'right' as const,
    }
    saveStyleDefaults(defaults, storage)
    expect(storage.data.has(STYLE_DEFAULTS_KEY)).toBe(true)
    expect(loadStyleDefaults(storage)).toEqual(defaults)
  })

  test('invalid JSON or a non-object gives the built-in style', () => {
    for (const raw of ['{oops', 'null', '[1]', '"x"']) {
      expect(
        loadStyleDefaults(fakeStorage({ [STYLE_DEFAULTS_KEY]: raw })),
      ).toEqual(BUILT_IN_STYLE)
    }
  })

  test('each invalid or missing field falls back on its own', () => {
    const raw = JSON.stringify({
      strokeColor: '#3A6FD8',
      backgroundColor: 42,
      fillStyle: 'zigzag',
      strokeWidth: -1,
      strokeStyle: 'dashed',
      roughness: 'high',
      roundness: 'curvy',
      opacity: 150,
      fontFamily: 'comic',
      fontSize: 0,
      // textAlign missing
      extra: true,
    })
    expect(
      loadStyleDefaults(fakeStorage({ [STYLE_DEFAULTS_KEY]: raw })),
    ).toEqual({
      ...BUILT_IN_STYLE,
      strokeColor: '#3A6FD8',
      strokeStyle: 'dashed',
    })
  })

  test('defaults stored before corners existed get sharp corners', () => {
    const { roundness: _, ...before } = BUILT_IN_STYLE
    const raw = JSON.stringify({ ...before, strokeColor: '#3A6FD8' })
    expect(
      loadStyleDefaults(fakeStorage({ [STYLE_DEFAULTS_KEY]: raw })),
    ).toEqual({ ...BUILT_IN_STYLE, strokeColor: '#3A6FD8', roundness: 'sharp' })
  })

  test('blocked storage loads the built-in style and saving does not throw', () => {
    expect(loadStyleDefaults(blocked)).toEqual(BUILT_IN_STYLE)
    expect(() => saveStyleDefaults(BUILT_IN_STYLE, blocked)).not.toThrow()
  })
})

describe('panel layout', () => {
  const layout: PanelLayout = {
    open: true,
    place: { x: 100, y: 120, width: 300, height: 400 },
  }

  test('nothing stored is closed, in the default place', () => {
    expect(loadPanelLayout(fakeStorage())).toEqual({ open: false, place: null })
  })

  test('round-trips through storage', () => {
    const storage = fakeStorage()
    savePanelLayout(layout, storage)
    expect(storage.data.has(PANEL_LAYOUT_KEY)).toBe(true)
    expect(loadPanelLayout(storage)).toEqual(layout)
    savePanelLayout({ open: false, place: null }, storage)
    expect(loadPanelLayout(storage)).toEqual({ open: false, place: null })
  })

  test('an invalid place is dropped, keeping the open state', () => {
    const raw = JSON.stringify({
      open: true,
      place: { x: 1, y: 'top', width: 300, height: 400 },
    })
    expect(loadPanelLayout(fakeStorage({ [PANEL_LAYOUT_KEY]: raw }))).toEqual({
      open: true,
      place: null,
    })
  })

  test('invalid JSON or blocked storage gives the default', () => {
    expect(loadPanelLayout(fakeStorage({ [PANEL_LAYOUT_KEY]: '{' }))).toEqual({
      open: false,
      place: null,
    })
    expect(loadPanelLayout(blocked)).toEqual({ open: false, place: null })
    expect(() => savePanelLayout(layout, blocked)).not.toThrow()
  })
})
