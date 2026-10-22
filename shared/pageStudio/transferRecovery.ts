import { z } from 'zod'
import { TransferRevisionSchema } from './transferWorkflow'

const Id = z.string().uuid()
const HeadVersion = z.number().int().positive().max(2147483646)
const Deadline = z.string().datetime({ offset: true })
const revision = { expectedRevision: TransferRevisionSchema }

/** Public actions only open a closed review or revoke it. The server derives
 * original operation, source and authority from the authenticated route scope.
 * Deadline freshness and the 24-hour ceiling are enforced against the DB clock. */
export const TransferRecoveryRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('open'), ...revision, recoveryId: Id,
    expectedHeadVersion: z.null(), deadline: Deadline }).strict(),
  z.object({ action: z.literal('revoke'), ...revision, recoveryId: Id,
    expectedHeadVersion: HeadVersion }).strict()
])
export const TransferRecoveryStatusRequestSchema = z.object(revision).strict()
const RecoveryHead = z.object({ recoveryId: Id, epoch: HeadVersion, version: HeadVersion,
  state: z.enum(['reconciling', 'revoked']), deadline: Deadline, expired: z.boolean() }).strict()

/** This view contains no private intent, session, provider or admission proof.
 * Empty actions always remain valid: a retained head is not permission to act. */
export const TransferRecoveryViewSchema = z.object({ siteId: Id, requestId: Id,
  revision: TransferRevisionSchema, recovery: RecoveryHead.nullable(),
  allowedActions: z.array(z.enum(['open', 'revoke'])).max(1)
}).strict().refine(value => value.allowedActions.every(action => action === 'open'
  ? value.recovery === null : value.recovery?.state === 'reconciling'),
{ message: 'Recovery actions do not match the saved state.' })

export type TransferRecoveryRequest = z.infer<typeof TransferRecoveryRequestSchema>
export type TransferRecoveryView = z.infer<typeof TransferRecoveryViewSchema>
