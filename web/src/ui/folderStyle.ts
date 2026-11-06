// How a folder looks (docs/ui.md, Folder icons): a Phosphor line icon in one of
// the drawing palette's stroke colours, adapted to the theme. The repository
// stores only the keys (ADR 0045); this file maps them to pictures.

import {
  Book,
  Briefcase,
  Camera,
  Code,
  Folder as FolderIcon,
  Heart,
  House,
  Lightbulb,
  MusicNotes,
  Palette,
  Rocket,
  Star,
  type Icon,
} from '@phosphor-icons/react'
import {
  DEFAULT_FOLDER_COLOR,
  DEFAULT_FOLDER_ICON,
  type FolderColor,
  type FolderIcon as FolderIconKey,
} from '../storage/folders.ts'

export const FOLDER_ICON_COMPONENTS: Record<FolderIconKey, Icon> = {
  folder: FolderIcon,
  briefcase: Briefcase,
  house: House,
  book: Book,
  star: Star,
  heart: Heart,
  lightbulb: Lightbulb,
  code: Code,
  palette: Palette,
  camera: Camera,
  'music-notes': MusicNotes,
  rocket: Rocket,
}

/** The stroke palette from `docs/ui.md`: label, light value, dark value. */
export const FOLDER_COLOR_VALUES: Record<
  FolderColor,
  { label: string; light: string; dark: string }
> = {
  ink: { label: 'Ink', light: '#1E1F22', dark: '#E4E6E8' },
  graphite: { label: 'Graphite', light: '#6B7280', dark: '#9AA1AA' },
  brick: { label: 'Brick', light: '#C2453D', dark: '#F08A80' },
  amber: { label: 'Amber', light: '#D9822B', dark: '#F0AE63' },
  green: { label: 'Green', light: '#3F8F5A', dark: '#6CC28A' },
  teal: { label: 'Teal', light: '#1F8A8A', dark: '#5CC8C8' },
  blue: { label: 'Blue', light: '#3A6FD8', dark: '#8AB0F5' },
  violet: { label: 'Violet', light: '#7A5AF8', dark: '#A895FB' },
}

function isKey<T extends string>(
  table: Record<T, unknown>,
  key: string,
): key is T {
  return Object.hasOwn(table, key)
}

/** The icon for a stored key; an unknown key (another client's) shows the default. */
export function folderIconComponent(key: string): Icon {
  return FOLDER_ICON_COMPONENTS[
    isKey(FOLDER_ICON_COMPONENTS, key) ? key : DEFAULT_FOLDER_ICON
  ]
}

/** The CSS colour for a stored key, switching with the theme like the tokens do. */
export function folderCssColor(key: string): string {
  const { light, dark } =
    FOLDER_COLOR_VALUES[
      isKey(FOLDER_COLOR_VALUES, key) ? key : DEFAULT_FOLDER_COLOR
    ]
  return `light-dark(${light}, ${dark})`
}

export function folderColorLabel(key: string): string {
  return FOLDER_COLOR_VALUES[
    isKey(FOLDER_COLOR_VALUES, key) ? key : DEFAULT_FOLDER_COLOR
  ].label
}
