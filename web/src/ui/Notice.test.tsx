import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { Notice } from './Notice.tsx'

test('a notice is a status message, styled as an error by default', () => {
  const html = renderToStaticMarkup(
    <Notice message="Couldn’t paste." onDismiss={() => {}} />,
  )
  expect(html).toBe('<p class="notice" role="status">Couldn’t paste.</p>')
})

test('an info notice can carry a link (ADR 0062)', () => {
  const html = renderToStaticMarkup(
    <Notice
      message="Your version was saved as a copy."
      tone="info"
      action={{ label: 'Open copy', href: '#/d/c1' }}
      onDismiss={() => {}}
    />,
  )
  expect(html).toContain('class="notice notice-info"')
  expect(html).toMatch(/<a[^>]*href="#\/d\/c1"[^>]*>Open copy<\/a>/)
})

test('no message renders nothing', () => {
  expect(
    renderToStaticMarkup(<Notice message={undefined} onDismiss={() => {}} />),
  ).toBe('')
})
