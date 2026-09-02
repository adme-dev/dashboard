import { transaction as defaultTransaction } from '~~/server/utils/db'
import {
  insertLeadWithDedup as defaultInsertLead
} from '~~/server/utils/leads/db'
import type {
  EmailEvidenceGuard,
  GuardedLeadInsertResult,
  InsertLeadInput,
  LeadTransactionClient
} from '~~/server/utils/leads/db'
import {
  appendCanonicalConversionEvent as defaultAppendOutbox
} from '~~/server/utils/measurement/outbox'
import {
  appendConfirmedBrowserLeadEvent,
  appendConfirmedBrowserLeadEventForStoredFormSubmission
} from '~~/server/utils/leads/browserConfirmation'
import type {
  AppendCanonicalConversionEventResult
} from '~~/server/utils/measurement/outbox'
import type {
  CanonicalConsentDecision
} from '~~/server/utils/measurement/contracts'
import {
  completeSubmissionIntentMatch as defaultCompleteIntentMatch
} from '~~/server/utils/leads/submissionIntent'
import { linkLeadIdentity as defaultLinkLeadIdentity } from '~~/server/utils/leads/leadIdentity'
import { captureLeadProductInterest as defaultCaptureProductInterest } from '~~/server/utils/leads/leadProductInterest'
import { recordLeadPersonaEvidence as defaultRecordPersonaEvidence } from '~~/server/utils/persona/identity'
import { connectLeadSignalContext as defaultConnectLeadSignalContext } from '~~/server/utils/persona/signalLedger'

type Transaction = <T>(
  callback: (db: LeadTransactionClient) => Promise<T>
) => Promise<T>

type InsertLead = (
  input: InsertLeadInput,
  db: LeadTransactionClient,
  emailEvidenceGuard?: EmailEvidenceGuard
) => Promise<string | null | GuardedLeadInsertResult>

export type LeadIntakeStage
  = | 'insert_lead'
    | 'complete_intent_match'
    | 'enrich_identity'
    | 'enrich_product_interest'
    | 'enrich_persona_identity'
    | 'enrich_signal_ledger'
    | 'append_outbox'
    | 'append_browser_confirmation'

export interface LeadIntakeServiceDeps {
  transaction: Transaction
  insertLead: InsertLead
  appendOutbox: typeof defaultAppendOutbox
  appendBrowserConfirmation: typeof appendConfirmedBrowserLeadEvent
  retryBrowserConfirmation?: typeof appendConfirmedBrowserLeadEventForStoredFormSubmission
  completeIntentMatch: typeof defaultCompleteIntentMatch
  linkIdentity: typeof defaultLinkLeadIdentity
  captureProductInterest: typeof defaultCaptureProductInterest
  recordPersonaEvidence: typeof defaultRecordPersonaEvidence
  connectLeadSignalContext?: typeof defaultConnectLeadSignalContext
  onStage?(stage: LeadIntakeStage): void
}

export interface IngestLeadInput {
  lead: InsertLeadInput & { client_id: string }
  consentDecision: CanonicalConsentDecision
  reconciliation?: {
    intentId: string
    reservationToken: string
  }
  emailEvidenceGuard?: EmailEvidenceGuard
  publishConversion?: boolean
  publishBrowserConfirmation?: boolean
  conversionEventName?: 'lead_created' | 'web_conversion'
  enquiryType?: 'stock' | 'finance' | 'test_drive' | 'contact' | 'model_variant' | 'service_booking' | null
}

export type IngestLeadResult
  = { status: 'duplicate' }
    | { status: 'evidence_expired' }
    | {
      status: 'created'
      leadId: string
      outbox: AppendCanonicalConversionEventResult | null
      browserConfirmationStored: boolean
    }

const defaultDeps: LeadIntakeServiceDeps = {
  transaction: defaultTransaction as unknown as Transaction,
  insertLead: (input, db, emailEvidenceGuard) => emailEvidenceGuard
    ? defaultInsertLead(input, db, emailEvidenceGuard)
    : defaultInsertLead(input, db),
  appendOutbox: defaultAppendOutbox,
  appendBrowserConfirmation: appendConfirmedBrowserLeadEvent,
  retryBrowserConfirmation: appendConfirmedBrowserLeadEventForStoredFormSubmission,
  completeIntentMatch: defaultCompleteIntentMatch,
  linkIdentity: defaultLinkLeadIdentity,
  captureProductInterest: defaultCaptureProductInterest,
  recordPersonaEvidence: defaultRecordPersonaEvidence,
  connectLeadSignalContext: defaultConnectLeadSignalContext
}

function optionalAttribution(
  value: Record<string, string> | null,
  key: string,
  max: number
): string | null {
  const candidate = value?.[key]?.trim()
  return candidate && candidate.length <= max ? candidate : null
}

function canonicalEnquiryType(value: string | undefined) {
  return ['stock', 'finance', 'test_drive', 'contact', 'model_variant', 'service_booking'].includes(value ?? '')
    ? value as 'stock' | 'finance' | 'test_drive' | 'contact' | 'model_variant' | 'service_booking'
    : null
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
    gaClientId: (() => {
      const v = optionalAttribution(lead.attribution, 'ga_client_id', 128)
      return v && /^\d+\.\d+$/.test(v) ? v : null
    })(),
    ...(lead.source === 'email'
      ? boundedEmailAttribution(lead.attribution)
      : {})
  }
}

