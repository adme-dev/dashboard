import { z } from 'zod'

const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
export const CmsAdoptionControlRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('status') }).strict(),
  z.object({ action: z.literal('start') }).strict(),
  z.object({ action: z.literal('advance'), adoptionId: id, expectedProgressDigest: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  z.object({ action: z.literal('recover'), adoptionId: id, recoveryId: id, expectedRecoveryId: id.nullable() }).strict()
])
