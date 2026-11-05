import rough from 'roughjs'
import { useEffect, useRef, useState } from 'react'
import type { YodoElement } from '../core/document/types.ts'
import {
  elementBounds,
  unionBounds,
  type Bounds,
} from '../core/geometry/rect.ts'
import { fitViewport } from '../core/geometry/viewport.ts'
import { canvasSize, renderScene } from '../core/render/render.ts'
import type { DrawingRepository } from '../storage/repository.ts'
import type { ImageCache } from './imageCache.ts'
import { thumbnailDocument } from './thumbnailDocument.ts'
import { useTheme } from './useTheme.ts'

/** Space around the drawing inside the thumbnail, in CSS pixels. */
const PADDING = 12

type State = 'pending' | 'drawn' | 'empty' | 'error'

export interface ThumbnailProps {
  repository: DrawingRepository
  /** The pictures of image elements; the thumbnail draws again as they load (ADR 0040). */
  imageCache: ImageCache
  id: string
  /** Redraws when the drawing is saved again. */
  updatedAt: number
}

/**
 * A card's preview (ADR 0034): the drawing loaded and drawn with the editor's
 * renderer, only once the card is near the viewport.
 */
export function Thumbnail({
  repository,
  imageCache,
  id,
  updatedAt,
}: ThumbnailProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [state, setState] = useState<State>('pending')
  // Thumbnails follow the current theme (ADR 0015) and redraw when it changes.
  const { theme } = useTheme()

  useEffect(() => {
    const canvas = ref.current!
    let cancelled = false
    let unsubscribe: (() => void) | undefined

    // Paints a loaded drawing; called again when a picture arrives.
    function paint(elements: YodoElement[], bounds: Bounds) {
      const size = { width: canvas.clientWidth, height: canvas.clientHeight }
      const dpr = window.devicePixelRatio || 1
      Object.assign(canvas, canvasSize(size.width, size.height, dpr))
      renderScene(
        canvas.getContext('2d')!,
        rough.canvas(canvas),
        elements,
        { ...size, dpr, theme, images: imageCache.get },
        fitViewport(bounds, size, PADDING),
      )
    }

    async function draw() {
      const doc = await thumbnailDocument(repository, id, document.fonts.ready)
      if (cancelled) return
      const bounds = doc && unionBounds(doc.elements.map(elementBounds))
      if (!doc || !bounds) return setState('empty')
      paint(doc.elements, bounds)
      setState('drawn')
      if (doc.elements.some((element) => element.type === 'image')) {
        unsubscribe = imageCache.subscribe(() => paint(doc.elements, bounds))
      }
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
      unsubscribe?.()
      observer.disconnect()
    }
  }, [repository, imageCache, id, updatedAt, theme])

  return (
    <div className="thumbnail" data-state={state}>
      <canvas ref={ref} className="thumbnail-canvas" aria-hidden="true" />
      {state === 'empty' && <span className="thumbnail-note">Empty</span>}
      {state === 'error' && <span className="thumbnail-note">No preview</span>}
    </div>
  )
}
