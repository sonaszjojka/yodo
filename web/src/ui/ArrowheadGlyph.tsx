import { arrowheadOps, type HeadOp } from '../core/geometry/arrowhead.ts'
import type { Arrowhead } from '../core/document/types.ts'

/** The shaft's span in the glyph, tip at 0. */
const SHAFT: [number, number] = [-31, 0]

/**
 * The shaft with the inside of every hollow head cut out, so it does not show
 * through, whatever is behind the button (the canvas does the same with a fill,
 * ADR 0055). Spans along x, in the glyph's own coordinates.
 */
function shaftSegments(ops: readonly HeadOp[]): [number, number][] {
  const gaps = ops
    .flatMap((op): [number, number][] => {
      if (op.kind === 'path' || op.filled) return []
      if (op.kind === 'circle') {
        return [
          [op.center[0] - op.diameter / 2, op.center[0] + op.diameter / 2],
        ]
      }
      const xs = op.points.map((p) => p[0])
      return [[Math.min(...xs), Math.max(...xs)]]
    })
    .sort((a, b) => a[0] - b[0])
  const segments: [number, number][] = []
  let from = SHAFT[0]
  for (const [start, stop] of gaps) {
    if (start > from) segments.push([from, Math.min(start, SHAFT[1])])
    from = Math.max(from, stop)
  }
  if (from < SHAFT[1]) segments.push([from, SHAFT[1]])
  return segments
}

/**
 * A line ending in `head`, drawn from the same shapes as the canvas and the
 * exports (ADR 0055). The line is long enough for the head to be full size;
 * a start head is the same picture mirrored.
 */
export function ArrowheadGlyph({
  head,
  end,
}: {
  head: Arrowhead | null | 'mixed'
  end: 'start' | 'end'
}) {
  const ops =
    head && head !== 'mixed' ? arrowheadOps(head, [-60, 0], [0, 0]) : []
  return (
    <svg
      width="26"
      height="22"
      viewBox="-33 -11 40 22"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      // A mixed value shows a dashed line, like the width control.
      transform={end === 'start' ? 'scale(-1 1)' : undefined}
    >
      {shaftSegments(ops).map(([from, to]) => (
        <line
          key={from}
          x1={from}
          y1="0"
          x2={to}
          y2="0"
          strokeDasharray={head === 'mixed' ? '5 5' : undefined}
        />
      ))}
      {ops.map((op, i) =>
        op.kind === 'path' ? (
          <polyline
            key={i}
            points={op.points.map((p) => p.join(',')).join(' ')}
          />
        ) : op.kind === 'polygon' ? (
          <polygon
            key={i}
            points={op.points.map((p) => p.join(',')).join(' ')}
            fill={op.filled ? 'currentColor' : 'none'}
          />
        ) : (
          <circle
            key={i}
            cx={op.center[0]}
            cy={op.center[1]}
            r={op.diameter / 2}
            fill={op.filled ? 'currentColor' : 'none'}
          />
        ),
      )}
    </svg>
  )
}
