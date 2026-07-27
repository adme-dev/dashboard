import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL(
  '../../server/database/migrations/313_ga4_micro_conversions.sql',
  import.meta.url
)

describe('GA4 micro-conversions migration 313', () => {
  it('widens platform/event-name checks for ga4 and adds tracking_events.ga_client_id', () => {
    const migration = readFileSync(migrationPath, 'utf8')

    expect(migration).toContain('BEGIN;')
    expect(migration).toContain('conversion_destinations_platform_check')
    expect(migration).toContain('conversion_destination_capabilities_platform_check')
    expect(migration).toContain('conversion_destination_capabilities_mode_check')
    expect(migration).toContain('conversion_event_mappings_canonical_event_name_check')
    expect(migration).toContain('conversion_events_event_name_check')
    expect(migration).toMatch(/CHECK \(platform IN \('meta', 'google_data_manager', 'ga4'\)\)/)
    expect(migration).toContain("'ga4_measurement_protocol'")
    expect(migration).toMatch(/CHECK \(canonical_event_name IN \(\s*'lead_created', 'lead_contacted', 'lead_qualified', 'lead_won',\s*'lead_lost', 'purchase', 'web_conversion',\s*'phone_click', 'add_to_wishlist', 'form_submit'\s*\)\)/)
    expect(migration).toMatch(/CHECK \(event_name IN \(\s*'lead_created', 'lead_contacted', 'lead_qualified', 'lead_won',\s*'lead_lost', 'purchase', 'web_conversion',\s*'phone_click', 'add_to_wishlist', 'form_submit'\s*\)\)/)
    expect(migration).toMatch(/ALTER TABLE tracking_events\s+ADD COLUMN IF NOT EXISTS ga_client_id TEXT NULL;/)
    expect(migration).toContain('COMMIT;')
  })
})
