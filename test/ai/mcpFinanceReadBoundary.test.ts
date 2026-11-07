import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import type { AiTool } from '~~/server/utils/ai/toolRegistry'
import { executeReadOnlyTool, runReadToolHandler } from '~~/server/utils/ai/mcp/project'

const finance = vi.hoisted(() => vi.fn())
vi.mock('~~/server/utils/financeAccess', () => ({ assertFinancePermission: finance }))
const handler = vi.fn(async () => ({ ok: true as const, data: { total: 10 } }))
const tool: AiTool<unknown> = { name: 'financial_read', description: 'Financial read', requiredPermission: 'FINANCE', parameters: z.object({}), handler }
const ctx = { userId: 'user-id', userRole: 'owner', permissionGroups: ['FINANCE'], event: { context: {} } } as unknown as ToolContext
beforeEach(() => {
  vi.clearAllMocks()
  finance.mockResolvedValue(undefined)
})
describe('non-God MCP financial read boundary', () => {
  it.each([403, 503])('rejects stale/unseeded fallback Finance authority or lookup outage %s before executing', async (statusCode) => {
    finance.mockRejectedValue({ statusCode, message: 'private credentials' })
    for (const run of [() => executeReadOnlyTool([tool], tool.name, {}, ctx), () => runReadToolHandler(tool, {}, ctx)]) {
      const result = await run()
      expect(result).toMatchObject({ ok: false })
      expect(JSON.stringify(result)).not.toContain('private credentials')
    }
    expect(finance).toHaveBeenCalledWith(ctx.event, ctx.userId)
    expect(handler).not.toHaveBeenCalled()
  })
  it('requires request identity even if a context claims Finance', async () => {
    expect(await runReadToolHandler(tool, {}, { ...ctx, event: undefined } as unknown as ToolContext)).toMatchObject({ ok: false })
    expect(handler).not.toHaveBeenCalled()
  })
  it('executes Finance only with fresh explicit grant', async () => {
    expect(await executeReadOnlyTool([tool], tool.name, {}, ctx)).toMatchObject({ ok: true })
    expect(finance).toHaveBeenCalledExactlyOnceWith(ctx.event, ctx.userId)
    expect(handler).toHaveBeenCalledOnce()
  })
  it('preserves unrelated marketing reads without requiring Finance', async () => {
    finance.mockRejectedValue({ statusCode: 403 })
    expect(await runReadToolHandler({ ...tool, requiredPermission: 'MEDIA_BUYING' }, {}, ctx)).toMatchObject({ ok: true })
    expect(finance).not.toHaveBeenCalled()
  })
})
