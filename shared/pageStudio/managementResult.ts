import { z } from 'zod'

export const ManagementDigestSchema = z.string().regex(/^[a-f0-9]{64}$/)
// These two pre-existing error contracts deliberately have different bounds.
export const ManagementStatusErrorSchema = z.object({
  statusCode: z.number().int().min(400).max(599), message: z.string().min(1).max(256)
}).strict()
export const ManagementCopyErrorSchema = z.object({
  statusCode: z.number().int(), message: z.string().max(256)
}).strict()

/** Shared wire structure only. Each caller retains its exact value/error validators. */
export function managementResultSchema<Value extends z.ZodType, Failure extends z.ZodType>(value: Value, error: Failure) {
  return z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), requestDigest: ManagementDigestSchema, value }).strict(),
    z.object({ ok: z.literal(false), requestDigest: ManagementDigestSchema, error }).strict()
  ])
}
