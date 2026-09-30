import { z } from 'zod'
import { CustomerProvisioningRecoverySchema as RecoveryRequest } from '~~/shared/pageStudio/customerDashboard'
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
export async function readCustomerSessionIdentityFromHash(db: PageStudioQueryClient, tokenHash: string) {
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

export async function readCustomerProvisioningPreviewAuthority(db: PageStudioQueryClient, siteId: string, identityId: string) {
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

const RecoveryReceipt = RecoveryRequest.extend({ version: z.literal(1), revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  loginSessionHash: z.string().regex(/^[a-f0-9]{64}$/), resumeAttempt: z.number().int().min(0).max(20).nullable() }).strict()
const conflict = () => new PageStudioProvisioningError('PROVISIONING_RECOVERY_REQUIRED', 'Refresh setup before resuming with this login', 409)
async function jobDigest(job: Job) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity(job)))
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}
async function latestRecovery(job: Job, db: PageStudioQueryClient) {
  const row = (await db.query<{ metadata: unknown, actor_id: string, actor_role: string }>(`SELECT metadata,actor_id,actor_role FROM page_studio_audit_events
    WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND resource_id=$4
      AND action='customer.provisioning.recovered' AND resource_type='customer_provisioning'
    ORDER BY (metadata->>'revision')::bigint DESC LIMIT 1`, [job.scope.tenantId, job.scope.clientId, job.scope.siteId, job.requestKey])).rows[0]
  if (!row) return null
  const receipt = RecoveryReceipt.safeParse(row.metadata)
  if (!receipt.success || row.actor_id !== job.actor?.userId || row.actor_role !== 'customer'
    || receipt.data.expectedJobDigest !== await jobDigest(job)) throw denied()
  return receipt.data
}
async function retainedJob(db: PageStudioQueryClient, owned: Awaited<ReturnType<typeof readCustomerProvisioningPreviewAuthority>>, identityId: string) {
  const saved = (await db.query<{ job: unknown }>(`SELECT job FROM page_studio_customer_provisioning_intents
    WHERE site_id=$1 AND workspace_id=$2 AND business_id=$3 AND tenant_id=$4 AND actor_identity_id=$5 AND environment='staging'`,
  [owned.scope.siteId, owned.workspaceId, owned.scope.businessId, owned.scope.tenantId, identityId])).rows[0]
  const retained = PageStudioProvisioningJobSchema.safeParse(saved?.job)
  if (!retained.success || retained.data.actor?.kind !== 'customer-user' || retained.data.actor.userId !== identityId
    || !retained.data.actor.loginSessionHash || Object.entries(owned.scope).some(([key, value]) => retained.data.scope[key as keyof typeof owned.scope] !== value)
    || retained.data.plan.templateId !== owned.site.starterVersion || retained.data.setup?.businessName !== owned.site.name
    || retained.data.plan.pages.length > owned.policy.pagesPerSiteLimit) throw denied()
  return retained.data
}

/** Native worker callbacks use the retained job plus the explicitly recovered
 * login. The original job/actor stays immutable. Never grant an old browser session. */
export async function verifyCustomerProvisioningAuthority(job: Job, db: PageStudioQueryClient, requireRecovery = false) {
  if (job.actor?.kind !== 'customer-user' || !job.actor.loginSessionHash || job.scope.environment !== 'staging') throw denied()
  const recovery = await latestRecovery(job, db)
  if (requireRecovery && !recovery) throw denied()
  const loginHash = recovery?.loginSessionHash ?? job.actor.loginSessionHash
  const identityId = await readCustomerSessionIdentityFromHash(db, loginHash)
  if (identityId !== job.actor.userId) throw denied()
  const owned = await readCustomerProvisioningPreviewAuthority(db, job.scope.siteId, identityId)
  const retained = await retainedJob(db, owned, identityId)
  if (identity(retained) !== identity(job)) throw denied()
  // A concurrent recovery may have won while the authority waited for the site.
  if (JSON.stringify(await latestRecovery(job, db)) !== JSON.stringify(recovery)) throw conflict()
  await readCustomerSessionIdentityFromHash(db, loginHash)
  await readCustomerProvisioningPreviewAuthority(db, job.scope.siteId, identityId)
  return { job, userId: identityId, workspaceId: owned.workspaceId }
}

async function recoveryContext(input: z.infer<typeof Input>, db: PageStudioQueryClient) {
  const loginHash = await digestPortalSessionToken(input.sessionToken)
  const identityId = await readCustomerSessionIdentityFromHash(db, loginHash)
  const owned = await readCustomerProvisioningPreviewAuthority(db, input.siteId, identityId)
  const job = await retainedJob(db, owned, identityId)
  const recovery = await latestRecovery(job, db)
  await readCustomerSessionIdentityFromHash(db, loginHash)
  await readCustomerProvisioningPreviewAuthority(db, job.scope.siteId, identityId)
  return { job, recovery, loginHash, identityId }
}

/** Read-only, redacted recovery challenge for the current owner; no provider I/O. */
export async function readCustomerProvisioningRecovery(input: z.infer<typeof Input>, dependencies: { runTransaction?: RunPageStudioTransaction } = {}) {
  const parsed = Input.safeParse(input)
  if (!parsed.success) throw denied()
  return (dependencies.runTransaction ?? transaction)(async (db) => {
    const { job, recovery, loginHash } = await recoveryContext(parsed.data, db)
    return { recoveryRequired: loginHash !== (recovery?.loginSessionHash ?? job.actor!.loginSessionHash),
      expectedRecoveryId: recovery?.recoveryId ?? null, expectedJobDigest: await jobDigest(job) }
  })
}

