import { describe, expect, it, vi } from 'vitest'
import { getCapabilities, type CapabilitiesDeps } from '~~/server/utils/ai/tools/capabilities'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx = {
  userId: 'user-1',
  userName: 'Paul Giurin',
  userEmail: 'paul@adme.net.au',
  userRole: 'owner',
  mcpScopes: ['mcp:read', 'mcp:write'],
  source: 'mcp',
  event: {} as any,
} as ToolContext

describe('get_capabilities', () => {
  it('returns identity, scopes, classified tools, suites and rate limits', async () => {
    const deps: CapabilitiesDeps = {
      inspect: vi.fn().mockResolvedValue({
        tools: [
          { name: 'get_campaign_breakdown', mode: 'read' },
          { name: 'propose_banner_render', mode: 'propose_only' },
          { name: 'confirm_action', mode: 'confirmation' },
          { name: 'verify_creative_compliance', mode: 'inspection' },
          { name: 'generate_voiceover', mode: 'direct_generation' },
        ],
        suites: { textModels: true, imageGeneration: true, bannerStudio: true, video: true, audio: true },
      }),
      inspectActions: vi.fn().mockResolvedValue([{
        tool: 'generate_voiceover',
        arguments: { clientId: '22222222-2222-4222-8222-222222222222', title: 'EOFY' },
        clientName: 'Northern Motor Group',
        actorName: 'Paul Giurin',
        outcome: 'succeeded',
      }]),
    }
    const result = await getCapabilities({ actionLog: { clientName: 'Northern Motor Group', limit: 20 } }, ctx, deps)
    expect(result.ok).toBe(true)
    expect((result as any).data).toMatchObject({
      identity: { id: 'user-1', name: 'Paul Giurin', email: 'paul@adme.net.au', role: 'owner' },
      scopes: ['mcp:read', 'mcp:write'],
      tools: expect.arrayContaining([
        { name: 'get_campaign_breakdown', mode: 'read' },
        { name: 'propose_banner_render', mode: 'propose_only' },
      ]),
      creationSuites: { textModels: true, imageGeneration: true, bannerStudio: true, video: true, audio: true },
      rateLimits: {
        generation: { maxCalls: 20, windowMinutes: 10 },
        inspection: { maxCalls: 100, windowMinutes: 10 },
      },
      directGenerationDecision: {
        enabled: true,
        tools: ['generate_voiceover'],
        compensatingControls: expect.arrayContaining(['immutable action audit']),
      },
      actionLog: {
        count: 1,
        items: [expect.objectContaining({ tool: 'generate_voiceover', actorName: 'Paul Giurin' })],
      },
    })
    expect(deps.inspectActions).toHaveBeenCalledWith(ctx, { clientName: 'Northern Motor Group', limit: 20 })
  })

  it('retries one transient inspection failure', async () => {
    const inspect = vi.fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce({
        tools: [{ name: 'list_creative_models', mode: 'read' }],
        suites: { textModels: true, imageGeneration: true, bannerStudio: false, video: false, audio: false },
      })
    const result = await getCapabilities({}, ctx, { inspect, retryDelay: vi.fn(async () => {}) })

    expect(result.ok).toBe(true)
    expect(inspect).toHaveBeenCalledTimes(2)
  })

  it('derives God-mode capabilities from the exact executable MCP registry', async () => {
    const result = await getCapabilities({}, {
      ...ctx,
      godModeExecutionKey: `mcp:${'a'.repeat(64)}`,
    })

    expect(result.ok).toBe(true)
    const tools = (result as any).data.tools as Array<{ name: string, mode: string }>
    expect(tools).toHaveLength(164)
    expect(tools).toContainEqual({ name: 'run_adspend_sync', mode: 'inspection' })
    expect(tools).toContainEqual({ name: 'get_sync_status', mode: 'inspection' })
    expect(tools).toContainEqual({ name: 'get_ad_creative_text', mode: 'read' })
    expect(tools).toContainEqual({ name: 'list_video_source_assets', mode: 'read' })
    // W-1/W-2 + G-1a: mode stays the declared class; effectiveMode tells the god-mode
    // caller these registry writes will NOT stop at a proposal.
    expect(tools).toContainEqual(expect.objectContaining({
      name: 'propose_set_campaign_budget',
      mode: 'propose_only',
      effectiveMode: 'direct_execute'
    }))
    expect(tools).toContainEqual(expect.objectContaining({
      name: 'propose_bulk_set_campaign_budgets',
      mode: 'propose_only',
      effectiveMode: 'direct_execute'
    }))
    // Supplemental video proposes genuinely stop at a proposal — no effectiveMode override.
    const videoPropose = tools.find(tool => tool.name === 'propose_video_generation') as Record<string, unknown>
    expect(videoPropose.effectiveMode).toBeUndefined()
    // Feed round P-2 carve-in: attach/set-rules read confirmation_required even under god-mode.
    for (const name of ['propose_attach_catalog_feed', 'propose_set_product_set_rules']) {
      expect(tools).toContainEqual(expect.objectContaining({
        name,
        mode: 'propose_only',
        effectiveMode: 'confirmation_required'
      }))
    }
    expect(tools).toContainEqual({ name: 'get_inventory_feed_health', mode: 'read' })
    expect(tools).toContainEqual({ name: 'list_product_sets', mode: 'read' })
    const refresh = tools.find(tool => tool.name === 'propose_refresh_catalog_feed') as Record<string, unknown>
    expect(refresh.mode).toBe('propose_only')
    expect((result as any).data.alwaysRequiresConfirmation).toEqual({
      tools: ['propose_attach_catalog_feed', 'propose_set_product_set_rules'],
      reason: 'binds or retargets a client ad account; not reversible from the agent side',
      note: 'requires confirm_action with ack:true regardless of caller authority',
    })
    expect((result as any).data.governance.godModeBypass).toContain('direct-execute')
    expect((result as any).data.dataSync.adSpend.cron).toBe('0 20 * * *')
    expect((result as any).data.dataSync.adSpend).toHaveProperty('lastRunAt')
    expect((result as any).data.dataSync.adSpend).toHaveProperty('coverageBaselinePresent')
    expect((result as any).data.servedCatalog).toEqual({
      release: '2026-09-01.15', previousRelease: '2026-08-28.14', toolCount: 164, projectionAuthority: 'shared_with_tools_list',
    })
    expect((result as any).data.degraded).toBeUndefined()
  }, 15_000)

  it('returns a typed degraded capability response after the retry is exhausted', async () => {
    const result = await getCapabilities({}, ctx, {
      inspect: vi.fn().mockRejectedValue(new Error('down')),
      retryDelay: vi.fn(async () => {}),
    })
    expect(result).toMatchObject({
      ok: true,
      data: {
        tools: [{ name: 'get_capabilities', mode: 'read' }],
        creationSuites: {
          textModels: true,
          imageGeneration: false,
          bannerStudio: false,
          video: false,
          audio: false,
        },
        degraded: {
          active: true,
          code: 'capabilities_partial',
          retryable: true,
          unavailableSections: ['tool_catalog'],
        },
      },
    })
  })

  it('reports the last sync run per platform and whether the G-2 baseline exists (P-01)', async () => {
    const { inspectDataSyncRunStatus } = await import('~~/server/utils/ai/tools/capabilities')
    const load = vi.fn(async (sql: string) => sql.includes('spend_sync_source_counts')
      ? [{ n: 0 }]
      : [
          { platform: 'google', status: 'completed', started_at: '2026-08-19 08:13:47+00', finished_at: '2026-08-19 08:17:55+00', synced_count: 54, failure_count: 23 },
          { platform: 'meta', status: 'failed', started_at: '2026-08-19 08:13:37+00', finished_at: '2026-08-19 08:16:30+00', synced_count: 0, failure_count: 46 },
        ])
    const status = await inspectDataSyncRunStatus(load as any)
    expect(status?.lastRunOutcome).toBe('completed')
    expect(status?.byPlatform.find(p => p.platform === 'meta')?.failureCount).toBe(46)
    expect(status?.coverageBaselinePresent).toBe(false)
  })
})
