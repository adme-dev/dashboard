// server/utils/ai/mcp/staffAuthority.ts
// Fresh authority for ordinary (non-owner) MCP staff. Resolved on EVERY tools/list, tools/call and
// connector preview so deactivation, custom-role edits, assignment changes and grant revocation take
// effect on the next request.
//
// Deliberately does NOT use roleResolver.resolveUserPermissions or clientScoping.getAssignedClientIds:
// both are five-minute KV caches, and the role resolver falls back to static role defaults when the
// database lookup fails. Authorization here reads the database directly and fails closed instead.
// Owner God mode is resolved separately by the routes and never reaches this module.
import { createError, type H3Event } from 'h3'
import { queryOneFresh, queryRowsFresh } from '~~/server/utils/db'
import {
  PERMISSION_GROUPS,
  SYSTEM_ROLE_PERMISSIONS,
  isReadOnlyRole,
  type PermissionGroup
} from '~~/server/utils/permissions'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import { hasMcpAllClientAuthority, marketingCapabilitiesFor } from './marketingPolicy'
import { resolveMcpRuntimeConfig, type McpRuntimeConfig } from './runtimeConfig'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PERMISSION_GROUP_SET = new Set<string>(PERMISSION_GROUPS)
export const MCP_STAFF_MAX_ASSIGNMENTS = 100

export interface McpStaffAuthorityDb {
  queryOne: <T>(sql: string, params?: unknown[]) => Promise<T | null>
  queryRows: <T>(sql: string, params?: unknown[]) => Promise<T[]>
}

export interface McpStaffAuthorityOptions {
  db?: McpStaffAuthorityDb
  /** Pass the route's already-resolved config so one request uses one configuration snapshot. */
  runtimeConfig?: McpRuntimeConfig
}

// The fresh (uncached Hyperdrive) primitives: the ordinary queryOne/queryRows go through the cached
// binding, which could serve a revoked identity, role policy or assignment past the next request.
const defaultDb: McpStaffAuthorityDb = {
  queryOne: queryOneFresh as McpStaffAuthorityDb['queryOne'],
  queryRows: queryRowsFresh as McpStaffAuthorityDb['queryRows']
}

interface IdentityRow {
  role: string | null
  custom_role_id: string | null
  name: string | null
  email: string | null
}

interface RolePolicyRow {
  is_read_only: unknown
  permission_groups: unknown
}

function inactive(): never {
  throw createError({ statusCode: 403, statusMessage: 'Unknown or inactive user' })
}

function unavailable(): never {
  throw createError({ statusCode: 503, statusMessage: 'MCP staff authority unavailable' })
}

async function guarded<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load()
  } catch {
    return unavailable()
  }
}

function groupsFromRow(row: RolePolicyRow): PermissionGroup[] {
  if (!Array.isArray(row.permission_groups)) return unavailable()
  return [...new Set(row.permission_groups.filter((group): group is PermissionGroup =>
    typeof group === 'string' && PERMISSION_GROUP_SET.has(group)))]
}

async function resolveRolePolicy(
  identity: IdentityRow,
  db: McpStaffAuthorityDb
): Promise<{ groups: PermissionGroup[], readOnly: boolean }> {
  const role = identity.role ?? ''
  const legacyReadOnly = isReadOnlyRole(role)
  const select = `SELECT cr.is_read_only,
            COALESCE(
              array_agg(rpg.permission_group) FILTER (WHERE rpg.permission_group IS NOT NULL),
              '{}'
            ) AS permission_groups
       FROM custom_roles cr
       LEFT JOIN role_permission_groups rpg ON rpg.role_id = cr.id`

  if (identity.custom_role_id) {
    const row = await guarded(() => db.queryOne<RolePolicyRow>(
      `${select}
      WHERE cr.id = $1
      GROUP BY cr.id`,
      [identity.custom_role_id]
    ))
    // An assigned custom role that no longer exists grants nothing (never the legacy role's defaults).
    if (!row) return { groups: [], readOnly: true }
    return { groups: groupsFromRow(row), readOnly: row.is_read_only !== false || legacyReadOnly }
  }

  // System roles are editable rows (admin/roles); the static map is only the unseeded default.
  const row = await guarded(() => db.queryOne<RolePolicyRow>(
    `${select}
      WHERE cr.slug = $1 AND cr.is_system = TRUE
      GROUP BY cr.id`,
    [role]
  ))
  if (!row) return { groups: [...(SYSTEM_ROLE_PERMISSIONS[role] ?? [])], readOnly: legacyReadOnly }
  return { groups: groupsFromRow(row), readOnly: row.is_read_only === true || legacyReadOnly }
}

/**
 * Resolve the trusted ToolContext for one ordinary MCP staff request.
 *  - 403 for an invalid, unknown or deactivated actor (checked before any other lookup)
 *  - 503 when authority storage is unavailable/malformed or the assignment set is unbounded
 *  - explicit MANAGEMENT/ADMIN groups → `all_active`; everyone else → their current active
 *    assignments only (zero assignments = zero clients, never agency-wide)
 *  - marketing capabilities from MCP_MARKETING_STAFF_GRANTS (never adds groups or client scope)
 */
export async function resolveMcpStaffContext(
  event: H3Event,
  userId: string,
  scopes: Iterable<string> | null | undefined,
  options: McpStaffAuthorityOptions = {}
): Promise<ToolContext> {
  if (typeof userId !== 'string' || !UUID_PATTERN.test(userId)) inactive()
  const db = options.db ?? defaultDb
  const runtimeConfig = options.runtimeConfig ?? resolveMcpRuntimeConfig(event)

  const identity = await guarded(() => db.queryOne<IdentityRow>(
    `SELECT user_role AS role, custom_role_id::text AS custom_role_id, name, email
       FROM team_members
      WHERE id = $1 AND is_active = TRUE
      LIMIT 1`,
    [userId]
  ))
  if (!identity) inactive()

  const { groups, readOnly } = await resolveRolePolicy(identity, db)
  const allClients = hasMcpAllClientAuthority(groups)

  let assignedClientIds: string[] = []
  if (!allClients) {
    const rows = await guarded(() => db.queryRows<{ client_id: string }>(
      `SELECT assignment.client_id::text AS client_id
         FROM client_team_assignments assignment
         JOIN agency_clients client ON client.id = assignment.client_id
        WHERE assignment.team_member_id = $1
          AND client.is_active = TRUE
        ORDER BY assignment.client_id
        LIMIT ${MCP_STAFF_MAX_ASSIGNMENTS + 1}`,
      [userId]
    ))
    if (!Array.isArray(rows) || rows.length > MCP_STAFF_MAX_ASSIGNMENTS) unavailable()
    assignedClientIds = [...new Set(rows.map(row => row?.client_id).filter((id): id is string =>
      typeof id === 'string' && UUID_PATTERN.test(id)))]
  }

  return {
    userId,
    userRole: identity.role ?? '',
    userName: identity.name ?? undefined,
    userEmail: identity.email ?? undefined,
    permissionGroups: groups,
    assistantReadOnly: readOnly,
    mcpScopes: new Set(scopes ?? []),
    assistantScope: {
      // Department and catalog-release narrowing are not resolved on the MCP staff path.
      departmentIds: [],
      clientAccessMode: allClients ? 'all_active' : 'assigned',
      assignedClientIds,
      catalogReleaseIds: []
    },
    marketingCapabilities: marketingCapabilitiesFor(runtimeConfig.marketingStaffGrants, userId),
    mcpStaffAuthority: 'fresh',
    source: 'mcp',
    event
  }
}
