const MINUTE = 60_000
const HOUR = 60 * MINUTE

/**
 * The "last edited" line on a Home card: relative while it's recent, then the
 * time today, then the date (with the year only when it isn't this year).
 */
export function formatEdited(
  updatedAt: number,
  now: number,
  locale?: string,
  /** What happened at that time: "Edited" on a card, "Deleted" in Trash. */
  verb = 'Edited',
): string {
  const ago = now - updatedAt
  if (ago < MINUTE) return `${verb} just now`
  if (ago < HOUR) return `${verb} ${Math.floor(ago / MINUTE)} min ago`
  const edited = new Date(updatedAt)
  const today = new Date(now)
  if (edited.toDateString() === today.toDateString()) {
    const time = edited.toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit',
    })
    return `${verb} today, ${time}`
  }
  const date = edited.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    ...(edited.getFullYear() !== today.getFullYear() && { year: 'numeric' }),
  })
  return `${verb} ${date}`
}
