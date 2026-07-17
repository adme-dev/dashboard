import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/256_measurement_signal_hub.sql', import.meta.url),
  'utf8'
)

const rollbackNotes = readFileSync(
  new URL('../../docs/runbooks/measurement-signal-hub-migration-256.md', import.meta.url),
  'utf8'
)

const requiredTables = [
  'client_measurement_profiles',
  'measurement_config_audit',
  'conversion_destinations',
  'conversion_destination_capabilities',
  'conversion_event_mappings',
  'lead_crm_links',
  'lead_status_events',
  'outcome_endpoints',
  'conversion_events',
  'conversion_deliveries',
  'conversion_delivery_attempts'
]

describe('Measurement Signal Hub migration 256', () => {
  it('creates the complete canonical control-plane and delivery schema', () => {
    for (const table of requiredTables) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`)
    }
  })

  it('enforces tenant ownership through client-scoped foreign keys', () => {
    expect(migration).toContain('UNIQUE (client_id, id)')
    expect(migration).toMatch(/FOREIGN KEY \(client_id, profile_id\)[\s\S]*REFERENCES client_measurement_profiles\(client_id, id\)/)
    expect(migration).toMatch(/FOREIGN KEY \(client_id, destination_id\)[\s\S]*REFERENCES conversion_destinations\(client_id, id\)/)
    expect(migration).toMatch(/FOREIGN KEY \(client_id, lead_id\)[\s\S]*REFERENCES leads\(client_id, id\)/)
    expect(migration).toMatch(/FOREIGN KEY \(client_id, opportunity_id\)[\s\S]*REFERENCES crm_opportunities\(client_id, id\)/)
  })

  it('defaults every existing and future client to dormant test mode', () => {
    expect(migration).toMatch(/enabled\s+BOOLEAN NOT NULL DEFAULT FALSE/)
    expect(migration).toMatch(/environment\s+TEXT NOT NULL DEFAULT 'test'/)
    expect(migration).toContain('INSERT INTO client_measurement_profiles')
    expect(migration).toContain('FROM agency_clients')
    expect(migration).toContain('ON CONFLICT (client_id) DO NOTHING')
  })

  it('models provider capabilities independently and prevents external mutation authority', () => {
    for (const mode of [
      'meta_pixel',
      'meta_web_capi',
      'meta_crm_capi',
      'meta_conversion_leads',
      'google_tag_enhanced_conversions',
      'google_enhanced_conversions_for_leads',
      'google_data_manager'
    ]) {
      expect(migration).toContain(`'${mode}'`)
    }

    expect(migration).toContain('UNIQUE (destination_id, mode)')
    expect(migration).toContain('UNIQUE (client_id, id, platform)')
    expect(migration).toContain('platform = \'meta\' AND mode LIKE \'meta\\_%\' ESCAPE \'\\\'')
    expect(migration).toContain('platform = \'google_data_manager\' AND mode LIKE \'google\\_%\' ESCAPE \'\\\'')
    expect(migration).toContain('management_origin = \'zero\' OR can_zero_mutate = FALSE')
  })

  it('enforces optimistic configuration versions and immutable audit evidence', () => {
    expect(migration).toMatch(/config_version\s+INTEGER NOT NULL DEFAULT 1 CHECK \(config_version > 0\)/)
    expect(migration).toContain('prevent_measurement_append_only_mutation')
    expect(migration).toContain('trg_measurement_config_audit_append_only')
    expect(migration).toContain('trg_lead_status_events_append_only')
    expect(migration).toContain('trg_conversion_delivery_attempts_append_only')
  })

  it('enforces event, webhook, mapping and delivery idempotency', () => {
    expect(migration).toContain('UNIQUE (client_id, idempotency_key)')
    expect(migration).toContain('UNIQUE (client_id, source_system, source_event_id)')
    expect(migration).toContain('UNIQUE (event_id, destination_id)')
    expect(migration).toContain('UNIQUE (delivery_id, attempt_number)')
    expect(migration).toContain('endpoint_key TEXT NOT NULL UNIQUE')
    expect(migration).toContain('idx_conversion_event_mappings_one_active')
  })

  it('adds the portal permission with a deny-by-default value', () => {
    expect(migration).toContain(
      'ADD COLUMN IF NOT EXISTS can_manage_lead_outcomes BOOLEAN NOT NULL DEFAULT FALSE'
    )
  })

  it('stores only opaque credential references and blocks common raw PII keys', () => {
    expect(migration).toContain('credential_ref TEXT')
    expect(migration).toContain('current_secret_ref TEXT NOT NULL')
    expect(migration).toContain('previous_secret_ref TEXT')
    expect(migration).toContain('NOT (attribution ?| ARRAY[\'email\', \'phone\', \'first_name\', \'last_name\', \'full_name\'])')
    expect(migration).toContain(
      'attribution - ARRAY[\'browserEventId\', \'metaLeadId\', \'gclid\', \'gbraid\', \'wbraid\'] = \'{}\'::jsonb'
    )

    expect(migration).not.toMatch(/^\s*(access_token|refresh_token|secret_key|raw_payload|email|phone)\s+/im)
  })

  it('provides pending-outbox, health and retention query indexes', () => {
    expect(migration).toContain('idx_conversion_events_pending')
    expect(migration).toContain('idx_conversion_events_client_time')
    expect(migration).toContain('idx_conversion_deliveries_pending')
    expect(migration).toContain('idx_conversion_deliveries_client_health')
    expect(migration).toContain('retention_expires_at')
  })

  it('documents forward-fix and rollback procedures without unsafe automatic data loss', () => {
    expect(rollbackNotes).toContain('Forward-fix is the default')
    expect(rollbackNotes).toContain('Dormant rollback')
    expect(rollbackNotes).toContain('Post-activation recovery')
    expect(rollbackNotes).toContain('Do not drop canonical event or audit tables')
  })
})
