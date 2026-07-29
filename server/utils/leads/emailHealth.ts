import type { H3Event } from 'h3'

import { execute, queryRows, transaction } from '~~/server/utils/db'
import {
  cleanupTerminalEmailEvidenceWithDefaultRepository,
  resolveEmailRecoveryRuntime
} from '~~/server/utils/leads/emailRecovery'

export type EmailHealthStatus = 'received' | 'accepted' | 'duplicate' | 'quarantined' | 'failed'

export interface EmailHealthRow {
  id: string
  status: EmailHealthStatus
  terminal_at: string | null
  created_at: string
  processing_ms: number | null
  possible_duplicate: boolean
  assigned: boolean
  first_response_ms: number | null
  recovery_attempts: number
  error_class: string | null
}

export interface EmailTransportCounters {
  prePolicy: number
  unknownRecipient: number
  signatureFailure: number
  policyDenied: number
}

export interface EmailHealthRuntimeConfig {
  notificationAllowlist: string | null
  unknownRecipientThreshold: number | null
  signatureFailureThreshold: number | null
  r2FailureThreshold: number | null
  aiRejectionThreshold: number | null
}

type EmailHealthEnvKey
  = | 'EMAIL_INGESTION_NOTIFY_ALLOWLIST'
    | 'ANOMALY_NOTIFY_ALLOWLIST'
    | 'EMAIL_INGESTION_UNKNOWN_RECIPIENT_THRESHOLD'
    | 'EMAIL_INGESTION_SIGNATURE_FAILURE_THRESHOLD'
    | 'EMAIL_INGESTION_R2_FAILURE_THRESHOLD'
    | 'EMAIL_INGESTION_AI_REJECTION_THRESHOLD'

function runtimeValue(event: H3Event, name: EmailHealthEnvKey): string | undefined {
  const value = (event.context as {
    cloudflare?: { env?: Record<string, unknown> }
  }).cloudflare?.env?.[name]
  return typeof value === 'string' ? value : process.env[name]
}

function configuredThreshold(value: string | undefined): number | null {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 10_000) : null
}

export function resolveEmailHealthRuntimeConfig(event: H3Event): EmailHealthRuntimeConfig {
  return {
    notificationAllowlist: runtimeValue(event, 'EMAIL_INGESTION_NOTIFY_ALLOWLIST')
      ?? runtimeValue(event, 'ANOMALY_NOTIFY_ALLOWLIST')
      ?? null,
    unknownRecipientThreshold: configuredThreshold(
      runtimeValue(event, 'EMAIL_INGESTION_UNKNOWN_RECIPIENT_THRESHOLD')
    ),
    signatureFailureThreshold: configuredThreshold(
      runtimeValue(event, 'EMAIL_INGESTION_SIGNATURE_FAILURE_THRESHOLD')
    ),
    r2FailureThreshold: configuredThreshold(
      runtimeValue(event, 'EMAIL_INGESTION_R2_FAILURE_THRESHOLD')
    ),
    aiRejectionThreshold: configuredThreshold(
      runtimeValue(event, 'EMAIL_INGESTION_AI_REJECTION_THRESHOLD')
    )
  }
}

export interface EmailHealthSnapshot {
  reservedTotal: number
  accepted: number
  duplicate: number
  quarantined: number
  terminalFailed: number
  nonTerminal: number
  processingP50Ms: number | null
  processingP95Ms: number | null
  firstResponseP50Ms: number | null
  firstResponseP95Ms: number | null
  possibleDuplicate: number
  unassignedAccepted: number
  beyondFirstResponseSla: number
  recoveryAttempts: number
  recoveryExhaustions: number
  oldestNonTerminalAgeMs: number | null
  transport: EmailTransportCounters
}

const EMPTY_TRANSPORT: EmailTransportCounters = {
  prePolicy: 0,
  unknownRecipient: 0,
  signatureFailure: 0,
  policyDenied: 0
}

function percentile(values: number[], fraction: number): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const position = (sorted.length - 1) * fraction
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]!
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower)
}

