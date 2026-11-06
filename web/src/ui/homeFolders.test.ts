import { expect, test } from 'vitest'
import type { Folder } from '../storage/folders.ts'
import type { DrawingSummary } from '../storage/repository.ts'
import {
  deleteFolderMessage,
  drawingsInView,
  folderCounts,
  folderOf,
} from './homeFolders.ts'

const d = (id: string, folderId?: string): DrawingSummary => ({
  id,
  name: id,
  createdAt: 1,
  updatedAt: 1,
  ...(folderId === undefined ? {} : { folderId }),
})
const drawings = [d('a', 'f1'), d('b'), d('c', 'f1'), d('d', 'f2')]
const folder = (id: string): Folder => ({
  id,
  name: id,
  icon: 'folder',
  color: 'graphite',
  createdAt: 1,
})

test('All drawings lists everything, a folder only its own', () => {
  expect(drawingsInView(drawings, undefined).map((x) => x.id)).toEqual([
    'a',
    'b',
    'c',
    'd',
  ])
  expect(drawingsInView(drawings, 'f1').map((x) => x.id)).toEqual(['a', 'c'])
  expect(drawingsInView(drawings, 'gone')).toEqual([])
})

test('counts drawings per folder, ignoring loose ones', () => {
  expect(folderCounts(drawings)).toEqual(
    new Map([
      ['f1', 2],
      ['f2', 1],
    ]),
  )
})

test('finds the folder of a drawing, if it still exists', () => {
  const folders = [folder('f1')]
  expect(folderOf(d('a', 'f1'), folders)?.id).toBe('f1')
  expect(folderOf(d('b'), folders)).toBeUndefined()
  expect(folderOf(d('c', 'f9'), folders)).toBeUndefined()
})

test('the delete confirmation says how many drawings move to Trash', () => {
  expect(deleteFolderMessage('Work', 3)).toBe(
    'Delete the folder “Work”? Its 3 drawings will move to Trash.',
  )
  expect(deleteFolderMessage('Work', 1)).toContain('Its 1 drawing will move')
  expect(deleteFolderMessage('Work', 0)).toBe(
    'Delete the folder “Work”? It has no drawings.',
  )
})
