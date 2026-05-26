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
const mockProcessOfficeAssistantJobs = vi.fn()
const mockLogOfficeAuditEvent = vi.fn()
const mockIsEmailConfigured = vi.fn()
const mockSendOfficeFollowUpEmail = vi.fn()
const mockEnsureOfficeMeetingThreadChannel = vi.fn()

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

vi.mock('~~/server/utils/officeAssistantJobs', () => ({
  processOfficeAssistantJobs: (...args: unknown[]) => mockProcessOfficeAssistantJobs(...args)
}))

vi.mock('~~/server/utils/email', () => ({
  isEmailConfigured: (...args: unknown[]) => mockIsEmailConfigured(...args),
  sendOfficeFollowUpEmail: (...args: unknown[]) => mockSendOfficeFollowUpEmail(...args)
}))

vi.mock('~~/server/utils/officeAudit', () => ({
  logOfficeAuditEvent: (...args: unknown[]) => mockLogOfficeAuditEvent(...args)
}))

vi.mock('~~/server/utils/officeThreads', () => ({
  ensureOfficeMeetingThreadChannel: (...args: unknown[]) => mockEnsureOfficeMeetingThreadChannel(...args)
}))

const { default: handler } = await import(
  '../../../../server/api/office/[officeId]/assistant/jobs/[jobId].patch'
)

function fakeEvent(body: Record<string, unknown>) {
  return {
    context: { params: { officeId: 'office-1', jobId: 'job-1' } },
    body
  } satisfies TestEvent
}

