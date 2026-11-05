/** Offers `text` to the user as a file download (a Blob behind a hidden link). */
export function downloadText(
  filename: string,
  text: string,
  mimeType: string,
): void {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.hidden = true
  document.body.append(link)
  link.click()
  link.remove()
  // The download has started by now; the URL holds the file in memory until revoked.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
