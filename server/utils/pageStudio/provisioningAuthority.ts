import { z } from 'zod'
import type { H3Event } from 'h3'
import type { PageStudioControlQueryClient } from './controlStore'
import { bindPageStudioLoginSession, resolvePageStudioLoginSession } from './loginSessions'
import { queryOneFresh, transaction } from '~~/server/utils/db'
import {
  normalizePageStudioProvisioningPlan, PageStudioProvisioningError,
  PageStudioProvisioningJobSchema, PageStudioProvisioningScopeSchema,
  PageStudioProvisioningSetupSchema, readPageStudioProvisioning,
  type PageStudioProvisionerBinding, type PageStudioProvisioningEnvironment
} from '~~/server/utils/pageStudio/provisioningBinding'

export const PageStudioProvisioningRequestSchema = z.object({
  requestKey: PageStudioProvisioningJobSchema.shape.requestKey,
  scope: PageStudioProvisioningScopeSchema.extend({
    businessId: z.string().uuid(), clientId: z.string().uuid(), siteId: z.string().uuid(),
    environment: z.enum(['staging', 'production'])
  })
}).strict().refine(input => input.scope.businessId === input.scope.clientId)

interface AuthorityRow {
  tenantId: string
  clientId: string
  siteId: string
  userId: string
  revision: number
  status: string
  source: string
  brief: string | null
  plan: Record<string, unknown>
  canProvision: boolean
  pagesPerSiteLimit: number
  planMetadata: unknown
}

function denied(): never {
  throw new PageStudioProvisioningError('PROVISIONING_AUTHORITY_DENIED', 'The original setup owner no longer has authority for this accepted plan', 403)
}

/** Bind only the authenticated native credential; retries never replace a retained job's login. */
export async function bindPageStudioProvisioningLogin(event: H3Event, role: 'agency' | 'client', userId: string) {
  return await transaction(async (db) => {
    const login = await resolvePageStudioLoginSession(db, event, role, userId)
    await bindPageStudioLoginSession(db, login)
    return login.tokenHash
  })
}

/** A fresh check, not a reusable grant. Executors must also compare job state and fence their lease. */
export async function authorizePageStudioProvisioning(binding: PageStudioProvisionerBinding | undefined, input: unknown, environment: PageStudioProvisioningEnvironment) {
  const parsed = PageStudioProvisioningRequestSchema.safeParse(input)
  if (!parsed.success) throw new PageStudioProvisioningError('INVALID_PROVISIONING_REQUEST', 'Invalid provisioning authority request', 400)
  if (parsed.data.scope.environment !== environment) denied()
  if (!binding?.readProvisioning) throw new PageStudioProvisioningError('PROVISIONER_UNAVAILABLE', 'Provisioning authority requires the coordinator', 503)
  const retained = await readPageStudioProvisioning(binding, parsed.data)
  if (retained === null) throw new PageStudioProvisioningError('PROVISIONING_NOT_FOUND', 'Provisioning request not found', 404)
  return await verifyPageStudioProvisioningJobAuthority(retained, environment)
}

/** Server-owned producer preflight and executor authority share the same fresh
 * checks. This helper does not read a retained job: callers must derive the
 * candidate from authenticated staff plus a scoped, saved proposal.
 */
