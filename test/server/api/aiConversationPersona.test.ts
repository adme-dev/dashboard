import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ queryOne: vi.fn(), queryRows: vi.fn() }))
vi.mock('~~/server/utils/db', () => mocks)
vi.mock('~~/server/utils/auth', () => ({ requireAuth: vi.fn(async () => ({ id: 'staff' })) }))
vi.mock('~~/server/utils/ai/pendingActions', () => ({ loadOpenProposal: vi.fn(async () => null) }))

beforeEach(() => {
  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
  vi.stubGlobal('getRouterParam', () => 'conversation')
  vi.stubGlobal('getQuery', () => ({}))
  mocks.queryRows.mockResolvedValue([])
})

afterEach(() => vi.unstubAllGlobals())

describe('conversation focus readback', () => {
  it.each([undefined, null, 'general', 'finance'])('returns stored override %s without inventing General', async (persona) => {
    mocks.queryOne.mockResolvedValue({ id: 'conversation', user_id: 'staff', system_context: { persona } })
    const { default: handler } = await import('../../../server/api/agency/ai/chat/conversations/[id].get')
    const result = await handler({} as Parameters<typeof handler>[0])
    expect(result.persona).toBe(persona ?? null)
  })
})
