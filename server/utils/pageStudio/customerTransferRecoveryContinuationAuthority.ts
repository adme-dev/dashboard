import { z } from 'zod'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { requireCustomerInspectionAuthority } from '~~/shared/pageStudio/customerInspectionAuthority'
import { ContinuationReviewEvidenceSchema, ContinuationReviewInstantSchema } from '~~/shared/pageStudio/transferRecoveryContinuationReview'
import { TransferRecoverySourceFreezeAssociationSchema } from '~~/shared/pageStudio/transferRecoverySourceFreeze'
import { requireCustomerPlanOperator } from './customerPlanGrants'
import { readCustomerSessionIdentityFromHash } from './customerProvisioning'
import { assertManagedTransferSource } from './managedTransferIntent'
import { retainedManagedTransferCompletion } from './managedTransferCompletionRead'
import { recoveryAdmissionHeads, retainedRecoveryAdmission, retainedRecoveryApplication } from './customerTransferRecoveryAdmissionAuthority'
import { reviewDenied, reviewSame } from './customerTransferRecoveryCurrentAuthority'
import type { PageStudioQueryClient } from '~~/shared/pageStudio/controlTypes'

const Id = z.uuid(), Digest = z.string().regex(/^[a-f0-9]{64}$/)
const Route = z.object({ siteId: Id, requestId: Id, expectedRevision: z.number().int().min(1).max(2147483646) }).strict()
const Operator = z.object({ actorId: Id, loginSessionHash: Digest }).strict()
const Actor = z.union([z.object({ operator: Operator }).strict(), z.object({ ownerHash: Digest }).strict()])
const Options = z.object({ renewalRequestId: Id, expectedOriginalHeadDigest: Digest }).strict()
type Intent = Parameters<typeof assertManagedTransferSource>[1]

async function operatorLogin(db: PageStudioQueryClient, actorId: string, hash: string) {
  await requireCustomerPlanOperator(db, actorId)
  if ((await db.query(`SELECT 1 FROM page_studio_login_sessions login JOIN team_members staff ON staff.id::text=login.user_id
    WHERE login.role='agency' AND login.token_hash=$1 AND staff.id=$2 AND login.revoked_at IS NULL
      AND login.issued_at<=clock_timestamp() AND login.expires_at>clock_timestamp()
      AND (staff.sessions_invalidated_at IS NULL OR login.issued_at>staff.sessions_invalidated_at)
    FOR SHARE OF login,staff NOWAIT`, [hash, actorId])).rows.length !== 1) throw reviewDenied()
}
const terms = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).filter(([key]) =>
  !['id', 'status', 'effective_from', 'effective_until', 'created_at', 'updated_at', 'created_by'].includes(key)))

/** Current original-principal and plan authority, never effect/admission authority.
 * Caller holds this transaction through its final clock fence. Original native
 * enabled-head lineage is distinct from the mutable PG-head snapshot below.
 * Physical progress/descriptor/journal checks remain mandatory at the controller. */
