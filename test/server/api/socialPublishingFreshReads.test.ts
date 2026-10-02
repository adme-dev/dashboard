import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rows: vi.fn(), one: vi.fn(), access: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({
  queryRowsFresh: mocks.rows,
  queryOneFresh: mocks.one,
  queryRows: () => { throw new Error('Cached publishing state must not be read') },
  queryOne: () => { throw new Error('Cached publishing state must not be read') }
}))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('~~/server/utils/socialPublishing/plannerGate', () => ({ isPlannerEnabled: () => true }))
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
const { default: campaigns } = await import('../../../server/api/agency/social/publishing/campaigns/index.get')
const { default: board } = await import('../../../server/api/agency/social/publishing/board.get')
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
  it('shows a newly saved campaign immediately instead of a cached empty list', async () => {
    mocks.rows.mockResolvedValue([{ id: 'campaign-1', client_id: 'client-1', name: 'Launch', post_count: 1 }])
    expect(await invoke(campaigns)).toEqual([
      { id: 'campaign-1', client_id: 'client-1', name: 'Launch', post_count: 1 }
    ])
    expect(mocks.access).toHaveBeenCalledWith({}, 'client-1')
  })
  it('shows the saved campaign and published lane without a cached unassigned draft', async () => {
    mocks.rows.mockResolvedValue([{
      id: 'post-1', client_id: 'client-1', status: 'published',
      c_id: 'campaign-1', c_name: 'Launch', c_color: '#d2ff00'
    }])
    expect(await invoke(board)).toMatchObject([{
      id: 'post-1', lane: 'published', needs_attention: false,
      campaign: { id: 'campaign-1', name: 'Launch', color: '#d2ff00' }
    }])
    expect(mocks.access).toHaveBeenCalledWith({}, 'client-1')
  })
  it('rejects campaign and board reads before database access for a denied client', async () => {
    mocks.access.mockRejectedValueOnce(new Error('Client denied'))
    await expect(invoke(campaigns)).rejects.toThrow('Client denied')
    mocks.access.mockRejectedValueOnce(new Error('Client denied'))
    await expect(invoke(board)).rejects.toThrow('Client denied')
    expect(mocks.rows).not.toHaveBeenCalled()
  })
})
