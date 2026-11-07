import type { PermissionGroup } from '../../server/utils/permissions'
import type { CatalogRuntimePolicy } from '../../server/utils/ai/governance/catalogComposition'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { nativeConfirmationAllowed } from '../../server/utils/ai/marketing/nativeConfirmationPolicy'
import { resolveCatalogRuntimePolicy } from '../../server/utils/ai/governance/catalogComposition'
import type { ToolContext } from '../../server/utils/ai/toolContext'

const fixtures = vi.hoisted(() => ({ context: vi.fn(), conversation: vi.fn(), runtime: vi.fn() }))
vi.mock('~~/server/utils/ai/chatRuntime', () => ({ resolveChatRuntime: fixtures.runtime }))
vi.mock('~~/server/utils/ai/personalAssistantContext', () => ({ resolvePersonalAssistantContext: fixtures.context }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: fixtures.conversation, queryRows: vi.fn() }))
const ctx = { userId: 'actor', userRole: 'media_buyer', source: 'chat', conversationId: 'conversation', event: {} } as ToolContext
const tool = { name: 'marketing_propose_inventory_feed_change', description: 'Existing reviewed mutation', parameters: z.object({}), mutates: true, requiredPermission: 'MARKETING_MANAGEMENT' as const, handler: vi.fn() }
let context: { permissionGroups: PermissionGroup[], isReadOnly: boolean, catalogRows: [], preferences: { personaKey: string, disabledTools: string[] }, runtimePolicy: CatalogRuntimePolicy }
beforeEach(() => {
  fixtures.runtime.mockReturnValue({ toolsEnabled: true, source: 'binding' })
  context = { permissionGroups: ['MARKETING_MANAGEMENT'], isReadOnly: false, catalogRows: [], preferences: { personaKey: 'media_buyer', disabledTools: [] }, runtimePolicy: resolveCatalogRuntimePolicy('legacy') }
  fixtures.context.mockImplementation(async () => context)
  fixtures.conversation.mockResolvedValue({ system_context: {} })
})
describe('confirmation reruns the current native catalog ceiling', () => {
  it('preserves the focused media buyer and marketing catalog under fresh explicit grants', async () => {
    expect(await nativeConfirmationAllowed(tool, ctx)).toBe(true)
    context.preferences.personaKey = 'marketing'
    expect(await nativeConfirmationAllowed(tool, ctx)).toBe(true)
  })
  it('refuses personal disable, read-only, removed role, enforced missing release or narrowed conversation persona', async () => {
    context.preferences.disabledTools = [tool.name]
    expect(await nativeConfirmationAllowed(tool, ctx)).toBe(false)
    context.preferences.disabledTools = []
    context.isReadOnly = true
    expect(await nativeConfirmationAllowed(tool, ctx)).toBe(false)
    context.isReadOnly = false
    context.permissionGroups = []
    expect(await nativeConfirmationAllowed(tool, ctx)).toBe(false)
    context.permissionGroups = ['MARKETING_MANAGEMENT']
    context.runtimePolicy = resolveCatalogRuntimePolicy('enforced')
    expect(await nativeConfirmationAllowed(tool, ctx)).toBe(false)
    context.runtimePolicy = resolveCatalogRuntimePolicy('legacy')
    fixtures.conversation.mockResolvedValue({ system_context: { persona: 'sales' } })
    expect(await nativeConfirmationAllowed(tool, ctx)).toBe(false)
  })
  it('refuses a runtime tool kill switch enabled after proposal creation', async () => {
    fixtures.runtime.mockReturnValue({ toolsEnabled: false, source: 'binding' })
    expect(await nativeConfirmationAllowed(tool, ctx)).toBe(false)
  })
  it('refuses archived, foreign or missing conversations and conversationless confirmation', async () => {
    fixtures.conversation.mockResolvedValue(null)
    expect(await nativeConfirmationAllowed(tool, ctx)).toBe(false)
    expect(await nativeConfirmationAllowed(tool, { ...ctx, conversationId: undefined })).toBe(false)
  })
})
