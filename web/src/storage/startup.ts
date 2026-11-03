import { createDocument } from '../core/document/create.ts'
import type { YodoDocument } from '../core/document/types.ts'
import type { DrawingRepository } from './repository.ts'

/**
 * The drawing to open at startup: the one saved most recently, or a new,
 * unsaved one. Interim until the Home screen and its routes (roadmap 1.15).
 */
export async function openLastDrawing(
  repository: DrawingRepository,
): Promise<YodoDocument> {
  const summaries = await repository.list()
  const latest = summaries.reduce<(typeof summaries)[number] | undefined>(
    (best, s) => (!best || s.updatedAt > best.updatedAt ? s : best),
    undefined,
  )
  // It may have been deleted since the list (another tab); start fresh then.
  return (latest && (await repository.get(latest.id))) ?? createDocument()
}
