import { beforeEach, describe, expect, it, vi } from 'vitest'

const g = globalThis as any
g.defineEventHandler = (fn: any) => fn
g.getQuery = (event: any) => event.query ?? {}
g.createError = (input: any) => Object.assign(new Error(input.statusMessage), input)

const mockRequireWriteAccess = vi.fn()
vi.mock('~~/server/utils/auth', () => ({
  requireWriteAccess: (...args: unknown[]) => mockRequireWriteAccess(...args),
}))

const mockGetProject = vi.fn()
vi.mock('~~/server/utils/audio/projects', () => ({
  getProjectWithCurrentTimeline: (...args: unknown[]) => mockGetProject(...args),
}))

const mockListJobs = vi.fn()
vi.mock('~~/server/utils/video-generation/jobs', () => ({
  listVideoGenerationJobsForProject: (...args: unknown[]) => mockListJobs(...args),
}))

const { default: handler } = await import('../../server/api/agency/video/generation/jobs.get')

const projectId = '00000000-0000-4000-8000-000000000222'

beforeEach(() => {
  vi.clearAllMocks()
  process.env.VIDEO_GENERATION_ENABLED = 'true'
  mockRequireWriteAccess.mockResolvedValue({ id: 'user-1', role: 'editor' })
  mockGetProject.mockResolvedValue({ project: { id: projectId, createdBy: 'user-1', mediaType: 'av' }, timeline: null })
  mockListJobs.mockResolvedValue([{ id: 'job-1' }])
})

describe('GET /agency/video/generation/jobs', () => {
  it('lists jobs for an accessible project', async () => {
    const res = await handler({ query: { projectId } } as any)

    expect(mockGetProject).toHaveBeenCalledWith(projectId)
    expect(mockListJobs).toHaveBeenCalledWith(projectId)
    expect(res).toEqual({ jobs: [{ id: 'job-1' }] })
  })

  it('forbids non-admin users from listing another user project jobs', async () => {
    mockGetProject.mockResolvedValueOnce({ project: { id: projectId, createdBy: 'user-2', mediaType: 'av' }, timeline: null })

    await expect(handler({ query: { projectId } } as any)).rejects.toMatchObject({ statusCode: 403 })
    expect(mockListJobs).not.toHaveBeenCalled()
  })

  it('rejects non-AV projects before listing jobs', async () => {
    mockGetProject.mockResolvedValueOnce({ project: { id: projectId, createdBy: 'user-1', mediaType: 'audio' }, timeline: null })

    await expect(handler({ query: { projectId } } as any)).rejects.toMatchObject({ statusCode: 400 })
    expect(mockListJobs).not.toHaveBeenCalled()
  })

  it('allows owner roles to list accessible agency project jobs', async () => {
    mockRequireWriteAccess.mockResolvedValueOnce({ id: 'owner-1', role: 'owner' })
    mockGetProject.mockResolvedValueOnce({ project: { id: projectId, createdBy: 'user-2', mediaType: 'av' }, timeline: null })

    const res = await handler({ query: { projectId } } as any)

    expect(res).toEqual({ jobs: [{ id: 'job-1' }] })
    expect(mockListJobs).toHaveBeenCalledWith(projectId)
  })

  it('rejects invalid or missing project ids before querying', async () => {
    await expect(handler({ query: { projectId: 'not-a-uuid' } } as any)).rejects.toMatchObject({ statusCode: 400 })

    expect(mockGetProject).not.toHaveBeenCalled()
    expect(mockListJobs).not.toHaveBeenCalled()
  })

  it('404s when generation is disabled', async () => {
    delete process.env.VIDEO_GENERATION_ENABLED

    await expect(handler({ query: { projectId } } as any)).rejects.toMatchObject({ statusCode: 404 })
    expect(mockListJobs).not.toHaveBeenCalled()
  })
})
