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
      podium: { interactions: true, confirmedLeads: false },
      xtime: { interactions: true, confirmedLeads: false }
    })
  })

  it('filters only disabled provider interactions and preserves all other events', () => {
    const events = [
      { event_name: 'page_view', event_data: {} },
      { event_name: 'provider_interaction', event_data: { provider: 'podium' } },
      { event_name: 'provider_interaction', event_data: { provider: 'xtime' } }
    ]

    expect(filterProviderInteractionEvents(events, {
      podium: { interactions: false, confirmedLeads: false },
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
