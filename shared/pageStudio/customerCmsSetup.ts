import { z } from 'zod'
import { CustomerSchemaUpgradeRequestSchema, CustomerSchemaUpgradeStatusSchema } from './customerSchemaUpgrade'

const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
export const CustomerCmsAdoptionRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('status') }).strict(),
  z.object({ action: z.literal('start') }).strict(),
  z.object({ action: z.literal('advance'), adoptionId: id, expectedProgressDigest: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  z.object({ action: z.literal('recover'), adoptionId: id, recoveryId: id, expectedRecoveryId: id.nullable() }).strict()
])
export const CustomerCmsSetupRequestSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('resume') }).strict(),
  z.object({ operation: z.literal('schema'), request: CustomerSchemaUpgradeRequestSchema }).strict(),
  z.object({ operation: z.literal('adoption'), request: CustomerCmsAdoptionRequestSchema }).strict()
])
export const CustomerCmsAdoptionStatusSchema = z.object({
  phase: z.enum(['idle', 'freezing', 'importing', 'ready', 'managed']),
  adoptionId: id.nullable(), progress: z.object({ consumed: z.number().int().nonnegative(), done: z.boolean() }).strict().nullable(),
  recoveryId: id.nullable(), recoveryRequired: z.boolean(), progressDigest: z.string().regex(/^[a-f0-9]{64}$/)
}).strict()
export const CustomerCmsSetupStatusSchema = z.object({
  resumeRequired: z.boolean(), prerequisites: z.array(CustomerSchemaUpgradeStatusSchema).max(5),
  adoption: CustomerCmsAdoptionStatusSchema.nullable()
}).strict()
export type CustomerCmsSetupStatus = z.infer<typeof CustomerCmsSetupStatusSchema>
export type CustomerCmsSetupRequest = z.infer<typeof CustomerCmsSetupRequestSchema>