export async function verifyPageStudioProvisioningJobAuthority(input: unknown, environment: PageStudioProvisioningEnvironment,
  dependencies: { transaction?: PageStudioControlQueryClient } = {}) {
  const decoded = PageStudioProvisioningJobSchema.safeParse(input)
  if (!decoded.success) throw new PageStudioProvisioningError('PROVISIONER_FAILED', 'Invalid retained provisioning job')
  const job = decoded.data
  const validatedScope = PageStudioProvisioningRequestSchema.safeParse({ requestKey: job.requestKey, scope: job.scope })
  if (!validatedScope.success) denied()
  const { scope } = validatedScope.data
  if (scope.environment !== environment) denied()
  if (!job.actor?.loginSessionHash) throw new PageStudioProvisioningError('PROVISIONING_OWNER_REQUIRED', 'The setup originating login requires reconciliation', 409)
  if (!job.setup || ['failed', 'complete'].includes(job.phase)
    || job.id !== job.requestKey || job.requestKey !== `page-studio-${scope.siteId}-${job.setup.proposalRevision}`
    || job.templateId !== job.plan.templateId
    || JSON.stringify(job.scope) !== JSON.stringify(job.plan.scope)) denied()

  // Only the retained job selects this branch. Never accept an actor kind in the
  // authority request. Staff permissions are read from SQL on every effect;
  // cached session groups and static role fallbacks cannot keep a revoked job alive.
  const agency = job.actor.kind === 'agency-user'
  const db = dependencies.transaction
  if (db) {
    // Match logout's native -> parent order before joining permission records.
    // The checkpoint writer already holds its site FOR NO KEY UPDATE, allowing
    // logout's audit foreign-key checks while it waits for this authority fence.
    if (!agency && !(await db.query(`SELECT token_hash FROM client_sessions
      WHERE token_hash=$1 AND client_user_id=$2 AND expires_at>clock_timestamp() FOR SHARE`,
    [job.actor.loginSessionHash, job.actor.userId])).rows[0]) denied()
    if (!(await db.query(`SELECT token_hash FROM page_studio_login_sessions
      WHERE role=$1 AND token_hash=$2 AND user_id=$3 AND revoked_at IS NULL
        AND expires_at>clock_timestamp() FOR SHARE`,
    [agency ? 'agency' : 'client', job.actor.loginSessionHash, job.actor.userId])).rows[0]) denied()
  }
  const ownerJoin = agency
    ? `
    JOIN team_members owner ON owner.id = $4::uuid AND owner.is_active = TRUE
      AND owner.user_role NOT IN ('viewer', 'guest')
      AND (owner.sessions_invalidated_at IS NULL OR login.issued_at >= owner.sessions_invalidated_at)
    JOIN custom_roles staff_role ON
      ((owner.custom_role_id IS NOT NULL AND staff_role.id = owner.custom_role_id)
       OR (owner.custom_role_id IS NULL AND staff_role.slug = owner.user_role::text AND staff_role.is_system = TRUE))
      AND staff_role.is_read_only = FALSE
    JOIN role_permission_groups staff_permission ON staff_permission.role_id = staff_role.id
      AND staff_permission.permission_group = 'PAGE_STUDIO_EDIT'
  `
    : `
    JOIN client_users owner ON owner.client_id = site.client_id AND owner.id = $4::uuid
      AND owner.status = 'active' AND owner.role IN ('admin', 'manager')
    JOIN client_sessions native_session ON native_session.client_user_id = owner.id
      AND native_session.token_hash = login.token_hash AND native_session.expires_at > clock_timestamp()
    JOIN page_studio_site_memberships membership ON membership.tenant_id = site.tenant_id
      AND membership.client_id = site.client_id AND membership.site_id = site.id
      AND membership.user_id = owner.id AND membership.role = 'editor'
  `

  const read = db
    ? async (sql: string, params: unknown[]) => (await db.query<AuthorityRow>(sql, params)).rows[0] ?? null
    : queryOneFresh<AuthorityRow>
  const row = await read(`
    SELECT site.tenant_id AS "tenantId", site.client_id AS "clientId", site.id AS "siteId",
           owner.id AS "userId", proposal.revision, proposal.status, proposal.source,
           proposal.brief, proposal.plan, entitlement.pages_per_site_limit AS "pagesPerSiteLimit",
           entitlement.plan_metadata AS "planMetadata",
           (site.status IN ('draft', 'active') AND entitlement.status IN ('trial', 'active')
            ${agency ? '' : 'AND entitlement.portal_creation_enabled'} AND entitlement.effective_from <= clock_timestamp()
            AND entitlement.active_site_limit > 0
            AND (SELECT COUNT(*) FROM page_studio_sites counted
                 WHERE counted.tenant_id = site.tenant_id AND counted.client_id = site.client_id
                   AND counted.status <> 'archived') <= entitlement.active_site_limit
            AND (entitlement.effective_until IS NULL OR entitlement.effective_until > clock_timestamp())) AS "canProvision"
    FROM page_studio_sites site
    JOIN agency_clients client ON client.id = site.client_id AND client.is_active = TRUE
    JOIN page_studio_login_sessions login ON login.role = $5 AND login.token_hash = $6
      AND login.user_id = $4 AND login.revoked_at IS NULL AND login.expires_at > clock_timestamp()
    ${ownerJoin}
    JOIN page_studio_entitlements entitlement ON entitlement.tenant_id = site.tenant_id
      AND entitlement.client_id = site.client_id AND entitlement.id = site.entitlement_id
    JOIN page_studio_setup_proposals proposal ON proposal.tenant_id = site.tenant_id
      AND proposal.client_id = site.client_id AND proposal.site_id = site.id
    WHERE site.tenant_id = $1 AND site.client_id = $2 AND site.id = $3
    ORDER BY proposal.revision DESC LIMIT 1
    ${db ? 'FOR SHARE' : ''}
  `, [scope.tenantId, scope.clientId, scope.siteId, job.actor.userId, agency ? 'agency' : 'client', job.actor.loginSessionHash]).catch(() => {
    throw new PageStudioProvisioningError('PROVISIONER_FAILED', 'Provisioning authority could not be verified')
  })
  if (!row || row.userId !== job.actor.userId || row.tenantId !== scope.tenantId
    || row.clientId !== scope.clientId || row.siteId !== scope.siteId
    || row.status !== 'accepted' || row.revision !== job.setup.proposalRevision || row.canProvision !== true
    || !Number.isInteger(row.pagesPerSiteLimit) || row.pagesPerSiteLimit < job.plan.pages.length) denied()
  const setup = PageStudioProvisioningSetupSchema.safeParse({
    businessName: row.plan?.businessName, proposalRevision: row.revision, source: row.source,
    ...(row.brief === null ? {} : { brief: row.brief })
  })
  if (!setup.success || JSON.stringify(setup.data) !== JSON.stringify(job.setup)) denied()
  let plan
  try {
    plan = normalizePageStudioProvisioningPlan(row.plan, scope)
  } catch {
    denied()
  }
  if (JSON.stringify(plan) !== JSON.stringify(job.plan)) denied()
  const metadata = z.object({ allowedModules: z.array(z.string().min(1)).optional() }).safeParse(row.planMetadata)
  if (!metadata.success || (metadata.data.allowedModules && job.plan.enabledModules.some(module => !metadata.data.allowedModules!.includes(module)))) denied()
  return { job, userId: job.actor.userId }
}
