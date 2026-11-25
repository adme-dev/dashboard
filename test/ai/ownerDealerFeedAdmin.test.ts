/* eslint-disable @typescript-eslint/no-explicit-any -- Boundary fixtures model heterogeneous DB and provider records. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  projectOwnerDealerFeedAdminMcpSuite,
  resolveOwnerDealerFeedAdminMcpExecutions
} from '~~/server/utils/ai/mcp/ownerDealerFeedAdminTools'
import { consumeMcpRequestClaim } from '~~/server/utils/ai/mcp/requestClaim'
import { MCP_REQUEST_AUDIENCE, digestMcpRequestBody, signMcpRequestClaim } from '~~/shared/utils/mcpRequestClaim'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const clientId = '11111111-1111-4111-8111-111111111111'
const ownerId = '22222222-2222-4222-8222-222222222222'
const key = `mcp:${'a'.repeat(64)}`

const state = vi.hoisted(() => ({
  activeOwner: true,
  loseOwnerAtLock: false,
  activeClient: true,
  feedsEnabled: true,
  linkRow: null as any,
  orgFeeds: [] as any[],
  previewItemsBySeller: {} as Record<string, any[]>,
  previewMatchedOverride: null as Record<string, number> | null,
  updates: [] as any[],
  creates: [] as any[],
  resolvedOrgId: 'resolved-org-99'
}))

const query = vi.hoisted(() => vi.fn(async (sql: string, params: any[] = []) => {
  if (sql.includes('FROM team_members')) {
    if (!state.activeOwner) return { rows: [] }
    if (state.loseOwnerAtLock && sql.includes('FOR SHARE')) return { rows: [] }
    return { rows: [{ id: ownerId, email: 'owner@example.test' }] }
  }
  if (sql.includes('FROM agency_clients WHERE id = $1')) {
    return { rows: state.activeClient ? [{ id: params[0], name: 'Brighton RAM' }] : [] }
  }
  if (sql.includes('INSERT INTO client_feed_links')) {
    const row = {
      id: 'link-1',
      client_id: params[0],
      client_name: 'Brighton RAM',
      provider_id: params[1],
      external_org_id: params[2],
      seller_refs: JSON.parse(params[3]),
      default_feed_ids: JSON.parse(params[4]),
      status: params[5],
      created_at: '2026-11-25T00:00:00Z',
      updated_at: '2026-11-25T00:00:00Z'
    }
    state.linkRow = row
    return { rows: [row] }
  }
  if (sql.includes('UPDATE client_feed_links') && sql.includes('status = \'inactive\'')) {
    if (!state.linkRow) return { rows: [] }
    state.linkRow = { ...state.linkRow, status: 'inactive' }
    return { rows: [state.linkRow] }
  }
  if (sql.includes('UPDATE client_feed_links SET default_feed_ids')) {
    if (state.linkRow) state.linkRow = { ...state.linkRow, default_feed_ids: JSON.parse(params[2]) }
    return { rows: [state.linkRow] }
  }
  if (sql.includes('FROM client_feed_links')) {
    if (!state.linkRow) return { rows: [] }
    if (sql.includes('status = \'active\'') && state.linkRow.status !== 'active') return { rows: [] }
    if (sql.includes('l.status = $2') && state.linkRow.status !== params[1]) return { rows: [] }
    return { rows: [state.linkRow] }
  }
  return { rows: [] }
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: async (sql: string, p: any[]) => (await query(sql, p)).rows[0] ?? null,
  queryOneFresh: async (sql: string, p: any[]) => (await query(sql, p)).rows[0] ?? null,
  queryRows: async (sql: string, p: any[]) => (await query(sql, p)).rows,
  queryRowsFresh: async (sql: string, p: any[]) => (await query(sql, p)).rows,
  transaction: async (fn: any) => fn({ query }),
  transactionWithoutRetry: async (fn: any) => fn({ query }),
  execute: vi.fn()
}))

vi.mock('~~/server/utils/feeds/config', () => ({
  isDealerFeedsEnabled: () => state.feedsEnabled,
  getSocialDashboardClient: async () => ({
    call: async (_ctx: any, method: string, path: string, body?: any) => {
      if (method === 'GET' && path.startsWith('/api/feeds?')) {
        return { items: state.orgFeeds }
      }
      if (method === 'GET' && path.startsWith('/api/feeds/')) {
        const id = path.slice('/api/feeds/'.length)
        const item = state.orgFeeds.find(f => f.id === id)
        return { item }
      }
      if (method === 'PATCH' && path.startsWith('/api/feeds/')) {
        const id = path.slice('/api/feeds/'.length)
        state.updates.push({ id, body })
        const item = state.orgFeeds.find(f => f.id === id)
        if (item && body.filters) item.filters = body.filters
        return { ok: true }
      }
      if (method === 'POST' && path === '/api/feeds/upsert-external') {
        state.creates.push(body)
        const created = {
          id: 'feed-created-1',
          name: body.name,
          feed_type: body.feed_type,
          is_active: true,
          filters: body.filters,
          mappings: body.mappings,
          platform_settings: body.platform_settings,
          source: body.source ?? null
        }
        state.orgFeeds.push(created)
        return { feedId: created.id }
      }
      if (method === 'POST' && path === '/api/feeds/preview') {
        const sellerIds: string[] = Array.isArray(body?.filters?.sellerIds) ? body.filters.sellerIds : []
        const keyName = sellerIds.length ? sellerIds.join(',') : '__all__'
        const items = sellerIds.length
          ? sellerIds.flatMap(s => state.previewItemsBySeller[s] ?? [])
          : Object.values(state.previewItemsBySeller).flat()
        const matched = state.previewMatchedOverride?.[keyName] ?? items.length
        return {
          total: matched,
          matchedTotal: matched,
          validatedTotal: matched,
          invalidTotal: 0,
          items
        }
      }
      throw new Error(`Unexpected social dashboard call: ${method} ${path}`)
    },
    resolveOrganization: async () => ({ organization_id: state.resolvedOrgId })
  })
}))

const projection = { governanceBypass: true } as Parameters<typeof projectOwnerDealerFeedAdminMcpSuite>[0]
const services = { markDispatched: vi.fn(async () => {}), captureResult: vi.fn(async () => {}) }

async function callAdmin(tool: string, args: object, opts: { signed?: boolean, withServices?: boolean } = {}) {
  const { signed = true, withServices = true } = opts
  const entry = resolveOwnerDealerFeedAdminMcpExecutions(projection).find(e => e.name === tool)!
  const event = { context: {} } as ToolContext['event']
  const ownerCtx = {
    userId: ownerId,
    userRole: 'owner',
    source: 'mcp',
    event,
    mcpScopes: ['mcp:read', 'mcp:write'],
    godModeExecutionKey: key
  } as unknown as ToolContext
  if (signed) {
    const body = { userId: ownerId, tool, args }
    const secret = 'disposable-test-only-owner-admin-secret'
    const path = '/api/internal/mcp/call'
    const claim = await signMcpRequestClaim({
      uid: ownerId,
      scope: ['mcp:read', 'mcp:write'],
      godMode: true,
      audience: MCP_REQUEST_AUDIENCE,
      method: 'POST',
      path,
      toolName: tool,
      bodyDigest: await digestMcpRequestBody(body)
    }, secret)
    await consumeMcpRequestClaim(event, claim, ownerId, {
      signingSecret: secret,
      body,
      method: 'POST',
      path,
      scopeHeader: undefined,
      consumeNonce: async () => true
    })
  }
  return entry.tool.mutates
    ? entry.executeSupplemental!(args, ownerCtx, withServices ? services : undefined)
    : entry.tool.handler(args, ownerCtx)
}

beforeEach(() => {
  state.activeOwner = true
  state.loseOwnerAtLock = false
  state.activeClient = true
  state.feedsEnabled = true
  state.linkRow = {
    id: 'link-1',
    client_id: clientId,
    client_name: 'Brighton RAM',
    provider_id: 'social-dashboard',
    external_org_id: 'org-brighton-ram',
    seller_refs: ['brighton-ram'],
    default_feed_ids: ['feed-ram-1'],
    status: 'active',
    created_at: '2026-11-25T00:00:00Z',
    updated_at: '2026-11-25T00:00:00Z'
  }
  state.orgFeeds = [
    {
      id: 'feed-ram-1',
      name: 'Brighton RAM Google PMAX',
      feed_type: 'google',
      is_active: true,
      filters: { condition: ['new', 'demo'], saleableOnly: true },
      mappings: {},
      platform_settings: { store_code: 'BrightonRAM3187', external: { clientId, key: 'super-secret-key' } },
      source: {
        type: 'meilisearch',
        url: 'https://search.imotor.com.au/multi-search',
        authCredentials: 'Bearer top-secret-token',
        requestConfig: { indexUid: 'dealer_stock_4379' }
      }
    }
  ]
  state.previewItemsBySeller = {
    'brighton-ram': [
      { id: 'v1', seller_id: 'brighton-ram', make: 'RAM', model: '1500', address: { line1: '801 Nepean Hwy', suburb: 'Brighton East', state: 'VIC', postcode: '3187' } }
    ]
  }
  state.previewMatchedOverride = null
  state.updates = []
  state.creates = []
  vi.clearAllMocks()
})

describe('owner dealer-feed admin MCP suite', () => {
  it('projects 7 tools only to active God-mode owners and rejects unsigned or uncoordinated calls', async () => {
    expect(projectOwnerDealerFeedAdminMcpSuite({ ...projection, governanceBypass: false })).toEqual([])
    expect(projectOwnerDealerFeedAdminMcpSuite(projection)).toHaveLength(7)

    const unsigned = await callAdmin('owner_list_dealer_feed_links', {}, { signed: false })
    expect(unsigned).toMatchObject({ ok: false, code: 'forbidden' })

    const noCoord = await callAdmin('owner_upsert_dealer_feed_link', {
      clientId,
      sellerRefs: ['brighton-ram'],
      ack: true
    }, { withServices: false })
    expect(noCoord).toMatchObject({ ok: false, code: 'coordinator_required' })
  })

  it('lists, upserts (preserving existing org/defaultFeedIds when omitted) and deactivates dealer feed links', async () => {
    const listed = await callAdmin('owner_list_dealer_feed_links', {})
    expect(listed).toMatchObject({ ok: true, data: { count: 1, links: [{ clientId, sellerRefs: ['brighton-ram'] }] } })

    const updated = await callAdmin('owner_upsert_dealer_feed_link', {
      clientId,
      sellerRefs: ['brighton-ram', 'extra-seller'],
      ack: true
    })
    expect(updated).toMatchObject({
      ok: true,
      data: {
        after: {
          externalOrgId: 'org-brighton-ram',
          sellerRefs: ['brighton-ram', 'extra-seller'],
          defaultFeedIds: ['feed-ram-1']
        }
      }
    })
    expect(services.markDispatched).toHaveBeenCalledTimes(1)

    const deactivated = await callAdmin('owner_deactivate_dealer_feed_link', { clientId, ack: true })
    expect(deactivated).toMatchObject({ ok: true, data: { link: { status: 'inactive' } } })
  })

  it('inspects raw org feeds with ownershipDiagnostics and redacts supplier credentials', async () => {
    const res = await callAdmin('owner_inspect_org_feeds', {
      clientId,
      feedId: 'feed-ram-1',
      includePreview: true
    })
    expect(res).toMatchObject({
      ok: true,
      data: {
        externalOrgId: 'org-brighton-ram',
        feeds: [
          {
            feedId: 'feed-ram-1',
            isScopedForClient: false,
            ownershipDiagnostics: ['missing_seller_ids'],
            source: {
              type: 'meilisearch',
              host: 'search.imotor.com.au',
              pathname: '/multi-search',
              indexUid: 'dealer_stock_4379'
            },
            platformSettings: { storeCode: 'BrightonRAM3187', externalClientId: clientId },
            preview: { current: { matchedTotal: 1 }, withLinkSellerRefs: { matchedTotal: 1 } }
          }
        ]
      }
    })
    const serialized = JSON.stringify(res)
    expect(serialized).not.toContain('top-secret-token')
    expect(serialized).not.toContain('super-secret')
  })

  it('discovers native inventory sellers with addresses without exposing secrets', async () => {
    state.previewItemsBySeller['seller-gwm'] = [
      { id: 'v2', seller_id: 'seller-gwm', make: 'GWM', model: 'Haval H6', address: { line1: '803 Nepean Highway', suburb: 'Bentleigh', state: 'Victoria', postcode: '3204' } }
    ]
    const res = await callAdmin('owner_discover_inventory_sellers', {
      externalOrgId: 'org-shared',
      makes: ['GWM']
    })
    expect(res.ok).toBe(true)
    expect((res as any).data.sellers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sellerId: 'seller-gwm',
        address: { line1: '803 Nepean Highway', suburb: 'Bentleigh', state: 'Victoria', postcode: '3204' },
        makes: ['GWM']
      })
    ]))
  })

  it('repairs unscoped feed sellerIds after preview parity check and refuses count-changing or unlinked sellerIds', async () => {
    // Reject sellerId not in link.sellerRefs
    const foreign = await callAdmin('owner_repair_feed_seller_scope', {
      clientId,
      feedId: 'feed-ram-1',
      sellerIds: ['not-in-link'],
      ack: true
    })
    expect(foreign).toMatchObject({ ok: false, code: 'bad_args' })
    expect(state.updates).toHaveLength(0)

    // Refuse when preview matched count would drop (like digitaldealer wrong sellerId)
    state.previewMatchedOverride = { '__all__': 191, 'brighton-ram': 0 }
    const countDrop = await callAdmin('owner_repair_feed_seller_scope', {
      clientId,
      feedId: 'feed-ram-1',
      sellerIds: ['brighton-ram'],
      ack: true
    })
    expect(countDrop).toMatchObject({ ok: false, code: 'preview_count_changed' })
    expect(state.updates).toHaveLength(0)

    // Succeed when preview counts match and verify readback passes isScopedDepartmentFeed
    state.previewMatchedOverride = { '__all__': 7, 'brighton-ram': 7 }
    const repaired = await callAdmin('owner_repair_feed_seller_scope', {
      clientId,
      feedId: 'feed-ram-1',
      sellerIds: ['brighton-ram'],
      ack: true
    })
    expect(repaired).toMatchObject({
      ok: true,
      data: {
        feedId: 'feed-ram-1',
        isScopedForClient: true,
        ownershipDiagnostics: [],
        readbackVerified: true
      }
    })
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0].body).toEqual({
      filters: { condition: ['new', 'demo'], saleableOnly: true, sellerIds: ['brighton-ram'] }
    })
  })

  it('supports dryRun preview and live creation of a new client feed with auto-binding and credential redaction', async () => {
    const dry = await callAdmin('owner_create_inventory_feed', {
      clientId,
      name: 'Brighton RAM Meta',
      platform: 'facebook',
      sourceFeedId: 'feed-ram-1',
      dryRun: true
    })
    expect(dry).toMatchObject({ ok: true, data: { dryRun: true, name: 'Brighton RAM Meta' } })
    expect(state.creates).toHaveLength(0)
    expect(JSON.stringify(dry)).not.toContain('top-secret-token')

    const live = await callAdmin('owner_create_inventory_feed', {
      clientId,
      name: 'Brighton RAM Meta',
      platform: 'facebook',
      sourceFeedId: 'feed-ram-1',
      storeCode: 'BrightonRAM3187',
      ack: true
    })
    expect(live).toMatchObject({
      ok: true,
      data: {
        feedId: 'feed-created-1',
        defaultFeedIds: ['feed-ram-1', 'feed-created-1'],
        isScopedForClient: true,
        readbackVerified: true
      }
    })
    expect(state.creates).toHaveLength(1)
    expect(state.creates[0].filters.sellerIds).toEqual(['brighton-ram'])
    expect(JSON.stringify(live)).not.toContain('top-secret-token')
  })

  it('blocks mutations if active owner status is revoked at the transaction lock boundary', async () => {
    state.loseOwnerAtLock = true
    const res = await callAdmin('owner_upsert_dealer_feed_link', {
      clientId,
      sellerRefs: ['brighton-ram'],
      ack: true
    })
    expect(res).toMatchObject({ ok: false, code: 'forbidden' })
  })
})
