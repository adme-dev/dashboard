import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createMusicAsset: vi.fn(),
  queueSend: vi.fn(),
  generateVoiceover: vi.fn(),
  createVoiceAsset: vi.fn()
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

import { buildGenerationRunner } from '~~/server/utils/ai/mcp/generationRunner'

const ctx = { userId: 'user-1', userRole: 'owner', event: { context: {} } } as any
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

  it('checkpoints voiceover immediately before provider generation and captures the asset afterward', async () => {
    const order: string[] = []
    mocks.generateVoiceover.mockImplementationOnce(async () => { order.push('provider'); return { sanitizedText: 'Hello', audioBuffer: new Uint8Array(), format: 'mp3', violations: [] } })
    mocks.createVoiceAsset.mockImplementationOnce(async () => { order.push('asset'); return { id: 'voice-1', status: 'ready', streamUrl: null } })
    const execution = {
      markDispatched: vi.fn(async () => { order.push('checkpoint') }),
      captureResult: vi.fn(async () => { order.push('capture') })
    }
    await buildGenerationRunner(execution).generate_voiceover({ text: 'Hello', lang: 'en', channels: [] }, ctx)
    expect(order).toEqual(['checkpoint', 'provider', 'asset', 'capture'])
  })
})
