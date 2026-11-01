import rough from 'roughjs'
import { useEffect, useRef, type PointerEvent } from 'react'
import type { Point } from '../core/document/types.ts'
import type { Editor } from '../core/editor/editor.ts'
import {
  canvasSize,
  renderScene,
  type Viewport,
} from '../core/render/render.ts'

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
    let viewport: Viewport = { width: 0, height: 0, dpr: 1 }
    let frame = 0

    function draw() {
      frame = 0
      const { document, draft } = editor.store.getState()
      const elements = draft ? [...document.elements, draft] : document.elements
      renderScene(ctx, rc, elements, viewport)
    }

    // Many store updates per frame (fast pointer moves) become one redraw.
    function scheduleDraw() {
      if (!frame) frame = requestAnimationFrame(draw)
    }

    function resize() {
      viewport = {
        width: window.innerWidth,
        height: window.innerHeight,
        dpr: window.devicePixelRatio || 1,
      }
      const size = canvasSize(viewport.width, viewport.height, viewport.dpr)
      canvas.width = size.width
      canvas.height = size.height
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
      // Resizing clears the canvas, so redraw now rather than next frame.
      draw()
    }

    // A pixel-ratio change (moving to another monitor, browser zoom) does not
    // always fire `resize`; this query fires once the ratio stops matching.
    let dprQuery: MediaQueryList | null = null
    function watchPixelRatio() {
      dprQuery?.removeEventListener('change', onPixelRatioChange)
      dprQuery = window.matchMedia(`(resolution: ${viewport.dpr}dppx)`)
      dprQuery.addEventListener('change', onPixelRatioChange)
    }
    function onPixelRatioChange() {
      resize()
      watchPixelRatio()
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Shift') {
        editor.rectangleTool.setShift(event.type === 'keydown')
      } else if (event.key === 'Escape' && event.type === 'keydown') {
        editor.rectangleTool.cancel()
      }
    }

    resize()
    watchPixelRatio()
    const unsubscribe = editor.store.subscribe(scheduleDraw)
    window.addEventListener('resize', resize)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)

    return () => {
      unsubscribe()
      cancelAnimationFrame(frame)
      dprQuery?.removeEventListener('change', onPixelRatioChange)
      window.removeEventListener('resize', resize)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
    }
  }, [editor])

  function toPoint(event: PointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect()
    return [event.clientX - rect.left, event.clientY - rect.top]
  }

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return
    // Keep receiving moves when the pointer leaves the canvas mid-drag.
    event.currentTarget.setPointerCapture(event.pointerId)
    editor.rectangleTool.pointerDown(
      event.pointerId,
      toPoint(event),
      event.shiftKey,
    )
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    editor.rectangleTool.pointerMove(
      event.pointerId,
      toPoint(event),
      event.shiftKey,
    )
  }

  return (
    <canvas
      ref={ref}
      className="canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => editor.rectangleTool.pointerUp(event.pointerId)}
      onPointerCancel={(event) =>
        editor.rectangleTool.pointerCancel(event.pointerId)
      }
    />
  )
}