export function reconcileEmailHealthRows(
  rows: EmailHealthRow[],
  now = new Date(),
  transport: EmailTransportCounters = EMPTY_TRANSPORT,
  firstResponseSlaMinutes: number | null = null
): EmailHealthSnapshot {
  let accepted = 0
  let duplicate = 0
  let quarantined = 0
  let terminalFailed = 0
  let nonTerminal = 0
  let possibleDuplicate = 0
  let unassignedAccepted = 0
  let beyondFirstResponseSla = 0
  let recoveryAttempts = 0
  let recoveryExhaustions = 0
  let oldestNonTerminalAgeMs: number | null = null
  const processing: number[] = []
  const firstResponse: number[] = []

  for (const row of rows) {
    if (!row.terminal_at) nonTerminal++
    else if (row.status === 'accepted') accepted++
    else if (row.status === 'duplicate') duplicate++
    else if (row.status === 'quarantined') quarantined++
    else terminalFailed++

    if (row.processing_ms !== null) processing.push(row.processing_ms)
    if (row.first_response_ms !== null) firstResponse.push(row.first_response_ms)
    if (row.possible_duplicate) possibleDuplicate++
    if (row.status === 'accepted' && !row.assigned) unassignedAccepted++
    if (
      row.status === 'accepted'
      && firstResponseSlaMinutes !== null
      && (
        row.first_response_ms === null
          ? now.getTime() - new Date(row.created_at).getTime() > firstResponseSlaMinutes * 60_000
          : row.first_response_ms > firstResponseSlaMinutes * 60_000
      )
    ) beyondFirstResponseSla++
    recoveryAttempts += row.recovery_attempts
    if (row.error_class === 'attempts_exhausted') recoveryExhaustions++
    if (!row.terminal_at) {
      const age = Math.max(0, now.getTime() - new Date(row.created_at).getTime())
      oldestNonTerminalAgeMs = Math.max(oldestNonTerminalAgeMs ?? 0, age)
    }
  }

  return {
    reservedTotal: rows.length,
    accepted,
    duplicate,
    quarantined,
    terminalFailed,
    nonTerminal,
    processingP50Ms: percentile(processing, 0.5),
    processingP95Ms: percentile(processing, 0.95),
    firstResponseP50Ms: percentile(firstResponse, 0.5),
    firstResponseP95Ms: percentile(firstResponse, 0.95),
    possibleDuplicate,
    unassignedAccepted,
    beyondFirstResponseSla,
    recoveryAttempts,
    recoveryExhaustions,
    oldestNonTerminalAgeMs,
    transport: { ...transport }
  }
}

export interface EmailEndpointAlertInput {
  consecutiveFailures: number
  wasHealthy: boolean
  messages15m: number
  failures15m: number
  expectedMaxSilenceHours?: number | null
  activatedAtMs?: number | null
  lastReceivedAtMs?: number | null
  unassignedAccepted?: number
  assignmentAlertThreshold?: number | null
  beyondFirstResponseSla?: number
  firstResponseSlaMinutes?: number | null
  unknownRecipientCount?: number
  unknownRecipientThreshold?: number | null
  signatureFailureCount?: number
  signatureFailureThreshold?: number | null
  r2FailureCount?: number
  r2FailureThreshold?: number | null
  aiSchemaRejectionCount?: number
  aiSchemaRejectionThreshold?: number | null
}

export type EmailEndpointAlertCode
  = | 'consecutive_failures'
    | 'failure_rate'
    | 'silence'
    | 'unassigned'
    | 'first_response_sla'
    | 'unknown_recipient_spike'
    | 'signature_failures'
    | 'r2_retention_failures'
    | 'ai_schema_rejections'

export type EmailTransportEventClass
  = | 'pre_policy'
    | 'unknown_recipient'
    | 'signature_failure'
    | 'policy_denied'
    | 'r2_write_failure'
    | 'r2_delete_failure'
    | 'ai_schema_rejection'

const TRANSPORT_EVENT_CLASSES = new Set<EmailTransportEventClass>([
  'pre_policy',
  'unknown_recipient',
  'signature_failure',
  'policy_denied',
  'r2_write_failure',
  'r2_delete_failure',
  'ai_schema_rejection'
])

export interface EmailTransportEventInput {
  eventClass: EmailTransportEventClass
  correlationId?: string | null
}

/**
 * Persists bounded, content-free transport counters. The batch/ordinal primary
 * key makes retries idempotent, and one transaction keeps a batch all-or-none.
 */
