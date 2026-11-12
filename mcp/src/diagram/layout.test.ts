import { describe, expect, it } from 'vitest'
import { layoutGraph, type LayoutEdge, type LayoutNode } from './layout.ts'

const box = (id: string, width = 120, height = 60): LayoutNode => ({
  id,
  width,
  height,
})
const edge = (from: string, to: string, key = `${from}-${to}`): LayoutEdge => ({
  key,
  from,
  to,
})

function centre(layout: ReturnType<typeof layoutGraph>, node: LayoutNode) {
  const at = layout.nodes.get(node.id)!
  return [at.x + node.width / 2, at.y + node.height / 2] as const
}

describe('layoutGraph', () => {
  const a = box('a')
  const b = box('b')
  const c = box('c')

  it('ranks a chain top to bottom in TB', () => {
    const layout = layoutGraph(
      [a, b, c],
      [edge('a', 'b'), edge('b', 'c')],
      'TB',
    )
    const [ax, ay] = centre(layout, a)
    const [bx, by] = centre(layout, b)
    const [cx, cy] = centre(layout, c)
    expect(ay).toBeLessThan(by)
    expect(by).toBeLessThan(cy)
    expect(bx).toBeCloseTo(ax)
    expect(cx).toBeCloseTo(ax)
  })

  it('ranks along x in LR and against the direction in BT and RL', () => {
    const lr = layoutGraph([a, b], [edge('a', 'b')], 'LR')
    expect(centre(lr, a)[0]).toBeLessThan(centre(lr, b)[0])
    const bt = layoutGraph([a, b], [edge('a', 'b')], 'BT')
    expect(centre(bt, a)[1]).toBeGreaterThan(centre(bt, b)[1])
    const rl = layoutGraph([a, b], [edge('a', 'b')], 'RL')
    expect(centre(rl, a)[0]).toBeGreaterThan(centre(rl, b)[0])
  })

  it('puts siblings in one rank without overlapping', () => {
    const layout = layoutGraph(
      [a, b, c],
      [edge('a', 'b'), edge('a', 'c')],
      'TB',
    )
    const pb = layout.nodes.get('b')!
    const pc = layout.nodes.get('c')!
    expect(pb.y).toBeCloseTo(pc.y)
    const [left, right] = pb.x < pc.x ? [pb, pc] : [pc, pb]
    expect(right.x - (left.x + 120)).toBeGreaterThanOrEqual(60)
  })

  it('shifts the result so it starts at the origin', () => {
    const layout = layoutGraph(
      [a, b, c],
      [edge('a', 'b'), edge('a', 'c')],
      'LR',
    )
    const xs = [...layout.nodes.values()].map((p) => p.x)
    const ys = [...layout.nodes.values()].map((p) => p.y)
    expect(Math.min(...xs)).toBe(0)
    expect(Math.min(...ys)).toBe(0)
  })

  it('routes every edge from near its source to near its target', () => {
    const layout = layoutGraph(
      [a, b, c],
      [edge('a', 'b'), edge('b', 'c'), edge('a', 'c')],
      'TB',
    )
    for (const [key, from, to] of [
      ['a-b', a, b],
      ['b-c', b, c],
      ['a-c', a, c],
    ] as const) {
      const { points } = layout.edges.get(key)!
      expect(points.length).toBeGreaterThanOrEqual(2)
      const near = (p: readonly number[], n: LayoutNode) => {
        const at = layout.nodes.get(n.id)!
        return (
          p[0]! >= at.x - 1 &&
          p[0]! <= at.x + n.width + 1 &&
          p[1]! >= at.y - 1 &&
          p[1]! <= at.y + n.height + 1
        )
      }
      expect(near(points[0]!, from)).toBe(true)
      expect(near(points.at(-1)!, to)).toBe(true)
    }
  })

  it('routes parallel edges between the same pair separately', () => {
    const layout = layoutGraph(
      [a, b],
      [edge('a', 'b', 'one'), edge('a', 'b', 'two')],
      'TB',
    )
    expect(layout.edges.get('one')).toBeDefined()
    expect(layout.edges.get('two')).toBeDefined()
  })

  it('places an edge label beside the edge', () => {
    const layout = layoutGraph(
      [a, b],
      [{ ...edge('a', 'b'), label: { width: 70, height: 25 } }],
      'LR',
    )
    const route = layout.edges.get('a-b')!
    expect(route.label).toBeDefined()
    // LR: the edge is horizontal, so the label sits above or below it.
    const y = route.points[0]![1]
    expect(Math.abs(route.label![1] - y)).toBeGreaterThan(12.5)
  })

  it('is deterministic', () => {
    const run = () =>
      layoutGraph([a, b, c], [edge('a', 'b'), edge('a', 'c')], 'TB')
    expect(run()).toEqual(run())
  })

  it('lays out ids that are Object.prototype keys', () => {
    const ids = ['constructor', 'toString', 'hasOwnProperty', '__proto__']
    const layout = layoutGraph(
      ids.map((id) => box(id)),
      ids.slice(1).map((id, i) => edge(ids[i]!, id, id)),
      'TB',
    )
    expect([...layout.nodes.keys()]).toEqual(ids)
    expect(layout.edges.get('toString')!.points.length).toBeGreaterThan(1)
  })
})
