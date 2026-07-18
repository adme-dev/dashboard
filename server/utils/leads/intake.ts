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
}

export interface IngestLeadInput {
  lead: InsertLeadInput & { client_id: string }
  consentDecision: CanonicalConsentDecision
}

export type IngestLeadResult
  = { status: 'duplicate' }
    | {
      status: 'created'
      leadId: string
      outbox: AppendCanonicalConversionEventResult
    }

const defaultDeps: LeadIntakeServiceDeps = {
  transaction: defaultTransaction as unknown as Transaction,
  insertLead: defaultInsertLead,
  appendOutbox: defaultAppendOutbox
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
    wbraid: optionalAttribution(lead.attribution, 'wbraid', 512)
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

export function createLeadIntakeService(
  deps: LeadIntakeServiceDeps = defaultDeps
) {
  return {
    async ingest(input: IngestLeadInput): Promise<IngestLeadResult> {
      return deps.transaction(async (db) => {
        const leadId = await deps.insertLead(input.lead, db)
        if (!leadId) return { status: 'duplicate' as const }

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

        return { status: 'created' as const, leadId, outbox }
      })
    }
  }
}

export const leadIntakeService = createLeadIntakeService()
