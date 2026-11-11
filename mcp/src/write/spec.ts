// The agent element spec (ADR 0066): what the write tools accept. It is a
// smaller format than the stored one (ADR 0013): the server fills in seeds,
// fonts and defaults, and converts absolute points to the stored form.

import * as z from 'zod'
import { ARROWHEADS } from '../../../web/src/core/document/types.ts'

/** Items (elements, patches, ids or connections) one call may carry. */
export const MAX_ITEMS = 500
/** Points one line or arrow may have. */
export const MAX_SPEC_POINTS = 1000

export const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

export const elementId = z
  .string()
  .regex(ID_PATTERN)
  .describe('Letters, digits, "-" or "_", at most 64.')

const hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .describe('A #rrggbb colour, as in the light theme.')
const background = z
  .union([hex, z.literal('transparent')])
  .describe('A #rrggbb colour or "transparent".')

const coordinate = z.number()
const size = z.number().positive()
const point = z.tuple([coordinate, coordinate])
const points = z
  .array(point)
  .min(2)
  .max(MAX_SPEC_POINTS)
  .describe('Absolute [x, y] drawing points, start first.')
const content = z.string().refine((s) => s.trim() !== '', 'must not be blank')

const strokeColor = hex.optional()
const opacity = z.number().min(0).max(100).optional()
const strokeWidth = z.number().positive().max(32).optional()
const strokeStyle = z.enum(['solid', 'dashed', 'dotted']).optional()
const roughness = z.number().min(0).max(2).optional()
const fillStyle = z.enum(['hachure', 'cross-hatch', 'solid']).optional()
const roundness = z.enum(['sharp', 'round']).optional()
const fontFamily = z.enum(['hand', 'sans', 'mono']).optional()
const fontSize = z.number().min(8).max(200).optional()
const textAlign = z.enum(['left', 'center', 'right']).optional()
const arrowhead = z.enum(ARROWHEADS).nullable().optional()

const font = { fontFamily, fontSize, textAlign }

const box = {
  id: elementId.optional(),
  x: coordinate,
  y: coordinate,
  width: size,
  height: size,
  label: content.optional(),
  ...font,
  strokeColor,
  backgroundColor: background.optional(),
  fillStyle,
  strokeWidth,
  strokeStyle,
  roughness,
  opacity,
}

const linear = {
  id: elementId.optional(),
  points,
  curved: z.boolean().optional(),
  strokeColor,
  strokeWidth,
  strokeStyle,
  roughness,
  opacity,
}

export const newElementSpec = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('rectangle'), ...box, roundness }),
  z.strictObject({ type: z.literal('diamond'), ...box, roundness }),
  z.strictObject({ type: z.literal('ellipse'), ...box }),
  z.strictObject({
    type: z.literal('note'),
    id: elementId.optional(),
    x: coordinate,
    y: coordinate,
    width: size.optional(),
    height: size.optional(),
    label: content.optional(),
    ...font,
    strokeColor,
    // A note always has a colour (ADR 0038), so no "transparent".
    backgroundColor: hex.optional(),
    opacity,
  }),
  z.strictObject({
    type: z.literal('text'),
    id: elementId.optional(),
    x: coordinate,
    y: coordinate,
    text: content,
    ...font,
    strokeColor,
    opacity,
  }),
  z.strictObject({ type: z.literal('line'), ...linear }),
  z.strictObject({
    type: z.literal('arrow'),
    ...linear,
    startArrowhead: arrowhead,
    endArrowhead: arrowhead,
  }),
])

export type NewElementSpec = z.infer<typeof newElementSpec>

/** Changes to one element; which fields fit depends on its type (apply.ts). */
export const elementPatch = z.strictObject({
  id: z.string().min(1),
  x: coordinate.optional(),
  y: coordinate.optional(),
  width: size.optional(),
  height: size.optional(),
  points: points.optional(),
  text: content.optional(),
  label: z
    .string()
    .optional()
    .describe('New label text; "" removes the label.'),
  ...font,
  strokeColor,
  backgroundColor: background.optional(),
  fillStyle,
  strokeWidth,
  strokeStyle,
  roughness,
  opacity,
  roundness,
  curved: z.boolean().optional(),
  startArrowhead: arrowhead,
  endArrowhead: arrowhead,
})

export type ElementPatch = z.infer<typeof elementPatch>

export const connectionSpec = z.strictObject({
  from: z.string().min(1).describe('Id of the element the arrow starts at.'),
  to: z.string().min(1).describe('Id of the element the arrow points to.'),
  id: elementId.optional(),
  startArrowhead: arrowhead,
  endArrowhead: arrowhead.describe('Default "arrow"; null for none.'),
  strokeColor,
  strokeWidth,
  strokeStyle,
  roughness,
  opacity,
})

export type ConnectionSpec = z.infer<typeof connectionSpec>
