import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createMusicAsset: vi.fn(),
  queueSend: vi.fn(),
  generateVoiceover: vi.fn(),
  createVoiceAsset: vi.fn(),
  generateCreativeImage: vi.fn(),
  uploadBannerAsset: vi.fn(),
  queryOne: vi.fn(),
  runCreativeComplianceCheck: vi.fn()
}))

vi.mock('~~/server/utils/audio/voiceGen', () => ({ generateVoiceover: mocks.generateVoiceover }))
vi.mock('~~/server/utils/audio/assets', () => ({
  createVoiceAsset: mocks.createVoiceAsset,
  createMusicAsset: mocks.createMusicAsset,
  getMusicAssetByIdempotencyKey: vi.fn(async () => null),
  requeueFailedMusicAsset: vi.fn(async () => false),
  getAsset: vi.fn(async () => null)
}))
vi.mock('~~/server/utils/audio/musicGuard', () => ({
  loadBlocklist: vi.fn(async () => []),
  guardAudioPrompt: vi.fn(() => ({ safe: true, violations: [] }))
}))
vi.mock('~~/server/utils/audio/musicJob', () => ({
  getMusicQueue: vi.fn(() => ({ send: mocks.queueSend })),
  musicIdempotencyKey: vi.fn(() => 'idem-1')
}))
vi.mock('~~/server/utils/creative-generation/aiGatewayProvider', async (importOriginal) => ({
  ...await importOriginal<typeof import('~~/server/utils/creative-generation/aiGatewayProvider')>(),
  generateCreativeImage: mocks.generateCreativeImage
}))
vi.mock('~~/server/utils/video-generation/resolveSourceUrls', () => ({ resolveSourceAssetUrls: vi.fn(async () => ['https://assets.test/source.png']) }))
vi.mock('~~/server/utils/bannerStorage', () => ({ uploadBannerAsset: mocks.uploadBannerAsset }))
vi.mock('~~/server/utils/db', () => ({ queryOne: mocks.queryOne }))
vi.mock('~~/server/utils/creativeCompliance', () => ({ runCreativeComplianceCheck: mocks.runCreativeComplianceCheck }))

import { buildGenerationRunner } from '~~/server/utils/ai/mcp/generationRunner'

const ctx = { userId: 'user-1', userRole: 'owner', event: { context: { cloudflare: { env: { AI: { run: vi.fn() } } } } } } as any
const musicArgs = {
  prompt: 'Warm acoustic bed', isInstrumental: true, format: 'mp3', channels: []
}

