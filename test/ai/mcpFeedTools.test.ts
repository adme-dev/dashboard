import { describe, it, expect, vi } from 'vitest'

import {
  feedReadTools,
  feedProposeTools,
  projectFeedTools,
  executeFeedReadTool,
  executeFeedPropose,
  dispatchFeedConfirm,
  shapeByCondition,
  shapeExcluded,
  shapeAdProductSetBinding,
  meetsMinimum,
  summarizeProductSetFilter,
  evaluateProductSetFilter,
  META_PRODUCT_SET_MINIMUM_ITEMS,
  MCP_FEED_ALWAYS_CONFIRM,
  FEED_CONFIRM_ACTIONS,
  type FeedProposeDeps
} from '~~/server/utils/ai/mcp/feedTools'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

// Deterministic RBAC: only 'admin' holds any permission (so only admin has MEDIA_BUYING).
vi.mock('~~/server/utils/permissions', () => ({
  roleHasPermission: (role: string) => role === 'admin'
}))

const ctx = (role: string, userId = 'u1'): ToolContext => ({ userId, userRole: role, event: {} as never, source: 'mcp' })

const CLIENT = '11111111-1111-4111-8111-111111111111'
const CONNECTION = '22222222-2222-4222-8222-222222222222'
const SOURCE_FEED = '33333333-3333-4333-8333-333333333333'

const attachArgs = { clientId: CLIENT, connectionId: CONNECTION, catalogId: '123456789', sourceFeedId: SOURCE_FEED }
const rulesArgs = { clientId: CLIENT, connectionId: CONNECTION, productSetId: 'ps-1', filter: { vehicle_condition: { eq: 'demo' } } }

const attachPreview = {
  catalogId: '123456789',
  catalogName: 'Vehicles',
  sourceFeedId: SOURCE_FEED,
  sourceFeedName: 'PDS Facebook',
  proposedScheduleUrl: 'https://x/api/feeds/f/serve',
  currentScheduleUrl: null,
  proposedSchedule: { interval: 'HOURLY' as const, hour: 0, timezone: 'Australia/Melbourne' },
  feedDisposition: 'created' as const,
  existingProductFeedId: null,
  itemCount: 22
}

function deps(overrides: Partial<FeedProposeDeps> = {}): FeedProposeDeps {
  return {
    suiteEnabled: true,
    resolveAttachPreview: vi.fn(async () => attachPreview),
    resolveSetRulesPreview: vi.fn(async () => ({
      productSetId: 'ps-1',
      productSetName: 'New',
      currentFilterSummary: 'condition eq "new"',
      currentItemCount: 1,
      proposedFilter: rulesArgs.filter,
      proposedFilterSummary: 'vehicle_condition eq "demo"',
      proposedItemCount: 21
    })),
    refresh: vi.fn(async args => ({
      productFeedId: args.productFeedId,
      serveUrl: 'https://x/api/feeds/f/serve',
      uploadId: args.dryRun ? null : 'up-1',
      itemCount: args.dryRun ? null : 22,
      ...(args.dryRun ? { dryRun: true as const } : {})
    })),
    persist: vi.fn(async () => 'prop-1'),
    ...overrides
  }
}

describe('feed suite descriptors + projection', () => {
  it('exposes exactly the specified tool names', () => {
    expect(feedReadTools.map(t => t.name)).toEqual(['get_inventory_feed_health', 'list_product_sets', 'get_ad_product_set_bindings'])
    expect(feedProposeTools.map(t => t.name)).toEqual([
      'propose_attach_catalog_feed', 'propose_refresh_catalog_feed', 'propose_set_product_set_rules'
    ])
    expect([...MCP_FEED_ALWAYS_CONFIRM]).toEqual(['propose_attach_catalog_feed', 'propose_set_product_set_rules'])
    expect([...FEED_CONFIRM_ACTIONS]).toEqual(['feed_attach_catalog', 'feed_set_product_set_rules'])
  })

  it('projects nothing when the suite flag is off or the role lacks MEDIA_BUYING', () => {
    expect(projectFeedTools('admin', false)).toEqual([])
    expect(projectFeedTools('viewer', true)).toEqual([])
  })

  it('projects the 5 feed tools plus confirm_action when enabled', () => {
    const names = projectFeedTools('admin', true).map(t => t.name)
    expect(names).toEqual([
      'get_inventory_feed_health', 'list_product_sets', 'get_ad_product_set_bindings',
      'propose_attach_catalog_feed', 'propose_refresh_catalog_feed', 'propose_set_product_set_rules',
      'confirm_action'
    ])
  })

  it('every propose tool in this round accepts dryRun (P-1)', () => {
    for (const tool of feedProposeTools) {
      const schema = tool.parameters.safeParse
        ? tool.parameters
        : null
      expect(schema).toBeTruthy()
      expect('dryRun' in (tool.parameters as any).shape).toBe(true)
    }
  })
})

