// The reference scenes of the export visual baseline (roadmap 2.7c, ADR 0044).
// Each is a plain `.yodo` document with fixed ids and rough.js seeds, so every
// run draws the same pixels. Colours are the light-theme values (ADR 0015).

type Fill = 'hachure' | 'cross-hatch' | 'solid'
type Stroke = 'solid' | 'dashed' | 'dotted'
type Font = 'hand' | 'sans' | 'mono'

interface Box {
  x: number
  y: number
  width: number
  height: number
}

interface Look {
  seed: number
  strokeColor?: string
  backgroundColor?: string
  fillStyle?: Fill
  strokeWidth?: number
  strokeStyle?: Stroke
  roughness?: number
  opacity?: number
  roundness?: 'sharp' | 'round'
}

type Element = Record<string, unknown>

const INK = '#1E1F22'

/** The fields every element has, with the defaults the editor starts with. */
function base(id: string, box: Box, look: Look): Element {
  return {
    id,
    ...box,
    angle: 0,
    strokeColor: INK,
    backgroundColor: 'transparent',
    fillStyle: 'hachure',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 1,
    opacity: 100,
    ...look,
  }
}

function shape(
  type: 'rectangle' | 'diamond' | 'ellipse' | 'note',
  id: string,
  box: Box,
  look: Look,
  label?: { text: string; fontFamily: Font; fontSize: number },
): Element {
  return {
    type,
    ...base(id, box, look),
    ...(label ? { label: { ...label, textAlign: 'center' } } : {}),
  }
}

function path(
  type: 'line' | 'arrow' | 'pencil',
  id: string,
  origin: { x: number; y: number },
  points: [number, number][],
  look: Look,
): Element {
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  return {
    type,
    ...base(
      id,
      {
        ...origin,
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      },
      look,
    ),
    points,
    ...(type === 'arrow' ? { endArrowhead: 'arrow' } : {}),
  }
}

function text(
  id: string,
  at: { x: number; y: number },
  content: string,
  fontFamily: Font,
  fontSize: number,
  look: Look,
): Element {
  return {
    type: 'text',
    ...base(
      id,
      { ...at, width: content.length * fontSize * 0.6, height: fontSize * 1.3 },
      look,
    ),
    text: content,
    fontFamily,
    fontSize,
    textAlign: 'left',
  }
}

export interface Scene {
  /** File-name safe, used in the baseline names. */
  name: string
  document: Record<string, unknown>
}

function scene(name: string, elements: Element[]): Scene {
  return {
    name,
    document: {
      type: 'yodo',
      schemaVersion: 1,
      id: `visual-${name}`,
      name,
      elements,
      appState: { viewport: { x: 0, y: 0, zoom: 1 } },
      fileIds: [],
    },
  }
}

const shapes = scene('shapes', [
  shape(
    'rectangle',
    'rect-hachure',
    { x: 0, y: 0, width: 160, height: 100 },
    {
      seed: 11,
      strokeColor: '#C2453D',
      backgroundColor: '#F7E1DE',
    },
  ),
  shape(
    'diamond',
    'diamond-cross',
    { x: 200, y: 0, width: 140, height: 110 },
    {
      seed: 12,
      strokeColor: '#3A6FD8',
      backgroundColor: '#E0E9FB',
      fillStyle: 'cross-hatch',
      roundness: 'round',
    },
  ),
  shape(
    'ellipse',
    'ellipse-solid',
    { x: 380, y: 0, width: 150, height: 100 },
    {
      seed: 13,
      strokeColor: '#3F8F5A',
      backgroundColor: '#DDF0E3',
      fillStyle: 'solid',
      strokeWidth: 4,
    },
  ),
  shape(
    'rectangle',
    'rect-dashed',
    { x: 0, y: 150, width: 160, height: 90 },
    {
      seed: 14,
      strokeStyle: 'dashed',
      roundness: 'round',
    },
  ),
  shape(
    'ellipse',
    'ellipse-dotted',
    { x: 200, y: 150, width: 140, height: 90 },
    {
      seed: 15,
      strokeStyle: 'dotted',
      strokeWidth: 3,
      roughness: 0,
    },
  ),
  path(
    'line',
    'line',
    { x: 380, y: 150 },
    [
      [0, 0],
      [60, 70],
      [150, 20],
    ],
    {
      seed: 16,
      roughness: 2,
    },
  ),
  path(
    'arrow',
    'arrow',
    { x: 0, y: 290 },
    [
      [0, 0],
      [250, 0],
    ],
    { seed: 17 },
  ),
])

const texts = scene('text', [
  text('hand', { x: 0, y: 0 }, 'Hand-drawn text', 'hand', 28, { seed: 21 }),
  text('sans', { x: 0, y: 60 }, 'Clean sans text', 'sans', 24, {
    seed: 22,
    strokeColor: '#3A6FD8',
  }),
  text('mono', { x: 0, y: 115 }, 'const mono = 1', 'mono', 22, {
    seed: 23,
    strokeColor: '#C2453D',
  }),
  shape(
    'rectangle',
    'labelled-rect',
    { x: 0, y: 180, width: 200, height: 90 },
    { seed: 24 },
    { text: 'A labelled box', fontFamily: 'sans', fontSize: 20 },
  ),
  shape(
    'ellipse',
    'labelled-ellipse',
    { x: 240, y: 180, width: 200, height: 90 },
    { seed: 25, backgroundColor: '#E0E9FB', fillStyle: 'solid' },
    { text: 'Ellipse', fontFamily: 'hand', fontSize: 24 },
  ),
  shape(
    'note',
    'note',
    { x: 480, y: 0, width: 170, height: 170 },
    {
      seed: 26,
      backgroundColor: '#F9EBD6',
      fillStyle: 'solid',
      strokeWidth: 0,
      roughness: 0,
    },
    { text: 'Remember the milk', fontFamily: 'hand', fontSize: 22 },
  ),
])

const mixed = scene('mixed', [
  shape(
    'rectangle',
    'under',
    { x: 0, y: 0, width: 200, height: 130 },
    {
      seed: 31,
      backgroundColor: '#E0E9FB',
      fillStyle: 'solid',
    },
  ),
  shape(
    'ellipse',
    'over',
    { x: 120, y: 60, width: 200, height: 130 },
    {
      seed: 32,
      strokeColor: '#C2453D',
      backgroundColor: '#F7E1DE',
      fillStyle: 'solid',
      opacity: 60,
    },
  ),
  path(
    'pencil',
    'pencil',
    { x: 380, y: 20 },
    [
      [0, 0],
      [14, -10],
      [30, 6],
      [52, 30],
      [80, 24],
      [104, -4],
      [130, 12],
      [150, 50],
    ],
    { seed: 33, strokeColor: '#3F8F5A', strokeWidth: 3 },
  ),
  shape(
    'diamond',
    'faded',
    { x: 380, y: 100, width: 150, height: 110 },
    {
      seed: 34,
      strokeColor: '#3A6FD8',
      backgroundColor: '#E0E9FB',
      fillStyle: 'hachure',
      opacity: 40,
    },
  ),
])

export const scenes: Scene[] = [shapes, texts, mixed]