export async function recoveryContinuationCurrentContext(db: PageStudioQueryClient, routeInput: unknown, actorInput: unknown, optionsInput: unknown) {
  const route = Route.parse(routeInput), actor = Actor.parse(actorInput), options = Options.parse(optionsInput)
  const saved = (await db.query<{ intent: Intent, intent_digest: string }>(`SELECT i.intent,i.intent_digest
    FROM page_studio_transfer_requests r JOIN page_studio_managed_transfer_intents i ON i.operation_id=r.operation_id
      AND i.intent_digest=r.intent_digest AND i.site_id=r.site_id AND i.entitlement_id=r.entitlement_id
    WHERE r.site_id=$1 AND r.request_id=$2 AND r.revision=$3 AND r.state='reserved'
      AND r.transfer_authority=i.intent->'authority' AND r.source_digest=i.intent->>'sourceDigest'`,
  [route.siteId, route.requestId, route.expectedRevision])).rows[0]
  if (!saved || await collectionDigest(saved.intent) !== saved.intent_digest) throw reviewDenied()
  const intent = saved.intent, a = intent.authority, scope = a.source
  if (intent.formatVersion !== 1 || scope.siteId !== route.siteId || scope.environment !== 'staging'
    || intent.destination.environment !== 'production' || intent.destination.requestKey !== `transfer_${intent.operationId}`) throw reviewDenied()
  await requireCustomerPlanOperator(db, a.operatorId)
  if ('operator' in actor) {
    if (actor.operator.actorId !== a.operatorId) throw reviewDenied()
    await operatorLogin(db, a.operatorId, actor.operator.loginSessionHash)
  } else if (await readCustomerSessionIdentityFromHash(db, actor.ownerHash) !== a.owner.identityId) throw reviewDenied()
  const owner = await requireCustomerInspectionAuthority(db, { actorId: a.owner.identityId, accountId: a.owner.accountId,
    workspaceId: a.owner.workspaceId, siteId: route.siteId })
  if (owner.tenantId !== scope.tenantId || owner.clientId !== scope.clientId || owner.workspaceId !== a.owner.workspaceId
    || !owner.canManagePublication || (await db.query(`SELECT 1 FROM page_studio_workspace_memberships
      WHERE identity_id=$1 AND workspace_id=$2 AND role='owner' AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE NOWAIT`, [a.owner.identityId, a.owner.workspaceId])).rows.length !== 1) throw reviewDenied()
  const site = (await db.query<{ entitlement_id: string }>(`SELECT entitlement_id FROM page_studio_sites WHERE id=$1
    AND tenant_id=$2 AND client_id=$3 AND status IN ('draft','active') FOR NO KEY UPDATE NOWAIT`,
  [scope.siteId, scope.tenantId, scope.clientId])).rows[0]
  if (!site || (await db.query(`SELECT 1 FROM page_studio_transfer_requests
    WHERE request_id=$1 AND site_id=$2 AND revision=$3 AND operation_id=$4 AND intent_digest=$5 AND state='reserved'
      AND operator_id=$6 AND owner_account_id=$7 AND owner_identity_id=$8 AND workspace_id=$9
    FOR SHARE NOWAIT`, [route.requestId, scope.siteId, route.expectedRevision, intent.operationId, saved.intent_digest,
    a.operatorId, a.owner.accountId, a.owner.identityId, a.owner.workspaceId])).rows.length !== 1) throw reviewDenied()
  const head = (await db.query<{ snapshot: Record<string, unknown> }>(`SELECT to_jsonb(h) AS snapshot
    FROM page_studio_transfer_recovery_heads h WHERE operation_id=$1 AND intent_digest=$2 FOR UPDATE NOWAIT`,
  [intent.operationId, saved.intent_digest])).rows[0]?.snapshot
  if (!head || head.epoch !== 1 || !((head.mode === 'applied' && head.cas_version === 4)
    || (head.mode === 'revoked' && head.cas_version === 5))) throw reviewDenied()
  const row = (await db.query<{ association: unknown, association_json: string, association_digest: string, admission_id: string }>(`SELECT association,association_json,association_digest,admission_id
    FROM page_studio_transfer_recovery_source_freezes WHERE operation_id=$1 AND intent_digest=$2 FOR SHARE NOWAIT`,
  [intent.operationId, saved.intent_digest])).rows[0]
  if (!row || collectionCanonical(row.association) !== row.association_json || await collectionDigest(row.association) !== row.association_digest) throw reviewDenied()
  const association = TransferRecoverySourceFreezeAssociationSchema.parse(row.association)
  const pending = await retainedRecoveryAdmission(db, row.admission_id), application = await retainedRecoveryApplication(db, row.admission_id)
  const heads = await recoveryAdmissionHeads(pending.pending, application.applied)
  if (association.operationId !== intent.operationId || association.intentDigest !== saved.intent_digest
    || association.recoveryId !== head.recovery_id || association.admissionId !== row.admission_id
    || association.appliedDigest !== application.applied.digest
    || head.admission_id !== association.admissionId || head.applied_grant_digest !== association.appliedDigest
    || association.enabledHeadDigest !== await collectionDigest(heads.enabled)
    || association.enabledHeadDigest !== options.expectedOriginalHeadDigest) throw reviewDenied()

  // Retained legitimate renewal audit is evidence only; the current site pointer
  // and actual live plan below must independently match it. No plan mutation.
  const audit = (await db.query<{
    id: string
    metadata: {
      request: Record<string, unknown>
      previousEntitlement: Record<string, unknown>
      cancelledEntitlement: Record<string, unknown>
      nextEntitlement: Record<string, unknown>
      entitlement: { id: string }
    }
  }>(`SELECT id,metadata FROM page_studio_audit_events
    WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND actor_id=$4 AND actor_role='agency'
      AND action='customer_transfer_plan_renewed' AND resource_type='entitlement' AND idempotency_key=$5 FOR SHARE NOWAIT`,
  [scope.tenantId, scope.clientId, scope.siteId, a.operatorId, `transfer-plan-renewal:${options.renewalRequestId}`])).rows[0]
  if (!audit) throw reviewDenied()
  const m = audit.metadata, request = m.request
  if (request.requestId !== options.renewalRequestId || request.transferRequestId !== route.requestId
    || request.operationId !== intent.operationId || request.intentDigest !== saved.intent_digest
    || request.recoveryId !== association.recoveryId || request.epoch !== 1 || request.expectedHeadVersion !== 1
    || request.expectedEntitlementId !== a.entitlementId || m.entitlement.id !== site.entitlement_id
    || m.nextEntitlement.id !== site.entitlement_id || !reviewSame(m.cancelledEntitlement, { ...m.previousEntitlement, status: 'cancelled' })) throw reviewDenied()
  const plan = (await db.query<{ snapshot: Record<string, unknown> }>(`SELECT to_jsonb(e) AS snapshot FROM page_studio_entitlements e
    WHERE id=$1 AND tenant_id=$2 AND client_id=$3 AND status='active' AND effective_from<=clock_timestamp()
      AND isfinite(effective_until) AND effective_until>clock_timestamp() AND active_site_limit=1
      AND monthly_ai_operation_limit=0 AND portal_creation_enabled=FALSE AND custom_domain_limit>0
      AND plan_key<>'customer_preview_v1' AND plan_metadata->'publishingEnabled'='true'::jsonb
      AND plan_metadata->'managedBy'='"platform"'::jsonb AND plan_metadata->'allowedModules' @> '["business-content"]'::jsonb
    FOR SHARE NOWAIT`, [site.entitlement_id, scope.tenantId, scope.clientId])).rows[0]?.snapshot
  const old = (await db.query<{ snapshot: unknown, fingerprint: Record<string, unknown> }>(`SELECT to_jsonb(e) AS snapshot,
    (to_jsonb(e)-ARRAY['created_at','updated_at','effective_from','effective_until']) || jsonb_build_object(
      'created_at',extract(epoch FROM e.created_at)::text,'updated_at',extract(epoch FROM e.updated_at)::text,
      'effective_from',extract(epoch FROM e.effective_from)::text,'effective_until',extract(epoch FROM e.effective_until)::text) AS fingerprint
    FROM page_studio_entitlements e WHERE id=$1 FOR SHARE NOWAIT`, [a.entitlementId])).rows[0]
  if (!plan || !old || !reviewSame(plan, m.nextEntitlement) || !reviewSame(old.snapshot, m.cancelledEntitlement)
    || await collectionDigest({ ...old.fingerprint, status: 'active' }) !== a.entitlementDigest
    || !reviewSame(terms(m.previousEntitlement), terms(plan))) throw reviewDenied()
  const completion = await retainedManagedTransferCompletion(db, intent)
  if (!completion) await assertManagedTransferSource(db, intent)
  const selection = completion ? { state: 'destination' as const, completion } : { state: 'source' as const, sourceDigest: intent.sourceDigest }
  const evidence = ContinuationReviewEvidenceSchema.parse({
    authority: { operationId: intent.operationId, intentDigest: saved.intent_digest, recoveryId: association.recoveryId,
      requestId: route.requestId, requestRevision: route.expectedRevision, originalRecoveryHeadDigest: association.enabledHeadDigest },
    principals: { ...a.owner, tenantId: scope.tenantId, clientId: scope.clientId, siteId: scope.siteId, operatorId: a.operatorId },
    plan: { renewalRequestId: options.renewalRequestId, auditId: audit.id, auditDigest: await collectionDigest(m),
      entitlementId: site.entitlement_id, entitlementDigest: await collectionDigest(plan) }
  })
  return { route, actor, options, intent, evidence, authorityDigest: await collectionDigest(evidence),
    fence: { head, plan, selection }, selection }
}

