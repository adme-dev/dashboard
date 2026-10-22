import { createError } from 'h3'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import type { CustomerAdoptionOperatorSchema } from '~~/shared/pageStudio/customerAdoptionGrant'
import { requireCustomerPlanOperator } from './customerPlanGrants'
import { CustomerPreviewPolicySchema } from './customerSites'
import { PageStudioProvisioningJobSchema } from './provisioningBinding'
import type { PageStudioQueryClient } from '~~/shared/pageStudio/controlTypes'
import type { z } from 'zod'

export const adoptionDenied = () =>
  createError({ statusCode: 403, statusMessage: 'Existing source adoption is not available' })
export const adoptionConflict = () =>
  createError({ statusCode: 409, statusMessage: 'Existing source adoption selection has changed' })
export const adoptionEqual = (a: unknown, b: unknown) => collectionCanonical(a) === collectionCanonical(b)
type Operator = z.infer<typeof CustomerAdoptionOperatorSchema>
/** Historical preview records identify the source; their expired dates never
 * become active authority. Current staff and native owner rows are locked first. */
export async function readCustomerAdoptionPrincipals(db: PageStudioQueryClient, siteId: string, operator: Operator) {
  await requireCustomerPlanOperator(db, operator.actorId)
  if (
    !(
      await db.query(
        `SELECT 1 FROM page_studio_login_sessions login JOIN team_members staff ON staff.id::text=login.user_id
    WHERE login.role='agency' AND login.token_hash=$1 AND staff.id=$2 AND login.revoked_at IS NULL
      AND login.issued_at<=clock_timestamp() AND login.expires_at>clock_timestamp()
      AND (staff.sessions_invalidated_at IS NULL OR login.issued_at>staff.sessions_invalidated_at)
    FOR SHARE OF login,staff NOWAIT`,
        [operator.loginSessionHash, operator.actorId]
      )
    ).rows.length
  )
    throw adoptionDenied()
  const row = (
    await db.query<{
      identity_id: string
      account_id: string
      workspace_id: string
      business_id: string
      tenant_id: string
      preview_policy: unknown
    }>(
      `
    SELECT identity.id AS identity_id,account.id AS account_id,workspace.id AS workspace_id,owner.id AS business_id,receipt.tenant_id,receipt.preview_policy
    FROM page_studio_customer_site_requests receipt
    JOIN page_studio_business_owners owner ON owner.id=receipt.business_id AND owner.workspace_id=receipt.workspace_id
    JOIN page_studio_customer_workspaces workspace ON workspace.id=owner.workspace_id
    JOIN page_studio_workspace_memberships membership ON membership.workspace_id=workspace.id AND membership.identity_id=receipt.actor_identity_id
    JOIN page_studio_customer_identities identity ON identity.id=membership.identity_id
    JOIN page_studio_customer_accounts account ON account.identity_id=identity.id
    WHERE receipt.site_id=$1 AND receipt.tenant_id='studio-customer-' || owner.id::text
      AND identity.status='active' AND identity.issuer='studio' AND identity.subject=account.id::text AND identity.portal_user_id IS NULL
      AND identity.verified_at<=clock_timestamp() AND account.status='active' AND workspace.status='active' AND owner.agency_client_id IS NULL
      AND membership.role='owner' AND membership.revoked_at IS NULL AND (membership.expires_at IS NULL OR membership.expires_at>clock_timestamp())
      AND NOT EXISTS(SELECT 1 FROM page_studio_workspace_client_bindings WHERE workspace_id=workspace.id)
    FOR SHARE OF receipt,owner,workspace,membership,identity,account NOWAIT`,
      [siteId]
    )
  ).rows[0]
  if (!row) throw adoptionDenied()
  const policy = CustomerPreviewPolicySchema.parse(row.preview_policy)
  if (policy.approvedBy !== operator.actorId) throw adoptionDenied()
  return {
    owner: { identityId: row.identity_id, accountId: row.account_id, workspaceId: row.workspace_id },
    policy,
    scope: {
      tenantId: row.tenant_id,
      clientId: row.business_id,
      businessId: row.business_id,
      siteId,
      environment: 'staging' as const
    }
  }
}
/** Last SQL clock after all preceding awaits. A new finite grant is also bounded
 * by the issuing staff login and any finite current owner membership. */
