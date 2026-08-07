import { describe, expect, it } from 'vitest'
import {
  formatAudienceDelta,
  formatAudienceMetric,
  formatFreshness,
  opportunityTone,
  siteStatusMeta
} from '../../../app/utils/audienceAnalytics'

describe('website audience UI copy', () => {
  it('maps endpoint health to consistent semantic labels and colours', () => {
    expect(siteStatusMeta('receiving')).toMatchObject({
      label: 'Receiving data',
      color: 'success'
    })
    expect(siteStatusMeta('stale')).toMatchObject({
      label: 'Stale signal',
      color: 'warning'
    })
    expect(siteStatusMeta('never_received')).toMatchObject({
      label: 'Never received',
      color: 'neutral'
    })
  })

  it('describes period changes without overstating a zero baseline', () => {
    expect(formatAudienceDelta(0, 0)).toBe('No change')
    expect(formatAudienceDelta(120, 100)).toBe('20% increase')
    expect(formatAudienceDelta(80, 100)).toBe('20% decrease')
    expect(formatAudienceDelta(12, 0)).toBe('New activity')
  })

  it('formats counts, rates, freshness, and opportunity tones for the UI', () => {
    expect(formatAudienceMetric('visitors', 12500)).toBe('12,500')
    expect(formatAudienceMetric('engagementRate', 62.4)).toBe('62.4%')
    expect(formatFreshness(null)).toBe('No events received')
    expect(formatFreshness('2026-08-01T01:30:00Z', new Date('2026-08-01T02:00:00Z'))).toBe('30m ago')
    expect(opportunityTone('opportunity')).toMatchObject({ color: 'primary', label: 'Opportunity' })
    expect(opportunityTone('insufficient_data')).toMatchObject({ color: 'neutral', label: 'Building evidence' })
  })
})
