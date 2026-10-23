import { createError } from 'h3'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { requireCustomerInspectionAuthority } from '~~/shared/pageStudio/customerInspectionAuthority'
import { requireCustomerPlanOperator } from './customerPlanGrants'
import { readCustomerSessionIdentityFromHash } from './customerProvisioning'
import { readCustomerTransferRecovery } from './customerTransferRecovery'
import { assertManagedTransferSource } from './managedTransferIntent'
import type { PageStudioQueryClient } from '~~/shared/pageStudio/controlTypes'

export const reviewDenied = () =>
  createError({ statusCode: 409, statusMessage: 'Recovery review authority has changed' })
// PostgreSQL timestamps are Date objects; preserve their values in comparisons.
export const reviewSame = (a: unknown, b: unknown) =>
  collectionCanonical(JSON.parse(JSON.stringify(a))) === collectionCanonical(JSON.parse(JSON.stringify(b)))
export interface ReviewRoute {
  siteId: string
  requestId: string
  expectedRevision: number
}
export interface ReviewActor {
  operator?: { actorId: string; loginSessionHash: string }
  ownerHash?: string
}
type Intent = Parameters<typeof assertManagedTransferSource>[1]
export const laterTables = [
  'executions',
  'source_drafts',
  'destination_executions',
  'destination_execution_verifications',
  'copy_graph_requests',
  'copy_graph_verifications',
  'forms_history_requests',
  'forms_history_verifications',
  'completions'
] as const

/** Current caller authentication is separate from original historical actors.
 * Owner consent does not invoke a private callback using stored staff credentials. */
