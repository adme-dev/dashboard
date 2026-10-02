import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rows: vi.fn(), one: vi.fn(), access: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({
  queryRowsFresh: mocks.rows,
  queryOneFresh: mocks.one,
  queryRows: () => { throw new Error('Cached publishing state must not be read') },
  queryOne: () => { throw new Error('Cached publishing state must not be read') }
}))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('~~/server/utils/social/clientAccess', () => ({
  requireSocialClientAccess: mocks.access,
  requireSocialClientScope: mocks.access
}))
vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('getQuery', () => ({ clientId: 'client-1' }))
vi.stubGlobal('getRouterParam', () => 'post-1')

const { default: approvals } = await import('../../../server/api/agency/social/publishing/approvals/index.get')
const { default: badge } = await import('../../../server/api/agency/social/publishing/approvals/badge.get')
const { default: post } = await import('../../../server/api/agency/social/publishing/posts/[id]/index.get')
const { default: posts } = await import('../../../server/api/agency/social/publishing/posts/index.get')
const { default: calendar } = await import('../../../server/api/agency/social/publishing/calendar.get')
const invoke = (handler: unknown) => (handler as (event: unknown) => Promise<unknown>)({})

describe('publishing reads after approval or dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rows.mockResolvedValue([])
    mocks.one.mockResolvedValue({ id: 'post-1', client_id: 'client-1', status: 'scheduled', count: 0 })
  })
  it('removes an approved post from the pending queue and badge immediately', async () => {
    expect(await invoke(approvals)).toEqual([])
    expect(await invoke(badge)).toEqual({ count: 0 })
    expect(mocks.access).toHaveBeenCalledWith({}, 'client-1')
  })
  it('loads the saved scheduled state and current calendar without cached draft rows', async () => {
    expect(await invoke(post)).toMatchObject({ status: 'scheduled' })
    expect(await invoke(posts)).toEqual([])
    expect(await invoke(calendar)).toEqual([])
    expect(mocks.rows).toHaveBeenCalledTimes(2)
    expect(mocks.one).toHaveBeenCalledTimes(1)
  })
})
