import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()
const mockCreateNotification = vi.fn()
const mockEnsureOfficeAssistantTables = vi.fn()
const mockEnsureOfficeMeetingArtifactsTables = vi.fn()
const mockEnsureOfficeMeetingThreadChannel = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

vi.mock('~~/server/utils/notifications', () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args)
}))

vi.mock('~~/server/utils/officeAssistant', () => ({
  ensureOfficeAssistantTables: (...args: unknown[]) => mockEnsureOfficeAssistantTables(...args)
}))

vi.mock('~~/server/utils/officeMeetingArtifacts', () => ({
  ensureOfficeMeetingArtifactsTables: (...args: unknown[]) => mockEnsureOfficeMeetingArtifactsTables(...args)
}))

vi.mock('~~/server/utils/officeThreads', () => ({
  ensureOfficeMeetingThreadChannel: (...args: unknown[]) => mockEnsureOfficeMeetingThreadChannel(...args)
}))

describe('officeAssistantJobs utility', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockEnsureOfficeAssistantTables.mockResolvedValue(undefined)
    mockEnsureOfficeMeetingArtifactsTables.mockResolvedValue(undefined)
    mockEnsureOfficeMeetingThreadChannel.mockResolvedValue({ id: 'channel-1' })
    mockCreateNotification.mockResolvedValue({ id: 'notification-1' })
  })

  it('executes queued follow-up jobs as completed drafts', async () => {
    const { processOfficeAssistantJobs } = await import('~~/server/utils/officeAssistantJobs')
    const queuedJob = {
      id: 'job-1',
      office_id: 'office-1',
      user_id: 'user-1',
      job_type: 'send_follow_up',
      status: 'queued',
      title: 'Follow up: Client review',
      input: {
        source: 'meeting_artifact',
        meeting_id: 'meeting-1',
        artifact_id: 'artifact-1',
        artifact_type: 'action_items',
        meeting_title: 'Client review',
        meeting_status: 'ended',
        room: 'Meeting Room A',
        content: [
          'Follow-up checklist:',
          '- Send recap',
          '- Confirm launch date'
        ].join('\n'),
        guest_emails: ['client@example.com'],
        participant_handles: ['Paul']
      },
      result: {}
    }

    mockQueryRows.mockResolvedValueOnce([queuedJob])
    mockQueryOne
      .mockResolvedValueOnce(queuedJob)
      .mockResolvedValueOnce({
        ...queuedJob,
        status: 'completed',
        completed_at: '2026-05-25T00:01:00.000Z',
        result: {
          mode: 'draft_follow_up',
          subject: 'Follow-up: Client review',
          recipients: ['client@example.com']
        }
      })
      .mockResolvedValueOnce({ id: 'artifact-1' })

    const result = await processOfficeAssistantJobs({ officeId: 'office-1', jobId: 'job-1', limit: 1 })

    expect(result.failed).toEqual([])
    expect(result.processed[0]).toMatchObject({ id: 'job-1', status: 'completed' })
    expect(String(mockQueryOne.mock.calls[1]?.[0])).toContain('status = \'completed\'')
    const draft = JSON.parse(String(mockQueryOne.mock.calls[1]?.[1]?.[2]))
    expect(draft).toMatchObject({
      mode: 'draft_follow_up',
      subject: 'Follow-up: Client review',
      recipients: ['client@example.com'],
      source: {
        type: 'meeting_artifact',
        meetingId: 'meeting-1',
        meetingTitle: 'Client review',
        artifactId: 'artifact-1',
        artifactType: 'action_items',
        actionItemId: null,
        room: 'Meeting Room A',
        status: 'ended'
      }
    })
    expect(draft.body).toContain('Room: Meeting Room A · Status: ended')
    expect(draft.body).toContain('Next steps:\n- Send recap\n- Confirm launch date')
    expect(mockEnsureOfficeMeetingArtifactsTables).toHaveBeenCalledOnce()
    expect(String(mockQueryOne.mock.calls[2]?.[0])).toContain('UPDATE office_meeting_artifacts')
    expect(mockQueryOne.mock.calls[2]?.[1]).toEqual([
      'artifact-1',
      'meeting-1',
      'office-1',
      JSON.stringify({
        status: 'completed',
        job_id: 'job-1',
        completed_at: '2026-05-25T00:01:00.000Z'
      })
    ])
    expect(mockEnsureOfficeMeetingThreadChannel).toHaveBeenCalledWith({
      officeId: 'office-1',
      meetingId: 'meeting-1',
      actorId: 'user-1'
    })
    expect(String(mockQueryOne.mock.calls[3]?.[0])).toContain('INSERT INTO chat_messages')
    expect(mockQueryOne.mock.calls[3]?.[1]).toEqual([
      'channel-1',
      'user-1',
      'Assistant follow-up draft ready: Follow up: Client review',
      JSON.stringify({
        source: 'office_assistant_job',
        event: 'follow_up_draft_ready',
        job_id: 'job-1',
        job_type: 'send_follow_up',
        meeting_id: 'meeting-1',
        artifact_id: 'artifact-1',
        action_item_id: null,
        error: null
      })
    ])
    expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      title: 'Follow-up draft ready',
      message: 'Follow up: Client review',
      link: '/office'
    }))
  })

  it('marks source artifacts failed when job execution fails', async () => {
    const { processOfficeAssistantJobs } = await import('~~/server/utils/officeAssistantJobs')
    const queuedJob = {
      id: 'job-1',
      office_id: 'office-1',
      user_id: 'user-1',
      job_type: 'send_follow_up',
      status: 'queued',
      title: 'Follow up: Client review',
      input: {
        source: 'meeting_artifact',
        meeting_id: 'meeting-1',
        artifact_id: 'artifact-1',
        meeting_title: 'Client review',
        content: '- Send recap',
        guest_emails: ['client@example.com']
      },
      result: {}
    }

    mockQueryRows.mockResolvedValueOnce([queuedJob])
    mockQueryOne
      .mockResolvedValueOnce(queuedJob)
      .mockRejectedValueOnce(new Error('draft_failed'))
      .mockResolvedValueOnce({ id: 'job-1' })
      .mockResolvedValueOnce({ id: 'artifact-1' })

    const result = await processOfficeAssistantJobs({ officeId: 'office-1', jobId: 'job-1', limit: 1 })

    expect(result.processed).toEqual([])
    expect(result.failed).toEqual([{ id: 'job-1', error: 'draft_failed' }])
    expect(mockEnsureOfficeMeetingArtifactsTables).toHaveBeenCalledOnce()
    expect(String(mockQueryOne.mock.calls[3]?.[0])).toContain('UPDATE office_meeting_artifacts')
    expect(JSON.parse(String(mockQueryOne.mock.calls[3]?.[1]?.[3]))).toMatchObject({
      status: 'failed',
      job_id: 'job-1',
      error: 'draft_failed'
    })
    expect(String(mockQueryOne.mock.calls[4]?.[0])).toContain('INSERT INTO chat_messages')
    expect(mockQueryOne.mock.calls[4]?.[1]).toEqual([
      'channel-1',
      'user-1',
      'Assistant follow-up failed: Follow up: Client review',
      JSON.stringify({
        source: 'office_assistant_job',
        event: 'follow_up_failed',
        job_id: 'job-1',
        job_type: 'send_follow_up',
        meeting_id: 'meeting-1',
        artifact_id: 'artifact-1',
        action_item_id: null,
        error: 'draft_failed'
      })
    ])
  })

  it('marks source action items completed after generating a draft', async () => {
    const { processOfficeAssistantJobs } = await import('~~/server/utils/officeAssistantJobs')
    const queuedJob = {
      id: 'job-1',
      office_id: 'office-1',
      user_id: 'user-1',
      job_type: 'send_follow_up',
      status: 'queued',
      title: 'Follow up: Send recap',
      input: {
        source: 'meeting_action_item',
        meeting_id: 'meeting-1',
        action_item_id: 'action-1',
        meeting_title: 'Client review',
        content: '- Send recap',
        guest_emails: ['client@example.com']
      },
      result: {}
    }

    mockQueryRows.mockResolvedValueOnce([queuedJob])
    mockQueryOne
      .mockResolvedValueOnce(queuedJob)
      .mockResolvedValueOnce({
        ...queuedJob,
        status: 'completed',
        completed_at: '2026-05-25T00:01:00.000Z'
      })
      .mockResolvedValueOnce({ id: 'action-1' })

    const result = await processOfficeAssistantJobs({ officeId: 'office-1', jobId: 'job-1', limit: 1 })

    expect(result.failed).toEqual([])
    expect(result.processed[0]).toMatchObject({ id: 'job-1', status: 'completed' })
    const draft = JSON.parse(String(mockQueryOne.mock.calls[1]?.[1]?.[2]))
    expect(draft.source).toMatchObject({
      type: 'meeting_action_item',
      meetingId: 'meeting-1',
      actionItemId: 'action-1',
      artifactId: null
    })
    expect(mockEnsureOfficeMeetingArtifactsTables).toHaveBeenCalledOnce()
    expect(String(mockQueryOne.mock.calls[2]?.[0])).toContain('UPDATE office_meeting_action_items')
    expect(mockQueryOne.mock.calls[2]?.[1]).toEqual([
      'action-1',
      'meeting-1',
      'office-1',
      JSON.stringify({
        status: 'completed',
        job_id: 'job-1',
        completed_at: '2026-05-25T00:01:00.000Z'
      })
    ])
    expect(String(mockQueryOne.mock.calls[3]?.[0])).toContain('INSERT INTO chat_messages')
    expect(mockQueryOne.mock.calls[3]?.[1]).toEqual([
      'channel-1',
      'user-1',
      'Assistant follow-up draft ready: Follow up: Send recap',
      JSON.stringify({
        source: 'office_assistant_job',
        event: 'follow_up_draft_ready',
        job_id: 'job-1',
        job_type: 'send_follow_up',
        meeting_id: 'meeting-1',
        artifact_id: null,
        action_item_id: 'action-1',
        error: null
      })
    ])
  })
})
