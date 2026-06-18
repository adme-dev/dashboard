import { beforeEach, describe, expect, it, vi } from 'vitest'

const g = globalThis as any
g.defineEventHandler = (fn: any) => fn
g.readMultipartFormData = async (event: any) => event.form ?? []
g.createError = (input: any) => Object.assign(new Error(input.statusMessage), input)
g.setResponseStatus = vi.fn()

const mockRequireWriteAccess = vi.fn()
vi.mock('~~/server/utils/auth', () => ({
  requireWriteAccess: (...args: unknown[]) => mockRequireWriteAccess(...args),
}))

const mockGetProject = vi.fn()
vi.mock('~~/server/utils/audio/projects', () => ({
  getProjectWithCurrentTimeline: (...args: unknown[]) => mockGetProject(...args),
}))

const mockUploadFile = vi.fn()
vi.mock('~~/server/utils/storage', () => ({
  uploadFile: (...args: unknown[]) => mockUploadFile(...args),
  validateFileType: vi.fn(() => true),
  validateFileSize: vi.fn(() => true),
  getMaxFileSize: vi.fn(() => 10 * 1024 * 1024),
}))

const mockCreateSourceAsset = vi.fn()
vi.mock('~~/server/utils/video-generation/sourceAssetStore', () => ({
  createSourceAsset: (...args: unknown[]) => mockCreateSourceAsset(...args),
}))

const { default: handler } = await import('../../server/api/agency/video/generation/source-assets.post')

const projectId = '00000000-0000-4000-8000-000000000333'

function field(name: string, value: string) {
  return { name, data: new TextEncoder().encode(value) }
}

function file(name = 'still.png', type = 'image/png') {
  return { name: 'file', filename: name, type, data: new Uint8Array([1, 2, 3]) }
}

function form(overrides: any[] = []) {
  return [
    file(),
    field('projectId', projectId),
    field('subjectType', 'vehicle'),
    ...overrides,
  ]
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.VIDEO_GENERATION_ENABLED = 'true'
  mockRequireWriteAccess.mockResolvedValue({ id: 'user-1', role: 'editor' })
  mockGetProject.mockResolvedValue({
    project: { id: projectId, clientId: 'dealer-1', createdBy: 'user-1', mediaType: 'av' },
    timeline: null,
  })
  mockCreateSourceAsset.mockResolvedValue({ id: 'src-1', status: 'approved' })
})

describe('POST /agency/video/generation/source-assets', () => {
  it('uploads a source image scoped to the verified project client', async () => {
    const res = await handler({ form: form() } as any)

    expect(mockGetProject).toHaveBeenCalledWith(projectId)
    expect(mockUploadFile.mock.calls[0]![1]).toMatch(/^video-gen-sources\/dealer-1\/.+\.png$/)
    expect(mockCreateSourceAsset).toHaveBeenCalledWith(expect.objectContaining({
      clientId: 'dealer-1',
      createdBy: 'user-1',
      contentType: 'image/png',
      subjectType: 'vehicle',
    }))
    expect(g.setResponseStatus).toHaveBeenCalledWith(expect.anything(), 201)
    expect(res).toEqual({ id: 'src-1', status: 'approved' })
  })

  it('rejects uploads without a valid project id', async () => {
    await expect(handler({ form: [file(), field('projectId', 'bad-id')] } as any)).rejects.toMatchObject({ statusCode: 400 })
    expect(mockGetProject).not.toHaveBeenCalled()
    expect(mockUploadFile).not.toHaveBeenCalled()
  })

  it('forbids non-admin users from uploading sources to another user project', async () => {
    mockGetProject.mockResolvedValueOnce({
      project: { id: projectId, clientId: 'dealer-1', createdBy: 'user-2', mediaType: 'av' },
      timeline: null,
    })

    await expect(handler({ form: form() } as any)).rejects.toMatchObject({ statusCode: 403 })
    expect(mockUploadFile).not.toHaveBeenCalled()
    expect(mockCreateSourceAsset).not.toHaveBeenCalled()
  })

  it('allows owner roles to upload sources to accessible agency projects', async () => {
    mockRequireWriteAccess.mockResolvedValueOnce({ id: 'owner-1', role: 'owner' })
    mockGetProject.mockResolvedValueOnce({
      project: { id: projectId, clientId: 'dealer-1', createdBy: 'user-2', mediaType: 'av' },
      timeline: null,
    })

    const res = await handler({ form: form() } as any)

    expect(res).toEqual({ id: 'src-1', status: 'approved' })
    expect(mockCreateSourceAsset).toHaveBeenCalled()
  })

  it('rejects invalid subject types', async () => {
    await expect(handler({ form: [file(), field('projectId', projectId), field('subjectType', 'other')] } as any)).rejects.toMatchObject({ statusCode: 400 })
    expect(mockUploadFile).not.toHaveBeenCalled()
  })
})
