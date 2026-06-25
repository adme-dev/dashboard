import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent { body?: any; context?: any }
const g = globalThis as any
g.defineEventHandler = (fn: any) => fn
g.readBody = async (event: TestEvent) => event.body ?? {}
g.createError = (input: any) => Object.assign(new Error(input.statusMessage), input)
g.setResponseStatus = vi.fn()

const mockRequireWriteAccess = vi.fn()
vi.mock('~~/server/utils/auth', () => ({
  requireWriteAccess: (...args: unknown[]) => mockRequireWriteAccess(...args),
}))

const mockLoadBlocklist = vi.fn()
const mockGuardAudioPrompt = vi.fn()
vi.mock('~~/server/utils/audio/musicGuard', () => ({
  loadBlocklist: (...args: unknown[]) => mockLoadBlocklist(...args),
  guardAudioPrompt: (...args: unknown[]) => mockGuardAudioPrompt(...args),
}))

const mockCreateMusicAsset = vi.fn()
const mockGetMusicAssetByIdempotencyKey = vi.fn()
const mockRequeueFailedMusicAsset = vi.fn()
vi.mock('~~/server/utils/audio/assets', () => ({
  createMusicAsset: (...args: unknown[]) => mockCreateMusicAsset(...args),
  getMusicAssetByIdempotencyKey: (...args: unknown[]) => mockGetMusicAssetByIdempotencyKey(...args),
  requeueFailedMusicAsset: (...args: unknown[]) => mockRequeueFailedMusicAsset(...args),
}))

const mockQueueSend = vi.fn()
const mockGetMusicQueue = vi.fn()
const mockMusicIdempotencyKey = vi.fn()
vi.mock('~~/server/utils/audio/musicJob', () => ({
  getMusicQueue: (...args: unknown[]) => mockGetMusicQueue(...args),
  musicIdempotencyKey: (...args: unknown[]) => mockMusicIdempotencyKey(...args),
}))

const mockRecordAiInvocation = vi.fn()
vi.mock('~~/server/utils/ai/invocationLedger', () => ({
  recordAiInvocation: (...args: unknown[]) => mockRecordAiInvocation(...args),
}))

const { default: handler } = await import('~~/server/api/agency/audio/music/generate.post')

describe('POST /agency/audio/music/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireWriteAccess.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000001' })
    mockLoadBlocklist.mockResolvedValue([])
    mockGuardAudioPrompt.mockReturnValue({ safe: true, violations: [] })
    mockGetMusicQueue.mockReturnValue({ send: mockQueueSend })
    mockMusicIdempotencyKey.mockReturnValue('music-idem-1')
    mockCreateMusicAsset.mockResolvedValue({
      id: 'asset-1',
      status: 'queued',
      kind: 'music',
    })
  })

  it('queues a music job and records the Workers AI model request', async () => {
    const body = {
      prompt: 'bright upbeat dealership jingle, no vocals',
      clientId: '00000000-0000-4000-8000-000000000010',
      isInstrumental: true,
      format: 'mp3',
      channels: ['radio', 'meta'],
    }

    const res = await handler({ body, context: { cloudflare: { env: { CACHE: {} } } } } as any)

    expect(mockQueueSend).toHaveBeenCalledWith({
      assetId: 'asset-1',
      prompt: body.prompt,
      isInstrumental: true,
      lyrics: null,
      format: 'mp3',
      idempotencyKey: 'music-idem-1',
    })
    expect(mockRecordAiInvocation).toHaveBeenCalledWith(expect.objectContaining({
      featureKey: 'audio_music_generation',
      provider: 'workers_ai',
      modelId: 'minimax/music-2.6',
      gatewayUsed: true,
      userId: '00000000-0000-4000-8000-000000000001',
      clientId: '00000000-0000-4000-8000-000000000010',
      status: 'success',
      metadata: expect.objectContaining({
        assetId: 'asset-1',
        queued: true,
        format: 'mp3',
        channels: ['radio', 'meta'],
        isInstrumental: true,
        hasLyrics: false,
      }),
    }))
    expect(g.setResponseStatus).toHaveBeenCalledWith(expect.anything(), 202)
    expect(res.asset.id).toBe('asset-1')
  })
})
