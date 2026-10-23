import { createError } from 'h3'
import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { requireCustomerPlanOperator } from './customerPlanGrants'
import { assertManagedTransferSource } from './managedTransferIntent'
import type { RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'

const Id = z.string().uuid()
const Hash = z.string().regex(/^[a-f0-9]{64}$/)
const Input = z.object({
  operator: z.object({ actorId: Id, loginSessionHash: Hash }).strict(),
  body: z.object({ requestId: Id, transferRequestId: Id, operationId: Id, intentDigest: Hash,
    recoveryId: Id, epoch: z.number().int().positive().max(2147483646), expectedHeadVersion: z.number().int().positive().max(2147483646),
    expectedEntitlementId: Id, effectiveUntil: z.string().datetime({ offset: true }).transform(value => new Date(value).toISOString()),
    reason: z.string().trim().min(3).max(1000) }).strict()
}).strict()
const Receipt = z.object({ id: Id, workspaceId: Id, siteId: Id, planKey: z.string(), status: z.literal('active') }).strict()
const denied = () => createError({ statusCode: 403, statusMessage: 'Current original transfer parties are required' })
const conflict = () => createError({ statusCode: 409, statusMessage: 'The expired plan or recovery request has changed' })
const equal = (a: unknown, b: unknown) => collectionCanonical(a) === collectionCanonical(b)
type Intent = Parameters<typeof assertManagedTransferSource>[1]

/** Private, non-authorizing recovery preparation. No customer-cookie renewal,
 * transfer admission, consent, provider call or recovery-head transition. The
 * original plan is retained with only its status cancelled; a new finite plan
 * copies every original allowance. The immutable audit is the replay authority. */
export async function renewCustomerTransferPlan(input: unknown, dependencies: { runTransaction?: RunPageStudioTransaction } = {}) {
  const parsed = Input.safeParse(input)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid transfer plan renewal' })
  const { operator, body } = parsed.data
  try {
    return await (dependencies.runTransaction ?? transactionWithoutRetry)(async (db) => {
      const retained = (await db.query<{ intent: Intent, intent_digest: string }>(`SELECT intent,intent_digest
        FROM page_studio_managed_transfer_intents WHERE operation_id=$1`, [body.operationId])).rows[0]
      if (!retained || retained.intent_digest !== body.intentDigest || await collectionDigest(retained.intent) !== body.intentDigest) throw conflict()
      const intent = retained.intent, authority = intent.authority, scope = authority.source
      if (intent.formatVersion !== 1 || intent.operationId !== body.operationId || authority.operatorId !== operator.actorId
        || authority.entitlementId !== body.expectedEntitlementId || scope.environment !== 'staging'
        || intent.destination.environment !== 'production' || intent.destination.requestKey !== `transfer_${body.operationId}`) throw conflict()
      const params = [scope.tenantId, scope.clientId, scope.siteId]
      const principals = async () => {
        await requireCustomerPlanOperator(db, operator.actorId)
        if ((await db.query(`SELECT 1 FROM page_studio_login_sessions login JOIN team_members staff ON staff.id::text=login.user_id
          WHERE login.role='agency' AND login.token_hash=$1 AND staff.id=$2 AND login.revoked_at IS NULL
            AND login.issued_at<=clock_timestamp() AND login.expires_at>clock_timestamp()
            AND (staff.sessions_invalidated_at IS NULL OR login.issued_at>staff.sessions_invalidated_at)
          FOR SHARE OF login,staff NOWAIT`, [operator.loginSessionHash, operator.actorId])).rows.length !== 1) throw denied()
        // Current native owner identity and membership; later consent must use a
        // genuine customer login. This operator-only plan grant cannot supply it.
        if ((await db.query(`SELECT 1 FROM page_studio_customer_accounts account
          JOIN page_studio_customer_identities identity ON identity.id=account.identity_id
          JOIN page_studio_workspace_memberships membership ON membership.identity_id=identity.id
          JOIN page_studio_customer_workspaces workspace ON workspace.id=membership.workspace_id
          JOIN page_studio_business_owners owner ON owner.workspace_id=workspace.id
          JOIN page_studio_customer_site_requests receipt ON receipt.workspace_id=workspace.id AND receipt.business_id=owner.id
          WHERE account.id=$1 AND identity.id=$2 AND workspace.id=$3 AND receipt.site_id=$4
            AND owner.id=$5 AND receipt.tenant_id=$6 AND receipt.tenant_id='studio-customer-' || owner.id::text
            AND account.status='active' AND identity.status='active' AND identity.verified_at<=clock_timestamp()
            AND identity.issuer='studio' AND identity.subject=account.id::text AND identity.portal_user_id IS NULL
            AND workspace.status='active' AND owner.agency_client_id IS NULL
            AND membership.role='owner' AND membership.revoked_at IS NULL
            AND (membership.expires_at IS NULL OR membership.expires_at>clock_timestamp())
            AND NOT EXISTS(SELECT 1 FROM page_studio_workspace_client_bindings WHERE workspace_id=workspace.id)
          FOR SHARE OF account,identity,membership,workspace,owner,receipt NOWAIT`,
        [authority.owner.accountId, authority.owner.identityId, authority.owner.workspaceId, scope.siteId, scope.clientId, scope.tenantId])).rows.length !== 1) throw denied()
      }
      await principals()
      const site = (await db.query<{ entitlement_id: string }>(`SELECT entitlement_id FROM page_studio_sites
        WHERE tenant_id=$1 AND client_id=$2 AND id=$3 AND status IN ('draft','active') FOR NO KEY UPDATE NOWAIT`, params)).rows[0]
      if (!site) throw denied()
      const originalRequest = async () => (await db.query<{ snapshot: unknown }>(`SELECT to_jsonb(r) AS snapshot
        FROM page_studio_transfer_requests r WHERE request_id=$1 AND operation_id=$2 AND site_id=$3
          AND entitlement_id=$4 AND intent_digest=$5 AND state='reserved' AND operator_id=$6
          AND owner_account_id=$7 AND owner_identity_id=$8 AND workspace_id=$9
          AND transfer_authority=$10::jsonb AND source_digest=$11 FOR SHARE NOWAIT`,
      [body.transferRequestId, body.operationId, scope.siteId, body.expectedEntitlementId, body.intentDigest, operator.actorId,
        authority.owner.accountId, authority.owner.identityId, authority.owner.workspaceId, JSON.stringify(authority), intent.sourceDigest])).rows[0]?.snapshot
      const original = await originalRequest()
      if (!original) throw conflict()
      const key = `transfer-plan-renewal:${body.requestId}`
      const prior = (await db.query<{ actor_id: string, actor_role: string, action: string, resource_type: string, resource_id: string,
        metadata: { request: unknown, entitlement: unknown } }>(`SELECT actor_id,actor_role,action,resource_type,resource_id,metadata
        FROM page_studio_audit_events WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND idempotency_key=$4`, [...params, key])).rows
      if (prior.length) {
        const saved = prior[0]!, receipt = Receipt.safeParse(saved.metadata.entitlement)
        if (prior.length !== 1 || saved.actor_id !== operator.actorId || saved.actor_role !== 'agency'
          || saved.action !== 'customer_transfer_plan_renewed' || saved.resource_type !== 'entitlement'
          || !equal(saved.metadata.request, body) || !receipt.success || receipt.data.id !== saved.resource_id
          || receipt.data.siteId !== scope.siteId || receipt.data.workspaceId !== authority.owner.workspaceId) throw conflict()
        await principals()
        // Historical replay ignores the old plan/head deadline, but the genuine
        // reader's current login and membership must survive the last await.
        if (!(await db.query(`SELECT 1 FROM page_studio_login_sessions login
          CROSS JOIN page_studio_workspace_memberships membership
          WHERE login.token_hash=$1 AND login.role='agency' AND login.expires_at>clock_timestamp()
            AND membership.workspace_id=$2 AND membership.identity_id=$3
            AND (membership.expires_at IS NULL OR membership.expires_at>clock_timestamp())`,
        [operator.loginSessionHash, authority.owner.workspaceId, authority.owner.identityId])).rows.length) throw denied()
        // Historical receipt only, even if the head/pointer has since advanced.
        return { entitlement: receipt.data, replayed: true }
      }
      const head = async () => {
        if ((await db.query(`SELECT 1 FROM page_studio_transfer_recovery_heads WHERE operation_id=$1 AND intent_digest=$2
          AND recovery_id=$3 AND epoch=$4 AND cas_version=$5 AND mode='reconciling' AND deadline>clock_timestamp()
          AND review_revision IS NULL AND review_digest IS NULL AND reconciliation_digest IS NULL
          AND admission_id IS NULL AND d1_prepared_digest IS NULL AND applied_grant_digest IS NULL FOR UPDATE NOWAIT`,
        [body.operationId, body.intentDigest, body.recoveryId, body.epoch, body.expectedHeadVersion])).rows.length !== 1) throw conflict()
      }
      const time = async () => {
        if (!(await db.query(`SELECT 1 FROM page_studio_transfer_recovery_heads head
          CROSS JOIN page_studio_login_sessions login CROSS JOIN page_studio_workspace_memberships membership
          WHERE head.operation_id=$2 AND login.token_hash=$3 AND login.role='agency'
            AND membership.workspace_id=$4 AND membership.identity_id=$5
            AND isfinite($1::timestamptz) AND $1::timestamptz>clock_timestamp()
            AND $1::timestamptz<=clock_timestamp()+interval '7 days'
            AND head.deadline>clock_timestamp() AND login.expires_at>clock_timestamp()
            AND (membership.expires_at IS NULL OR membership.expires_at>clock_timestamp())`,
        [body.effectiveUntil, body.operationId, operator.loginSessionHash, authority.owner.workspaceId, authority.owner.identityId])).rows.length) throw conflict()
      }
      await head()
      await time()
      if (site.entitlement_id !== body.expectedEntitlementId) throw conflict()
      const previous = (await db.query<{ snapshot: Record<string, unknown>, fingerprint: unknown }>(`SELECT to_jsonb(e) AS snapshot,
        (to_jsonb(e)-ARRAY['created_at','updated_at','effective_from','effective_until']) || jsonb_build_object(
          'created_at',extract(epoch FROM e.created_at)::text,'updated_at',extract(epoch FROM e.updated_at)::text,
          'effective_from',extract(epoch FROM e.effective_from)::text,'effective_until',extract(epoch FROM e.effective_until)::text) AS fingerprint
        FROM page_studio_entitlements e WHERE id=$1 AND tenant_id=$2 AND client_id=$3 AND status='active'
          AND isfinite(effective_until) AND effective_until<=clock_timestamp() AND effective_from<=effective_until
          AND active_site_limit=1 AND monthly_ai_operation_limit=0 AND portal_creation_enabled=FALSE
          AND plan_key<>'customer_preview_v1' AND plan_metadata->'publishingEnabled'='true'::jsonb
          AND plan_metadata->'managedBy'='"platform"'::jsonb AND plan_metadata->'allowedModules' @> '["business-content"]'::jsonb
        FOR UPDATE NOWAIT`, [body.expectedEntitlementId, scope.tenantId, scope.clientId])).rows[0]
      if (!previous || await collectionDigest(previous.fingerprint) !== authority.entitlementDigest) throw conflict()
      await assertManagedTransferSource(db, intent)
      const cancelled = (await db.query<{ snapshot: unknown }>(`UPDATE page_studio_entitlements e SET status='cancelled'
        WHERE id=$1 AND to_jsonb(e)=$2::jsonb RETURNING to_jsonb(e) AS snapshot`, [body.expectedEntitlementId, JSON.stringify(previous.snapshot)])).rows
      if (cancelled.length !== 1 || !equal(cancelled[0]!.snapshot, { ...previous.snapshot, status: 'cancelled' })) throw conflict()
      const next = (await db.query<{ id: string, snapshot: Record<string, unknown> }>(`INSERT INTO page_studio_entitlements AS e
        (tenant_id,client_id,status,plan_key,active_site_limit,pages_per_site_limit,storage_bytes_limit,custom_domain_limit,
          monthly_ai_operation_limit,monthly_build_limit,monthly_traffic_bytes_limit,portal_creation_enabled,
          effective_from,effective_until,plan_metadata,created_by)
        SELECT tenant_id,client_id,'active',plan_key,active_site_limit,pages_per_site_limit,storage_bytes_limit,custom_domain_limit,
          monthly_ai_operation_limit,monthly_build_limit,monthly_traffic_bytes_limit,portal_creation_enabled,
          clock_timestamp(),$2,plan_metadata,$3 FROM page_studio_entitlements WHERE id=$1
        RETURNING id,to_jsonb(e) AS snapshot`, [body.expectedEntitlementId, body.effectiveUntil, operator.actorId])).rows[0]!
      const terms = (snapshot: Record<string, unknown>) => Object.fromEntries(Object.entries(snapshot)
        .filter(([key]) => !['id', 'status', 'effective_from', 'effective_until', 'created_at', 'updated_at', 'created_by'].includes(key)))
      if (!equal(terms(previous.snapshot), terms(next.snapshot))) throw conflict()
      if ((await db.query(`UPDATE page_studio_sites SET entitlement_id=$4 WHERE tenant_id=$1 AND client_id=$2 AND id=$3
        AND entitlement_id=$5 RETURNING id`, [...params, next.id, body.expectedEntitlementId])).rows.length !== 1) throw conflict()
      const entitlement = Receipt.parse({ id: next.id, workspaceId: authority.owner.workspaceId, siteId: scope.siteId,
        planKey: previous.snapshot.plan_key, status: 'active' })
      await db.query(`INSERT INTO page_studio_audit_events
        (tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id,idempotency_key,metadata)
        VALUES($1,$2,$3,$4,'agency','customer_transfer_plan_renewed','entitlement',$5,$6,$7::jsonb)`,
      [...params, operator.actorId, next.id, key, JSON.stringify({ request: body, entitlement,
        previousEntitlement: previous.snapshot, cancelledEntitlement: cancelled[0]!.snapshot, nextEntitlement: next.snapshot })])
      await principals()
      await head()
      await time()
      if (!equal(original, await originalRequest())) throw conflict()
      await assertManagedTransferSource(db, intent)
      // Recheck exact plan rows and selected pointer, including writes by triggers
      // in this transaction; externally competing changes remain locked out.
      if ((await db.query(`SELECT 1 FROM page_studio_sites site CROSS JOIN page_studio_entitlements old
        CROSS JOIN page_studio_entitlements next WHERE site.id=$1 AND site.entitlement_id=$2
          AND old.id=$3 AND to_jsonb(old)=$4::jsonb AND next.id=$2 AND to_jsonb(next)=$5::jsonb`,
      [scope.siteId, next.id, body.expectedEntitlementId, JSON.stringify(cancelled[0]!.snapshot), JSON.stringify(next.snapshot)])).rows.length !== 1) throw conflict()
      await time()
      return { entitlement, replayed: false }
    })
  } catch (error) {
    if (['55P03', '40P01', '57014'].includes(String((error as { code?: string })?.code))) {
      throw createError({ statusCode: 503, statusMessage: 'Transfer plan access is changing. Retry the same renewal.' })
    }
    throw error
  }
}
