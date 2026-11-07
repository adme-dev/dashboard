import type { PermissionGroup } from '../../server/utils/permissions'
import { resolvePersona } from '../../server/utils/ai/personas'
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { MockLanguageModelV3 } from 'ai/test'
import { runToolLoop } from '../../server/utils/ai/toolLoop'
import { resolveCatalogRuntimePolicy } from '../../server/utils/ai/governance/catalogComposition'

const catalog = vi.hoisted(() => ({ build: vi.fn() }))
vi.mock('~~/server/utils/ai/marketing/nativeTools', () => ({ buildNativeMarketingTools: catalog.build }))
vi.mock('~~/server/utils/ai/invocationLedger', () => ({ recordAiInvocation: vi.fn() }))
beforeAll(() => vi.stubGlobal('useRuntimeConfig', () => ({})))
afterAll(() => vi.unstubAllGlobals())
describe('normal staff chat assembles reviewed marketing before governance', () => {
  it('exposes an explicitly granted tool in legacy mode but never circumvents enforced releases', async () => {
    catalog.build.mockResolvedValue([{ name: 'marketing_get_inventory_feed_health', description: 'Read the authorised client feed.', requiredPermission: 'MARKETING_MANAGEMENT', parameters: z.object({ clientId: z.string() }), handler: vi.fn() }])
    const requests: Array<{ tools?: Array<{ name: string }> }> = []
    const model = new MockLanguageModelV3({ doGenerate: async (request) => {
      requests.push(request)
      return { content: [{ type: 'text', text: 'Ready' }], finishReason: 'stop', usage: { inputTokens: 10, outputTokens: 8, totalTokens: 18 }, warnings: [] } as never
    } })
    const opts = { ctx: { userId: 'staff', userRole: 'media_buyer', source: 'chat' as const, event: {} as never }, system: 'Help staff', messages: [{ role: 'user', content: 'Feed health' }], seed: 'test', persona: resolvePersona('media_buyer'), messageId: 'persisted-message', permissionGroups: ['MARKETING_MANAGEMENT'] as PermissionGroup[], model }
    await runToolLoop(opts)
    expect(requests[0].tools.map(tool => tool.name)).toContain('marketing_get_inventory_feed_health')
    expect(requests[0].tools.map(tool => tool.name)).not.toContain('get_finance_snapshot')
    await runToolLoop({ ...opts, runtimePolicy: resolveCatalogRuntimePolicy('enforced') })
    expect(requests[1].tools.map(tool => tool.name)).not.toContain('marketing_get_inventory_feed_health')
    expect(catalog.build).toHaveBeenCalledWith(opts.ctx, 'persisted-message')
  })
})
