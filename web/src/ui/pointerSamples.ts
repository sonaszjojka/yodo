import type { Point } from '../core/document/types.ts'

interface ClientPoint {
  clientX: number
  clientY: number
}

/** The parts of a native `PointerEvent` this reads, so tests can pass plain objects. */
export interface SampledEvent extends ClientPoint {
  getCoalescedEvents?: () => ClientPoint[]
}

/**
 * Every pointer position a move event stands for, in CSS px relative to the
 * canvas at `origin`. Browsers fire `pointermove` about once per frame and
 * fold the moves in between into `getCoalescedEvents()`; without them a fast
 * pencil stroke gets samples tens of pixels apart and cuts its corners.
 */
export function pointerSamples(
  event: SampledEvent,
  origin: { left: number; top: number },
): Point[] {
  const coalesced = event.getCoalescedEvents?.() ?? []
  // Synthetic events and older browsers give no coalesced list.
  const samples = coalesced.length > 0 ? coalesced : [event]
  return samples.map((e): Point => [
    e.clientX - origin.left,
    e.clientY - origin.top,
  ])
}
