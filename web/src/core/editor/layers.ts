// Layer order (roadmap 2.2b): later elements draw on top, so reordering is
// reordering `document.elements`. Pure, so each change is one new array.
import type { YodoElement } from '../document/types.ts'

export type LayerOrder = 'forward' | 'backward' | 'front' | 'back'

/**
 * `elements` with those in `ids` moved: to the front or back as a group, or
 * one step forward or backward, each over its nearest unselected neighbour.
 * Selected elements keep their order among themselves. Returns the same
 * array when nothing moves, so it is no undo step.
 */
export function arrange(
  elements: YodoElement[],
  ids: ReadonlySet<string>,
  to: LayerOrder,
): YodoElement[] {
  const next = [...elements]
  const picked = (i: number) => ids.has(next[i]!.id)
  const swap = (i: number, j: number) => {
    ;[next[i], next[j]] = [next[j]!, next[i]!]
  }
  switch (to) {
    case 'front':
    case 'back': {
      const moving = next.filter((element) => ids.has(element.id))
      const staying = next.filter((element) => !ids.has(element.id))
      next.splice(
        0,
        next.length,
        ...(to === 'front' ? [...staying, ...moving] : [...moving, ...staying]),
      )
      break
    }
    // Walking from the side it moves towards, a selected run passes its
    // neighbour together, and a run already at the edge stays put.
    case 'forward':
      for (let i = next.length - 2; i >= 0; i--) {
        if (picked(i) && !picked(i + 1)) swap(i, i + 1)
      }
      break
    case 'backward':
      for (let i = 1; i < next.length; i++) {
        if (picked(i) && !picked(i - 1)) swap(i, i - 1)
      }
      break
  }
  return next.every((element, i) => element === elements[i]) ? elements : next
}
