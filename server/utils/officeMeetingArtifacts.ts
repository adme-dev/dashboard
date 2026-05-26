import { execute } from '~~/server/utils/db'
import type { OfficeMeetingArtifactRow } from '~~/app/types/office'
import { ensureOfficeLobbiesTable } from '~~/server/utils/officeLobbies'
import { ensureOfficeLobbyRequestsTable } from '~~/server/utils/officeLobbyRequests'

let ensurePromise: Promise<void> | null = null

type MeetingArtifactTemplate = {
  summaryContent: string
  actionItemsContent: string
}

const DEFAULT_MEETING_ARTIFACT_TEMPLATE: MeetingArtifactTemplate = {
  summaryContent: 'Summary will be generated when meeting notes are available.',
  actionItemsContent: 'Action items will be generated when meeting notes are available.'
}

const MEETING_ARTIFACT_TEMPLATES: Record<string, MeetingArtifactTemplate> = {
  client_review: {
    summaryContent: [
      'Client review summary template:',
      '- Account context',
      '- Performance highlights',
      '- Risks or blockers',
      '- Decisions made',
      '- Follow-up commitments'
    ].join('\n'),
    actionItemsContent: [
      'Client review action template:',
      '- Owner: confirm next client-facing update',
      '- Owner: capture budget, creative, or timeline changes',
      '- Owner: send recap and agreed next steps'
    ].join('\n')
  },
  sales_call: {
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
  },
  support: {
    summaryContent: [
      'Support summary template:',
      '- Reported issue',
      '- Impact and urgency',
      '- Troubleshooting steps',
      '- Resolution or workaround',
      '- Escalation needed'
    ].join('\n'),
    actionItemsContent: [
      'Support action template:',
      '- Owner: document root cause',
      '- Owner: confirm customer impact is resolved',
      '- Owner: create escalation task if unresolved'
    ].join('\n')
  },
  standup: {
    summaryContent: [
      'Standup summary template:',
      '- Progress since last check-in',
      '- Current priorities',
      '- Blockers',
      '- Decisions needed'
    ].join('\n'),
    actionItemsContent: [
      'Standup action template:',
      '- Owner: clear blockers',
      '- Owner: update task status',
      '- Owner: follow up on decisions'
    ].join('\n')
  },
  interview: {
    summaryContent: [
      'Interview summary template:',
      '- Candidate or stakeholder context',
      '- Role or topic focus',
      '- Strengths and concerns',
      '- Scorecard notes',
      '- Recommendation'
    ].join('\n'),
    actionItemsContent: [
      'Interview action template:',
      '- Owner: complete scorecard',
      '- Owner: share recommendation',
      '- Owner: schedule next interview or follow-up'
    ].join('\n')
  },
  all_hands: {
    summaryContent: [
      'All-hands summary template:',
      '- Key announcements',
      '- Metrics or company updates',
      '- Questions raised',
      '- Decisions and commitments',
      '- Follow-up communications'
    ].join('\n'),
    actionItemsContent: [
      'All-hands action template:',
      '- Owner: publish recap',
      '- Owner: answer open questions',
      '- Owner: assign follow-up initiatives'
    ].join('\n')
  }
}

export function meetingArtifactTemplate(meetingType?: string | null): MeetingArtifactTemplate {
  if (!meetingType) return DEFAULT_MEETING_ARTIFACT_TEMPLATE
  return MEETING_ARTIFACT_TEMPLATES[meetingType] ?? DEFAULT_MEETING_ARTIFACT_TEMPLATE
}

export function ensureOfficeMeetingArtifactsTables() {
  ensurePromise ??= ensureOfficeMeetingArtifactsTablesOnce().catch((error) => {
    ensurePromise = null
    throw error
  })

  return ensurePromise
}

