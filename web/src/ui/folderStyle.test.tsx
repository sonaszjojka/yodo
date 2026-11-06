import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { FOLDER_COLORS, FOLDER_ICONS } from '../storage/folders.ts'
import { FolderGlyph } from './FolderGlyph.tsx'
import {
  FOLDER_COLOR_VALUES,
  FOLDER_ICON_COMPONENTS,
  folderColorLabel,
  folderCssColor,
  folderIconComponent,
} from './folderStyle.ts'

describe('folder style', () => {
  test('every stored icon and colour key has a picture', () => {
    expect(Object.keys(FOLDER_ICON_COMPONENTS).sort()).toEqual(
      [...FOLDER_ICONS].sort(),
    )
    expect(Object.keys(FOLDER_COLOR_VALUES).sort()).toEqual(
      [...FOLDER_COLORS].sort(),
    )
  })

  test('colours are the palette values for both themes', () => {
    expect(folderCssColor('teal')).toBe('light-dark(#1F8A8A, #5CC8C8)')
    expect(folderCssColor('graphite')).toBe('light-dark(#6B7280, #9AA1AA)')
    expect(folderColorLabel('violet')).toBe('Violet')
  })

  test('an unknown key falls back to the default folder look', () => {
    expect(folderIconComponent('not-an-icon')).toBe(
      folderIconComponent('folder'),
    )
    // Inherited object keys are not icons either.
    expect(folderIconComponent('constructor')).toBe(
      folderIconComponent('folder'),
    )
    expect(folderCssColor('chartreuse')).toBe(folderCssColor('graphite'))
    expect(folderColorLabel('toString')).toBe('Graphite')
  })

  test('a glyph is decorative and carries its colour', () => {
    const html = renderToStaticMarkup(<FolderGlyph icon="star" color="brick" />)
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('light-dark(#C2453D, #F08A80)')
  })
})
