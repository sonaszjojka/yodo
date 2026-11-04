import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { DrawingLoadError } from './DrawingLoadError.tsx'

test('a missing drawing says so and offers only the way back', () => {
  const html = renderToStaticMarkup(<DrawingLoadError kind="not-found" />)

  expect(html).toContain('role="alert"')
  expect(html).toContain('Drawing not found')
  expect(html).not.toContain('Try again')
  expect(html).toMatch(/<a[^>]*href="#\/"[^>]*>Back to Home<\/a>/)
})

test('a failed load offers Try again and the way back', () => {
  const html = renderToStaticMarkup(
    <DrawingLoadError kind="error" onRetry={() => {}} />,
  )

  expect(html).toContain('Couldn’t open this drawing')
  expect(html).toContain('>Try again</button>')
  expect(html).toContain('>Back to Home</a>')
})
