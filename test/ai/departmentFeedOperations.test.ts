/* eslint-disable @typescript-eslint/no-explicit-any -- Boundary fixtures model heterogeneous database and provider records. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import {
  departmentFeedTools,
  executeDepartmentFeedTool
} from '~~/server/utils/ai/mcp/departmentFeedTools'

const state = vi.hoisted(() => ({
  rows: [] as any[],
  active: true,
  revoked: false,
  revokedUsers: [] as string[],
  readOnly: false,
  enabled: true,
  providerReady: true,
  failWrite: false,
  creates: 0,
  generates: 0,
  updates: 0,
  reads: 0,
  lastPatch: {} as any,
  detail: {} as any,
  link: {} as any
}))
const authority = vi.hoisted(() =>
  vi.fn(async (ctx: any, write = false) => {
    if (
      state.revoked
      || state.revokedUsers.includes(ctx.userId)
      || (write && (state.readOnly || !ctx.mcpScopes.includes('mcp:write')))
    )
      throw new Error('denied')
    return ctx
  })
)
vi.mock('~~/server/utils/ai/marketing/departmentAuthority', () => ({
  requireMarketingDepartment: authority
}))
vi.mock('~~/server/utils/ai/mcp/staffAuthority', () => ({
  resolveMcpStaffContext: vi.fn(async (_event: unknown, userId: string) => ({
    ...ctx,
    userId,
    mcpStaffAuthority: 'fresh' as const,
    permissionGroups: state.revokedUsers.includes(userId) ? [] : ['MARKETING_MANAGEMENT'],
    marketingCapabilities: state.revokedUsers.includes(userId) ? [] : ['department_management'],
    assistantReadOnly: state.readOnly
  }))
}))
vi.mock('~~/server/utils/ai/mcp/runtimeConfig', () => ({
  resolveMcpRuntimeConfig: () => ({
    serverEnabled: true,
    suiteFlags: { feeds: state.enabled, writes: true }
  })
}))
const query = vi.hoisted(() =>
  vi.fn(async (sql: string, p: any[] = []) => {
    if (sql.includes('agency_clients'))
      return { rows: state.active ? [{ id: p[0] }] : [] }
    if (sql.includes('pg_advisory')) return { rows: [] }
    if (sql.includes('INSERT INTO ai_pending_actions')) {
      const row = {
        id: '55555555-5555-4555-8555-555555555555',
        user_id: p[0],
        tool_name: p[1],
        resolved_payload: JSON.parse(p[2]),
        status: 'proposed',
        expires_at: '2099-01-01',
        confirmed_by: null,
        result_payload: null
      }
      state.rows.push(row)
      return { rows: [row] }
    }
    if (sql.includes('UPDATE ai_pending_actions') && sql.includes('confirmed_by=$4')) {
      const row = state.rows.find(r => r.id === p[0] && r.user_id === p[1] && r.status === 'proposed')
      if (!row) return { rows: [] }
      row.status = p[2]
      row.confirmed_by = p[3]
      row.resolved_payload = JSON.parse(p[4])
      return { rows: [row] }
    }
    if (
      sql.includes('UPDATE ai_pending_actions')
      && sql.includes('status = \'executed\'')
    ) {
      const row = state.rows.find(
        r => r.id === p[0] && r.user_id === p[1] && r.status === 'approved'
      )
      if (!row) return { rows: [] }
      row.status = 'executed'
      return { rows: [row] }
    }
    if (
      sql.includes('UPDATE ai_pending_actions')
      && sql.includes('result_payload')
    ) {
      const row = state.rows.find(r => r.id === p[0])
      if (row) row.result_payload = JSON.parse(p[2])
      return { rows: [] }
    }
    if (sql.includes('FROM ai_pending_actions')) {
      return {
        rows: state.rows.filter(r => p[1] === 'department_inventory_feed_change'
          ? r.id === p[0]
          : r.user_id === p[1] && (r.id === p[0] || r.resolved_payload.requestKey === p[0]))
      }
    }
    return { rows: [] }
  })
)
vi.mock('~~/server/utils/db', () => ({
  queryOne: async (sql: string, p: any[]) =>
    (await query(sql, p)).rows[0] ?? null,
  queryOneFresh: async (sql: string, p: any[]) =>
    (await query(sql, p)).rows[0] ?? null,
  queryRows: async (sql: string, p: any[]) => (await query(sql, p)).rows,
  queryRowsFresh: async (sql: string, p: any[]) => (await query(sql, p)).rows,
  transaction: async (fn: any) => fn({ query }),
  transactionWithoutRetry: async (fn: any) => fn({ query }),
  execute: vi.fn()
}))
vi.mock('~~/server/utils/feeds/dealerLinks', () => ({
  getDealerLink: async () => state.link,
  linkToContext: (link: any) => ({
    externalOrgId: link.externalOrgId,
    actingUserEmail: 'staff@example.test'
  })
}))
vi.mock('~~/server/utils/feeds/config', () => ({
  isDealerFeedsEnabled: () => state.enabled,
  getSocialDashboardClient: async () => (state.providerReady ? {} : null)
}))
vi.mock('~~/server/utils/feeds/registry', () => ({
  getFeedProvider: () => ({
    listFeeds: async () => {
      state.reads++
      return [
        { id: 'feed-1', name: 'Stock', platform: 'facebook', isActive: true }
      ]
    },
    getFeed: async () => structuredClone(state.detail),
    previewInventory: async () => ({
      total: 2,
      items: [
        {
          id: 'v1',
          make: 'Ford',
          url: 'https://secret.test?token=secret',
          image: 'secret'
        }
      ],
      validation: {
        matchedTotal: 3,
        validatedTotal: 2,
        invalidTotal: 1,
        invalidSummaries: []
      }
    }),
    previewFeed: async () => ({
      total: 2,
      items: [],
      validation: {
        matchedTotal: 3,
        validatedTotal: 2,
        invalidTotal: 1,
        invalidSummaries: []
      }
    }),
    createFeed: async () => {
      state.creates++
      if (state.failWrite) throw new Error('https://secret.test?token=secret')
      return {
        providerId: 'social-dashboard',
        feedId: 'feed-1',
        platform: 'facebook'
      }
    },
    updateFeed: async (_ctx: any, _ref: any, patch: any) => {
      state.updates++
      state.lastPatch = patch
      Object.assign(state.detail, patch)
      if ('is_active' in patch) state.detail.isActive = patch.is_active
    },
    generateFeed: async () => {
      state.generates++
      if (state.failWrite) throw new Error('provider secret')
      return { url: 'https://secret.test?token=secret', itemCount: 2 }
    }
  })
}))
const clientId = '11111111-1111-4111-8111-111111111111'
const ctx = {
  userId: '22222222-2222-4222-8222-222222222222',
  userRole: 'member',
  source: 'mcp',
  event: { context: {} },
  mcpScopes: ['mcp:read', 'mcp:write'],
  assistantScope: { clientAccessMode: 'all_active', assignedClientIds: [] }
} as unknown as ToolContext
const key = `mcp:${'a'.repeat(64)}`
const digest = 'b'.repeat(64)
const run = (name: string, args: any, context = ctx, requestKey = key) =>
  executeDepartmentFeedTool(name, args, context, requestKey, digest)
const setup = () =>
  run('marketing_propose_inventory_feed_setup', {
    clientId,
    name: 'Stock',
    platform: 'facebook',
    filters: {}
  })
const reviewer = { ...ctx, userId: '33333333-3333-4333-8333-333333333333' } as ToolContext
const approve = async (proposal: any) => {
  const data = proposal.data
  const result = await run('marketing_review_inventory_feed_change', {
    clientId,
    proposalId: data.proposalId,
    expectedRevision: data.revision,
    decision: 'approved'
  }, reviewer)
  expect(result, JSON.stringify(result)).toMatchObject({ ok: true })
}
beforeEach(() => {
  Object.assign(state, {
    rows: [],
    active: true,
    revoked: false,
    revokedUsers: [],
    readOnly: false,
    enabled: true,
    providerReady: true,
    failWrite: false,
    creates: 0,
    generates: 0,
    updates: 0,
    reads: 0,
    link: {
      clientId,
      providerId: 'social-dashboard',
      externalOrgId: 'org-1',
      sellerRefs: ['seller-1'],
      defaultFeedIds: ['feed-1']
    },
    detail: {
      id: 'feed-1',
      name: 'Stock',
      platform: 'facebook',
      isActive: true,
      filters: { onlyActive: true, sellerIds: ['seller-1'] },
      mappings: {},
      platformSettings: {},
      source: null
    }
  })
  vi.clearAllMocks()
})
describe('department inventory boundary', () => {
  it('exports unique prefixed tools and fails closed for direct write handlers', async () => {
    expect(new Set(departmentFeedTools.map(t => t.name)).size).toBe(8)
    for (const tool of departmentFeedTools) {
      expect(tool.name).toMatch(/^marketing_/)
      if (tool.mutates) expect((await tool.handler({}, ctx)).ok).toBe(false)
    }
  })
  it('checks fresh authority and inactive client before provider I/O', async () => {
    state.revoked = true
    expect(
      (await run('marketing_get_inventory_feed_health', { clientId })).ok
    ).toBe(false)
    state.revoked = false
    state.active = false
    expect((await setup()).ok).toBe(false)
    expect(state.reads).toBe(0)
    expect(state.rows).toHaveLength(0)
  })
  it('denies narrowed cross-client context, missing write scope and provider readiness', async () => {
    expect(
      (
        await run(
          'marketing_get_inventory_feed_health',
          { clientId },
          { ...ctx, clientScope: 'other' }
        )
      ).ok
    ).toBe(false)
    expect(
      (
        await run(
          'marketing_propose_inventory_feed_setup',
          { clientId, name: 'Stock', platform: 'facebook' },
          { ...ctx, mcpScopes: ['mcp:read'] }
        )
      ).ok
    ).toBe(false)
    state.providerReady = false
    expect((await setup()).ok).toBe(false)
    expect(state.rows).toHaveLength(0)
  })
  it('bounds preview and removes vehicle URLs and provider payloads', async () => {
    const out = await run('marketing_preview_inventory_feed', {
      clientId,
      feedId: 'feed-1'
    })
    expect(out.ok).toBe(true)
    expect(JSON.stringify(out)).not.toContain('secret')
    expect(
      (
        await run('marketing_preview_inventory_feed', {
          clientId,
          feedId: 'foreign'
        })
      ).ok
    ).toBe(false)
    state.detail.filters.sellerIds = ['other']
    expect(
      (
        await run('marketing_preview_inventory_feed', {
          clientId,
          feedId: 'feed-1'
        })
      ).ok
    ).toBe(false)
  })
  it('persists an exact setup preview once and rejects key reuse with changed intent', async () => {
    const first = await setup()
    expect(first.ok).toBe(true)
    expect(state.creates).toBe(0)
    expect(await setup()).toEqual(first)
    expect(state.rows).toHaveLength(1)
    expect(
      (
        await run('marketing_propose_inventory_feed_setup', {
          clientId,
          name: 'Changed',
          platform: 'facebook'
        })
      ).ok
    ).toBe(false)
    expect(JSON.stringify(first)).not.toContain('secret')
  })
  it('requires exact acknowledgement, checks stale snapshots, executes only once', async () => {
    const proposal = await setup()
    const data = (proposal as any).data
    await approve(proposal)
    const args = {
      clientId,
      proposalId: data.proposalId,
      expectedRevision: data.revision,
      ack: true
    }
    expect(
      (
        await run('marketing_execute_inventory_feed_change', {
          ...args,
          ack: false
        })
      ).ok
    ).toBe(false)
    expect(
      (
        await run('marketing_execute_inventory_feed_change', {
          ...args,
          expectedRevision: 'c'.repeat(64)
        })
      ).ok
    ).toBe(false)
    const executed = await run('marketing_execute_inventory_feed_change', args)
    expect(executed.ok).toBe(true)
    expect(await run('marketing_execute_inventory_feed_change', args)).toEqual(
      executed
    )
    expect(state.creates).toBe(1)
  })
  it('refuses stale feed changes and dealer mapping changes without provider mutation', async () => {
    const proposal = await run('marketing_propose_inventory_feed_change', {
      clientId,
      feedId: 'feed-1',
      patch: { name: 'New' }
    })
    const data = (proposal as any).data
    await approve(proposal)
    state.detail.name = 'Someone else changed this'
    expect(
      (
        await run('marketing_execute_inventory_feed_change', {
          clientId,
          proposalId: data.proposalId,
          expectedRevision: data.revision,
          ack: true
        })
      ).ok
    ).toBe(false)
    expect(state.updates).toBe(0)
  })
  it('rejects alternate source selectors before storing a proposal or leaking source configuration', async () => {
    state.detail.source = { type: 'url', url: 'https://feed.test?token=private-source-token' }
    const proposal = await run('marketing_propose_inventory_feed_change', { clientId, feedId: 'feed-1', patch: { name: 'New' } })
    expect(proposal.ok).toBe(false)
    expect(state.rows).toHaveLength(0)
    expect(JSON.stringify(proposal)).not.toContain('private-source-token')
  })
  it('sends the provider active-state field and verifies readback', async () => {
    const proposal = await run('marketing_propose_inventory_feed_change', {
      clientId,
      feedId: 'feed-1',
      patch: { isActive: false }
    })
    const data = (proposal as any).data
    await approve(proposal)
    expect(
      (
        await run('marketing_execute_inventory_feed_change', {
          clientId,
          proposalId: data.proposalId,
          expectedRevision: data.revision,
          ack: true
        })
      ).ok
    ).toBe(true)
    expect(state.lastPatch).toEqual({ is_active: false })
  })
  it('rechecks revocation before execution, and binds dealer mapping plus expiry', async () => {
    const proposal = await setup()
    const data = (proposal as any).data
    await approve(proposal)
    const args = {
      clientId,
      proposalId: data.proposalId,
      expectedRevision: data.revision,
      ack: true
    }
    state.revoked = true
    expect(
      (await run('marketing_execute_inventory_feed_change', args)).ok
    ).toBe(false)
    state.revoked = false
    state.link.sellerRefs = ['changed']
    expect(
      (await run('marketing_execute_inventory_feed_change', args)).ok
    ).toBe(false)
    state.link.sellerRefs = ['seller-1']
    state.rows[0].expires_at = '2000-01-01'
    expect(
      (await run('marketing_execute_inventory_feed_change', args)).ok
    ).toBe(false)
    expect(state.creates).toBe(0)
  })
  it('requires trusted request identity, disables writes and reports health without delivery claims', async () => {
    expect(
      (
        await executeDepartmentFeedTool(
          'marketing_propose_inventory_feed_setup',
          { clientId, name: 'Stock', platform: 'facebook' },
          ctx
        )
      ).ok
    ).toBe(false)
    state.enabled = false
    expect((await setup()).ok).toBe(false)
    state.enabled = true
    const health = await run('marketing_get_inventory_feed_health', {
      clientId
    })
    expect(health).toMatchObject({
      ok: true,
      data: { providerDeliveryVerified: false, dataStatus: 'available' }
    })
    expect(JSON.stringify(health)).not.toContain('secret')
  })
  it('holds unknown provider outcomes without retry and never leaks error secrets', async () => {
    const proposal = await setup()
    const data = (proposal as any).data
    await approve(proposal)
    state.failWrite = true
    const args = {
      clientId,
      proposalId: data.proposalId,
      expectedRevision: data.revision,
      ack: true
    }
    const result = await run('marketing_execute_inventory_feed_change', args)
    expect(result).toMatchObject({ ok: false, code: 'reconciliation_required' })
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(
      (await run('marketing_execute_inventory_feed_change', args)).ok
    ).toBe(false)
    expect(state.creates).toBe(1)
  })
  it('does not expose arbitrary proposals, credentials, supplier configuration or broad confirm', async () => {
    expect((await run('confirm_action', {})).ok).toBe(false)
    expect(
      (
        await run('marketing_propose_inventory_feed_setup', {
          clientId,
          name: 'Stock',
          platform: 'facebook',
          source: { url: 'https://secret.test' }
        })
      ).ok
    ).toBe(false)
    await setup()
    state.rows[0].tool_name = 'send_email'
    expect(
      (
        await run('marketing_get_inventory_feed_change', {
          clientId,
          proposalId: state.rows[0].id
        })
      ).ok
    ).toBe(false)
  })
  it('forbids self review and execution before independent approval', async () => {
    const proposal = await setup()
    const data = (proposal as any).data
    const reviewed = await run('marketing_review_inventory_feed_change', {
      clientId,
      proposalId: data.proposalId,
      expectedRevision: data.revision,
      decision: 'approved'
    })
    expect(reviewed.ok).toBe(false)
    expect((await run('marketing_execute_inventory_feed_change', {
      clientId,
      proposalId: data.proposalId,
      expectedRevision: data.revision,
      ack: true
    })).ok).toBe(false)
    expect(state.creates).toBe(0)
  })
  it('revalidates exact revision, proposer and active client at review and reviewer and client at execution', async () => {
    const proposal = await setup()
    const data = (proposal as any).data
    state.revokedUsers = [ctx.userId]
    expect((await run('marketing_review_inventory_feed_change', {
      clientId,
      proposalId: data.proposalId,
      expectedRevision: data.revision,
      decision: 'approved'
    }, reviewer)).ok).toBe(false)
    state.revokedUsers = []
    state.active = false
    expect((await run('marketing_review_inventory_feed_change', {
      clientId,
      proposalId: data.proposalId,
      expectedRevision: data.revision,
      decision: 'approved'
    }, reviewer)).ok).toBe(false)
    state.active = true
    expect((await run('marketing_review_inventory_feed_change', {
      clientId,
      proposalId: data.proposalId,
      expectedRevision: 'c'.repeat(64),
      decision: 'approved'
    }, reviewer)).ok).toBe(false)
    await approve(proposal)
    state.active = false
    expect((await run('marketing_execute_inventory_feed_change', {
      clientId,
      proposalId: data.proposalId,
      expectedRevision: data.revision,
      ack: true
    })).ok).toBe(false)
    state.active = true
    state.revokedUsers = [reviewer.userId]
    expect((await run('marketing_execute_inventory_feed_change', {
      clientId,
      proposalId: data.proposalId,
      expectedRevision: data.revision,
      ack: true
    })).ok).toBe(false)
    expect(state.creates).toBe(0)
  })
  it('regenerates only an exact independently reviewed feed revision without exposing the URL', async () => {
    const proposal = await run('marketing_propose_inventory_feed_regeneration', {
      clientId,
      feedId: 'feed-1',
      format: 'xml'
    })
    expect(proposal).toMatchObject({ ok: true, data: { operation: 'regenerate' } })
    expect(state.generates).toBe(0)
    await approve(proposal)
    const data = (proposal as any).data
    const args = {
      clientId,
      proposalId: data.proposalId,
      expectedRevision: data.revision,
      ack: true
    }
    const executed = await run('marketing_execute_inventory_feed_change', args)
    expect(executed).toMatchObject({ ok: true, data: {
      generation: { format: 'xml', itemCount: 2 },
      providerDeliveryVerified: false
    } })
    expect(JSON.stringify(executed)).not.toContain('secret')
    expect(await run('marketing_execute_inventory_feed_change', args)).toEqual(executed)
    expect(state.generates).toBe(1)
  })
  it('holds an unknown regeneration outcome without replaying the provider call', async () => {
    const proposal = await run('marketing_propose_inventory_feed_regeneration', {
      clientId,
      feedId: 'feed-1',
      format: 'csv'
    })
    await approve(proposal)
    const data = (proposal as any).data
    state.failWrite = true
    const args = {
      clientId,
      proposalId: data.proposalId,
      expectedRevision: data.revision,
      ack: true
    }
    expect(await run('marketing_execute_inventory_feed_change', args)).toMatchObject({
      ok: false,
      code: 'reconciliation_required'
    })
    expect((await run('marketing_execute_inventory_feed_change', args)).ok).toBe(false)
    expect(state.generates).toBe(1)
  })
})