/** Compare-and-swap authority recovery only. Resource identity, plan, provider
 * phase/leases and accepted checkpoints are untouched. Old cookies stay revoked. */
export async function recoverCustomerProvisioning(input: z.infer<typeof Input> & z.infer<typeof RecoveryRequest>, dependencies: { runTransaction?: RunPageStudioTransaction, providerJob?: unknown } = {}) {
  const parsed = Input.extend(RecoveryRequest.shape).safeParse(input)
  if (!parsed.success) throw denied()
  const request = RecoveryRequest.parse({ recoveryId: parsed.data.recoveryId, expectedRecoveryId: parsed.data.expectedRecoveryId, expectedJobDigest: parsed.data.expectedJobDigest })
  return (dependencies.runTransaction ?? transaction)(async (db) => {
    const { job, recovery, loginHash, identityId } = await recoveryContext(parsed.data, db)
    if (request.expectedJobDigest !== await jobDigest(job)) throw conflict()
    const providerJob = dependencies.providerJob == null ? null : PageStudioProvisioningJobSchema.parse(dependencies.providerJob)
    if (providerJob && identity(providerJob) !== identity(job)) throw denied()
    if (recovery?.recoveryId === request.recoveryId) {
      if (recovery.loginSessionHash !== loginHash || recovery.expectedRecoveryId !== request.expectedRecoveryId) throw conflict()
      return { recovered: true as const, resumeAttempt: recovery.resumeAttempt }
    }
    if ((recovery?.recoveryId ?? null) !== request.expectedRecoveryId || request.recoveryId === request.expectedRecoveryId) throw conflict()
    const receipt = RecoveryReceipt.parse({ ...request, version: 1, revision: (recovery?.revision ?? 0) + 1, loginSessionHash: loginHash, resumeAttempt: providerJob?.phase === 'failed' ? providerJob.attempts : null })
    await db.query(`INSERT INTO page_studio_audit_events
      (tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id,idempotency_key,metadata)
      VALUES($1,$2,$3,$4,'customer','customer.provisioning.recovered','customer_provisioning',$5,$6,$7::jsonb)`,
    [job.scope.tenantId, job.scope.clientId, job.scope.siteId, identityId, job.requestKey,
      `customer-provisioning-recovery:${request.recoveryId}`, JSON.stringify(receipt)])
    await verifyCustomerProvisioningAuthority(job, db)
    return { recovered: true as const, resumeAttempt: receipt.resumeAttempt }
  })
}

/** Internal adapter. Caller supplies a verified customer cookie, never actor/scope/plan fields. */
export async function prepareCustomerProvisioning(input: z.infer<typeof Input>, dependencies: { runTransaction?: RunPageStudioTransaction } = {}) {
  const parsed = Input.safeParse(input)
  if (!parsed.success) throw denied()
  const tokenHash = await digestPortalSessionToken(parsed.data.sessionToken)
  return (dependencies.runTransaction ?? transaction)(async (db) => {
    const identityId = await readCustomerSessionIdentityFromHash(db, tokenHash)
    const owned = await readCustomerProvisioningPreviewAuthority(db, parsed.data.siteId, identityId)
    // The preview-authority reader locks the site, serializing initial intent retention as well as retries.
    const prior = (await db.query<{ job: unknown }>('SELECT job FROM page_studio_customer_provisioning_intents WHERE site_id = $1', [owned.site.id])).rows[0]
    if (prior) {
      const retained = PageStudioProvisioningJobSchema.safeParse(prior.job)
      // A different owner needs explicit reconciliation, never implicit takeover.
      // Keep all identity locks before workspace/site locks on this retry path.
      if (!retained.success || retained.data.actor?.userId !== identityId) throw denied()
      const recovery = await latestRecovery(retained.data, db)
      if ((recovery?.loginSessionHash ?? retained.data.actor.loginSessionHash) !== tokenHash) throw conflict()
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
  resumeAttempt?: number | null
  runTransaction?: RunPageStudioTransaction
}) {
  const job = await prepareCustomerProvisioning(input, dependencies)
  let saved = await dispatchPageStudioProvisioning(dependencies.binding, {
    initiatingActorKind: 'customer-user', initiatingUserId: job.actor!.userId, initiatingLoginSessionHash: job.actor!.loginSessionHash!,
    requestKey: job.requestKey, scope: job.scope, now: job.updatedAt, revision: job.setup!.proposalRevision, source: 'template',
    plan: { businessName: job.setup!.businessName, starterVersion: job.templateId, modules: job.plan.enabledModules, pages: job.plan.pages, collections: job.plan.collections }
  })
  await (dependencies.runTransaction ?? transaction)(db => verifyCustomerProvisioningAuthority(saved, db))
  if (saved.phase === 'failed' && saved.attempts === dependencies.resumeAttempt) {
    if (!dependencies.binding.resumeCustomerProvisioning) throw new PageStudioProvisioningError('PROVISIONER_UNAVAILABLE', 'Provisioning recovery is not configured')
    await (dependencies.runTransaction ?? transaction)(db => verifyCustomerProvisioningAuthority(saved, db, true))
    const decoded = PageStudioProvisioningJobSchema.parse(await dependencies.binding.resumeCustomerProvisioning(saved))
    if (!decoded.actor) throw denied()
    const resumed = { ...decoded, actor: decoded.actor }
    if (identity(resumed) !== identity(saved) || Object.entries(saved.resources).some(([key, value]) => value !== null && resumed.resources[key as keyof typeof saved.resources] !== value)) throw denied()
    saved = resumed
    await (dependencies.runTransaction ?? transaction)(db => verifyCustomerProvisioningAuthority(saved, db))
  }
  return saved
}