describe('shaping helpers', () => {
  it('buckets served items by condition with new/demo/used always present', () => {
    const items = [
      { condition: 'NEW' },
      ...Array.from({ length: 21 }, () => ({ condition: 'demo' })),
      { condition: null }
    ]
    expect(shapeByCondition(items)).toEqual({ new: 1, demo: 21, used: 0, unknown: 1 })
  })

  it('applies the Meta minimum of 2 items', () => {
    expect(META_PRODUCT_SET_MINIMUM_ITEMS).toBe(2)
    expect(meetsMinimum(1)).toBe(false)
    expect(meetsMinimum(2)).toBe(true)
    expect(meetsMinimum(null)).toBe(false)
  })

  it('shapes the excluded breakdown from readiness issue groups, with honest nulls when absent', () => {
    expect(shapeExcluded({
      invalidTotal: 12,
      issueGroups: [
        { key: 'url', count: 11 },
        { key: 'price', count: 0 },
        { key: 'condition', count: 1 }
      ]
    })).toEqual({ invalidListingUrl: 11, missingPrice: 0, missingImage: 0, other: 1, totalExcluded: 12 })
    expect(shapeExcluded(null)).toEqual({ invalidListingUrl: null, missingPrice: null, missingImage: null, other: null, totalExcluded: null })
    expect(shapeExcluded({})).toEqual({ invalidListingUrl: null, missingPrice: null, missingImage: null, other: null, totalExcluded: null })
  })

  it('shapes ad product-set bindings — creative wins over adset, no set means bindingIntact false', () => {
    expect(shapeAdProductSetBinding({ id: 'a1', name: 'Base', effective_status: 'ACTIVE', creativeProductSetId: 'ps-1', adsetProductSetId: 'ps-2' }))
      .toEqual({ adId: 'a1', adName: 'Base', effectiveStatus: 'ACTIVE', productSetId: 'ps-1', bindingIntact: true })
    expect(shapeAdProductSetBinding({ id: 'a2', name: 'Rmk', effective_status: 'ACTIVE', creativeProductSetId: null, adsetProductSetId: 'ps-2' }))
      .toMatchObject({ productSetId: 'ps-2', bindingIntact: true })
    expect(shapeAdProductSetBinding({ id: 'a3', name: 'Detached', effective_status: 'ACTIVE', creativeProductSetId: null, adsetProductSetId: null }))
      .toMatchObject({ productSetId: null, bindingIntact: false })
  })

  it('summarizes a JSON filter string', () => {
    expect(summarizeProductSetFilter('{"vehicle_condition":{"eq":"new"}}')).toBe('vehicle_condition eq "new"')
    expect(summarizeProductSetFilter(null)).toBe('no filter (all items)')
  })
})

describe('evaluateProductSetFilter (the F-5 dry-run counter)', () => {
  const items = [
    { condition: 'new', make: 'Suzuki', price: 30000, year: 2026 },
    ...Array.from({ length: 21 }, (_, index) => ({ condition: 'demo', make: 'Suzuki', price: 25000 + index, year: 2025 })),
    { condition: 'used', make: 'Toyota', price: 15000, year: 2020 }
  ]

  it('counts eq / is_any / numeric operators', () => {
    expect(evaluateProductSetFilter({ vehicle_condition: { eq: 'new' } }, items)).toBe(1)
    expect(evaluateProductSetFilter({ vehicle_condition: { is_any: ['new', 'demo'] } }, items)).toBe(22)
    expect(evaluateProductSetFilter({ price: { lte: 20000 } }, items)).toBe(1)
  })

  it('supports and / or composition and an empty filter (all items)', () => {
    expect(evaluateProductSetFilter({ and: [{ make: { i_contains: 'suz' } }, { vehicle_condition: { neq: 'new' } }] }, items)).toBe(21)
    expect(evaluateProductSetFilter({ or: [{ vehicle_condition: { eq: 'new' } }, { vehicle_condition: { eq: 'used' } }] }, items)).toBe(2)
    expect(evaluateProductSetFilter({}, items)).toBe(23)
  })

  it('refuses to count unsupported fields or operators instead of guessing', () => {
    expect(() => evaluateProductSetFilter({ custom_label_0: { eq: 'x' } }, items)).toThrow(/unsupported product set filter field/i)
    expect(() => evaluateProductSetFilter({ price: { between: [1, 2] } }, items)).toThrow(/unsupported product set filter operator/i)
  })
})

