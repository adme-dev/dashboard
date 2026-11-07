import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveNativeMarketingContext, isNativeMarketingContext } from '../../server/utils/ai/marketing/nativeAuthority'
import { evaluateStaffToolAdmission } from '../../server/utils/ai/mcp/marketingPolicy'
import { requireMarketingDepartment } from '../../server/utils/ai/marketing/departmentAuthority'
import type { ToolContext } from '../../server/utils/ai/toolContext'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), fresh: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: mocks.auth }))
vi.mock('~~/server/utils/ai/mcp/staffAuthority', () => ({ resolveMcpStaffContext: mocks.fresh }))
const ctx = { userId: 'actor', userRole: 'media_buyer', source: 'chat', clientScope: 'client-a', event: {} } as ToolContext
beforeEach(() => {
  mocks.auth.mockResolvedValue({ id: 'actor' })
  mocks.fresh.mockResolvedValue({ ...ctx, source: 'mcp', mcpStaffAuthority: 'fresh', permissionGroups: ['MARKETING_MANAGEMENT'], marketingCapabilities: ['department_management'], assistantReadOnly: false, assistantScope: { clientAccessMode: 'all_active', assignedClientIds: [], departmentIds: [], catalogReleaseIds: [] } })
})
describe('native transport authority', () => {
  it('requires actual session identity and never invents OAuth consent', async () => {
    const native = await resolveNativeMarketingContext(ctx)
    expect(native.source).toBe('chat')
    expect(native.mcpScopes).toBeUndefined()
    expect(isNativeMarketingContext(native)).toBe(true)
    expect(isNativeMarketingContext({ ...native })).toBe(false)
    await expect(requireMarketingDepartment(native, true)).resolves.toMatchObject({ source: 'chat', clientScope: 'client-a' })
    mocks.auth.mockResolvedValue({ id: 'different' })
    await expect(resolveNativeMarketingContext(ctx)).rejects.toThrow('Authenticated chat actor')
  })
  it('revocation and read-only role are enforced again at execution', async () => {
    const native = await resolveNativeMarketingContext(ctx)
    mocks.fresh.mockResolvedValue({ ...native, marketingCapabilities: [] })
    await expect(requireMarketingDepartment(native, true)).rejects.toMatchObject({ statusCode: 403 })
    mocks.fresh.mockResolvedValue({ ...native, assistantReadOnly: true })
    await expect(requireMarketingDepartment(native, true)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('same reviewed staff admission requires role and grant, and native writes need no OAuth scope', async () => {
    const native = await resolveNativeMarketingContext(ctx)
    const name = 'marketing_propose_inventory_feed_change'
    expect(evaluateStaffToolAdmission(name, native).allowed).toBe(true)
    expect(evaluateStaffToolAdmission('get_profitability', native).allowed).toBe(false)
    expect(evaluateStaffToolAdmission(name, { ...native, source: 'mcp', mcpScopes: ['mcp:read'] }).allowed).toBe(false)
    mocks.fresh.mockResolvedValue({ ...native, marketingCapabilities: [] })
    expect(evaluateStaffToolAdmission(name, await resolveNativeMarketingContext(ctx)).allowed).toBe(false)
    mocks.fresh.mockResolvedValue({ ...native, permissionGroups: ['MEDIA_BUYING'] })
    expect(evaluateStaffToolAdmission(name, await resolveNativeMarketingContext(ctx)).allowed).toBe(false)
  })
  it('unsigned chat context cannot bypass the remote consent boundary', async () => {
    await expect(requireMarketingDepartment(ctx, true)).rejects.toMatchObject({ statusCode: 403 })
  })
})
