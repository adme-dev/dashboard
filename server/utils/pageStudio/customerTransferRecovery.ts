import { createError } from 'h3'
import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { TransferRecoveryRequestSchema, TransferRecoveryStatusRequestSchema, TransferRecoveryViewSchema,
  type TransferRecoveryRequest } from '~~/shared/pageStudio/transferRecovery'
import { requireCustomerPlanOperator } from './customerPlanGrants'
import { assertManagedTransferSource } from './managedTransferIntent'
import type { RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'

const Id = z.string().uuid()
const Scope = z.object({ siteId: Id, requestId: Id,
  operator: z.object({ actorId: Id, loginSessionHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict() }).strict()
const Head = z.object({ recovery_id: Id, epoch: z.literal(1), cas_version: z.number().int().positive(),
  mode: z.enum(['reconciling', 'approved', 'pending', 'applied', 'revoked']), intent_digest: z.string().regex(/^[a-f0-9]{64}$/),
  deadline: z.coerce.date(), expired: z.boolean() }).strict().refine(head =>
  head.mode === 'revoked' ? [2,3,4,5].includes(head.cas_version)
    : head.cas_version === { reconciling: 1, approved: 2, pending: 3, applied: 4 }[head.mode])
const denied = () => createError({ statusCode: 403, statusMessage: 'Current original transfer operator access is required' })
const conflict = () => createError({ statusCode: 409, statusMessage: 'Refresh the retained transfer recovery before continuing' })
const equal = (a: unknown, b: unknown) => collectionCanonical(a) === collectionCanonical(b)
type Route = z.infer<typeof Scope>
type Intent = Parameters<typeof assertManagedTransferSource>[1]
type Dependencies = { runTransaction?: RunPageStudioTransaction }

/** SQL-only inspection and initial closure. Never admits a transfer effect,
 * recreates consent, renews a plan, starts D1 work, or opens a successor epoch. */
async function recovery(route: Route, expectedRevision: number, request: TransferRecoveryRequest | null, dependencies: Dependencies) {
  try {
    return await (dependencies.runTransaction ?? transactionWithoutRetry)(async (db) => {
      const operator = async () => {
        await requireCustomerPlanOperator(db, route.operator.actorId)
        if ((await db.query(`SELECT 1 FROM page_studio_login_sessions login JOIN team_members staff ON staff.id::text=login.user_id
          WHERE login.role='agency' AND login.token_hash=$1 AND staff.id=$2 AND login.revoked_at IS NULL
            AND login.issued_at<=clock_timestamp() AND login.expires_at>clock_timestamp()
            AND (staff.sessions_invalidated_at IS NULL OR login.issued_at>staff.sessions_invalidated_at)
          FOR SHARE OF login,staff NOWAIT`, [route.operator.loginSessionHash, route.operator.actorId])).rows.length !== 1) throw denied()
      }
      await operator()
      const stored = (await db.query<{ operation_id: string, intent_digest: string, intent: Intent, revision: number }>(`
        SELECT r.operation_id,r.intent_digest,i.intent,r.revision FROM page_studio_transfer_requests r
        JOIN page_studio_managed_transfer_intents i ON i.operation_id=r.operation_id AND i.site_id=r.site_id
          AND i.entitlement_id=r.entitlement_id AND i.intent_digest=r.intent_digest
        WHERE r.site_id=$1 AND r.request_id=$2 AND r.revision=$3 AND r.state='reserved' AND r.operator_id=$4
          AND r.transfer_authority=i.intent->'authority' AND r.source_digest=i.intent->>'sourceDigest'
          AND r.owner_account_id::text=i.intent->'authority'->'owner'->>'accountId'
          AND r.owner_identity_id::text=i.intent->'authority'->'owner'->>'identityId'
          AND r.workspace_id::text=i.intent->'authority'->'owner'->>'workspaceId'`,
      [route.siteId, route.requestId, expectedRevision, route.operator.actorId])).rows[0]
      if (!stored || await collectionDigest(stored.intent) !== stored.intent_digest) throw conflict()
      const intent = stored.intent, authority = intent.authority, source = authority.source
      if (intent.formatVersion !== 1 || intent.operationId !== stored.operation_id || authority.operatorId !== route.operator.actorId
        || source.siteId !== route.siteId || source.environment !== 'staging' || intent.destination.environment !== 'production'
        || intent.destination.requestKey !== `transfer_${stored.operation_id}`) throw conflict()
      // Mapping locks precede the site lock. Suspension/revocation disables new
      // closure; bounded inspection and revocation do not disclose owner data.
      const owner = async () => {
        const rows = (await db.query<{ current: boolean }>(`SELECT (
            account.status='active' AND identity.status='active' AND identity.verified_at<=clock_timestamp()
            AND workspace.status='active' AND membership.role='owner' AND membership.revoked_at IS NULL
            AND (membership.expires_at IS NULL OR membership.expires_at>clock_timestamp())
            AND EXISTS(SELECT 1 FROM page_studio_sites WHERE id=receipt.site_id AND status IN ('draft','active'))) AS current
          FROM page_studio_customer_accounts account JOIN page_studio_customer_identities identity ON identity.id=account.identity_id
          JOIN page_studio_workspace_memberships membership ON membership.identity_id=identity.id
          JOIN page_studio_customer_workspaces workspace ON workspace.id=membership.workspace_id
          JOIN page_studio_business_owners business ON business.workspace_id=workspace.id
          JOIN page_studio_customer_site_requests receipt ON receipt.workspace_id=workspace.id AND receipt.business_id=business.id
          WHERE account.id=$1 AND identity.id=$2 AND workspace.id=$3 AND business.id=$4 AND receipt.site_id=$5
            AND receipt.tenant_id=$6 AND receipt.tenant_id='studio-customer-' || business.id::text
            AND identity.issuer='studio' AND identity.subject=account.id::text AND identity.portal_user_id IS NULL
            AND business.agency_client_id IS NULL
            AND NOT EXISTS(SELECT 1 FROM page_studio_workspace_client_bindings WHERE workspace_id=workspace.id)
          FOR SHARE OF account,identity,membership,workspace,business,receipt NOWAIT`,
        [authority.owner.accountId, authority.owner.identityId, authority.owner.workspaceId, source.clientId, route.siteId, source.tenantId])).rows
        if (rows.length !== 1) throw denied()
        return rows[0]!.current === true
      }
      let currentOwner = await owner()
      if ((await db.query(`SELECT id FROM page_studio_sites WHERE id=$1 AND tenant_id=$2 AND client_id=$3
        FOR NO KEY UPDATE NOWAIT`, [route.siteId, source.tenantId, source.clientId])).rows.length !== 1) throw denied()
      // The reserved request is immutable, but lock/re-read it after site
      // serialization rather than trusting the earlier identity-only read.
      if ((await db.query(`SELECT 1 FROM page_studio_transfer_requests WHERE request_id=$1 AND site_id=$2
        AND operation_id=$3 AND intent_digest=$4 AND revision=$5 AND state='reserved' FOR SHARE NOWAIT`,
      [route.requestId, route.siteId, stored.operation_id, stored.intent_digest, expectedRevision])).rows.length !== 1) throw conflict()
      const readHead = async () => {
        const rows = (await db.query(`SELECT recovery_id,epoch,cas_version,mode,intent_digest,deadline,
          deadline<=clock_timestamp() AS expired FROM page_studio_transfer_recovery_heads WHERE operation_id=$1 FOR UPDATE NOWAIT`, [stored.operation_id])).rows
        if (!rows.length) return null
        const parsed = Head.safeParse(rows[0])
        if (rows.length !== 1 || !parsed.success || parsed.data.intent_digest !== stored.intent_digest) throw conflict()
        return parsed.data
      }
      const completed = async () => (await db.query('SELECT 1 FROM page_studio_managed_transfer_completions WHERE operation_id=$1', [stored.operation_id])).rows.length > 0
      const sourceCurrent = async () => {
        try { await assertManagedTransferSource(db, intent); return true } catch (error) {
          if ([403, 409, 413].includes(Number((error as { statusCode?: number })?.statusCode))) return false
          throw error
        }
      }
      let head = await readHead()
      const initial = head
      let opened = false
      if (request?.action === 'open') {
        if (head) {
          // Lost acknowledgement of this exact initial close is historical.
          // Even a revoked/expired head is returned, never reset or extended.
          if (head.recovery_id !== request.recoveryId || !(await db.query(`SELECT 1 FROM page_studio_transfer_recovery_events
            WHERE operation_id=$1 AND recovery_id=$2 AND epoch=1 AND cas_version=1 AND mode='reconciling' AND deadline=$3::timestamptz`,
          [stored.operation_id,request.recoveryId,request.deadline])).rows.length) throw conflict()
        } else {
          if (!currentOwner || await completed() || !await sourceCurrent()) throw conflict()
          if (!(await db.query(`SELECT 1 WHERE isfinite($1::timestamptz) AND $1::timestamptz>clock_timestamp()
            AND $1::timestamptz<=clock_timestamp()+interval '24 hours'`, [request.deadline])).rows.length) throw conflict()
          if ((await db.query(`INSERT INTO page_studio_transfer_recovery_heads
            (operation_id,intent_digest,recovery_id,epoch,mode,cas_version,deadline)
            VALUES($1,$2,$3,1,'reconciling',1,$4) ON CONFLICT(operation_id) DO NOTHING RETURNING operation_id`,
          [stored.operation_id, stored.intent_digest, request.recoveryId, request.deadline])).rows.length !== 1) throw conflict()
          opened = true
        }
      } else if (request?.action === 'revoke') {
        if (!head || head.recovery_id !== request.recoveryId) throw conflict()
        if (head.mode === 'revoked') {
          if (head.cas_version !== request.expectedHeadVersion + 1) throw conflict()
        } else if ((await db.query(`UPDATE page_studio_transfer_recovery_heads SET mode='revoked',cas_version=cas_version+1
          WHERE operation_id=$1 AND intent_digest=$2 AND recovery_id=$3 AND epoch=1
            AND mode IN ('reconciling','approved','pending','applied') AND cas_version=$4 RETURNING operation_id`,
        [stored.operation_id, stored.intent_digest, request.recoveryId, request.expectedHeadVersion])).rows.length !== 1) throw conflict()
      }
      currentOwner = await owner()
      if (opened && (!currentOwner || await completed() || !await sourceCurrent())) throw conflict()
      let canOpen = !head && currentOwner && !await completed() && await sourceCurrent()
      head = await readHead()
      if (!request && !equal(initial, head)) throw conflict()
      // A just-created head must still be live. An old head's expiry never
      // prevents inspection/revocation or changes its retained deadline.
      if (opened && (!head || head.expired)) throw conflict()
      canOpen = canOpen && head === null
      await operator()
      // Last SQL clock read covers operator expiry during an awaited owner/head
      // read. For a new close also fence its deadline and owner membership time.
      if (!(await db.query(`SELECT 1 FROM page_studio_login_sessions login
        CROSS JOIN page_studio_workspace_memberships membership
        WHERE login.token_hash=$1 AND login.role='agency' AND login.expires_at>clock_timestamp()
          AND membership.workspace_id=$2 AND membership.identity_id=$3
          AND ($4::boolean=FALSE OR ((membership.expires_at IS NULL OR membership.expires_at>clock_timestamp())
            AND EXISTS(SELECT 1 FROM page_studio_transfer_recovery_heads WHERE operation_id=$5 AND deadline>clock_timestamp())))`,
      [route.operator.loginSessionHash, authority.owner.workspaceId, authority.owner.identityId, opened, stored.operation_id])).rows.length) throw denied()
      return TransferRecoveryViewSchema.parse({ siteId: route.siteId, requestId: route.requestId, revision: stored.revision,
        recovery: head ? { recoveryId: head.recovery_id, epoch: head.epoch, version: head.cas_version, state: head.mode,
          deadline: head.deadline.toISOString(), expired: head.expired } : null,
        allowedActions: head && ['reconciling','approved','pending','applied'].includes(head.mode) ? ['revoke'] : canOpen ? ['open'] : [] })
    })
  } catch (error) {
    if (['55P03', '40P01', '57014'].includes(String((error as { code?: string })?.code))) {
      throw createError({ statusCode: 503, statusMessage: 'Transfer recovery is changing. Retry the same request.' })
    }
    if ((error as { code?: string })?.code === '23505') throw conflict()
    throw error
  }
}
export async function changeCustomerTransferRecovery(input: { siteId: string, requestId: string, operator: unknown, body: unknown }, dependencies: Dependencies = {}) {
  const route = Scope.safeParse({ siteId: input.siteId, requestId: input.requestId, operator: input.operator })
  const request = TransferRecoveryRequestSchema.safeParse(input.body)
  if (!route.success || !request.success) throw createError({ statusCode: 400, statusMessage: 'Invalid transfer recovery request' })
  return recovery(route.data, request.data.expectedRevision, request.data, dependencies)
}
export async function readCustomerTransferRecovery(input: { siteId: string, requestId: string, operator: unknown, query: unknown }, dependencies: Dependencies = {}) {
  const route = Scope.safeParse({ siteId: input.siteId, requestId: input.requestId, operator: input.operator })
  const query = TransferRecoveryStatusRequestSchema.safeParse(input.query)
  if (!route.success || !query.success) throw createError({ statusCode: 400, statusMessage: 'Invalid transfer recovery status request' })
  return recovery(route.data, query.data.expectedRevision, null, dependencies)
}
