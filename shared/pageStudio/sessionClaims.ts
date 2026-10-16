import { z } from 'zod'

export const PageStudioSessionCapabilitySchema = z.enum([
  'workspace:create',
  'workspace:reconnect',
  'workspace:checkpoint',
  'workspace:preview',
  'workspace:terminate',
  'workspace:status',
  'source:edit',
  'model:invoke'
])

export type PageStudioSessionCapability = z.infer<typeof PageStudioSessionCapabilitySchema>

const ScopedIdSchema = z.string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)

export const PageStudioSessionClaimsSchema = z.object({
  capabilities: z.array(PageStudioSessionCapabilitySchema).min(1).max(16),
  clientId: ScopedIdSchema,
  expiresAt: z.number().int().positive(),
  issuedAt: z.number().int().positive(),
  nonce: ScopedIdSchema.min(16),
  role: z.enum(['agency', 'client']),
  siteId: ScopedIdSchema,
  tenantId: ScopedIdSchema,
  userId: ScopedIdSchema
})

export type PageStudioSessionClaims = z.infer<typeof PageStudioSessionClaimsSchema>
