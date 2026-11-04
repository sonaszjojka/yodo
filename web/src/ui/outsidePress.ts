/** The DOM `Node.contains` part this check needs. */
interface Container {
  contains(other: never): boolean
}

/**
 * Whether a press on `target` lies outside all of `inside`. A popup's own
 * toggle button belongs inside: its click toggles the popup, and closing on
 * its press too would immediately reopen it.
 */
export function isOutside(
  target: unknown,
  ...inside: (Container | null | undefined)[]
): boolean {
  return !inside.some((el) => el?.contains(target as never))
}
