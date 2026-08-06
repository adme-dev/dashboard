import { execute, queryOne, queryRows } from '~~/server/utils/db'
import { createNotification } from '~~/server/utils/notifications'
import { SYSTEM_ROLE_PERMISSIONS } from '~~/server/utils/permissions'
import type { GoogleAiMaxScanTrigger } from '~~/server/utils/googleAiMaxRepository'

interface Recipient {
  id: string
}

interface EventCandidate {
  stateId: string
  campaignName: string
  eventType: 'first_seen' | 'became_unknown'
  readinessStatus: string
  migrationReason: string
}

interface DigestCounts {
  affected: number
  unknown: number
  needsReview: number
}

interface NotificationDependencies {
  isEnabled: () => boolean
  listRecipients: () => Promise<Recipient[]>
  listEventCandidates: (tenantId: string, scanRunId: string) => Promise<EventCandidate[]>
  loadDigest: (tenantId: string) => Promise<DigestCounts>
  claimDelivery: (tenantId: string, userId: string, dedupeKey: string, scanRunId: string) => Promise<boolean>
  markDelivered: (tenantId: string, userId: string, dedupeKey: string, notificationId?: string) => Promise<void>
  releaseDelivery: (tenantId: string, userId: string, dedupeKey: string) => Promise<void>
  createNotification: typeof createNotification
}

async function listMediaRecipients(): Promise<Recipient[]> {
  const rows = await queryRows<{
    id: string
    role: string
    permission_groups: string[]
  }>(`
    SELECT tm.id::text AS id, tm.role,
           COALESCE(
             array_agg(rpg.permission_group) FILTER (WHERE rpg.permission_group IS NOT NULL),
             '{}'
           ) AS permission_groups
    FROM team_members tm
    LEFT JOIN custom_roles cr ON cr.id = tm.custom_role_id
    LEFT JOIN role_permission_groups rpg ON rpg.role_id = cr.id
    WHERE tm.is_active = true
    GROUP BY tm.id, tm.role
    ORDER BY tm.id
  `)
  return rows
    .filter(row => row.permission_groups.includes('MEDIA_BUYING')
      || SYSTEM_ROLE_PERMISSIONS[row.role]?.includes('MEDIA_BUYING'))
    .map(row => ({ id: row.id }))
}

async function listEventCandidates(tenantId: string, scanRunId: string) {
  return queryRows<EventCandidate>(`
    SELECT s.id::text AS "stateId", s.campaign_name AS "campaignName",
           e.event_type AS "eventType", s.readiness_status AS "readinessStatus",
           s.migration_reason AS "migrationReason"
    FROM google_ai_max_state_events e
    JOIN google_ai_max_campaign_state s
      ON s.id = e.campaign_state_id AND s.tenant_id = e.tenant_id
    WHERE e.tenant_id = $1
      AND e.scan_run_id = $2
      AND (
        (e.event_type = 'first_seen'
          AND s.readiness_status <> 'unknown'
          AND (s.ai_max_enabled = true OR s.migration_reason <> 'none'))
        OR e.event_type = 'became_unknown'
      )
    ORDER BY e.observed_at, e.id
  `, [tenantId, scanRunId])
}

async function loadDigest(tenantId: string): Promise<DigestCounts> {
  const row = await queryOne<{
    affected: number | string
    unknown: number | string
    needs_review: number | string
  }>(`
    SELECT
      COUNT(*) FILTER (
        WHERE readiness_status <> 'unknown'
          AND (ai_max_enabled = true OR migration_reason <> 'none')
      )::int AS affected,
      COUNT(*) FILTER (
        WHERE readiness_status = 'unknown'
          OR last_observed_at < NOW() - INTERVAL '72 hours'
      )::int AS unknown,
      COUNT(*) FILTER (WHERE readiness_status = 'needs_review')::int AS needs_review
    FROM google_ai_max_campaign_state
    WHERE tenant_id = $1
      AND campaign_status IN ('ENABLED', 'PAUSED')
  `, [tenantId])
  return {
    affected: Number(row?.affected ?? 0),
    unknown: Number(row?.unknown ?? 0),
    needsReview: Number(row?.needs_review ?? 0)
  }
}

async function claimDelivery(
  tenantId: string,
  userId: string,
  dedupeKey: string,
  scanRunId: string
) {
  const row = await queryOne(`
    INSERT INTO google_ai_max_notification_deliveries
      (tenant_id, user_id, dedupe_key, scan_run_id)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (tenant_id, user_id, dedupe_key) DO NOTHING
    RETURNING dedupe_key
  `, [tenantId, userId, dedupeKey, scanRunId])
  return Boolean(row)
}

async function releaseDelivery(tenantId: string, userId: string, dedupeKey: string) {
  await execute(`
    DELETE FROM google_ai_max_notification_deliveries
    WHERE tenant_id = $1 AND user_id = $2 AND dedupe_key = $3
      AND delivered_at IS NULL
  `, [tenantId, userId, dedupeKey])
}

