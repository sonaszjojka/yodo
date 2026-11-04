import { expect, test } from 'vitest'
import { parseRoute, routeHash, type Route } from './route.ts'

test.each<[string, Route]>([
  ['', { name: 'home' }],
  ['#', { name: 'home' }],
  ['#/', { name: 'home' }],
  ['#/d/abc-123', { name: 'drawing', id: 'abc-123' }],
  ['#/d/a%20b', { name: 'drawing', id: 'a b' }],
  ['#/d/', { name: 'home' }],
  ['#/d/a/b', { name: 'home' }],
  ['#/unknown', { name: 'home' }],
  ['#/d/%E0%A4%A', { name: 'home' }],
])('parses %j', (hash, route) => {
  expect(parseRoute(hash)).toEqual(route)
})

test.each<Route>([
  { name: 'home' },
  { name: 'drawing', id: 'abc-123' },
  { name: 'drawing', id: 'a b/c' },
])('routeHash round-trips %j', (route) => {
  expect(parseRoute(routeHash(route))).toEqual(route)
})

test('routeHash gives the documented URLs', () => {
  expect(routeHash({ name: 'home' })).toBe('#/')
  expect(routeHash({ name: 'drawing', id: 'x1' })).toBe('#/d/x1')
})
