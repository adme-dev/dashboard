import { createError, type H3Event } from 'h3'
import { requireAuth, type User } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { roleHasPermission, type PermissionGroup } from '~~/server/utils/permissions'
import { getSelectedTenant } from '~~/server/utils/session'
import { createPlatformAgentAuthority, type PlatformAgentAuthority } from './platformAgentScope'

export interface UserPlatformAgentAuthorityOptions {
  permissionGroups: readonly PermissionGroup[]
  tenant: 'required' | 'none'
  clientAccess?: 'assigned_or_management' | 'all'
}

function hasPermission(user: User, permission: PermissionGroup) {
  return roleHasPermission(user.role, permission) || user.permissionGroups?.includes(permission)
}

function hasAnyPermission(user: User, permissions: readonly PermissionGroup[]) {
  return permissions.some(permission => hasPermission(user, permission))
}

function hasAllClientAccess(user: User) {
  return hasPermission(user, 'ADMIN') || hasPermission(user, 'MANAGEMENT')
}

function correlationId() {
  if (!globalThis.crypto?.randomUUID) {
    throw createError({ statusCode: 503, statusMessage: 'Secure request identity is unavailable' })
  }
  return globalThis.crypto.randomUUID()
}

async function allowedClientIds(user: User, mode: 'assigned_or_management' | 'all') {
  const rows = mode === 'all' || hasAllClientAccess(user)
    ? await allActiveClientIds()
    : await queryRows<{ id: string }>(
        `SELECT ac.id::text AS id
         FROM agency_clients ac
         INNER JOIN client_team_assignments cta ON cta.client_id = ac.id
         WHERE ac.is_active = true
           AND cta.team_member_id = $1
         ORDER BY ac.id`,
        [user.id]
      )

  return rows.map(row => row.id)
}

async function allActiveClientIds() {
  return queryRows<{ id: string }>(
    `SELECT id::text AS id
     FROM agency_clients
     WHERE is_active = true
     ORDER BY id`
  )
}

async function requireConnectedTenant(tenantId: string) {
  const connectedTenant = await queryOne<{ tenant_id: string }>(
    `SELECT tenant_id
     FROM xero_org_connection
     WHERE tenant_id = $1
       AND tenant_id <> '__default__'
     LIMIT 1`,
    [tenantId]
  )
  if (!connectedTenant) {
    throw createError({ statusCode: 403, statusMessage: 'Tenant is outside the connected organization scope' })
  }
}

export async function resolveUserPlatformAgentAuthority(
  event: H3Event,
  options: UserPlatformAgentAuthorityOptions
): Promise<PlatformAgentAuthority> {
  const user = await requireAuth(event)
  if (!hasAnyPermission(user, options.permissionGroups)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden - Insufficient assistant permissions' })
  }

  const tenantId = options.tenant === 'required' ? await getSelectedTenant(event) : null
  if (options.tenant === 'required' && !tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }
  if (tenantId) await requireConnectedTenant(tenantId)

  return createPlatformAgentAuthority({
    actor: { type: 'user', id: user.id },
    tenantId,
    allowedClientIds: await allowedClientIds(user, options.clientAccess ?? 'assigned_or_management'),
    permissions: options.permissionGroups.filter(permission => hasPermission(user, permission)),
    correlationId: correlationId(),
    source: 'authenticated_app'
  })
}

export async function resolveServicePlatformAgentAuthority(options: {
  serviceId: string
  tenantId?: string | null
  tenant: 'required' | 'none'
}): Promise<PlatformAgentAuthority> {
  const tenantId = typeof options.tenantId === 'string' && options.tenantId.trim()
    ? options.tenantId.trim()
    : null
  if (options.tenant === 'required' && !tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'tenantId required' })
  }
  if (tenantId) {
    await requireConnectedTenant(tenantId)
  }

  const clients = await allActiveClientIds()
  return createPlatformAgentAuthority({
    actor: { type: 'service', id: options.serviceId },
    tenantId: options.tenant === 'required' ? tenantId : null,
    allowedClientIds: clients.map(row => row.id),
    permissions: ['PLATFORM_AGENTS_SERVICE'],
    correlationId: correlationId(),
    source: 'authenticated_service'
  })
}
