import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ one: vi.fn(), access: vi.fn(), resolve: vi.fn(), body: { folderId: null as string | null } }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: mocks.one }))
vi.mock('~~/server/utils/auth', () => ({ requireWriteAccess: async () => ({ id: 'user' }) }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ hasAllSocialClientAccess: () => false, requireSocialClientAccess: mocks.access }))
vi.mock('~~/server/utils/banner/marketingProjectAccess', () => ({ ACTIVE_PROJECT_CLIENT_SQL: 'TRUE', isMarketingPortfolioUser: () => false }))
vi.mock('~~/server/utils/banner/folders', () => ({ resolveBannerFolderId: mocks.resolve }))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('getRouterParam', () => '44444444-4444-4444-8444-444444444444')
vi.stubGlobal('readBody', async () => mocks.body)
vi.stubGlobal('setHeader', vi.fn())
vi.stubGlobal('createError', (options: { statusCode: number, statusMessage: string }) => Object.assign(new Error(options.statusMessage), options))

const { default: move } = await import('../../server/api/agency/banner-studio/projects/[id]/folder.patch')
const project = { client_id: 'client', created_by: 'owner', tags: [], review_status: 'draft' }

beforeEach(() => {
  mocks.one.mockReset()
  mocks.access.mockReset()
  mocks.resolve.mockReset()
  mocks.body = { folderId: null }
})

describe('moving a saved banner', () => {
  it('rejects lost client access before changing placement', async () => {
    mocks.one.mockResolvedValueOnce(project)
    mocks.resolve.mockResolvedValueOnce(null)
    mocks.access.mockRejectedValueOnce(Object.assign(new Error('denied'), { statusCode: 403 }))
    await expect(move({} as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.one).toHaveBeenCalledTimes(1)
  })

  it('moves to Unfiled while binding the write to the checked project state', async () => {
    mocks.one.mockResolvedValueOnce(project).mockResolvedValueOnce({ id: '44444444-4444-4444-8444-444444444444', folderId: null })
    mocks.resolve.mockResolvedValueOnce(null)
    expect(await move({} as never)).toMatchObject({ folderId: null })
    const [sql, params] = mocks.one.mock.calls[1]!
    expect(sql).toContain('SET folder_id = $2::uuid')
    expect(params).toEqual(['44444444-4444-4444-8444-444444444444', null, 'client', 'owner', 'draft'])
  })
})