export async function recordEmailTransportEventBatch(input: {
  batchId: string
  events: EmailTransportEventInput[]
}): Promise<number> {
  const events = input.events
    .filter(event => TRANSPORT_EVENT_CLASSES.has(event.eventClass))
    .slice(0, 32)
  if (!events.length) return 0
  return transaction(async (db) => {
    let inserted = 0
    for (const [ordinal, event] of events.entries()) {
      const result = await db.query(`
        INSERT INTO lead_email_transport_events (
          batch_id, ordinal, endpoint_id, client_id, correlation_id, event_class
        )
        SELECT $1::uuid, $2,
          ingestion.endpoint_id,
          ingestion.client_id,
          $3::uuid, $4
        FROM (SELECT 1) seed
        LEFT JOIN lead_email_ingestions ingestion
          ON ingestion.correlation_id = $3::uuid
        ON CONFLICT (batch_id, ordinal) DO NOTHING
        RETURNING ordinal
      `, [
        input.batchId,
        ordinal,
        event.correlationId ?? null,
        event.eventClass
      ])
      if (result.rows[0]) inserted++
    }
    return inserted
  })
}

export function deriveEmailEndpointAlertCodes(
  input: EmailEndpointAlertInput,
  nowMs = Date.now()
): EmailEndpointAlertCode[] {
  const alerts: EmailEndpointAlertCode[] = []
  if (input.wasHealthy && input.consecutiveFailures >= 5) alerts.push('consecutive_failures')
  if (input.messages15m >= 10 && input.failures15m / input.messages15m > 0.2) {
    alerts.push('failure_rate')
  }
  if (input.expectedMaxSilenceHours != null) {
    const reference = input.lastReceivedAtMs ?? input.activatedAtMs
    if (reference != null && nowMs - reference > input.expectedMaxSilenceHours * 3_600_000) {
      alerts.push('silence')
    }
  }
  if (
    input.assignmentAlertThreshold != null
    && (input.unassignedAccepted ?? 0) >= input.assignmentAlertThreshold
  ) alerts.push('unassigned')
  if (input.firstResponseSlaMinutes != null && (input.beyondFirstResponseSla ?? 0) > 0) {
    alerts.push('first_response_sla')
  }
  const spike = (
    count: number | undefined,
    threshold: number | null | undefined,
    code: EmailEndpointAlertCode
  ) => {
    if (threshold != null && (count ?? 0) >= threshold) alerts.push(code)
  }
  spike(input.unknownRecipientCount, input.unknownRecipientThreshold, 'unknown_recipient_spike')
  spike(input.signatureFailureCount, input.signatureFailureThreshold, 'signature_failures')
  spike(input.r2FailureCount, input.r2FailureThreshold, 'r2_retention_failures')
  spike(input.aiSchemaRejectionCount, input.aiSchemaRejectionThreshold, 'ai_schema_rejections')
  return alerts
}

/**
 * Resolves recovered alerts and claims only newly active or cooled-down alerts.
 * Notification I/O happens after this short transaction; claim completion is
 * a separate CAS so concurrent cron runs cannot fan out the same alert.
 */
