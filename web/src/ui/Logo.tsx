import tile from '../assets/logo-tile.svg?raw'

// The "scribble tile" logo from docs/ui.md: a teal rounded square with one pen stroke,
// followed by the wordmark. logo-tile.svg is the only copy of the tile: index.html uses
// it as the favicon, where the hex fallbacks apply, and here it is inlined so the page's
// --accent and --on-accent colours (and later the dark theme) apply.
export function Logo() {
  return (
    <span className="logo">
      {/* Static file from the repo, not user input, so inlining it is safe. */}
      <span className="logo-tile" dangerouslySetInnerHTML={{ __html: tile }} />
      Yodo
    </span>
  )
}
