import { expect, test } from 'vitest'
import { formatEdited } from './formatEdited.ts'

const now = new Date(2026, 10, 4, 15, 0).getTime()
const minutes = (n: number) => now - n * 60_000

test.each([
  ['under a minute', now - 30_000, 'Edited just now'],
  ['a clock a bit ahead', now + 5_000, 'Edited just now'],
  ['minutes', minutes(5), 'Edited 5 min ago'],
  ['59 minutes', minutes(59), 'Edited 59 min ago'],
])('%s', (_case, time, text) => {
  expect(formatEdited(time, now, 'en-GB')).toBe(text)
})

test('earlier today shows the time', () => {
  expect(
    formatEdited(new Date(2026, 10, 4, 9, 5).getTime(), now, 'en-GB'),
  ).toBe('Edited today, 09:05')
})

test('before today shows the date, with the year only when it differs', () => {
  expect(
    formatEdited(new Date(2026, 10, 3, 23, 0).getTime(), now, 'en-GB'),
  ).toBe('Edited 3 Nov')
  expect(formatEdited(new Date(2025, 0, 9).getTime(), now, 'en-GB')).toBe(
    'Edited 9 Jan 2025',
  )
})

test('the verb can change, for Trash', () => {
  expect(formatEdited(minutes(5), now, 'en-GB', 'Deleted')).toBe(
    'Deleted 5 min ago',
  )
  expect(formatEdited(now, now, 'en-GB', 'Deleted')).toBe('Deleted just now')
})
