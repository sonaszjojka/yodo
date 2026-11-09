import { arrowheadOps } from '../core/geometry/arrowhead.ts'
import type { Arrowhead } from '../core/document/types.ts'

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
      <line
        x1="-31"
        y1="0"
        x2="0"
        y2="0"
        strokeDasharray={head === 'mixed' ? '5 5' : undefined}
      />
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
