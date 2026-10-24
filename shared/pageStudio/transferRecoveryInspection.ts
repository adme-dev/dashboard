import { z } from 'zod'
import { ContentAttachmentRequestSchema } from './content-attachment'

const Id = z.string().uuid()
const Digest = z.string().regex(/^[a-f0-9]{64}$/)
const Version = z.number().int().positive().max(2147483646)
const Reference = z.object({ operationId: Id, intentDigest: Digest }).strict()
const Closed = Reference.extend({ recoveryId: Id, epoch: Version, version: Version, mode: z.literal('closed') }).strict()
const Inspection = z.object({ operatorId: Id, loginSessionHash: Digest,
  pg: z.object({ requestId: Id, requestRevision: Version, recoveryId: Id, epoch: Version,
    version: Version, deadline: z.string().datetime() }).strict() }).strict()

/** Private trusted invocation only. PG and D1 versions have distinct meanings.
 * An acknowledgment is a fresh inspection result, never transfer admission. */
export const TransferRecoveryInspectionRequestSchema = z.discriminatedUnion('purpose', [
  z.object({ purpose: z.literal('observe'), inspection: Inspection,
    request: Reference.extend({ resourceRequest: ContentAttachmentRequestSchema }).strict(),
    requestDigest: Digest, recovery: Closed }).strict(),
  z.object({ purpose: z.literal('close'), inspection: Inspection,
    transition: z.object({ eventId: Id, previous: z.null(), next: Closed.extend({
      admissionId: z.null(), appliedDigest: z.null(), deadline: z.null(), pendingDigest: z.null(),
      preparedDigest: z.null(), reconciliationDigest: z.null(), reviewDigest: z.null(), revision: z.null()
    }).strict() }).strict() }).strict()
])
export const TransferRecoveryInspectionAcknowledgmentSchema = z.object({
  purpose: z.enum(['observe', 'close']), envelopeDigest: Digest
}).strict()
