import { useSyncExternalStore } from 'react'
import type { Size } from './barPosition.ts'

// The window size as an external store: re-renders on resize, and has a
// fixed size when rendering without a window (tests).
let windowSize: Size = { width: 1024, height: 768 }
function readWindowSize(): Size {
  const { innerWidth: width, innerHeight: height } = window
  if (width !== windowSize.width || height !== windowSize.height) {
    windowSize = { width, height }
  }
  return windowSize
}
function subscribeResize(listener: () => void) {
  window.addEventListener('resize', listener)
  return () => window.removeEventListener('resize', listener)
}

/** The window's inner size in CSS px, for placing floating UI. */
export function useWindowSize() {
  return useSyncExternalStore(subscribeResize, readWindowSize, () => windowSize)
}
