import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { OpenLinkView, type OpenLinkViewProps } from './OpenLink.tsx'

function render(props: Partial<OpenLinkViewProps> = {}) {
  return renderToStaticMarkup(
    <OpenLinkView
      importing={false}
      onOpen={() => {}}
      onCancel={() => {}}
      {...props}
    />,
  )
}

const ready = {
  status: 'ready',
  text: '{}',
  name: 'Login flow',
  elementCount: 3,
} as const

test('shows a status while the link is read', () => {
  expect(render()).toContain('Opening link…')
})

test('asks before importing, naming the drawing and its size', () => {
  const html = render({ read: ready })
  expect(html).toContain('Open this drawing?')
  expect(html).toContain('Login flow')
  expect(html).toContain('3 elements')
  expect(html).toContain('as a new copy')
  expect(html).not.toMatch(/disabled/)
})

test('says "1 element" for one', () => {
  expect(render({ read: { ...ready, elementCount: 1 } })).toContain(
    '1 element<',
  )
})

test('both buttons are disabled while importing', () => {
  const html = render({ read: ready, importing: true })
  expect(html.match(/disabled=""/g)).toHaveLength(2)
  expect(html).toContain('Opening…')
})

test('an import failure is shown and Open stays available', () => {
  const html = render({
    read: ready,
    importError: 'Couldn’t open this link. Try again.',
  })
  expect(html).toContain('role="alert"')
  expect(html).toContain('Try again.')
  expect(html).not.toMatch(/disabled/)
})

test('a bad link shows the error with Back to Home', () => {
  const html = render({
    read: { status: 'error', message: 'This link is damaged.' },
  })
  expect(html).toContain('Couldn’t open this link')
  expect(html).toContain('This link is damaged.')
  expect(html).toContain('href="#/"')
  expect(html).not.toContain('Open this drawing?')
})
