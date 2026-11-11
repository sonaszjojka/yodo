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
import { nodeMeasure } from './render/measure.ts'
import pkg from '../package.json' with { type: 'json' }

export const INSTRUCTIONS = `Yodo is a whiteboard app. These tools read the user's drawings.
Call list_drawings or search_drawings to find a drawing's id, then get_drawing for its outline,
or render_drawing to see it as an image.
Coordinates are world units: x grows to the right and y grows downward.`

/** Tells the agent that a tool only reads, so a client can skip confirmations. */
const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const

interface TextResult {
  [key: string]: unknown
  content: { type: 'text'; text: string }[]
  isError?: boolean
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
        const summary = {
          doc: found.doc,
          revision: found.revision,
          format,
          theme,
          elements,
          frame,
        }
        if (format === 'svg') {
          const svg = renderSvg(elements, frame, { theme })
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
        const png = renderPng(elements, frame, { theme, scale: fitted })
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

  return server
}
