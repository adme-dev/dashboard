import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/406_dealer_measurement_event_identity.sql', import.meta.url),
  'utf8'
)

describe('dealer measurement event identity migration', () => {
  it('widens canonical event constraints for directions clicks', () => {
    expect(migration).toMatch(/conversion_event_mappings_canonical_event_name_check[\s\S]*'directions_click'/)
    expect(migration).toMatch(/conversion_events_event_name_check[\s\S]*'directions_click'/)
  })

  it('widens both exact enquiry-type constraints for service bookings', () => {
    expect(migration).toMatch(/conversion_event_mappings_enquiry_type_check[\s\S]*'service_booking'/)
    expect(migration).toMatch(/conversion_events_enquiry_type_check[\s\S]*'service_booking'/)
  })
})