export async function recoveryReviewContext(
  db: PageStudioQueryClient,
  route: ReviewRoute,
  actor: ReviewActor,
  renewalRequestId: string,
  approved = false
) {
  const retained = (
    await db.query<{ intent: Intent; intent_digest: string }>(
      `SELECT i.intent,i.intent_digest
    FROM page_studio_transfer_requests r JOIN page_studio_managed_transfer_intents i ON i.operation_id=r.operation_id
      AND i.intent_digest=r.intent_digest AND i.site_id=r.site_id
    WHERE r.site_id=$1 AND r.request_id=$2 AND r.revision=$3 AND r.state='reserved'`,
      [route.siteId, route.requestId, route.expectedRevision]
    )
  ).rows[0]
  if (!retained || (await collectionDigest(retained.intent)) !== retained.intent_digest) throw reviewDenied()
  const intent = retained.intent,
    a = intent.authority,
    scope = a.source
  if (
    scope.siteId !== route.siteId ||
    scope.environment !== 'staging' ||
    intent.destination.environment !== 'production'
  )
    throw reviewDenied()
  await requireCustomerPlanOperator(db, a.operatorId)
  if (actor.operator) {
    if (actor.ownerHash || actor.operator.actorId !== a.operatorId) throw reviewDenied()
    await readCustomerTransferRecovery(
      { ...route, operator: actor.operator, query: { expectedRevision: route.expectedRevision } },
      { runTransaction: (work) => work(db) }
    )
  } else if (
    !actor.ownerHash ||
    (await readCustomerSessionIdentityFromHash(db, actor.ownerHash)) !== a.owner.identityId
  )
    throw reviewDenied()
  const owner = await requireCustomerInspectionAuthority(db, {
    actorId: a.owner.identityId,
    accountId: a.owner.accountId,
    workspaceId: a.owner.workspaceId,
    siteId: scope.siteId
  })
  if (
    owner.tenantId !== scope.tenantId ||
    owner.clientId !== scope.clientId ||
    !(
      await db.query(
        `SELECT 1 FROM page_studio_workspace_memberships
    WHERE identity_id=$1 AND workspace_id=$2 AND role='owner' AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE NOWAIT`,
        [a.owner.identityId, a.owner.workspaceId]
      )
    ).rows.length
  )
    throw reviewDenied()
  const site = (
    await db.query<{ entitlement_id: string }>(
      `SELECT entitlement_id FROM page_studio_sites WHERE id=$1
    AND tenant_id=$2 AND client_id=$3 AND status IN ('draft','active') FOR NO KEY UPDATE NOWAIT`,
      [scope.siteId, scope.tenantId, scope.clientId]
    )
  ).rows[0]
  const head = (
    await db.query<{ recovery_id: string; epoch: number; cas_version: number; deadline: Date; mode: string }>(
      `SELECT recovery_id,epoch,cas_version,deadline,mode
    FROM page_studio_transfer_recovery_heads WHERE operation_id=$1 AND intent_digest=$2
      AND mode=$3 AND epoch=1 AND deadline>clock_timestamp()
      AND admission_id IS NULL AND d1_prepared_digest IS NULL AND applied_grant_digest IS NULL FOR UPDATE NOWAIT`,
      [intent.operationId, retained.intent_digest, approved ? 'approved' : 'reconciling']
    )
  ).rows[0]
  if (!site || !head || head.cas_version !== (approved ? 2 : 1)) throw reviewDenied()
  const audit = (
    await db.query<{
      id: string
      metadata: {
        request: Record<string, unknown>
        previousEntitlement: Record<string, unknown>
        cancelledEntitlement: Record<string, unknown>
        nextEntitlement: Record<string, unknown>
        entitlement: { id: string }
      }
    }>(
      `SELECT id,metadata FROM page_studio_audit_events
    WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND actor_id=$4 AND actor_role='agency'
      AND action='customer_transfer_plan_renewed' AND resource_type='entitlement' AND idempotency_key=$5`,
      [scope.tenantId, scope.clientId, scope.siteId, a.operatorId, `transfer-plan-renewal:${renewalRequestId}`]
    )
  ).rows[0]
  if (!audit) throw reviewDenied()
  const m = audit.metadata,
    request = m.request
  if (
    request.requestId !== renewalRequestId ||
    request.transferRequestId !== route.requestId ||
    request.operationId !== intent.operationId ||
    request.intentDigest !== retained.intent_digest ||
    request.recoveryId !== head.recovery_id ||
    request.epoch !== head.epoch ||
    request.expectedHeadVersion !== 1 ||
    request.expectedEntitlementId !== a.entitlementId ||
    !reviewSame(m.cancelledEntitlement, { ...m.previousEntitlement, status: 'cancelled' }) ||
    m.entitlement.id !== site.entitlement_id ||
    m.nextEntitlement.id !== site.entitlement_id
  )
    throw reviewDenied()
  const plan = (
    await db.query<{ snapshot: Record<string, unknown>; effective_until: Date }>(
      `SELECT to_jsonb(e) AS snapshot,effective_until FROM page_studio_entitlements e
    WHERE id=$1 AND tenant_id=$2 AND client_id=$3 AND status='active' AND effective_from<=clock_timestamp()
      AND isfinite(effective_until) AND effective_until>clock_timestamp() AND active_site_limit=1
      AND monthly_ai_operation_limit=0 AND portal_creation_enabled=FALSE FOR SHARE NOWAIT`,
      [site.entitlement_id, scope.tenantId, scope.clientId]
    )
  ).rows[0]
  const old = (
    await db.query<{ snapshot: unknown; fingerprint: Record<string, unknown> }>(
      `SELECT to_jsonb(e) AS snapshot,
    (to_jsonb(e)-ARRAY['created_at','updated_at','effective_from','effective_until']) || jsonb_build_object(
      'created_at',extract(epoch FROM e.created_at)::text,'updated_at',extract(epoch FROM e.updated_at)::text,
      'effective_from',extract(epoch FROM e.effective_from)::text,'effective_until',extract(epoch FROM e.effective_until)::text) AS fingerprint
    FROM page_studio_entitlements e WHERE id=$1 FOR SHARE NOWAIT`,
      [a.entitlementId]
    )
  ).rows[0]
  if (
    !plan ||
    !old ||
    !reviewSame(plan.snapshot, m.nextEntitlement) ||
    !reviewSame(old.snapshot, m.cancelledEntitlement) ||
    (await collectionDigest({ ...old.fingerprint, status: 'active' })) !== a.entitlementDigest
  )
    throw reviewDenied()
  const terms = (v: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(v).filter(
        ([key]) =>
          !['id', 'status', 'effective_from', 'effective_until', 'created_at', 'updated_at', 'created_by'].includes(key)
      )
    )
  if (!reviewSame(terms(m.previousEntitlement), terms(plan.snapshot))) throw reviewDenied()
  await assertManagedTransferSource(db, intent)
  for (const table of laterTables)
    if (
      (
        await db.query(`SELECT 1 FROM page_studio_managed_transfer_${table} WHERE operation_id=$1`, [
          intent.operationId
        ])
      ).rows.length
    )
      throw reviewDenied()
  return {
    intent,
    head,
    plan,
    renewal: {
      auditId: audit.id,
      requestId: renewalRequestId,
      entitlementId: site.entitlement_id,
      auditDigest: await collectionDigest(m),
      entitlementDigest: await collectionDigest(plan.snapshot),
      entitlementSnapshot: plan.snapshot
    }
  }
}
/** Last query after writes/hashes/source reads. All identity rows were locked. */
export async function recoveryReviewClock(
  db: PageStudioQueryClient,
  context: Awaited<ReturnType<typeof recoveryReviewContext>>,
  maximum: string,
  hashes: { operator?: string; owner?: string },
  expectedMode = 'reconciling'
) {
  const a = context.intent.authority
  const row = (
    await db.query<{ deadline: string }>(
      `WITH instant AS MATERIALIZED (SELECT clock_timestamp() AS now)
    SELECT to_char(LEAST($1::timestamptz,h.deadline,e.effective_until,m.expires_at,
      op.expires_at,own.expires_at) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS deadline
    FROM page_studio_transfer_recovery_heads h CROSS JOIN page_studio_entitlements e
    CROSS JOIN page_studio_workspace_memberships m CROSS JOIN instant
    LEFT JOIN page_studio_login_sessions op ON op.token_hash=$2 AND op.role='agency'
    LEFT JOIN page_studio_customer_sessions own ON own.token_hash=$3
    WHERE h.operation_id=$4 AND h.mode=$5 AND h.deadline>instant.now
      AND e.id=$6 AND e.status='active' AND e.effective_until>instant.now
      AND m.identity_id=$7 AND m.workspace_id=$8 AND m.role='owner' AND m.revoked_at IS NULL
      AND (m.expires_at IS NULL OR m.expires_at>instant.now) AND $1::timestamptz>instant.now
      AND ($2::text IS NULL OR (op.expires_at>instant.now AND op.revoked_at IS NULL))
      AND ($3::text IS NULL OR (own.expires_at>instant.now AND own.revoked_at IS NULL))`,
      [
        maximum,
        hashes.operator ?? null,
        hashes.owner ?? null,
        context.intent.operationId,
        expectedMode,
        context.renewal.entitlementId,
        a.owner.identityId,
        a.owner.workspaceId
      ]
    )
  ).rows[0]
  if (!row) throw reviewDenied()
  return row.deadline
}
