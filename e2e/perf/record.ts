// Appends one benchmark run to docs/perf/results.jsonl (ADR 0042), so the
// history lives in git. Only when PERF_RECORD=1; a plain run just reports.

import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { arch, cpus, platform, release } from 'node:os'
import { resolve } from 'node:path'

export interface GestureResult {
  /** Frames per second over the whole gesture. */
  fps: number
  /** The slowest frame, in milliseconds. */
  maxFrameMs: number
  /** The 95th-percentile frame, in milliseconds. */
  p95FrameMs: number
}

export interface RunInfo {
  chrome: string
  channel: string
  headless: boolean
  viewport: { width: number; height: number }
  deviceScaleFactor: number
}

export interface PerfRecord {
  pan: GestureResult
  zoom: GestureResult
  draw: GestureResult
}

export const RESULTS_FILE = resolve(
  import.meta.dirname,
  '../../docs/perf/results.jsonl',
)

export function recordRun(run: RunInfo, result: PerfRecord, note?: string) {
  const line = {
    date: new Date().toISOString(),
    commit: execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
    }).trim(),
    ...(note ? { note } : {}),
    ...run,
    arch: arch(),
    cpu: cpus()[0]?.model ?? 'unknown',
    os: `${platform()} ${release()}`,
    ...result,
  }
  appendFileSync(RESULTS_FILE, `${JSON.stringify(line)}\n`)
}
