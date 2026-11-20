import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { measuredRenderProgress } from '../../shared/video/renderExecution'
import { renderComposite } from '../../workers/audio-jobs/src/videoCompositeContainer'
import { TimelineStateSchema } from '~~/server/utils/audio/timelineSchema'
const mock = vi.hoisted(() => ({ fetch: vi.fn(), upload: vi.fn() }))
vi.mock('@cloudflare/containers', () => ({ getContainer: () => ({ fetch: mock.fetch }) }))
vi.mock('../../workers/audio-jobs/src/compositeOutputStream', () => ({ putCompositeOutput: (...args: unknown[]) => mock.upload(...args) }))
const args = { projectId: 'p', jobId: 'j', state: TimelineStateSchema.parse({ schema_version: 2, media_type: 'av', tracks: [] }), profile: { width: 1080, height: 1920, fps: 30, format: 'reels_9x16' } }
const env = { RENDER: {} as any, AUDIO_BUCKET: { get: vi.fn(), put: vi.fn(), delete: vi.fn() } }
beforeEach(() => { vi.clearAllMocks(); mock.upload.mockResolvedValue(undefined) })
afterEach(() => vi.useRealTimers())
describe('composite request execution', () => {
  it('sends a fresh execution identity and the remaining shared timeout', async () => {
    mock.fetch.mockResolvedValue(new Response('mp4'))
    await renderComposite(env, { ...args, deadlineAtMs: Date.now() + 4000 } as any)
    const options = mock.fetch.mock.calls[0][1]
    expect(options.headers['x-render-execution-id']).toMatch(/^[a-f0-9-]{36}$/)
    expect(Number(options.headers['x-render-timeout-ms'])).toBeGreaterThan(0)
    expect(Number(options.headers['x-render-timeout-ms'])).toBeLessThanOrEqual(4000)
  })
  it('reads measured counters while the final response is still pending and stops afterward', async () => {
    vi.useFakeTimers()
    let complete!: (response: Response) => void
    mock.fetch.mockImplementation(async (url: string, options: RequestInit) => options.method === 'POST'
      ? new Promise<Response>(resolve => { complete = resolve })
      : Response.json({ stage: 'capturing', framesDone: 15, framesTotal: 30, updatedAtMs: Date.now() }))
    const onProgress = vi.fn().mockResolvedValue(undefined)
    const run = renderComposite(env, { ...args, onProgress } as any)
    await vi.advanceTimersByTimeAsync(2500)
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ stage: 'capturing', framesDone: 15, framesTotal: 30 }))
    complete(new Response('mp4'))
    await run
    const calls = mock.fetch.mock.calls.length
    await vi.advanceTimersByTimeAsync(10000)
    expect(mock.fetch).toHaveBeenCalledTimes(calls)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('fails a hung input read at the supplied deadline without starting a container', async () => {
    vi.useFakeTimers()
    const state = TimelineStateSchema.parse({ schema_version: 2, media_type: 'av', tracks: [{ id: 'voice', name: 'Voice', kind: 'voiceover', clips: [{ id: 'v', r2_key: 'voice.wav', timeline_start_sec: 0, source_in_sec: 0, source_out_sec: 1 }] }] })
    env.AUDIO_BUCKET.get.mockImplementation(() => new Promise(() => {}))
    const run = renderComposite(env, { ...args, state, deadlineAtMs: Date.now() + 1000 } as any)
    let error: unknown
    void run.catch(e => { error = e })
    await vi.advanceTimersByTimeAsync(1001)
    expect(error).toBeInstanceOf(Error)
    await expect(run).rejects.toThrow(/deadline/)
    expect(mock.fetch).not.toHaveBeenCalled()
  })
})

describe('advisory status failures', () => {
  it.each(['request', 'callback'])('bounds an uncooperative %s and tears down all polling', async (kind) => {
    vi.useFakeTimers()
    let complete!: (r: Response) => void
    mock.fetch.mockImplementation(async (_url: string, options: RequestInit) => {
      if (options.method === 'POST') return new Promise<Response>(resolve => { complete = resolve })
      if (kind === 'request') return new Promise<Response>(() => {})
      return Response.json({ stage: 'encoding', encodedTimeMs: 500, durationMs: 1000 })
    })
    const onProgress = vi.fn().mockImplementation((p: any) => p.stage === 'encoding' ? new Promise(() => {}) : Promise.resolve())
    const run = renderComposite(env, { ...args, onProgress })
    await vi.advanceTimersByTimeAsync(2500)
    complete(new Response('mp4'))
    await run
    expect(mock.upload).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    const calls = mock.fetch.mock.calls.length
    await vi.advanceTimersByTimeAsync(10000)
    expect(mock.fetch).toHaveBeenCalledTimes(calls)
  })
  it('aborts an in-flight upload and deletes its eventual late object without publishing it', async () => {
    vi.useFakeTimers()
    mock.fetch.mockResolvedValue(new Response('mp4'))
    let finish!: () => void
    mock.upload.mockImplementation(() => new Promise<void>(resolve => { finish = resolve }))
    const run = renderComposite(env, { ...args, deadlineAtMs: Date.now() + 1000 })
    void run.catch(() => {})
    await vi.advanceTimersByTimeAsync(1001)
    await expect(run).rejects.toThrow(/deadline/)
    const options = mock.upload.mock.calls[0][3]
    expect(options.signal.aborted).toBe(true)
    finish()
    await vi.advanceTimersByTimeAsync(0)
    expect(env.AUDIO_BUCKET.delete).toHaveBeenCalledWith(mock.upload.mock.calls[0][1])
    expect(vi.getTimerCount()).toBe(0)
  })
})

it.each(['constructor', '__proto__', 'toString', 'done', 'unknown'])('ignores untrusted container stage %s', stage => {
  expect(measuredRenderProgress({ stage, framesDone: 1, framesTotal: 2 })).toBeNull()
})
