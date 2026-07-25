import { z } from 'zod'
import { transaction as defaultTransaction } from '~~/server/utils/db'
import { PORTAL_VISIBLE_LEADS_EXISTS } from '~~/server/utils/leads/portalAnalytics'
import {
  appendCanonicalConversionEvent as defaultAppendOutbox
} from '~~/server/utils/measurement/outbox'
import type {
  AppendCanonicalConversionEventResult
} from '~~/server/utils/measurement/outbox'

const LeadStatusTransitionSchema = z.strictObject({
  clientId: z.string().uuid(),
  leadId: z.string().uuid(),
  toStatus: z.enum(['new', 'contacted', 'qualified', 'won', 'lost', 'spam_suspected']),
  transitionId: z.string().uuid(),
  actor: z.strictObject({
    type: z.enum(['team_member', 'client_user']),
    id: z.string().uuid()
  }),
  occurredAt: z.string().datetime({ offset: true }),
  consentDecision: z.enum(['granted', 'denied', 'unknown']).default('unknown'),
  reason: z.string().trim().min(1).max(1000),
  portalVisibleOnly: z.boolean().default(false)
})

export type LeadStatusTransition = z.infer<typeof LeadStatusTransitionSchema>

interface LeadRow {
  id: string
  client_id: string
  status: LeadStatusTransition['toStatus']
  source: string
  source_lead_id: string
  attribution: unknown
}

interface LifecycleMappingRow {
  canonical_event_name: 'lead_created' | 'lead_contacted' | 'lead_qualified' | 'lead_won' | 'lead_lost' | null
  outcome_authority: 'zero_native' | 'client_webhook' | 'connector_sync' | 'manual_import'
}

interface TransactionClient {
  query(sql: string, params?: unknown[]): Promise<{ rows?: unknown[] }>
}

type Transaction = <T>(callback: (db: TransactionClient) => Promise<T>) => Promise<T>
type AppendOutbox = typeof defaultAppendOutbox

export interface LeadStatusTransitionServiceDeps {
  transaction: Transaction
  appendOutbox: AppendOutbox
}

export type LeadStatusTransitionResult
  = { status: 'lead_not_found' }
    | { status: 'no_change', currentStatus: LeadStatusTransition['toStatus'] }
    | {
      status: 'moved'
      item: { id: string, status: LeadStatusTransition['toStatus'] }
      canonicalEventName: LifecycleMappingRow['canonical_event_name']
      authorityDecision: 'accepted' | 'proposed' | 'duplicate'
      outbox: AppendCanonicalConversionEventResult | null
    }

const defaultDeps: LeadStatusTransitionServiceDeps = {
  transaction: defaultTransaction as unknown as Transaction,
  appendOutbox: defaultAppendOutbox
}

function optionalAttribution(value: unknown, key: string): string | null {
  if (!value || typeof value !== 'object') return null
  const candidate = (value as Record<string, unknown>)[key]
  if (typeof candidate !== 'string') return null
  const trimmed = candidate.trim()
  return trimmed.length > 0 && trimmed.length <= 512 ? trimmed : null
}

function canonicalAttribution(lead: LeadRow) {
  const sourceLeadId = lead.source_lead_id?.trim() ?? ''
  return {
    browserEventId: null,
    metaLeadId: lead.source === 'meta' && /^\d{15,16}$/.test(sourceLeadId) ? sourceLeadId : null,
    gclid: optionalAttribution(lead.attribution, 'gclid'),
    gbraid: optionalAttribution(lead.attribution, 'gbraid'),
    wbraid: optionalAttribution(lead.attribution, 'wbraid')
  }
}

