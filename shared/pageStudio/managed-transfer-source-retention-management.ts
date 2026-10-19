import { z } from 'zod'

const Digest = z.string().regex(/^[a-f0-9]{64}$/)
const Value = z.unknown().refine(value => value !== undefined)
export const ManagedTransferSourceRetentionManagementRequestSchema = z.object({ expectedEnvironment: z.literal('production'), authorization: Value }).strict()
export const ManagedTransferSourceRetentionManagementResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), requestDigest: Digest, value: Value }).strict(),
  z.object({ ok: z.literal(false), requestDigest: Digest, error: z.object({ statusCode: z.number().int().min(400).max(599), message: z.string().min(1).max(256) }).strict() }).strict()
])
