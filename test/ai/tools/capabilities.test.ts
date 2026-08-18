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
          { name: 'generate_voiceover', mode: 'direct_generation' },
        ],
        suites: { textModels: true, imageGeneration: true, bannerStudio: true, video: true, audio: true },
      }),
    }
    const result = await getCapabilities({}, ctx, deps)
    expect(result.ok).toBe(true)
    expect((result as any).data).toMatchObject({
      identity: { id: 'user-1', name: 'Paul Giurin', email: 'paul@adme.net.au', role: 'owner' },
      scopes: ['mcp:read', 'mcp:write'],
      tools: expect.arrayContaining([
        { name: 'get_campaign_breakdown', mode: 'read' },
        { name: 'propose_banner_render', mode: 'propose_only' },
      ]),
      creationSuites: { textModels: true, imageGeneration: true, bannerStudio: true, video: true, audio: true },
      rateLimits: { generation: { maxCalls: 20, windowMinutes: 10 } },
    })
  })
})
