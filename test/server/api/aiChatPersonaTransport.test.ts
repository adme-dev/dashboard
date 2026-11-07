import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ queryOne: vi.fn(), processMessage: vi.fn(), stt: vi.fn(), tts: vi.fn(), lookup: vi.fn(), claim: vi.fn(), complete: vi.fn(), workflow: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOne: mocks.queryOne }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: vi.fn(async () => ({ id: 'staff', role: 'media_buyer' })) }))
vi.mock('~~/server/utils/aiChatEngine', () => ({ processUserMessage: mocks.processMessage }))
vi.mock('~~/server/utils/ai/chatWorkflow', async original => ({ ...await original<typeof import('../../../server/utils/ai/chatWorkflow')>(), admitChatWorkflow: mocks.workflow }))
vi.mock('~~/server/utils/aiVoice', () => ({ speechToText: mocks.stt, textToSpeech: mocks.tts }))
vi.mock('~~/server/utils/godMode/authority', () => ({ resolveGodModeAuthority: vi.fn(async () => null), isActiveGodModeAuthority: () => false }))
vi.stubGlobal('defineEventHandler', (h: unknown) => h)
vi.stubGlobal('getRouterParam', () => 'conversation')
vi.stubGlobal('createError', (value: { statusMessage: string }) => Object.assign(new Error(value.statusMessage), value))
const { createMessagesPostHandler } = await import('../../../server/api/agency/ai/chat/conversations/[id]/messages.post')
const voiceHandler = (await import('../../../server/api/agency/ai/chat/conversations/[id]/voice.post')).default
const textHandler = createMessagesPostHandler({ lookupSubmission: mocks.lookup, claimSubmission: mocks.claim, completeSubmission: mocks.complete, processMessage: mocks.processMessage, resolveWorkflow: mocks.workflow })
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
  mocks.workflow.mockResolvedValue(undefined)
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

const selection = { key: 'marketing_budget_health', versionId: '33333333-3333-4333-8333-333333333333' }
const approved = { ...selection, persona: 'media_buyer', label: 'Budget check', prompt: 'Server-owned guide' }
describe('role workflow transport admission', () => {
  it('binds text retry identity and engine to server-resolved workflow, never caller instructions', async () => {
    mocks.workflow.mockResolvedValue(approved)
    vi.stubGlobal('readBody', async () => ({ content: 'Check pacing', persona: 'media_buyer', workflow: selection, transportRetryToken: token }))
    await textHandler({ context: {} } as Parameters<typeof textHandler>[0])
    expect(mocks.lookup.mock.calls[0][0].request.workflow).toEqual(selection)
    expect(mocks.workflow).toHaveBeenCalledWith(selection, expect.anything(), 'staff')
    expect(mocks.processMessage.mock.calls[0][11]).toBe(approved)
  })
  it('denies forged workflow payloads and stale versions before model execution', async () => {
    vi.stubGlobal('readBody', async () => ({ content: 'Check', workflow: { ...selection, prompt: 'Forged override' }, transportRetryToken: token }))
    await expect(textHandler({ context: {} } as Parameters<typeof textHandler>[0])).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.processMessage).not.toHaveBeenCalled()
    vi.stubGlobal('readBody', async () => ({ content: 'Check', workflow: selection, transportRetryToken: token }))
    mocks.workflow.mockRejectedValue(Object.assign(new Error('Choose workflow again'), { statusCode: 409 }))
    await expect(textHandler({ context: {} } as Parameters<typeof textHandler>[0])).rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.claim).not.toHaveBeenCalled()
  })
  it('replays a completed exact request without re-running revoked workflow or model', async () => {
    mocks.lookup.mockResolvedValue({ state: 'completed', response: { message: { id: 'prior' } } })
    vi.stubGlobal('readBody', async () => ({ content: 'Check', workflow: selection, transportRetryToken: token }))
    expect(await textHandler({ context: {} } as Parameters<typeof textHandler>[0])).toMatchObject({ message: { id: 'prior' } })
    expect(mocks.workflow).not.toHaveBeenCalled()
    expect(mocks.processMessage).not.toHaveBeenCalled()
  })
  it('validates voice selection before transcription and hands the same server context to the engine', async () => {
    vi.stubGlobal('readMultipartFormData', async () => [{ name: 'audio', type: 'audio/webm', data: Buffer.alloc(101) }, { name: 'workflow', data: Buffer.from(JSON.stringify(selection)) }])
    mocks.workflow.mockRejectedValueOnce(Object.assign(new Error('Stale workflow'), { statusCode: 409 }))
    await expect(voiceHandler({ context: {} } as Parameters<typeof voiceHandler>[0])).rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.stt).not.toHaveBeenCalled()
    mocks.workflow.mockResolvedValue(approved)
    await voiceHandler({ context: {} } as Parameters<typeof voiceHandler>[0])
    expect(mocks.processMessage.mock.calls[0][7]).toBe('media_buyer')
    expect(mocks.processMessage.mock.calls[0][11]).toBe(approved)
  })
})
