import { transaction as defaultTransaction } from '~~/server/utils/db'
import {
  insertLeadWithDedup as defaultInsertLead
} from '~~/server/utils/leads/db'
import type {
  InsertLeadInput,
  LeadTransactionClient
} from '~~/server/utils/leads/db'
import {
  appendCanonicalConversionEvent as defaultAppendOutbox
} from '~~/server/utils/measurement/outbox'
import type {
  AppendCanonicalConversionEventResult
} from '~~/server/utils/measurement/outbox'
import type {
  CanonicalConsentDecision
} from '~~/server/utils/measurement/contracts'
import {
  safeMeasurementSourceUrl,
  safeMeasurementUserAgent
} from '~~/server/utils/measurement/attributionSafety'
import {
  completeSubmissionIntentMatch as defaultCompleteIntentMatch
} from '~~/server/utils/leads/submissionIntent'

type Transaction = <T>(
  callback: (db: LeadTransactionClient) => Promise<T>
) => Promise<T>

type InsertLead = (
  input: InsertLeadInput,
  db: LeadTransactionClient
) => Promise<string | null>

export interface LeadIntakeServiceDeps {
  transaction: Transaction
  insertLead: InsertLead
  appendOutbox: typeof defaultAppendOutbox
  appendBrowserConfirmation: typeof appendConfirmedBrowserLeadEvent
  completeIntentMatch: typeof defaultCompleteIntentMatch
}

export interface IngestLeadInput {
  lead: InsertLeadInput & { client_id: string }
  consentDecision: CanonicalConsentDecision
  reconciliation?: {
    intentId: string
    reservationToken: string
  }
}

export type IngestLeadResult
  = { status: 'duplicate' }
    | {
      status: 'created'
      leadId: string
      outbox: AppendCanonicalConversionEventResult
      browserConfirmationStored: boolean
    }

const defaultDeps: LeadIntakeServiceDeps = {
  transaction: defaultTransaction as unknown as Transaction,
  insertLead: defaultInsertLead,
  appendOutbox: defaultAppendOutbox,
  appendBrowserConfirmation: appendConfirmedBrowserLeadEvent,
  completeIntentMatch: defaultCompleteIntentMatch
}

function optionalAttribution(
  value: Record<string, string> | null,
  key: string,
  max: number
): string | null {
  const candidate = value?.[key]?.trim()
  return candidate && candidate.length <= max ? candidate : null
}

function canonicalAttribution(lead: InsertLeadInput) {
  const sourceLeadId = lead.source_lead_id.trim()
  return {
    browserEventId: optionalAttribution(lead.attribution, 'browserEventId', 128),
    metaLeadId: lead.source === 'meta' && /^\d{15,16}$/.test(sourceLeadId)
      ? sourceLeadId
      : null,
    gclid: optionalAttribution(lead.attribution, 'gclid', 512),
    gbraid: optionalAttribution(lead.attribution, 'gbraid', 512),
    wbraid: optionalAttribution(lead.attribution, 'wbraid', 512),
    fbc: optionalAttribution(lead.attribution, 'fbc', 512),
    fbp: optionalAttribution(lead.attribution, 'fbp', 512),
    ttclid: optionalAttribution(lead.attribution, 'ttclid', 512),
    ttp: optionalAttribution(lead.attribution, 'ttp', 512),
    gaClientId: optionalAttribution(lead.attribution, 'gaClientId', 128),
    eventSourceUrl: safeMeasurementSourceUrl(
      optionalAttribution(lead.attribution, 'eventSourceUrl', 4096)
    ),
    clientUserAgent: safeMeasurementUserAgent(
      optionalAttribution(lead.attribution, 'clientUserAgent', 4096)
    )
  }
}

async function sourceEventId(lead: InsertLeadInput): Promise<string> {
  const browserEventId = optionalAttribution(lead.attribution, 'browserEventId', 128)
  if (browserEventId) return `browser:${browserEventId}`

  const identity = JSON.stringify([
    lead.client_id,
    lead.source,
    lead.source_lead_id
  ])
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(identity)
  )
  const hex = [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
  return `lead-created:v1:${hex}`
}

export async function appendConfirmedBrowserLeadEvent(
  db: LeadTransactionClient,
  input: {
    clientId: string
    leadId: string
    browserEventId: string | null
    source: string
    occurredAt: string
  }
): Promise<boolean> {
  if (!input.browserEventId) return false

  const result = await db.query(
    `INSERT INTO tracking_events (
       site_id, client_id, event_id, anon_id, session_id, event_name, page_url, referrer,
       utm_source, utm_medium, utm_campaign, utm_term, utm_content,
       gclid, gbraid, wbraid, fbclid, fbc, fbp, ttclid, msclkid, li_fat_id,
       event_data, consent, ua, ip_hash, origin, occurred_at
     )
     SELECT source_event.site_id,
            source_event.client_id,
            'confirmed-lead:' || $2,
            source_event.anon_id,
            source_event.session_id,
            'generate_lead',
            source_event.page_url,
            source_event.referrer,
            source_event.utm_source,
            source_event.utm_medium,
            source_event.utm_campaign,
            source_event.utm_term,
            source_event.utm_content,
            source_event.gclid,
            source_event.gbraid,
            source_event.wbraid,
            source_event.fbclid,
            source_event.fbc,
            source_event.fbp,
            source_event.ttclid,
            source_event.msclkid,
            source_event.li_fat_id,
            COALESCE(source_event.event_data, '{}'::jsonb)
              || jsonb_build_object(
                   'canonical_lead_id', $2::text,
                   'confirmation_source', $4::text,
                   'browser_event_id', $3::text
                 ),
            source_event.consent,
            source_event.ua,
            source_event.ip_hash,
            source_event.origin,
            $5::timestamptz
       FROM tracking_events source_event
      WHERE source_event.client_id = $1
        AND source_event.event_id = $3
        AND source_event.event_name = 'form_submit'
      ORDER BY source_event.occurred_at DESC, source_event.id DESC
      LIMIT 1
     ON CONFLICT (site_id, event_id) DO NOTHING
     RETURNING event_id`,
    [
      input.clientId,
      input.leadId,
      input.browserEventId,
      input.source,
      input.occurredAt
    ]
  )
  return Boolean(result.rows?.length)
}

export function createLeadIntakeService(
  deps: LeadIntakeServiceDeps = defaultDeps
) {
  return {
    async ingest(input: IngestLeadInput): Promise<IngestLeadResult> {
      return deps.transaction(async (db) => {
        const leadId = await deps.insertLead(input.lead, db)
        if (!leadId) return { status: 'duplicate' as const }

        if (input.reconciliation) {
          await deps.completeIntentMatch(db, {
            ...input.reconciliation,
            leadId
          })
        }

        const outbox = await deps.appendOutbox(db, {
          clientId: input.lead.client_id,
          eventName: 'lead_created',
          sourceSystem: 'zero_lead',
          sourceEntityType: 'lead',
          sourceEntityId: leadId,
          sourceEventId: await sourceEventId(input.lead),
          occurredAt: input.lead.submitted_at,
          consentDecision: input.consentDecision,
          attribution: canonicalAttribution(input.lead)
        })

        const browserConfirmationStored = await deps.appendBrowserConfirmation(db, {
          clientId: input.lead.client_id,
          leadId,
          browserEventId: optionalAttribution(input.lead.attribution, 'browserEventId', 128),
          source: input.lead.source,
          occurredAt: input.lead.submitted_at
        })

        return {
          status: 'created' as const,
          leadId,
          outbox,
          browserConfirmationStored
        }
      })
    }
  }
}

export const leadIntakeService = createLeadIntakeService()
