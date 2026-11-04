import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), write: vi.fn(), scope: vi.fn(), rows: vi.fn(), one: vi.fn(), query: vi.fn(), body: vi.fn(), param: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: mocks.auth, requireWriteAccess: mocks.write }))
vi.mock('~~/server/utils/clientScoping', () => ({ getAssignedClientIds: mocks.scope }))
vi.mock('~~/server/utils/db', () => ({ queryRows: mocks.rows, queryOne: mocks.one }))
vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('getQuery', mocks.query)
vi.stubGlobal('readBody', mocks.body)
vi.stubGlobal('getRouterParam', mocks.param)
const client = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const id = '33333333-3333-4333-8333-333333333333'
const input = { client_id: client, token: 'custom_offer', name: 'Offer', preview_value: 'Sample', fallback: 'Ask us' }
const event = {} as H3Event
let list: typeof import('../../../server/api/agency/email/merge-tags/index.get').default
let create: typeof import('../../../server/api/agency/email/merge-tags/index.post').default
let patch: typeof import('../../../server/api/agency/email/merge-tags/[id].patch').default
let remove: typeof import('../../../server/api/agency/email/merge-tags/[id].delete').default
beforeEach(async () => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ id: 'staff', role: 'account_manager' })
  mocks.write.mockResolvedValue({ id: 'staff', role: 'account_manager' })
  mocks.scope.mockResolvedValue([client])
  mocks.query.mockReturnValue({ client_id: client })
  mocks.param.mockReturnValue(id)
  mocks.body.mockResolvedValue(input)
  mocks.rows.mockResolvedValue([])
  mocks.one.mockResolvedValue({ ...input, id })
  list = (await import('../../../server/api/agency/email/merge-tags/index.get')).default
  create = (await import('../../../server/api/agency/email/merge-tags/index.post')).default
  patch = (await import('../../../server/api/agency/email/merge-tags/[id].patch')).default
  remove = (await import('../../../server/api/agency/email/merge-tags/[id].delete')).default
})
describe('authenticated client-scoped definition endpoints', () => {
  it('reads and creates definitions for an assigned client', async () => {
    expect(await list(event)).toEqual({ items: [] })
    expect((await create(event)).item.token).toBe('custom_offer')
    expect(mocks.auth).toHaveBeenCalledWith(event)
    expect(mocks.write).toHaveBeenCalledWith(event)
  })
  it('requires explicit client scope even for agency managers', async () => {
    mocks.auth.mockResolvedValue({ id: 'admin', role: 'admin' })
    mocks.query.mockReturnValue({})
    await expect(list(event)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.rows).not.toHaveBeenCalled()
  })
  it('rejects cross-client reads, creates, updates and deletes before querying definitions', async () => {
    mocks.query.mockReturnValue({ client_id: other })
    mocks.body.mockResolvedValue({ ...input, client_id: other })
    await expect(list(event)).rejects.toMatchObject({ statusCode: 403 })
    await expect(create(event)).rejects.toMatchObject({ statusCode: 403 })
    mocks.body.mockResolvedValue({ fallback: 'Changed' })
    await expect(patch(event)).rejects.toMatchObject({ statusCode: 403 })
    await expect(remove(event)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.rows).not.toHaveBeenCalled()
    expect(mocks.one).not.toHaveBeenCalled()
  })
  it('rejects reserved names and changing client/token identity', async () => {
    mocks.body.mockResolvedValue({ ...input, token: 'email' })
    await expect(create(event)).rejects.toMatchObject({ statusCode: 400 })
    mocks.body.mockResolvedValue({ client_id: other })
    await expect(patch(event)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.one).not.toHaveBeenCalled()
  })
  it('requires write authentication and returns explicit conflict/not-found results', async () => {
    mocks.write.mockRejectedValueOnce(Object.assign(new Error('unauthorized'), { statusCode: 401 }))
    await expect(create(event)).rejects.toMatchObject({ statusCode: 401 })
    mocks.one.mockResolvedValue(null)
    await expect(create(event)).rejects.toMatchObject({ statusCode: 409 })
    mocks.body.mockResolvedValue({ fallback: 'Changed' })
    await expect(patch(event)).rejects.toMatchObject({ statusCode: 404 })
    await expect(remove(event)).rejects.toMatchObject({ statusCode: 404 })
  })
})
