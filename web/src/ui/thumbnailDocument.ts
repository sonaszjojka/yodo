import type { YodoDocument } from '../core/document/types.ts'
import type { DrawingRepository } from '../storage/repository.ts'

/**
 * The document a thumbnail draws, once `fonts` (usually
 * `document.fonts.ready`) has settled too. A thumbnail draws once, so text
 * drawn before Caveat arrives would keep the fallback font's look and wrap.
 */
export async function thumbnailDocument(
  repository: DrawingRepository,
  id: string,
  fonts: Promise<unknown>,
): Promise<YodoDocument | undefined> {
  const [doc] = await Promise.all([repository.get(id), fonts])
  return doc
}
