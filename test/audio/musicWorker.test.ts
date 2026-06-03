import { describe, it, expect, vi, beforeEach } from 'vitest'

const queryOne = vi.fn()
const execute = vi.fn()
vi.mock('../../workers/audio-jobs/src/db', () => ({
  queryOne: (...a: any[]) => queryOne(...a),
  execute: (...a: any[]) => execute(...a),
  queryRows: vi.fn(),
}))

// Mock the render orchestration so the worker tests never touch the container.
const renderVariants = vi.fn()
vi.mock('../../workers/audio-jobs/src/renderVariants', () => ({
  renderVariants: (...a: any[]) => renderVariants(...a),
}))

import { runMusicJob, masterKey, extractAudioUrl, estimateAudioDurationSec } from '../../workers/audio-jobs/src/musicWorker'

const JOB = {
  assetId: 'asset-1', prompt: 'warm acoustic bed', isInstrumental: true,
  lyrics: null, format: 'mp3', idempotencyKey: 'music:abc',
}

function fakeEnv(aiResult: any) {
  return {
    AI: { run: vi.fn(async () => aiResult) },
    AUDIO_BUCKET: { put: vi.fn(async () => ({})), get: vi.fn() },
    RENDER: {},
  }
}

function mp3Frames(count: number): Uint8Array {
  const frameLength = 417
  const out = new Uint8Array(frameLength * count)
  for (let i = 0; i < count; i++) {
    const off = i * frameLength
    out[off] = 0xff
    out[off + 1] = 0xfb
    out[off + 2] = 0x90
    out[off + 3] = 0x64
  }
  return out
}

beforeEach(() => {
  queryOne.mockReset(); execute.mockReset(); renderVariants.mockReset()
  vi.unstubAllGlobals()
})

describe('masterKey', () => {
  it('namespaces by client and falls back to org', () => {
    expect(masterKey('c1', 'a1', 'mp3')).toBe('audio/c1/a1/master.mp3')
    expect(masterKey(null, 'a1', 'wav')).toBe('audio/org/a1/master.wav')
  })
})

describe('extractAudioUrl', () => {
  it('finds the url across common response shapes', () => {
    expect(extractAudioUrl({ audio: 'https://x/y.mp3' })).toBe('https://x/y.mp3')
    expect(extractAudioUrl({ data: { audio: 'https://x/z.mp3' } })).toBe('https://x/z.mp3')
    expect(extractAudioUrl({ nope: 1 })).toBeNull()
  })
})

describe('estimateAudioDurationSec', () => {
  it('counts MP3 frame samples', () => {
    expect(estimateAudioDurationSec(mp3Frames(10), 'mp3')).toBeCloseTo(10 * 1152 / 44100, 5)
  })
})

describe('runMusicJob', () => {
  it('master only (no channels): generate → R2 → done, no render', async () => {
    queryOne.mockResolvedValueOnce({ status: 'queued', client_id: 'c1', channels: [], r2_key_master: null })
    const env = fakeEnv({ audio: 'https://oss/track.mp3' })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => mp3Frames(10).buffer })))

    await runMusicJob(JOB, env as any)

    expect(env.AUDIO_BUCKET.put.mock.calls[0][0]).toBe('audio/c1/asset-1/master.mp3')
    const masterUpdate = execute.mock.calls.find(c => /r2_key_master/.test(c[0]))
    expect(masterUpdate?.[0]).toMatch(/duration_sec/)
    expect(masterUpdate?.[1][2]).toBeCloseTo(10 * 1152 / 44100, 5)
    expect(renderVariants).not.toHaveBeenCalled()
    expect(execute.mock.calls.some(c => /status = 'done'/.test(c[0]) && !/variants/.test(c[0]))).toBe(true)
  })

  it('with channels: generate → render variants → done with variants', async () => {
    queryOne.mockResolvedValueOnce({ status: 'queued', client_id: 'c1', channels: ['tiktok', 'radio'], r2_key_master: null })
    renderVariants.mockResolvedValueOnce({ tiktok: 'audio/c1/asset-1/tiktok.mp3', radio: 'audio/c1/asset-1/radio.wav' })
    const env = fakeEnv({ audio: 'https://oss/track.mp3' })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })))

    await runMusicJob(JOB, env as any)

    expect(execute.mock.calls.some(c => /status = 'rendering'/.test(c[0]))).toBe(true)
    expect(renderVariants).toHaveBeenCalledOnce()
    const variantsCall = execute.mock.calls.find(c => /variants = \$2::jsonb/.test(c[0]))
    expect(variantsCall).toBeTruthy()
    expect(JSON.parse(variantsCall![1][1])).toHaveProperty('tiktok')
  })

  it('render-only retry: master already exists → skip generation', async () => {
    queryOne.mockResolvedValueOnce({ status: 'rendering', client_id: 'c1', channels: ['meta'], r2_key_master: 'audio/c1/asset-1/master.mp3' })
    renderVariants.mockResolvedValueOnce({ meta: 'audio/c1/asset-1/meta.mp3' })
    const env = fakeEnv({ audio: 'https://oss/track.mp3' })

    await runMusicJob(JOB, env as any)

    expect(env.AI.run).not.toHaveBeenCalled() // no re-generation / re-bill
    expect(env.AUDIO_BUCKET.put).not.toHaveBeenCalled()
    expect(renderVariants).toHaveBeenCalledOnce()
  })

  it('idempotency: already-done asset no-ops', async () => {
    queryOne.mockResolvedValueOnce({ status: 'done', client_id: 'c1', channels: ['meta'], r2_key_master: 'audio/c1/asset-1/master.mp3' })
    const env = fakeEnv({})
    await runMusicJob(JOB, env as any)
    expect(env.AI.run).not.toHaveBeenCalled()
    expect(renderVariants).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })

  it('marks failed and rethrows when the model returns no url', async () => {
    queryOne.mockResolvedValueOnce({ status: 'queued', client_id: null, channels: [], r2_key_master: null })
    const env = fakeEnv({ nope: true })
    await expect(runMusicJob(JOB, env as any)).rejects.toThrow(/no audio URL/)
    expect(execute.mock.calls.some(c => /status = 'failed'/.test(c[0]))).toBe(true)
  })
})