/** Last SQL clock after all awaited work. The controller passes both exact consent
 * login hashes for a grant; a review/individual consent may fence only its caller.
 * No original recovery deadline is used or renewed here. */
export async function finishRecoveryContinuationAuthority(db: PageStudioQueryClient,
  context: Awaited<ReturnType<typeof recoveryContinuationCurrentContext>>, maximumInput: unknown,
  hashesInput: unknown) {
  const maximum = ContinuationReviewInstantSchema.parse(maximumInput)
  const supplied = z.object({ operator: Digest.optional(), owner: Digest.optional() }).strict().parse(hashesInput)
  const caller = 'operator' in context.actor ? { operator: context.actor.operator.loginSessionHash } : { owner: context.actor.ownerHash }
  if ((caller.operator && supplied.operator && caller.operator !== supplied.operator)
    || (caller.owner && supplied.owner && caller.owner !== supplied.owner)) throw reviewDenied()
  const hashes = { ...supplied, ...caller }
  const current = await recoveryContinuationCurrentContext(db, context.route, context.actor, context.options)
  if (!reviewSame(current, context)) throw reviewDenied()
  if (hashes.operator) await operatorLogin(db, context.intent.authority.operatorId, hashes.operator)
  if (hashes.owner && await readCustomerSessionIdentityFromHash(db, hashes.owner) !== context.intent.authority.owner.identityId) throw reviewDenied()
  const a = context.intent.authority
  const result = (await db.query<{ deadline: string }>(`WITH instant AS MATERIALIZED (SELECT clock_timestamp() AS now)
    SELECT to_char(date_trunc('milliseconds',LEAST($1::timestamptz,instant.now+interval '1 hour',e.effective_until,m.expires_at,op.expires_at,own.expires_at))
      AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS deadline
    FROM page_studio_sites s JOIN page_studio_entitlements e ON e.id=s.entitlement_id
    JOIN page_studio_workspace_memberships m ON m.identity_id=$2 AND m.workspace_id=$3 CROSS JOIN instant
    LEFT JOIN page_studio_login_sessions op ON op.token_hash=$4 AND op.role='agency' AND op.user_id=$5
    LEFT JOIN page_studio_customer_sessions own ON own.token_hash=$6 AND own.account_id=$7
    WHERE s.id=$8 AND e.id=$9 AND e.status='active' AND e.effective_from<=instant.now AND e.effective_until>instant.now
      AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>instant.now)
      AND $1::timestamptz>instant.now AND ($4::text IS NULL OR (op.issued_at<=instant.now AND op.expires_at>instant.now AND op.revoked_at IS NULL))
      AND ($6::text IS NULL OR (own.created_at<=instant.now AND own.expires_at>instant.now AND own.revoked_at IS NULL))`,
  [maximum, a.owner.identityId, a.owner.workspaceId, hashes.operator ?? null, a.operatorId,
    hashes.owner ?? null, a.owner.accountId, context.route.siteId, context.evidence.plan.entitlementId])).rows[0]
  if (!result || Date.parse(result.deadline) < Date.parse(maximum)) throw reviewDenied()
  return result.deadline
}
