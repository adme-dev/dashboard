import { describe, expect, it } from 'vitest'
import {
  CANONICAL_MEASUREMENT_EVENT_NAMES,
  MEASUREMENT_CAPABILITY_MODES,
  MEASUREMENT_PLATFORMS
} from '~~/app/types/measurement'

describe('measurement frontend contracts', () => {
  it('exposes TikTok and the approved automotive event vocabulary', () => {
    expect(MEASUREMENT_PLATFORMS).toContain('tiktok')
    expect(MEASUREMENT_CAPABILITY_MODES).toEqual(expect.arrayContaining([
      'tiktok_pixel',
      'tiktok_events_api'
    ]))
    expect(CANONICAL_MEASUREMENT_EVENT_NAMES).toEqual(expect.arrayContaining([
      'vehicle_view',
      'site_search',
      'phone_contact',
      'test_drive_booked'
    ]))
  })
})
