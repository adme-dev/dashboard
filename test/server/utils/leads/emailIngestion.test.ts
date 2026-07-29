import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  EmailEndpointPolicySchema,
  EmailIngestEnvelopeSchema,
  EmailLeadExtractionSchema,
  EmailStageRequestSchema,
  EmailStageResponseSchema
} from '../../../../shared/leads/email/contracts'

const UUID = '11111111-1111-4111-8111-111111111111'
const HASH = 'a'.repeat(64)
const RECEIVED_AT = '2026-07-29T00:00:00.000Z'

function extractedField(value = 'Jane Example') {
  return { value, confidence: 0.9, provenance: 'body' as const }
}

function extraction(overrides: Record<string, unknown> = {}) {
  return {
    provider: 'carsales',
    externalIdHash: HASH,
    sourceName: 'Carsales',
    medium: 'classifieds' as const,
    parser: 'provider' as const,
    fields: { full_name: extractedField() },
    message: extractedField('Interested in the vehicle'),
    overallConfidence: 0.9,
    needsReview: false,
    reviewReasons: [],
    ...overrides
  }
}

function safeEvidence() {
  return { hasText: true, hasHtml: false, hasAdf: false, fieldKeys: ['full_name', 'message'] }
}

function stageRequest(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    correlationId: UUID,
    transport: 'cloudflare_email_routing' as const,
    recipientToken: 'lead_3F1qP6jY9mK2vN5xR8cT4wZ7bD0hL',
    externalIdHash: HASH,
    messageIdHash: HASH,
    provider: 'carsales',
    receivedAt: RECEIVED_AT,
    rawSize: 1024,
    safeEvidence: safeEvidence(),
    quarantineExpiresAt: '2026-08-05T00:00:00.000Z',
    ...overrides
  }
}

function ingestEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    correlationId: UUID,
    ingestionId: '22222222-2222-4222-8222-222222222222',
    transport: 'cloudflare_email_routing' as const,
    recipientToken: 'lead_3F1qP6jY9mK2vN5xR8cT4wZ7bD0hL',
    recipientAddressHash: HASH,
    envelopeSenderDomain: 'notify.carsales.com.au',
    headerFromDomain: 'carsales.com.au',
    messageIdHash: HASH,
    externalIdHash: HASH,
    receivedAt: RECEIVED_AT,
    rawSize: 1024,
    attachmentCount: 0,
    extraction: extraction(),
    safeEvidence: safeEvidence(),
    ...overrides
  }
}

