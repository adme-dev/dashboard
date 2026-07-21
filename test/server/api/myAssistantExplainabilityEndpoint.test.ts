import { describe, expect, it, vi } from 'vitest'

describe('GET /api/agency/ai/my-assistant', () => {
  it('authenticates and resolves fresh server authority for the caller', async () => {
    const user = { id: '50000000-0000-4000-8000-000000000001' }
    const event = { context: {} } as never
    const context = { preferences: { personaKey: null } } as never
    const response = { personaKey: null, authority: { currentRole: 'creative' } }
    const requireAuth = vi.fn().mockResolvedValue(user)
    const resolvePersonalAssistantContext = vi.fn().mockResolvedValue(context)
    const buildMyAssistantExplainability = vi.fn().mockReturnValue(response)
    const tools = [{ name: 'search_knowledge', description: 'Search knowledge.' }]
    const { createMyAssistantGetHandler } = await import(
      '~~/server/api/agency/ai/my-assistant.get'
    )

    const handler = createMyAssistantGetHandler({
      requireAuth,
      resolvePersonalAssistantContext,
      buildMyAssistantExplainability,
      tools
    })

    await expect(handler(event)).resolves.toBe(response)
    expect(requireAuth).toHaveBeenCalledWith(event)
    expect(resolvePersonalAssistantContext).toHaveBeenCalledWith({
      userId: user.id,
      event
    })
    expect(buildMyAssistantExplainability).toHaveBeenCalledWith(context, tools)
  })
})
