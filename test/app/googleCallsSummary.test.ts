import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Google calls summary UI', () => {
  it('uses Nuxt UI with explicit loading, error, empty, duration, and sync-health states', () => {
    const source = readFileSync('app/components/analytics/GoogleCallsSummary.vue', 'utf8')

    for (const component of ['UCard', 'UBadge', 'UIcon', 'UTable', 'USkeleton', 'UAlert']) {
      expect(source).toContain(`<${component}`)
    }
    expect(source).toContain('No Google Ads calls in this period')
    expect(source).toContain('Duration unavailable from Google Ads')
    expect(source).toContain('Sync needs attention')
    expect(source).not.toMatch(/<(?:select|input|button)\b/)
  })

  it('is mounted in both tenant-scoped analytics pages', () => {
    const agency = readFileSync('app/pages/agency/analytics/client/[id].vue', 'utf8')
    const portal = readFileSync('app/pages/portal/analytics/index.vue', 'utf8')
    expect(agency).toContain('<AnalyticsGoogleCallsSummary')
    expect(agency).toContain('/api/agency/analytics/google-calls')
    expect(portal).toContain('<AnalyticsGoogleCallsSummary')
    expect(portal).toContain('/api/portal/analytics/google-calls')
  })
})
