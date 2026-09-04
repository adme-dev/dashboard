import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/340_measurement_tiktok_destination.sql', import.meta.url),
  'utf8'
)

describe('TikTok measurement destination migration', () => {
  it('extends destination and capability constraints without removing GA4', () => {
    expect(migration).toContain('DROP CONSTRAINT IF EXISTS conversion_destinations_platform_check')
    expect(migration).toMatch(/conversion_destinations_platform_check[\s\S]*'meta'[\s\S]*'google_data_manager'[\s\S]*'ga4'[\s\S]*'tiktok'/)

    expect(migration).toContain('DROP CONSTRAINT IF EXISTS conversion_destination_capabilities_platform_check')
    expect(migration).toContain('DROP CONSTRAINT IF EXISTS conversion_destination_capabilities_mode_check')
    expect(migration).toContain('DROP CONSTRAINT IF EXISTS conversion_destination_capabilities_check')
    expect(migration).toMatch(/conversion_destination_capabilities_mode_check[\s\S]*'ga4_measurement_protocol'[\s\S]*'tiktok_pixel'[\s\S]*'tiktok_events_api'/)
    expect(migration).toMatch(/platform = 'ga4'[\s\S]*mode LIKE 'ga4\\_%'[\s\S]*platform = 'tiktok'[\s\S]*mode LIKE 'tiktok\\_%'/)
  })

  it('extends provider-test constraints for dormant TikTok validation', () => {
    expect(migration).toContain('DROP CONSTRAINT IF EXISTS measurement_provider_test_runs_platform_check')
    expect(migration).toContain('DROP CONSTRAINT IF EXISTS measurement_provider_test_runs_mode_check')
    expect(migration).toContain('DROP CONSTRAINT IF EXISTS measurement_provider_test_runs_check1')
    expect(migration).toMatch(/measurement_provider_test_runs_platform_check[\s\S]*'meta'[\s\S]*'google_data_manager'[\s\S]*'tiktok'/)
    expect(migration).toContain("'tiktok_test_events'")
    expect(migration).toMatch(/platform = 'tiktok'[\s\S]*mode = 'tiktok_test_events'/)
  })

  it('preserves live web actions while adding the approved automotive vocabulary', () => {
    for (const constraint of [
      'conversion_event_mappings_canonical_event_name_check',
      'conversion_events_event_name_check',
      'measurement_provider_test_runs_canonical_event_name_check'
    ]) {
      expect(migration).toContain(`DROP CONSTRAINT IF EXISTS ${constraint}`)
    }

    for (const eventName of [
      'phone_click',
      'directions_click',
      'add_to_wishlist',
      'form_submit',
      'vehicle_view',
      'site_search',
      'phone_contact',
      'test_drive_booked'
    ]) {
      expect(migration).toContain(`'${eventName}'`)
    }
  })
})
