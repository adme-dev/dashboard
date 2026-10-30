import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ access: vi.fn(), one: vi.fn(), body: { projectId: '44444444-4444-4444-8444-444444444444', expiresInDays: 7 } }))
vi.mock('~~/server/utils/auth', () => ({ requireWriteAccess: async () => ({ id: 'user' }) }))
vi.mock('~~/server/utils/banner/shareAccess', () => ({ requireBannerShareAccess: mocks.access }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: mocks.one }))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('readBody', async () => mocks.body)
vi.stubGlobal('setHeader', vi.fn())
vi.stubGlobal('createError', (options: { statusCode: number, statusMessage: string }) => Object.assign(new Error(options.statusMessage), options))

const { default: createLink } = await import('../../server/api/agency/banner-studio/links/index.post')

beforeEach(() => {
  mocks.access.mockReset()
  mocks.one.mockReset()
  mocks.body = { projectId: '44444444-4444-4444-8444-444444444444', expiresInDays: 7 }
})

describe('client preview link creation', () => {
  it('checks project access before any write', async () => {
    mocks.access.mockRejectedValueOnce(Object.assign(new Error('No access'), { statusCode: 403 }))
    await expect(createLink({} as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.one).not.toHaveBeenCalled()
  })

  it('uses a distinct preview token and binds the write to the checked project state', async () => {
    mocks.access.mockResolvedValueOnce({ client_id: 'client', created_by: 'owner' })
    mocks.one.mockResolvedValueOnce({ id: 'link' })
    expect(await createLink({} as never)).toEqual({ id: 'link' })
    const [sql, params] = mocks.one.mock.calls[0]!
    expect(sql).toContain('client_id IS NOT DISTINCT FROM $5::uuid')
    expect(params[1]).toMatch(/^p_[0-9a-f]{32}$/)
    expect(params.slice(4)).toEqual(['client', 'owner'])
  })
})
