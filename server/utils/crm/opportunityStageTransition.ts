import { z } from 'zod'
import { transaction as defaultTransaction } from '~~/server/utils/db'
import {
  appendCanonicalConversionEvent as defaultAppendOutbox
} from '~~/server/utils/measurement/outbox'
import type {
  AppendCanonicalConversionEventResult
} from '~~/server/utils/measurement/outbox'
import {
  safeMeasurementSourceUrl,
  safeMeasurementUserAgent
} from '~~/server/utils/measurement/attributionSafety'

const OpportunityStageTransitionSchema = z.strictObject({
  clientId: z.string().uuid(),
  opportunityId: z.string().uuid(),
  toStageId: z.string().uuid(),
  expectedStageId: z.string().uuid(),
  actor: z.strictObject({
    type: z.enum(['team_member', 'client_user']),
    id: z.string().uuid()
  }),
  occurredAt: z.string().datetime({ offset: true }),
  consentDecision: z.enum(['granted', 'denied', 'unknown']).default('unknown'),
  reason: z.string().trim().min(1).max(1000)
})

export type OpportunityStageTransition = z.infer<typeof OpportunityStageTransitionSchema>

interface StageRow {
  id: string
  code: string
  probability: number | string
  is_won: boolean
  is_lost: boolean
}

interface OpportunityRow {
  id: string
  client_id: string
  stage_id: string
  owner_id: string | null
  status: 'open' | 'won' | 'lost'
  stage_code?: string
  [key: string]: unknown
}

interface LifecycleMappingRow {
  canonical_event_name: 'lead_created' | 'lead_contacted' | 'lead_qualified' | 'lead_won' | 'lead_lost' | null
  outcome_authority?: 'zero_native' | 'client_webhook' | 'connector_sync' | 'manual_import'
}

interface LinkedLeadRow {
  lead_id: string
  source: string
  source_lead_id: string
  attribution: unknown
}

interface StageHistoryRow {
  id: string
  changed_at: Date | string
}

interface TransactionClient {
  query(sql: string, params?: unknown[]): Promise<{ rows?: unknown[] }>
}

type Transaction = <T>(callback: (db: TransactionClient) => Promise<T>) => Promise<T>
type AppendOutbox = typeof defaultAppendOutbox

export interface OpportunityStageTransitionServiceDeps {
  transaction: Transaction
  appendOutbox: AppendOutbox
}

export type OpportunityStageTransitionResult
  = { status: 'stage_not_found' }
    | { status: 'opportunity_not_found' }
    | { status: 'stage_conflict', currentStageId: string }
    | { status: 'terminal_state', currentStageId: string }
    | { status: 'no_change', currentStageId: string }
    | {
      status: 'moved'
      item: OpportunityRow
      historyId: string
      canonicalEventName: LifecycleMappingRow['canonical_event_name']
      linkedLeadId: string | null
      outbox: AppendCanonicalConversionEventResult | null
    }

