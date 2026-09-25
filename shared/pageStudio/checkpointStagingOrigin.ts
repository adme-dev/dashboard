import { z } from 'zod'

const common = {
  formatVersion: z.literal(1),
  environment: z.enum(['staging', 'production']),
  userId: z.string().uuid(), role: z.enum(['agency', 'client']),
  loginSessionHash: z.string().regex(/^[a-f0-9]{64}$/)
}
export const CheckpointStagingOriginSchema = z.discriminatedUnion('source', [
  z.object({ ...common, source: z.literal('native-login') }).strict(),
  z.object({ ...common, source: z.literal('studio-session'), nonce: z.string().min(16).max(128).regex(/^[A-Za-z0-9_-]+$/) }).strict(),
  z.object({ ...common, source: z.literal('provisioning'), requestKey: z.string().min(1).max(200), proposalRevision: z.number().int().positive() }).strict()
])
export type CheckpointStagingOrigin = z.infer<typeof CheckpointStagingOriginSchema>

export const CheckpointStagingRequestSchema = z.object({
  scope: z.object({ tenantId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/), clientId: z.string().uuid(), siteId: z.string().uuid() }).strict(),
  auditId: z.string().uuid(), checkpointId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
  digest: z.string().regex(/^[a-f0-9]{64}$/), expectedEnvironment: z.enum(['staging', 'production'])
}).strict()
export type CheckpointStagingRequest = z.infer<typeof CheckpointStagingRequestSchema>
