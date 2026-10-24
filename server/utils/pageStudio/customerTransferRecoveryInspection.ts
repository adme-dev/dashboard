import { createError } from 'h3'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { contentAttachmentIdentity } from '~~/shared/pageStudio/content-attachment'
import { requireCustomerInspectionAuthority } from '~~/shared/pageStudio/customerInspectionAuthority'
import { TransferRecoveryInspectionRequestSchema, TransferRecoveryInspectionAcknowledgmentSchema } from '~~/shared/pageStudio/transferRecoveryInspection'
import type { RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'
import { readCustomerTransferRecovery } from './customerTransferRecovery'
import { assertManagedTransferSource } from './managedTransferIntent'

const denied = () => createError({ statusCode: 403, statusMessage: 'Current recovery inspection authority is required' })
type Intent = Parameters<typeof assertManagedTransferSource>[1]

/** Read-only PG acknowledgment for one exact close/observation envelope. The
 * trusted caller supplies a genuine current operator login, never a browser
 * override or the expired original grant. No D1 writes or phase admission. */
export async function authorizeCustomerTransferRecoveryInspection(input: unknown,
  dependencies: { runTransaction?: RunPageStudioTransaction } = {}) {
  const parsed = TransferRecoveryInspectionRequestSchema.safeParse(input)
  if (!parsed.success) throw denied()
  // Zod detaches nested plain data before the first await; retain that exact
  // envelope through every database check and bind every field in the result.
  const envelope = parsed.data, { inspection } = envelope, pg = inspection.pg
  const reference = envelope.purpose === 'observe' ? envelope.request : envelope.transition.next
  const d1 = envelope.purpose === 'observe' ? envelope.recovery : envelope.transition.next
  if (d1.operationId !== reference.operationId || d1.intentDigest !== reference.intentDigest
    || d1.recoveryId !== pg.recoveryId || d1.epoch !== pg.epoch
    || (envelope.purpose === 'close' && (d1.epoch !== 1 || d1.version !== 1))) throw denied()
  const envelopeDigest = await collectionDigest(envelope)
  if (envelope.purpose === 'observe' && (envelope.request.resourceRequest.scope.environment !== 'production'
    || envelope.requestDigest !== await collectionDigest(envelope.request))) throw denied()
  try {
    return await (dependencies.runTransaction ?? transactionWithoutRetry)(async (db) => {
      const rows = (await db.query<{ site_id: string, intent: Intent, intent_digest: string }>(`
        SELECT r.site_id,i.intent,i.intent_digest FROM page_studio_transfer_requests r
        JOIN page_studio_managed_transfer_intents i ON i.operation_id=r.operation_id AND i.intent_digest=r.intent_digest
        WHERE r.request_id=$1 AND r.revision=$2 AND r.operation_id=$3 AND r.intent_digest=$4`,
      [pg.requestId, pg.requestRevision, reference.operationId, reference.intentDigest])).rows
      const stored = rows[0]
      if (rows.length !== 1 || !stored || await collectionDigest(stored.intent) !== reference.intentDigest) throw denied()
      const { authority } = stored.intent
      // Reuse original-party inspection and its principal-before-site lock order
      // inside THIS transaction. This does not invoke legacy transfer admission.
      const originalAuthority = () => readCustomerTransferRecovery({ siteId: stored.site_id, requestId: pg.requestId,
        operator: { actorId: inspection.operatorId, loginSessionHash: inspection.loginSessionHash },
        query: { expectedRevision: pg.requestRevision } }, { runTransaction: work => work(db) })
      await originalAuthority()
      const check = async () => {
        const owner = await requireCustomerInspectionAuthority(db, { actorId: authority.owner.identityId,
          accountId: authority.owner.accountId, workspaceId: authority.owner.workspaceId, siteId: stored.site_id })
        if (owner.tenantId !== authority.source.tenantId || owner.clientId !== authority.source.clientId) throw denied()
        const head = (await db.query(`SELECT 1 FROM page_studio_transfer_recovery_heads
          WHERE operation_id=$1 AND intent_digest=$2 AND recovery_id=$3 AND epoch=$4 AND cas_version=$5
            AND mode='reconciling' AND deadline=$6::timestamptz AND deadline>clock_timestamp()
            AND review_revision IS NULL AND review_digest IS NULL AND reconciliation_digest IS NULL
            AND admission_id IS NULL AND d1_prepared_digest IS NULL AND applied_grant_digest IS NULL`,
        [reference.operationId, reference.intentDigest, pg.recoveryId, pg.epoch, pg.version, pg.deadline])).rows
        if (head.length !== 1 || (await db.query('SELECT 1 FROM page_studio_managed_transfer_completions WHERE operation_id=$1',
          [reference.operationId])).rows.length) throw denied()
        await assertManagedTransferSource(db, stored.intent)
        if (envelope.purpose === 'observe') {
          const retained = (await db.query<{ intent_digest: string, request: unknown, request_digest: string, identity: string }>(
            'SELECT intent_digest,request,request_digest,identity FROM page_studio_managed_transfer_resources WHERE operation_id=$1',
            [reference.operationId])).rows
          const resource = envelope.request.resourceRequest, row = retained[0]
          if (retained.length !== 1 || !row || row.intent_digest !== reference.intentDigest
            || collectionCanonical(row.request) !== collectionCanonical(resource)
            || row.request_digest !== await collectionDigest(resource)
            || row.identity !== await contentAttachmentIdentity(resource)) throw denied()
        }
      }
      await check()
      await check()
      await originalAuthority()
      // Last SQL clock covers expiry during any awaited source/resource read.
      // Rows are held by the original authority locks; plan time is deliberately
      // historical. No response digest computation or callback follows this read.
      if ((await db.query(`SELECT 1 FROM page_studio_login_sessions login
        CROSS JOIN page_studio_workspace_memberships membership
        CROSS JOIN page_studio_transfer_recovery_heads head
        WHERE login.token_hash=$1 AND login.role='agency' AND login.expires_at>clock_timestamp()
          AND membership.identity_id=$2 AND membership.workspace_id=$3 AND membership.role='owner'
          AND membership.revoked_at IS NULL AND (membership.expires_at IS NULL OR membership.expires_at>clock_timestamp())
          AND head.operation_id=$4 AND head.intent_digest=$5 AND head.recovery_id=$6 AND head.epoch=$7
          AND head.cas_version=$8 AND head.mode='reconciling' AND head.deadline=$9::timestamptz
          AND head.deadline>clock_timestamp()`, [inspection.loginSessionHash, authority.owner.identityId, authority.owner.workspaceId,
        reference.operationId, reference.intentDigest, pg.recoveryId, pg.epoch, pg.version, pg.deadline])).rows.length !== 1) throw denied()
      return TransferRecoveryInspectionAcknowledgmentSchema.parse({ purpose: envelope.purpose, envelopeDigest })
    })
  } catch (error) {
    if (['55P03', '40P01', '57014'].includes(String((error as { code?: string })?.code))) {
      throw createError({ statusCode: 503, statusMessage: 'Transfer recovery is changing. Retry the same inspection.' })
    }
    throw error
  }
}
