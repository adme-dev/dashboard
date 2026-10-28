/* eslint-disable @stylistic/max-statements-per-line -- Compact fixture setup keeps paired state changes together. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import { requireMarketingDepartment } from '~~/server/utils/ai/marketing/departmentAuthority'

const fresh = vi.hoisted(() => vi.fn())
vi.mock('~~/server/utils/ai/mcp/staffAuthority', () => ({ resolveMcpStaffContext: fresh }))
const ctx = (): ToolContext => ({
  userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', userRole: 'media_buyer',
  event: {} as ToolContext['event'], source: 'mcp', mcpScopes: ['mcp:read', 'mcp:write'],
  permissionGroups: ['MARKETING_MANAGEMENT'], marketingCapabilities: ['department_management'],
  mcpStaffAuthority: 'fresh', assistantReadOnly: false,
  assistantScope: { clientAccessMode: 'all_active', assignedClientIds: [], departmentIds: [], catalogReleaseIds: [] }
})
beforeEach(() => { fresh.mockReset(); fresh.mockResolvedValue(ctx()) })
describe('marketing department service authority', () => {
  it('refreshes authority and retains client and signed consent restrictions', async () => {
    const input = { ...ctx(), clientScope: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }
    const result = await requireMarketingDepartment(input, true)
    expect(fresh).toHaveBeenCalledWith(input.event, input.userId, input.mcpScopes)
    expect(result.clientScope).toBe(input.clientScope)
  })
  it.each([
    { permissionGroups: ['ADMIN'] },
    { marketingCapabilities: [] },
    { mcpStaffAuthority: undefined }
  ])('rejects fresh authority loss: %j', async (change) => {
    fresh.mockResolvedValue({ ...ctx(), ...change })
    await expect(requireMarketingDepartment(ctx())).rejects.toMatchObject({ statusCode: 403 })
  })
  it('rejects writes with read-only OAuth or role even when the previous context was writable', async () => {
    await expect(requireMarketingDepartment({ ...ctx(), mcpScopes: ['mcp:read'] }, true)).rejects.toMatchObject({ statusCode: 403 })
    fresh.mockResolvedValue({ ...ctx(), assistantReadOnly: true })
    await expect(requireMarketingDepartment(ctx(), true)).rejects.toMatchObject({ statusCode: 403 })
    await expect(requireMarketingDepartment(ctx())).resolves.toMatchObject({ assistantReadOnly: true })
  })
  it('does not use a local in-app context to invent MCP consent', async () => {
    await expect(requireMarketingDepartment({ ...ctx(), source: 'chat' }, true)).rejects.toMatchObject({ statusCode: 403 })
    expect(fresh).not.toHaveBeenCalled()
  })
})
