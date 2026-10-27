import { z } from 'zod'
import { GtmChangesSchema } from './gtmTypedChanges'

const UUID = z.string().uuid()
const base = { siteId: UUID, ownershipEvidenceId: UUID }
export const GtmProposalInput = z.discriminatedUnion('action', [
  z.strictObject({
    ...base,
    action: z.literal('workspace'),
    changes: GtmChangesSchema
  }),
  z.strictObject({ ...base, action: z.literal('installation') }),
  z.strictObject({
    ...base,
    action: z.literal('binding'),
    connectionId: UUID,
    containerPath: z.string().regex(/^accounts\/\d+\/containers\/\d+$/)
  }),
  z.strictObject({
    ...base,
    action: z.literal('publish'),
    sourceProposalId: UUID
  }),
  z.strictObject({
    ...base,
    action: z.literal('rollback'),
    sourceProposalId: UUID
  })
])
