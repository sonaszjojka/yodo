import { expect, test } from 'vitest'
import { isOutside } from './outsidePress.ts'

// Stand-ins for DOM nodes: each contains itself and the listed children.
function node(...children: object[]) {
  const self = {
    contains: (other: unknown) => other === self || children.includes(other!),
  }
  return self
}

test('a press inside any of the given elements is not outside', () => {
  const item = {}
  const menu = node(item)
  const toggle = node()

  expect(isOutside(item, menu, toggle)).toBe(false)
  // The ⋯ toggle handles its own click; closing here would reopen it.
  expect(isOutside(toggle, menu, toggle)).toBe(false)
})

test('a press anywhere else is outside', () => {
  expect(isOutside({}, node(), node())).toBe(true)
  expect(isOutside(null, node())).toBe(true)
})

test('missing elements are skipped', () => {
  expect(isOutside({}, null, undefined)).toBe(true)
})
