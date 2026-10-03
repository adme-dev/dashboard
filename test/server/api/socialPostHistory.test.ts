import { beforeEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ access: vi.fn(), rows: vi.fn() }))
vi.mock('~~/server/utils/socialPublishing/guards', () => ({ requireSocialPostClientAccess: m.access }))
vi.mock('~~/server/utils/db', () => ({ queryRows: m.rows }))
vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('getRouterParam', () => 'post')
vi.stubGlobal('getQuery', (e: { query: unknown }) => e.query)
vi.stubGlobal('createError', (e: { statusMessage: string }) => new Error(e.statusMessage))
const { default: handler } = await import('../../../server/api/agency/social/publishing/posts/[id]/history.get')
const invoke = (offset: unknown = 0) => handler({ query: { offset } } as never)
beforeEach(() => { vi.resetAllMocks(); m.access.mockResolvedValue({ client_id: 'client' }); m.rows.mockResolvedValue([]) })
describe('publishing archive', () => {
  it('authorizes before querying history', async () => {
    m.access.mockRejectedValue(new Error('Forbidden'))
    await expect(invoke()).rejects.toThrow('Forbidden')
    expect(m.rows).not.toHaveBeenCalled()
  })
  it('scopes events and account names to the post client', async () => {
    await invoke()
    expect(m.rows.mock.calls[0][0]).toContain('e.post_id = $1 AND e.client_id = $2')
    expect(m.rows.mock.calls[0][0]).toContain('a.client_id = e.client_id')
    expect(m.rows.mock.calls[0][1]).toEqual(['post', 'client', 0])
  })
  it('paginates without losing the last returned event', async () => {
    m.rows.mockResolvedValue(Array.from({ length: 51 }, (_, id) => ({ id })))
    const result = await invoke(50)
    expect(result.events).toHaveLength(50)
    expect(result.nextOffset).toBe(100)
  })
  it.each([-1, 0.5, 'invalid', 100001])('rejects invalid offset %s', async offset => {
    await expect(invoke(offset)).rejects.toThrow('Invalid history offset')
    expect(m.rows).not.toHaveBeenCalled()
  })
  it('ends pagination for a short page', async () => {
    expect(await invoke()).toEqual({ events: [], nextOffset: null })
  })
})
