// The MCP server: read-only tools over a DrawingRepository (ADR 0061). The
// repository is injected: `index.ts` passes the HTTP one with the API token,
// or the file one (ADR 0064), and tests run the tools over both kinds.

import { McpServer } from '@modelcontextprotocol/server'
import * as z from 'zod'
import { searchDrawings } from '../../web/src/core/search/match.ts'
import { HttpError } from '../../web/src/storage/http.ts'
import type { DrawingRepository } from '../../web/src/storage/repository.ts'
import {
  formatDrawing,
  formatRender,
  formatSearch,
  formatSummaries,
  MAX_ELEMENTS,
} from './format.ts'
import {
  fitScale,
  MAX_RENDER_SIDE,
  renderPng,
  renderSvg,
  selectForRender,
  type RenderTarget,
} from './render/render.ts'
import { type ImageSource, loadSceneImages } from './render/images.ts'
import { nodeMeasure } from './render/measure.ts'
import { addDiagram } from './diagram/build.ts'
import {
  addElements,
  connectElements,
  deleteElements,
  updateElements,
} from './write/apply.ts'
import { createDrawing, writeDrawing, type Written } from './write/save.ts'
import { openLinkFor, type OpenLinks } from './openLinks.ts'
import {
  connectionSpec,
  diagramEdge,
  diagramNode,
  direction,
  elementPatch,
  MAX_ITEMS,
  newElementSpec,
} from './write/spec.ts'
import { createDocument } from '../../web/src/core/document/create.ts'
import pkg from '../package.json' with { type: 'json' }

export const INSTRUCTIONS = `Yodo is a whiteboard app. These tools read and edit the user's drawings.
Call list_drawings or search_drawings to find a drawing's id, then get_drawing for its outline,
or render_drawing to see it as an image.
Coordinates are world units: x grows to the right and y grows downward.

To draw, use create_drawing for a new drawing, or add_elements, update_elements, delete_elements
and connect on an existing one. Elements are small JSON objects:
- rectangle, diamond, ellipse: x, y, width, height (top-left and size), optional label (its text).
- note: a sticky note at x, y (200x200 unless you give width and height), optional label.
- text: x, y (top-left) and text; its size is measured for you.
- line, arrow: points, a list of absolute [x, y] points, at least two.
Optional styles: strokeColor and backgroundColor (#rrggbb, or "transparent" for a background),
fillStyle, strokeWidth, strokeStyle, roughness (0 is clean, 1 hand-drawn), opacity (0-100),
fontFamily (hand, sans, mono), fontSize, textAlign; arrows take startArrowhead and endArrowhead.
Give an element an id (letters, digits, - and _) to refer to it later in the same session;
otherwise one is made. Use connect, not a plain arrow, to join two elements: its arrow stays
attached when they move.
For a flowchart or any box-and-arrow diagram, prefer create_diagram: give nodes, edges and a
direction, and it sizes, places and connects the shapes for you.
Every write takes the drawing's revision (the "rev" get_drawing shows). If someone else saved
in between, the write is refused: call get_drawing again and retry.
When drawings are files, a write's result also names the .yodo file and, unless the drawing is
large, gives an "Open in Yodo" link: give the user that link (or the file to import) when you're done.`

/** Tells the agent that a tool only reads, so a client can skip confirmations. */
const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const

/** A write that edits only the user's drawings; only deletes lose work. */
function writes(destructive = false) {
  return {
    readOnlyHint: false,
    openWorldHint: false,
    idempotentHint: false,
    destructiveHint: destructive,
  } as const
}

const drawingId = z
  .string()
  .min(1)
  .describe(
    'A drawing id from list_drawings, search_drawings or create_drawing.',
  )
const revision = z
  .number()
  .int()
  .min(1)
  .optional()
  .describe(
    'The revision you read (the "rev" from get_drawing or a previous write). Refused if the drawing has changed since.',
  )
const writtenIds = z.array(z.string())

