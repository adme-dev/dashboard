import {
  MONDAY_EVIDENCE_CANDIDATES_CTE
} from '~~/server/utils/socialNewsMondayEvidence'
import type {
  GooglePmaxEvidenceCollector,
  GooglePmaxEvidenceCollectorResult,
  GooglePmaxEvidenceReference
} from '~~/server/utils/googlePmaxDecisionEvidence'

export type GooglePmaxPlatformEvidenceQueryRows = (sql: string, params?: unknown[]) => Promise<unknown[]>

interface CollectorDependencies {
  queryRows: GooglePmaxPlatformEvidenceQueryRows
}

export type GooglePmaxPlatformEvidenceSource
  = | 'brief'
    | 'audiences'
    | 'personas'
    | 'knowledge'
    | 'boards'
    | 'monday'
    | 'performance'
    | 'anomalies'
    | 'tasks'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function text(value: unknown, maximum = 300): string {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : ''
}

function number(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function boolean(value: unknown): boolean {
  return value === true || value === 'true'
}

function iso(value: unknown, fallback: string): string {
  const parsed = typeof value === 'string' || value instanceof Date
    ? new Date(value).getTime()
    : Number.NaN
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback
}

function latestIso(rows: unknown[], keys: string[], fallback: string): string {
  let latest = Number.NEGATIVE_INFINITY
  for (const raw of rows) {
    const row = record(raw)
    for (const key of keys) {
      const candidate = new Date(String(row[key] || '')).getTime()
      if (Number.isFinite(candidate)) latest = Math.max(latest, candidate)
    }
  }
  return Number.isFinite(latest) ? new Date(latest).toISOString() : fallback
}

function freshUntil(observedAt: string, ttlMs: number): string {
  return new Date(new Date(observedAt).getTime() + ttlMs).toISOString()
}

function references(rows: unknown[], kind: string, idKey = 'id'): GooglePmaxEvidenceReference[] {
  return rows
    .map(raw => text(record(raw)[idKey], 200))
    .filter(Boolean)
    .slice(0, 50)
    .map(id => ({ kind, id }))
}

function empty(
  authority: GooglePmaxEvidenceCollectorResult['authority'],
  collectedAt: string
): GooglePmaxEvidenceCollectorResult {
  return {
    authority,
    status: 'unavailable',
    observedAt: collectedAt,
    freshUntil: collectedAt,
    references: [],
    facts: { count: 0 }
  }
}

function result(input: {
  authority: GooglePmaxEvidenceCollectorResult['authority']
  status?: GooglePmaxEvidenceCollectorResult['status']
  observedAt: string
  ttlMs: number
  references: GooglePmaxEvidenceReference[]
  facts: Record<string, unknown>
}): GooglePmaxEvidenceCollectorResult {
  return {
    authority: input.authority,
    status: input.status || 'available',
    observedAt: input.observedAt,
    freshUntil: freshUntil(input.observedAt, input.ttlMs),
    references: input.references,
    facts: input.facts
  }
}

function createBriefCollector(queryRows: GooglePmaxPlatformEvidenceQueryRows): GooglePmaxEvidenceCollector {
  return async ({ identity, collectedAt }) => {
    const rows = await queryRows(
      `SELECT b.id, b.reference_number, b.title, b.status, b.budget_currency,
              b.budget_min, b.budget_max, b.requested_deadline, b.updated_at,
              bt.slug AS template_slug
         FROM briefs b
         JOIN brief_templates bt ON bt.id = b.template_id
        WHERE b.id = $1::uuid
          AND b.client_id = $2::uuid
        LIMIT 1`,
      [identity.briefId, identity.clientId]
    )
    if (!rows[0]) return empty('approved', collectedAt)
    const row = record(rows[0])
    const observedAt = iso(row.updated_at, collectedAt)
    const approved = ['approved', 'in_progress', 'completed'].includes(text(row.status, 30))
    return result({
      authority: 'approved',
      status: approved ? 'available' : 'partial',
      observedAt,
      ttlMs: 30 * DAY,
      references: references(rows, 'brief'),
      facts: {
        count: 1,
        referenceNumber: text(row.reference_number, 20),
        title: text(row.title),
        status: text(row.status, 30),
        templateSlug: text(row.template_slug, 100),
        budgetCurrency: text(row.budget_currency, 3).toUpperCase(),
        budgetMinimum: number(row.budget_min),
        budgetMaximum: number(row.budget_max),
        requestedDeadline: text(row.requested_deadline, 10) || null
      }
    })
  }
}

function createAudienceCollector(queryRows: GooglePmaxPlatformEvidenceQueryRows): GooglePmaxEvidenceCollector {
  return async ({ identity, collectedAt }) => {
    const rows = await queryRows(
      `WITH signal_summary AS (
         SELECT COUNT(*)::int AS signal_count,
                COUNT(DISTINCT signal_key)::int AS signal_type_count,
                MAX(occurred_at) AS latest_signal_at
           FROM crm_customer_signals
          WHERE client_id = $1::uuid
            AND occurred_at >= NOW() - INTERVAL '90 days'
       )
       SELECT snapshot.id, snapshot.scope_hash, snapshot.generated_at, snapshot.expires_at,
              summary.signal_count, summary.signal_type_count, summary.latest_signal_at
         FROM crm_audience_cohort_snapshots snapshot
         CROSS JOIN signal_summary summary
        WHERE snapshot.client_id = $1::uuid
        ORDER BY snapshot.generated_at DESC
        LIMIT 25`,
      [identity.clientId]
    )
    if (!rows.length) return empty('operational', collectedAt)
    const observedAt = latestIso(rows, ['generated_at', 'latest_signal_at'], collectedAt)
    const first = record(rows[0])
    const nowMs = new Date(collectedAt).getTime()
    return result({
      authority: 'operational',
      observedAt,
      ttlMs: DAY,
      references: references(rows, 'audience_cohort'),
      facts: {
        count: rows.length,
        activeSnapshotCount: rows.filter(raw => new Date(String(record(raw).expires_at || '')).getTime() >= nowMs).length,
        recentSignalCount: number(first.signal_count),
        recentSignalTypeCount: number(first.signal_type_count),
        scopeHashes: rows.map(raw => text(record(raw).scope_hash, 128)).filter(Boolean).slice(0, 25)
      }
    })
  }
}

function createPersonaCollector(queryRows: GooglePmaxPlatformEvidenceQueryRows): GooglePmaxEvidenceCollector {
  return async ({ identity, collectedAt }) => {
    const rows = await queryRows(
      `SELECT DISTINCT ON (persona_key)
              id, persona_key, label, vertical, version,
              targeting_allowed, reporting_allowed, updated_at
         FROM crm_persona_definitions
        WHERE status = 'active'
          AND (client_id = $1::uuid OR (client_id IS NULL AND vertical IN ('automotive', 'universal')))
        ORDER BY persona_key, (client_id = $1::uuid) DESC, version DESC
        LIMIT 50`,
      [identity.clientId]
    )
    if (!rows.length) return empty('operational', collectedAt)
    const observedAt = latestIso(rows, ['updated_at'], collectedAt)
    return result({
      authority: 'operational',
      observedAt,
      ttlMs: 7 * DAY,
      references: references(rows, 'persona_definition'),
      facts: {
        count: rows.length,
        personas: rows.map((raw) => {
          const row = record(raw)
          return {
            key: text(row.persona_key, 100),
            label: text(row.label, 200),
            vertical: text(row.vertical, 100),
            version: number(row.version),
            targetingAllowed: boolean(row.targeting_allowed),
            reportingAllowed: boolean(row.reporting_allowed)
          }
        }).slice(0, 50)
      }
    })
  }
}

function createKnowledgeCollector(queryRows: GooglePmaxPlatformEvidenceQueryRows): GooglePmaxEvidenceCollector {
  return async ({ identity, collectedAt }) => {
    const rows = await queryRows(
      `SELECT id, title, category, updated_at
         FROM ai_knowledge_articles
        WHERE is_published = TRUE
          AND review_status = 'approved'
          AND (
            ('client:' || $1::text) = ANY(COALESCE(tags, ARRAY[]::text[]))
            OR (
              NOT EXISTS (
                SELECT 1 FROM unnest(COALESCE(tags, ARRAY[]::text[])) tag
                 WHERE tag LIKE 'client:%'
              )
              AND COALESCE(tags, ARRAY[]::text[]) && ARRAY[
                'google-ads', 'google-pmax', 'performance-max', 'vehicle-ads', 'automotive'
              ]::text[]
            )
          )
        ORDER BY updated_at DESC, id
        LIMIT 25`,
      [identity.clientId]
    )
    if (!rows.length) return empty('approved', collectedAt)
    const observedAt = latestIso(rows, ['updated_at'], collectedAt)
    return result({
      authority: 'approved',
      observedAt,
      ttlMs: 30 * DAY,
      references: references(rows, 'knowledge_article'),
      facts: {
        count: rows.length,
        articles: rows.map(raw => ({
          title: text(record(raw).title),
          category: text(record(raw).category, 100) || null
        })).slice(0, 25)
      }
    })
  }
}

function createBoardCollector(queryRows: GooglePmaxPlatformEvidenceQueryRows): GooglePmaxEvidenceCollector {
  return async ({ identity, collectedAt }) => {
    const rows = await queryRows(
      `SELECT d.id AS department_id, d.name AS department_name,
              COUNT(*)::int AS total_count,
              COUNT(*) FILTER (WHERE t.is_blocked)::int AS blocked_count,
              COUNT(*) FILTER (WHERE ts.category = 'done')::int AS completed_count,
              MAX(t.updated_at) AS updated_at
         FROM tasks t
         JOIN projects p ON p.id = t.project_id AND p.client_id = $1::uuid
         JOIN departments d ON d.id = t.department_id
         LEFT JOIN task_statuses ts ON ts.id = t.status_id
        GROUP BY d.id, d.name
        ORDER BY d.name
        LIMIT 50`,
      [identity.clientId]
    )
    if (!rows.length) return empty('operational', collectedAt)
    const observedAt = latestIso(rows, ['updated_at'], collectedAt)
    return result({
      authority: 'operational',
      observedAt,
      ttlMs: DAY,
      references: references(rows, 'board', 'department_id'),
      facts: {
        count: rows.length,
        boards: rows.map((raw) => {
          const row = record(raw)
          return {
            name: text(row.department_name, 200),
            taskCount: number(row.total_count),
            blockedCount: number(row.blocked_count),
            completedCount: number(row.completed_count)
          }
        }).slice(0, 50)
      }
    })
  }
}

function createMondayCollector(queryRows: GooglePmaxPlatformEvidenceQueryRows): GooglePmaxEvidenceCollector {
  return async ({ identity, collectedAt }) => {
    const rows = await queryRows(
      `${MONDAY_EVIDENCE_CANDIDATES_CTE}
       SELECT source_id, evidence_type, title, occurred_at
         FROM deduped_candidates
        ORDER BY occurred_at DESC NULLS LAST, source_id
        LIMIT 50`,
      [identity.clientId]
    )
    if (!rows.length) return empty('draft', collectedAt)
    const observedAt = latestIso(rows, ['occurred_at'], collectedAt)
    return result({
      authority: 'draft',
      observedAt,
      ttlMs: 7 * DAY,
      references: references(rows, 'monday_evidence', 'source_id'),
      facts: {
        count: rows.length,
        candidates: rows.map(raw => ({
          evidenceType: text(record(raw).evidence_type, 30),
          title: text(record(raw).title)
        })).slice(0, 50),
        requiresHumanApproval: true
      }
    })
  }
}

function createPerformanceCollector(queryRows: GooglePmaxPlatformEvidenceQueryRows): GooglePmaxEvidenceCollector {
  return async ({ identity, collectedAt }) => {
    const rows = await queryRows(
      `SELECT COUNT(DISTINCT campaign_id)::int AS campaign_count,
              COALESCE(SUM(budget_allocated), 0) AS allocated_total,
              COALESCE(SUM(actual_spend), 0) AS actual_spend_total,
              COALESCE(SUM(impressions), 0)::bigint AS impressions_total,
              COALESCE(SUM(clicks), 0)::bigint AS clicks_total,
              COALESCE(SUM(conversions), 0) AS conversions_total,
              MAX(COALESCE(synced_at, updated_at, created_at)) AS latest_synced_at
         FROM media_spend
        WHERE client_id = $1::uuid
          AND platform = 'google_ads'
          AND COALESCE(synced_at, updated_at, created_at) >= NOW() - INTERVAL '90 days'`,
      [identity.clientId]
    )
    const row = record(rows[0])
    if (!rows[0] || number(row.campaign_count) === 0) return empty('operational', collectedAt)
    const observedAt = iso(row.latest_synced_at, collectedAt)
    return result({
      authority: 'operational',
      observedAt,
      ttlMs: DAY,
      references: [{ kind: 'client_google_performance_window', id: `${identity.clientId}:90d` }],
      facts: {
        count: 1,
        windowDays: 90,
        campaignCount: number(row.campaign_count),
        allocatedTotal: number(row.allocated_total),
        actualSpendTotal: number(row.actual_spend_total),
        impressionsTotal: number(row.impressions_total),
        clicksTotal: number(row.clicks_total),
        conversionsTotal: number(row.conversions_total)
      }
    })
  }
}

function createAnomalyCollector(queryRows: GooglePmaxPlatformEvidenceQueryRows): GooglePmaxEvidenceCollector {
  return async ({ identity, collectedAt }) => {
    const rows = await queryRows(
      `SELECT id, type, severity, status, title, last_detected_at
         FROM anomalies
        WHERE tenant_id = $1::text
          AND status NOT IN ('resolved', 'dismissed')
          AND (
            context->>'clientId' = $2::text
            OR context->>'client_id' = $2::text
            OR context->'client'->>'id' = $2::text
          )
        ORDER BY last_detected_at DESC, id
        LIMIT 50`,
      [identity.tenantId, identity.clientId]
    )
    if (!rows.length) return empty('operational', collectedAt)
    const observedAt = latestIso(rows, ['last_detected_at'], collectedAt)
    return result({
      authority: 'operational',
      observedAt,
      ttlMs: DAY,
      references: references(rows, 'anomaly'),
      facts: {
        count: rows.length,
        open: rows.map(raw => ({
          type: text(record(raw).type, 50),
          severity: text(record(raw).severity, 30),
          status: text(record(raw).status, 30),
          title: text(record(raw).title)
        })).slice(0, 50)
      }
    })
  }
}

function createTaskCollector(queryRows: GooglePmaxPlatformEvidenceQueryRows): GooglePmaxEvidenceCollector {
  return async ({ identity, collectedAt }) => {
    const rows = await queryRows(
      `SELECT t.id AS task_id, t.title, t.priority, t.is_blocked,
              ts.category AS status_category, t.updated_at,
              clt.task_key AS launch_task_key
         FROM tasks t
         JOIN projects p ON p.id = t.project_id AND p.client_id = $1::uuid
         LEFT JOIN task_statuses ts ON ts.id = t.status_id
         LEFT JOIN campaign_launch_tasks clt ON clt.task_id = t.id
         LEFT JOIN campaign_launches launch
           ON launch.id = clt.launch_id
          AND launch.client_id = $1::uuid
        WHERE t.parent_task_id IS NULL
        ORDER BY (clt.task_key IS NOT NULL) DESC, t.updated_at DESC, t.id
        LIMIT 100`,
      [identity.clientId]
    )
    if (!rows.length) return empty('operational', collectedAt)
    const observedAt = latestIso(rows, ['updated_at'], collectedAt)
    return result({
      authority: 'operational',
      observedAt,
      ttlMs: DAY,
      references: references(rows, 'task', 'task_id'),
      facts: {
        count: rows.length,
        blockedCount: rows.filter(raw => boolean(record(raw).is_blocked)).length,
        launchTaskCount: rows.filter(raw => text(record(raw).launch_task_key, 160)).length,
        tasks: rows.map(raw => ({
          title: text(record(raw).title),
          priority: text(record(raw).priority, 20),
          statusCategory: text(record(raw).status_category, 30) || null,
          blocked: boolean(record(raw).is_blocked),
          launchTaskKey: text(record(raw).launch_task_key, 160) || null
        })).slice(0, 100)
      }
    })
  }
}

export function createGooglePmaxPlatformEvidenceCollectors(
  dependencies: CollectorDependencies
): Record<GooglePmaxPlatformEvidenceSource, GooglePmaxEvidenceCollector> {
  const queryRows = dependencies.queryRows
  return {
    brief: createBriefCollector(queryRows),
    audiences: createAudienceCollector(queryRows),
    personas: createPersonaCollector(queryRows),
    knowledge: createKnowledgeCollector(queryRows),
    boards: createBoardCollector(queryRows),
    monday: createMondayCollector(queryRows),
    performance: createPerformanceCollector(queryRows),
    anomalies: createAnomalyCollector(queryRows),
    tasks: createTaskCollector(queryRows)
  }
}
