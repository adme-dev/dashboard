import { describe, expect, it, vi } from 'vitest'
import { buildNativeSpecialistTools } from '~~/server/utils/ai/nativeSpecialistTools'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import type { RoleSkillActor } from '~~/server/utils/ai/roleSkills/eligibility'

const ctx = { userId: 'staff', userRole: 'media_buyer', source: 'chat', event: {} } as ToolContext
const clientId = '11111111-1111-4111-8111-111111111111'
function dependencies() {
  const actor = vi.fn(async (): Promise<RoleSkillActor> => ({ userId: 'staff', role: 'media_buyer', roleId: 'role', customRoleId: 'role', permissionGroups: ['MEDIA_BUYING'], readOnly: false }))
  return { actor, clients: vi.fn(async () => [{ id: clientId, name: 'Permitted client' }]), enabled: vi.fn(() => true), request: vi.fn(async () => ({ mode: 'read_only', answer: 'Bounded review' })) }
}
describe('native specialist adapters', () => {
  it('lists only permitted enabled agents without executing them', async () => {
    const deps = dependencies()
    const tools = await buildNativeSpecialistTools(ctx, deps)
    expect(tools.map(t => t.name)).toEqual(['get_agent_clients', 'ask_spend_controller', 'ask_publishing_planner'])
    expect(tools.some(t => t.name === 'ask_financial_watch')).toBe(false)
    expect(deps.request).not.toHaveBeenCalled()
  })
  it('uses the existing actor-authenticated bounded route and forces spend read-only', async () => {
    const deps = dependencies()
    const tool = (await buildNativeSpecialistTools(ctx, deps)).find(t => t.name === 'ask_spend_controller')!
    expect((await tool.handler({ prompt: 'Review budget', clientId }, ctx)).ok).toBe(true)
    expect(deps.request).toHaveBeenCalledWith('/api/agency/agents/spend-controller/ask', { method: 'POST', body: { prompt: 'Review budget', context: { clientId }, draftActions: false }, timeout: 15000 }, ctx)
  })
  it('fails on role revocation, disabled flags, mismatched client or forged arguments before dispatch', async () => {
    for (const kind of ['revoked', 'disabled', 'client', 'forged'] as const) {
      const deps = dependencies()
      const tool = (await buildNativeSpecialistTools(ctx, deps)).find(t => t.name === 'ask_spend_controller')!
      if (kind === 'revoked') deps.actor.mockResolvedValue({ ...(await deps.actor()), permissionGroups: [] })
      if (kind === 'disabled') deps.enabled.mockReturnValue(false)
      if (kind === 'client') deps.clients.mockResolvedValue([])
      const r = await tool.handler({ prompt: 'Review', clientId, ...(kind === 'forged' ? { draftActions: true, tenantId: 'other' } : {}) }, ctx)
      expect(r.ok).toBe(false)
      expect(deps.request).not.toHaveBeenCalled()
    }
  })
  it('rejects parent-client mismatch and non-chat actors', async () => {
    const deps = dependencies()
    expect(await buildNativeSpecialistTools({ ...ctx, source: 'mcp' }, deps)).toEqual([])
    const scoped = { ...ctx, clientScope: '22222222-2222-4222-8222-222222222222' }
    const tool = (await buildNativeSpecialistTools(scoped, deps)).find(t => t.name === 'ask_spend_controller')!
    expect((await tool.handler({ prompt: 'Review', clientId }, scoped)).ok).toBe(false)
    expect(deps.request).not.toHaveBeenCalled()
  })
})
