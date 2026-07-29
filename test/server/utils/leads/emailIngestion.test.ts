import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
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
const OPAQUE_OBJECT_KEY = 'email-ingestions/opaque-object-key'

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
      encryptedObjectKey: OPAQUE_OBJECT_KEY
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

  it('requires opaque routing tokens and object keys without control characters', () => {
    expect(EmailStageRequestSchema.safeParse(stageRequest({
      recipientToken: 'leads@client.example'
    })).success).toBe(false)
    expect(EmailIngestEnvelopeSchema.safeParse(ingestEnvelope({
      recipientToken: 'client-acme'
    })).success).toBe(false)
    expect(EmailStageRequestSchema.safeParse(stageRequest({
      provider: 'carsales\u0000raw'
    })).success).toBe(false)
    expect(EmailStageResponseSchema.safeParse({
      schemaVersion: 1,
      outcome: 'reserved',
      ingestionId: UUID,
      encryptedObjectKey: 'client-acme/raw-message.eml'
    }).success).toBe(false)
  })

  it('accepts adapter identifiers and safe source labels while rejecting PII-like identifiers', () => {
    for (const provider of ['carsales', 'auto_trader', 'facebook-marketplace', 'drive', 'generic']) {
      expect(EmailStageRequestSchema.safeParse(stageRequest({ provider })).success).toBe(true)
      expect(EmailEndpointPolicySchema.safeParse({
        schemaVersion: 1,
        parserMode: 'auto',
        aiExtractionMode: 'disabled',
        expectedProvider: provider,
        allowedSenderDomains: [],
        maxRawBytes: 1024,
        maxAdfAttachmentBytes: 1024
      }).success).toBe(true)
    }
    for (const sourceName of ['Carsales', 'AutoTrader', 'Facebook Marketplace', 'Drive.com.au', 'Generic lead email']) {
      expect(EmailLeadExtractionSchema.safeParse(extraction({ sourceName })).success).toBe(true)
    }
    for (const pii of ['person@example.com', '0412345678']) {
      expect(EmailStageRequestSchema.safeParse(stageRequest({ provider: pii })).success).toBe(false)
      expect(EmailLeadExtractionSchema.safeParse(extraction({ sourceName: pii })).success).toBe(false)
      expect(EmailEndpointPolicySchema.safeParse({
        schemaVersion: 1,
        parserMode: 'auto',
        aiExtractionMode: 'disabled',
        expectedProvider: pii,
        allowedSenderDomains: [],
        maxRawBytes: 1024,
        maxAdfAttachmentBytes: 1024
      }).success).toBe(false)
    }
  })

  it('ties stage outcomes to the presence of an encrypted object key', () => {
    expect(EmailStageResponseSchema.safeParse({
      schemaVersion: 1,
      outcome: 'reserved',
      ingestionId: UUID,
      encryptedObjectKey: null
    }).success).toBe(false)
    expect(EmailStageResponseSchema.safeParse({
      schemaVersion: 1,
      outcome: 'duplicate',
      ingestionId: UUID,
      encryptedObjectKey: OPAQUE_OBJECT_KEY
    }).success).toBe(false)
    expect(EmailStageResponseSchema.safeParse({
      schemaVersion: 1,
      outcome: 'duplicate',
      ingestionId: UUID,
      encryptedObjectKey: null
    }).success).toBe(true)
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

  it('keeps the exhaustive source icon contract aligned with LeadSource', () => {
    const sourceIcon = readFileSync(
      new URL('../../../../app/components/leads/SourceIcon.vue', import.meta.url),
      'utf8'
    )
    expect(sourceIcon.match(/\bemail:\s*'[^']+'/g)).toHaveLength(2)
  })
})

const integrationDatabaseUrl = process.env.EMAIL_INGESTION_TEST_DATABASE_URL
const describePostgres = integrationDatabaseUrl ? describe : describe.skip

describePostgres('universal email ingestion Postgres behavior', () => {
  const migration315 = readFileSync(
    new URL('../../../../server/database/migrations/315_universal_email_lead_ingestion.sql', import.meta.url),
    'utf8'
  )
  const migration316 = readFileSync(
    new URL('../../../../server/database/migrations/316_universal_email_lead_ingestion_integrity.sql', import.meta.url),
    'utf8'
  )
  const migration317 = readFileSync(
    new URL('../../../../server/database/migrations/317_universal_email_lead_ingestion_integrity_round_2.sql', import.meta.url),
    'utf8'
  )

  function postgresEnvironment(databaseUrl: string, schema?: string): NodeJS.ProcessEnv {
    const parsed = new URL(databaseUrl)
    return {
      ...process.env,
      // A session-level search_path is required for isolation. Neon transaction
      // poolers reject that startup option, so integration checks use the same
      // database's direct hostname.
      PGHOST: schema ? parsed.hostname.replace('-pooler.', '.') : parsed.hostname,
      PGPORT: parsed.port || '5432',
      PGUSER: decodeURIComponent(parsed.username),
      PGPASSWORD: decodeURIComponent(parsed.password),
      PGDATABASE: parsed.pathname.slice(1),
      PGSSLMODE: parsed.searchParams.get('sslmode') || 'require',
      ...(schema ? { PGOPTIONS: `-c search_path=${schema},public` } : {})
    }
  }

  function runSql(sql: string, schema?: string) {
    const result = spawnSync('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], {
      env: postgresEnvironment(integrationDatabaseUrl!, schema),
      input: sql,
      encoding: 'utf8'
    })
    if (result.status !== 0) {
      throw new Error(`Postgres integration command failed: ${result.stderr.trim()}`)
    }
    return result
  }

  it('applies twice and enforces privacy, lifecycle, duplicate, replay, and source-drift invariants', () => {
    const schema = `email_ingestion_${randomUUID().replaceAll('-', '')}`
    try {
      const result = runSql(`
        CREATE SCHEMA ${schema};
        SET search_path TO ${schema}, public;
        CREATE TABLE agency_clients (id UUID PRIMARY KEY);
        CREATE TABLE team_members (id UUID PRIMARY KEY);
        CREATE TABLE leads (
          id UUID PRIMARY KEY,
          source TEXT NOT NULL,
          CONSTRAINT leads_source_check CHECK (source IN ('meta', 'google', 'manual', 'webhook', 'csv', 'future_source'))
        );
        CREATE TABLE lead_form_rules (
          id UUID PRIMARY KEY,
          source TEXT NOT NULL,
          CONSTRAINT lead_form_rules_source_check CHECK (source IN ('meta', 'google', 'webhook', 'csv', 'future_source'))
        );
        ${migration315}
        ALTER TABLE lead_email_ingestions
          DROP CONSTRAINT lead_email_ingestions_lifecycle_check;
        ALTER TABLE leads DROP CONSTRAINT leads_source_check;
        ALTER TABLE leads ADD CONSTRAINT leads_source_check
          CHECK (source IN ('meta', 'google', 'manual', 'webhook', 'csv', 'future_source'));
        ALTER TABLE lead_form_rules DROP CONSTRAINT lead_form_rules_source_check;
        ALTER TABLE lead_form_rules ADD CONSTRAINT lead_form_rules_source_check
          CHECK (source IN ('meta', 'google', 'webhook', 'csv', 'future_source'));

        INSERT INTO agency_clients(id) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
        INSERT INTO lead_email_endpoints(
          id, client_id, label, address_prefix, address_token, email_address, form_id, form_name
        ) VALUES (
          '11111111-1111-4111-8111-111111111111',
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          'Test', 'leads', 'lead_3F1qP6jY9mK2vN5xR8cT4wZ7bD0hL',
          'opaque@example.invalid', 'form', 'Form'
        );
        INSERT INTO lead_email_ingestions(
          id, endpoint_id, correlation_id, transport, external_id_hash, provider,
          parser, status, safe_evidence, next_attempt_at
        ) VALUES (
          '22222222-2222-4222-8222-222222222222',
          '11111111-1111-4111-8111-111111111111',
          '33333333-3333-4333-8333-333333333333',
          'cloudflare_email_routing', repeat('a', 64), 'carsales',
          'provider', 'received',
          '{"hasText":true,"hasHtml":false,"hasAdf":false,"fieldKeys":["full_name"]}'::jsonb,
          NULL
        );
        ${migration316}
        ${migration316}
        ${migration317}
        ${migration317}
        SET search_path TO ${schema}, public;

        INSERT INTO leads(id, source) VALUES
          ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'future_source'),
          ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'email');
        INSERT INTO lead_form_rules(id, source) VALUES
          ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'future_source'),
          ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'email');
        DO $backfill$
        BEGIN
          IF (SELECT next_attempt_at IS NULL FROM lead_email_ingestions
              WHERE id = '22222222-2222-4222-8222-222222222222') THEN
            RAISE EXCEPTION 'base-315 received row was not backfilled';
          END IF;
        END
        $backfill$;

        DO $assertions$
        BEGIN
          BEGIN
            INSERT INTO lead_email_ingestions(
              endpoint_id, correlation_id, transport, external_id_hash, provider, status, safe_evidence
            ) VALUES (
              '11111111-1111-4111-8111-111111111111', gen_random_uuid(),
              'cloudflare_email_routing', repeat('b', 64), 'carsales', 'received',
              '{"hasText":true,"hasHtml":false,"hasAdf":false,"fieldKeys":[]}'::jsonb
            );
            RAISE EXCEPTION 'received row without retry schedule was accepted';
          EXCEPTION WHEN check_violation THEN NULL;
          END;

          BEGIN
            INSERT INTO lead_email_ingestions(
              endpoint_id, correlation_id, transport, external_id_hash, provider,
              status, safe_evidence, next_attempt_at
            ) VALUES (
              '11111111-1111-4111-8111-111111111111', gen_random_uuid(),
              'cloudflare_email_routing', repeat('f', 64), 'carsales', 'received',
              '{"hasText":true,"hasHtml":false,"hasAdf":false,"fieldKeys":["person@example.com",1]}'::jsonb,
              NOW()
            );
            RAISE EXCEPTION 'unsafe fieldKeys elements were accepted';
          EXCEPTION WHEN check_violation THEN NULL;
          END;

          BEGIN
            INSERT INTO lead_email_ingestions(
              endpoint_id, correlation_id, transport, external_id_hash, provider,
              status, safe_evidence, terminal_at, duplicate_match_basis,
              duplicate_confidence, duplicate_window_hours
            ) VALUES (
              '11111111-1111-4111-8111-111111111111', gen_random_uuid(),
              'cloudflare_email_routing', repeat('0', 64), 'carsales', 'accepted',
              '{"hasText":true,"hasHtml":false,"hasAdf":false,"fieldKeys":[]}'::jsonb,
              NOW(), 'email_hmac', 0.9, 24
            );
            RAISE EXCEPTION 'duplicate metadata without a referenced lead was accepted';
          EXCEPTION WHEN check_violation THEN NULL;
          END;

          BEGIN
            INSERT INTO lead_email_ingestions(
              endpoint_id, correlation_id, transport, external_id_hash, provider,
              status, safe_evidence, terminal_at, next_attempt_at
            ) VALUES (
              '11111111-1111-4111-8111-111111111111', gen_random_uuid(),
              'cloudflare_email_routing', repeat('c', 64), 'carsales', 'failed',
              '{"hasText":true,"hasHtml":false,"hasAdf":false,"fieldKeys":[]}'::jsonb,
              NOW(), NOW()
            );
            RAISE EXCEPTION 'terminal failed row with retry schedule was accepted';
          EXCEPTION WHEN check_violation THEN NULL;
          END;

          BEGIN
            INSERT INTO lead_email_ingestions(
              endpoint_id, correlation_id, transport, external_id_hash, provider,
              parser, status, safe_evidence, next_attempt_at
            ) VALUES (
              '11111111-1111-4111-8111-111111111111', gen_random_uuid(),
              'cloudflare_email_routing', 'raw@example.invalid', 'carsales',
              'unknown', 'received',
              '{"hasText":true,"hasHtml":false,"hasAdf":false,"fieldKeys":[]}'::jsonb,
              NOW()
            );
            RAISE EXCEPTION 'raw identifier or unknown parser was accepted';
          EXCEPTION WHEN check_violation THEN NULL;
          END;

          BEGIN
            INSERT INTO lead_email_ingestions(
              endpoint_id, correlation_id, transport, external_id_hash, provider,
              status, safe_evidence, terminal_at, possible_duplicate_of_lead_id
            ) VALUES (
              '11111111-1111-4111-8111-111111111111', gen_random_uuid(),
              'cloudflare_email_routing', repeat('d', 64), 'carsales', 'accepted',
              '{"hasText":true,"hasHtml":false,"hasAdf":false,"fieldKeys":[]}'::jsonb,
              NOW(), 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
            );
            RAISE EXCEPTION 'partial duplicate signal was accepted';
          EXCEPTION WHEN check_violation THEN NULL;
          END;

          BEGIN
            INSERT INTO lead_email_ingestions(
              id, endpoint_id, correlation_id, transport, external_id_hash, provider,
              status, safe_evidence, terminal_at, replayed_from
            ) VALUES (
              '44444444-4444-4444-8444-444444444444',
              '11111111-1111-4111-8111-111111111111', gen_random_uuid(),
              'cloudflare_email_routing', repeat('e', 64), 'carsales', 'accepted',
              '{"hasText":true,"hasHtml":false,"hasAdf":false,"fieldKeys":[]}'::jsonb,
              NOW(), '44444444-4444-4444-8444-444444444444'
            );
            RAISE EXCEPTION 'self replay was accepted';
          EXCEPTION WHEN check_violation THEN NULL;
          END;
        END
        $assertions$;

        SELECT 'verified';
      `, schema)
      expect(result.stdout.trim().split('\n').at(-1)).toBe('verified')
    } finally {
      runSql(`DROP SCHEMA IF EXISTS ${schema} CASCADE;`)
    }
  }, 30_000)
})