function writeOutput(key: 'created' | 'updated' | 'deleted') {
  return z.object({
    drawingId: z.string().describe('The drawing that was written.'),
    revision: z.number().int().describe('Its revision after this write.'),
    [key]: writtenIds.describe(`Ids of the ${key} elements, in order.`),
    file: z
      .string()
      .optional()
      .describe("The drawing's .yodo file (file backend only)."),
    openUrl: z
      .string()
      .optional()
      .describe(
        'A link that opens this revision in the Yodo app, to give the user (file backend only; absent for large drawings).',
      ),
  })
}

interface TextResult {
  [key: string]: unknown
  content: { type: 'text'; text: string }[]
  isError?: boolean
  structuredContent?: Record<string, unknown>
}

/** render_drawing's result: its text, then the image (MCP image content). */
interface ImageResult {
  [key: string]: unknown
  content: [
    { type: 'text'; text: string },
    { type: 'image'; data: string; mimeType: 'image/png' | 'image/svg+xml' },
  ]
}

type ToolResult = TextResult | ImageResult

function text(body: string): TextResult {
  return { content: [{ type: 'text', text: body }] }
}

function failure(body: string): TextResult {
  return { ...text(body), isError: true }
}

/**
 * A failed call as a tool result the agent can act on, rather than a protocol
 * error it can't (ADR 0061: limits and bad input say how to fix the call).
 */
export function toolError(
  error: unknown,
  { baseUrl, dir }: ServerOptions = {},
): TextResult {
  // A Node file-system error from the file backend carries a `code` (ADR 0064).
  if (
    dir !== undefined &&
    typeof (error as { code?: unknown })?.code === 'string'
  ) {
    return failure(
      `Can't read the drawings in ${dir}: ${(error as Error).message}. ` +
        'Check that YODO_MCP_DIR is a folder this process can read and write.',
    )
  }
  const where = baseUrl ? ` at ${baseUrl.href}` : ''
  if (error instanceof HttpError) {
    if (error.status === 401) {
      return failure(
        `Yodo${where} refused the request (401): the API token is missing or wrong. ` +
          "Set YODO_API_TOKEN to the server's YODO_API_TOKEN (ADR 0063).",
      )
    }
    if (error.status === 403) {
      // Keep the server's own reason: a Host/Origin rejection (ADR 0020) can't
      // be fixed with a token.
      return failure(
        `Yodo${where} refused the request (403): ${error.message}. ` +
          "Check that YODO_URL's host is in the server's YODO_ALLOWED_ORIGINS, " +
          'and set YODO_API_TOKEN if the server requires an Origin header or a password.',
      )
    }
    return failure(`Yodo${where} answered ${error.status}: ${error.message}`)
  }
  if (error instanceof TypeError) {
    return failure(
      `Can't reach Yodo${where}: ${error.message}. Is the server running, and is YODO_URL right?`,
    )
  }
  return failure(
    `The call failed: ${error instanceof Error ? error.message : String(error)}`,
  )
}

export interface ServerOptions {
  /** Named in connection errors so the user sees which URL failed. */
  baseUrl?: URL
  /** The file backend's directory, named in file-system errors. */
  dir?: string
  /** With the file backend: write results add the file and an open link (ADR 0069). */
  openLinks?: OpenLinks
  /** Where render_drawing reads pictures; without it, images are placeholders (ADR 0070). */
  images?: ImageSource
}

