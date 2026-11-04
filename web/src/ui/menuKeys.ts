// Keyboard navigation for menus (WAI-ARIA menu pattern). Kept out of the
// component files so they export only components (Fast Refresh).

/**
 * Where focus goes in a menu of `count` items on `key` (WAI-ARIA menu:
 * arrows wrap, Home and End jump), or null for other keys.
 */
export function nextMenuIndex(
  key: string,
  index: number,
  count: number,
): number | null {
  switch (key) {
    case 'ArrowDown':
      return (index + 1) % count
    case 'ArrowUp':
      return (index - 1 + count) % count
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}