describe('executeFeedReadTool guard', () => {
  it('gates on flag, permission, schema, and unknown names', async () => {
    const runner = { get_inventory_feed_health: vi.fn(async () => ({ ok: 1 })) }
    expect((await executeFeedReadTool('get_inventory_feed_health', { clientId: CLIENT }, ctx('admin'), { enabled: false, runner })).ok).toBe(false)
    expect(await executeFeedReadTool('nope', {}, ctx('admin'), { enabled: true, runner })).toMatchObject({ ok: false, code: 'not_found' })
    expect(await executeFeedReadTool('get_inventory_feed_health', { clientId: CLIENT }, ctx('viewer'), { enabled: true, runner })).toMatchObject({ ok: false, code: 'forbidden' })
    expect(await executeFeedReadTool('get_inventory_feed_health', { clientId: 'not-a-uuid' }, ctx('admin'), { enabled: true, runner })).toMatchObject({ ok: false, code: 'bad_args' })
    expect(await executeFeedReadTool('get_inventory_feed_health', { clientId: CLIENT }, ctx('admin'), { enabled: true, runner })).toEqual({ ok: true, data: { ok: 1 } })
  })
})

describe('executeFeedPropose — dryRun writes nothing (P-1)', () => {
  it('attach dryRun returns the full before/after and persists nothing', async () => {
    const d = deps()
    const res = await executeFeedPropose('propose_attach_catalog_feed', { ...attachArgs, dryRun: true }, ctx('admin'), d)
    expect(res).toMatchObject({ ok: true, data: { dryRun: true, feedDisposition: 'created', proposedScheduleUrl: attachPreview.proposedScheduleUrl, currentScheduleUrl: null, itemCount: 22 } })
    expect(d.persist).not.toHaveBeenCalled()
    expect(d.refresh).not.toHaveBeenCalled()
  })

  it('attach threads the F-6 schedule to the preview resolver and shows it in the dry run', async () => {
    const d = deps()
    const schedule = { interval: 'HOURLY' as const }
    const res = await executeFeedPropose('propose_attach_catalog_feed', { ...attachArgs, schedule, dryRun: true }, ctx('admin'), d)
    expect(res).toMatchObject({ ok: true, data: { dryRun: true, proposedSchedule: { interval: 'HOURLY' } } })
    expect(d.resolveAttachPreview).toHaveBeenCalledWith(expect.objectContaining({ schedule }), expect.anything())
    expect(d.persist).not.toHaveBeenCalled()
    // Invalid interval refuses.
    expect(await executeFeedPropose('propose_attach_catalog_feed', { ...attachArgs, schedule: { interval: 'WEEKLY' } }, ctx('admin'), d))
      .toMatchObject({ ok: false, code: 'bad_args' })
  })

  it('set-rules accepts the optional F-7 verifyCampaignId and stores it in the proposal args', async () => {
    const d = deps()
    const res = await executeFeedPropose('propose_set_product_set_rules', { ...rulesArgs, verifyCampaignId: '120234010879480224' }, ctx('admin'), d)
    expect(res).toMatchObject({ ok: true, data: { requiresAck: true } })
    expect(d.persist).toHaveBeenCalledWith(
      expect.anything(),
      'feed_set_product_set_rules',
      expect.objectContaining({ args: expect.objectContaining({ verifyCampaignId: '120234010879480224' }) })
    )
  })

  it('attach without dryRun persists a proposal and flags requiresAck', async () => {
    const d = deps()
    const res = await executeFeedPropose('propose_attach_catalog_feed', attachArgs, ctx('admin'), d)
    expect(res).toMatchObject({ ok: true, data: { proposalId: 'prop-1', requiresAck: true, kind: 'feed_attach_catalog' } })
    expect(d.persist).toHaveBeenCalledWith(expect.anything(), 'feed_attach_catalog', expect.objectContaining({ kind: 'feed_attach_catalog', args: attachArgs }))
  })

  it('set-rules dryRun returns the proposed item count and persists nothing', async () => {
    const d = deps()
    const res = await executeFeedPropose('propose_set_product_set_rules', { ...rulesArgs, dryRun: true }, ctx('admin'), d)
    expect(res).toMatchObject({ ok: true, data: { dryRun: true, currentItemCount: 1, proposedItemCount: 21 } })
    expect(d.persist).not.toHaveBeenCalled()
  })

  it('set-rules without dryRun persists and requires ack', async () => {
    const d = deps()
    const res = await executeFeedPropose('propose_set_product_set_rules', rulesArgs, ctx('admin'), d)
    expect(res).toMatchObject({ ok: true, data: { proposalId: 'prop-1', requiresAck: true, kind: 'feed_set_product_set_rules' } })
  })

  it('refresh passes dryRun through and surfaces a runner that ignores it', async () => {
    const d = deps()
    const dry = await executeFeedPropose('propose_refresh_catalog_feed', { clientId: CLIENT, connectionId: CONNECTION, productFeedId: 'pf-1', dryRun: true }, ctx('admin'), d)
    expect(dry).toMatchObject({ ok: true, data: { dryRun: true, uploadId: null } })
    expect(d.refresh).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }), expect.anything())

    const ignoring = deps({ refresh: vi.fn(async args => ({ productFeedId: args.productFeedId, serveUrl: 's', uploadId: 'up', itemCount: 5 })) })
    const res = await executeFeedPropose('propose_refresh_catalog_feed', { clientId: CLIENT, connectionId: CONNECTION, productFeedId: 'pf-1', dryRun: true }, ctx('admin'), ignoring)
    expect(res).toMatchObject({ ok: false, code: 'handler_error' })
  })

  it('refresh without dryRun returns uploadId and item count', async () => {
    const res = await executeFeedPropose('propose_refresh_catalog_feed', { clientId: CLIENT, connectionId: CONNECTION, productFeedId: 'pf-1' }, ctx('admin'), deps())
    expect(res).toMatchObject({ ok: true, data: { uploadId: 'up-1', itemCount: 22 } })
  })

  it('gates on flag / permission / schema and never throws', async () => {
    expect(await executeFeedPropose('propose_attach_catalog_feed', attachArgs, ctx('admin'), deps({ suiteEnabled: false }))).toMatchObject({ ok: false, code: 'disabled' })
    expect(await executeFeedPropose('propose_attach_catalog_feed', attachArgs, ctx('viewer'), deps())).toMatchObject({ ok: false, code: 'forbidden' })
    expect(await executeFeedPropose('propose_attach_catalog_feed', { ...attachArgs, catalogId: 'abc' }, ctx('admin'), deps())).toMatchObject({ ok: false, code: 'bad_args' })
    const failing = deps({ resolveAttachPreview: vi.fn(async () => { throw new Error('boom') }) })
    expect(await executeFeedPropose('propose_attach_catalog_feed', attachArgs, ctx('admin'), failing)).toMatchObject({ ok: false, code: 'handler_error' })
  })
})

