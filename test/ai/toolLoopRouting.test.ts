import type { PermissionGroup } from '../../server/utils/permissions'
import { resolvePersona } from '../../server/utils/ai/personas'
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { MockLanguageModelV3 } from 'ai/test'
import { runToolLoop } from '../../server/utils/ai/toolLoop'
import { PROVIDER_TOOL_CAP } from '../../server/utils/ai/toolRouting'

// Groq rejects requests with more than 128 tools; marketing-management staff have 200+.
const catalog = vi.hoisted(() => ({ build: vi.fn() }))
vi.mock('~~/server/utils/ai/marketing/nativeTools', () => ({ buildNativeMarketingTools: catalog.build }))
vi.mock('~~/server/utils/ai/invocationLedger', () => ({ recordAiInvocation: vi.fn() }))
beforeAll(() => vi.stubGlobal('useRuntimeConfig', () => ({})))
afterAll(() => vi.unstubAllGlobals())

const marketingTool = (name: string, description: string) => ({
  name, description, requiredPermission: 'MARKETING_MANAGEMENT' as const,
  parameters: z.object({ clientId: z.string().optional(), cursor: z.string().optional() }), handler: vi.fn(async () => ({ ok: true, data: {} }))
})

describe('chat loop tool routing', () => {
  it('sends a capped, relevant subset and lets the model widen it with find_more_tools', async () => {
    catalog.build.mockResolvedValue([
      marketingTool('get_department_budget_health', 'Budget pacing and overspend across clients'),
      marketingTool('create_social_post_draft', 'Create a draft social post'),
      ...Array.from({ length: 220 }, (_, i) => marketingTool(`marketing_filler_${i}`, `Unrelated department operation ${i}`))
    ])
    const requests: Array<{ tools?: Array<{ name: string, inputSchema?: { properties: Record<string, { anyOf?: unknown[] }> } }> }> = []
    const model = new MockLanguageModelV3({ doGenerate: async (request) => {
      requests.push(request as never)
      if (requests.length === 1) {
        return { content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'find_more_tools', input: JSON.stringify({ query: 'social post draft' }) }], finishReason: 'tool-calls', usage: { inputTokens: 10, outputTokens: 8, totalTokens: 18 }, warnings: [] } as never
      }
      return { content: [{ type: 'text', text: 'Done' }], finishReason: 'stop', usage: { inputTokens: 10, outputTokens: 8, totalTokens: 18 }, warnings: [] } as never
    } })
    await runToolLoop({
      ctx: { userId: 'staff', userRole: 'media_buyer', source: 'chat', event: {} as never },
      system: 'Help staff', messages: [{ role: 'user', content: 'Which clients are over-pacing their budget?' }], seed: 'test',
      persona: resolvePersona('general'), messageId: 'persisted-message', permissionGroups: ['MARKETING_MANAGEMENT'] as PermissionGroup[], model
    })

    const first = requests[0]!.tools!.map(tool => tool.name)
    expect(first.length).toBeLessThanOrEqual(PROVIDER_TOOL_CAP)
    expect(first.length).toBeLessThan(60)
    expect(first).toContain('get_department_budget_health')
    expect(first).toContain('find_more_tools')
    expect(first).not.toContain('create_social_post_draft')

    // Optional fields are advertised as nullable (gpt-oss sends null for unset optionals).
    const budget = requests[0]!.tools!.find(tool => tool.name === 'get_department_budget_health')!
    expect(budget.inputSchema.properties.cursor.anyOf).toContainEqual({ type: 'null' })

    const second = requests[1]!.tools!.map(tool => tool.name)
    expect(second).toContain('create_social_post_draft')
    expect(second.length).toBeLessThanOrEqual(PROVIDER_TOOL_CAP)
  })

  it('leaves small catalogues untouched (no routing, no find_more_tools)', async () => {
    catalog.build.mockResolvedValue([marketingTool('get_department_budget_health', 'Budget pacing')])
    const requests: Array<{ tools?: Array<{ name: string }> }> = []
    const model = new MockLanguageModelV3({ doGenerate: async (request) => {
      requests.push(request as never)
      return { content: [{ type: 'text', text: 'Ready' }], finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, warnings: [] } as never
    } })
    await runToolLoop({
      ctx: { userId: 'staff', userRole: 'viewer', source: 'chat', event: {} as never },
      system: 'Help', messages: [{ role: 'user', content: 'Budget' }], seed: 'test',
      persona: resolvePersona('marketing'), messageId: 'm', permissionGroups: ['MARKETING_MANAGEMENT'] as PermissionGroup[], model
    })
    expect(requests[0]!.tools!.map(tool => tool.name)).not.toContain('find_more_tools')
  })
})
