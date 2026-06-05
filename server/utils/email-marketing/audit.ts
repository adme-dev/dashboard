// server/utils/email-marketing/audit.ts
// Audit helpers for subscriber consent and suppression history. These helpers
// intentionally keep SQL centralized so subscribe/import/webhook flows can write
// the same proof trail without each path inventing slightly different inserts.

import { execute } from '~~/server/utils/db'
import type {
  ConsentEventSource,
  ConsentEventType,
  SuppressionAuditAction,
  SuppressionAuditSource,
  SuppressionReason
} from './types'

export interface ConsentEventInput {
  subscriberId?: string | null
  email: string
  listId?: string | null
  campaignId?: string | null
  eventType: ConsentEventType
  source: ConsentEventSource
  actorUserId?: string | null
  ipAddress?: string | null
  userAgent?: string | null
  metadata?: Record<string, unknown> | null
}

export interface SuppressionEventInput {
  email: string
  subscriberId?: string | null
  campaignId?: string | null
  reason: SuppressionReason
  action: SuppressionAuditAction
  source: SuppressionAuditSource
  actorUserId?: string | null
  metadata?: Record<string, unknown> | null
}

export const INSERT_CONSENT_EVENT_SQL = `
  INSERT INTO email_consent_events
    (subscriber_id, email, list_id, campaign_id, event_type, source, actor_user_id, ip_address, user_agent, metadata)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
`

export const INSERT_SUPPRESSION_EVENT_SQL = `
  INSERT INTO suppression_events
    (email, subscriber_id, campaign_id, reason, action, source, actor_user_id, metadata)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
`

function metadataJson(metadata: Record<string, unknown> | null | undefined): string {
  return JSON.stringify(metadata ?? {})
}

export function consentEventParams(input: ConsentEventInput): unknown[] {
  return [
    input.subscriberId ?? null,
    input.email,
    input.listId ?? null,
    input.campaignId ?? null,
    input.eventType,
    input.source,
    input.actorUserId ?? null,
    input.ipAddress ?? null,
    input.userAgent ?? null,
    metadataJson(input.metadata)
  ]
}

export function suppressionEventParams(input: SuppressionEventInput): unknown[] {
  return [
    input.email,
    input.subscriberId ?? null,
    input.campaignId ?? null,
    input.reason,
    input.action,
    input.source,
    input.actorUserId ?? null,
    metadataJson(input.metadata)
  ]
}

export async function recordConsentEvent(input: ConsentEventInput): Promise<void> {
  await execute(INSERT_CONSENT_EVENT_SQL, consentEventParams(input))
}

export async function recordSuppressionEvent(input: SuppressionEventInput): Promise<void> {
  await execute(INSERT_SUPPRESSION_EVENT_SQL, suppressionEventParams(input))
}
