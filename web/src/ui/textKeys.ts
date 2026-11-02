/**
 * Whether a key finishes the edit: Escape or Cmd/Ctrl+Enter (Enter alone adds
 * a line). Not during IME composition, where Escape or Enter belong to the
 * IME (dismissing or accepting a candidate).
 */
export function commitsOn(key: {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  isComposing: boolean
}) {
  if (key.isComposing) return false
  return (
    key.key === 'Escape' ||
    (key.key === 'Enter' && (key.metaKey || key.ctrlKey))
  )
}
