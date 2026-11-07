import { createError, type H3Event } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows, queryRowsFresh } from '~~/server/utils/db'
import type { PermissionGroup } from '~~/server/utils/permissions'
import { resolveFreshStaffRoleAuthority, type FreshStaffRoleAuthority } from './freshStaffRoleAuthority'
import { canAccessAllActiveClients } from './clientAccess'
import { assertFinancePermission } from '~~/server/utils/financeAccess'
import { getSelectedTenant } from '~~/server/utils/session'
import { createPlatformAgentAuthority, type PlatformAgentAuthority } from './platformAgentScope'

export interface UserPlatformAgentAuthorityOptions {
  permissionGroups: readonly PermissionGroup[]
  tenant: 'required' | 'none'
  clientAccess?: 'assigned_or_management' | 'all'
  /** Preparation/mutation paths also require the freshly resolved role to be writable. */
  write?: boolean
}

function correlationId() {
  if (!globalThis.crypto?.randomUUID) {
    throw createError({ statusCode: 503, statusMessage: 'Secure request identity is unavailable' })
  }
  return globalThis.crypto.randomUUID()
}

async function allowedClientIds(user: FreshStaffRoleAuthority, financeGlobal: boolean) {
  const rows = financeGlobal || canAccessAllActiveClients(user.permissionGroups)
    ? await queryRowsFresh<{ id: string }>(`SELECT id::text AS id FROM agency_clients WHERE is_active = true ORDER BY id`)
    : await queryRowsFresh<{ id: string }>(
        `SELECT ac.id::text AS id
         FROM agency_clients ac
         INNER JOIN client_team_assignments cta ON cta.client_id = ac.id
         WHERE ac.is_active = true
           AND cta.team_member_id = $1
         ORDER BY ac.id`,
        [user.userId]
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
  const fresh = await resolveFreshStaffRoleAuthority(event, user.id)
  const permissions = options.permissionGroups.filter(permission => fresh.permissionGroups.includes(permission))
  if (!permissions.length || (options.write === true && fresh.readOnly)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden - Insufficient assistant permissions' })
  }

  if (permissions.includes('FINANCE')) await assertFinancePermission(event, user.id, options.write === true)
  const tenantId = options.tenant === 'required' ? await getSelectedTenant(event) : null
  if (options.tenant === 'required' && !tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }
  if (tenantId) await requireConnectedTenant(tenantId)

  return createPlatformAgentAuthority({
    actor: { type: 'user', id: user.id },
    tenantId,
    allowedClientIds: await allowedClientIds(fresh, options.clientAccess === 'all' && permissions.includes('FINANCE')),
    permissions,
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
