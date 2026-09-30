import { z } from 'zod'
import { transaction } from '~~/server/utils/db'
import { digestPortalSessionToken } from '~~/server/utils/portalSession'
import { CustomerPreviewPolicySchema, readApprovedCustomerPreviewSite } from './customerSites'
import { createPageStudioProvisioningJob, dispatchPageStudioProvisioning, PageStudioProvisioningError,
  PageStudioProvisioningJobSchema, type PageStudioProvisionerBinding } from './provisioningBinding'
import type { PageStudioQueryClient, RunPageStudioTransaction } from './sites'

type Job = z.infer<typeof PageStudioProvisioningJobSchema>
const Input = z.object({ sessionToken: z.string().regex(/^[A-Za-z0-9_-]{64}$/), siteId: z.string().uuid() }).strict()
const denied = () => new PageStudioProvisioningError('PROVISIONING_AUTHORITY_DENIED', 'Customer preview provisioning authority is not active', 403)

// Match customerSignup: account → identity → session, before workspace/site locks.
async function sessionIdentity(db: PageStudioQueryClient, tokenHash: string) {
  const rows = (await db.query<{ identity_id: string }>(`SELECT identity.id AS identity_id
    FROM page_studio_customer_sessions session
    JOIN page_studio_customer_accounts account ON account.id = session.account_id
    JOIN page_studio_customer_identities identity ON identity.id = account.identity_id
    WHERE session.token_hash = $1 AND session.expires_at > clock_timestamp() AND session.revoked_at IS NULL
      AND account.status = 'active' AND identity.status = 'active' AND identity.verified_at <= clock_timestamp()
      AND identity.issuer = 'studio' AND identity.subject = account.id::text
    FOR SHARE OF account, identity, session`, [tokenHash])).rows
  if (!rows[0]) throw denied()
  return rows[0].identity_id
}

async function ownedPreview(db: PageStudioQueryClient, siteId: string, identityId: string) {
  const rows = (await db.query<{ workspace_id: string, business_id: string, tenant_id: string, preview_policy: unknown }>(`
    SELECT receipt.workspace_id, receipt.business_id, receipt.tenant_id, receipt.preview_policy
    FROM page_studio_customer_site_requests receipt
    JOIN page_studio_business_owners owner ON owner.id = receipt.business_id AND owner.workspace_id = receipt.workspace_id
    JOIN page_studio_customer_workspaces workspace ON workspace.id = owner.workspace_id
    JOIN page_studio_workspace_memberships membership ON membership.workspace_id = workspace.id
    WHERE receipt.site_id = $1 AND workspace.status = 'active' AND membership.identity_id = $2
      AND membership.role = 'owner' AND membership.revoked_at IS NULL
      AND (membership.expires_at IS NULL OR membership.expires_at > clock_timestamp())
      AND NOT EXISTS (SELECT 1 FROM page_studio_workspace_client_bindings legacy WHERE legacy.workspace_id = workspace.id)
    FOR SHARE OF workspace, membership, owner`, [siteId, identityId])).rows
  const row = rows[0]
  if (!row) throw denied()
  const policy = CustomerPreviewPolicySchema.safeParse(row.preview_policy)
  if (!policy.success) throw denied()
  const approver = await db.query(`SELECT id FROM team_members WHERE id = $1 AND is_active = TRUE
    AND $2::timestamptz > clock_timestamp() FOR SHARE`, [policy.data.approvedBy, policy.data.expiresAt])
  if (!approver.rows[0]) throw denied()
  const scope = { businessId: row.business_id, clientId: row.business_id, tenantId: row.tenant_id, siteId, environment: 'staging' as const }
  const site = await readApprovedCustomerPreviewSite(db, scope, policy.data)
  return { workspaceId: row.workspace_id, scope, site, policy: policy.data }
}

function identity(job: Job) {
  return JSON.stringify({ actor: job.actor, id: job.id, requestKey: job.requestKey, generationVersion: job.generationVersion,
    scope: job.scope, templateId: job.templateId, plan: job.plan, setup: job.setup })
}

