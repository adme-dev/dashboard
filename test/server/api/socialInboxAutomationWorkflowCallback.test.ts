import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  headers?: Record<string, string>
  body?: unknown
}

interface WorkflowCallbackResult {
  ok: boolean
  workflow: string
  conversationId: string
  clientId: string
  messageId: string | null
  result: {
    ok: boolean
    skipped?: boolean
    reason?: string
  }
}

const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()
const mockExecute = vi.fn()
const mockRunAutomationForConversation = vi.fn()
const mockGenerateReplyDraft = vi.fn()
const mockDispatchReply = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  execute: (...args: unknown[]) => mockExecute(...args)
}))

vi.mock('~~/server/utils/socialInbox/automation', () => ({
  runAutomationForConversation: (...args: unknown[]) => mockRunAutomationForConversation(...args)
}))

vi.mock('~~/server/utils/socialInbox/aiDraft', () => ({
  generateReplyDraft: (...args: unknown[]) => mockGenerateReplyDraft(...args)
}))

vi.mock('~~/server/utils/socialInbox/dispatch', () => ({
  dispatchReply: (...args: unknown[]) => mockDispatchReply(...args)
}))

vi.mock('h3', () => ({
  defineEventHandler: <T>(fn: T) => fn,
  getHeader: (event: TestEvent, name: string) => event.headers?.[name.toLowerCase()] ?? event.headers?.[name],
  readBody: async (event: TestEvent) => event.body,
  createError: (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)
}))

const oldEnv = { ...process.env }

const { default: handler } = await import('../../../server/api/internal/workflows/social-inbox/automation.post')
const workflowCallback = handler as (event: TestEvent) => Promise<WorkflowCallbackResult>

describe('social inbox automation workflow callback', () => {
  beforeEach(() => {
    process.env = {
      ...oldEnv,
      AGENCY_WORKFLOWS_ENABLED: 'true',
      WORKFLOW_CALLBACK_SECRET: 'workflow-secret'
    }
    vi.clearAllMocks()
    mockQueryOne.mockResolvedValue({ id: 'conversation-1' })
    mockRunAutomationForConversation.mockResolvedValue(undefined)
    mockGenerateReplyDraft.mockResolvedValue({ reply: 'Thanks for reaching out.', confidence: 0.93, risk: false })
    mockDispatchReply.mockResolvedValue({ ok: true, platformMessageId: 'reply-1' })
  })

  it('requires the workflow callback secret before touching inbox automation state', async () => {
    await expect(workflowCallback({
      headers: { 'x-workflow-secret': 'wrong' },
      body: validPayload()
    })).rejects.toMatchObject({ statusCode: 401 })

    expect(mockQueryOne).not.toHaveBeenCalled()
    expect(mockRunAutomationForConversation).not.toHaveBeenCalled()
  })

  it('stays inert while agency workflows are disabled', async () => {
    process.env.AGENCY_WORKFLOWS_ENABLED = 'false'

    await expect(workflowCallback({
      headers: { 'x-workflow-secret': 'workflow-secret' },
      body: validPayload()
    })).rejects.toMatchObject({ statusCode: 503 })

    expect(mockQueryOne).not.toHaveBeenCalled()
    expect(mockRunAutomationForConversation).not.toHaveBeenCalled()
  })

  it('runs automation for one verified client conversation through the shared engine', async () => {
    const result = await workflowCallback({
      headers: { 'x-workflow-secret': 'workflow-secret' },
      body: validPayload()
    })

    expect(result).toEqual({
      ok: true,
      workflow: 'social.inbox.automation',
      conversationId: 'conversation-1',
      clientId: 'client-1',
      messageId: 'message-1',
      result: { ok: true }
    })
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('FROM social_conversations'),
      ['conversation-1', 'client-1']
    )
    expect(mockRunAutomationForConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        queryOne: expect.any(Function),
        queryRows: expect.any(Function),
        execute: expect.any(Function)
      }),
      expect.objectContaining({
        generateDraft: expect.any(Function),
        dispatch: expect.any(Function)
      }),
      'conversation-1'
    )

    const deps = mockRunAutomationForConversation.mock.calls[0][1]
    await expect(deps.generateDraft({ conversationId: 'conversation-1' }, 'brand prompt'))
      .resolves.toEqual({ reply: 'Thanks for reaching out.', confidence: 0.93, risk: false })
    expect(mockGenerateReplyDraft).toHaveBeenCalledWith({ conversationId: 'conversation-1' }, 'brand prompt')

    await expect(deps.dispatch({
      conversationId: 'conversation-1',
      clientId: 'client-1',
      content: 'Thanks.',
      aiGenerated: true,
      queueId: 'queue-1'
    })).resolves.toEqual({ ok: true, platformMessageId: 'reply-1' })
    expect(mockDispatchReply).toHaveBeenCalledWith(
      expect.objectContaining({
        queryOne: expect.any(Function),
        execute: expect.any(Function)
      }),
      'conversation-1',
      { content: 'Thanks.', sentByUserId: 'automation', aiGenerated: true }
    )
  })

  it('acknowledges missing conversations without retrying stale workflow events', async () => {
    mockQueryOne.mockResolvedValueOnce(null)

    const result = await workflowCallback({
      headers: { 'x-workflow-secret': 'workflow-secret' },
      body: validPayload()
    })

    expect(result.result).toEqual({
      ok: true,
      skipped: true,
      reason: 'conversation_not_found'
    })
    expect(mockRunAutomationForConversation).not.toHaveBeenCalled()
  })

  it('rejects malformed workflow payloads', async () => {
    await expect(workflowCallback({
      headers: { 'x-workflow-secret': 'workflow-secret' },
      body: { kind: 'social.inbox.automation', clientId: 'client-1', trigger: 'inbound' }
    })).rejects.toMatchObject({ statusCode: 400 })

    expect(mockQueryOne).not.toHaveBeenCalled()
    expect(mockRunAutomationForConversation).not.toHaveBeenCalled()
  })
})

function validPayload() {
  return {
    kind: 'social.inbox.automation',
    conversationId: 'conversation-1',
    clientId: 'client-1',
    messageId: 'message-1',
    trigger: 'inbound'
  }
}