describe('email ingestion contracts', () => {
  it('accepts bounded endpoint policy, staging, and safe ingestion envelopes', () => {
    expect(EmailEndpointPolicySchema.safeParse({
      schemaVersion: 1,
      parserMode: 'auto',
      aiExtractionMode: 'fallback',
      expectedProvider: 'carsales',
      allowedSenderDomains: ['carsales.com.au', 'notify.carsales.com.au'],
      maxRawBytes: 2 * 1024 * 1024,
      maxAdfAttachmentBytes: 256 * 1024
    }).success).toBe(true)

    expect(EmailStageRequestSchema.safeParse(stageRequest()).success).toBe(true)
    expect(EmailStageResponseSchema.safeParse({
      schemaVersion: 1,
      outcome: 'reserved',
      ingestionId: '22222222-2222-4222-8222-222222222222',
      encryptedObjectKey: 'email-ingestions/opaque-object-key'
    }).success).toBe(true)
    expect(EmailIngestEnvelopeSchema.safeParse(ingestEnvelope()).success).toBe(true)
  })

  it('requires an envelope extraction to use the staged external identity hash', () => {
    expect(EmailLeadExtractionSchema.safeParse(extraction()).success).toBe(true)
    expect(EmailIngestEnvelopeSchema.safeParse(ingestEnvelope({
      extraction: extraction({ externalIdHash: 'b'.repeat(64) })
    })).success).toBe(false)
  })

  it('rejects untrusted transport names and raw payloads beyond the worker limits', () => {
    expect(EmailStageRequestSchema.safeParse(stageRequest({ transport: 'postmark' })).success).toBe(false)
    expect(EmailIngestEnvelopeSchema.safeParse(ingestEnvelope({ rawSize: (2 * 1024 * 1024) + 1 })).success).toBe(false)
    expect(EmailEndpointPolicySchema.safeParse({
      schemaVersion: 1,
      parserMode: 'auto',
      aiExtractionMode: 'disabled',
      expectedProvider: null,
      allowedSenderDomains: [],
      maxRawBytes: (2 * 1024 * 1024) + 1,
      maxAdfAttachmentBytes: 256 * 1024
    }).success).toBe(false)
  })

  it('rejects unsafe extraction values, field counts, and enum values', () => {
    expect(EmailLeadExtractionSchema.safeParse(extraction({ overallConfidence: 1.0001 })).success).toBe(false)
    expect(EmailLeadExtractionSchema.safeParse(extraction({
      fields: Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`field_${index}`, extractedField()])),
    })).success).toBe(false)
    expect(EmailLeadExtractionSchema.safeParse(extraction({
      message: extractedField('unsafe\u0000value'),
    })).success).toBe(false)
    expect(EmailLeadExtractionSchema.safeParse(extraction({ parser: 'unknown_parser' })).success).toBe(false)
  })

  it('rejects accidental raw content fields at the Worker-to-Nitro boundary', () => {
    expect(EmailIngestEnvelopeSchema.safeParse(ingestEnvelope({
      text: 'Customer name and phone number must not cross this boundary'
    })).success).toBe(false)
    expect(EmailIngestEnvelopeSchema.safeParse(ingestEnvelope({
      attachmentBytes: 'base64 raw MIME is forbidden'
    })).success).toBe(false)
  })
})

describe('universal email ingestion migration', () => {
  const migration = readFileSync(
    new URL('../../../../server/database/migrations/315_universal_email_lead_ingestion.sql', import.meta.url),
    'utf8'
  )

  it('creates endpoint, ingestion, and nonce storage with policy and lifecycle constraints', () => {
    for (const table of ['lead_email_endpoints', 'lead_email_ingestions', 'lead_email_ingest_nonces']) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`)
    }
    expect(migration).toContain("transport IN ('cloudflare_email_routing')")
    expect(migration).toMatch(/status IN \('accepted', 'duplicate', 'quarantined'\)[\s\S]*terminal_at IS NOT NULL/)
    expect(migration).toContain("status = 'received'")
    expect(migration).toContain("status = 'failed'")
    expect(migration).toContain('expected_max_silence_hours IS NULL OR expected_max_silence_hours BETWEEN 1 AND 8760')
    expect(migration).toContain('first_response_sla_minutes IS NULL OR first_response_sla_minutes BETWEEN 1 AND 43200')
  })

  it('enforces endpoint-scoped identity, tenant relationships, recovery, and duplicate references', () => {
    expect(migration).toContain('UNIQUE(endpoint_id, external_id_hash)')
    expect(migration).toContain('client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE')
    expect(migration).toContain('possible_duplicate_of_lead_id UUID REFERENCES leads(id) ON DELETE SET NULL')
    expect(migration).toContain('replayed_from UUID REFERENCES lead_email_ingestions(id) ON DELETE SET NULL')
    expect(migration).toContain('idx_lead_email_ingestions_recovery')
    expect(migration).toContain('idx_lead_email_ingestions_possible_duplicate')
    expect(migration).toContain('idx_lead_email_ingest_nonces_expiry')
    expect(migration).toContain("source IN ('meta', 'google', 'manual', 'webhook', 'csv', 'email')")
    expect(migration).toContain("source IN ('meta', 'google', 'webhook', 'csv', 'email')")
  })
})
