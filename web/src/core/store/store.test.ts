import { expect, test, vi } from 'vitest'
import { createStore } from './store.ts'

test('setState replaces the state and notifies subscribers', () => {
  const store = createStore({ count: 0 })
  const listener = vi.fn()
  store.subscribe(listener)

  store.setState({ count: 1 })

  expect(store.getState()).toEqual({ count: 1 })
  expect(listener).toHaveBeenCalledTimes(1)
})

test('setState accepts an updater function', () => {
  const store = createStore({ count: 1 })
  store.setState((prev) => ({ count: prev.count + 1 }))
  expect(store.getState()).toEqual({ count: 2 })
})

test('setting the same reference does not notify', () => {
  const store = createStore({ count: 0 })
  const listener = vi.fn()
  store.subscribe(listener)

  store.setState((prev) => prev)

  expect(listener).not.toHaveBeenCalled()
})

test('unsubscribe stops notifications', () => {
  const store = createStore({ count: 0 })
  const listener = vi.fn()
  const unsubscribe = store.subscribe(listener)

  unsubscribe()
  store.setState({ count: 1 })

  expect(listener).not.toHaveBeenCalled()
})
