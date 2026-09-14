import { z } from 'zod'
import { SYSTEM_ROLE_PERMISSIONS, isReadOnlyRole } from '~~/server/utils/permissions'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { PageStudioEmailEditSchema, PageStudioEmailStoreSchema, type PageStudioEmailState } from '~~/shared/pageStudio/emailConfiguration'

export class PageStudioEmailConfigurationError extends Error {
  constructor(readonly code: string, readonly statusCode: number, message: string) {
    super(message)
    this.name = 'PageStudioEmailConfigurationError'
  }
}
export type PageStudioEmailActor = { actorId: string } & (
  | { role: 'agency', tenantId: string, canEdit: boolean }
  | { role: 'client', clientId: string }
)
interface Request { actor: PageStudioEmailActor, siteId: string, env: Record<string, unknown> }
interface DatabaseRow {
  tenant_id?: string
  client_id?: string
  site_status?: string
  entitlement_status?: string
  entitlement_effective?: boolean
  email_configuration?: unknown
  role?: string
  user_role?: string
  custom_role_id?: string | null
  id?: string
  is_read_only?: boolean
  permission_group?: string
}
interface Database { query: (sql: string, values?: unknown[]) => Promise<{ rows: DatabaseRow[], rowCount?: number | null }> }
interface Dependencies { transaction?: <T>(work: (db: Database) => Promise<T>) => Promise<T> }
const fail = (code: string, status: number, message: string) => new PageStudioEmailConfigurationError(code, status, message)
const denied = () => fail('EMAIL_ACCESS_DENIED', 403, 'Website email settings access denied')

