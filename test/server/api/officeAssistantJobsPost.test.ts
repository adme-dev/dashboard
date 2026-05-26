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
const mockEnsureOfficeAssistantTables = vi.fn()
const mockEnsureOfficeMeetingArtifactsTables = vi.fn()
const mockLogOfficeAuditEvent = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('~~/server/utils/officeAssistant', () => ({
  ensureOfficeAssistantTables: (...args: unknown[]) => mockEnsureOfficeAssistantTables(...args)
}))

vi.mock('~~/server/utils/officeMeetingArtifacts', () => ({
  ensureOfficeMeetingArtifactsTables: (...args: unknown[]) => mockEnsureOfficeMeetingArtifactsTables(...args)
}))

vi.mock('~~/server/utils/officeAudit', () => ({
  logOfficeAuditEvent: (...args: unknown[]) => mockLogOfficeAuditEvent(...args)
}))

const { default: handler } = await import(
  '../../../../server/api/office/[officeId]/assistant/jobs.post'
)

function fakeEvent(body: Record<string, unknown>) {
  return {
    context: { params: { officeId: 'office-1' } },
    body
  } satisfies TestEvent
}

describe('POST /api/office/:officeId/assistant/jobs', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset()
    mockQueryOne.mockReset()
    mockEnsureOfficeAssistantTables.mockReset()
    mockEnsureOfficeMeetingArtifactsTables.mockReset()
    mockLogOfficeAuditEvent.mockReset()

    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockEnsureOfficeAssistantTables.mockResolvedValue(undefined)
    mockEnsureOfficeMeetingArtifactsTables.mockResolvedValue(undefined)
    mockLogOfficeAuditEvent.mockResolvedValue(undefined)
  })

  it('creates approval-gated follow-up jobs from meeting artifacts', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({ artifact_type: 'action_items', metadata: {} })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'job-1',
        office_id: 'office-1',
        job_type: 'send_follow_up',
        status: 'waiting_approval',
        title: 'Follow up: Client review',
        approval_required: true,
        created_at: '2026-05-25T00:00:00.000Z'
      })
      .mockResolvedValueOnce({ id: 'artifact-1' })

    const result = await handler(fakeEvent({
      job_type: 'send_follow_up',
      title: 'Follow up: Client review',
      input: {
        source: 'meeting_artifact',
        meeting_id: 'meeting-1',
        artifact_id: 'artifact-1',
        content: '- Send recap'
      },
      approval_required: true
    }))

    expect(result.job).toMatchObject({
      id: 'job-1',
      status: 'waiting_approval',
      approval_required: true
    })
    expect(mockEnsureOfficeAssistantTables).toHaveBeenCalled()
    expect(mockEnsureOfficeMeetingArtifactsTables).toHaveBeenCalledOnce()
    expect(mockQueryOne.mock.calls[3]?.[1]).toEqual([
      'office-1',
      null,
      'user-1',
      'send_follow_up',
      'waiting_approval',
      'Follow up: Client review',
      JSON.stringify({
        source: 'meeting_artifact',
        meeting_id: 'meeting-1',
        artifact_id: 'artifact-1',
        content: '- Send recap'
      }),
      true
    ])
    expect(String(mockQueryOne.mock.calls[4]?.[0])).toContain('UPDATE office_meeting_artifacts')
    expect(mockQueryOne.mock.calls[4]?.[1]).toEqual([
      'artifact-1',
      'meeting-1',
      'office-1',
      JSON.stringify({
        status: 'waiting_approval',
        job_id: 'job-1',
        created_at: '2026-05-25T00:00:00.000Z'
      })
    ])
    expect(mockLogOfficeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      officeId: 'office-1',
      actorId: 'user-1',
      action: 'assistant_job.created',
      targetType: 'office_assistant_job',
      targetId: 'job-1',
      metadata: {
        jobType: 'send_follow_up',
        approvalRequired: true
      }
    }))
  })

  it('creates jobs linked to watches in the same office', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({ id: '11111111-1111-4111-8111-111111111111' })
      .mockResolvedValueOnce({
        id: 'job-1',
        office_id: 'office-1',
        watch_id: '11111111-1111-4111-8111-111111111111',
        job_type: 'notify',
        status: 'queued',
        title: 'Watch alert',
        approval_required: false
      })

    const result = await handler(fakeEvent({
      watch_id: '11111111-1111-4111-8111-111111111111',
      job_type: 'notify',
      title: 'Watch alert',
      input: {
        signal: 'guest_waiting'
      }
    }))

    expect(result.job).toMatchObject({
      id: 'job-1',
      watch_id: '11111111-1111-4111-8111-111111111111'
    })
    expect(String(mockQueryOne.mock.calls[1]?.[0])).toContain('office_assistant_watches')
    expect(mockQueryOne.mock.calls[1]?.[1]).toEqual([
      '11111111-1111-4111-8111-111111111111',
      'office-1'
    ])
    expect(mockQueryOne.mock.calls[2]?.[1]).toEqual([
      'office-1',
      '11111111-1111-4111-8111-111111111111',
      'user-1',
      'notify',
      'queued',
      'Watch alert',
      JSON.stringify({ signal: 'guest_waiting' }),
      false
    ])
  })

  it('creates approval-gated follow-up jobs from structured action items', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({ status: 'open', metadata: {} })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'job-1',
        office_id: 'office-1',
        job_type: 'send_follow_up',
        status: 'waiting_approval',
        title: 'Follow up: Send recap',
        approval_required: true,
        created_at: '2026-05-25T00:00:00.000Z'
      })
      .mockResolvedValueOnce({ id: 'action-1' })

    const result = await handler(fakeEvent({
      job_type: 'send_follow_up',
      title: 'Follow up: Send recap',
      input: {
        source: 'meeting_action_item',
        meeting_id: 'meeting-1',
        action_item_id: 'action-1',
        content: '- Send recap'
      },
      approval_required: true
    }))

    expect(result.job).toMatchObject({
      id: 'job-1',
      status: 'waiting_approval'
    })
    expect(mockEnsureOfficeMeetingArtifactsTables).toHaveBeenCalledOnce()
    expect(String(mockQueryOne.mock.calls[1]?.[0])).toContain('office_meeting_action_items')
    expect(mockQueryOne.mock.calls[3]?.[1]).toEqual([
      'office-1',
      null,
      'user-1',
      'send_follow_up',
      'waiting_approval',
      'Follow up: Send recap',
      JSON.stringify({
        source: 'meeting_action_item',
        meeting_id: 'meeting-1',
        action_item_id: 'action-1',
        content: '- Send recap'
      }),
      true
    ])
    expect(String(mockQueryOne.mock.calls[4]?.[0])).toContain('UPDATE office_meeting_action_items')
    expect(mockQueryOne.mock.calls[4]?.[1]).toEqual([
      'action-1',
      'meeting-1',
      'office-1',
      JSON.stringify({
        status: 'waiting_approval',
        job_id: 'job-1',
        created_at: '2026-05-25T00:00:00.000Z'
      })
    ])
  })

  it('rejects jobs linked to watches outside the office', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce(null)

    await expect(handler(fakeEvent({
      watch_id: '11111111-1111-4111-8111-111111111111',
      job_type: 'notify',
      title: 'Watch alert',
      input: {
        signal: 'guest_waiting'
      }
    }))).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Assistant watch not found'
    })

    expect(mockQueryOne).toHaveBeenCalledTimes(2)
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })

  it('blocks duplicate follow-up jobs for the same artifact', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({ artifact_type: 'action_items', metadata: {} })
      .mockResolvedValueOnce({ id: 'job-existing', status: 'waiting_approval' })

    await expect(handler(fakeEvent({
      job_type: 'send_follow_up',
      title: 'Follow up: Client review',
      input: {
        source: 'meeting_artifact',
        meeting_id: 'meeting-1',
        artifact_id: 'artifact-1',
        content: '- Send recap'
      },
      approval_required: true
    }))).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'A follow-up job already exists for this artifact'
    })
  })

  it('blocks follow-up jobs for already delivered artifacts', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({
        artifact_type: 'action_items',
        metadata: {
          follow_up_delivery: {
            status: 'sent',
            recipients: ['client@example.com']
          }
        }
      })

    await expect(handler(fakeEvent({
      job_type: 'send_follow_up',
      title: 'Follow up: Client review',
      input: {
        source: 'meeting_artifact',
        meeting_id: 'meeting-1',
        artifact_id: 'artifact-1',
        content: '- Send recap'
      },
      approval_required: true
    }))).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Follow-up has already been sent for this artifact'
    })
  })

  it('blocks follow-up jobs for untouched placeholder artifacts', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({
        artifact_type: 'action_items',
        metadata: {
          status: 'placeholder'
        }
      })

    await expect(handler(fakeEvent({
      job_type: 'send_follow_up',
      title: 'Follow up: Client review',
      input: {
        source: 'meeting_artifact',
        meeting_id: 'meeting-1',
        artifact_id: 'artifact-1',
        content: 'Action items will be generated when meeting notes are available.'
      },
      approval_required: true
    }))).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Add real action items before creating a follow-up'
    })

    expect(mockQueryOne).toHaveBeenCalledTimes(2)
  })

  it('blocks follow-up jobs for non-action-item artifacts', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'admin' })
      .mockResolvedValueOnce({
        artifact_type: 'summary',
        metadata: {
          status: 'edited'
        }
      })

    await expect(handler(fakeEvent({
      job_type: 'send_follow_up',
      title: 'Follow up: Client review',
      input: {
        source: 'meeting_artifact',
        meeting_id: 'meeting-1',
        artifact_id: 'artifact-1',
        content: 'Summary text'
      },
      approval_required: true
    }))).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Follow-ups can only be created from action item artifacts'
    })

    expect(mockQueryOne).toHaveBeenCalledTimes(2)
  })

  it('blocks users who are not office members', async () => {
    mockQueryOne.mockResolvedValueOnce(null)

    await expect(handler(fakeEvent({
      job_type: 'send_follow_up',
      title: 'Follow up',
      input: {},
      approval_required: true
    }))).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Not a member of this office'
    })
  })
})
