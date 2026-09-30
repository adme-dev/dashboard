import { z } from 'zod'
import { transaction } from '~~/server/utils/db'
import type { PageStudioQueryClient, RunPageStudioTransaction } from '~~/server/utils/pageStudio/sites'

const Id = z.string().uuid()
const WorkspaceActor = z.object({ workspaceId: Id, identityId: Id }).strict()
const Creation = z.object({ identityId: Id, requestId: Id, name: z.string().trim().min(1).max(160) }).strict()
const LegacyBinding = WorkspaceActor.extend({ clientId: Id, tenantId: z.string().trim().min(1).max(200) }).strict()
const AgencyActor = z.object({ workspaceId: Id, agencyUserId: Id, tenantId: z.string().trim().min(1).max(200) }).strict()

export class CustomerWorkspaceError extends Error {
  constructor(readonly code: 'WORKSPACE_ACCESS_DENIED' | 'WORKSPACE_REQUEST_CONFLICT' | 'WORKSPACE_BINDING_CONFLICT' | 'WORKSPACE_INVALID_INPUT', readonly statusCode: number) {
    super(code === 'WORKSPACE_ACCESS_DENIED' ? 'Customer workspace access is not active' : 'Customer workspace request could not be completed')
    this.name = 'CustomerWorkspaceError'
  }
}
const denied = () => new CustomerWorkspaceError('WORKSPACE_ACCESS_DENIED', 403)
function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new CustomerWorkspaceError('WORKSPACE_INVALID_INPUT', 400)
  return result.data
}
interface Identity { id: string, portal_user_id: string | null, client_id: string | null, portal_role: string | null }
interface Workspace { id: string, name: string, status: string }
interface AccessRow { role: 'owner' | 'manager' | 'editor' | 'viewer', tenant_id: string | null, client_id: string | null }

// IDs supplied here must come from server-authenticated identity adapters, never
// request bodies. No public endpoint exposes these internal foundation services.
async function requireIdentity(db: PageStudioQueryClient, identityId: string): Promise<Identity> {
  const result = await db.query<Identity>(`
    SELECT identity.id, identity.portal_user_id, portal.client_id, portal.role AS portal_role
    FROM page_studio_customer_identities identity
    LEFT JOIN client_users portal ON portal.id = identity.portal_user_id
    LEFT JOIN agency_clients client ON client.id = portal.client_id
    WHERE identity.id = $1 AND identity.status = 'active' AND identity.verified_at <= clock_timestamp()
      AND (identity.portal_user_id IS NULL OR (portal.status = 'active' AND client.is_active = TRUE))
    FOR UPDATE OF identity`, [identityId])
  if (!result.rows[0]) throw denied()
  return result.rows[0]
}

async function readAccess(db: PageStudioQueryClient, input: z.infer<typeof WorkspaceActor>): Promise<AccessRow> {
  const result = await db.query<AccessRow>(`
    SELECT membership.role, binding.tenant_id, binding.client_id
    FROM page_studio_customer_workspaces workspace
    JOIN page_studio_workspace_memberships membership ON membership.workspace_id = workspace.id
    LEFT JOIN page_studio_workspace_client_bindings binding ON binding.workspace_id = workspace.id
    LEFT JOIN agency_clients client ON client.id = binding.client_id
    WHERE workspace.id = $1 AND workspace.status = 'active' AND membership.identity_id = $2
      AND membership.revoked_at IS NULL AND (membership.expires_at IS NULL OR membership.expires_at > clock_timestamp())
      AND (binding.client_id IS NULL OR client.is_active = TRUE)
    FOR UPDATE OF workspace, membership`, [input.workspaceId, input.identityId])
  if (!result.rows[0]) throw denied()
  return result.rows[0]
}

/** Atomically creates ownership; does not grant a plan, provision a site or charge a payer. */
export async function createCustomerWorkspace(input: z.infer<typeof Creation>, runTransaction: RunPageStudioTransaction = transaction) {
  const request = validate(Creation, input)
  return runTransaction(async (db) => {
    // Serialize retries per verified identity, including before the first workspace exists.
    const identity = await requireIdentity(db, request.identityId)
    const existing = await db.query<Workspace>(`SELECT id, name, status FROM page_studio_customer_workspaces
      WHERE created_by = $1 AND creation_request_id = $2`, [request.identityId, request.requestId])
    if (existing.rows[0]) {
      const workspace = existing.rows[0]
      const access = await readAccess(db, { workspaceId: workspace.id, identityId: request.identityId })
      if (access.role !== 'owner' || (identity.portal_user_id && access.client_id && identity.client_id !== access.client_id)) throw denied()
      if (workspace.name !== request.name) throw new CustomerWorkspaceError('WORKSPACE_REQUEST_CONFLICT', 409)
      return { workspace, replayed: true }
    }
    const inserted = await db.query<Workspace>(`INSERT INTO page_studio_customer_workspaces (name, created_by, creation_request_id)
      VALUES ($1, $2, $3) RETURNING id, name, status`, [request.name, request.identityId, request.requestId])
    const workspace = inserted.rows[0]!
    await db.query(`INSERT INTO page_studio_workspace_memberships (workspace_id, identity_id, role)
      VALUES ($1, $2, 'owner')`, [workspace.id, request.identityId])
    await db.query(`INSERT INTO page_studio_workspace_events (workspace_id, actor_identity_id, action)
      VALUES ($1, $2, 'workspace_created')`, [workspace.id, request.identityId])
    return { workspace, replayed: false }
  })
}