async function ensureOfficeMeetingArtifactsTablesOnce() {
  await ensureOfficeLobbyRequestsTable()
  await ensureOfficeLobbiesTable()
  await execute(`
    CREATE TABLE IF NOT EXISTS office_meeting_sessions (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      office_id           uuid NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
      zone_id             uuid REFERENCES office_zones(id) ON DELETE SET NULL,
      lobby_request_id    uuid REFERENCES office_lobby_requests(id) ON DELETE SET NULL,
      lobby_id            uuid REFERENCES office_lobbies(id) ON DELETE SET NULL,
      source              text NOT NULL DEFAULT 'drop_in'
                          CHECK (source IN ('drop_in','lobby','scheduled')),
      status              text NOT NULL DEFAULT 'planned'
                          CHECK (status IN ('planned','live','ended','cancelled')),
      title               text NOT NULL,
      participant_handles text[] NOT NULL DEFAULT '{}'::text[],
      guest_emails        text[] NOT NULL DEFAULT '{}'::text[],
      consent             jsonb NOT NULL DEFAULT '{}'::jsonb,
      retention_days      int,
      started_at          timestamptz,
      ended_at            timestamptz,
      created_by          uuid REFERENCES team_members(id) ON DELETE SET NULL,
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now()
    )
  `)
  await execute(`
    ALTER TABLE office_meeting_sessions
      ADD COLUMN IF NOT EXISTS lobby_request_id uuid REFERENCES office_lobby_requests(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS lobby_id uuid REFERENCES office_lobbies(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS participant_handles text[] NOT NULL DEFAULT '{}'::text[],
      ADD COLUMN IF NOT EXISTS guest_emails text[] NOT NULL DEFAULT '{}'::text[],
      ADD COLUMN IF NOT EXISTS consent jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS retention_days int,
      ADD COLUMN IF NOT EXISTS started_at timestamptz,
      ADD COLUMN IF NOT EXISTS ended_at timestamptz,
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()
  `)
  await execute(`
    CREATE INDEX IF NOT EXISTS idx_office_meeting_sessions_office
      ON office_meeting_sessions(office_id, created_at DESC)
  `)
  await execute(`
    CREATE INDEX IF NOT EXISTS idx_office_meeting_sessions_zone
      ON office_meeting_sessions(zone_id, created_at DESC)
      WHERE zone_id IS NOT NULL
  `)
  await execute(`
    CREATE TABLE IF NOT EXISTS office_meeting_artifacts (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      meeting_session_id uuid NOT NULL REFERENCES office_meeting_sessions(id) ON DELETE CASCADE,
      artifact_type      text NOT NULL
                         CHECK (artifact_type IN ('transcript','summary','recording','action_items','notes')),
      title              text NOT NULL,
      content            text NOT NULL DEFAULT '',
      metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_by         uuid REFERENCES team_members(id) ON DELETE SET NULL,
      created_at         timestamptz NOT NULL DEFAULT now()
    )
  `)
  await execute(`
    ALTER TABLE office_meeting_artifacts
      ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb
  `)
  await execute(`
    CREATE INDEX IF NOT EXISTS idx_office_meeting_artifacts_session
      ON office_meeting_artifacts(meeting_session_id, created_at DESC)
  `)
  await execute(`
    CREATE TABLE IF NOT EXISTS office_meeting_action_items (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      office_id          uuid NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
      meeting_session_id uuid NOT NULL REFERENCES office_meeting_sessions(id) ON DELETE CASCADE,
      source_artifact_id uuid REFERENCES office_meeting_artifacts(id) ON DELETE SET NULL,
      line_index         int NOT NULL DEFAULT 0,
      content            text NOT NULL,
      status             text NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open','in_progress','done','dismissed')),
      assignee_user_id   uuid REFERENCES team_members(id) ON DELETE SET NULL,
      task_id            uuid REFERENCES tasks(id) ON DELETE SET NULL,
      due_at             timestamptz,
      metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_by         uuid REFERENCES team_members(id) ON DELETE SET NULL,
      created_at         timestamptz NOT NULL DEFAULT now(),
      updated_at         timestamptz NOT NULL DEFAULT now()
    )
  `)
  await execute(`
    ALTER TABLE office_meeting_action_items
      ADD COLUMN IF NOT EXISTS source_artifact_id uuid REFERENCES office_meeting_artifacts(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS line_index int NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS assignee_user_id uuid REFERENCES team_members(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS due_at timestamptz,
      ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()
  `)
  await execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_office_meeting_action_items_source_line
      ON office_meeting_action_items(source_artifact_id, line_index)
      WHERE source_artifact_id IS NOT NULL
  `)
  await execute(`
    CREATE INDEX IF NOT EXISTS idx_office_meeting_action_items_meeting
      ON office_meeting_action_items(meeting_session_id, status, created_at DESC)
  `)
  await execute(`
    CREATE INDEX IF NOT EXISTS idx_office_meeting_action_items_task
      ON office_meeting_action_items(task_id)
      WHERE task_id IS NOT NULL
  `)
}

export function parseMeetingActionItems(content: string) {
  return content
    .split('\n')
    .map(line => line.trim())
    .map(line => line.replace(/^[-*]\s+/, '').replace(/^\d+[.)]\s+/, '').trim())
    .filter((line) => {
      if (!line) return false
      const lower = line.toLowerCase()
      if (lower.endsWith('action template:')) return false
      if (lower === 'follow-up checklist:') return false
      if (lower.includes('will be generated when meeting notes are available')) return false
      return true
    })
}

export async function createMeetingActionItemsFromArtifact(input: {
  officeId: string
  artifact: Pick<OfficeMeetingArtifactRow, 'id' | 'meeting_session_id' | 'artifact_type' | 'content' | 'created_by'>
  actorId: string | null
}) {
  if (input.artifact.artifact_type !== 'action_items') return []
  const items = parseMeetingActionItems(input.artifact.content).slice(0, 50)
  if (!items.length) return []

  const rows = items.map((content, index) => ({
    content,
    line_index: index,
    source_artifact_id: input.artifact.id
  }))

  await execute(
    `INSERT INTO office_meeting_action_items (
       office_id, meeting_session_id, source_artifact_id, line_index,
       content, status, metadata, created_by
     )
     SELECT $1, $2, item.source_artifact_id::uuid, item.line_index::int,
            item.content, 'open', $4::jsonb, $5
     FROM jsonb_to_recordset($3::jsonb) AS item(
       source_artifact_id text,
       line_index int,
       content text
     )
     ON CONFLICT (source_artifact_id, line_index) WHERE source_artifact_id IS NOT NULL
     DO UPDATE
       SET content = EXCLUDED.content,
           status = CASE
             WHEN office_meeting_action_items.status = 'dismissed' THEN office_meeting_action_items.status
             ELSE EXCLUDED.status
           END,
           metadata = office_meeting_action_items.metadata || EXCLUDED.metadata,
           updated_at = now()`,
    [
      input.officeId,
      input.artifact.meeting_session_id,
      JSON.stringify(rows),
      JSON.stringify({
        source: 'office_meeting_artifact',
        artifact_id: input.artifact.id
      }),
      input.actorId
    ]
  )

  return items
}

export async function createMeetingPlaceholderArtifacts(options: {
  meetingSessionId: string
  title: string
  notesContent?: string
  summaryContent?: string
  actionItemsContent?: string
  metadata: Record<string, unknown>
  createdBy: string | null
}) {
  await execute(
    `INSERT INTO office_meeting_artifacts (
       meeting_session_id, artifact_type, title, content, metadata, created_by
     )
     VALUES
       ($1, 'notes', $2, $3, $6, $7),
       ($1, 'summary', $4, $8, $6, $7),
       ($1, 'action_items', $5, $9, $6, $7)`,
    [
      options.meetingSessionId,
      `${options.title} notes`,
      options.notesContent ?? '',
      `${options.title} summary`,
      `${options.title} action items`,
      JSON.stringify(options.metadata),
      options.createdBy,
      options.summaryContent ?? 'Summary will be generated when meeting notes are available.',
      options.actionItemsContent ?? 'Action items will be generated when meeting notes are available.'
    ]
  )
}

export async function createMeetingCloseoutArtifact(options: {
  meetingSessionId: string
  title: string
  status: 'ended' | 'cancelled'
  guestAccessExpired: number
  guestBadgesExpired: number
  createdBy: string | null
}) {
  const action = options.status === 'ended' ? 'ended' : 'cancelled'
  const accessLine = options.guestAccessExpired
    ? `${options.guestAccessExpired} guest access pass${options.guestAccessExpired === 1 ? '' : 'es'} closed.`
    : 'No active guest access passes were open.'
  const badgeLine = options.guestBadgesExpired
    ? `${options.guestBadgesExpired} guest badge${options.guestBadgesExpired === 1 ? '' : 's'} expired.`
    : 'No active guest badges were expired.'

  await execute(
    `INSERT INTO office_meeting_artifacts (
       meeting_session_id, artifact_type, title, content, metadata, created_by
     )
     SELECT $1, 'notes', $2, $3, $4, $5
     WHERE NOT EXISTS (
       SELECT 1
       FROM office_meeting_artifacts
       WHERE meeting_session_id = $1
         AND metadata->>'system_event' = 'meeting_closeout'
         AND metadata->>'lifecycle_status' = $6
     )`,
    [
      options.meetingSessionId,
      `${options.title} closeout`,
      [
        `Meeting ${action}.`,
        accessLine,
        badgeLine
      ].join('\n'),
      JSON.stringify({
        status: 'system',
        system_event: 'meeting_closeout',
        lifecycle_status: options.status,
        guest_access_expired: options.guestAccessExpired,
        guest_badges_expired: options.guestBadgesExpired
      }),
      options.createdBy,
      options.status
    ]
  )
}

export async function prepareMeetingActionItemsForFollowUp(options: {
  meetingSessionId: string
  title: string
  status: 'ended' | 'cancelled'
  createdBy: string | null
}) {
  const closeoutLabel = options.status === 'ended' ? 'ended' : 'cancelled'
  const content = [
    'Follow-up checklist:',
    `- Review the ${options.title} notes and guest context.`,
    `- Confirm the meeting was ${closeoutLabel} and no guest access remains open.`,
    '- Send a recap with decisions, owners, and next steps.',
    '- Create tasks for any commitments that need tracking.'
  ].join('\n')
  const generatedAt = new Date().toISOString()

  await execute(
    `WITH updated AS (
       UPDATE office_meeting_artifacts
       SET content = $2,
           metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb
       WHERE meeting_session_id = $1
         AND artifact_type = 'action_items'
         AND COALESCE(metadata->>'status', '') = 'placeholder'
       RETURNING id
     )
     INSERT INTO office_meeting_artifacts (
       meeting_session_id, artifact_type, title, content, metadata, created_by
     )
     SELECT $1, 'action_items', $4, $2, $3, $5
     WHERE NOT EXISTS (SELECT 1 FROM updated)
       AND NOT EXISTS (
         SELECT 1
         FROM office_meeting_artifacts
         WHERE meeting_session_id = $1
           AND artifact_type = 'action_items'
           AND metadata->>'generated_from' = 'meeting_closeout'
           AND metadata->>'lifecycle_status' = $6
       )`,
    [
      options.meetingSessionId,
      content,
      JSON.stringify({
        status: 'generated',
        generated_from: 'meeting_closeout',
        lifecycle_status: options.status,
        generated_at: generatedAt,
        generated_by: options.createdBy
      }),
      `${options.title} follow-up checklist`,
      options.createdBy,
      options.status
    ]
  )
}

export async function createMeetingGuestIntakeArtifact(options: {
  meetingSessionId: string
  title: string
  lobbyRequestId: string
  guestName: string
  guestEmail: string
  note?: string
  intakeAnswers?: Array<{ label: string, value: string }>
  createdBy: string | null
}) {
  const answers = options.intakeAnswers ?? []
  const guestLabel = [options.guestName, options.guestEmail ? `<${options.guestEmail}>` : ''].filter(Boolean).join(' ')
  const content = [
    guestLabel ? `Guest: ${guestLabel}` : '',
    options.note?.trim() ? `Note:\n${options.note.trim()}` : '',
    answers.length
      ? [
          'Intake:',
          ...answers.map(answer => `${answer.label}: ${answer.value || 'No answer'}`)
        ].join('\n')
      : ''
  ].filter(Boolean).join('\n\n')

  if (!content.trim()) return

  await execute(
    `INSERT INTO office_meeting_artifacts (
       meeting_session_id, artifact_type, title, content, metadata, created_by
     )
     SELECT $1, 'notes', $2, $3, $4, $5
     WHERE NOT EXISTS (
       SELECT 1
       FROM office_meeting_artifacts
       WHERE meeting_session_id = $1
         AND metadata->>'system_event' = 'guest_intake'
         AND metadata->>'lobby_request_id' = $6
     )`,
    [
      options.meetingSessionId,
      `${options.title} guest intake`,
      content,
      JSON.stringify({
        status: 'system',
        system_event: 'guest_intake',
        lobby_request_id: options.lobbyRequestId,
        guest_name: options.guestName,
        guest_email: options.guestEmail,
        intake_count: answers.length
      }),
      options.createdBy,
      options.lobbyRequestId
    ]
  )
}
