import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  params?: Record<string, string>
  headers?: Record<string, string>
  context?: Record<string, unknown>
}
const mockReadMultipart = vi.fn()
const mockSetResponseStatus = vi.fn()
const g = globalThis as unknown as Record<string, unknown>
g.defineEventHandler = (fn: unknown) => fn
g.getRouterParam = (event: TestEvent, name: string) => event.params?.[name]
g.getHeader = (event: TestEvent, name: string) => event.headers?.[name.toLowerCase()]
g.setResponseStatus = (...args: unknown[]) => mockSetResponseStatus(...args)
g.readMultipartFormData = (...args: unknown[]) => mockReadMultipart(...args)
g.createError = (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)

const actor = { id: 'staff-1', role: 'member' }
vi.mock('~~/server/utils/auth', () => ({ requireWriteAccess: vi.fn(async () => actor) }))
const mockGetProject = vi.fn()
const mockAssertAccess = vi.fn()
vi.mock('~~/server/utils/audio/projects', () => ({
  getProjectWithCurrentTimeline: (...a: unknown[]) => mockGetProject(...a),
  assertMediaProjectAccess: (...a: unknown[]) => mockAssertAccess(...a)
}))
vi.mock('~~/server/utils/audio/godModeExternalMutations', () => ({
  executeGodModeMediaUpload: async (_event: unknown, work: (run: unknown) => Promise<unknown>) => work({ ids: ['00000000-0000-4000-8000-0000000000bb'], markDispatched: vi.fn(async () => {}), replay: false, replayResult: null })
}))
vi.mock('~~/server/utils/audio/assets', () => ({ mapRow: (row: Record<string, unknown>) => ({ id: row.id }), streamUrlFor: async () => undefined }))
const mockImport = vi.fn()
vi.mock('~~/server/utils/audio/importAudio', () => ({
  INSERT_IMPORTED_AUDIO_ASSET_SQL: 'INSERT',
  MAX_IMPORT_REQUEST_BYTES: 1000,
  importAudioAsset: (...a: unknown[]) => mockImport(...a)
}))
vi.mock('~~/server/utils/storage', () => ({ deleteFile: vi.fn(), getFileMetadata: vi.fn(), uploadFile: vi.fn() }))
vi.mock('~~/server/utils/video-storyboard/mediaProbe', () => ({ probeStoryboardMedia: vi.fn() }))
vi.mock('~~/server/utils/video-storyboard/request', () => ({ storyboardRequestDependencies: () => ({ bucket: undefined }) }))
vi.mock('~~/server/utils/db', () => ({ queryOne: vi.fn() }))

const { default: handler } = await import('../../server/api/agency/audio/projects/[id]/import-audio.post')

const clientId = '11111111-1111-4111-8111-111111111111'
const event = (headers: Record<string, string>): TestEvent => ({ params: { id: 'p1' }, headers, context: {} })
const form = [
  { name: 'file', filename: 'tone.wav', type: 'audio/wav', data: Buffer.from('RIFF0000WAVE') },
  { name: 'role', data: Buffer.from('music') },
  { name: 'rightsConfirmed', data: Buffer.from('true') }
]

describe('POST /agency/audio/projects/:id/import-audio', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetProject.mockResolvedValue({ project: { id: 'p1', clientId, mediaType: 'av' } })
    mockReadMultipart.mockResolvedValue(form)
    mockImport.mockResolvedValue({ row: { id: 'asset-1' }, replayed: false })
  })
  it('refuses unsized or oversized bodies before buffering them', async () => {
    await expect(handler(event({ 'idempotency-key': 'import-key-1' }) as never)).rejects.toMatchObject({ statusCode: 411 })
    await expect(handler(event({ 'content-length': '1001', 'idempotency-key': 'import-key-1' }) as never)).rejects.toMatchObject({ statusCode: 413 })
    expect(mockReadMultipart).not.toHaveBeenCalled()
  })
  it('checks project access and inherits the project client scope', async () => {
    const res = await handler(event({ 'content-length': '500', 'idempotency-key': 'import-key-1' }) as never)
    expect(mockAssertAccess).toHaveBeenCalledWith(actor, expect.objectContaining({ id: 'p1' }))
    expect(mockImport).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'p1', projectClientId: clientId, actorId: 'staff-1', role: 'music', rightsConfirmed: true,
      idempotencyKey: 'import-key-1', assetId: '00000000-0000-4000-8000-0000000000bb', declaredType: 'audio/wav'
    }), expect.objectContaining({ onStored: expect.any(Function), remove: expect.any(Function) }))
    expect(res).toEqual({ asset: { id: 'asset-1' }, replayed: false })
    expect(mockSetResponseStatus).toHaveBeenCalledWith(expect.anything(), 201)
  })
  it('stops when project access is denied or the project is not AV', async () => {
    mockAssertAccess.mockImplementationOnce(() => {
      throw Object.assign(new Error('Forbidden'), { statusCode: 403 })
    })
    await expect(handler(event({ 'content-length': '500', 'idempotency-key': 'import-key-1' }) as never)).rejects.toMatchObject({ statusCode: 403 })
    mockGetProject.mockResolvedValueOnce({ project: { id: 'p1', clientId, mediaType: 'audio' } })
    await expect(handler(event({ 'content-length': '500', 'idempotency-key': 'import-key-1' }) as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mockImport).not.toHaveBeenCalled()
  })
  it('answers a replay with 200', async () => {
    mockImport.mockResolvedValueOnce({ row: { id: 'asset-1' }, replayed: true })
    await handler(event({ 'content-length': '500', 'idempotency-key': 'import-key-1' }) as never)
    expect(mockSetResponseStatus).toHaveBeenCalledWith(expect.anything(), 200)
  })
})
