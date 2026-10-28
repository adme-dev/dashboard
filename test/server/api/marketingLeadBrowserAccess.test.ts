/* eslint-disable @typescript-eslint/no-explicit-any -- Route and storage fixtures use partial Nitro shapes. */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ids = {
  client: '11111111-1111-4111-8111-111111111111',
  other: '99999999-9999-4999-8999-999999999999',
  lead: '22222222-2222-4222-8222-222222222222',
  rule: '66666666-6666-4666-8666-666666666666',
  assignee: '55555555-5555-4555-8555-555555555555',
  user: '33333333-3333-4333-8333-333333333333'
}
const state = vi.hoisted(() => ({
  marketing: true,
  active: true,
  assigneeAllowed: true,
  lead: null as any,
  rule: null as any,
  calls: [] as string[],
  role: vi.fn(),
  write: vi.fn()
}))
vi.mock('~~/server/utils/auth', () => ({
  requireAuth: vi.fn(async () => ({ id: ids.user, role: 'member' })),
  requireRole: state.role,
  requireWriteAccess: state.write
}))
vi.mock('~~/server/utils/clientScoping', () => ({
  hasFreshMarketingManagementPermission: vi.fn(async () => state.marketing)
}))
vi.mock('~~/server/utils/ai/mcp/staffAuthority', () => ({
  resolveMcpStaffContext: vi.fn(async (_event: unknown, userId: string) => ({
    userId,
    userRole: 'member',
    event: {},
    source: 'mcp',
    mcpStaffAuthority: 'fresh',
    permissionGroups: ['MARKETING_MANAGEMENT'],
    assistantReadOnly: false,
    assistantScope: {
      clientAccessMode: userId === ids.assignee && !state.assigneeAllowed ? 'assigned' : 'all_active',
      assignedClientIds: [],
      departmentIds: [],
      catalogReleaseIds: []
    }
  }))
}))
const query = vi.hoisted(() => vi.fn(async (sql: string, params: any[] = []) => {
  state.calls.push(sql)
  if (sql.includes('FROM agency_clients')) return { rows: state.active ? [{ id: ids.client }] : [], rowCount: state.active ? 1 : 0 }
  if (sql.includes('FROM lead_form_rules')) return { rows: state.rule ? [state.rule] : [], rowCount: state.rule ? 1 : 0 }
  if (sql.includes('INSERT INTO lead_form_rules')) return { rows: [{ id: ids.rule }], rowCount: 1 }
  if (sql.includes('FROM leads') || sql.includes('UPDATE leads')) {
    if (sql.includes('is_active=TRUE') && (!state.active || !state.lead.client_id)) return { rows: [], rowCount: 0 }
    if (sql.includes('UPDATE leads')) state.lead.assigned_to = params[0]
    return { rows: state.lead ? [state.lead] : [], rowCount: state.lead ? 1 : 0 }
  }
  return { rows: [], rowCount: 0 }
}))
vi.mock('~~/server/utils/db', () => ({
  queryOne: async (sql: string, params?: any[]) => (await query(sql, params)).rows[0] ?? null,
  queryOneFresh: async (sql: string, params?: any[]) => (await query(sql, params)).rows[0] ?? null,
  queryRows: async (sql: string, params?: any[]) => (await query(sql, params)).rows,
  queryRowsFresh: async (sql: string, params?: any[]) => (await query(sql, params)).rows,
  queryCount: vi.fn(async () => 0),
  execute: vi.fn(async () => 1),
  transaction: async (fn: any) => fn({ query })
}))
vi.mock('~~/server/utils/leads/statusTransition', () => ({ leadStatusTransitionService: { move: vi.fn() } }))
vi.mock('~~/server/utils/measurement/publisher', () => ({ conversionOutboxPublisher: { publishEvent: vi.fn() } }))

const queryString = { current: {} as Record<string, unknown> }
const routeParams = { current: {} as Record<string, string> }
const body = { current: null as any }
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('getQuery', () => queryString.current)
vi.stubGlobal('getRouterParam', (_event: unknown, name: string) => routeParams.current[name])
vi.stubGlobal('readBody', async () => body.current)