export async function claimEmailEndpointAlerts(input: {
  endpointId: string
  clientId: string
  activeCodes: EmailEndpointAlertCode[]
  claimToken: string
  cooldownHours?: number
  leaseMinutes?: number
}): Promise<Array<{ alertCode: EmailEndpointAlertCode, incidentAt: string }>> {
  const cooldownHours = Math.min(Math.max(input.cooldownHours ?? 24, 1), 168)
  const leaseMinutes = Math.min(Math.max(input.leaseMinutes ?? 10, 1), 30)
  return transaction(async (db) => {
    await db.query(`
      UPDATE lead_email_alert_state
      SET resolved_at = NOW(), notification_claim_token = NULL,
        notification_claimed_at = NULL
      WHERE endpoint_id = $1 AND client_id = $2
        AND resolved_at IS NULL
        AND NOT (alert_code = ANY($3::text[]))
    `, [input.endpointId, input.clientId, input.activeCodes])
    const claimed: Array<{ alertCode: EmailEndpointAlertCode, incidentAt: string }> = []
    for (const code of input.activeCodes) {
      const result = await db.query<{
        alert_code: EmailEndpointAlertCode
        first_detected_at: string
      }>(`
        INSERT INTO lead_email_alert_state (
          endpoint_id, client_id, alert_code, first_detected_at,
          last_detected_at, notification_claim_token, notification_claimed_at
        ) VALUES ($1, $2, $3, NOW(), NOW(), $4::uuid, NOW())
        ON CONFLICT (endpoint_id, alert_code) DO UPDATE
        SET last_detected_at = NOW(),
          first_detected_at = CASE
            WHEN lead_email_alert_state.resolved_at IS NOT NULL THEN NOW()
            ELSE lead_email_alert_state.first_detected_at
          END,
          resolved_at = NULL,
          notification_claim_token = $4::uuid,
          notification_claimed_at = NOW()
        WHERE lead_email_alert_state.client_id = EXCLUDED.client_id
          AND (
            lead_email_alert_state.resolved_at IS NOT NULL
            OR lead_email_alert_state.last_notified_at IS NULL
            OR lead_email_alert_state.last_notified_at
              <= NOW() - MAKE_INTERVAL(hours => $5::int)
          )
          AND (
            lead_email_alert_state.notification_claim_token IS NULL
            OR lead_email_alert_state.notification_claimed_at
              <= NOW() - MAKE_INTERVAL(mins => $6::int)
          )
        RETURNING alert_code, first_detected_at
      `, [
        input.endpointId,
        input.clientId,
        code,
        input.claimToken,
        cooldownHours,
        leaseMinutes
      ])
      if (result.rows[0]) {
        claimed.push({
          alertCode: result.rows[0].alert_code,
          incidentAt: result.rows[0].first_detected_at
        })
      }
    }
    return claimed
  })
}

export async function completeEmailEndpointAlertClaim(input: {
  endpointId: string
  clientId: string
  alertCode: EmailEndpointAlertCode
  claimToken: string
  delivered: boolean
}): Promise<boolean> {
  const rows = await queryRows<{ alert_code: string }>(`
    UPDATE lead_email_alert_state
    SET last_notified_at = CASE WHEN $5 THEN NOW() ELSE last_notified_at END,
      notification_claim_token = NULL, notification_claimed_at = NULL
    WHERE endpoint_id = $1 AND client_id = $2 AND alert_code = $3
      AND notification_claim_token = $4::uuid
    RETURNING alert_code
  `, [
    input.endpointId,
    input.clientId,
    input.alertCode,
    input.claimToken,
    input.delivered
  ])
  return Boolean(rows[0])
}

function notificationAllowlist(raw: string | null): Set<string> | null {
  if (!raw?.trim()) return null
  const values = raw.split(',').map(value => value.trim().toLowerCase()).filter(Boolean)
  return values.length ? new Set(values) : null
}

/**
 * Uses the existing tenant assignment authority and notification delivery
 * path. No endpoint label, customer content, or caught error is included.
 */
export async function deliverEmailEndpointAlerts(input: {
  event?: H3Event
  endpointId: string
  clientId: string
  activeCodes: EmailEndpointAlertCode[]
  claimToken?: string
  runtimeConfig?: EmailHealthRuntimeConfig
}): Promise<{ claimed: number, notified: number }> {
  const runtimeConfig = input.runtimeConfig ?? resolveEmailHealthRuntimeConfig(
    input.event ?? ({ context: {} } as H3Event)
  )
  const claimToken = input.claimToken ?? crypto.randomUUID()
  const claimed = await claimEmailEndpointAlerts({
    endpointId: input.endpointId,
    clientId: input.clientId,
    activeCodes: input.activeCodes,
    claimToken
  })
  if (!claimed.length) return { claimed: 0, notified: 0 }

  const members = await queryRows<{ id: string, email: string }>(`
    SELECT DISTINCT tm.id, tm.email
    FROM client_team_assignments assignment
    JOIN team_members tm ON tm.id = assignment.team_member_id
    WHERE assignment.client_id = $1
      AND assignment.role IN ('primary_am', 'secondary_am')
      AND tm.is_active = TRUE
      AND tm.email IS NOT NULL AND tm.email <> ''
  `, [input.clientId])
  const allowlist = notificationAllowlist(runtimeConfig.notificationAllowlist)
  const userIds = members
    .filter(member => !allowlist || allowlist.has(member.email.toLowerCase()))
    .map(member => member.id)
  const { createBulkNotifications } = await import('~~/server/utils/notifications')
  let notified = 0
  for (const claim of claimed) {
    const alertCode = claim.alertCode
    const pendingUserIds = userIds.length
      ? (await queryRows<{ id: string }>(`
          SELECT candidate.id
          FROM unnest($1::uuid[]) AS candidate(id)
          WHERE NOT EXISTS (
            SELECT 1 FROM notifications notification
            WHERE notification.user_id = candidate.id
              AND notification.type = 'lead'
              AND notification.metadata->>'endpointId' = $2
              AND notification.metadata->>'alertCode' = $3
              AND notification.created_at >= $4::timestamptz
          )
        `, [userIds, input.endpointId, alertCode, claim.incidentAt]))
          .map(row => row.id)
      : []
    let successful = 0
    if (pendingUserIds.length) {
      const result = await createBulkNotifications(pendingUserIds, {
        type: 'lead',
        reason: 'direct',
        title: 'Email lead ingestion needs attention',
        message: `Operational alert: ${alertCode.replaceAll('_', ' ')}`,
        link: `/agency/leads?clientId=${input.clientId}`,
        metadata: {
          clientId: input.clientId,
          endpointId: input.endpointId,
          alertCode,
          incidentAt: claim.incidentAt
        }
      })
      successful = result.successful
      notified += result.successful
    }
    const delivered = userIds.length > 0 && successful === pendingUserIds.length
    await completeEmailEndpointAlertClaim({
      endpointId: input.endpointId,
      clientId: input.clientId,
      alertCode,
      claimToken,
      delivered
    })
  }
  return { claimed: claimed.length, notified }
}

