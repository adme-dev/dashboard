import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ queryOne: vi.fn(), processMessage: vi.fn(), stt: vi.fn(), tts: vi.fn(), lookup: vi.fn(), claim: vi.fn(), complete: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOne: mocks.queryOne }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: vi.fn(async () => ({ id: 'staff', role: 'media_buyer' })) }))
vi.mock('~~/server/utils/aiChatEngine', () => ({ processUserMessage: mocks.processMessage }))
vi.mock('~~/server/utils/aiVoice', () => ({ speechToText: mocks.stt, textToSpeech: mocks.tts }))
vi.mock('~~/server/utils/godMode/authority', () => ({ resolveGodModeAuthority: vi.fn(async () => null), isActiveGodModeAuthority: () => false }))
vi.stubGlobal('defineEventHandler', (h: unknown) => h)
vi.stubGlobal('getRouterParam', () => 'conversation')
vi.stubGlobal('createError', (value: { statusMessage: string }) => Object.assign(new Error(value.statusMessage), value))
const { createMessagesPostHandler } = await import('../../../server/api/agency/ai/chat/conversations/[id]/messages.post')
const voiceHandler = (await import('../../../server/api/agency/ai/chat/conversations/[id]/voice.post')).default
const textHandler = createMessagesPostHandler({ lookupSubmission: mocks.lookup, claimSubmission: mocks.claim, completeSubmission: mocks.complete, processMessage: mocks.processMessage })
const token = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.queryOne.mockResolvedValue({ id: 'conversation', cnt: 0 })
  mocks.lookup.mockResolvedValue(null)
  mocks.claim.mockResolvedValue({ state: 'claimed', userMessageId: 'message', executionMode: 'ordinary' })
  mocks.complete.mockResolvedValue(undefined)
  mocks.processMessage.mockResolvedValue({ message: { content: 'reply' }, contextSources: [] })
  mocks.stt.mockResolvedValue({ text: 'hello', durationMs: 1 })
  mocks.tts.mockResolvedValue(null)
})
describe('focus transport through real chat routes', () => {
  it.each([undefined, null, 'general', 'marketing'])('text preserves %s in submission identity and engine call', async (persona) => {
    vi.stubGlobal('readBody', async () => ({ content: 'hello', persona, transportRetryToken: token }))
    await textHandler({ context: {} } as Parameters<typeof textHandler>[0])
    expect(mocks.lookup.mock.calls[0][0].request.persona).toBe(persona)
    expect(mocks.processMessage.mock.calls[0][7]).toBe(persona)
  })
  it.each([undefined, null, 'general', 'marketing'])('voice preserves %s before speech/model work', async (persona) => {
    vi.stubGlobal('readMultipartFormData', async () => [
      { name: 'audio', type: 'audio/webm', data: Buffer.alloc(101) },
      ...(persona === undefined ? [] : [{ name: 'persona', data: Buffer.from(JSON.stringify(persona)) }])
    ])
    await voiceHandler({ context: {} } as Parameters<typeof voiceHandler>[0])
    expect(mocks.processMessage.mock.calls[0][7]).toBe(persona)
  })
  it.each(['null garbage', '{}', 'false', '""'])('rejects invalid voice persona %s without provider work', async (raw) => {
    vi.stubGlobal('readMultipartFormData', async () => [{ name: 'audio', type: 'audio/webm', data: Buffer.alloc(101) }, { name: 'persona', data: Buffer.from(raw) }])
    await expect(voiceHandler({ context: {} } as Parameters<typeof voiceHandler>[0])).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.stt).not.toHaveBeenCalled()
    expect(mocks.processMessage).not.toHaveBeenCalled()
  })
})
