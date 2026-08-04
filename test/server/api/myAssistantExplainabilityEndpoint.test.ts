import { describe, expect, it, vi } from 'vitest'

describe('GET /api/agency/ai/my-assistant', () => {
  it('authenticates and resolves fresh server authority for the caller', async () => {
    const user = { id: '50000000-0000-4000-8000-000000000001' }
    const event = { context: {} } as never
    const context = { preferences: { personaKey: null } } as never
    const response = {
      personaKey: null,
      authority: {
        currentRole: 'owner',
        activePacks: [{
          key: 'creative_studio',
          label: 'Creative Studio',
          version: 3,
          departmentName: 'Creative',
          releaseState: 'active',
          accessBasis: 'company_owner'
        }]
      }
    }
    const requireAuth = vi.fn().mockResolvedValue(user)
    const resolvePersonalAssistantContext = vi.fn().mockResolvedValue(context)
    const buildMyAssistantExplainability = vi.fn().mockReturnValue(response)
    const runtimePolicy = {
      mode: 'pilot' as const,
      authenticatedCoreTools: ['search_knowledge', 'get_tasks'] as const
    }
    const getRuntimePolicy = vi.fn().mockReturnValue(runtimePolicy)
    const getObservedMemoryEnabled = vi.fn().mockReturnValue(false)
    const tools = [{ name: 'search_knowledge', description: 'Search knowledge.' }]
    const { createMyAssistantGetHandler } = await import(
      '~~/server/api/agency/ai/my-assistant.get'
    )

    const handler = createMyAssistantGetHandler({
      requireAuth,
      resolvePersonalAssistantContext,
      buildMyAssistantExplainability,
      getRuntimePolicy,
      getObservedMemoryEnabled,
      tools
    })

    await expect(handler(event)).resolves.toBe(response)
    expect(response.authority.activePacks[0]?.accessBasis).toBe('company_owner')
    expect(requireAuth).toHaveBeenCalledWith(event)
    expect(resolvePersonalAssistantContext).toHaveBeenCalledWith({
      userId: user.id,
      event,
      runtimePolicy,
      observedMemoryEnabled: false
    })
    expect(buildMyAssistantExplainability).toHaveBeenCalledWith(context, tools)
  })
})
