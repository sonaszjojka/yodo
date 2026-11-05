// The generated reference board of `docs/product.md` (roadmap 2.12): 1,000
// mixed elements plus 5 images. Seeded, so every run draws the same board.

/** Where the board starts out, and how much of it the first screen shows. */
export const START_VIEWPORT = { x: 3000, y: 2000, zoom: 0.25 }

/** The board's extent in world units. */
const WIDTH = 12000
const HEIGHT = 8000

/** Image elements are small on the board and big as files (~2 MP). */
export const IMAGE_PIXELS = { width: 1600, height: 1250 }
const IMAGE_BOX = { width: 480, height: 375 }
export const IMAGE_COUNT = 5

export const ELEMENT_COUNTS = {
  shapes: 350,
  linear: 200,
  pencil: 250,
  text: 200,
} as const

type Point = [number, number]

/** mulberry32: a tiny seeded PRNG, so no dependency is needed. */
function random(seed: number) {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const COLOURS = ['#1E1F22', '#E03131', '#2F9E44', '#1971C2', '#F08C00']
const FILLS = ['transparent', '#FFC9C9', '#B2F2BB', '#A5D8FF', '#FFEC99']
const WORDS = [
  'plan',
  'idea',
  'todo',
  'draft',
  'review',
  'ship',
  'notes',
  'map',
]

export interface BoardDocument {
  type: 'yodo'
  schemaVersion: 1
  id: string
  name: string
  elements: Record<string, unknown>[]
  appState: { viewport: typeof START_VIEWPORT }
  fileIds: string[]
}

/** The board with its elements; `imageHashes` are the stored images' hashes. */
export function generateBoard(
  id: string,
  imageHashes: readonly string[],
): BoardDocument {
  const rand = random(20261105)
  const pick = <T>(items: readonly T[]) =>
    items[Math.floor(rand() * items.length)]!
  const between = (min: number, max: number) => min + rand() * (max - min)
  let next = 0

  function base(x: number, y: number, width: number, height: number) {
    return {
      id: `perf-${next++}`,
      x,
      y,
      width,
      height,
      angle: 0,
      seed: 1 + Math.floor(rand() * 2 ** 31 - 2),
      strokeColor: pick(COLOURS),
      backgroundColor: pick(FILLS),
      fillStyle: pick(['hachure', 'cross-hatch', 'solid'] as const),
      strokeWidth: pick([1, 2, 4]),
      strokeStyle: pick(['solid', 'solid', 'dashed', 'dotted'] as const),
      roughness: pick([0, 1, 1, 2]),
      opacity: 100,
    }
  }

  /** Points relative to the first one, and the box that holds them. */
  function box(points: Point[]) {
    const xs = points.map((p) => p[0])
    const ys = points.map((p) => p[1])
    return {
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    }
  }

  const elements: Record<string, unknown>[] = []

  for (let i = 0; i < ELEMENT_COUNTS.shapes; i++) {
    const type = pick(['rectangle', 'diamond', 'ellipse'] as const)
    const element: Record<string, unknown> = {
      type,
      ...base(
        between(0, WIDTH),
        between(0, HEIGHT),
        between(60, 240),
        between(40, 160),
      ),
    }
    if (type !== 'ellipse')
      element.roundness = pick(['sharp', 'round'] as const)
    // A third of the shapes carry a label.
    if (i % 3 === 0) {
      element.label = {
        text: `${pick(WORDS)} ${pick(WORDS)}`,
        fontFamily: 'hand',
        fontSize: 20,
        textAlign: 'center',
      }
    }
    elements.push(element)
  }

  for (let i = 0; i < ELEMENT_COUNTS.linear; i++) {
    const points: Point[] = [
      [0, 0],
      [between(-300, 300), between(-300, 300)],
    ]
    const arrow = i % 2 === 0
    elements.push({
      type: arrow ? 'arrow' : 'line',
      ...base(between(0, WIDTH), between(0, HEIGHT), 0, 0),
      ...box(points),
      points,
      ...(arrow ? { endArrowhead: 'arrow' } : {}),
    })
  }

  for (let i = 0; i < ELEMENT_COUNTS.pencil; i++) {
    // A smooth wandering stroke of ~60 points, like a drawn squiggle.
    const points: Point[] = [[0, 0]]
    let angle = between(0, Math.PI * 2)
    for (let p = 1; p < 60; p++) {
      angle += between(-0.5, 0.5)
      const last = points[p - 1]!
      points.push([
        last[0] + Math.cos(angle) * 6,
        last[1] + Math.sin(angle) * 6,
      ])
    }
    elements.push({
      type: 'pencil',
      ...base(between(0, WIDTH), between(0, HEIGHT), 0, 0),
      ...box(points),
      points,
    })
  }

  for (let i = 0; i < ELEMENT_COUNTS.text; i++) {
    const text = `${pick(WORDS)} ${pick(WORDS)} ${pick(WORDS)}`
    const fontSize = pick([16, 20, 28])
    elements.push({
      type: 'text',
      ...base(
        between(0, WIDTH),
        between(0, HEIGHT),
        Math.round(text.length * fontSize * 0.55),
        Math.round(fontSize * 1.25),
      ),
      text,
      fontFamily: pick(['hand', 'sans', 'mono'] as const),
      fontSize,
      textAlign: 'left',
    })
  }

  // The images sit inside the first screen, so they are on show from the start.
  imageHashes.forEach((fileId, i) => {
    elements.push({
      type: 'image',
      ...base(
        START_VIEWPORT.x + 150 + (i % 3) * 1500,
        START_VIEWPORT.y + 150 + Math.floor(i / 3) * 1500,
        IMAGE_BOX.width,
        IMAGE_BOX.height,
      ),
      backgroundColor: 'transparent',
      fileId,
    })
  })

  return {
    type: 'yodo',
    schemaVersion: 1,
    id,
    name: 'Reference board',
    elements,
    appState: { viewport: START_VIEWPORT },
    fileIds: [...imageHashes].sort(),
  }
}