/** Called only after the generic job/scope validation. Not a cached permission. */
export async function verifyCustomerProvisioningAuthority(job: Job, db: PageStudioQueryClient) {
  if (job.actor?.kind !== 'customer-user' || !job.actor.loginSessionHash || job.scope.environment !== 'staging') throw denied()
  const identityId = await sessionIdentity(db, job.actor.loginSessionHash)
  if (identityId !== job.actor.userId) throw denied()
  const owned = await ownedPreview(db, job.scope.siteId, identityId)
  const saved = (await db.query<{ job: unknown }>(`SELECT job FROM page_studio_customer_provisioning_intents
    WHERE site_id = $1 AND workspace_id = $2 AND business_id = $3 AND tenant_id = $4
      AND actor_identity_id = $5 AND login_session_hash = $6 AND environment = 'staging' AND request_key = $7`,
  [job.scope.siteId, owned.workspaceId, job.scope.businessId, job.scope.tenantId, identityId, job.actor.loginSessionHash, job.requestKey])).rows[0]
  const retained = PageStudioProvisioningJobSchema.safeParse(saved?.job)
  if (!retained.success || identity(retained.data) !== identity(job)
    || job.scope.businessId !== owned.scope.businessId || job.scope.clientId !== owned.scope.clientId
    || job.plan.templateId !== owned.site.starterVersion || job.setup?.businessName !== owned.site.name
    || job.plan.pages.length > owned.policy.pagesPerSiteLimit) throw denied()
  return { job, userId: identityId, workspaceId: owned.workspaceId }
}

/** Internal adapter. Caller supplies a verified customer cookie, never actor/scope/plan fields. */
export async function prepareCustomerProvisioning(input: z.infer<typeof Input>, dependencies: { runTransaction?: RunPageStudioTransaction } = {}) {
  const parsed = Input.safeParse(input)
  if (!parsed.success) throw denied()
  const tokenHash = await digestPortalSessionToken(parsed.data.sessionToken)
  return (dependencies.runTransaction ?? transaction)(async (db) => {
    const identityId = await sessionIdentity(db, tokenHash)
    const owned = await ownedPreview(db, parsed.data.siteId, identityId)
    // ownedPreview locks the site, serializing initial intent retention as well as retries.
    const prior = (await db.query<{ job: unknown }>('SELECT job FROM page_studio_customer_provisioning_intents WHERE site_id = $1', [owned.site.id])).rows[0]
    if (prior) {
      const retained = PageStudioProvisioningJobSchema.safeParse(prior.job)
      // A different owner needs explicit reconciliation, never implicit takeover.
      // Keep all identity locks before workspace/site locks on this retry path.
      if (!retained.success || retained.data.actor?.userId !== identityId) throw denied()
      await verifyCustomerProvisioningAuthority(retained.data, db)
      return retained.data
    }
    const job = createPageStudioProvisioningJob({ initiatingActorKind: 'customer-user', initiatingUserId: identityId,
      initiatingLoginSessionHash: tokenHash, requestKey: `page-studio-${owned.site.id}-1`, scope: owned.scope,
      now: new Date().toISOString(), revision: 1, source: 'template', plan: {
        businessName: owned.site.name, starterVersion: owned.site.starterVersion,
        modules: ['business-content'], pages: ['home', 'about', 'contact'], collections: ['profile', 'services']
      } })
    await db.query(`INSERT INTO page_studio_customer_provisioning_intents
      (site_id, workspace_id, business_id, tenant_id, environment, actor_identity_id, login_session_hash, request_key, job)
      VALUES ($1, $2, $3, $4, 'staging', $5, $6, $7, $8::jsonb)`, [owned.site.id, owned.workspaceId, owned.scope.businessId,
      owned.scope.tenantId, identityId, tokenHash, job.requestKey, JSON.stringify(job)])
    await verifyCustomerProvisioningAuthority(job, db)
    return job
  })
}

/** Private coordinator only; a returned phase is not customer-visible readiness. */
export async function dispatchCustomerProvisioning(input: z.infer<typeof Input>, dependencies: {
  binding: PageStudioProvisionerBinding
  runTransaction?: RunPageStudioTransaction
}) {
  const job = await prepareCustomerProvisioning(input, dependencies)
  const saved = await dispatchPageStudioProvisioning(dependencies.binding, {
    initiatingActorKind: 'customer-user', initiatingUserId: job.actor!.userId, initiatingLoginSessionHash: job.actor!.loginSessionHash!,
    requestKey: job.requestKey, scope: job.scope, now: job.updatedAt, revision: job.setup!.proposalRevision, source: 'template',
    plan: { businessName: job.setup!.businessName, starterVersion: job.templateId, modules: job.plan.enabledModules, pages: job.plan.pages, collections: job.plan.collections }
  })
  await (dependencies.runTransaction ?? transaction)(db => verifyCustomerProvisioningAuthority(saved, db))
  return saved
}