describe('real generation runner durability boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createMusicAsset.mockResolvedValue({ id: 'music-1', status: 'queued' })
    mocks.queueSend.mockResolvedValue(undefined)
    mocks.generateVoiceover.mockResolvedValue({ sanitizedText: 'Hello', audioBuffer: new Uint8Array(), format: 'mp3', violations: [] })
    mocks.createVoiceAsset.mockResolvedValue({ id: 'voice-1', status: 'ready', streamUrl: null })
    mocks.generateCreativeImage.mockResolvedValue({
      buffer: new Uint8Array(),
      contentType: 'image/webp',
      modelId: 'aigateway/recraft-offer-card',
      cfModel: 'recraft/recraftv4-1',
      safetyClass: 'non_vehicle_generative',
    })
    mocks.uploadBannerAsset.mockResolvedValue({ size: 100, key: 'asset.webp', url: 'https://assets.test/asset.webp' })
    mocks.queryOne.mockResolvedValue({ id: 'image-1' })
    mocks.runCreativeComplianceCheck.mockResolvedValue({ checkId: 'check-1', passed: true, verdict: { confidence: 0.95 } })
  })

  it('does not checkpoint when music preparation fails before queue send', async () => {
    mocks.createMusicAsset.mockRejectedValueOnce(new Error('database unavailable'))
    const execution = { markDispatched: vi.fn(), captureResult: vi.fn() }
    await expect(buildGenerationRunner(execution).start_music_generation(musicArgs, ctx)).resolves.toMatchObject({ status: 'duplicate' })
    expect(execution.markDispatched).not.toHaveBeenCalled()
    expect(mocks.queueSend).not.toHaveBeenCalled()
  })

  it('checkpoints exactly once before music send and remains uncaptured if send crashes', async () => {
    const order: string[] = []
    mocks.queueSend.mockImplementationOnce(async () => { order.push('send'); throw new Error('response lost') })
    const execution = {
      markDispatched: vi.fn(async () => { order.push('checkpoint') }),
      captureResult: vi.fn(async () => { order.push('capture') })
    }
    await expect(buildGenerationRunner(execution).start_music_generation(musicArgs, ctx)).rejects.toThrow('response lost')
    expect(order).toEqual(['checkpoint', 'send'])
    expect(execution.markDispatched).toHaveBeenCalledTimes(1)
  })

  it('captures the music job reference after a successful queue send', async () => {
    const order: string[] = []
    mocks.queueSend.mockImplementationOnce(async () => { order.push('send') })
    const execution = {
      markDispatched: vi.fn(async () => { order.push('checkpoint') }),
      captureResult: vi.fn(async () => { order.push('capture') })
    }
    await expect(buildGenerationRunner(execution).start_music_generation(musicArgs, ctx)).resolves.toMatchObject({ jobId: 'music-1' })
    expect(order).toEqual(['checkpoint', 'send', 'capture'])
    expect(execution.captureResult).toHaveBeenCalledWith({ ok: true, data: expect.objectContaining({ jobId: 'music-1' }) })
  })

  it('delegates the voiceover checkpoint to the provider-owned boundary and captures the asset afterward', async () => {
    const order: string[] = []
    mocks.generateVoiceover.mockImplementationOnce(async (_event, _input, options) => {
      order.push('prework')
      await options.beforeDispatch()
      order.push('provider')
      return { sanitizedText: 'Hello', audioBuffer: new Uint8Array(), format: 'mp3', violations: [] }
    })
    mocks.createVoiceAsset.mockImplementationOnce(async () => { order.push('asset'); return { id: 'voice-1', status: 'ready', streamUrl: null } })
    const execution = {
      markDispatched: vi.fn(async () => { order.push('checkpoint') }),
      captureResult: vi.fn(async () => { order.push('capture') })
    }
    await buildGenerationRunner(execution).generate_voiceover({ text: 'Hello', lang: 'en', channels: [] }, ctx)
    expect(order).toEqual(['prework', 'checkpoint', 'provider', 'asset', 'capture'])
  })

  it('does not checkpoint when voiceover preflight fails before provider dispatch', async () => {
    mocks.generateVoiceover.mockResolvedValueOnce(null)
    const execution = { markDispatched: vi.fn(), captureResult: vi.fn() }
    await expect(buildGenerationRunner(execution).generate_voiceover({ text: 'Hello', lang: 'en', channels: [] }, ctx)).rejects.toThrow('voice generation unavailable')
    expect(execution.markDispatched).not.toHaveBeenCalled()
  })

  it('checkpoints before billed image generation, persists the client, and captures the asset reference', async () => {
    const order: string[] = []
    mocks.generateCreativeImage.mockImplementationOnce(async () => {
      order.push('provider')
      return {
        buffer: new Uint8Array(), contentType: 'image/webp',
        modelId: 'aigateway/recraft-offer-card', cfModel: 'recraft/recraftv4-1',
        safetyClass: 'non_vehicle_generative'
      }
    })
    mocks.uploadBannerAsset.mockImplementationOnce(async () => {
      order.push('upload')
      return { size: 100, key: 'asset.webp', url: 'https://assets.test/asset.webp' }
    })
    mocks.queryOne.mockImplementationOnce(async () => {
      order.push('persist')
      return { id: 'image-1' }
    })
    const execution = {
      markDispatched: vi.fn(async () => { order.push('checkpoint') }),
      captureResult: vi.fn(async () => { order.push('capture') })
    }

    await buildGenerationRunner(execution).generate_banner_image({
      prompt: 'EOFY typography campaign',
      aspectRatio: '1:1',
      guidanceScale: 3.5,
      steps: 28,
      randomizeSeed: true,
      promptEnhance: true,
      modelId: 'aigateway/recraft-offer-card',
      subjectType: 'non_vehicle',
      referenceSourceAssetIds: [],
      clientId: '22222222-2222-4222-8222-222222222222'
    }, ctx)

    expect(order).toEqual(['checkpoint', 'provider', 'upload', 'persist', 'capture'])
    expect(mocks.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('client_id'),
      expect.arrayContaining(['22222222-2222-4222-8222-222222222222'])
    )
    expect(execution.captureResult).toHaveBeenCalledWith({ ok: true, data: expect.objectContaining({ assetId: 'image-1' }) })
  })

  it('returns and captures review_blocked when automatic image compliance is unavailable', async () => {
    mocks.runCreativeComplianceCheck.mockRejectedValueOnce(new Error('vision gateway unavailable'))
    const execution = { markDispatched: vi.fn(), captureResult: vi.fn() }
    const result = await buildGenerationRunner(execution).generate_banner_image({
      prompt: 'Abstract campaign background',
      aspectRatio: '1:1',
      modelId: 'aigateway/recraft-offer-card',
      subjectType: 'non_vehicle',
      referenceSourceAssetIds: [],
    }, ctx)

    expect(result).toMatchObject({
      assetId: 'image-1',
      status: 'review_blocked',
      compliance: { passed: false, error: 'vision gateway unavailable' },
    })
    expect(execution.captureResult).toHaveBeenCalledWith({ ok: true, data: expect.objectContaining({ status: 'review_blocked' }) })
  })

  it('rejects policy-invalid image prompts before the billed-provider checkpoint', async () => {
    const execution = { markDispatched: vi.fn(), captureResult: vi.fn() }
    await expect(buildGenerationRunner(execution).generate_banner_image({
      prompt: 'Create a BMW sedan campaign image',
      aspectRatio: '1:1',
      modelId: 'aigateway/recraft-offer-card',
      subjectType: 'non_vehicle',
      referenceSourceAssetIds: []
    }, ctx)).rejects.toThrow(/Vehicle generation is blocked/)

    expect(execution.markDispatched).not.toHaveBeenCalled()
    expect(mocks.generateCreativeImage).not.toHaveBeenCalled()
  })
})