/** Workspace membership never substitutes for existing site/environment authorization. */
export async function resolveCustomerWorkspaceAccess(input: z.infer<typeof WorkspaceActor>, runTransaction: RunPageStudioTransaction = transaction) {
  const request = validate(WorkspaceActor, input)
  return runTransaction(async (db) => {
    const identity = await requireIdentity(db, request.identityId)
    const access = await readAccess(db, request)
    if (identity.portal_user_id && access.client_id && identity.client_id !== access.client_id) throw denied()
    return { workspaceId: request.workspaceId, role: access.role,
      legacyBinding: access.client_id ? { tenantId: access.tenant_id!, clientId: access.client_id } : null }
  })
}

/** Explicit legacy adapter, used only after authenticating the exact portal owner. */
export async function bindLegacyCustomerWorkspace(input: z.infer<typeof LegacyBinding>, runTransaction: RunPageStudioTransaction = transaction) {
  const request = validate(LegacyBinding, input)
  try {
    return await runTransaction(async (db) => {
      const identity = await requireIdentity(db, request.identityId)
      const access = await readAccess(db, request)
      if (access.role !== 'owner' || !identity.portal_user_id || identity.client_id !== request.clientId
        || !['admin', 'manager'].includes(identity.portal_role ?? '')) throw denied()
      const scope = await db.query(`SELECT id FROM page_studio_entitlements
        WHERE tenant_id = $1 AND client_id = $2 AND status <> 'cancelled' FOR SHARE`, [request.tenantId, request.clientId])
      if (scope.rows.length !== 1) throw denied()
      if (access.client_id) {
        if (access.client_id !== request.clientId || access.tenant_id !== request.tenantId) throw new CustomerWorkspaceError('WORKSPACE_BINDING_CONFLICT', 409)
        return { workspaceId: request.workspaceId, clientId: request.clientId, tenantId: request.tenantId }
      }
      await db.query(`INSERT INTO page_studio_workspace_client_bindings (workspace_id, tenant_id, client_id)
        VALUES ($1, $2, $3)`, [request.workspaceId, request.tenantId, request.clientId])
      await db.query(`INSERT INTO page_studio_workspace_events (workspace_id, actor_identity_id, action)
        VALUES ($1, $2, 'legacy_client_bound')`, [request.workspaceId, request.identityId])
      return { workspaceId: request.workspaceId, clientId: request.clientId, tenantId: request.tenantId }
    })
  } catch (error) {
    if ((error as { code?: string }).code === '23505') throw new CustomerWorkspaceError('WORKSPACE_BINDING_CONFLICT', 409)
    throw error
  }
}

/** Intersect this result with existing server-verified agency RBAC before any site action. */
export async function resolveAgencyWorkspaceAccess(input: z.infer<typeof AgencyActor>, runTransaction: RunPageStudioTransaction = transaction) {
  const request = validate(AgencyActor, input)
  return runTransaction(async (db) => {
    const result = await db.query<{ capabilities: Array<'workspace.read' | 'site.design'> }>(`
      SELECT grant_record.capabilities FROM page_studio_workspace_agency_grants grant_record
      JOIN page_studio_customer_workspaces workspace ON workspace.id = grant_record.workspace_id
      JOIN team_members staff ON staff.id = grant_record.agency_user_id
      LEFT JOIN page_studio_workspace_client_bindings binding ON binding.workspace_id = workspace.id
      LEFT JOIN agency_clients client ON client.id = binding.client_id
      WHERE grant_record.workspace_id = $1 AND grant_record.agency_user_id = $2 AND grant_record.tenant_id = $3
        AND workspace.status = 'active' AND staff.is_active = TRUE
        AND grant_record.revoked_at IS NULL AND (grant_record.expires_at IS NULL OR grant_record.expires_at > clock_timestamp())
        AND (binding.client_id IS NULL OR client.is_active = TRUE)`, [request.workspaceId, request.agencyUserId, request.tenantId])
    if (!result.rows[0]) throw denied()
    return { workspaceId: request.workspaceId, capabilities: result.rows[0].capabilities }
  })
}
