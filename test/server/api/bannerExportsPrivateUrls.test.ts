import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = { query?: Record<string, string> }
type TestHandler = (event: TestEvent) => unknown
type TestGlobals = typeof globalThis & {
  defineEventHandler: (handler: TestHandler) => TestHandler
  getQuery: (event: TestEvent) => Record<string, string>
  createError: (input: { statusMessage: string, statusCode?: number }) => Error
}

const g = globalThis as TestGlobals
g.defineEventHandler = handler => handler
g.getQuery = event => event.query ?? {}
g.createError = input => Object.assign(new Error(input.statusMessage), input)

const requireAuth = vi.fn()
const queryRowsFresh = vi.fn()
const queryRowsCached = vi.fn()
const queryOneFresh = vi.fn()
const clientAccess = vi.fn()
const allClientAccess = vi.fn()
vi.mock('~~/server/utils/social/clientAccess', () => ({
  requireSocialClientAccess: (...args: unknown[]) => clientAccess(...args),
  hasAllSocialClientAccess: (...args: unknown[]) => allClientAccess(...args)
}))

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => requireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => queryRowsCached(...args),
  queryRowsFresh: (...args: unknown[]) => queryRowsFresh(...args),
  queryOneFresh: (...args: unknown[]) => queryOneFresh(...args)
}))

const { default: handler } = await import('~~/server/api/agency/banner-studio/exports/index.get')

beforeEach(() => {
  vi.clearAllMocks()
  requireAuth.mockResolvedValue({ id: 'user-1' })
  queryOneFresh.mockReset().mockResolvedValue({ client_id: null, created_by: 'user-1' })
  queryRowsFresh.mockReset().mockResolvedValue([])
  queryRowsCached.mockReset().mockResolvedValue([])
  clientAccess.mockReset().mockResolvedValue({ id: 'user-1' })
  allClientAccess.mockReset().mockReturnValue(false)
})

describe('GET /agency/banner-studio/exports', () => {
  it('shows a newly completed export even when the cached list remains empty', async () => {
    const event = { query: { projectId: 'project-1' } }
    await expect(handler(event)).resolves.toEqual([])
    const completed = {
      id: 'new-export', projectId: 'project-1', formatKey: 'mrec', r2Key: 'private.png',
      url: '/api/agency/banner-studio/exports/new-export/download', fileSize: 100,
      exportedBy: 'user-1', exportedAt: '2026-10-28', exportType: 'png', renderJobId: null
    }
    queryRowsFresh.mockResolvedValueOnce([completed])
    await expect(handler(event)).resolves.toEqual([completed])
    expect(queryRowsCached).not.toHaveBeenCalled()
  })

  it('denies foreign-client exports before reading export rows', async () => {
    queryOneFresh.mockResolvedValue({ client_id: 'foreign-client', created_by: 'user-1' })
    clientAccess.mockRejectedValueOnce(Object.assign(new Error('forbidden'), { statusCode: 403 }))
    await expect(handler({ query: { projectId: 'project-1' } })).rejects.toMatchObject({ statusCode: 403 })
    expect(clientAccess).toHaveBeenCalledWith(expect.anything(), 'foreign-client')
    expect(queryRowsFresh).not.toHaveBeenCalled()
  })

  it('allows assigned-client access and agency creator or all-client access only', async () => {
    queryOneFresh.mockResolvedValueOnce({ client_id: 'assigned-client', created_by: 'other' })
    await expect(handler({ query: { projectId: 'project-1' } })).resolves.toEqual([])
    expect(clientAccess).toHaveBeenCalledWith(expect.anything(), 'assigned-client')
    queryOneFresh.mockResolvedValue({ client_id: null, created_by: 'other' })
    await expect(handler({ query: { projectId: 'project-1' } })).rejects.toMatchObject({ statusCode: 403 })
    allClientAccess.mockReturnValue(true)
    await expect(handler({ query: { projectId: 'project-1' } })).resolves.toEqual([])
  })

  it('returns 404 for a missing project without reading exports', async () => {
    queryOneFresh.mockResolvedValue(null)
    await expect(handler({ query: { projectId: 'missing' } })).rejects.toMatchObject({ statusCode: 404 })
    expect(queryRowsFresh).not.toHaveBeenCalled()
  })
  it('projects MP4 rows to a private render-job URL while preserving non-MP4 URLs', async () => {
    queryRowsFresh.mockResolvedValueOnce([
      {
        id: 'export-mp4', projectId: 'project-1', formatKey: 'mrec', r2Key: 'banner-videos/project-1/job-1.mp4',
        url: 'https://pub-old.r2.dev/leaked.mp4', fileSize: 10, exportedBy: 'user-1', exportedAt: '2026-08-06',
        exportType: 'mp4', renderJobId: '11111111-1111-4111-8111-111111111111'
      },
      {
        id: 'export-html', projectId: 'project-1', formatKey: 'mrec', r2Key: 'banner-exports/project-1/export.zip',
        url: 'https://files.example/export.zip', fileSize: 20, exportedBy: 'user-1', exportedAt: '2026-08-06',
        exportType: 'html5', renderJobId: null
      }
    ])

    await expect(handler({ query: { projectId: 'project-1' } } as TestEvent)).resolves.toEqual([
      {
        id: 'export-mp4', projectId: 'project-1', formatKey: 'mrec', r2Key: 'banner-videos/project-1/job-1.mp4',
        url: '/api/agency/banner-studio/export-video/jobs/11111111-1111-4111-8111-111111111111/download',
        fileSize: 10, exportedBy: 'user-1', exportedAt: '2026-08-06', exportType: 'mp4', renderJobId: '11111111-1111-4111-8111-111111111111'
      },
      {
        id: 'export-html', projectId: 'project-1', formatKey: 'mrec', r2Key: 'banner-exports/project-1/export.zip',
        url: 'https://files.example/export.zip', fileSize: 20, exportedBy: 'user-1', exportedAt: '2026-08-06', exportType: 'html5', renderJobId: null
      }
    ])
    expect(queryRowsFresh.mock.calls[0]?.[0]).toMatch(/LEFT JOIN banner_render_jobs j ON j\.export_id = e\.id AND j\.status = 'done'/)
  })

  it('returns no URL for an orphaned MP4 export instead of exposing its persisted public URL', async () => {
    queryRowsFresh.mockResolvedValueOnce([{
      id: 'export-mp4', projectId: 'project-1', formatKey: 'mrec', r2Key: 'banner-videos/project-1/job-1.mp4',
      url: 'https://pub-old.r2.dev/leaked.mp4', fileSize: 10, exportedBy: 'user-1', exportedAt: '2026-08-06',
      exportType: 'mp4', renderJobId: null
    }])

    const result = await handler({ query: { projectId: 'project-1' } } as TestEvent)

    expect(result[0].url).toBeNull()
  })
})
