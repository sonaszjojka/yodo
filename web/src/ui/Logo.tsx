// The "scribble tile" logo from docs/ui.md: a teal rounded square with one pen stroke,
// followed by the wordmark. The tile alone is also the favicon (public/favicon.svg).
export function Logo() {
  return (
    <span className="logo">
      <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
        <rect width="40" height="40" rx="11" fill="var(--accent)" />
        <path
          d="M10 26 C12 15 20 11 24.5 15.5 C29 20 22.5 27.5 18 24.5 C13.5 21.5 21 11.5 31 13.5"
          fill="none"
          stroke="var(--on-accent)"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      Yodo
    </span>
  )
}