interface EmailEndpointAlertRow {
  endpoint_id: string
  client_id: string
  consecutive_failures: number | string
  expected_max_silence_hours: number | string | null
  first_response_sla_minutes: number | string | null
  created_at: string
  last_received_at: string | null
  last_accepted_at: string | null
  messages_15m: number | string
  failures_15m: number | string
  unassigned_accepted: number | string
  beyond_first_response_sla: number | string
  assignment_expected: boolean
  signature_failures: number | string
  r2_failures: number | string
  ai_schema_rejections: number | string
}

async function processGlobalEmailTransportAlerts(
  event: H3Event,
  runtimeConfig: EmailHealthRuntimeConfig
): Promise<{ active: number, notified: number }> {
  const counts = await queryRows<{ event_class: EmailTransportEventClass, count: number | string }>(`
    SELECT event_class, COUNT(*)::int AS count
    FROM lead_email_transport_events
    WHERE endpoint_id IS NULL AND client_id IS NULL
      AND created_at >= NOW() - INTERVAL '15 minutes'
      AND event_class IN ('unknown_recipient', 'signature_failure')
    GROUP BY event_class
  `)
  const value = (eventClass: EmailTransportEventClass) => Number(
    counts.find(row => row.event_class === eventClass)?.count ?? 0
  )
  const activeCodes: EmailEndpointAlertCode[] = []
  const unknownThreshold = runtimeConfig.unknownRecipientThreshold
  const signatureThreshold = runtimeConfig.signatureFailureThreshold
  if (unknownThreshold !== null && value('unknown_recipient') >= unknownThreshold) {
    activeCodes.push('unknown_recipient_spike')
  }
  if (signatureThreshold !== null && value('signature_failure') >= signatureThreshold) {
    activeCodes.push('signature_failures')
  }
  const claimToken = crypto.randomUUID()
  const claimed = await transaction(async (db) => {
    await db.query(`
      UPDATE lead_email_global_alert_state
      SET resolved_at = NOW(), notification_claim_token = NULL,
        notification_claimed_at = NULL
      WHERE resolved_at IS NULL AND NOT (alert_code = ANY($1::text[]))
    `, [activeCodes])
    const result: Array<{ alertCode: EmailEndpointAlertCode, incidentAt: string }> = []
    for (const code of activeCodes) {
      const row = await db.query<{
        alert_code: EmailEndpointAlertCode
        first_detected_at: string
      }>(`
        INSERT INTO lead_email_global_alert_state (
          alert_code, notification_claim_token, notification_claimed_at
        ) VALUES ($1, $2::uuid, NOW())
        ON CONFLICT (alert_code) DO UPDATE
        SET last_detected_at = NOW(),
          first_detected_at = CASE
            WHEN lead_email_global_alert_state.resolved_at IS NOT NULL THEN NOW()
            ELSE lead_email_global_alert_state.first_detected_at
          END,
          resolved_at = NULL,
          notification_claim_token = $2::uuid, notification_claimed_at = NOW()
        WHERE (
          lead_email_global_alert_state.resolved_at IS NOT NULL
          OR lead_email_global_alert_state.last_notified_at IS NULL
          OR lead_email_global_alert_state.last_notified_at <= NOW() - INTERVAL '24 hours'
        ) AND (
          lead_email_global_alert_state.notification_claim_token IS NULL
          OR lead_email_global_alert_state.notification_claimed_at <= NOW() - INTERVAL '10 minutes'
        )
        RETURNING alert_code, first_detected_at
      `, [code, claimToken])
      if (row.rows[0]) {
        result.push({
          alertCode: row.rows[0].alert_code,
          incidentAt: row.rows[0].first_detected_at
        })
      }
    }
    return result
  })
  if (!claimed.length) return { active: activeCodes.length, notified: 0 }
  const allowlist = notificationAllowlist(runtimeConfig.notificationAllowlist)
  const members = await queryRows<{
    id: string
    email: string
    role: string
    custom_role_id: string | null
  }>(`
    SELECT id, email, role, custom_role_id
    FROM team_members
    WHERE is_active = TRUE AND email IS NOT NULL AND email <> ''
  `)
  const { resolveUserPermissions } = await import('~~/server/utils/roleResolver')
  const { hasRole } = await import('~~/server/utils/auth')
  const { PERMISSIONS } = await import('~~/server/utils/permissions')
  const authorized: typeof members = []
  for (const member of members) {
    try {
      const permissions = await resolveUserPermissions(
        event,
        member.id,
        member.role,
        member.custom_role_id
      )
      if (hasRole({
        role: member.role,
        permissionGroups: permissions.groups
      } as never, [...PERMISSIONS.ADMIN])) {
        authorized.push(member)
      }
    } catch {
      if ((PERMISSIONS.ADMIN as readonly string[]).includes(member.role)) authorized.push(member)
    }
  }
  const userIds = members
    .filter(member => authorized.some(item => item.id === member.id))
    .filter(member => !allowlist || allowlist.has(member.email.toLowerCase()))
    .map(member => member.id)
  const { createBulkNotifications } = await import('~~/server/utils/notifications')
  let notified = 0
  for (const claim of claimed) {
    const code = claim.alertCode
    const pendingUserIds = userIds.length
      ? (await queryRows<{ id: string }>(`
          SELECT candidate.id
          FROM unnest($1::uuid[]) AS candidate(id)
          WHERE NOT EXISTS (
            SELECT 1 FROM notifications notification
            WHERE notification.user_id = candidate.id
              AND notification.type = 'lead'
              AND notification.metadata->>'alertCode' = $2
              AND notification.metadata->>'incidentAt' = $3
          )
        `, [userIds, code, claim.incidentAt])).map(row => row.id)
      : []
    const delivery = pendingUserIds.length
      ? await createBulkNotifications(pendingUserIds, {
          type: 'lead',
          reason: 'direct',
          title: 'Email lead transport security alert',
          message: `Operational alert: ${code.replaceAll('_', ' ')}`,
          link: '/agency/leads',
          metadata: { alertCode: code, incidentAt: claim.incidentAt }
        })
      : { successful: 0, failed: 0 }
    notified += delivery.successful
    await queryRows(`
      UPDATE lead_email_global_alert_state
      SET last_notified_at = CASE WHEN $3 THEN NOW() ELSE last_notified_at END,
        notification_claim_token = NULL, notification_claimed_at = NULL
      WHERE alert_code = $1 AND notification_claim_token = $2::uuid
      RETURNING alert_code
    `, [
      code,
      claimToken,
      userIds.length > 0 && delivery.successful === pendingUserIds.length
    ])
  }
  return { active: activeCodes.length, notified }
}