function boundedEmailAttribution(
  attribution: Record<string, string> | null
): Record<string, string> {
  const output: Record<string, string> = {}
  const utmSource = optionalAttribution(attribution, 'utm_source', 64)
  const provider = optionalAttribution(attribution, 'provider', 64)
  const endpointId = optionalAttribution(attribution, 'email_endpoint_id', 36)
  const utmMedium = optionalAttribution(attribution, 'utm_medium', 32)
  const parser = optionalAttribution(attribution, 'parser', 32)
  const confidenceBand = optionalAttribution(attribution, 'confidence_band', 16)
  const transport = optionalAttribution(attribution, 'transport', 16)
  if (utmSource && /^[a-z][a-z0-9_-]*$/.test(utmSource)) output.utm_source = utmSource
  if (provider && /^[a-z][a-z0-9_-]*$/.test(provider)) output.provider = provider
  if (endpointId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(endpointId)) {
    output.email_endpoint_id = endpointId
  }
  if (utmMedium && ['classifieds', 'paid-social', 'cpc', 'lead_ingest'].includes(utmMedium)) {
    output.utm_medium = utmMedium
  }
  if (parser && ['adf', 'provider', 'generic', 'ai_fallback'].includes(parser)) {
    output.parser = parser
  }
  if (confidenceBand && ['high', 'medium', 'low'].includes(confidenceBand)) {
    output.confidence_band = confidenceBand
  }
  if (transport === 'email') output.transport = transport
  return output
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
  overrides: Partial<LeadIntakeServiceDeps> = {}
) {
  const deps: LeadIntakeServiceDeps = {
    ...defaultDeps,
    ...overrides
  }
  return {
    async ingest(input: IngestLeadInput): Promise<IngestLeadResult> {
      return deps.transaction(async (db) => {
        deps.onStage?.('insert_lead')
        const inserted = input.emailEvidenceGuard
          ? await deps.insertLead(input.lead, db, input.emailEvidenceGuard)
          : await deps.insertLead(input.lead, db)
        if (
          typeof inserted === 'object'
          && inserted?.status === 'evidence_expired'
        ) {
          return { status: 'evidence_expired' as const }
        }
        const leadId = typeof inserted === 'object'
          ? inserted?.status === 'created' ? inserted.leadId : null
          : inserted
        if (!leadId) {
          const browserEventId = optionalAttribution(input.lead.attribution, 'browserEventId', 128)
          if (browserEventId) {
            await deps.retryBrowserConfirmation?.(db, {
              clientId: input.lead.client_id,
              browserEventId
            })
          }
          return { status: 'duplicate' as const }
        }

        if (input.reconciliation) {
          deps.onStage?.('complete_intent_match')
          await deps.completeIntentMatch(db, {
            ...input.reconciliation,
            leadId
          })
        }

        for (const [enrichment, operation] of [
          ['identity', () => deps.linkIdentity(db, {
            clientId: input.lead.client_id,
            leadId,
            fieldData: input.lead.field_data,
            occurredAt: input.lead.submitted_at
          })],
          ['product_interest', () => deps.captureProductInterest(db, {
            clientId: input.lead.client_id,
            leadId,
            fieldData: input.lead.field_data
          })],
          ['persona_identity', () => deps.recordPersonaEvidence(db, {
            clientId: input.lead.client_id,
            leadId,
            source: input.lead.source,
            providerLeadId: input.lead.source_lead_id,
            fieldData: input.lead.field_data,
            attribution: input.lead.attribution,
            consentDecision: input.consentDecision,
            occurredAt: input.lead.submitted_at
          })],
          ['signal_ledger', () => deps.connectLeadSignalContext?.(db, {
            clientId: input.lead.client_id,
            leadId,
            source: input.lead.source,
            browserEventId: optionalAttribution(input.lead.attribution, 'browserEventId', 128),
            fieldData: input.lead.field_data,
            attribution: input.lead.attribution,
            consentDecision: input.consentDecision,
            occurredAt: input.lead.submitted_at
          })]
        ] as const) {
          try {
            deps.onStage?.(`enrich_${enrichment}`)
            await operation()
          } catch (error) {
            console.warn({
              event: 'lead_enrichment_failed',
              enrichment,
              leadId,
              clientId: input.lead.client_id,
              errorClass: error instanceof Error ? error.name : 'unknown'
            })
          }
        }

        const enquiryType = input.enquiryType
          ?? (input.conversionEventName === 'web_conversion'
            ? canonicalEnquiryType(input.lead.field_data.enquiry_type)
            : null)
        let outbox: AppendCanonicalConversionEventResult | null = null
        if (input.publishConversion !== false) {
          deps.onStage?.('append_outbox')
          outbox = await deps.appendOutbox(db, {
            clientId: input.lead.client_id,
            eventName: input.conversionEventName ?? 'lead_created',
            ...(enquiryType ? { enquiryType } : {}),
            sourceSystem: 'zero_lead',
            sourceEntityType: 'lead',
            sourceEntityId: leadId,
            sourceEventId: await sourceEventId(input.lead),
            occurredAt: input.lead.submitted_at,
            consentDecision: input.consentDecision,
            attribution: canonicalAttribution(input.lead)
          })
        }

        let browserConfirmationStored = false
        if (input.publishBrowserConfirmation !== false) {
          deps.onStage?.('append_browser_confirmation')
          browserConfirmationStored = await deps.appendBrowserConfirmation(db, {
            clientId: input.lead.client_id,
            leadId,
            browserEventId: optionalAttribution(input.lead.attribution, 'browserEventId', 128),
            source: input.lead.source,
            occurredAt: input.lead.submitted_at
          })
        }

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
