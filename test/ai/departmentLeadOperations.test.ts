/* eslint-disable @typescript-eslint/no-explicit-any -- Partial database and provider-free lead fixtures. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ids = {
  client: '11111111-1111-4111-8111-111111111111',
  otherClient: '99999999-9999-4999-8999-999999999999',
  lead: '22222222-2222-4222-8222-222222222222',
  proposer: '33333333-3333-4333-8333-333333333333',
  reviewer: '44444444-4444-4444-8444-444444444444',
  assignee: '55555555-5555-4555-8555-555555555555',
  rule: '66666666-6666-4666-8666-666666666666',
  destination: '77777777-7777-4777-8777-777777777777',
  proposal: '88888888-8888-4888-8888-888888888888'
}
const state = vi.hoisted(() => ({
  active: true,
  revokedUsers: [] as string[],
  lead: {} as any,
  rule: null as any,
  destinations: [] as any[],
  pending: [] as any[],
  claim: { kind: 'fresh' } as any,
  finish: vi.fn()
}))
const mocks = vi.hoisted(() => ({ scope: vi.fn(), authority: vi.fn() }))
vi.mock('~~/server/utils/ai/marketing/departmentAuthority', () => ({ requireMarketingDepartment: mocks.authority }))
vi.mock('~~/server/utils/ai/marketing/readScope', () => ({
  resolveMarketingReadScope: async (ctx: any) => ctx,
  requireScopedClient: mocks.scope
}))
vi.mock('~~/server/utils/ai/mcp/staffAuthority', () => ({
  resolveMcpStaffContext: vi.fn(async (_event: unknown, userId: string) => ({
    ...ctx,
    userId,
    mcpStaffAuthority: 'fresh' as const,
    permissionGroups: state.revokedUsers.includes(userId) ? [] : ['MARKETING_MANAGEMENT'],
    marketingCapabilities: state.revokedUsers.includes(userId) ? [] : ['department_management'],
    assistantReadOnly: false
  }))
}))
vi.mock('~~/server/utils/ai/marketing/departmentExecutionLedger', async original => ({
  ...await original<any>(),
  claimExecution: vi.fn(async () => state.claim),
  finishExecution: state.finish
}))

const query = vi.hoisted(() => vi.fn(async (sql: string, params: any[] = []) => {
  if (sql.includes('FROM agency_clients')) return { rows: state.active ? [{ id: ids.client }] : [], rowCount: state.active ? 1 : 0 }
  if (sql.includes('FROM team_members')) return { rows: [{ id: params[0], name: 'Active staff' }], rowCount: 1 }
  if (sql.includes('FROM leads')) return { rows: state.lead ? [state.lead] : [], rowCount: state.lead ? 1 : 0 }
  if (sql.includes('UPDATE leads')) {
    state.lead.assigned_to = params[0]
    return { rows: [state.lead], rowCount: 1 }
  }
  if (sql.includes('FROM lead_deliveries')) return { rows: [], rowCount: 0 }
  if (sql.includes('INSERT INTO lead_form_rules')) {
    state.rule = {
      id: ids.rule,
      client_id: params[0],
      source: params[1],
      form_id: params[2],
      form_name: params[3],
      enabled: params[4],
      created_by: params[5]
    }
    return { rows: [state.rule], rowCount: 1 }
  }
  if (sql.includes('UPDATE lead_form_rules')) {
    if (!state.rule) return { rows: [], rowCount: 0 }
    state.rule = { ...state.rule, source: params[1], form_id: params[2], form_name: params[3], enabled: params[4] }
    return { rows: [state.rule], rowCount: 1 }
  }
  if (sql.includes('FROM lead_form_rules') && sql.includes('id<>')) return { rows: [], rowCount: 0 }
  if (sql.includes('FROM lead_form_rules')) return { rows: state.rule ? [state.rule] : [], rowCount: state.rule ? 1 : 0 }
  if (sql.includes('INSERT INTO lead_rule_destinations')) {
    const row = {
      id: ids.destination,
      rule_id: params[0],
      destination_type: params[1],
      config: JSON.parse(params[2]),
      filter: params[3] ? JSON.parse(params[3]) : null,
      delay_minutes: params[4],
      enabled: params[5],
      sort_order: params[6]
    }
    state.destinations.push(row)
    return { rows: [row], rowCount: 1 }
  }
  if (sql.includes('UPDATE lead_rule_destinations')) {
    const row = state.destinations.find(item => item.id === params[0] && item.rule_id === params[1])
    if (!row) return { rows: [], rowCount: 0 }
    Object.assign(row, {
      destination_type: params[2], config: JSON.parse(params[3]),
      filter: params[4] ? JSON.parse(params[4]) : null,
      delay_minutes: params[5], enabled: params[6], sort_order: params[7]
    })
    return { rows: [row], rowCount: 1 }
  }
  if (sql.includes('DELETE FROM lead_rule_destinations')) {
    const before = state.destinations.length
    state.destinations = state.destinations.filter(item => item.rule_id !== params[0] || !params[1].includes(item.id))
    return { rows: [], rowCount: before - state.destinations.length }
  }
  if (sql.includes('FROM lead_rule_destinations')) return { rows: state.destinations, rowCount: state.destinations.length }
  if (sql.includes('INSERT INTO ai_pending_actions')) {
    const row = {
      id: ids.proposal,
      user_id: params[0],
      tool_name: params[1],
      resolved_payload: JSON.parse(params[2]),
      status: 'proposed',
      expires_at: '2099-01-01T00:00:00.000Z',
      confirmed_by: null,
      result_payload: null
    }
    state.pending.push(row)
    return { rows: [row], rowCount: 1 }
  }
  if (sql.includes('UPDATE ai_pending_actions') && sql.includes('confirmed_by')) {
    const row = state.pending[0]
    if (!row || row.status !== 'proposed') return { rows: [], rowCount: 0 }
    row.status = params[2]
    row.confirmed_by = params[3]
    row.resolved_payload = JSON.parse(params[4])
    return { rows: [row], rowCount: 1 }
  }
  if (sql.includes('UPDATE ai_pending_actions') && sql.includes('status=\'executed\'')) {
    const row = state.pending[0]
    if (!row || row.status !== 'approved') return { rows: [], rowCount: 0 }
    row.status = 'executed'
    row.result_payload = JSON.parse(params[1])
    return { rows: [row], rowCount: 1 }
  }
  if (sql.includes('FROM ai_pending_actions')) {
    return {
      rows: state.pending.filter(row => row.id === params[0]
        || (params[2] && row.resolved_payload.requestKey === params[2])),
      rowCount: 1
    }
  }
  if (sql.includes('pg_advisory')) return { rows: [], rowCount: 0 }
  return { rows: [], rowCount: 0 }
}))
vi.mock('~~/server/utils/db', () => ({
  queryOne: async (sql: string, params?: any[]) => (await query(sql, params)).rows[0] ?? null,
  queryOneFresh: async (sql: string, params?: any[]) => (await query(sql, params)).rows[0] ?? null,
  queryRows: async (sql: string, params?: any[]) => (await query(sql, params)).rows,
  queryRowsFresh: async (sql: string, params?: any[]) => (await query(sql, params)).rows,
  execute: vi.fn(async () => 1),
  transaction: async (fn: any) => fn({ query }),
  transactionWithoutRetry: async (fn: any) => fn({ query })
}))

const ctx = {
  userId: ids.proposer,
  userRole: 'member',
  source: 'mcp',
  event: { context: {} },
  mcpScopes: ['mcp:read', 'mcp:write'],
  mcpStaffAuthority: 'fresh',
  permissionGroups: ['MARKETING_MANAGEMENT'],
  marketingCapabilities: ['department_management'],
  assistantReadOnly: false,
  assistantScope: { clientAccessMode: 'all_active', assignedClientIds: [], departmentIds: [], catalogReleaseIds: [] }
} as ToolContext
const reviewer = { ...ctx, userId: ids.reviewer } as ToolContext
const key = `mcp:${'a'.repeat(64)}`
const digest = 'b'.repeat(64)
const run = async (name: string, args: any, actor = ctx, requestKey = key) => {
  const { runDepartmentLeadOperation } = await import('~~/server/utils/ai/marketing/departmentLeadOperations')
  return runDepartmentLeadOperation(name, args, actor, requestKey, digest)
}
const routingInput = () => ({
  clientId: ids.client,
  source: 'meta',
  formId: 'form-1',
  formName: 'Website leads',
  enabled: true,
  destinations: [{
    destinationType: 'slack',
    config: { webhook_url: 'https://hooks.slack.com/services/secret-value' },
    filter: { field: 'field_data.budget', op: 'gt', value: 5000 },
    delayMinutes: 0,
    enabled: true,
    sortOrder: 0
  }]
})
async function prepareReviewExecute() {
  const proposal = await run('marketing_propose_lead_routing_change', routingInput())
  expect(proposal).toMatchObject({ ok: true })
  const data = (proposal as any).data
  const review = await run('marketing_review_lead_routing_change', {
    clientId: ids.client,
    proposalId: data.proposalId,
    expectedRevision: data.revision,
    decision: 'approved'
  }, reviewer)
  expect(review).toMatchObject({ ok: true })
  return data
}

beforeEach(() => {
  vi.clearAllMocks()
  state.active = true
  state.revokedUsers = []
  state.claim = { kind: 'fresh' }
  state.rule = null
  state.destinations = []
  state.pending = []
  state.lead = {
    id: ids.lead,
    client_id: ids.client,
    source: 'meta',
    form_id: 'form-1',
    form_name: 'Website leads',
    campaign_id: 'campaign-1',
    campaign_name: 'Spring',
    status: 'new',
    assigned_to: null,
    contacted_at: null,
    contacted_by: null,
    submitted_at: '2026-10-28T00:00:00.000Z',
    deleted_at: null,
    is_test: false,
    field_data: { email: 'customer@example.test', secret: 'do-not-expose' },
    notes: 'customer secret'
  }
  mocks.scope.mockImplementation(async (_scope: unknown, clientId: string) => {
    if (!state.active || clientId !== ids.client) throw Object.assign(new Error('not found'), { statusCode: 404 })
  })
  mocks.authority.mockImplementation(async (actor: any, write = false) => {
    if (state.revokedUsers.includes(actor.userId) || (write && !actor.mcpScopes.includes('mcp:write'))) {
      throw Object.assign(new Error('denied'), { statusCode: 403 })
    }
    return actor
  })
})

describe('department lead follow-up and routing', () => {
  it('returns minimized follow-up detail and revision without customer payloads or delivery errors', async () => {
    const result = await run('marketing_get_lead_followup', { clientId: ids.client, leadId: ids.lead })
    expect(result).toMatchObject({ ok: true, data: {
      followup: { leadId: ids.lead, clientId: ids.client, status: 'new', assignedTo: null },
      deliveries: [],
      storedOnly: true
    } })
    expect(typeof (result as any).data.revision).toBe('string')
    expect(JSON.stringify(result)).not.toMatch(/customer@example|do-not-expose|customer secret|field_data|response_meta|last_error/)
  })

  it('assigns active client-authoritative staff atomically and rejects stale revision or replay mismatch', async () => {
    const detail = await run('marketing_get_lead_followup', { clientId: ids.client, leadId: ids.lead })
    const revision = (detail as any).data.revision
    const result = await run('marketing_assign_lead_followup', {
      clientId: ids.client,
      leadId: ids.lead,
      assigneeId: ids.assignee,
      expectedRevision: revision
    })
    expect(result).toMatchObject({ ok: true, data: { leadId: ids.lead, assigneeId: ids.assignee, committed: true } })
    expect(state.lead.assigned_to).toBe(ids.assignee)
    expect(state.finish).toHaveBeenCalledTimes(1)
    expect(await run('marketing_assign_lead_followup', {
      clientId: ids.client,
      leadId: ids.lead,
      assigneeId: null,
      expectedRevision: revision
    })).toMatchObject({ ok: false, code: 'conflict' })
    expect(state.lead.assigned_to).toBe(ids.assignee)
  })

  it('requires independent exact review then applies rule replacement locally without lead delivery or replay', async () => {
    const data = await prepareReviewExecute()
    const result = await run('marketing_execute_lead_routing_change', {
      clientId: ids.client,
      proposalId: data.proposalId,
      expectedRevision: data.revision,
      ack: true
    })
    expect(result, JSON.stringify(result)).toMatchObject({ ok: true, data: {
      proposalId: data.proposalId,
      committed: true,
      affectedFutureLeadsOnly: true,
      deliveriesCreated: 0,
      leadsReplayed: 0
    } })
    expect(state.rule).toMatchObject({ id: ids.rule, client_id: ids.client, source: 'meta', form_id: 'form-1' })
    expect(state.destinations).toHaveLength(1)
    expect(JSON.stringify(result)).not.toContain('secret-value')
    expect(query.mock.calls.every(([sql]) => !sql.includes('INSERT INTO lead_deliveries'))).toBe(true)
    expect(state.finish).toHaveBeenCalled()
  })

  it('denies self review and revalidates requester, reviewer and unchanged configuration', async () => {
    const proposal = await run('marketing_propose_lead_routing_change', routingInput())
    const data = (proposal as any).data
    expect((await run('marketing_review_lead_routing_change', {
      clientId: ids.client,
      proposalId: data.proposalId,
      expectedRevision: data.revision,
      decision: 'approved'
    })).ok).toBe(false)
    state.revokedUsers = [ids.proposer]
    expect((await run('marketing_review_lead_routing_change', {
      clientId: ids.client,
      proposalId: data.proposalId,
      expectedRevision: data.revision,
      decision: 'approved'
    }, reviewer)).ok).toBe(false)
    state.revokedUsers = []
    await run('marketing_review_lead_routing_change', {
      clientId: ids.client,
      proposalId: data.proposalId,
      expectedRevision: data.revision,
      decision: 'approved'
    }, reviewer)
    state.revokedUsers = [ids.reviewer]
    expect((await run('marketing_execute_lead_routing_change', {
      clientId: ids.client,
      proposalId: data.proposalId,
      expectedRevision: data.revision,
      ack: true
    })).ok).toBe(false)
    expect(state.rule).toBeNull()
  })

  it('rejects unknown destinations, cross-client rules and mismatched request replay before mutation', async () => {
    const unknown = routingInput()
    unknown.destinations[0]!.destinationType = 'not_a_destination'
    expect((await run('marketing_propose_lead_routing_change', unknown)).ok).toBe(false)
    expect(state.pending).toHaveLength(0)

    state.rule = { id: ids.rule, client_id: ids.otherClient, source: 'meta', form_id: 'form-1', enabled: true }
    expect((await run('marketing_propose_lead_routing_change', routingInput())).ok).toBe(false)
    expect(state.pending).toHaveLength(0)

    state.rule = null
    const first = await run('marketing_propose_lead_routing_change', routingInput())
    expect(first.ok).toBe(true)
    const changed = routingInput()
    changed.formName = 'Changed request'
    expect(await run('marketing_propose_lead_routing_change', changed)).toMatchObject({ ok: false, code: 'idempotency_conflict' })
    expect(state.pending).toHaveLength(1)
  })

  it('replays an executed routing result without another rule write', async () => {
    const data = await prepareReviewExecute()
    const args = {
      clientId: ids.client,
      proposalId: data.proposalId,
      expectedRevision: data.revision,
      ack: true
    }
    expect((await run('marketing_execute_lead_routing_change', args)).ok).toBe(true)
    const destinationWrites = query.mock.calls.filter(([sql]) => sql.includes('lead_rule_destinations')).length
    const replay = await run('marketing_execute_lead_routing_change', args)
    expect(replay).toMatchObject({ ok: true, data: { replayed: true, leadsReplayed: 0 } })
    expect(query.mock.calls.filter(([sql]) => sql.includes('lead_rule_destinations')).length).toBe(destinationWrites)
    expect(state.destinations).toHaveLength(1)
  })

  it('rejects a rejected proposal and configuration that drifts after approval', async () => {
    const proposal = await run('marketing_propose_lead_routing_change', routingInput())
    const data = (proposal as any).data
    await run('marketing_review_lead_routing_change', {
      clientId: ids.client,
      proposalId: data.proposalId,
      expectedRevision: data.revision,
      decision: 'rejected'
    }, reviewer)
    expect(await run('marketing_execute_lead_routing_change', {
      clientId: ids.client,
      proposalId: data.proposalId,
      expectedRevision: data.revision,
      ack: true
    })).toMatchObject({ ok: false, code: 'approval_required' })

    state.pending = []
    const approved = await prepareReviewExecute()
    state.rule = { id: ids.rule, client_id: ids.client, source: 'meta', form_id: 'form-1', form_name: 'Externally changed', enabled: false }
    expect(await run('marketing_execute_lead_routing_change', {
      clientId: ids.client,
      proposalId: approved.proposalId,
      expectedRevision: approved.revision,
      ack: true
    })).toMatchObject({ ok: false, code: 'conflict' })
    expect(state.destinations).toHaveLength(0)
  })

  it('rejects a nonexistent supplied rule and returns only hashes for destination secrets in lists', async () => {
    expect(await run('marketing_propose_lead_routing_change', {
      ...routingInput(),
      ruleId: ids.destination
    })).toMatchObject({ ok: false, code: 'not_found' })
    expect(state.pending).toHaveLength(0)

    state.rule = { id: ids.rule, client_id: ids.client, source: 'meta', form_id: 'form-1', form_name: 'Website leads', enabled: true }
    state.destinations = [{
      id: ids.destination,
      rule_id: ids.rule,
      destination_type: 'slack',
      config: { webhook_url: 'https://hooks.slack.com/services/secret-value' },
      filter: null,
      delay_minutes: 0,
      enabled: true,
      sort_order: 0
    }]
    const listed = await run('marketing_list_lead_routing_rules', { clientId: ids.client })
    expect(listed).toMatchObject({ ok: true, data: {
      items: [{ rule: { ruleId: ids.rule }, destinations: [{ destinationId: ids.destination }] }],
      storedOnly: true
    } })
    expect(JSON.stringify(listed)).not.toContain('secret-value')
    expect(JSON.stringify(listed)).toContain('configHash')
  })
})