describe('PATCH /api/office/:officeId/assistant/jobs/:jobId', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset()
    mockQueryOne.mockReset()
    mockEnsureOfficeAssistantTables.mockReset()
    mockEnsureOfficeMeetingArtifactsTables.mockReset()
    mockProcessOfficeAssistantJobs.mockReset()
    mockLogOfficeAuditEvent.mockReset()
    mockIsEmailConfigured.mockReset()
    mockSendOfficeFollowUpEmail.mockReset()
    mockEnsureOfficeMeetingThreadChannel.mockReset()

    mockRequireAuth.mockResolvedValue({ id: 'user-1', role: 'member' })
    mockEnsureOfficeAssistantTables.mockResolvedValue(undefined)
    mockEnsureOfficeMeetingArtifactsTables.mockResolvedValue(undefined)
    mockProcessOfficeAssistantJobs.mockResolvedValue({ processed: [], failed: [] })
    mockLogOfficeAuditEvent.mockResolvedValue(undefined)
    mockIsEmailConfigured.mockReturnValue(true)
    mockSendOfficeFollowUpEmail.mockResolvedValue(undefined)
    mockEnsureOfficeMeetingThreadChannel.mockResolvedValue({ id: 'channel-1' })
  })

  it('approves a waiting assistant job into the queue', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'member' })
      .mockResolvedValueOnce({
        id: 'job-1',
        office_id: 'office-1',
        user_id: 'user-1',
        job_type: 'send_follow_up',
        status: 'waiting_approval',
        input: {
          source: 'meeting_artifact',
          meeting_id: 'meeting-1',
          artifact_id: 'artifact-1'
        }
      })
      .mockResolvedValueOnce({
        id: 'job-1',
        office_id: 'office-1',
        user_id: 'user-1',
        job_type: 'send_follow_up',
        status: 'queued'
      })
      .mockResolvedValueOnce({ id: 'artifact-1' })
    mockProcessOfficeAssistantJobs.mockResolvedValueOnce({
      processed: [{
        id: 'job-1',
        office_id: 'office-1',
        user_id: 'user-1',
        job_type: 'send_follow_up',
        status: 'completed'
      }],
      failed: []
    })

    const result = await handler(fakeEvent({ action: 'approve' }))

    expect(result.job).toMatchObject({ id: 'job-1', status: 'completed' })
    expect(result.execution).toMatchObject({ failed: [] })
    expect(String(mockQueryOne.mock.calls[2]?.[0])).toContain('status = \'queued\'')
    expect(mockQueryOne.mock.calls[2]?.[1]).toEqual(['job-1', 'office-1', 'user-1'])
    expect(mockProcessOfficeAssistantJobs).toHaveBeenCalledWith({
      officeId: 'office-1',
      jobId: 'job-1',
      limit: 1
    })
    expect(mockEnsureOfficeMeetingArtifactsTables).toHaveBeenCalledOnce()
    expect(String(mockQueryOne.mock.calls[3]?.[0])).toContain('UPDATE office_meeting_artifacts')
    expect(mockQueryOne.mock.calls[3]?.[1]).toEqual([
      'artifact-1',
      'meeting-1',
      'office-1',
      expect.stringContaining('"status":"queued"')
    ])
    expect(mockLogOfficeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'assistant_job.approved',
      targetId: 'job-1',
      metadata: {
        jobType: 'send_follow_up',
        previousStatus: 'waiting_approval',
        status: 'queued'
      }
    }))
  })

  it('updates structured action item metadata when approving a follow-up job', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'member' })
      .mockResolvedValueOnce({
        id: 'job-1',
        office_id: 'office-1',
        user_id: 'user-1',
        job_type: 'send_follow_up',
        status: 'waiting_approval',
        input: {
          source: 'meeting_action_item',
          meeting_id: 'meeting-1',
          action_item_id: 'action-1'
        }
      })
      .mockResolvedValueOnce({
        id: 'job-1',
        office_id: 'office-1',
        user_id: 'user-1',
        job_type: 'send_follow_up',
        status: 'queued'
      })
      .mockResolvedValueOnce({ id: 'action-1' })
    mockProcessOfficeAssistantJobs.mockResolvedValueOnce({
      processed: [{
        id: 'job-1',
        office_id: 'office-1',
        user_id: 'user-1',
        job_type: 'send_follow_up',
        status: 'completed'
      }],
      failed: []
    })

    const result = await handler(fakeEvent({ action: 'approve' }))

    expect(result.job).toMatchObject({ id: 'job-1', status: 'completed' })
    expect(String(mockQueryOne.mock.calls[3]?.[0])).toContain('UPDATE office_meeting_action_items')
    expect(mockQueryOne.mock.calls[3]?.[1]).toEqual([
      'action-1',
      'meeting-1',
      'office-1',
      'follow_up_job',
      expect.stringContaining('"status":"queued"')
    ])
    expect(mockProcessOfficeAssistantJobs).toHaveBeenCalledWith({
      officeId: 'office-1',
      jobId: 'job-1',
      limit: 1
    })
  })

  it('prevents non-admin members from managing another user job', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'member' })
      .mockResolvedValueOnce({
        id: 'job-1',
        office_id: 'office-1',
        user_id: 'user-2',
        job_type: 'send_follow_up',
        status: 'waiting_approval'
      })

    await expect(handler(fakeEvent({ action: 'approve' }))).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'You cannot manage this assistant job'
    })
  })

  it('allows platform admins to manage another user assistant job', async () => {
    mockRequireAuth.mockResolvedValueOnce({ id: 'owner-1', role: 'owner' })
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'member' })
      .mockResolvedValueOnce({
        id: 'job-1',
        office_id: 'office-1',
        user_id: 'user-2',
        job_type: 'send_follow_up',
        status: 'waiting_approval',
        input: {}
      })
      .mockResolvedValueOnce({
        id: 'job-1',
        office_id: 'office-1',
        user_id: 'user-2',
        job_type: 'send_follow_up',
        status: 'queued'
      })
    mockProcessOfficeAssistantJobs.mockResolvedValueOnce({
      processed: [{
        id: 'job-1',
        office_id: 'office-1',
        user_id: 'user-2',
        job_type: 'send_follow_up',
        status: 'completed'
      }],
      failed: []
    })

    const result = await handler(fakeEvent({ action: 'approve' }))

    expect(result.job).toMatchObject({ id: 'job-1', status: 'completed' })
    expect(mockQueryOne.mock.calls[2]?.[1]).toEqual(['job-1', 'office-1', 'owner-1'])
  })

  it('sends a completed follow-up draft to recipients', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'member' })
      .mockResolvedValueOnce({
        id: 'job-1',
        office_id: 'office-1',
        user_id: 'user-1',
        job_type: 'send_follow_up',
        status: 'completed',
        title: 'Follow up: Client review',
        result: {
          subject: 'Follow-up: Client review',
          recipients: ['client@example.com'],
          body: 'Thanks for joining.\n- Confirm launch date',
          edited_at: '2026-05-25T00:00:00.000Z',
          source: {
            meetingId: 'meeting-1',
            meetingTitle: 'Client review',
            artifactId: 'artifact-1'
          }
        }
      })
      .mockResolvedValueOnce({ guest_emails: [' Client@Example.com '] })
      .mockResolvedValueOnce({
        id: 'job-1',
        office_id: 'office-1',
        user_id: 'user-1',
        job_type: 'send_follow_up',
        status: 'completed',
        result: {
          delivery: { status: 'sent', recipients: ['client@example.com'] }
        }
      })
      .mockResolvedValueOnce({ id: 'artifact-1' })

    const result = await handler(fakeEvent({ action: 'send' }))

    expect(result.job).toMatchObject({ id: 'job-1', status: 'completed' })
    expect(mockSendOfficeFollowUpEmail).toHaveBeenCalledWith({
      to: 'client@example.com',
      subject: 'Follow-up: Client review',
      body: 'Thanks for joining.\n- Confirm launch date',
      meetingTitle: 'Client review'
    }, expect.any(Object))
    expect(JSON.parse(String(mockQueryOne.mock.calls[3]?.[1]?.[2]))).toMatchObject({
      delivery: {
        status: 'sent',
        recipients: ['client@example.com']
      }
    })
    expect(String(mockQueryOne.mock.calls[4]?.[0])).toContain('UPDATE office_meeting_artifacts')
    expect(mockQueryOne.mock.calls[4]?.[1]).toEqual([
      'artifact-1',
      'meeting-1',
      'office-1',
      expect.stringContaining('"edited_at":"2026-05-25T00:00:00.000Z"')
    ])
    expect(mockEnsureOfficeMeetingThreadChannel).toHaveBeenCalledWith({
      officeId: 'office-1',
      meetingId: 'meeting-1',
      actorId: 'user-1'
    })
    expect(String(mockQueryOne.mock.calls[5]?.[0])).toContain('INSERT INTO chat_messages')
    expect(mockQueryOne.mock.calls[5]?.[1]).toEqual([
      'channel-1',
      'user-1',
      'Follow-up sent: Follow-up: Client review',
      JSON.stringify({
        source: 'office_assistant_job',
        event: 'follow_up_sent',
        job_id: 'job-1',
        meeting_id: 'meeting-1',
        artifact_id: 'artifact-1',
        action_item_id: null,
        recipients: ['client@example.com']
      })
    ])
    expect(mockLogOfficeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'assistant_job.sent',
      targetId: 'job-1',
      metadata: {
        jobType: 'send_follow_up',
        recipients: ['client@example.com']
      }
    }))
  })

  it('marks structured action item follow-ups as sent after delivery', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'member' })
      .mockResolvedValueOnce({
        id: 'job-1',
        office_id: 'office-1',
        user_id: 'user-1',
        job_type: 'send_follow_up',
        status: 'completed',
        title: 'Follow up: Send recap',
        result: {
          subject: 'Follow-up: Send recap',
          recipients: ['client@example.com'],
          body: 'Thanks for joining.\n- Send recap',
          edited_at: '2026-05-25T00:00:00.000Z',
          source: {
            meetingId: 'meeting-1',
            meetingTitle: 'Client review',
            actionItemId: 'action-1'
          }
        }
      })
      .mockResolvedValueOnce({ guest_emails: ['client@example.com'] })
      .mockResolvedValueOnce({
        id: 'job-1',
        office_id: 'office-1',
        user_id: 'user-1',
        job_type: 'send_follow_up',
        status: 'completed',
        result: {
          delivery: { status: 'sent', recipients: ['client@example.com'] }
        }
      })
      .mockResolvedValueOnce({ id: 'action-1' })

    const result = await handler(fakeEvent({ action: 'send' }))

    expect(result.job).toMatchObject({ id: 'job-1', status: 'completed' })
    expect(mockSendOfficeFollowUpEmail).toHaveBeenCalledWith({
      to: 'client@example.com',
      subject: 'Follow-up: Send recap',
      body: 'Thanks for joining.\n- Send recap',
      meetingTitle: 'Client review'
    }, expect.any(Object))
    expect(String(mockQueryOne.mock.calls[4]?.[0])).toContain('UPDATE office_meeting_action_items')
    expect(mockQueryOne.mock.calls[4]?.[1]).toEqual([
      'action-1',
      'meeting-1',
      'office-1',
      'follow_up_delivery',
      expect.stringContaining('"status":"sent"')
    ])
    expect(String(mockQueryOne.mock.calls[5]?.[0])).toContain('INSERT INTO chat_messages')
    expect(mockQueryOne.mock.calls[5]?.[1]).toEqual([
      'channel-1',
      'user-1',
      'Follow-up sent: Follow-up: Send recap',
      JSON.stringify({
        source: 'office_assistant_job',
        event: 'follow_up_sent',
        job_id: 'job-1',
        meeting_id: 'meeting-1',
        artifact_id: null,
        action_item_id: 'action-1',
        recipients: ['client@example.com']
      })
    ])
  })

  it('rejects meeting follow-up recipients outside the source guest list', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'member' })
      .mockResolvedValueOnce({
        id: 'job-1',
        office_id: 'office-1',
        user_id: 'user-1',
        job_type: 'send_follow_up',
        status: 'completed',
        title: 'Follow up: Client review',
        result: {
          subject: 'Follow-up: Client review',
          recipients: ['other@example.com'],
          body: 'Thanks for joining.',
          source: {
            meetingId: 'meeting-1',
            meetingTitle: 'Client review',
            artifactId: 'artifact-1'
          }
        }
      })
      .mockResolvedValueOnce({ guest_emails: ['client@example.com'] })

    await expect(handler(fakeEvent({ action: 'send' }))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Follow-up recipients must belong to the source meeting guest list'
    })

    expect(mockSendOfficeFollowUpEmail).not.toHaveBeenCalled()
  })

  it('blocks duplicate follow-up sends', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'member' })
      .mockResolvedValueOnce({
        id: 'job-1',
        office_id: 'office-1',
        user_id: 'user-1',
        job_type: 'send_follow_up',
        status: 'completed',
        title: 'Follow up: Client review',
        result: {
          subject: 'Follow-up: Client review',
          recipients: ['client@example.com'],
          body: 'Already sent',
          delivery: { status: 'sent' }
        }
      })

    await expect(handler(fakeEvent({ action: 'send' }))).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Follow-up has already been sent'
    })
    expect(mockSendOfficeFollowUpEmail).not.toHaveBeenCalled()
  })

  it('rejects sending non-follow-up assistant jobs', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'member' })
      .mockResolvedValueOnce({
        id: 'job-1',
        office_id: 'office-1',
        user_id: 'user-1',
        job_type: 'notify',
        status: 'completed',
        title: 'Office assistant',
        result: {}
      })

    await expect(handler(fakeEvent({ action: 'send' }))).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Assistant job is not a completed follow-up draft'
    })
    expect(mockSendOfficeFollowUpEmail).not.toHaveBeenCalled()
  })

  it('rejects sending incomplete follow-up drafts', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'member' })
      .mockResolvedValueOnce({
        id: 'job-1',
        office_id: 'office-1',
        user_id: 'user-1',
        job_type: 'send_follow_up',
        status: 'completed',
        title: 'Follow up: Client review',
        result: {
          subject: 'Follow-up: Client review',
          recipients: [],
          body: ''
        }
      })

    await expect(handler(fakeEvent({ action: 'send' }))).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Follow-up draft has no recipients or body'
    })
    expect(mockSendOfficeFollowUpEmail).not.toHaveBeenCalled()
  })

  it('rejects sending when email delivery is not configured', async () => {
    mockIsEmailConfigured.mockReturnValueOnce(false)
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'member' })
      .mockResolvedValueOnce({
        id: 'job-1',
        office_id: 'office-1',
        user_id: 'user-1',
        job_type: 'send_follow_up',
        status: 'completed',
        title: 'Follow up: Client review',
        result: {
          subject: 'Follow-up: Client review',
          recipients: ['client@example.com'],
          body: 'Ready to send'
        }
      })

    await expect(handler(fakeEvent({ action: 'send' }))).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'Email delivery is not configured'
    })
    expect(mockSendOfficeFollowUpEmail).not.toHaveBeenCalled()
  })

  it('updates an unsent completed follow-up draft', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'member' })
      .mockResolvedValueOnce({
        id: 'job-1',
        office_id: 'office-1',
        user_id: 'user-1',
        job_type: 'send_follow_up',
        status: 'completed',
        title: 'Follow up: Client review',
        result: {
          subject: 'Follow-up: Client review',
          body: 'Old body',
          recipients: ['client@example.com'],
          source: {
            meetingId: 'meeting-1',
            artifactId: 'artifact-1'
          }
        }
      })
      .mockResolvedValueOnce({ guest_emails: ['client@example.com', ' Updated@Example.com '] })
      .mockResolvedValueOnce({
        id: 'job-1',
        office_id: 'office-1',
        user_id: 'user-1',
        job_type: 'send_follow_up',
        status: 'completed',
        result: {
          subject: 'Updated subject',
          body: 'Updated body'
        }
      })
      .mockResolvedValueOnce({ id: 'artifact-1' })

    const result = await handler(fakeEvent({
      action: 'update_draft',
      recipients: ['updated@example.com'],
      subject: 'Updated subject',
      body: 'Updated body'
    }))

    expect(result.job).toMatchObject({ id: 'job-1', status: 'completed' })
    expect(JSON.parse(String(mockQueryOne.mock.calls[3]?.[1]?.[2]))).toMatchObject({
      subject: 'Updated subject',
      body: 'Updated body',
      recipients: ['updated@example.com'],
      edited_by: 'user-1'
    })
    expect(String(mockQueryOne.mock.calls[4]?.[0])).toContain('UPDATE office_meeting_artifacts')
    expect(JSON.parse(String(mockQueryOne.mock.calls[4]?.[1]?.[3]))).toMatchObject({
      status: 'completed',
      job_id: 'job-1',
      edited_at: expect.any(String)
    })
    expect(String(mockQueryOne.mock.calls[5]?.[0])).toContain('INSERT INTO chat_messages')
    expect(mockQueryOne.mock.calls[5]?.[1]).toEqual([
      'channel-1',
      'user-1',
      'Follow-up draft updated: Updated subject',
      JSON.stringify({
        source: 'office_assistant_job',
        event: 'follow_up_draft_updated',
        job_id: 'job-1',
        meeting_id: 'meeting-1',
        artifact_id: 'artifact-1',
        action_item_id: null
      })
    ])
    expect(mockLogOfficeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'assistant_job.draft_updated',
      targetId: 'job-1'
    }))
  })

  it('updates structured action item metadata when editing a draft', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'member' })
      .mockResolvedValueOnce({
        id: 'job-1',
        office_id: 'office-1',
        user_id: 'user-1',
        job_type: 'send_follow_up',
        status: 'completed',
        title: 'Follow up: Send recap',
        result: {
          subject: 'Follow-up: Send recap',
          body: 'Old body',
          recipients: ['client@example.com'],
          source: {
            meetingId: 'meeting-1',
            actionItemId: 'action-1'
          }
        }
      })
      .mockResolvedValueOnce({ guest_emails: ['client@example.com'] })
      .mockResolvedValueOnce({
        id: 'job-1',
        office_id: 'office-1',
        user_id: 'user-1',
        job_type: 'send_follow_up',
        status: 'completed',
        result: {
          subject: 'Updated subject',
          body: 'Updated body'
        }
      })
      .mockResolvedValueOnce({ id: 'action-1' })

    const result = await handler(fakeEvent({
      action: 'update_draft',
      subject: 'Updated subject',
      body: 'Updated body'
    }))

    expect(result.job).toMatchObject({ id: 'job-1', status: 'completed' })
    expect(String(mockQueryOne.mock.calls[4]?.[0])).toContain('UPDATE office_meeting_action_items')
    expect(mockQueryOne.mock.calls[4]?.[1]).toEqual([
      'action-1',
      'meeting-1',
      'office-1',
      'follow_up_job',
      expect.stringContaining('"status":"completed"')
    ])
    expect(String(mockQueryOne.mock.calls[5]?.[0])).toContain('INSERT INTO chat_messages')
    expect(mockQueryOne.mock.calls[5]?.[1]).toEqual([
      'channel-1',
      'user-1',
      'Follow-up draft updated: Updated subject',
      JSON.stringify({
        source: 'office_assistant_job',
        event: 'follow_up_draft_updated',
        job_id: 'job-1',
        meeting_id: 'meeting-1',
        artifact_id: null,
        action_item_id: 'action-1'
      })
    ])
  })

  it('updates structured action item metadata when cancelling a queued follow-up', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'member' })
      .mockResolvedValueOnce({
        id: 'job-1',
        office_id: 'office-1',
        user_id: 'user-1',
        job_type: 'send_follow_up',
        status: 'queued',
        input: {
          source: 'meeting_action_item',
          meeting_id: 'meeting-1',
          action_item_id: 'action-1'
        }
      })
      .mockResolvedValueOnce({
        id: 'job-1',
        office_id: 'office-1',
        user_id: 'user-1',
        job_type: 'send_follow_up',
        status: 'cancelled',
        title: 'Follow up: Send recap'
      })
      .mockResolvedValueOnce({ id: 'action-1' })

    const result = await handler(fakeEvent({ action: 'cancel' }))

    expect(result.job).toMatchObject({ id: 'job-1', status: 'cancelled' })
    expect(String(mockQueryOne.mock.calls[3]?.[0])).toContain('UPDATE office_meeting_action_items')
    expect(mockQueryOne.mock.calls[3]?.[1]).toEqual([
      'action-1',
      'meeting-1',
      'office-1',
      'follow_up_job',
      expect.stringContaining('"status":"cancelled"')
    ])
    expect(String(mockQueryOne.mock.calls[4]?.[0])).toContain('INSERT INTO chat_messages')
    expect(mockQueryOne.mock.calls[4]?.[1]).toEqual([
      'channel-1',
      'user-1',
      'Follow-up cancelled: Follow up: Send recap',
      JSON.stringify({
        source: 'office_assistant_job',
        event: 'follow_up_cancelled',
        job_id: 'job-1',
        meeting_id: 'meeting-1',
        artifact_id: null,
        action_item_id: 'action-1'
      })
    ])
  })

  it('writes a meeting thread event when cancelling an artifact follow-up', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'member' })
      .mockResolvedValueOnce({
        id: 'job-1',
        office_id: 'office-1',
        user_id: 'user-1',
        job_type: 'send_follow_up',
        status: 'queued',
        input: {
          source: 'meeting_artifact',
          meeting_id: 'meeting-1',
          artifact_id: 'artifact-1'
        }
      })
      .mockResolvedValueOnce({
        id: 'job-1',
        office_id: 'office-1',
        user_id: 'user-1',
        job_type: 'send_follow_up',
        status: 'cancelled',
        title: 'Follow up: Client review'
      })
      .mockResolvedValueOnce({ id: 'artifact-1' })

    const result = await handler(fakeEvent({ action: 'cancel' }))

    expect(result.job).toMatchObject({ id: 'job-1', status: 'cancelled' })
    expect(String(mockQueryOne.mock.calls[3]?.[0])).toContain('UPDATE office_meeting_artifacts')
    expect(mockQueryOne.mock.calls[3]?.[1]).toEqual([
      'artifact-1',
      'meeting-1',
      'office-1',
      expect.stringContaining('"status":"cancelled"')
    ])
    expect(String(mockQueryOne.mock.calls[4]?.[0])).toContain('INSERT INTO chat_messages')
    expect(mockQueryOne.mock.calls[4]?.[1]).toEqual([
      'channel-1',
      'user-1',
      'Follow-up cancelled: Follow up: Client review',
      JSON.stringify({
        source: 'office_assistant_job',
        event: 'follow_up_cancelled',
        job_id: 'job-1',
        meeting_id: 'meeting-1',
        artifact_id: 'artifact-1',
        action_item_id: null
      })
    ])
  })

  it('rejects draft recipient edits outside the source meeting guest list', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'member' })
      .mockResolvedValueOnce({
        id: 'job-1',
        office_id: 'office-1',
        user_id: 'user-1',
        job_type: 'send_follow_up',
        status: 'completed',
        title: 'Follow up: Client review',
        result: {
          subject: 'Follow-up: Client review',
          body: 'Draft body',
          recipients: ['client@example.com'],
          source: {
            meetingId: 'meeting-1',
            artifactId: 'artifact-1'
          }
        }
      })
      .mockResolvedValueOnce({ guest_emails: ['client@example.com'] })

    await expect(handler(fakeEvent({
      action: 'update_draft',
      recipients: ['other@example.com']
    }))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Follow-up recipients must belong to the source meeting guest list'
    })
  })

  it('rejects draft updates with an empty recipient list', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'member' })
      .mockResolvedValueOnce({
        id: 'job-1',
        office_id: 'office-1',
        user_id: 'user-1',
        job_type: 'send_follow_up',
        status: 'completed',
        title: 'Follow up: Client review',
        result: {
          subject: 'Follow-up: Client review',
          body: 'Body',
          recipients: ['client@example.com']
        }
      })

    await expect(handler(fakeEvent({
      action: 'update_draft',
      recipients: [],
      subject: 'Updated subject',
      body: 'Updated body'
    }))).rejects.toThrow()
  })

  it('rejects no-op draft updates', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'member' })
      .mockResolvedValueOnce({
        id: 'job-1',
        office_id: 'office-1',
        user_id: 'user-1',
        job_type: 'send_follow_up',
        status: 'completed',
        title: 'Follow up: Client review',
        result: {
          subject: 'Follow-up: Client review',
          body: 'Body',
          recipients: ['client@example.com']
        }
      })

    await expect(handler(fakeEvent({ action: 'update_draft' }))).rejects.toThrow()
  })

  it('rejects edits to sent follow-up drafts', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'member-1', role: 'member' })
      .mockResolvedValueOnce({
        id: 'job-1',
        office_id: 'office-1',
        user_id: 'user-1',
        job_type: 'send_follow_up',
        status: 'completed',
        title: 'Follow up: Client review',
        result: {
          subject: 'Follow-up: Client review',
          body: 'Body',
          recipients: ['client@example.com'],
          delivery: { status: 'sent' }
        }
      })

    await expect(handler(fakeEvent({
      action: 'update_draft',
      subject: 'Changed subject'
    }))).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Sent follow-up drafts cannot be edited'
    })
  })
})
