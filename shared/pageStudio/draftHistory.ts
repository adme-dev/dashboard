import { z } from 'zod'

const checkpointId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/)
export const PageStudioHistoryQuerySchema = z.object({
  kind: z.enum(['drafts', 'versions']).default('drafts'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(1000).nullish()
}).strict()
export const PageStudioHistoryMutationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('restore'), checkpointId, expectedCheckpointId: checkpointId, requestId: z.string().uuid() }).strict(),
  z.object({ action: z.literal('name'), name: z.string().trim().min(1).max(120), expectedCheckpointId: checkpointId, requestId: z.string().uuid(), submitForReview: z.boolean().default(false) }).strict()
])
export type PageStudioHistoryMutation = z.infer<typeof PageStudioHistoryMutationSchema>
export interface PageStudioHistoryItem {
  id: string
  checkpointId: string
  name: string | null
  createdAt: string
  status: string
}
export interface PageStudioHistoryState {
  siteName: string
  currentCheckpointId: string | null
  currentVersionId: string | null
  canEdit: boolean
  items: PageStudioHistoryItem[]
  nextCursor: string | null
}
export interface PageStudioHistoryReceipt {
  checkpointId: string
  versionId?: string
  currentCheckpointId: string | null
  isCurrent: boolean
}
