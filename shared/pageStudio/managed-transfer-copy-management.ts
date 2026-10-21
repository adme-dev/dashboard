// Small private reference protocol; never imports the full graph admission.
import { z } from 'zod'
import { managementResultSchema, ManagementCopyErrorSchema, ManagementDigestSchema as Digest } from './managementResult'

const reference = { operationId: z.uuid(), intentDigest: Digest }
export const ManagedTransferCopyManagementRequestSchema = z.object({ ...reference, action: z.enum(['prepare', 'read']), expectedEnvironment: z.literal('production') }).strict()
export const ManagedTransferCopyManagementResultSchema = managementResultSchema(z.discriminatedUnion('state', [
  z.object({ operationId: z.uuid(), state: z.literal('not-started') }).strict(),
  z.object({ operationId: z.uuid(), state: z.literal('copy-admitted'), admissionDigest: Digest }).strict()
]), ManagementCopyErrorSchema)
