import { z } from 'zod'

const identity = { actorId: z.string().uuid(), tenantId: z.string().min(1).max(128), expectedEnvironment: z.enum(['staging', 'production']) }
export const PageStudioInspectionRequest = z.discriminatedUnion('operation', [
  z.object({ ...identity, operation: z.literal('reviews') }).strict(),
  z.object({ ...identity, siteId: z.string().uuid(), operation: z.literal('launch') }).strict(),
  z.object({ ...identity, siteId: z.string().uuid(), operation: z.literal('comparison'), versionId: z.string().uuid(), releaseId: z.string().uuid().optional() }).strict()
])
export const MAX_INSPECTION_BYTES = 17 * 1024 * 1024
