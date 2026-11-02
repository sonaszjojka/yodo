import { expect, test } from 'vitest'
import { pointerSamples } from './pointerSamples.ts'

const origin = { left: 10, top: 20 }

test('returns every coalesced sample, relative to the canvas', () => {
  // The browser merged three moves since the last frame into one event.
  const event = {
    clientX: 40,
    clientY: 50,
    getCoalescedEvents: () => [
      { clientX: 20, clientY: 30 },
      { clientX: 30, clientY: 40 },
      { clientX: 40, clientY: 50 },
    ],
  }

  expect(pointerSamples(event, origin)).toEqual([
    [10, 10],
    [20, 20],
    [30, 30],
  ])
})

test.each([
  ['the browser has no getCoalescedEvents', undefined],
  ['the list is empty (a synthetic event)', () => []],
])('falls back to the event itself when %s', (_, getCoalescedEvents) => {
  const event = { clientX: 40, clientY: 50, getCoalescedEvents }

  expect(pointerSamples(event, origin)).toEqual([[30, 30]])
})
