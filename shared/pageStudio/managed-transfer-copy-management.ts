// Small private reference protocol; never imports the full graph admission.
import { z } from 'zod'

const Digest = z.string().regex(/^[a-f0-9]{64}$/)
const reference = { operationId: z.uuid(), intentDigest: Digest }
export const ManagedTransferCopyManagementRequestSchema = z.object({ ...reference, action: z.enum(['prepare', 'read']), expectedEnvironment: z.literal('production') }).strict()
export const ManagedTransferCopyManagementResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), requestDigest: Digest, value: z.discriminatedUnion('state', [
    z.object({ operationId: z.uuid(), state: z.literal('not-started') }).strict(),
    z.object({ operationId: z.uuid(), state: z.literal('copy-admitted'), admissionDigest: Digest }).strict()
  ]) }).strict(),
  z.object({ ok: z.literal(false), requestDigest: Digest, error: z.object({ statusCode: z.number().int(), message: z.string().max(256) }).strict() }).strict()
])
