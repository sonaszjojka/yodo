import rough from 'roughjs'
import { useEffect, useRef, useState } from 'react'
import { elementBounds, unionBounds } from '../core/geometry/rect.ts'
import { fitViewport } from '../core/geometry/viewport.ts'
import { canvasSize, renderScene } from '../core/render/render.ts'
import type { DrawingRepository } from '../storage/repository.ts'

/** Space around the drawing inside the thumbnail, in CSS pixels. */
const PADDING = 12

type State = 'pending' | 'drawn' | 'empty' | 'error'

export interface ThumbnailProps {
  repository: DrawingRepository
  id: string
  /** Redraws when the drawing is saved again. */
  updatedAt: number
}

/**
 * A card's preview (ADR 0034): the drawing loaded and drawn with the editor's
 * renderer, only once the card is near the viewport.
 */
export function Thumbnail({ repository, id, updatedAt }: ThumbnailProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [state, setState] = useState<State>('pending')

  useEffect(() => {
    const canvas = ref.current!
    let cancelled = false

    async function draw() {
      const doc = await repository.get(id)
      if (cancelled) return
      const bounds = doc && unionBounds(doc.elements.map(elementBounds))
      if (!doc || !bounds) return setState('empty')
      const size = { width: canvas.clientWidth, height: canvas.clientHeight }
      const dpr = window.devicePixelRatio || 1
      Object.assign(canvas, canvasSize(size.width, size.height, dpr))
      renderScene(
        canvas.getContext('2d')!,
        rough.canvas(canvas),
        doc.elements,
        { ...size, dpr },
        fitViewport(bounds, size, PADDING),
      )
      setState('drawn')
    }

    // Start loading a little before the card scrolls into view.
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        draw().catch((error: unknown) => {
          console.error('Could not draw the thumbnail', error)
          if (!cancelled) setState('error')
        })
      },
      { rootMargin: '200px' },
    )
    observer.observe(canvas)
    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [repository, id, updatedAt])

  return (
    <div className="thumbnail" data-state={state}>
      <canvas ref={ref} className="thumbnail-canvas" aria-hidden="true" />
      {state === 'empty' && <span className="thumbnail-note">Empty</span>}
      {state === 'error' && <span className="thumbnail-note">No preview</span>}
    </div>
  )
}
