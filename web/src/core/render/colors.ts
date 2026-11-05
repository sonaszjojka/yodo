// Theme-aware drawing colours (ADR 0015). Elements store one light value; the
// renderer maps it when the canvas is dark. Pure, so it is unit-tested apart
// from any canvas.

export type Theme = 'light' | 'dark'
/** Strokes and text must stay readable; fills must stay close to the canvas. */
export type ColorRole = 'stroke' | 'fill'

/** The dark canvas (`--page` in dark mode, docs/ui.md). */
export const DARK_CANVAS = '#141517'
/** The light canvas (`--page` in light mode); an export's background. */
export const LIGHT_CANVAS = '#f7f9f9'

/** The canvas colour of a theme. */
export function canvasColor(theme: Theme) {
  return theme === 'dark' ? DARK_CANVAS : LIGHT_CANVAS
}

/** Minimum contrast of a custom stroke against the dark canvas (WCAG non-text). */
const MIN_STROKE_CONTRAST = 3
/** Lightness band of a custom fill in dark mode (palette twins sit near 0.2). */
const FILL_LIGHTNESS: [number, number] = [0.14, 0.3]

// The palette's dark twins, docs/ui.md "Drawing palette", keyed by the
// lower-case light value.
const TWINS: Record<string, string> = {
  // strokes
  '#1e1f22': '#E4E6E8',
  '#6b7280': '#9AA1AA',
  '#c2453d': '#F08A80',
  '#d9822b': '#F0AE63',
  '#3f8f5a': '#6CC28A',
  '#1f8a8a': '#5CC8C8',
  '#3a6fd8': '#8AB0F5',
  '#7a5af8': '#A895FB',
  // fills
  '#f7e1de': '#3D2624',
  '#f9ebd6': '#3B2F1F',
  '#e2f0e5': '#1F3427',
  '#ddf0ef': '#183433',
  '#e0e9fb': '#1F2C45',
  '#ece6fd': '#2C2545',
  '#eef0f2': '#2A2D31',
}

type Rgb = [number, number, number]

/** `#rgb` or `#rrggbb` as 0–255 channels, or null for any other string. */
function parseHex(color: string): Rgb | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color)
  if (!match) return null
  const hex =
    match[1].length === 3 ? [...match[1]].map((c) => c + c).join('') : match[1]
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb
}

function toHex([r, g, b]: Rgb) {
  return (
    '#' +
    [r, g, b]
      .map((c) => Math.round(c).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  )
}

/** Channels 0–255 to hue (0–360), saturation and lightness (0–1). */
function toHsl([r, g, b]: Rgb): [number, number, number] {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255]
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  const h =
    max === rn
      ? ((gn - bn) / d) % 6
      : max === gn
        ? (bn - rn) / d + 2
        : (rn - gn) / d + 4
  return [(h * 60 + 360) % 360, s, l]
}

function fromHsl(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x]
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}

function luminance([r, g, b]: Rgb) {
  const [lr, lg, lb] = [r, g, b].map((c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb
}

/** WCAG contrast ratio (1–21) of two `#rrggbb` colours. */
export function contrastRatio(a: string, b: string) {
  const [la, lb] = [a, b].map((c) => luminance(parseHex(c)!))
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** A custom colour for the dark canvas: lightness inverted, hue kept. */
function adaptCustom(rgb: Rgb, role: ColorRole): string {
  const [h, s, l] = toHsl(rgb)
  let lightness = 1 - l
  if (role === 'fill') {
    lightness = Math.min(
      Math.max(lightness, FILL_LIGHTNESS[0]),
      FILL_LIGHTNESS[1],
    )
    return toHex(fromHsl(h, s, lightness))
  }
  // Raise lightness in small steps until the stroke reads on the canvas.
  let hex = toHex(fromHsl(h, s, lightness))
  while (
    lightness < 1 &&
    contrastRatio(hex, DARK_CANVAS) < MIN_STROKE_CONTRAST
  ) {
    lightness = Math.min(1, lightness + 0.02)
    hex = toHex(fromHsl(h, s, lightness))
  }
  return hex
}

/**
 * The colour to draw for a stored (light) colour. Light returns it as is.
 * Dark maps palette colours to their twins and anything else that is a hex
 * colour through the adaptation; values it cannot parse (`transparent`, names,
 * `rgb()`) are left alone.
 */
export function adaptColor(color: string, theme: Theme, role: ColorRole) {
  if (theme === 'light') return color
  const twin = TWINS[color.toLowerCase()]
  if (twin) return twin
  const rgb = parseHex(color)
  return rgb ? adaptCustom(rgb, role) : color
}
