import { describe, it, expect, vi, beforeEach } from 'vitest'

const queryOne = vi.fn()
const execute = vi.fn()
vi.mock('../../workers/audio-jobs/src/db', () => ({
  queryOne: (...a: any[]) => queryOne(...a),
  execute: (...a: any[]) => execute(...a),
  queryRows: vi.fn(),
}))

import { runMusicJob, masterKey, extractAudioUrl } from '../../workers/audio-jobs/src/musicWorker'

const JOB = {
  assetId: 'asset-1', prompt: 'warm acoustic bed', isInstrumental: true,
  lyrics: null, format: 'mp3', idempotencyKey: 'music:abc',
}

function fakeEnv(aiResult: any) {
  return {
    AI: { run: vi.fn(async () => aiResult) },
    AUDIO_BUCKET: { put: vi.fn(async () => ({})) },
  }
}

beforeEach(() => {
  queryOne.mockReset(); execute.mockReset()
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
    expect(extractAudioUrl(null)).toBeNull()
  })
})

describe('runMusicJob', () => {
  it('happy path: generate → fetch → R2 put → status done', async () => {
    queryOne.mockResolvedValueOnce({ status: 'queued', client_id: 'c1' })
    const env = fakeEnv({ audio: 'https://oss/track.mp3' })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })))

    await runMusicJob(JOB, env as any)

    expect(env.AI.run).toHaveBeenCalledOnce()
    // R2 key matches the Pages-side master key shape
    const putKey = env.AUDIO_BUCKET.put.mock.calls[0][0]
    expect(putKey).toBe('audio/c1/asset-1/master.mp3')
    // final UPDATE flips to done with the key
    const doneCall = execute.mock.calls.find(c => /status = 'done'/.test(c[0]))
    expect(doneCall).toBeTruthy()
    expect(doneCall![1]).toEqual(['asset-1', 'audio/c1/asset-1/master.mp3'])
  })

  it('idempotency: already-done asset no-ops (no AI call)', async () => {
    queryOne.mockResolvedValueOnce({ status: 'done', client_id: 'c1' })
    const env = fakeEnv({ audio: 'https://oss/track.mp3' })
    await runMusicJob(JOB, env as any)
    expect(env.AI.run).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })

  it('marks failed and rethrows when the model returns no url', async () => {
    queryOne.mockResolvedValueOnce({ status: 'queued', client_id: null })
    const env = fakeEnv({ nope: true })
    await expect(runMusicJob(JOB, env as any)).rejects.toThrow(/no audio URL/)
    const failCall = execute.mock.calls.find(c => /status = 'failed'/.test(c[0]))
    expect(failCall).toBeTruthy()
  })
})
