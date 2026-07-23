import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PROVIDER_TRACKING_SETTINGS,
  filterProviderInteractionEvents,
  normalizeProviderTrackingSettings
} from '../../../../server/utils/tracking/provider-settings'

describe('tracking provider settings', () => {
  it('defaults to universal passive interaction detection and no confirmed lead ingestion', () => {
    expect(normalizeProviderTrackingSettings(undefined)).toEqual(DEFAULT_PROVIDER_TRACKING_SETTINGS)
    expect(DEFAULT_PROVIDER_TRACKING_SETTINGS).toEqual({
      podium: {
        interactions: true,
        confirmedLeads: false,
        organizationUid: null,
        locationUids: []
      },
      xtime: { interactions: true, confirmedLeads: false }
    })
  })

  it('backfills Podium identity fields for existing site settings', () => {
    expect(normalizeProviderTrackingSettings({
      podium: { interactions: true, confirmedLeads: false },
      xtime: { interactions: true, confirmedLeads: false }
    }).podium).toEqual({
      interactions: true,
      confirmedLeads: false,
      organizationUid: null,
      locationUids: []
    })
  })

  it('requires an exact Podium organization and location allowlist before activation', () => {
    expect(() => normalizeProviderTrackingSettings({
      podium: { interactions: true, confirmedLeads: true },
      xtime: { interactions: true, confirmedLeads: false }
    })).toThrow()

    expect(normalizeProviderTrackingSettings({
      podium: {
        interactions: true,
        confirmedLeads: true,
        organizationUid: '019621ff-3586-7ed2-a838-9450286d17ff',
        locationUids: ['019621ff-36c0-7999-8c07-b3a9b0cb4e12']
      },
      xtime: { interactions: true, confirmedLeads: false }
    }).podium.confirmedLeads).toBe(true)
  })

  it('filters only disabled provider interactions and preserves all other events', () => {
    const events = [
      { event_name: 'page_view', event_data: {} },
      { event_name: 'provider_interaction', event_data: { provider: 'podium' } },
      { event_name: 'provider_interaction', event_data: { provider: 'xtime' } }
    ]

    expect(filterProviderInteractionEvents(events, {
      podium: {
        interactions: false,
        confirmedLeads: false,
        organizationUid: null,
        locationUids: []
      },
      xtime: { interactions: true, confirmedLeads: false }
    }).map(event => event.event_data?.provider ?? event.event_name)).toEqual([
      'page_view',
      'xtime'
    ])
  })

  it('rejects unknown configuration keys instead of silently enabling providers', () => {
    expect(() => normalizeProviderTrackingSettings({
      podium: { interactions: true, confirmedLeads: false },
      xtime: { interactions: true, confirmedLeads: false },
      unknown: { interactions: true, confirmedLeads: true }
    })).toThrow()
  })
})
