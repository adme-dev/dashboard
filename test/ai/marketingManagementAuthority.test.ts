/* eslint-disable @typescript-eslint/no-explicit-any -- Partial database and H3 dependency doubles exercise runtime authority boundaries. */
/* eslint-disable @stylistic/max-statements-per-line -- Compact fixture setup keeps paired state changes together. */
import { beforeEach, expect, it, vi } from 'vitest'
import { resolveMcpStaffContext } from '../../server/utils/ai/mcp/staffAuthority'
import { isMcpManagementStaff } from '../../server/utils/ai/mcp/marketingPolicy'
import { requireIndependentMarketingReviewer, assertMarketingCapabilityAtBoundary } from '../../server/utils/ai/marketing/reviewAuthority'
import { resolveMarketingReadScope, requireMarketingReadPermission, requireScopedClient, clientScopeSql } from '../../server/utils/ai/marketing/readScope'
import { hasRole } from '../../server/utils/auth'
import { PERMISSIONS, SYSTEM_ROLE_PERMISSIONS, roleHasPermission } from '../../server/utils/permissions'

const state = vi.hoisted(() => ({ groups: ['MARKETING_MANAGEMENT'], active: true, readOnly: false,
  clientActive: true, assignmentCount: 101, sql: [] as string[] }))
const USER = '11111111-1111-4111-8111-111111111111'
const PEER = '22222222-2222-4222-8222-222222222222'
const CLIENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
vi.mock('~~/server/utils/db', async importOriginal => ({
  ...await importOriginal<typeof import('../../server/utils/db')>(),
  queryOneFresh: vi.fn(async (sql: string) => {
    state.sql.push(sql)
    if (sql.includes('FROM team_members')) return state.active ? { role: 'member', custom_role_id: 'custom-role', name: 'Marketing' } : null
    if (sql.includes('FROM custom_roles')) return { permission_groups: state.groups, is_read_only: state.readOnly }
    if (sql.includes('FROM agency_clients')) return state.clientActive ? { id: CLIENT } : null
    throw new Error(`Unexpected query: ${sql}`)
  }),
  queryRowsFresh: vi.fn(async (sql: string) => {
    state.sql.push(sql)
    if (sql.includes('client_team_assignments')) return Array.from({ length: state.assignmentCount }, () => ({ client_id: CLIENT }))
    throw new Error(`Unexpected query: ${sql}`)
  })
}))
vi.mock('~~/server/utils/godMode/authority', () => ({ resolveGodModeAuthority: vi.fn(), isActiveGodModeAuthority: () => false }))

const event = { context: { cloudflare: { env: { MCP_MARKETING_STAFF_GRANTS: JSON.stringify({ [USER]: ['ads_plan'] }) } } } } as any
beforeEach(() => {
  state.groups = ['MARKETING_MANAGEMENT']; state.active = true; state.readOnly = false
  state.clientActive = true; state.assignmentCount = 101; state.sql = []
})
it('resolves the active portfolio beyond 100 clients without assignment rows or management elevation', async () => {
  const ctx = await resolveMcpStaffContext(event, USER, ['mcp:read'])
  expect(ctx.permissionGroups).toEqual(['MARKETING_MANAGEMENT'])
  expect(ctx.assistantScope).toMatchObject({ clientAccessMode: 'all_active', assignedClientIds: [] })
  expect(state.sql.some(sql => sql.includes('client_team_assignments'))).toBe(false)
  expect(isMcpManagementStaff(ctx)).toBe(false)
  expect(PERMISSIONS).not.toHaveProperty('MARKETING_MANAGEMENT')
  for (const roles of [PERMISSIONS.ADMIN, PERMISSIONS.MANAGEMENT, PERMISSIONS.FINANCE]) {
    expect(hasRole({ id: USER, role: 'member', permissionGroups: ctx.permissionGroups } as any, roles)).toBe(false)
  }
  for (const [role, groups] of Object.entries(SYSTEM_ROLE_PERMISSIONS)) {
    expect(groups).not.toContain('MARKETING_MANAGEMENT')
    expect(roleHasPermission(role, 'MARKETING_MANAGEMENT')).toBe(false)
  }
})
it('permits all marketing read families but keeps finance, owner refresh and inactive clients denied', async () => {
  const ctx = await resolveMcpStaffContext(event, USER, [])
  const scope = await resolveMarketingReadScope(ctx)
  expect(scope).toMatchObject({ clientIds: null, activeClientsOnly: true, financialReadAllowed: false, ownerRefreshAllowed: false })
  for (const family of ['campaigns', 'ads', 'creatives', 'search_terms', 'pacing', 'social', 'clients', 'lead_summary'] as const) {
    expect(() => requireMarketingReadPermission(scope, family)).not.toThrow()
  }
  expect(clientScopeSql(scope, 'c.id', [])).toContain('authorized_client.is_active = true')
  await expect(requireScopedClient(scope, CLIENT)).resolves.toBeUndefined()
  state.clientActive = false
  await expect(requireScopedClient(scope, CLIENT)).rejects.toMatchObject({ statusCode: 404 })
})
it('permits a writable independent marketing peer but denies self review, read-only and inactive client review', async () => {
  await expect(requireIndependentMarketingReviewer(event, { requesterId: USER, reviewerId: PEER, clientId: CLIENT })).resolves.toMatchObject({ id: PEER, role: 'member' })
  await expect(requireIndependentMarketingReviewer(event, { requesterId: USER, reviewerId: USER, clientId: CLIENT })).rejects.toMatchObject({ statusCode: 403 })
  state.readOnly = true
  await expect(requireIndependentMarketingReviewer(event, { requesterId: USER, reviewerId: PEER, clientId: CLIENT })).rejects.toMatchObject({ statusCode: 403 })
  state.readOnly = false; state.clientActive = false
  await expect(requireIndependentMarketingReviewer(event, { requesterId: USER, reviewerId: PEER, clientId: CLIENT })).rejects.toMatchObject({ statusCode: 403 })
})
it('rechecks revoked reviewer and requester authority and preserves ordinary assignment cap', async () => {
  await expect(assertMarketingCapabilityAtBoundary(event, USER, CLIENT, 'ads_plan')).resolves.toMatchObject({ mcpStaffAuthority: 'fresh' })
  state.groups = []; state.assignmentCount = 0
  await expect(assertMarketingCapabilityAtBoundary(event, USER, CLIENT, 'ads_plan')).rejects.toMatchObject({ statusCode: 403 })
  await expect(requireIndependentMarketingReviewer(event, { requesterId: USER, reviewerId: PEER, clientId: CLIENT })).rejects.toMatchObject({ statusCode: 403 })
  state.assignmentCount = 101
  await expect(resolveMcpStaffContext(event, USER, [])).rejects.toMatchObject({ statusCode: 503 })
  state.active = false
  await expect(resolveMcpStaffContext(event, USER, [])).rejects.toMatchObject({ statusCode: 403 })
})
