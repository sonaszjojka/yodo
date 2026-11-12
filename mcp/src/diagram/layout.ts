// The diagram layout seam (ADR 0068): nodes with their sizes and edges in,
// positions and routes out. This is the only module that knows about dagre,
// so the engine can change without touching create_diagram.

import dagre from '@dagrejs/dagre'
import type { Point } from '../../../web/src/core/document/types.ts'

export type Direction = 'TB' | 'BT' | 'LR' | 'RL'

export type LayoutNode = { id: string; width: number; height: number }

export type LayoutEdge = {
  /** Unique per edge, so parallel edges between one pair stay apart. */
  key: string
  from: string
  to: string
  /** The size of the edge's label, which the layout leaves room for. */
  label?: { width: number; height: number }
}

export type Layout = {
  /** Each node's top-left corner. The whole layout starts at (0, 0). */
  nodes: Map<string, { x: number; y: number }>
  /** Each edge's route from source to target, and its label's centre. */
  edges: Map<string, { points: Point[]; label?: Point }>
  width: number
  height: number
}

/** Space between nodes in a rank, between ranks and between edges. */
const NODE_GAP = 60
const RANK_GAP = 80
const EDGE_GAP = 20
/** How far a label sits from its edge. */
const LABEL_OFFSET = 12

/** A layered (Sugiyama) layout of a directed graph, ranked along `direction`. */
export function layoutGraph(
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[],
  direction: Direction,
): Layout {
  const g = new dagre.graphlib.Graph({ multigraph: true })
  g.setGraph({
    rankdir: direction,
    nodesep: NODE_GAP,
    ranksep: RANK_GAP,
    edgesep: EDGE_GAP,
    marginx: 0,
    marginy: 0,
  })
  g.setDefaultEdgeLabel(() => ({}))
  // graphlib keys plain objects by node id, so an agent's id such as
  // "constructor" or "__proto__" would hit Object.prototype. dagre only sees
  // ids of our own; the result is keyed by the caller's ids again.
  const inner = new Map(nodes.map((node, i) => [node.id, `n${i}`]))
  const nodeOf = (id: string) => inner.get(id) ?? id
  nodes.forEach((node, i) => {
    g.setNode(`n${i}`, { width: node.width, height: node.height })
  })
  edges.forEach((edge, i) => {
    g.setEdge(
      nodeOf(edge.from),
      nodeOf(edge.to),
      edge.label
        ? {
            width: edge.label.width,
            height: edge.label.height,
            // Beside the edge rather than on it: free text has no background,
            // so a centred label would be struck through by its own arrow.
            labelpos: 'r',
            labeloffset: LABEL_OFFSET,
          }
        : {},
      `e${i}`,
    )
  })
  dagre.layout(g)

  const placed = nodes.map((node, i) => {
    const at = g.node(`n${i}`) as { x: number; y: number }
    return { node, x: at.x - node.width / 2, y: at.y - node.height / 2 }
  })
  const left = Math.min(...placed.map((p) => p.x))
  const top = Math.min(...placed.map((p) => p.y))
  const shift = (x: number, y: number): Point => [x - left, y - top]

  const layout: Layout = {
    nodes: new Map(),
    edges: new Map(),
    width: 0,
    height: 0,
  }
  for (const { node, x, y } of placed) {
    const [px, py] = shift(x, y)
    layout.nodes.set(node.id, { x: px, y: py })
    layout.width = Math.max(layout.width, px + node.width)
    layout.height = Math.max(layout.height, py + node.height)
  }
  edges.forEach((edge, i) => {
    const routed = g.edge({
      v: nodeOf(edge.from),
      w: nodeOf(edge.to),
      name: `e${i}`,
    }) as {
      points: { x: number; y: number }[]
      x?: number
      y?: number
    }
    layout.edges.set(edge.key, {
      points: routed.points.map((p) => shift(p.x, p.y)),
      ...(edge.label && routed.x !== undefined && routed.y !== undefined
        ? { label: shift(routed.x, routed.y) }
        : {}),
    })
  })
  return layout
}
