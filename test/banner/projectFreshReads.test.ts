import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), fresh: vi.fn(), rows: vi.fn(), access: vi.fn(), all: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: mocks.auth }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: mocks.fresh, queryRowsFresh: mocks.rows }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ requireSocialClientAccess: mocks.access, hasAllSocialClientAccess: mocks.all }))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('getRouterParam', (event: { id: string }) => event.id)
vi.stubGlobal('getQuery', (event: { query: unknown }) => event.query)
const setHeader = vi.fn()
vi.stubGlobal('setHeader', setHeader)
const project = (await import('~~/server/api/agency/banner-studio/projects/[id].get')).default
const jobs = (await import('~~/server/api/agency/banner-studio/export-video/jobs.get')).default
beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ id: 'user' })
  mocks.rows.mockResolvedValue([])
  mocks.all.mockReturnValue(false)
})
describe('fresh banner reads', () => {
  it('returns newly saved project copy immediately and disables response caching', async () => {
    mocks.fresh.mockResolvedValueOnce({ id: 'project', name: 'Before' }).mockResolvedValueOnce({ id: 'project', name: 'After' })
    expect(await project({ id: 'project' } as unknown as H3Event)).toMatchObject({ name: 'Before' })
    expect(await project({ id: 'project' } as unknown as H3Event)).toMatchObject({ name: 'After' })
    expect(setHeader).toHaveBeenCalledWith(expect.anything(), 'Cache-Control', 'private, no-store')
  })
  it('authorizes the persisted project client before reading durable jobs', async () => {
    mocks.fresh.mockResolvedValue({ client_id: 'real-client' })
    await jobs({ query: { projectId: 'project', clientId: 'forged-client' } } as unknown as H3Event)
    expect(mocks.access).toHaveBeenCalledWith(expect.anything(), 'real-client')
    expect(mocks.rows).toHaveBeenCalledWith(expect.stringContaining('status NOT IN (\'done\', \'failed\')'), ['project'])
    mocks.access.mockRejectedValueOnce(Object.assign(new Error('forbidden'), { statusCode: 403 }))
    mocks.rows.mockClear()
    await expect(jobs({ query: { projectId: 'project' } } as unknown as H3Event)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.rows).not.toHaveBeenCalled()
  })
  it('allows the owner of an unassigned project and rejects other staff', async () => {
    mocks.fresh.mockResolvedValue({ client_id: null, created_by: 'user' })
    await expect(jobs({ query: { projectId: 'project' } } as unknown as H3Event)).resolves.toEqual({ jobs: [] })
    mocks.fresh.mockResolvedValue({ client_id: null, created_by: 'someone-else' })
    await expect(jobs({ query: { projectId: 'project' } } as unknown as H3Event)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('authorizes ID polling against the stored project and returns the protected download URL', async () => {
    mocks.rows.mockResolvedValue([{ id: 'job', project_id: 'project', client_id: 'real-client', status: 'done', format_key: 'fb_sq' }])
    const response = await jobs({ query: { ids: 'job' } } as unknown as H3Event)
    expect(mocks.access).toHaveBeenCalledWith(expect.anything(), 'real-client')
    expect(response.jobs[0]?.url).toBe('/api/agency/banner-studio/export-video/jobs/job/download')
  })
})
