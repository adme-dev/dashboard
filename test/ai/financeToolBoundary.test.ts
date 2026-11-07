import { beforeEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { H3Event } from 'h3'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import { resolveGodModeAuthority } from '~~/server/utils/godMode/authority'
import { filterToolsForUser, toSdkTools, type AiTool } from '~~/server/utils/ai/toolRegistry'

const finance = vi.hoisted(() => vi.fn())
vi.mock('~~/server/utils/financeAccess', () => ({ assertFinancePermission: finance }))
const handler = vi.fn(async () => ({ ok: true as const, data: { cash: 99 } }))
const tool: AiTool<unknown> = { name: 'finance_test', description: 'finance', parameters: z.object({}), requiredPermission: 'FINANCE', handler }
beforeEach(() => {
  vi.clearAllMocks()
  finance.mockResolvedValue(undefined)
})
it('does not infer Finance from owner or finance role at discovery', () => {
  expect(filterToolsForUser([tool], 'owner')).toEqual([])
  expect(filterToolsForUser([tool], 'finance')).toEqual([])
  expect(filterToolsForUser([tool], 'custom', ['FINANCE'])).toEqual([tool])
})
it('blocks a stale Finance grant at execution before the handler', async () => {
  finance.mockRejectedValue({ statusCode: 403 })
  const tools = toSdkTools([tool], { userId: 'u', userRole: 'owner', permissionGroups: ['FINANCE'], event: {} } as unknown as ToolContext, 'seed')
  expect(await (tools.finance_test.execute as unknown as (args: unknown, options: unknown) => Promise<unknown>)({}, {})).toMatchObject({ ok: false })
  expect(finance).toHaveBeenCalledWith({}, 'u')
  expect(handler).not.toHaveBeenCalled()
})
it('executes for a current explicit grant', async () => {
  const tools = toSdkTools([tool], { userId: 'u', userRole: 'custom', permissionGroups: ['FINANCE'], event: {} } as unknown as ToolContext, 'seed')
  expect(await (tools.finance_test.execute as unknown as (args: unknown, options: unknown) => Promise<unknown>)({}, {})).toMatchObject({ ok: true })
  expect(finance).toHaveBeenCalledOnce()
})

it('God mode does not disclose accounting tools without the explicit Finance group', async () => {
  const id = '11111111-1111-4111-8111-111111111111'
  const authority = await resolveGodModeAuthority({ context: {} } as unknown as H3Event, id, { queryOneFresh: async () => ({ id }) })
  expect(filterToolsForUser([tool], 'owner', [], false, authority, id)).toEqual([])
  expect(filterToolsForUser([tool], 'owner', ['FINANCE'], false, authority, id)).toEqual([tool])
})
