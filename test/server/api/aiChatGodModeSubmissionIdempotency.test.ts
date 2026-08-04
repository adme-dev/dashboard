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
const {
  claimChatSubmission,
  completeChatSubmission,
  lookupChatSubmission
} = await import('../../../server/utils/ai/godModeChatSubmission')

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

function sqlSubmissionStore() {
  type Submission = {
    id: string
    actorUserId: string
    conversationId: string
    tokenHash: string
    requestDigest: string
    userMessageId: string
    executionMode: 'ordinary' | 'god_mode'
    state: 'processing' | 'completed' | 'failed'
    responsePayload?: Record<string, unknown>
  }
  const rows = new Map<string, Submission>()
  let serial = Promise.resolve()
  const transaction = async <T>(callback: (db: { query: (sql: string, params?: unknown[]) => Promise<any> }) => Promise<T>) => {
    let release!: () => void
    const previous = serial
    serial = new Promise<void>(resolve => { release = resolve })
    await previous
    try {
      return await callback({
        query: async (sql, params = []) => {
          if (sql.includes('pg_advisory_xact_lock')) return { rows: [] }
          if (sql.includes('FROM ai_chat_submissions')) {
            const key = `${params[0]}:${params[1]}:${params[2]}`
            const row = rows.get(key)
            return {
              rows: row
                ? [{
                    id: row.id,
                    user_message_id: row.userMessageId,
                    request_digest: row.requestDigest,
                    state: row.state,
                    response_payload: row.responsePayload ?? null
                  }]
                : []
            }
          }
          if (sql.includes('INSERT INTO ai_chat_submissions')) {
            const key = `${params[1]}:${params[2]}:${params[3]}`
            if (rows.has(key)) throw Object.assign(new Error('duplicate key'), { code: '23505' })
            rows.set(key, {
              id: String(params[0]),
              actorUserId: String(params[1]),
              conversationId: String(params[2]),
              tokenHash: String(params[3]),
              requestDigest: String(params[4]),
              userMessageId: String(params[5]),
              executionMode: String(params[6]) as Submission['executionMode'],
              state: 'processing'
            })
            return { rows: [], rowCount: 1 }
          }
          if (sql.includes('UPDATE ai_chat_submissions')) {
            const row = [...rows.values()].find(candidate =>
              candidate.id === params[0] && candidate.actorUserId === params[1]
            )
            if (!row || row.state !== 'processing') return { rows: [], rowCount: 0 }
            row.state = 'completed'
            row.responsePayload = JSON.parse(String(params[2]))
            return { rows: [], rowCount: 1 }
          }
          throw new Error(`Unexpected submission SQL: ${sql}`)
        }
      })
    } finally {
      release()
    }
  }
  return { rows, transaction }
}

function handlerWithProductionSubmissionSql(store: ReturnType<typeof sqlSubmissionStore>) {
  return createMessagesPostHandler({
    processMessage: mocks.processUserMessage,
    lookupSubmission: request => lookupChatSubmission(request, store.transaction as never),
    claimSubmission: request => claimChatSubmission(request, store.transaction as never),
    completeSubmission: input => completeChatSubmission(input, store.transaction as never)
  })
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
      lookupSubmission: vi.fn(async request => {
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
        return null
      }),
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

  it('replays an active submission after the owner is downgraded without rerunning the turn', async () => {
    const store = sqlSubmissionStore()
    handler = handlerWithProductionSubmissionSql(store)
    const response = { message: { id: 'assistant-1', content: 'Done' }, contextSources: [], proposedAction: null }
    mocks.processUserMessage.mockResolvedValue(response)

    await handler(event())
    mocks.queryOneFresh.mockResolvedValue(null)
    mocks.requireAuth.mockResolvedValue({ id: OWNER_ID, role: 'member' })
    const retry = await handler(event())

    expect(retry).toMatchObject({ ...response, transportRetryToken: RETRY_TOKEN })
    expect(mocks.processUserMessage).toHaveBeenCalledTimes(1)
    expect([...store.rows.values()][0]?.executionMode).toBe('god_mode')
  })

  it('replays an active submission after emergency disable without rerunning the turn', async () => {
    const store = sqlSubmissionStore()
    handler = handlerWithProductionSubmissionSql(store)
    const response = { message: { id: 'assistant-1', content: 'Done' }, contextSources: [], proposedAction: null }
    mocks.processUserMessage.mockResolvedValue(response)

    await handler(event())
    const disabledEvent = event()
    disabledEvent.context.cloudflare = { env: { GOD_MODE_DISABLED: 'true' } }
    const retry = await handler(disabledEvent)

    expect(retry).toMatchObject({ ...response, transportRetryToken: RETRY_TOKEN })
    expect(mocks.processUserMessage).toHaveBeenCalledTimes(1)
  })

  it('deduplicates an ordinary response-loss retry through the production SQL claim', async () => {
    const store = sqlSubmissionStore()
    handler = handlerWithProductionSubmissionSql(store)
    mocks.requireAuth.mockResolvedValue({ id: OWNER_ID, role: 'member' })
    mocks.queryOneFresh.mockResolvedValue(null)
    const response = { message: { id: 'assistant-2', content: 'Drafted' }, contextSources: [], proposedAction: null }
    mocks.processUserMessage.mockResolvedValue(response)

    const first = await handler(event())
    const retry = await handler(event())

    expect(retry).toEqual(first)
    expect(retry).toMatchObject({ transportRetryToken: RETRY_TOKEN })
    expect(mocks.processUserMessage).toHaveBeenCalledTimes(1)
    expect(store.rows.size).toBe(1)
    expect([...store.rows.values()][0]?.executionMode).toBe('ordinary')
  })

  it.each([
    ['ordinary', 'member', false],
    ['God mode', 'owner', true]
  ] as const)('admits one %s concurrent duplicate through the production SQL claim', async (_label, role, active) => {
    const store = sqlSubmissionStore()
    handler = handlerWithProductionSubmissionSql(store)
    mocks.requireAuth.mockResolvedValue({ id: OWNER_ID, role })
    mocks.queryOneFresh.mockResolvedValue(active ? { id: OWNER_ID } : null)
    let release!: (value: any) => void
    const turn = new Promise(resolve => { release = resolve })
    mocks.processUserMessage.mockReturnValue(turn)

    const first = handler(event())
    const duplicate = handler(event())
    void duplicate.catch(() => {})
    await vi.waitFor(() => expect(mocks.processUserMessage).toHaveBeenCalledTimes(1))
    release({ message: { id: 'assistant-3', content: 'Done' }, contextSources: [], proposedAction: null })

    const settled = await Promise.allSettled([first, duplicate])
    expect(settled.filter(item => item.status === 'fulfilled')).toHaveLength(1)
    expect(settled.filter(item => item.status === 'rejected')).toEqual([
      expect.objectContaining({ reason: expect.objectContaining({ statusCode: 409 }) })
    ])
    expect(store.rows.size).toBe(1)
  })
})