export async function processEmailIngestionHealthAlerts(
  event: H3Event,
  runtimeConfig = resolveEmailHealthRuntimeConfig(event)
): Promise<{
  endpoints: number
  active: number
  notified: number
}> {
  const rows = await queryRows<EmailEndpointAlertRow>(`
    SELECT e.id AS endpoint_id, e.client_id, e.consecutive_failures,
      e.expected_max_silence_hours, e.first_response_sla_minutes,
      e.created_at, e.last_received_at, e.last_accepted_at,
      COALESCE(ingestion.messages_15m, 0)::int AS messages_15m,
      COALESCE(ingestion.failures_15m, 0)::int AS failures_15m,
      COALESCE(outstanding.unassigned_accepted, 0)::int AS unassigned_accepted,
      COALESCE(outstanding.beyond_first_response_sla, 0)::int AS beyond_first_response_sla,
      EXISTS (
        SELECT 1 FROM lead_form_rules rule
        JOIN lead_rule_destinations destination ON destination.rule_id = rule.id
        WHERE rule.client_id = e.client_id AND rule.source = 'email'
          AND rule.form_id = e.form_id AND rule.enabled = TRUE
          AND destination.enabled = TRUE
          AND destination.destination_type = 'assign_user'
      ) AS assignment_expected,
      COALESCE(transport.signature_failures, 0)::int AS signature_failures,
      COALESCE(transport.r2_failures, 0)::int AS r2_failures,
      COALESCE(transport.ai_schema_rejections, 0)::int AS ai_schema_rejections
    FROM lead_email_endpoints e
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS messages_15m,
        COUNT(*) FILTER (WHERE i.status IN ('failed', 'quarantined'))::int AS failures_15m
      FROM lead_email_ingestions i
      WHERE i.endpoint_id = e.id AND i.client_id = e.client_id
        AND i.created_at >= NOW() - INTERVAL '15 minutes'
    ) ingestion ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (
          WHERE i.status = 'accepted' AND l.assigned_to IS NULL
        )::int AS unassigned_accepted,
        COUNT(*) FILTER (
          WHERE i.status = 'accepted'
            AND e.first_response_sla_minutes IS NOT NULL
            AND COALESCE(l.contacted_at, NOW()) > l.submitted_at
              + MAKE_INTERVAL(mins => e.first_response_sla_minutes)
        )::int AS beyond_first_response_sla
      FROM lead_email_ingestions i
      LEFT JOIN leads l ON l.id = i.lead_id AND l.client_id = i.client_id
      WHERE i.endpoint_id = e.id AND i.client_id = e.client_id
        AND i.status = 'accepted'
        AND (
          l.assigned_to IS NULL
          OR (
            e.first_response_sla_minutes IS NOT NULL
            AND COALESCE(l.contacted_at, NOW()) > l.submitted_at
              + MAKE_INTERVAL(mins => e.first_response_sla_minutes)
          )
        )
    ) outstanding ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*) FILTER (WHERE event_class = 'signature_failure')::int
          AS signature_failures,
        COUNT(*) FILTER (
          WHERE event_class IN ('r2_write_failure', 'r2_delete_failure')
        )::int AS r2_failures,
        COUNT(*) FILTER (WHERE event_class = 'ai_schema_rejection')::int
          AS ai_schema_rejections
      FROM lead_email_transport_events
      WHERE endpoint_id = e.id AND client_id = e.client_id
        AND created_at >= NOW() - INTERVAL '15 minutes'
    ) transport ON TRUE
    WHERE e.enabled = TRUE AND e.retired_at IS NULL
  `)
  let active = 0
  let notified = 0
  for (const row of rows) {
    try {
      const codes = deriveEmailEndpointAlertCodes({
        consecutiveFailures: Number(row.consecutive_failures),
        wasHealthy: row.last_accepted_at !== null,
        messages15m: Number(row.messages_15m),
        failures15m: Number(row.failures_15m),
        expectedMaxSilenceHours: row.expected_max_silence_hours === null
          ? null
          : Number(row.expected_max_silence_hours),
        activatedAtMs: new Date(row.created_at).getTime(),
        lastReceivedAtMs: row.last_received_at ? new Date(row.last_received_at).getTime() : null,
        unassignedAccepted: Number(row.unassigned_accepted),
        assignmentAlertThreshold: row.assignment_expected ? 1 : null,
        beyondFirstResponseSla: Number(row.beyond_first_response_sla),
        firstResponseSlaMinutes: row.first_response_sla_minutes === null
          ? null
          : Number(row.first_response_sla_minutes),
        signatureFailureCount: Number(row.signature_failures),
        signatureFailureThreshold: runtimeConfig.signatureFailureThreshold,
        r2FailureCount: Number(row.r2_failures),
        r2FailureThreshold: runtimeConfig.r2FailureThreshold,
        aiSchemaRejectionCount: Number(row.ai_schema_rejections),
        aiSchemaRejectionThreshold: runtimeConfig.aiRejectionThreshold
      })
      active += codes.length
      const delivery = await deliverEmailEndpointAlerts({
        event,
        endpointId: row.endpoint_id,
        clientId: row.client_id,
        activeCodes: codes,
        runtimeConfig
      })
      notified += delivery.notified
    } catch {
      // One tenant's state or notification failure must not block other
      // endpoints or the global transport-security scan.
    }
  }
  const global = await processGlobalEmailTransportAlerts(event, runtimeConfig)
  active += global.active
  notified += global.notified
  return { endpoints: rows.length, active, notified }
}

