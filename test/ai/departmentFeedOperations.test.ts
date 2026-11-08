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
  failBinding: false,
  providerFeedId: '',
  creates: 0,
  generates: 0,
  updates: 0,
  reads: 0,
  lastPatch: {} as any,
  lastPreview: {} as any,
  lastCreate: {} as any,
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
    if (sql.includes('UPDATE client_feed_links')) {
      if (state.failBinding) return { rows: [] }
      state.link.defaultFeedIds = JSON.parse(p[5])
      return { rows: [{ client_id: p[0] }] }
    }
    if (sql.includes('SET result_ref=$3')) {
      const row = state.rows.find(r => r.id === p[0])
      if (row) row.result_ref = p[2]
      return { rows: [] }
    }
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
        { id: state.detail.id, name: 'Stock', platform: 'facebook', isActive: true }
      ]
    },
    getFeed: async () => structuredClone(state.detail),
    previewInventory: async (_ctx: any, _link: any, spec: any) => {
      state.lastPreview = spec
      return ({
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
      })
    },
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
    createFeed: async (_ctx: any, _link: any, spec: any) => {
      state.lastCreate = spec
      if (spec.source) state.detail.id = 'feed-new'
      Object.assign(state.detail, spec)
      state.creates++
      if (state.failWrite) throw new Error('https://secret.test?token=secret')
      return {
        providerId: 'social-dashboard',
        feedId: state.providerFeedId || state.detail.id,
        platform: 'facebook'
      }
    },
    updateFeed: async (_ctx: any, _ref: any, patch: any) => {
      state.updates++
      state.lastPatch = patch
      Object.assign(state.detail, patch)
      if (patch.platform_settings) state.detail.platformSettings = patch.platform_settings
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
    failBinding: false,
    providerFeedId: '',
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
  it('previews candidate mapping repairs, preserves other rules/settings and executes readback once', async () => {
    state.detail.mappings = { rules: [{ target_field: 'title', source_field: 'title' }, { target_field: 'drivetrain', source_field: 'drive', fallback_value: 'OTHER' }] }
    state.detail.platformSettings = { currency: 'AUD' }
    const proposal = await run('marketing_propose_inventory_feed_change', { clientId, feedId: 'feed-1', patch: {
      mappingUpdates: [{ target_field: 'drivetrain', transformations: [{ type: 'valueMap', map: { 'Front Wheel Drive': 'FWD' } }] }, { target_field: 'city', fallback_value: 'Knox' }],
      platformSettings: { fb_page_id: '123456789' }
    } })
    expect(proposal.ok, JSON.stringify(proposal)).toBe(true)
    expect(state.lastPreview.mappings.rules).toEqual([
      { target_field: 'title', source_field: 'title' },
      { target_field: 'drivetrain', source_field: 'drive', fallback_value: 'OTHER', transformations: [{ type: 'valueMap', map: { 'Front Wheel Drive': 'FWD' } }] },
      { target_field: 'city', fallback_value: 'Knox' }
    ])
    await approve(proposal)
    const args = { clientId, proposalId: (proposal as any).data.proposalId, expectedRevision: (proposal as any).data.revision, ack: true }
    expect(await run('marketing_execute_inventory_feed_change', args)).toMatchObject({ ok: true, data: { readbackVerified: true } })
    expect(state.lastPatch.platform_settings).toEqual({ currency: 'AUD', fb_page_id: '123456789' })
    expect(state.lastPatch.mappings).toEqual(state.lastPreview.mappings)
    expect((await run('marketing_execute_inventory_feed_change', args)).ok).toBe(true)
    expect(state.updates).toBe(1)
  })
  it('clones only an explicitly bound source template without persisting credentials and rejects stale source', async () => {
    state.detail.source = { type: 'adtorque', url: 'https://feed.test?token=private-source-token' }
    const proposal = await run('marketing_propose_inventory_feed_setup', { clientId, name: 'Stock', platform: 'facebook', sourceFeedId: 'feed-1' })
    expect(proposal.ok, JSON.stringify(proposal)).toBe(true)
    expect(state.lastPreview.source).toEqual(state.detail.source)
    expect(JSON.stringify(state.rows)).not.toContain('private-source-token')
    await approve(proposal)
    state.detail.source.url += '-changed'
    expect(await run('marketing_execute_inventory_feed_change', { clientId, proposalId: (proposal as any).data.proposalId, expectedRevision: (proposal as any).data.revision, ack: true })).toMatchObject({ ok: false, code: 'revision_conflict' })
    expect(state.creates).toBe(0)
  })
  it('executes a trusted supplier clone with private source and persists safe provider readback', async () => {
    state.detail.source = { type: 'adtorque', url: 'https://feed.test?token=private-source-token' }
    const proposal = await run('marketing_propose_inventory_feed_setup', { clientId, name: 'Stock', platform: 'facebook', sourceFeedId: 'feed-1' })
    await approve(proposal)
    const args = { clientId, proposalId: (proposal as any).data.proposalId, expectedRevision: (proposal as any).data.revision, ack: true }
    expect(await run('marketing_execute_inventory_feed_change', args)).toMatchObject({ ok: true, data: { readbackVerified: true } })
    expect(state.lastCreate.source).toEqual(state.detail.source)
    expect(state.lastCreate.filters.sellerIds).toEqual(['seller-1'])
    expect(state.link.defaultFeedIds).toEqual(['feed-1', 'feed-new'])
    expect((await run('marketing_preview_inventory_feed', { clientId, feedId: 'feed-new' })).ok).toBe(true)
    expect(JSON.stringify(state.rows)).not.toContain('private-source-token')
  })
  it('holds supplier setup when binding persistence fails and never repeats creation', async () => {
    state.detail.source = { type: 'adtorque', url: 'https://feed.test?token=private-source-token' }
    const proposal = await run('marketing_propose_inventory_feed_setup', { clientId, name: 'Stock', platform: 'facebook', sourceFeedId: 'feed-1' })
    await approve(proposal)
    state.failBinding = true
    const args = { clientId, proposalId: (proposal as any).data.proposalId, expectedRevision: (proposal as any).data.revision, ack: true }
    expect(await run('marketing_execute_inventory_feed_change', args)).toMatchObject({ ok: false, code: 'reconciliation_required' })
    expect(await run('marketing_execute_inventory_feed_change', args)).toMatchObject({ ok: false, code: 'reconciliation_required' })
    expect(state.creates).toBe(1)
    expect(state.link.defaultFeedIds).toEqual(['feed-1'])
    expect(query.mock.calls.some(([sql, p]) => sql.includes('SET result_ref=$3') && p[2] === 'feed-new')).toBe(true)
    expect(await run('marketing_get_inventory_feed_change', { clientId, proposalId: args.proposalId })).toMatchObject({ ok: true, data: { outcome: { reconciliationRequired: true, feedId: 'feed-new' } } })
  })
  it('rejects an unbounded provider-created ID without persisting or exposing it', async () => {
    const proposal = await setup()
    await approve(proposal)
    state.providerFeedId = 'https://private.example/?token=secret'
    const args = { clientId, proposalId: (proposal as any).data.proposalId, expectedRevision: (proposal as any).data.revision, ack: true }
    expect(await run('marketing_execute_inventory_feed_change', args)).toMatchObject({ ok: false, code: 'reconciliation_required' })
    expect(query.mock.calls.some(([sql]) => sql.includes('SET result_ref=$3'))).toBe(false)
    const view = await run('marketing_get_inventory_feed_change', { clientId, proposalId: args.proposalId })
    expect(JSON.stringify(view)).not.toContain('private.example')
    expect(state.creates).toBe(1)
  })
  it('rejects stale mappings, arbitrary settings and foreign website hosts before writes', async () => {
    state.detail.platformSettings = { website_domain: 'dealer.example' }
    for (const platformSettings of [{ website_domain: 'foreign.example' }, { channel_link: 'https://dealer.example/?token=secret' }, { access_token: 'secret' }]) {
      expect((await run('marketing_propose_inventory_feed_change', { clientId, feedId: 'feed-1', patch: { platformSettings } })).ok).toBe(false)
    }
    expect(state.rows).toHaveLength(0)
    const proposal = await run('marketing_propose_inventory_feed_change', { clientId, feedId: 'feed-1', patch: { mappingUpdates: [{ target_field: 'drive', source_field: 'drive', transformations: [{ type: 'valueMap', map: { 'Front Wheel Drive': 'FWD' } }] }], platformSettings: { channel_link: 'https://dealer.example', link_templatePreset: 'imotor' } } })
    expect(proposal.ok).toBe(true)
    expect(state.lastPreview.platformSettings.link_template).toBe('https://{domain}/{condition}-cars/for-sale/{stock_number}')
    await approve(proposal)
    state.detail.mappings = { rules: [{ target_field: 'color', source_field: 'color' }] }
    expect(await run('marketing_execute_inventory_feed_change', { clientId, proposalId: (proposal as any).data.proposalId, expectedRevision: (proposal as any).data.revision, ack: true })).toMatchObject({ ok: false, code: 'revision_conflict' })
    expect(state.updates).toBe(0)
  })
  it('repairs Google store_code and bounded dealer address fallback using candidate preview', async () => {
    state.detail.platform = 'google'
    state.detail.platformSettings = { store_code: 'wrong', currency: 'AUD' }
    const address = { line1: '1 Dealer Road', city: 'Knox', state: 'VIC', postcode: '3152', country: 'AU' }
    const proposal = await run('marketing_propose_inventory_feed_change', { clientId, feedId: 'feed-1', patch: { platformSettings: { store_code: 'Actual_Location-3152', store_address: '1 Dealer Road, Knox VIC 3152' }, mappingUpdates: [{ target_field: 'address', source_field: 'address', fallback_value: address }] } })
    expect(proposal.ok).toBe(true)
    expect(state.lastPreview.platformSettings.store_code).toBe('Actual_Location-3152')
    expect(state.lastPreview.mappings.rules[0].fallback_value).toEqual(address)
    await approve(proposal)
    expect(await run('marketing_execute_inventory_feed_change', { clientId, proposalId: (proposal as any).data.proposalId, expectedRevision: (proposal as any).data.revision, ack: true })).toMatchObject({ ok: true, data: { readbackVerified: true } })
    expect(state.detail.platformSettings).toEqual({ currency: 'AUD', store_code: 'Actual_Location-3152', store_address: '1 Dealer Road, Knox VIC 3152' })
  })
  it('requires explicit client source binding and rejects duplicate targets or unsupported transforms', async () => {
    state.link.defaultFeedIds = []
    expect((await run('marketing_propose_inventory_feed_setup', { clientId, name: 'Stock', platform: 'facebook', sourceFeedId: 'feed-1' })).ok).toBe(false)
    for (const mappingUpdates of [
      [{ target_field: 'drive', fallback_value: 'FWD' }, { target_field: 'drive', fallback_value: 'RWD' }],
      [{ target_field: 'drive', transformations: [{ type: 'eval', code: 'secret' }] }]
    ]) expect((await run('marketing_propose_inventory_feed_change', { clientId, feedId: 'feed-1', patch: { mappingUpdates } })).ok).toBe(false)
    expect(state.rows).toHaveLength(0)
  })
  it('runtime validates direct service inputs before provider calls', async () => {
    const { runDepartmentFeedOperation } = await import('~~/server/utils/ai/marketing/departmentFeedOperations')
    expect(await runDepartmentFeedOperation('marketing_propose_inventory_feed_change', { clientId, feedId: 'feed-1', patch: { source: { url: 'https://bad.test' } } }, ctx, key, digest)).toMatchObject({ ok: false, code: 'bad_args' })
    expect(state.reads).toBe(0)
  })
  it('exports unique prefixed tools and fails closed for direct write handlers', async () => {
    expect(new Set(departmentFeedTools.map(t => t.name)).size).toBe(8)
    for (const tool of departmentFeedTools) {
      expect(tool.name).toMatch(/^marketing_/)
      expect(typeof tool.mutates).toBe('boolean')
      expect(typeof tool.description).toBe('string')
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
  it('rejects unbound alternate source selectors before storing a proposal or leaking source configuration', async () => {
    state.detail.source = { type: 'adtorque', url: 'https://feed.test?token=private-source-token' }
    state.link.defaultFeedIds = []
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
