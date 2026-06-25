import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  context?: { params?: Record<string, string> }
  body?: Record<string, unknown>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getRouterParam: (event: TestEvent, key: string) => string | undefined
  readBody: (event: TestEvent) => Promise<Record<string, unknown>>
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getRouterParam = (event, key) => event.context?.params?.[key]
testGlobal.readBody = async event => event.body ?? {}
testGlobal.createError = (opts) => {
  const error = new Error(opts.statusMessage) as Error & {
    statusCode: number
    statusMessage: string
  }
  error.statusCode = opts.statusCode
  error.statusMessage = opts.statusMessage
  return error
}

const mockRequireAuth = vi.fn()
const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()
const mockGenerateGroqInsight = vi.fn()
const mockEnsureOfficeMeetingArtifactsTables = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

vi.mock('~~/server/utils/groqClient', () => ({
  GROQ_MODELS: { LLAMA_70B: 'llama-3.3-70b-versatile' },
  generateGroqInsight: (...args: unknown[]) => mockGenerateGroqInsight(...args)
}))

vi.mock('~~/server/utils/officeMeetingArtifacts', () => ({
  ensureOfficeMeetingArtifactsTables: (...args: unknown[]) => mockEnsureOfficeMeetingArtifactsTables(...args)
}))

const { default: handler } = await import(
  '../../../../server/api/office/[officeId]/meetings/[meetingId]/ask.post'
)

function fakeEvent(body: Record<string, unknown> = {}) {
  return {
    context: { params: { officeId: 'office-1', meetingId: 'meeting-1' } },
    body
  } satisfies TestEvent
}

describe('POST /api/office/:officeId/meetings/:meetingId/ask', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset()
    mockQueryOne.mockReset()
    mockQueryRows.mockReset()
    mockGenerateGroqInsight.mockReset()
    mockEnsureOfficeMeetingArtifactsTables.mockReset()

    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockEnsureOfficeMeetingArtifactsTables.mockResolvedValue(undefined)
    mockGenerateGroqInsight.mockResolvedValue('Send the recap and confirm budget [1].')
  })

  it('answers a meeting question from saved artifacts', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'member' })
      .mockResolvedValueOnce({ id: 'meeting-1', title: 'Client review' })
    mockQueryRows.mockResolvedValueOnce([
      {
        id: 'artifact-1',
        title: 'Client review transcript',
        artifact_type: 'transcript',
        content: 'The team agreed to send the recap and confirm budget.',
        created_at: '2026-05-27T00:00:00.000Z'
      },
      {
        id: 'artifact-2',
        title: 'Client review summary',
        artifact_type: 'summary',
        content: 'Budget confirmation is the key follow-up.',
        created_at: '2026-05-27T00:01:00.000Z'
      }
    ])

    const result = await handler(fakeEvent({ question: 'What follow-up was agreed?' }))

    expect(result).toEqual({
      answer: 'Send the recap and confirm budget [1].',
      sources: [
        {
          id: 'artifact-2',
          title: 'Client review summary',
          artifact_type: 'summary',
          excerpt: 'Budget confirmation is the key follow-up.'
        },
        {
          id: 'artifact-1',
          title: 'Client review transcript',
          artifact_type: 'transcript',
          excerpt: 'The team agreed to send the recap and confirm budget.'
        }
      ]
    })
    expect(mockGenerateGroqInsight).toHaveBeenCalledOnce()
    expect(String(mockGenerateGroqInsight.mock.calls[0]?.[0])).toContain('Question: What follow-up was agreed?')
    expect(String(mockGenerateGroqInsight.mock.calls[0]?.[0])).toContain('using only these meeting artifacts')
    expect(mockGenerateGroqInsight).toHaveBeenCalledWith(
      expect.stringContaining('Question: What follow-up was agreed?'),
      expect.objectContaining({
        model: 'llama-3.3-70b-versatile',
        featureKey: 'office_meeting_question_answer',
        userId: 'user-1',
        requestId: 'meeting-1',
        metadata: {
          route: 'officeMeetingAsk',
          officeId: 'office-1',
          meetingId: 'meeting-1',
          artifactCount: 2,
          sourceCount: 2,
          questionChars: 26,
        },
      }),
    )
  })

  it('requires office membership', async () => {
    mockQueryOne.mockResolvedValueOnce(null)

    await expect(handler(fakeEvent({ question: 'What happened?' }))).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Not a member of this office'
    })
    expect(mockGenerateGroqInsight).not.toHaveBeenCalled()
  })

  it('requires at least one text artifact', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'member' })
      .mockResolvedValueOnce({ id: 'meeting-1', title: 'Client review' })
    mockQueryRows.mockResolvedValueOnce([])

    await expect(handler(fakeEvent({ question: 'What happened?' }))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Add notes, a summary, or a transcript before asking this meeting'
    })
    expect(mockGenerateGroqInsight).not.toHaveBeenCalled()
  })
})
