import { neon } from '@neondatabase/serverless'

const databaseUrl = process.env.DATABASE_URL
const tenantId = process.env.AI_MAX_TENANT_ID

if (!databaseUrl) throw new Error('DATABASE_URL is required')
if (!tenantId || tenantId.length > 255) throw new Error('AI_MAX_TENANT_ID is required and must be at most 255 characters')

const sql = neon(databaseUrl)
const tables = await sql`
  SELECT
    to_regclass('public.google_ai_max_scan_runs')::text AS scan_runs,
    to_regclass('public.google_ai_max_campaign_state')::text AS campaign_state,
    to_regclass('public.google_ai_max_state_events')::text AS state_events,
    to_regclass('public.google_ai_max_notification_deliveries')::text AS notification_deliveries
`

if (Object.values(tables[0] ?? {}).some(value => value == null)) {
  throw new Error('One or more Google AI Max tables are missing')
}

const [latestRun] = await sql`
  SELECT id::text, status, trigger, total_connections, processed_connections,
         total_campaigns, affected_campaigns, unknown_campaigns,
         jsonb_array_length(failures) AS failure_count, started_at, finished_at
  FROM google_ai_max_scan_runs
  WHERE tenant_id = ${tenantId}
  ORDER BY created_at DESC
  LIMIT 1
`
const [counts] = await sql`
  SELECT
    COUNT(*)::int AS eligible,
    COUNT(*) FILTER (
      WHERE readiness_status <> 'unknown'
        AND (ai_max_enabled = true OR migration_reason <> 'none')
    )::int AS affected,
    COUNT(*) FILTER (WHERE readiness_status = 'needs_review')::int AS needs_review,
    COUNT(*) FILTER (
      WHERE readiness_status = 'unknown'
        OR last_observed_at < NOW() - INTERVAL '72 hours'
    )::int AS unknown_or_critical,
    COUNT(*) FILTER (
      WHERE last_observed_at < NOW() - INTERVAL '26 hours'
        AND last_observed_at >= NOW() - INTERVAL '72 hours'
    )::int AS freshness_warning,
    MAX(last_observed_at) AS latest_observation
  FROM google_ai_max_campaign_state
  WHERE tenant_id = ${tenantId}
    AND campaign_status IN ('ENABLED', 'PAUSED')
`
const [activeRuns] = await sql`
  SELECT COUNT(*)::int AS count
  FROM google_ai_max_scan_runs
  WHERE tenant_id = ${tenantId} AND status IN ('queued', 'running')
`

process.stdout.write(`${JSON.stringify({
  schemaReady: true,
  notificationsEnabled: process.env.GOOGLE_AI_MAX_NOTIFICATIONS_ENABLED === 'true',
  latestRun: latestRun ?? null,
  counts: counts ?? null,
  activeRuns: Number(activeRuns?.count ?? 0),
}, null, 2)}\n`)