export function createLeadStatusTransitionService(
  deps: LeadStatusTransitionServiceDeps = defaultDeps
) {
  return {
    async move(rawCommand: LeadStatusTransition): Promise<LeadStatusTransitionResult> {
      const command = LeadStatusTransitionSchema.parse(rawCommand)

      return deps.transaction(async (db) => {
        const portalScope = command.portalVisibleOnly
          ? `AND ${PORTAL_VISIBLE_LEADS_EXISTS}`
          : ''
        const leadResult = await db.query(
          `SELECT l.id, l.client_id, l.status, l.source, l.source_lead_id, l.attribution
             FROM leads l
            WHERE l.id = $1
              AND l.client_id = $2
              AND l.deleted_at IS NULL
              ${portalScope}
            FOR UPDATE OF l`,
          [command.leadId, command.clientId]
        )
        const lead = leadResult.rows?.[0] as LeadRow | undefined
        if (!lead) return { status: 'lead_not_found' as const }
        if (lead.status === command.toStatus) {
          return { status: 'no_change' as const, currentStatus: lead.status }
        }

        const mappingResult = await db.query(
          `SELECT p.outcome_authority, m.canonical_event_name
             FROM client_measurement_profiles p
             LEFT JOIN measurement_lifecycle_mappings m
               ON m.client_id = p.client_id
              AND m.profile_id = p.id
              AND m.source_type = 'lead_status'
              AND m.source_value = $2
              AND m.is_active = TRUE
            WHERE p.client_id = $1
            LIMIT 1`,
          [command.clientId, command.toStatus]
        )
        const mapping = mappingResult.rows?.[0] as LifecycleMappingRow | undefined
        const authority = mapping?.outcome_authority ?? 'zero_native'
        const canonicalEventName = authority === 'zero_native'
          ? mapping?.canonical_event_name ?? null
          : null

        let authorityDecision: 'accepted' | 'proposed' | 'duplicate'
          = authority === 'zero_native' ? 'accepted' : 'proposed'
        if (canonicalEventName) {
          const existingResult = await db.query(
            `SELECT id
               FROM lead_status_events
              WHERE client_id = $1
                AND lead_id = $2
                AND canonical_event_name = $3
                AND authority_decision = 'accepted'
              LIMIT 1`,
            [command.clientId, command.leadId, canonicalEventName]
          )
          if ((existingResult.rows?.length ?? 0) > 0) authorityDecision = 'duplicate'
        }

        const updatedResult = await db.query(
          `UPDATE leads
              SET status = $3,
                  contacted_at = CASE
                    WHEN $3 = 'contacted' THEN COALESCE(contacted_at, $4::timestamptz)
                    ELSE contacted_at
                  END,
                  contacted_by = CASE
                    WHEN $3 = 'contacted' AND $5 = 'team_member'
                      THEN COALESCE(contacted_by, $6::uuid)
                    ELSE contacted_by
                  END
            WHERE id = $1
              AND client_id = $2
              AND deleted_at IS NULL
          RETURNING id, status`,
          [
            command.leadId,
            command.clientId,
            command.toStatus,
            command.occurredAt,
            command.actor.type,
            command.actor.id
          ]
        )
        const updated = updatedResult.rows?.[0] as { id: string, status: LeadStatusTransition['toStatus'] } | undefined
        if (!updated) throw new Error('Lead status transition lost its tenant-scoped row')

        const sourceEventId = `lead-status:${command.transitionId}`
        await db.query(
          `INSERT INTO lead_status_events (
             client_id, lead_id, from_status, to_status, canonical_event_name,
             authority_mode, authority_decision, source_system, source_event_id,
             occurred_at, actor_type, actor_id, reason, decision_metadata
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, 'zero_lead', $8,
             $9::timestamptz, $10, $11, $12, $13::jsonb
           )`,
          [
            command.clientId,
            command.leadId,
            lead.status,
            command.toStatus,
            canonicalEventName,
            authority,
            authorityDecision,
            sourceEventId,
            command.occurredAt,
            command.actor.type,
            command.actor.id,
            command.reason,
            JSON.stringify({
              portalVisibleOnly: command.portalVisibleOnly,
              duplicateSuppressed: authorityDecision === 'duplicate'
            })
          ]
        )

        let outbox: AppendCanonicalConversionEventResult | null = null
        if (canonicalEventName && authorityDecision === 'accepted') {
          outbox = await deps.appendOutbox(db, {
            clientId: command.clientId,
            eventName: canonicalEventName,
            sourceSystem: 'zero_lead',
            sourceEntityType: 'lead',
            sourceEntityId: command.leadId,
            sourceEventId,
            occurredAt: command.occurredAt,
            consentDecision: command.consentDecision,
            attribution: canonicalAttribution(lead)
          })
          if (outbox.status === 'profile_not_found') {
            throw new Error('Lifecycle mapping references a missing Measurement profile')
          }
        }

        return {
          status: 'moved' as const,
          item: updated,
          canonicalEventName,
          authorityDecision,
          outbox
        }
      })
    }
  }
}

export const leadStatusTransitionService = createLeadStatusTransitionService()
