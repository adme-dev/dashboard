import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = { _body?: unknown, _status?: number }

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  readBody: (event: TestEvent) => unknown
  setResponseStatus: (event: TestEvent, code: number) => void
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & { statusCode: number, statusMessage: string }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.readBody = event => event._body
testGlobal.setResponseStatus = (event, code) => { event._status = code }
testGlobal.createError = (opts) => {
  const error = new Error(opts.statusMessage) as Error & { statusCode: number, statusMessage: string }
  error.statusCode = opts.statusCode
  error.statusMessage = opts.statusMessage
  return error
}

const mockRequireAuth = vi.fn()
const mockTextToSpeech = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}))
vi.mock('~~/server/utils/aiVoice', () => ({
  textToSpeech: (...args: unknown[]) => mockTextToSpeech(...args),
}))

const { default: handler } = await import('../../../server/api/agency/ai/chat/speak.post')

function evt(body: unknown): TestEvent { return { _body: body } }

beforeEach(() => {
  mockRequireAuth.mockReset().mockResolvedValue({ id: 'u1', role: 'owner' })
  mockTextToSpeech.mockReset()
})

describe('POST /api/agency/ai/chat/speak', () => {
  it('returns base64 audio for valid text', async () => {
    mockTextToSpeech.mockResolvedValue({ audioBuffer: new Uint8Array([1, 2, 3]).buffer, format: 'wav' })
    const res = await handler(evt({ text: 'Done, created the task.' }) as any)
    expect(res).toEqual({ audioBase64: Buffer.from([1, 2, 3]).toString('base64'), audioFormat: 'wav' })
  })

  it('returns 204/null when TTS is unavailable', async () => {
    mockTextToSpeech.mockResolvedValue(null)
    const e = evt({ text: 'hi' })
    const res = await handler(e as any)
    expect(res).toBeNull()
    expect((e as TestEvent)._status).toBe(204)
  })

  it('rejects empty text with 400', async () => {
    await expect(handler(evt({ text: '   ' }) as any)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects over-long text with 400', async () => {
    await expect(handler(evt({ text: 'x'.repeat(2001) }) as any)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('requires auth', async () => {
    mockRequireAuth.mockRejectedValue(Object.assign(new Error('Unauthorized'), { statusCode: 401 }))
    await expect(handler(evt({ text: 'hi' }) as any)).rejects.toMatchObject({ statusCode: 401 })
  })
})
