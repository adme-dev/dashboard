import { describe, expect, it } from 'vitest'
import {
  classifyMeasurementEventIdentity
} from '../../shared/utils/measurementEventIdentity'

describe('measurement event identity classification', () => {
  it('classifies downstream lifecycle outcomes as server-only even when a browser capability exists', () => {
    expect(classifyMeasurementEventIdentity('lead_qualified', ['meta_pixel', 'meta_web_capi']))
      .toEqual({ mode: 'server_only', label: 'Server-only lifecycle event' })
  })

  it('requires shared browser/server identity for a web lead mapped to Web CAPI', () => {
    expect(classifyMeasurementEventIdentity('lead_created', ['meta_pixel', 'meta_web_capi']))
      .toEqual({ mode: 'browser_server_dedup', label: 'Shared browser/server event ID' })
  })

  it('requires shared browser/server identity for TikTok Events API web events', () => {
    expect(classifyMeasurementEventIdentity('web_conversion', ['tiktok_pixel', 'tiktok_events_api']))
      .toEqual({ mode: 'browser_server_dedup', label: 'Shared browser/server event ID' })
  })

  it('keeps CRM CAPI lead events server-only when no web delivery capability is configured', () => {
    expect(classifyMeasurementEventIdentity('lead_created', ['meta_crm_capi', 'meta_conversion_leads']))
      .toEqual({ mode: 'server_only', label: 'Server-only provider event' })
  })
})
