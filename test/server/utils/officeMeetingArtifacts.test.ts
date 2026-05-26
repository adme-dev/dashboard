import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockExecute = vi.fn()
const mockEnsureOfficeLobbyRequestsTable = vi.fn()
const mockEnsureOfficeLobbiesTable = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  execute: (...args: unknown[]) => mockExecute(...args)
}))

vi.mock('~~/server/utils/officeLobbyRequests', () => ({
  ensureOfficeLobbyRequestsTable: (...args: unknown[]) => mockEnsureOfficeLobbyRequestsTable(...args)
}))

vi.mock('~~/server/utils/officeLobbies', () => ({
  ensureOfficeLobbiesTable: (...args: unknown[]) => mockEnsureOfficeLobbiesTable(...args)
}))

describe('officeMeetingArtifacts utility', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockExecute.mockResolvedValue(undefined)
    mockEnsureOfficeLobbyRequestsTable.mockResolvedValue(undefined)
    mockEnsureOfficeLobbiesTable.mockResolvedValue(undefined)
  })

  it('creates meeting session and artifact tables once', async () => {
    const { ensureOfficeMeetingArtifactsTables } = await import('~~/server/utils/officeMeetingArtifacts')

    await ensureOfficeMeetingArtifactsTables()
    await ensureOfficeMeetingArtifactsTables()

    expect(mockExecute).toHaveBeenCalledTimes(12)
    expect(mockExecute.mock.calls[0][0]).toContain('CREATE TABLE IF NOT EXISTS office_meeting_sessions')
    expect(mockExecute.mock.calls[1][0]).toContain('ALTER TABLE office_meeting_sessions')
    expect(mockExecute.mock.calls[4][0]).toContain('CREATE TABLE IF NOT EXISTS office_meeting_artifacts')
    expect(mockExecute.mock.calls[5][0]).toContain('ALTER TABLE office_meeting_artifacts')
    expect(mockExecute.mock.calls[6][0]).toContain('idx_office_meeting_artifacts_session')
    expect(mockExecute.mock.calls[7][0]).toContain('CREATE TABLE IF NOT EXISTS office_meeting_action_items')
    expect(mockExecute.mock.calls[10][0]).toContain('idx_office_meeting_action_items_meeting')
    expect(mockExecute.mock.calls[11][0]).toContain('idx_office_meeting_action_items_task')
    expect(mockEnsureOfficeLobbyRequestsTable).toHaveBeenCalledOnce()
    expect(mockEnsureOfficeLobbiesTable).toHaveBeenCalledOnce()
  })

  it('retries table setup after a transient failure', async () => {
    const { ensureOfficeMeetingArtifactsTables } = await import('~~/server/utils/officeMeetingArtifacts')
    mockExecute.mockRejectedValueOnce(new Error('connection reset'))

    await expect(ensureOfficeMeetingArtifactsTables()).rejects.toThrow('connection reset')
    mockExecute.mockResolvedValue(undefined)
    await expect(ensureOfficeMeetingArtifactsTables()).resolves.toBeUndefined()

    expect(mockExecute).toHaveBeenCalledTimes(13)
    expect(mockExecute.mock.calls[1][0]).toContain('CREATE TABLE IF NOT EXISTS office_meeting_sessions')
    expect(mockEnsureOfficeLobbyRequestsTable).toHaveBeenCalledTimes(2)
    expect(mockEnsureOfficeLobbiesTable).toHaveBeenCalledTimes(2)
  })

  it('creates notes, summary, and action placeholders for a meeting session', async () => {
    const { createMeetingPlaceholderArtifacts } = await import('~~/server/utils/officeMeetingArtifacts')

    await createMeetingPlaceholderArtifacts({
      meetingSessionId: 'meeting-1',
      title: 'Client review',
      notesContent: 'Agenda notes',
      metadata: {
        status: 'placeholder',
        guest_emails: ['client@example.com']
      },
      createdBy: 'user-1'
    })

    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO office_meeting_artifacts'),
      [
        'meeting-1',
        'Client review notes',
        'Agenda notes',
        'Client review summary',
        'Client review action items',
        JSON.stringify({
          status: 'placeholder',
          guest_emails: ['client@example.com']
        }),
        'user-1',
        'Summary will be generated when meeting notes are available.',
        'Action items will be generated when meeting notes are available.'
      ]
    )
  })

  it('parses action item artifact content into actionable lines', async () => {
    const { parseMeetingActionItems } = await import('~~/server/utils/officeMeetingArtifacts')

    expect(parseMeetingActionItems([
      'Follow-up checklist:',
      '- Send recap',
      '* Create project tasks',
      '1. Schedule next review',
      'Action items will be generated when meeting notes are available.'
    ].join('\n'))).toEqual([
      'Send recap',
      'Create project tasks',
      'Schedule next review'
    ])
  })

  it('creates structured rows from action-item artifacts', async () => {
    const { createMeetingActionItemsFromArtifact } = await import('~~/server/utils/officeMeetingArtifacts')

    const items = await createMeetingActionItemsFromArtifact({
      officeId: 'office-1',
      artifact: {
        id: 'artifact-1',
        meeting_session_id: 'meeting-1',
        artifact_type: 'action_items',
        content: '- Send recap\n- Create project tasks',
        created_by: 'user-1'
      },
      actorId: 'user-1'
    })

    expect(items).toEqual(['Send recap', 'Create project tasks'])
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO office_meeting_action_items'),
      [
        'office-1',
        'meeting-1',
        JSON.stringify([
          { content: 'Send recap', line_index: 0, source_artifact_id: 'artifact-1' },
          { content: 'Create project tasks', line_index: 1, source_artifact_id: 'artifact-1' }
        ]),
        JSON.stringify({
          source: 'office_meeting_artifact',
          artifact_id: 'artifact-1'
        }),
        'user-1'
      ]
    )
  })

  it('returns meeting-type artifact templates', async () => {
    const { meetingArtifactTemplate } = await import('~~/server/utils/officeMeetingArtifacts')

    expect(meetingArtifactTemplate('sales_call')).toEqual({
      summaryContent: [
        'Sales call summary template:',
        '- Prospect context',
        '- Pain points',
        '- Budget and timing signals',
        '- Decision process',
        '- Next step'
      ].join('\n'),
      actionItemsContent: [
        'Sales call action template:',
        '- Owner: send tailored follow-up',
        '- Owner: update opportunity notes',
        '- Owner: schedule next step if qualified'
      ].join('\n')
    })
    expect(meetingArtifactTemplate('unknown')).toEqual({
      summaryContent: 'Summary will be generated when meeting notes are available.',
      actionItemsContent: 'Action items will be generated when meeting notes are available.'
    })
  })

  it('creates an idempotent meeting closeout artifact', async () => {
    const { createMeetingCloseoutArtifact } = await import('~~/server/utils/officeMeetingArtifacts')

    await createMeetingCloseoutArtifact({
      meetingSessionId: 'meeting-1',
      title: 'Client review',
      status: 'ended',
      guestAccessExpired: 2,
      guestBadgesExpired: 1,
      createdBy: 'user-1'
    })

    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('system_event'),
      [
        'meeting-1',
        'Client review closeout',
        [
          'Meeting ended.',
          '2 guest access passes closed.',
          '1 guest badge expired.'
        ].join('\n'),
        JSON.stringify({
          status: 'system',
          system_event: 'meeting_closeout',
          lifecycle_status: 'ended',
          guest_access_expired: 2,
          guest_badges_expired: 1
        }),
        'user-1',
        'ended'
      ]
    )
  })

  it('promotes placeholder action items for follow-up after closeout', async () => {
    const { prepareMeetingActionItemsForFollowUp } = await import('~~/server/utils/officeMeetingArtifacts')

    await prepareMeetingActionItemsForFollowUp({
      meetingSessionId: 'meeting-1',
      title: 'Client review',
      status: 'ended',
      createdBy: 'user-1'
    })

    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('WITH updated AS'),
      expect.arrayContaining([
        'meeting-1',
        [
          'Follow-up checklist:',
          '- Review the Client review notes and guest context.',
          '- Confirm the meeting was ended and no guest access remains open.',
          '- Send a recap with decisions, owners, and next steps.',
          '- Create tasks for any commitments that need tracking.'
        ].join('\n')
      ])
    )
    const metadata = JSON.parse(mockExecute.mock.calls[0][1][2] as string)
    expect(metadata).toMatchObject({
      status: 'generated',
      generated_from: 'meeting_closeout',
      lifecycle_status: 'ended',
      generated_by: 'user-1'
    })
    expect(typeof metadata.generated_at).toBe('string')
    expect(mockExecute.mock.calls[0][1]).toEqual(expect.arrayContaining([
      'Client review follow-up checklist',
      'user-1',
      'ended'
    ]))
    expect(String(mockExecute.mock.calls[0][0])).toContain('INSERT INTO office_meeting_artifacts')
    expect(String(mockExecute.mock.calls[0][0])).toContain('metadata->>\'generated_from\' = \'meeting_closeout\'')
  })

  it('creates an idempotent guest intake artifact', async () => {
    const { createMeetingGuestIntakeArtifact } = await import('~~/server/utils/officeMeetingArtifacts')

    await createMeetingGuestIntakeArtifact({
      meetingSessionId: 'meeting-1',
      title: 'Client review',
      lobbyRequestId: 'request-1',
      guestName: 'Guest',
      guestEmail: 'guest@example.com',
      note: 'Can we review blockers?',
      intakeAnswers: [
        { label: 'What should we review first?', value: 'Launch blockers' }
      ],
      createdBy: 'user-1'
    })

    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('guest_intake'),
      [
        'meeting-1',
        'Client review guest intake',
        [
          'Guest: Guest <guest@example.com>',
          'Note:\nCan we review blockers?',
          'Intake:\nWhat should we review first?: Launch blockers'
        ].join('\n\n'),
        JSON.stringify({
          status: 'system',
          system_event: 'guest_intake',
          lobby_request_id: 'request-1',
          guest_name: 'Guest',
          guest_email: 'guest@example.com',
          intake_count: 1
        }),
        'user-1',
        'request-1'
      ]
    )
  })

  it('skips guest intake artifacts with no guest context', async () => {
    const { createMeetingGuestIntakeArtifact } = await import('~~/server/utils/officeMeetingArtifacts')

    await createMeetingGuestIntakeArtifact({
      meetingSessionId: 'meeting-1',
      title: 'Client review',
      lobbyRequestId: 'request-1',
      guestName: '',
      guestEmail: '',
      note: '',
      intakeAnswers: [],
      createdBy: 'user-1'
    })

    expect(mockExecute).not.toHaveBeenCalled()
  })
})
