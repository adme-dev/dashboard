import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), access: vi.fn(), project: vi.fn(), upload: vi.fn(), asset: vi.fn(), dispatched: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireWriteAccess: mocks.auth }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ requireSocialClientAccess: mocks.access }))
vi.mock('~~/server/utils/audio/projects', () => ({ getProjectWithCurrentTimeline: mocks.project }))
vi.mock('~~/server/utils/video/assets', () => ({ createVideoAsset: mocks.asset }))
vi.mock('~~/server/utils/audio/godModeExternalMutations', () => ({
  executeGodModeMediaUpload: (_event: unknown, work: (run: unknown) => unknown) => work({ ids: ['asset-1'], markDispatched: mocks.dispatched })
}))
vi.mock('~~/server/utils/storage', () => ({
  uploadFile: mocks.upload, isStorageConfigured: () => false,
  generateStorageKey: (_kind: string, name: string) => `media-video/123-${name}`,
  validateFileType: () => true, validateFileSize: () => true, getMaxFileSize: () => 500_000_000
}))
Object.assign(globalThis, {
  defineEventHandler: (handler: unknown) => handler,
  getRouterParam: () => 'project-1',
  readMultipartFormData: (event: { form: unknown }) => Promise.resolve(event.form),
  setResponseStatus: vi.fn(),
  createError: (value: { statusMessage: string }) => Object.assign(new Error(value.statusMessage), value)
})
const upload = (await import('~~/server/api/agency/audio/projects/[id]/upload-media.post')).default
function event(kind = 'footage', metadata = JSON.stringify({ width: 1080, height: 1350, durationSec: 24 })) {
  return { form: [
    { name: 'file', filename: kind === 'footage' ? 'approved.mp4' : 'approved.png', type: kind === 'footage' ? 'video/mp4' : 'image/png', data: new Uint8Array([1, 2]) },
    { name: 'kind', data: new TextEncoder().encode(kind) },
    { name: 'videoMetadata', data: new TextEncoder().encode(metadata) }
  ] } as unknown as Parameters<typeof upload>[0]
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.mockResolvedValue({ id: 'creator', role: 'editor' })
  mocks.access.mockResolvedValue({})
  mocks.project.mockResolvedValue({ project: { id: 'project-1', createdBy: 'creator', clientId: 'client-1', mediaType: 'av' } })
  mocks.asset.mockImplementation(input => Promise.resolve({ ...input, id: 'asset-1' }))
})
describe('imported video library handoff', () => {
  it('registers the original file with its client, project, dimensions and duration', async () => {
    const result = await upload(event())
    expect(result).toMatchObject({ assetId: 'asset-1', r2_key: 'media/project-1/footage/123-approved.mp4' })
    expect(mocks.asset).toHaveBeenCalledWith(expect.objectContaining({
      id: 'asset-1', clientId: 'client-1', createdBy: 'creator', sourceProjectId: 'project-1', sourceJobId: null,
      r2Key: result.r2_key, format: '4:5', width: 1080, height: 1350, durationSec: 24
    }))
  })
  it('retains compatibility with uploads without intrinsic metadata', async () => {
    await upload(event('footage', ''))
    expect(mocks.asset).toHaveBeenCalledWith(expect.objectContaining({ format: 'uploaded', width: null, height: null, durationSec: null }))
  })
  it('keeps still images out of the video library', async () => {
    await upload(event('still'))
    expect(mocks.asset).not.toHaveBeenCalled()
  })
  it('rejects malformed metadata before uploading any bytes', async () => {
    await expect(upload(event('footage', JSON.stringify({ width: -1, height: 1350, durationSec: 24 })))).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.upload).not.toHaveBeenCalled()
  })
  it('rejects another producer’s project before uploading', async () => {
    mocks.project.mockResolvedValue({ project: { createdBy: 'other', clientId: 'client-1', mediaType: 'av' } })
    await expect(upload(event())).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.upload).not.toHaveBeenCalled()
  })
  it('enforces client access before uploading', async () => {
    mocks.access.mockRejectedValue(Object.assign(new Error('denied'), { statusCode: 403 }))
    await expect(upload(event())).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.upload).not.toHaveBeenCalled()
  })
  it('does not register a video against a project reassigned during upload', async () => {
    mocks.project.mockResolvedValueOnce({ project: { id: 'project-1', createdBy: 'creator', clientId: 'client-1', mediaType: 'av' } })
    mocks.project.mockResolvedValueOnce({ project: { id: 'project-1', createdBy: 'creator', clientId: 'client-2', mediaType: 'av' } })
    await expect(upload(event())).rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.asset).not.toHaveBeenCalled()
  })
})
