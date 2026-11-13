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
  ['#/f/abc-123', { name: 'home', folderId: 'abc-123' }],
  ['#/f/a%20b', { name: 'home', folderId: 'a b' }],
  ['#/f/', { name: 'home' }],
  ['#/f/a/b', { name: 'home' }],
  ['#/f/%E0%A4%A', { name: 'home' }],
  ['#/trash', { name: 'trash' }],
  ['#/trash/', { name: 'home' }],
  ['#/trash/x', { name: 'home' }],
  ['#/open/q1YqLkksSVGyAgA', { name: 'open', data: 'q1YqLkksSVGyAgA' }],
  // Bad data still opens the screen, which explains what's wrong with it.
  ['#/open/a+b/c', { name: 'open', data: 'a+b/c' }],
  ['#/open/', { name: 'open', data: '' }],
])('parses %j', (hash, route) => {
  expect(parseRoute(hash)).toEqual(route)
})

test.each<Route>([
  { name: 'home' },
  { name: 'drawing', id: 'abc-123' },
  { name: 'drawing', id: 'a b/c' },
  { name: 'home', folderId: 'f1' },
  { name: 'home', folderId: 'a b/c' },
  { name: 'trash' },
  { name: 'open', data: 'q1Yq-_0' },
])('routeHash round-trips %j', (route) => {
  expect(parseRoute(routeHash(route))).toEqual(route)
})

test('routeHash gives the documented URLs', () => {
  expect(routeHash({ name: 'home' })).toBe('#/')
  expect(routeHash({ name: 'drawing', id: 'x1' })).toBe('#/d/x1')
  expect(routeHash({ name: 'home', folderId: 'f1' })).toBe('#/f/f1')
  expect(routeHash({ name: 'open', data: 'abc' })).toBe('#/open/abc')
})