const list = (await import('~~/server/api/leads/list.get')).default as any
const detail = (await import('~~/server/api/leads/[id].get')).default as any
const patch = (await import('~~/server/api/leads/[id].patch')).default as any
const ruleList = (await import('~~/server/api/leads/rules/list.get')).default as any
const ruleCreate = (await import('~~/server/api/leads/rules/index.post')).default as any

beforeEach(() => {
  vi.clearAllMocks()
  state.marketing = true
  state.active = true
  state.assigneeAllowed = true
  state.calls = []
  state.lead = { id: ids.lead, client_id: ids.client, status: 'new', assigned_to: null, contacted_at: null, contacted_by: null }
  state.rule = null
  state.role.mockResolvedValue({ id: ids.user, role: 'member' })
  state.write.mockResolvedValue({ id: ids.user, role: 'member' })
  queryString.current = { page: '1', page_size: '50' }
  routeParams.current = { id: ids.lead, ruleId: ids.rule }
  body.current = null
})

describe('marketing lead browser active-client scope', () => {
  it('excludes unmapped leads for marketing while preserving the legacy unmapped filter', async () => {
    queryString.current = { unmapped: 'true' }
    await list({})
    const marketingSql = state.calls.join('\n')
    expect(marketingSql).toContain('c.is_active=TRUE')
    expect(marketingSql).not.toContain('l.client_id IS NULL')

    state.marketing = false
    state.calls = []
    await list({})
    expect(state.calls.join('\n')).toContain('l.client_id IS NULL')
    expect(state.calls.join('\n')).not.toContain('JOIN agency_clients c ON c.id=l.client_id')
  })

  it('returns active detail but rejects an inactive or unmapped lead for marketing', async () => {
    expect((await detail({})).lead.id).toBe(ids.lead)
    state.active = false
    await expect(detail({})).rejects.toMatchObject({ statusCode: 404 })
    state.active = true
    state.lead.client_id = null
    await expect(detail({})).rejects.toMatchObject({ statusCode: 404 })
  })

  it('filters rule lists to active clients only for marketing and leaves legacy SQL unchanged', async () => {
    await ruleList({})
    expect(state.calls[0]).toContain('active_client.is_active=TRUE')
    state.marketing = false
    state.calls = []
    await ruleList({})
    expect(state.calls[0]).not.toContain('active_client.is_active=TRUE')
  })

  it('assigns through the native scoped service only with current assignee client authority', async () => {
    body.current = { assigned_to: ids.assignee }
    await expect(patch({})).resolves.toEqual({ ok: true })
    expect(state.lead.assigned_to).toBe(ids.assignee)

    state.lead.assigned_to = null
    state.assigneeAllowed = false
    await expect(patch({})).rejects.toMatchObject({ statusCode: 403 })
    expect(state.lead.assigned_to).toBeNull()
  })

  it('preserves legacy assignment behavior without applying marketing-only client filters', async () => {
    state.marketing = false
    state.active = false
    body.current = { assigned_to: ids.assignee }
    await expect(patch({})).resolves.toEqual({ ok: true })
    expect(state.lead.assigned_to).toBe(ids.assignee)
    expect(state.write).toHaveBeenCalled()
    expect(state.calls.join('\n')).not.toContain('JOIN agency_clients c ON c.id=l.client_id')
  })

  it('rejects a cross-client rule owner for marketing and preserves legacy role enforcement', async () => {
    body.current = { client_id: ids.client, source: 'meta', form_id: 'form-1' }
    state.rule = { id: ids.rule, client_id: ids.other, source: 'meta', form_id: 'form-1' }
    await expect(ruleCreate({})).rejects.toMatchObject({ statusCode: 409 })
    expect(state.role).not.toHaveBeenCalled()

    state.marketing = false
    state.calls = []
    await expect(ruleCreate({})).resolves.toEqual({ ok: true, id: ids.rule })
    expect(state.role).toHaveBeenCalled()
  })
})
