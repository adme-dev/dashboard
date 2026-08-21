import { createHash, randomBytes } from 'node:crypto'
import { queryOne, queryRows } from '~~/server/utils/db'
import type {
  CreateLeadCaptureTest,
  LeadCaptureTestEventReadModel,
  LeadCaptureTestOutcome,
  LeadCaptureTestRunReadModel,
  LeadCaptureTestStage
} from '~~/server/utils/leads/captureTestContracts'

export type LeadCaptureTestRunRow = {
  id: string
  client_id: string
  site_id: string | null
  connector_id: string
  expected_origin: string
  expected_stages: LeadCaptureTestStage[] | string
  status: LeadCaptureTestRunReadModel['status']
  expires_at: string
  started_at: string | null
  completed_at: string | null
  created_at: string
}

type EventRow = {
  id: string
  stage: LeadCaptureTestStage
  outcome: LeadCaptureTestOutcome
  evidence_key: string
  redacted_diagnostic: string | null
  occurred_at: string
}

function digest(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function stages(value: LeadCaptureTestRunRow['expected_stages']): LeadCaptureTestStage[] {
  if (Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function eventModel(row: EventRow): LeadCaptureTestEventReadModel {
  return {
    id: row.id,
    stage: row.stage,
    outcome: row.outcome,
    evidenceKey: row.evidence_key,
    diagnostic: row.redacted_diagnostic,
    occurredAt: row.occurred_at
  }
}

async function runModel(row: LeadCaptureTestRunRow): Promise<LeadCaptureTestRunReadModel> {
  const events = await queryRows<EventRow>(
    `SELECT id, stage, outcome, evidence_key, redacted_diagnostic, occurred_at
       FROM lead_capture_test_events
      WHERE run_id = $1
      ORDER BY occurred_at, id`,
    [row.id]
  )
  return {
    id: row.id,
    clientId: row.client_id,
    siteId: row.site_id,
    connectorId: row.connector_id,
    expectedOrigin: row.expected_origin,
    expectedStages: stages(row.expected_stages),
    status: row.status,
    expiresAt: row.expires_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    events: events.map(eventModel)
  }
}

export const leadCaptureTestRepository = {
  async create(input: CreateLeadCaptureTest & { actorId: string }): Promise<{
    run: LeadCaptureTestRunReadModel
    bootstrapToken: string
  } | null> {
    const bootstrapToken = randomBytes(32).toString('base64url')
    const row = await queryOne<LeadCaptureTestRunRow>(
      `INSERT INTO lead_capture_test_runs (
         client_id, site_id, connector_id, actor_id, reason, expected_origin,
         expected_stages, bootstrap_token_digest, expires_at
       )
       SELECT $1, $2, connector.id, $4, $5, $6, $7::jsonb, $8,
              NOW() + INTERVAL '15 minutes'
         FROM lead_connectors connector
        WHERE connector.id = $3
          AND connector.client_id = $1
          AND ($2::uuid IS NULL OR connector.site_id IS NULL OR connector.site_id = $2)
          AND connector.approved_origins ? $6
       RETURNING id, client_id, site_id, connector_id, expected_origin,
                 expected_stages, status, expires_at, started_at, completed_at, created_at`,
      [
        input.clientId,
        input.siteId ?? null,
        input.connectorId,
        input.actorId,
        input.reason,
        input.expectedOrigin,
        JSON.stringify([...new Set(input.expectedStages)]),
        digest(bootstrapToken)
      ]
    )
    return row ? { run: await runModel(row), bootstrapToken } : null
  },

  async exchange(bootstrapToken: string, origin: string): Promise<{
    run: LeadCaptureTestRunReadModel
    evidenceToken: string
  } | null> {
    const evidenceToken = randomBytes(32).toString('base64url')
    const row = await queryOne<LeadCaptureTestRunRow>(
      `UPDATE lead_capture_test_runs
          SET bootstrap_consumed_at = NOW(),
              evidence_token_digest = $3,
              status = 'running',
              started_at = NOW()
        WHERE bootstrap_token_digest = $1
          AND expected_origin = $2
          AND bootstrap_consumed_at IS NULL
          AND status = 'created'
          AND expires_at > NOW()
        RETURNING id, client_id, site_id, connector_id, expected_origin,
                  expected_stages, status, expires_at, started_at, completed_at, created_at`,
      [digest(bootstrapToken), origin, digest(evidenceToken)]
    )
    return row ? { run: await runModel(row), evidenceToken } : null
  },

  async resolveEvidenceToken(token: string, origin: string): Promise<LeadCaptureTestRunRow | null> {
    return queryOne<LeadCaptureTestRunRow>(
      `SELECT id, client_id, site_id, connector_id, expected_origin,
              expected_stages, status, expires_at, started_at, completed_at, created_at
         FROM lead_capture_test_runs
        WHERE evidence_token_digest = $1
          AND expected_origin = $2
          AND status = 'running'
          AND expires_at > NOW()
        LIMIT 1`,
      [digest(token), origin]
    )
  },

  async appendEvent(input: {
    run: LeadCaptureTestRunRow
    stage: LeadCaptureTestStage
    outcome: LeadCaptureTestOutcome
    evidenceKey: string
    diagnostic: string | null
  }): Promise<LeadCaptureTestRunReadModel> {
    await queryOne(
      `INSERT INTO lead_capture_test_events (
         run_id, client_id, stage, outcome, evidence_key, redacted_diagnostic
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (run_id, stage, evidence_key) DO NOTHING
       RETURNING id`,
      [
        input.run.id,
        input.run.client_id,
        input.stage,
        input.outcome,
        input.evidenceKey,
        input.diagnostic
      ]
    )

    const allEvents = await queryRows<EventRow>(
      `SELECT id, stage, outcome, evidence_key, redacted_diagnostic, occurred_at
         FROM lead_capture_test_events
        WHERE run_id = $1
        ORDER BY occurred_at, id`,
      [input.run.id]
    )
    const expected = stages(input.run.expected_stages)
    const failed = allEvents.some(event => event.outcome === 'failed')
    const completed = expected.every(stage => allEvents.some(event => (
      event.stage === stage && (event.outcome === 'passed' || event.outcome === 'skipped')
    )))
    if (failed || completed) {
      await queryOne(
        `UPDATE lead_capture_test_runs
            SET status = $2,
                completed_at = NOW()
          WHERE id = $1 AND status = 'running'
          RETURNING id`,
        [input.run.id, failed ? 'failed' : 'passed']
      )
    }
    const refreshed = await getLeadCaptureTest(input.run.id, input.run.client_id)
    if (!refreshed) throw new Error('lead_capture_test_refresh_failed')
    return refreshed
  },

  async get(id: string, clientId: string): Promise<LeadCaptureTestRunReadModel | null> {
    const row = await queryOne<{ id: string }>(
      `UPDATE lead_capture_test_runs
          SET status = 'timed_out', completed_at = NOW()
        WHERE id = $1 AND client_id = $2
          AND status IN ('created', 'running') AND expires_at <= NOW()
       RETURNING id`,
      [id, clientId]
    )
    void row
    const current = await queryOne<LeadCaptureTestRunRow>(
      `SELECT id, client_id, site_id, connector_id, expected_origin,
              expected_stages, status, expires_at, started_at, completed_at, created_at
         FROM lead_capture_test_runs
        WHERE id = $1 AND client_id = $2`,
      [id, clientId]
    )
    return current ? runModel(current) : null
  },

  async authorizeCanonicalTest(runId: string, connectorId: string, clientId: string): Promise<boolean> {
    const row = await queryOne<{ id: string }>(
      `SELECT id
         FROM lead_capture_test_runs
        WHERE id = $1 AND connector_id = $2 AND client_id = $3
          AND status = 'running' AND expires_at > NOW()`,
      [runId, connectorId, clientId]
    )
    return Boolean(row)
  },

  async appendServerEvent(input: {
    runId: string
    connectorId: string
    clientId: string
    stage: LeadCaptureTestStage
    outcome: LeadCaptureTestOutcome
    evidenceKey: string
    diagnostic?: string | null
  }): Promise<boolean> {
    const run = await queryOne<LeadCaptureTestRunRow>(
      `SELECT id, client_id, site_id, connector_id, expected_origin,
              expected_stages, status, expires_at, started_at, completed_at, created_at
         FROM lead_capture_test_runs
        WHERE id = $1 AND connector_id = $2 AND client_id = $3
          AND status = 'running' AND expires_at > NOW()`,
      [input.runId, input.connectorId, input.clientId]
    )
    if (!run) return false
    await appendLeadCaptureTestEvent({
      run,
      stage: input.stage,
      outcome: input.outcome,
      evidenceKey: input.evidenceKey,
      diagnostic: input.diagnostic ?? null
    })
    return true
  }
}

const getLeadCaptureTest = leadCaptureTestRepository.get.bind(leadCaptureTestRepository)
const appendLeadCaptureTestEvent = leadCaptureTestRepository.appendEvent.bind(leadCaptureTestRepository)