export async function getEmailIngestionHealth(input: {
  clientId: string
  endpointId?: string
  from: Date
  to: Date
  firstResponseSlaMinutes?: number | null
}): Promise<EmailHealthSnapshot> {
  const rows = await queryRows<EmailHealthRow>(`
    SELECT i.id, i.status, i.terminal_at, i.created_at, i.processing_ms,
      (i.possible_duplicate_of_lead_id IS NOT NULL) AS possible_duplicate,
      (l.assigned_to IS NOT NULL) AS assigned,
      CASE WHEN l.contacted_at IS NULL THEN NULL
        ELSE GREATEST(0, EXTRACT(EPOCH FROM (l.contacted_at - l.submitted_at)) * 1000)
      END::bigint AS first_response_ms,
      GREATEST(i.attempt_count - 1, 0)::int AS recovery_attempts,
      i.error_class
    FROM lead_email_ingestions i
    LEFT JOIN leads l ON l.id = i.lead_id AND l.client_id = i.client_id
    WHERE i.client_id = $1
      AND ($2::uuid IS NULL OR i.endpoint_id = $2::uuid)
      AND i.created_at >= $3::timestamptz
      AND i.created_at < $4::timestamptz
    ORDER BY i.created_at ASC, i.id ASC
  `, [input.clientId, input.endpointId ?? null, input.from.toISOString(), input.to.toISOString()])
  const transportRows = await queryRows<{ event_class: EmailTransportEventClass, count: number | string }>(`
    SELECT event_class, COUNT(*)::int AS count
    FROM lead_email_transport_events
    WHERE client_id = $1
      AND ($2::uuid IS NULL OR endpoint_id = $2::uuid)
      AND created_at >= $3::timestamptz
      AND created_at < $4::timestamptz
    GROUP BY event_class
  `, [input.clientId, input.endpointId ?? null, input.from.toISOString(), input.to.toISOString()])
  const count = (eventClass: EmailTransportEventClass) => Number(
    transportRows.find(row => row.event_class === eventClass)?.count ?? 0
  )
  return reconcileEmailHealthRows(
    rows.map(row => ({
      ...row,
      processing_ms: row.processing_ms === null ? null : Number(row.processing_ms),
      first_response_ms: row.first_response_ms === null ? null : Number(row.first_response_ms),
      recovery_attempts: Number(row.recovery_attempts)
    })),
    new Date(),
    {
      prePolicy: count('pre_policy'),
      unknownRecipient: count('unknown_recipient'),
      signatureFailure: count('signature_failure'),
      policyDenied: count('policy_denied')
    },
    input.firstResponseSlaMinutes ?? null
  )
}

export async function purgeEmailIngestionRetention(
  event: H3Event,
  input: { limit?: number } = {}
): Promise<{
  ingestionErrors: number
  expiredNonces: number
  stagedObjects: number
  failed: number
}> {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 100)
  const [ingestionErrors, expiredNonces] = await Promise.all([
    execute(`DELETE FROM lead_ingestion_errors WHERE created_at < NOW() - INTERVAL '30 days'`),
    execute(`DELETE FROM lead_email_ingest_nonces WHERE expires_at <= NOW()`)
  ])
  let stagedObjects = 0
  let failed = 0
  try {
    const runtime = resolveEmailRecoveryRuntime(event)
    const cleanup = await cleanupTerminalEmailEvidenceWithDefaultRepository({
      bucket: runtime.bucket,
      randomUUID: () => crypto.randomUUID(),
      limit
    })
    stagedObjects = cleanup.cleaned
  } catch {
    // The R2 delete/key-clear path is retried on the next cron invocation.
    failed++
  }
  return { ingestionErrors, expiredNonces, stagedObjects, failed }
}
