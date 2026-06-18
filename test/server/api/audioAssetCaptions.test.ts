import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent { params?: Record<string, string>; headers?: Record<string, string> }

const g = globalThis as any
g.defineEventHandler = (fn: any) => fn
g.getRouterParam = (event: TestEvent, name: string) => event.params?.[name]
g.createError = (input: any) => Object.assign(new Error(input.statusMessage), input)
g.setHeader = vi.fn((event: TestEvent, name: string, value: string) => {
  event.headers = { ...(event.headers ?? {}), [name.toLowerCase()]: value }
})

const mockRequireWriteAccess = vi.fn()
vi.mock('~~/server/utils/auth', () => ({
  requireWriteAccess: (...args: unknown[]) => mockRequireWriteAccess(...args),
}))

const mockQueryOne = vi.fn()
vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
}))

const captionsHandler = (await import('~~/server/api/agency/audio/assets/[id]/captions.vtt.get')).default

describe('GET /api/agency/audio/assets/:id/captions.vtt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireWriteAccess.mockResolvedValue({ id: 'user-1', role: 'owner' })
    mockQueryOne.mockResolvedValue({
      id: 'voice-1',
      kind: 'voiceover',
      title: 'Opening voiceover',
      prompt: 'This is the spoken line.',
      duration_sec: 4,
    })
  })

  it('returns a generated VTT from the stored voiceover script', async () => {
    const event: TestEvent = { params: { id: 'voice-1' } }
    const res = await captionsHandler(event as any)

    expect(mockRequireWriteAccess).toHaveBeenCalledWith(event)
    expect(mockQueryOne).toHaveBeenCalledWith(expect.stringContaining('FROM audio_assets'), ['voice-1'])
    expect(event.headers?.['content-type']).toBe('text/vtt; charset=utf-8')
    expect(event.headers?.['content-disposition']).toBe('attachment; filename="Opening-voiceover.vtt"')
    expect(res).toContain('WEBVTT')
    expect(res).toContain('00:00:00.000 --> 00:00:04.000')
    expect(res).toContain('This is the spoken line.')
  })

  it('rejects non-voiceover assets', async () => {
    mockQueryOne.mockResolvedValue({ id: 'music-1', kind: 'music', title: 'Music', prompt: 'Beat', duration_sec: 10 })

    await expect(captionsHandler({ params: { id: 'music-1' } } as any))
      .rejects
      .toMatchObject({ statusCode: 400, statusMessage: 'Captions are only available for voiceover assets' })
  })
})
