import rough from 'roughjs'
import { useEffect, useRef, type PointerEvent } from 'react'
import type { Point } from '../core/document/types.ts'
import type { Editor, EditorState } from '../core/editor/editor.ts'
import { wheelZoomFactor } from '../core/geometry/viewport.ts'
import { canvasSize, renderScene, type Surface } from '../core/render/render.ts'

/** `WheelEvent.deltaMode` 1 counts lines (some mice); convert to pixels. */
const LINE_HEIGHT = 16

/**
 * Safari's non-standard pinch event: it sends these instead of Ctrl+wheel.
 * `scale` is relative to the gesture's start.
 */
interface GestureEvent extends UIEvent {
  scale: number
  clientX: number
  clientY: number
}

function cursorFor({ panning, tool, spaceHeld }: EditorState) {
  if (panning) return 'grabbing'
  if (tool === 'hand' || spaceHeld) return 'grab'
  return 'crosshair'
}

/** Typing in a field must not trigger canvas shortcuts. */
function isEditable(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA')
  )
}

/**
 * The full-window drawing surface. It renders straight from the editor store
 * (ADR 0021), so drawing never re-renders React.
 */
export function Canvas({ editor }: { editor: Editor }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    const rc = rough.canvas(canvas)
    let surface: Surface = { width: 0, height: 0, dpr: 1 }
    let frame = 0

    function draw() {
      frame = 0
      const state = editor.store.getState()
      const { document, draft } = state
      const elements = draft ? [...document.elements, draft] : document.elements
      renderScene(ctx, rc, elements, surface, state.viewport)
      canvas.style.cursor = cursorFor(state)
    }

    // Many store updates per frame (fast pointer moves) become one redraw.
    function scheduleDraw() {
      if (!frame) frame = requestAnimationFrame(draw)
    }

    function resize() {
      surface = {
        width: window.innerWidth,
        height: window.innerHeight,
        dpr: window.devicePixelRatio || 1,
      }
      const size = canvasSize(surface.width, surface.height, surface.dpr)
      canvas.width = size.width
      canvas.height = size.height
      canvas.style.width = `${surface.width}px`
      canvas.style.height = `${surface.height}px`
      // Resizing clears the canvas, so redraw now rather than next frame.
      draw()
    }

    // A pixel-ratio change (moving to another monitor, browser zoom) does not
    // always fire `resize`; this query fires once the ratio stops matching.
    let dprQuery: MediaQueryList | null = null
    function watchPixelRatio() {
      dprQuery?.removeEventListener('change', onPixelRatioChange)
      dprQuery = window.matchMedia(`(resolution: ${surface.dpr}dppx)`)
      dprQuery.addEventListener('change', onPixelRatioChange)
    }
    function onPixelRatioChange() {
      resize()
      watchPixelRatio()
    }

    function toCanvasPoint(clientX: number, clientY: number): Point {
      const rect = canvas.getBoundingClientRect()
      return [clientX - rect.left, clientY - rect.top]
    }

    function onKey(event: KeyboardEvent) {
      const down = event.type === 'keydown'
      if (event.key === 'Shift') {
        editor.setShift(down)
        return
      }
      if (isEditable(event.target)) return
      if (event.key === ' ') {
        // Stops page scroll and a focused button "clicking" on Space.
        event.preventDefault()
        if (!event.repeat) editor.setSpaceHeld(down)
        return
      }
      if (!down) return
      const mod = event.ctrlKey || event.metaKey
      if (event.key === 'Escape') {
        editor.cancel()
      } else if (mod && event.key === '0') {
        // Replaces the browser's own "reset page zoom".
        event.preventDefault()
        editor.setZoom(1, [surface.width / 2, surface.height / 2])
      } else if (!mod && !event.altKey && !editor.store.getState().panning) {
        const key = event.key.toLowerCase()
        if (key === 'h') editor.setTool('hand')
        else if (key === 'r') editor.setTool('rectangle')
      }
    }

    // A keyup that happens while the window is unfocused never arrives.
    function onBlur() {
      editor.setSpaceHeld(false)
      editor.setShift(false)
    }

    function onWheel(event: WheelEvent) {
      // Without this the browser zooms the page (Ctrl) or swipes back.
      event.preventDefault()
      const unit = event.deltaMode === 1 ? LINE_HEIGHT : 1
      const dx = event.deltaX * unit
      const dy = event.deltaY * unit
      if (event.ctrlKey || event.metaKey) {
        // Trackpad pinch arrives here too, as a wheel with ctrlKey set.
        editor.zoomAt(
          toCanvasPoint(event.clientX, event.clientY),
          wheelZoomFactor(dy),
        )
      } else {
        editor.panBy(-dx, -dy)
      }
    }

    // Safari pinch: apply the change in scale since the last gesture event.
    let gestureScale = 1
    function onGestureStart(event: Event) {
      event.preventDefault()
      gestureScale = 1
    }
    function onGestureChange(event: Event) {
      event.preventDefault()
      const gesture = event as GestureEvent
      editor.zoomAt(
        toCanvasPoint(gesture.clientX, gesture.clientY),
        gesture.scale / gestureScale,
      )
      gestureScale = gesture.scale
    }

    resize()
    watchPixelRatio()
    const unsubscribe = editor.store.subscribe(scheduleDraw)
    window.addEventListener('resize', resize)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    window.addEventListener('blur', onBlur)
    // React's onWheel is passive and cannot preventDefault, hence addEventListener.
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('gesturestart', onGestureStart)
    canvas.addEventListener('gesturechange', onGestureChange)

    return () => {
      unsubscribe()
      cancelAnimationFrame(frame)
      dprQuery?.removeEventListener('change', onPixelRatioChange)
      window.removeEventListener('resize', resize)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      window.removeEventListener('blur', onBlur)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('gesturestart', onGestureStart)
      canvas.removeEventListener('gesturechange', onGestureChange)
    }
  }, [editor])

  function toPoint(event: PointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect()
    return [event.clientX - rect.left, event.clientY - rect.top]
  }

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    // Middle-click would otherwise start the browser's autoscroll.
    if (event.button === 1) event.preventDefault()
    // Keep receiving moves when the pointer leaves the canvas mid-drag.
    event.currentTarget.setPointerCapture(event.pointerId)
    // The editor decides what the button does (draw, pan or nothing).
    editor.pointerDown(event.pointerId, toPoint(event), {
      button: event.button,
      shift: event.shiftKey,
    })
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    editor.pointerMove(event.pointerId, toPoint(event), event.shiftKey)
  }

  return (
    <canvas
      ref={ref}
      className="canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => editor.pointerUp(event.pointerId)}
      onPointerCancel={(event) => editor.pointerCancel(event.pointerId)}
    />
  )
}
