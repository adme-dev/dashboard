import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  queryOne: vi.fn(),
  queryOneFresh: vi.fn(),
  processUserMessage: vi.fn(),
  readBody: vi.fn()
}))

vi.mock('~~/server/utils/auth', () => ({ requireAuth: mocks.requireAuth }))
vi.mock('~~/server/utils/db', () => ({
  queryOne: mocks.queryOne,
  queryOneFresh: mocks.queryOneFresh
}))
vi.mock('~~/server/utils/aiChatEngine', () => ({ processUserMessage: mocks.processUserMessage }))

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('getRouterParam', () => '90000000-0000-4000-8000-000000000001')
vi.stubGlobal('readBody', mocks.readBody)
vi.stubGlobal('createError', (input: Record<string, unknown>) => Object.assign(
  new Error(String(input.statusMessage ?? 'request failed')),
  input
))

const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const RETRY_TOKEN = '22222222-2222-4222-8222-222222222222'
const PATH = '/api/agency/ai/chat/conversations/90000000-0000-4000-8000-000000000001/messages'

const { createMessagesPostHandler } = await import(
  '../../../server/api/agency/ai/chat/conversations/[id]/messages.post'
)

let handler: (event: any) => Promise<any>

function event() {
  return {
    method: 'POST',
    context: { user: { id: OWNER_ID } },
    node: {
      req: { originalUrl: PATH, headers: { host: 'app.xeroflow.test' }, connection: {} },
      res: { statusCode: 200, statusMessage: 'OK' }
    }
  } as any
}

describe('God mode chat transport idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ id: OWNER_ID, role: 'owner' })
    mocks.queryOneFresh.mockResolvedValue({ id: OWNER_ID })
    mocks.readBody.mockResolvedValue({ content: 'Create the task', transportRetryToken: RETRY_TOKEN })
    mocks.queryOne.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*)')) return { cnt: 0 }
      if (sql.includes('FROM ai_conversations')) return { id: '90000000-0000-4000-8000-000000000001' }
      return null
    })
    const submissions = new Map<string, { state: 'processing' | 'completed', response?: Record<string, unknown> }>()
    handler = createMessagesPostHandler({
      processMessage: mocks.processUserMessage,
      claimSubmission: vi.fn(async request => {
        const existing = submissions.get(request.transportRetryToken)
        if (existing?.state === 'completed') {
          return {
            state: 'completed' as const,
            submissionId: 'submission-1',
            userMessageId: 'message-1',
            response: existing.response!
          }
        }
        if (existing) return { state: 'blocked' as const, reason: 'processing' as const }
        submissions.set(request.transportRetryToken, { state: 'processing' })
        return { state: 'claimed' as const, submissionId: 'submission-1', userMessageId: 'message-1' }
      }),
      completeSubmission: vi.fn(async input => {
        submissions.set(RETRY_TOKEN, { state: 'completed', response: input.response })
      })
    })
  })

  it('replays the persisted response after response loss without running the turn twice', async () => {
    const response = { message: { id: 'assistant-1', content: 'Done' }, contextSources: [], proposedAction: null }
    mocks.processUserMessage.mockResolvedValue(response)

    const first = await handler(event())
    const retry = await handler(event())

    expect(first).toMatchObject({ ...response, transportRetryToken: RETRY_TOKEN })
    expect(retry).toEqual(first)
    expect(mocks.processUserMessage).toHaveBeenCalledTimes(1)
  })

  it('allows only one concurrent duplicate submission to enter the model/tool turn', async () => {
    let release!: (value: any) => void
    mocks.processUserMessage.mockImplementation(() => new Promise(resolve => { release = resolve }))

    const first = handler(event())
    const duplicate = handler(event())
    void duplicate.catch(() => {})
    await vi.waitFor(() => expect(mocks.processUserMessage).toHaveBeenCalledTimes(1))
    release({ message: { id: 'assistant-1', content: 'Done' }, contextSources: [], proposedAction: null })

    const settled = await Promise.allSettled([first, duplicate])
    expect(mocks.processUserMessage).toHaveBeenCalledTimes(1)
    expect(settled.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(settled.filter(result => result.status === 'rejected')).toEqual([
      expect.objectContaining({ reason: expect.objectContaining({ statusCode: 409 }) })
    ])
  })
})