async function operate(request: Request, input: unknown | undefined, dependencies: Dependencies): Promise<PageStudioEmailState> {
  const { actor, siteId } = request
  const writing = input !== undefined
  const parsed = writing ? PageStudioEmailEditSchema.safeParse(input) : null
  if (parsed && !parsed.success) throw fail('EMAIL_INVALID', 400, 'Check the email addresses and settings revision')
  if (!z.string().uuid().safeParse(siteId).success) throw fail('INVALID_SITE', 400, 'Invalid website ID')
  if (!z.string().uuid().safeParse(actor.actorId).success || (actor.role === 'agency' ? !actor.tenantId : !actor.clientId)) throw denied()
  // Deployment configuration is the only environment authority; never use body/query values.
  const environment = request.env.PAGE_STUDIO_RELEASE_ENVIRONMENT
  if (environment !== 'staging' && environment !== 'production') throw fail('EMAIL_NOT_CONFIGURED', 503, 'Website email settings are not configured for this environment')
  const run = dependencies.transaction ?? (work => transactionWithoutRetry(db => work(db)))
  try {
    return await run(async (db) => {
      const portal = actor.role === 'client'
      // Serialize with saves, lifecycle updates and revocation. No network calls while locked.
      const row = (await db.query(`
      SELECT site.tenant_id, site.client_id, site.status AS site_status, site.email_configuration,
        entitlement.status AS entitlement_status,
        (entitlement.effective_from <= clock_timestamp() AND (entitlement.effective_until IS NULL OR entitlement.effective_until > clock_timestamp())) AS entitlement_effective
      FROM page_studio_sites site
      JOIN agency_clients client ON client.id = site.client_id AND client.is_active = TRUE
      JOIN page_studio_entitlements entitlement ON entitlement.id = site.entitlement_id
        AND entitlement.tenant_id = site.tenant_id AND entitlement.client_id = site.client_id
      WHERE site.id = $2 AND site.${portal ? 'client_id' : 'tenant_id'} = $1
      FOR UPDATE OF site FOR SHARE OF client, entitlement`, [portal ? actor.clientId : actor.tenantId, siteId])).rows[0]
      if (!row || (portal ? row.client_id !== actor.clientId : row.tenant_id !== actor.tenantId)) throw fail('SITE_NOT_FOUND', 404, 'Website not found')
      if (!['draft', 'active'].includes(row.site_status ?? '') || !['trial', 'active'].includes(row.entitlement_status ?? '') || row.entitlement_effective !== true) throw denied()
      let canEdit = actor.role === 'agency' && actor.canEdit
      if (portal) {
        const member = (await db.query(`
        SELECT member.role, portal_user.role AS user_role
        FROM page_studio_site_memberships member
        JOIN client_users portal_user ON portal_user.id = member.user_id AND portal_user.client_id = member.client_id AND portal_user.status = 'active'
        WHERE member.tenant_id = $1 AND member.client_id = $2 AND member.site_id = $3 AND member.user_id = $4
        FOR SHARE OF member, portal_user`, [row.tenant_id, row.client_id, siteId, actor.actorId])).rows[0]
        if (!member || !['viewer', 'editor'].includes(member.role ?? '') || !['admin', 'manager', 'viewer'].includes(member.user_role ?? '')) throw denied()
        canEdit = member.role === 'editor' && ['admin', 'manager'].includes(member.user_role ?? '')
      }
      if (actor.role === 'agency') {
        const staff = (await db.query(`SELECT user_role, custom_role_id FROM team_members
        WHERE id = $1 AND is_active = TRUE FOR SHARE`, [actor.actorId])).rows[0]
        if (!staff) throw denied()
        const policy = (await db.query(`SELECT id, is_read_only FROM custom_roles
        WHERE ${staff.custom_role_id ? 'id = $1' : 'slug = $1 AND is_system = TRUE'} FOR SHARE`,
        [staff.custom_role_id ?? staff.user_role])).rows[0]
        if (staff.custom_role_id && !policy) throw denied()
        const groups = policy
          ? (await db.query('SELECT permission_group FROM role_permission_groups WHERE role_id = $1 FOR SHARE', [policy.id])).rows.map(item => item.permission_group)
          : SYSTEM_ROLE_PERMISSIONS[staff.user_role ?? ''] ?? []
        if (!groups.includes(writing ? 'PAGE_STUDIO_EDIT' : 'PAGE_STUDIO_VIEW')) throw denied()
        canEdit = canEdit && groups.includes('PAGE_STUDIO_EDIT') && !isReadOnlyRole(staff.user_role ?? '') && policy?.is_read_only !== true
      }
      if (writing && !canEdit) throw denied()
      const store = PageStudioEmailStoreSchema.safeParse(row.email_configuration)
      if (!store.success) throw fail('EMAIL_STATE_INVALID', 503, 'Saved email settings could not be verified')
      let record = store.data[environment]
      if (parsed?.success) {
        if ((record?.revision ?? 0) !== parsed.data.expectedRevision) throw fail('EMAIL_CONFLICT', 409, 'Email settings changed in another session. Reload before saving again.')
        record = { revision: parsed.data.expectedRevision + 1, settings: parsed.data.settings, updatedAt: new Date().toISOString(), updatedBy: actor.actorId }
        const saved = await db.query(`UPDATE page_studio_sites
        SET email_configuration = jsonb_set(email_configuration, ARRAY[$4]::text[], $5::jsonb, TRUE), updated_at = NOW()
        WHERE tenant_id = $1 AND client_id = $2 AND id = $3 AND email_configuration = $6::jsonb`,
        [row.tenant_id, row.client_id, siteId, environment, JSON.stringify(record), JSON.stringify(row.email_configuration)])
        if (saved.rowCount !== 1) throw fail('EMAIL_CONFLICT', 409, 'Email settings changed. Reload before saving again.')
        await db.query(`INSERT INTO page_studio_audit_events
        (tenant_id, client_id, site_id, actor_id, actor_role, action, resource_type, resource_id, metadata)
        VALUES ($1, $2, $3::uuid, $4, $5, 'email.settings.updated', 'email_configuration', $3::uuid::text, $6::jsonb)`,
        [row.tenant_id, row.client_id, siteId, actor.actorId, actor.role, JSON.stringify({ environment, revision: record.revision, previousRevision: parsed.data.expectedRevision })])
      }
      return {
        siteId, environment, revision: record?.revision ?? 0, settings: record?.settings ?? null,
        updatedAt: record?.updatedAt ?? null, canEdit,
        // No scoped Cloudflare sender/routing evidence currently exists in this control plane.
        // Generic portal-auth email bindings and user-entered addresses grant no delivery authority.
        readiness: { status: record ? 'setup_required' : 'not_configured', sendingEnabled: false, forwardingEnabled: false, senderVerification: 'unverified',
          message: 'Preferences only. Email sending and forwarding are not connected for this website. Your agency must complete provider verification and delivery setup.' }
      }
    })
  } catch (error) {
    if ((error as { code?: string })?.code === '42703') throw fail('EMAIL_SCHEMA_PENDING', 503, 'Website email settings setup is pending')
    throw error
  }
}
export const readPageStudioEmailConfiguration = (request: Request, dependencies: Dependencies = {}) => operate(request, undefined, dependencies)
export const writePageStudioEmailConfiguration = (request: Request & { body: unknown }, dependencies: Dependencies = {}) => {
  if (request.body === undefined) throw fail('EMAIL_INVALID', 400, 'Email settings are required')
  return operate(request, request.body, dependencies)
}
