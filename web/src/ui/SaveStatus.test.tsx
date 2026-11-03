import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { createStore } from '../core/store/store.ts'
import type { SaveStatus as Status } from '../storage/autosave.ts'
import { SaveStatus } from './SaveStatus.tsx'

test.each<[Status, string]>([
  ['saved', 'Saved'],
  ['unsaved', 'Unsaved changes'],
  ['saving', 'Saving…'],
  ['error', 'Couldn&#x27;t save'],
])('shows %s as "%s" in a status region', (status, label) => {
  const html = renderToStaticMarkup(
    <SaveStatus status={createStore<Status>(status)} />,
  )

  expect(html).toContain('role="status"')
  expect(html).toContain(`save-status-${status}`)
  expect(html).toContain(`>${label}<`)
})
