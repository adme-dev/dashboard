import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { CopyRevisionSchema, type CopyRevision } from '~~/shared/video/storyboard'
import { storyboardHash } from './hash'

export const StoryboardCopyInputSchema = z.object({
  scriptSegments: CopyRevisionSchema.shape.scriptSegments,
  cues: CopyRevisionSchema.shape.cues
}).strict()

/** Human content only. Identity, hash and approval are never accepted from input. */
export function prepareStoryboardCopy(input: unknown, previous: CopyRevision | null): CopyRevision {
  const content = StoryboardCopyInputSchema.parse(input)
  const contentHash = storyboardHash(content)
  if (previous && previous.contentHash === contentHash) return structuredClone(previous)
  return { ...content, id: randomUUID(), revision: (previous?.revision ?? 0) + 1, contentHash, approval: null }
}