export async function assertCustomerAdoptionClock(
  db: PageStudioQueryClient,
  siteId: string,
  operator: Operator,
  expiresAt?: string
) {
  const row = (
    await db.query<{ now: Date }>(
      `SELECT clock_timestamp() AS now FROM page_studio_login_sessions login
    JOIN page_studio_customer_site_requests receipt ON receipt.site_id=$1
    JOIN page_studio_workspace_memberships membership ON membership.workspace_id=receipt.workspace_id AND membership.identity_id=receipt.actor_identity_id
    WHERE login.role='agency' AND login.token_hash=$2 AND login.user_id=$3 AND login.expires_at>clock_timestamp()
      AND (membership.expires_at IS NULL OR membership.expires_at>clock_timestamp())
      AND ($4::timestamptz IS NULL OR (isfinite($4::timestamptz) AND $4::timestamptz>clock_timestamp()
        AND $4::timestamptz<=clock_timestamp()+interval '24 hours' AND $4::timestamptz<=login.expires_at
        AND (membership.expires_at IS NULL OR $4::timestamptz<=membership.expires_at)))`,
      [siteId, operator.loginSessionHash, operator.actorId, expiresAt ?? null]
    )
  ).rows[0]
  if (!row) throw adoptionDenied()
  return row.now.toISOString()
}
export async function readCustomerAdoptionContext(
  db: PageStudioQueryClient,
  siteId: string,
  operator: Operator,
  requireAbsent = true
) {
  const principals = await readCustomerAdoptionPrincipals(db, siteId, operator),
    { scope, owner, policy } = principals
  const site = (
    await db.query<{ site: Record<string, unknown>; entitlement_id: string; current_checkpoint_id: string }>(
      `
    SELECT jsonb_build_object('id',id,'name',name,'route',route,'starterVersion',starter_version,'status',status,
      'entitlementId',entitlement_id,'checkpointId',current_checkpoint_id) AS site,entitlement_id,current_checkpoint_id
    FROM page_studio_sites WHERE id=$1 AND tenant_id=$2 AND client_id=$3 AND status='draft' FOR NO KEY UPDATE NOWAIT`,
      [siteId, scope.tenantId, scope.clientId]
    )
  ).rows[0]
  if (!site?.current_checkpoint_id) throw adoptionDenied()
  const plan = (
    await db.query<{ value: unknown }>(
      `SELECT to_jsonb(e) AS value FROM page_studio_entitlements e
    WHERE id=$1 AND tenant_id=$2 AND client_id=$3 AND status='trial' AND plan_key='customer_preview_v1'
      AND effective_from<=clock_timestamp() AND effective_until=$4::timestamptz AND effective_until<=clock_timestamp()
      AND active_site_limit=1 AND custom_domain_limit=0 AND monthly_ai_operation_limit=0 AND portal_creation_enabled=FALSE
      AND pages_per_site_limit=$5 AND storage_bytes_limit=$6 AND monthly_build_limit=$7 AND monthly_traffic_bytes_limit=$8
      AND plan_metadata=$9::jsonb FOR SHARE NOWAIT`,
      [
        site.entitlement_id,
        scope.tenantId,
        scope.clientId,
        policy.expiresAt,
        policy.pagesPerSiteLimit,
        policy.storageBytesLimit,
        policy.monthlyBuildLimit,
        policy.monthlyTrafficBytesLimit,
        JSON.stringify({ previewPolicy: policy, publishingEnabled: false })
      ]
    )
  ).rows[0]
  const approval = (
    await db.query<{ id: string; value: unknown }>(
      `SELECT id,to_jsonb(a) AS value FROM page_studio_customer_cms_setup_approvals a
    WHERE site_id=$1 AND workspace_id=$2 AND identity_id=$3 AND tenant_id=$4 AND business_id=$5 AND environment='staging'
      AND approved_by=$6 AND preview_policy=$7::jsonb AND enabled=TRUE AND expires_at<=$8::timestamptz FOR SHARE NOWAIT`,
      [
        siteId,
        owner.workspaceId,
        owner.identityId,
        scope.tenantId,
        scope.businessId,
        operator.actorId,
        JSON.stringify(policy),
        policy.expiresAt
      ]
    )
  ).rows[0]
  if (!plan || !approval) throw adoptionDenied()
  const checkpoint = (
    await db.query<{ id: string; digest: string; objectKey: string }>(
      `SELECT id,digest,object_key AS "objectKey"
    FROM page_studio_checkpoints WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND id=$4 FOR SHARE NOWAIT`,
      [scope.tenantId, scope.clientId, siteId, site.current_checkpoint_id]
    )
  ).rows[0]
  const saved = (
    await db.query<{ job: unknown }>(
      `SELECT job FROM page_studio_customer_provisioning_intents WHERE site_id=$1
    AND workspace_id=$2 AND business_id=$3 AND tenant_id=$4 AND environment='staging' AND actor_identity_id=$5 FOR SHARE NOWAIT`,
      [siteId, owner.workspaceId, scope.businessId, scope.tenantId, owner.identityId]
    )
  ).rows[0]
  const job = PageStudioProvisioningJobSchema.safeParse(saved?.job)
  if (
    !checkpoint ||
    !job.success ||
    job.data.actor?.kind !== 'customer-user' ||
    job.data.actor.userId !== owner.identityId ||
    !job.data.actor.loginSessionHash ||
    !adoptionEqual(job.data.scope, scope) ||
    job.data.plan.templateId !== site.site.starterVersion ||
    job.data.setup?.businessName !== site.site.name ||
    job.data.plan.pages.length > policy.pagesPerSiteLimit ||
    checkpoint.objectKey !==
      `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${siteId}/checkpoints/${checkpoint.id}.json`
  )
    throw adoptionDenied()
  if (
    (
      await db.query(
        `SELECT 1 FROM page_studio_transfer_requests WHERE site_id=$1
    UNION ALL SELECT 1 FROM page_studio_managed_transfer_intents WHERE site_id=$1`,
        [siteId]
      )
    ).rows.length
  )
    throw adoptionDenied()
  const adoptions = (
    await db.query<{
      adoption_request: unknown
      adoption_digest: string
      adoption_id: string
      pending_generation: string | null
      active_generation: string | null
      target: unknown
      tenant_id: string
      client_id: string
      business_id: string
      environment: string
    }>(
      `SELECT adoption_request,adoption_digest,adoption_id,pending_generation,active_generation,target,tenant_id,client_id,business_id,environment
    FROM page_studio_cms_scopes WHERE site_id=$1 FOR SHARE NOWAIT`,
      [siteId]
    )
  ).rows
  if (adoptions.length > 1 || (requireAbsent && adoptions.length)) throw adoptionDenied()
  const adoption = adoptions[0] ?? null
  if (
    adoption &&
    (adoption.tenant_id !== scope.tenantId ||
      adoption.client_id !== scope.clientId ||
      adoption.business_id !== scope.businessId ||
      adoption.environment !== scope.environment)
  )
    throw adoptionDenied()
  const source = {
    scope,
    owner,
    predecessors: {
      previewPolicyDigest: await collectionDigest(policy),
      approvalId: approval.id,
      approvalDigest: await collectionDigest(approval.value),
      entitlementId: site.entitlement_id,
      entitlementDigest: await collectionDigest(plan.value),
      provisioningJobDigest: await collectionDigest(job.data)
    },
    checkpoint,
    siteDigest: await collectionDigest(site.site)
  }
  await assertCustomerAdoptionClock(db, siteId, operator)
  return { source, job: job.data, adoption }
}