async function markDelivered(
  tenantId: string,
  userId: string,
  dedupeKey: string,
  notificationId?: string
) {
  await execute(`
    UPDATE google_ai_max_notification_deliveries
    SET delivered_at = NOW(), notification_id = $4
    WHERE tenant_id = $1 AND user_id = $2 AND dedupe_key = $3
  `, [tenantId, userId, dedupeKey, notificationId ?? null])
}

const defaultDependencies: NotificationDependencies = {
  isEnabled: () => process.env.GOOGLE_AI_MAX_NOTIFICATIONS_ENABLED === 'true',
  listRecipients: listMediaRecipients,
  listEventCandidates,
  loadDigest,
  claimDelivery,
  markDelivered,
  releaseDelivery,
  createNotification
}

function eventNotification(candidate: EventCandidate) {
  if (candidate.eventType === 'became_unknown') {
    return {
      title: 'Google AI Max evidence needs review',
      message: `Google-observed evidence for “${candidate.campaignName}” became incomplete. XeroFlow derived an Unknown status; review the campaign in Google Ads.`,
      link: '/agency/social/google/ai-max?status=unknown'
    }
  }
  return {
    title: 'Google AI Max migration detected',
    message: `Google-observed legacy settings make “${candidate.campaignName}” migration-affected. XeroFlow derived ${candidate.readinessStatus.replaceAll('_', ' ')}; review effective controls before 1 September.`,
    link: `/agency/social/google/ai-max?status=${candidate.readinessStatus}`
  }
}

export async function notifyGoogleAiMaxRun(
  input: {
    tenantId: string
    scanRunId: string
    trigger: GoogleAiMaxScanTrigger
    effectiveDate?: string
  },
  overrides: Partial<NotificationDependencies> = {}
) {
  const dependencies = { ...defaultDependencies, ...overrides }
  const totals = { sent: 0, suppressed: 0, failed: 0 }
  if (!dependencies.isEnabled()) return totals

  const effectiveDate = input.effectiveDate ?? new Date().toISOString().slice(0, 10)
  const [recipients, candidates] = await Promise.all([
    dependencies.listRecipients(),
    dependencies.listEventCandidates(input.tenantId, input.scanRunId)
  ])

  const deliveries: Array<{
    userId: string
    dedupeKey: string
    title: string
    message: string
    link: string
    metadata: Record<string, unknown>
  }> = []
  for (const recipient of recipients) {
    for (const candidate of candidates) {
      const content = eventNotification(candidate)
      deliveries.push({
        userId: recipient.id,
        dedupeKey: `campaign:${candidate.stateId}:${candidate.eventType}:${effectiveDate}`,
        ...content,
        metadata: {
          tenantId: input.tenantId,
          stateId: candidate.stateId,
          eventType: candidate.eventType,
          source: 'google_observed_xeroflow_derived'
        }
      })
    }
  }

  if (input.trigger === 'scheduled') {
    const digest = await dependencies.loadDigest(input.tenantId)
    if (digest.affected > 0 || digest.unknown > 0) {
      for (const recipient of recipients) {
        deliveries.push({
          userId: recipient.id,
          dedupeKey: `digest:${effectiveDate}`,
          title: 'AI Max daily review',
          message: `XeroFlow’s latest Google evidence has ${digest.affected} affected, ${digest.needsReview} needing review, and ${digest.unknown} unknown Search campaigns. Review before taking action in Google Ads.`,
          link: '/agency/social/google/ai-max',
          metadata: {
            tenantId: input.tenantId,
            eventType: 'daily_digest',
            source: 'google_observed_xeroflow_derived'
          }
        })
      }
    }
  }

  for (const delivery of deliveries) {
    const claimed = await dependencies.claimDelivery(
      input.tenantId,
      delivery.userId,
      delivery.dedupeKey,
      input.scanRunId
    )
    if (!claimed) {
      totals.suppressed += 1
      continue
    }
    let created: Awaited<ReturnType<typeof createNotification>>
    try {
      created = await dependencies.createNotification({
        userId: delivery.userId,
        type: 'system',
        title: delivery.title,
        message: delivery.message,
        link: delivery.link,
        metadata: { ...delivery.metadata, dedupeKey: delivery.dedupeKey },
        reason: 'direct',
        sendEmail: false
      })
    } catch {
      totals.failed += 1
      await dependencies.releaseDelivery(input.tenantId, delivery.userId, delivery.dedupeKey)
      continue
    }
    try {
      await dependencies.markDelivered(
        input.tenantId,
        delivery.userId,
        delivery.dedupeKey,
        typeof created?.id === 'string' ? created.id : undefined
      )
    } catch {
      // Keep the unique claim even if bookkeeping fails. The notification was
      // already created, so releasing would permit a duplicate on the next scan.
    }
    totals.sent += 1
  }
  return totals
}