describe('dispatchFeedConfirm — the P-2 ack carve-in', () => {
  const payload = { kind: 'feed_attach_catalog', args: attachArgs, preview: attachPreview }
  const confirmDeps = () => ({
    executeAttach: vi.fn(async () => ({ state: 'READY' })),
    applySetRules: vi.fn(async () => ({ productSetId: 'ps-1', itemCount: 21, meetsMinimum: true, readbackVerified: true }))
  })

  it('returns null for non-feed tool_names (falls through to other dispatchers)', async () => {
    expect(await dispatchFeedConfirm({ tool_name: 'video_generation', resolved_payload: {} }, true, ctx('admin'), confirmDeps())).toBeNull()
  })

  it('refuses without ack:true and never executes — regardless of authority', async () => {
    const d = confirmDeps()
    const res = await dispatchFeedConfirm({ tool_name: 'feed_attach_catalog', resolved_payload: payload }, false, ctx('admin'), d)
    expect(res).toMatchObject({ ok: false, code: 'confirm_required' })
    expect(d.executeAttach).not.toHaveBeenCalled()
    expect(d.applySetRules).not.toHaveBeenCalled()
  })

  it('executes attach with ack:true and marks dispatch', async () => {
    const d = { ...confirmDeps(), execution: { markDispatched: vi.fn(async () => {}) } as never }
    const res = await dispatchFeedConfirm({ tool_name: 'feed_attach_catalog', resolved_payload: payload }, true, ctx('admin'), d)
    expect(res).toEqual({ ok: true, data: { state: 'READY' } })
    expect((d.execution as any).markDispatched).toHaveBeenCalled()
  })

  it('executes set-rules with ack:true and maps thrown errors to handler_error', async () => {
    const d = confirmDeps()
    const rulesPayload = { kind: 'feed_set_product_set_rules', args: rulesArgs, preview: {} }
    const res = await dispatchFeedConfirm({ tool_name: 'feed_set_product_set_rules', resolved_payload: rulesPayload }, true, ctx('admin'), d)
    expect(res).toMatchObject({ ok: true, data: { readbackVerified: true } })

    const failing = { ...confirmDeps(), applySetRules: vi.fn(async () => { throw new Error('Meta product set readback did not match the proposed filter') }) }
    const bad = await dispatchFeedConfirm({ tool_name: 'feed_set_product_set_rules', resolved_payload: rulesPayload }, true, ctx('admin'), failing)
    expect(bad).toMatchObject({ ok: false, code: 'handler_error', error: expect.stringContaining('readback') })
  })
})
