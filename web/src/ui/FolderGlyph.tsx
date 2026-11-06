import { createElement } from 'react'
import { folderCssColor, folderIconComponent } from './folderStyle.ts'

/** A folder's icon in its colour. Decorative: the name next to it says what it is. */
export function FolderGlyph({
  icon,
  color,
  size = 20,
}: {
  icon: string
  color: string
  size?: number
}) {
  return createElement(folderIconComponent(icon), {
    size,
    weight: 'regular',
    'aria-hidden': true,
    style: { color: folderCssColor(color), flexShrink: 0 },
  })
}