const defaultDeps: OpportunityStageTransitionServiceDeps = {
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

function canonicalAttribution(lead: LinkedLeadRow | undefined) {
  const sourceLeadId = lead?.source_lead_id?.trim() ?? ''
  return {
    // CRM stage outcomes are server-only lifecycle events. Reusing the original
    // website Lead ID with QualifiedLead/Won/Lost would not be valid provider
    // deduplication because the event names differ.
    browserEventId: null,
    metaLeadId: lead?.source === 'meta' && /^\d{15,16}$/.test(sourceLeadId) ? sourceLeadId : null,
    gclid: optionalAttribution(lead?.attribution, 'gclid'),
    gbraid: optionalAttribution(lead?.attribution, 'gbraid'),
    wbraid: optionalAttribution(lead?.attribution, 'wbraid'),
    fbc: optionalAttribution(lead?.attribution, 'fbc'),
    fbp: optionalAttribution(lead?.attribution, 'fbp'),
    ttclid: optionalAttribution(lead?.attribution, 'ttclid'),
    ttp: optionalAttribution(lead?.attribution, 'ttp'),
    gaClientId: optionalAttribution(lead?.attribution, 'gaClientId'),
    eventSourceUrl: safeMeasurementSourceUrl(
      optionalAttribution(lead?.attribution, 'eventSourceUrl')
    ),
    clientUserAgent: safeMeasurementUserAgent(
      optionalAttribution(lead?.attribution, 'clientUserAgent')
    )
  }
}

function statusForStage(stage: StageRow): OpportunityRow['status'] {
  if (stage.is_won) return 'won'
  if (stage.is_lost) return 'lost'
  return 'open'
}

function leadStatusForEvent(eventName: LifecycleMappingRow['canonical_event_name']) {
  if (!eventName) return null
  return eventName.replace(/^lead_/, '')
}

export function createOpportunityStageTransitionService(
  deps: OpportunityStageTransitionServiceDeps = defaultDeps
) {
  return {
    async move(rawCommand: OpportunityStageTransition): Promise<OpportunityStageTransitionResult> {
      const command = OpportunityStageTransitionSchema.parse(rawCommand)

      return deps.transaction(async (db) => {
        const stageResult = await db.query(
          `SELECT id, code, probability, is_won, is_lost
             FROM crm_stages
            WHERE id = $1
              AND is_active = TRUE
              AND (client_id IS NULL OR client_id = $2)`,
          [command.toStageId, command.clientId]
        )
        const stage = stageResult.rows?.[0] as StageRow | undefined
        if (!stage) return { status: 'stage_not_found' as const }

        const opportunityResult = await db.query(
          `SELECT o.id, o.client_id, o.stage_id, o.owner_id, o.status,
                  current_stage.code AS stage_code
             FROM crm_opportunities o
             JOIN crm_stages current_stage ON current_stage.id = o.stage_id
            WHERE o.id = $1
              AND o.client_id = $2
              AND o.deleted_at IS NULL
            FOR UPDATE OF o`,
          [command.opportunityId, command.clientId]
        )
        const current = opportunityResult.rows?.[0] as OpportunityRow | undefined
        if (!current) return { status: 'opportunity_not_found' as const }
        if (current.stage_id !== command.expectedStageId) {
          return { status: 'stage_conflict' as const, currentStageId: current.stage_id }
        }
        if (current.stage_id === command.toStageId) {
          return { status: 'no_change' as const, currentStageId: current.stage_id }
        }
        if (current.status === 'won' || current.status === 'lost') {
          return { status: 'terminal_state' as const, currentStageId: current.stage_id }
        }

        const nextStatus = statusForStage(stage)
        const updatedResult = await db.query(
          `UPDATE crm_opportunities
              SET stage_id = $1,
                  status = $2,
                  probability = $3,
                  stage_changed_at = $4::timestamptz,
                  updated_at = NOW(),
                  stage_history = stage_history || jsonb_build_array(jsonb_build_object(
                    'stage_id', $1::text,
                    'at', $4::text,
                    'by', $5::text
                  )),
                  actual_close_date = CASE
                    WHEN $2 IN ('won', 'lost') THEN ($4::timestamptz AT TIME ZONE 'UTC')::date
                    ELSE actual_close_date
                  END
            WHERE id = $6
              AND client_id = $7
              AND stage_id = $8
              AND deleted_at IS NULL
        RETURNING *`,
          [
            command.toStageId,
            nextStatus,
            Number(stage.probability),
            command.occurredAt,
            command.actor.id,
            command.opportunityId,
            command.clientId,
            command.expectedStageId
          ]
        )
        const updated = updatedResult.rows?.[0] as OpportunityRow | undefined
        if (!updated) {
          return { status: 'stage_conflict' as const, currentStageId: current.stage_id }
        }

        const historyResult = await db.query(
          `INSERT INTO crm_opportunity_stage_history (
             client_id, opportunity_id, from_stage_id, to_stage_id, changed_by, changed_at
           ) VALUES ($1, $2, $3, $4, $5, $6::timestamptz)
           RETURNING id, changed_at`,
          [
            command.clientId,
            command.opportunityId,
            current.stage_id,
            command.toStageId,
            command.actor.id,
            command.occurredAt
          ]
        )
        const history = historyResult.rows?.[0] as StageHistoryRow | undefined
        if (!history) throw new Error('Opportunity stage history was not recorded')

        const mappingResult = await db.query(
          `SELECT p.outcome_authority, m.canonical_event_name
             FROM client_measurement_profiles p
             LEFT JOIN measurement_lifecycle_mappings m
               ON m.client_id = p.client_id
              AND m.profile_id = p.id
              AND m.source_type = 'crm_stage'
              AND m.source_value = $2
              AND m.is_active = TRUE
            WHERE p.client_id = $1
            LIMIT 1`,
          [command.clientId, command.toStageId]
        )
        const mapping = mappingResult.rows?.[0] as LifecycleMappingRow | undefined
        const authority = mapping?.outcome_authority ?? 'zero_native'
        const canonicalEventName = authority === 'zero_native'
          ? mapping?.canonical_event_name ?? null
          : null

        let linkedLead: LinkedLeadRow | undefined
        if (canonicalEventName) {
          const linkedLeadResult = await db.query(
            `SELECT lcl.lead_id, l.source, l.source_lead_id, l.attribution
               FROM lead_crm_links lcl
               JOIN leads l
                 ON l.client_id = lcl.client_id
                AND l.id = lcl.lead_id
                AND l.deleted_at IS NULL
              WHERE lcl.client_id = $1
                AND lcl.opportunity_id = $2
              ORDER BY lcl.linked_at, lcl.id
              LIMIT 2`,
            [command.clientId, command.opportunityId]
          )
          if ((linkedLeadResult.rows?.length ?? 0) > 1) {
            throw new Error('Multiple leads are linked to the canonical opportunity')
          }
          linkedLead = linkedLeadResult.rows?.[0] as LinkedLeadRow | undefined
        }

        const sourceEventId = `crm-stage-history:${history.id}`
        await db.query(
          `INSERT INTO lead_status_events (
             client_id, lead_id, opportunity_id, from_status, to_status,
             canonical_event_name, authority_mode, authority_decision,
             source_system, source_event_id, occurred_at, actor_type,
             actor_id, reason, decision_metadata
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, 'accepted', 'zero_crm', $8,
             $9::timestamptz, $10, $11, $12, $13::jsonb
           )`,
          [
            command.clientId,
            linkedLead?.lead_id ?? null,
            command.opportunityId,
            current.stage_id,
            stage.code,
            canonicalEventName,
            authority,
            sourceEventId,
            command.occurredAt,
            command.actor.type,
            command.actor.id,
            command.reason,
            JSON.stringify({ fromStageId: current.stage_id, toStageId: command.toStageId })
          ]
        )

        let outbox: AppendCanonicalConversionEventResult | null = null
        if (canonicalEventName) {
          outbox = await deps.appendOutbox(db, {
            clientId: command.clientId,
            eventName: canonicalEventName,
            sourceSystem: 'zero_crm',
            sourceEntityType: 'crm_opportunity',
            sourceEntityId: command.opportunityId,
            sourceEventId,
            occurredAt: command.occurredAt,
            consentDecision: command.consentDecision,
            attribution: canonicalAttribution(linkedLead)
          })
          if (outbox.status === 'profile_not_found') {
            throw new Error('Lifecycle mapping references a missing Measurement profile')
          }

          const linkedLeadStatus = leadStatusForEvent(canonicalEventName)
          if (linkedLead && linkedLeadStatus) {
            await db.query(
              `UPDATE leads
                  SET status = $3,
                      contacted_at = CASE
                        WHEN $3 = 'contacted' THEN COALESCE(contacted_at, $4::timestamptz)
                        ELSE contacted_at
                      END
                WHERE id = $1
                  AND client_id = $2
                  AND deleted_at IS NULL`,
              [linkedLead.lead_id, command.clientId, linkedLeadStatus, command.occurredAt]
            )
          }
        }

        return {
          status: 'moved' as const,
          item: updated,
          historyId: history.id,
          canonicalEventName,
          linkedLeadId: linkedLead?.lead_id ?? null,
          outbox
        }
      })
    }
  }
}

export const opportunityStageTransitionService = createOpportunityStageTransitionService()