export function createServer(
  repo: DrawingRepository,
  options: ServerOptions = {},
): McpServer {
  const server = new McpServer(
    { name: 'yodo', version: pkg.version },
    { instructions: INSTRUCTIONS },
  )

  async function run(body: () => Promise<ToolResult>): Promise<ToolResult> {
    try {
      return await body()
    } catch (error) {
      return toolError(error, options)
    }
  }

  server.registerTool(
    'list_drawings',
    {
      title: 'List drawings',
      description:
        'Lists every drawing (not those in Trash), newest first: id, name, last saved time and revision.',
      annotations: READ_ONLY,
    },
    () => run(async () => text(formatSummaries(await repo.list()))),
  )

  server.registerTool(
    'search_drawings',
    {
      title: 'Search drawings',
      description:
        'Finds drawings whose name or canvas text (free text and shape labels) contains the query, ' +
        "case-insensitively, as Yodo's own search does. Returns ids, names and the matching text.",
      inputSchema: z.object({
        query: z
          .string()
          .trim()
          .min(1)
          .describe('Text to look for, matched literally.'),
      }),
      annotations: READ_ONLY,
    },
    ({ query }) =>
      run(async () => {
        const [summaries, index] = await Promise.all([
          repo.list(),
          repo.searchIndex(),
        ])
        return text(
          formatSearch(searchDrawings(summaries, index, query), query),
        )
      }),
  )

  server.registerTool(
    'get_drawing',
    {
      title: 'Get a drawing',
      description:
        "A drawing's outline: its revision and bounds, then one line per element, bottom first, " +
        'with id, type, box (x,y widthxheight), and text, labels, arrow bindings or points. ' +
        `Styles and colours are left out. Lists at most ${MAX_ELEMENTS} elements per call; ` +
        'the result says which offset lists the next ones.',
      inputSchema: z.object({
        id: z
          .string()
          .min(1)
          .describe('A drawing id from list_drawings or search_drawings.'),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe(
            `Index of the first element to list (default 0), for drawings over ${MAX_ELEMENTS} elements.`,
          ),
      }),
      annotations: READ_ONLY,
    },
    ({ id, offset = 0 }) =>
      run(async () => {
        const found = await repo.getWithRevision(id)
        if (!found) {
          return failure(
            `No drawing with id ${JSON.stringify(id)}. Call list_drawings or search_drawings for ids.`,
          )
        }
        const total = found.doc.elements.length
        if (offset > 0 && offset >= total) {
          return failure(
            `offset ${offset} is past the last element: drawing ${JSON.stringify(id)} has ${total} elements` +
              (total > 0 ? ` (offsets 0-${total - 1}).` : '.'),
          )
        }
        return text(formatDrawing(found.doc, found.revision, offset))
      }),
  )

  server.registerTool(
    'render_drawing',
    {
      title: 'Render a drawing',
      description:
        'Draws a drawing as an image you can look at, as Yodo exports it: the whole drawing, ' +
        'only some elements (ids), or one area (region, clipped there). ' +
        `PNG by default (the longer side at most ${MAX_RENDER_SIDE} px; use region to zoom in), or SVG. ` +
        'The text beside the image says how its pixels map to drawing coordinates.',
      inputSchema: z.object({
        id: z
          .string()
          .min(1)
          .describe('A drawing id from list_drawings or search_drawings.'),
        ids: z
          .array(z.string().min(1))
          .min(1)
          .optional()
          .describe(
            'Draw only these element ids (from get_drawing). Leave out for the whole drawing.',
          ),
        region: z
          .object({
            x: z.number(),
            y: z.number(),
            width: z.number().positive(),
            height: z.number().positive(),
          })
          .optional()
          .describe(
            'Draw only this area, in drawing units (the coordinates get_drawing prints).',
          ),
        format: z
          .enum(['png', 'svg'])
          .optional()
          .describe('png (default) or svg.'),
        theme: z
          .enum(['light', 'dark'])
          .optional()
          .describe('light (default) or dark.'),
        scale: z
          .number()
          .min(0.1)
          .max(4)
          .optional()
          .describe(
            `PNG pixels per drawing unit (default 1), reduced if the image would pass ${MAX_RENDER_SIDE} px.`,
          ),
      }),
      annotations: READ_ONLY,
    },
    ({ id, ids, region, format = 'png', theme = 'light', scale = 1 }) =>
      run(async () => {
        if (ids && region) {
          return failure(
            'Pass either ids or region, not both: ids draws chosen elements, region draws one area.',
          )
        }
        const found = await repo.getWithRevision(id)
        if (!found) {
          return failure(
            `No drawing with id ${JSON.stringify(id)}. Call list_drawings or search_drawings for ids.`,
          )
        }
        const target: RenderTarget = ids
          ? { kind: 'ids', ids }
          : region
            ? { kind: 'region', region }
            : { kind: 'all' }
        const selection = selectForRender(
          found.doc.elements,
          target,
          nodeMeasure(),
        )
        if ('error' in selection) return failure(selection.error)
        const { elements, frame } = selection
        const images = await loadSceneImages(
          elements,
          options.images,
          id,
          format,
        )
        const summary = {
          doc: found.doc,
          revision: found.revision,
          format,
          theme,
          elements,
          frame,
          images,
        }
        if (format === 'svg') {
          const svg = renderSvg(elements, frame, { theme, images })
          return {
            content: [
              { type: 'text', text: formatRender(summary) },
              {
                type: 'image',
                data: Buffer.from(svg, 'utf8').toString('base64'),
                mimeType: 'image/svg+xml',
              },
            ],
          }
        }
        const fitted = fitScale(frame, scale)
        const png = renderPng(elements, frame, {
          theme,
          scale: fitted,
          images,
        })
        return {
          content: [
            { type: 'text', text: formatRender({ ...summary, scale: fitted }) },
            {
              type: 'image',
              data: png.toString('base64'),
              mimeType: 'image/png',
            },
          ],
        }
      }),
  )

  /** A write's result: the facts as text, and the same as structured content. */
  async function result(
    key: 'created' | 'updated' | 'deleted',
    outcome: Written,
  ): Promise<TextResult> {
    if ('error' in outcome) return failure(outcome.error)
    const { drawingId: id, revision: rev, ids } = outcome
    const summary =
      `Drawing ${JSON.stringify(id)} is now at revision ${rev}. ` +
      `${key[0]!.toUpperCase()}${key.slice(1)} ${ids.length} element(s)` +
      (ids.length > 0 ? `: ${ids.join(', ')}.` : '.')
    const structured = { drawingId: id, revision: rev, [key]: ids }
    if (!options.openLinks) {
      return { ...text(summary), structuredContent: structured }
    }
    const link = await openLinkFor(options.openLinks, id, rev)
    return {
      ...text(`${summary}\n${link.text}`),
      structuredContent: {
        ...structured,
        ...(link.file !== undefined ? { file: link.file } : {}),
        ...(link.openUrl !== undefined ? { openUrl: link.openUrl } : {}),
      },
    }
  }

  const elements = z
    .array(newElementSpec)
    .max(MAX_ITEMS)
    .describe(
      'Elements to add, drawn in this order on top (see the server instructions for the fields).',
    )

  server.registerTool(
    'create_drawing',
    {
      title: 'Create a drawing',
      description:
        'Creates a new drawing, optionally with elements, and returns its id, revision and the new element ids. ' +
        'Join elements afterwards with connect.',
      inputSchema: z.object({
        name: z.string().trim().min(1).max(200).describe('The drawing name.'),
        elements: elements.optional(),
      }),
      outputSchema: writeOutput('created'),
      annotations: writes(),
    },
    ({ name, elements: specs = [] }) =>
      run(async () =>
        result(
          'created',
          await createDrawing(repo, createDocument(name), (doc) =>
            addElements(doc, specs, nodeMeasure()),
          ),
        ),
      ),
  )

  server.registerTool(
    'add_elements',
    {
      title: 'Add elements',
      description:
        'Adds rectangles, diamonds, ellipses, notes, text, lines and arrows to a drawing, on top of what is there. ' +
        'Line and arrow points are absolute. Returns the new ids; give your own ids to refer to elements later.',
      inputSchema: z.object({
        drawingId,
        revision,
        elements: elements.min(1),
      }),
      outputSchema: writeOutput('created'),
      annotations: writes(),
    },
    ({ drawingId: id, revision: rev, elements: specs }) =>
      run(async () =>
        result(
          'created',
          await writeDrawing(repo, id, rev, (doc) =>
            addElements(doc, specs, nodeMeasure()),
          ),
        ),
      ),
  )

  server.registerTool(
    'update_elements',
    {
      title: 'Update elements',
      description:
        'Changes existing elements by id: move (x, y), resize (width, height), new points (absolute), ' +
        'text, label ("" removes it), fonts or styles. Only the fields an element has are accepted. ' +
        'Arrows attached to a moved element follow it; an arrow moved by itself, or an arrow end moved, comes loose.',
      inputSchema: z.object({
        drawingId,
        revision,
        patches: z
          .array(elementPatch)
          .min(1)
          .max(MAX_ITEMS)
          .describe('One object per element: its id and the fields to change.'),
      }),
      outputSchema: writeOutput('updated'),
      annotations: writes(),
    },
    ({ drawingId: id, revision: rev, patches }) =>
      run(async () =>
        result(
          'updated',
          await writeDrawing(repo, id, rev, (doc) =>
            updateElements(doc, patches, nodeMeasure()),
          ),
        ),
      ),
  )

  server.registerTool(
    'delete_elements',
    {
      title: 'Delete elements',
      description:
        'Deletes elements by id. Arrows attached to them stay where they are, detached.',
      inputSchema: z.object({
        drawingId,
        revision,
        ids: z
          .array(z.string().min(1))
          .min(1)
          .max(MAX_ITEMS)
          .describe('Ids of the elements to delete (from get_drawing).'),
      }),
      outputSchema: writeOutput('deleted'),
      annotations: writes(true),
    },
    ({ drawingId: id, revision: rev, ids }) =>
      run(async () =>
        result(
          'deleted',
          await writeDrawing(repo, id, rev, (doc) => deleteElements(doc, ids)),
        ),
      ),
  )

  server.registerTool(
    'connect',
    {
      title: 'Connect elements',
      description:
        'Draws an arrow from one element to another for each connection, attached at both ends ' +
        'so it follows when either moves. Ends attach to rectangles, diamonds, ellipses, notes, images, ' +
        'lines and arrows (including an arrow made earlier in the same call). Returns the arrow ids.',
      inputSchema: z.object({
        drawingId,
        revision,
        connections: z
          .array(connectionSpec)
          .min(1)
          .max(MAX_ITEMS)
          .describe(
            'One object per arrow: from and to element ids, plus optional id and style.',
          ),
      }),
      outputSchema: writeOutput('created'),
      annotations: writes(),
    },
    ({ drawingId: id, revision: rev, connections }) =>
      run(async () =>
        result(
          'created',
          await writeDrawing(repo, id, rev, (doc) =>
            connectElements(doc, connections),
          ),
        ),
      ),
  )

  server.registerTool(
    'create_diagram',
    {
      title: 'Create a diagram',
      description:
        'Lays out a flowchart or box-and-arrow diagram from nodes and edges, with no coordinates needed: ' +
        'each node becomes a shape sized to its label, each edge an arrow attached at both ends, with its label beside it. ' +
        'Give name for a new drawing, or drawingId (and revision) to add the diagram below what a drawing has. ' +
        'Returns the ids: nodes, then arrows, then edge labels.',
      inputSchema: z.object({
        name: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .optional()
          .describe('The name of a new drawing. Give this or drawingId.'),
        drawingId: drawingId
          .optional()
          .describe('An existing drawing to add to. Give this or name.'),
        revision,
        nodes: z
          .array(diagramNode)
          .min(1)
          .max(MAX_ITEMS)
          .describe('The shapes: id, label, optional shape and colours.'),
        edges: z
          .array(diagramEdge)
          .max(MAX_ITEMS)
          .optional()
          .describe('The arrows between nodes, by node id.'),
        direction: direction.optional(),
        x: z
          .number()
          .optional()
          .describe("Left edge of the diagram; default: the drawing's left."),
        y: z
          .number()
          .optional()
          .describe('Top edge of the diagram; default: below the drawing.'),
      }),
      outputSchema: writeOutput('created'),
      annotations: writes(),
    },
    ({ name, drawingId: id, revision: rev, nodes, edges = [], ...place }) =>
      run(async () => {
        if ((name === undefined) === (id === undefined)) {
          return failure(
            'Give either name (for a new drawing) or drawingId (to add to one), not both or neither.',
          )
        }
        const spec = {
          nodes,
          edges,
          direction: place.direction ?? 'TB',
          ...(place.x !== undefined ? { x: place.x } : {}),
          ...(place.y !== undefined ? { y: place.y } : {}),
        }
        const change = (doc: Parameters<typeof addDiagram>[0]) =>
          addDiagram(doc, spec, nodeMeasure())
        return result(
          'created',
          id === undefined
            ? await createDrawing(repo, createDocument(name!), change)
            : await writeDrawing(repo, id, rev, change),
        )
      }),
  )

  return server
}
