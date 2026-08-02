import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('agency nearby market panel contract', () => {
  it('keeps discovery independent and provides the complete responsive list and map workflow', () => {
    const panel = read('app/components/analytics/audiences/intelligence/NearbyMarketPanel.vue')
    const page = read('app/pages/agency/analytics/audiences/intelligence.vue')

    expect(page).toContain('AnalyticsAudiencesIntelligenceNearbyMarketPanel')
    expect(page).toContain('id="site-intelligence-run-diagnostics"')
    expect(page.indexOf('AnalyticsAudiencesIntelligenceNearbyMarketPanel'))
      .toBeLessThan(page.indexOf('<template v-if="overview">'))
    expect(panel).toMatch(/Nearby market/)
    expect(panel).toMatch(/Up to 20 discovery candidates/i)
    expect(panel).toMatch(/10 km/)
    expect(panel).toMatch(/25 km/)
    expect(panel).toMatch(/50 km/)
    expect(panel).toMatch(/Include used and independent dealers/)
    expect(panel).toMatch(/UFormField[\s\S]*Brand[\s\S]*USelectMenu/)
    expect(panel).toMatch(/UFormField[\s\S]*Monitoring status[\s\S]*USelectMenu/)
    expect(panel).toMatch(/value:\s*'all'/)
    expect(panel).toMatch(/data-candidate-row/)
    expect(panel).toMatch(/@focus="selectCandidate/)
    expect(panel).toMatch(/scrollIntoView/)
    expect(panel).toMatch(/\.focus\(/)
    expect(panel).toMatch(/grid-cols-1[\s\S]*lg:grid-cols-/)
    expect(panel.indexOf('data-nearby-market-list'))
      .toBeLessThan(panel.indexOf('<NearbyMarketMap'))
    expect(panel).toMatch(/UAlert/)
    expect(panel).toMatch(/misconfigured|rate-limited|quota-exceeded|unavailable/)
    expect(panel).toMatch(/AnalyticsAudiencesIntelligenceNominationQueue/)
  })

  it('requires explicit preview and confirmation for a labelled market address', () => {
    const modal = read('app/components/analytics/audiences/intelligence/MarketLocationModal.vue')

    expect(modal).toMatch(/UModal/)
    expect(modal).toMatch(/UFormField[\s\S]*Address[\s\S]*UInput/)
    expect(modal).toMatch(/UFormField[\s\S]*Location label[\s\S]*UInput/)
    expect(modal).toMatch(/action:\s*'preview'/)
    expect(modal).toMatch(/Preview address/)
    expect(modal).toMatch(/Confirm this location/)
    expect(modal).toMatch(/formattedAddress/)
  })

  it('renders nominations as an independently retryable review queue', () => {
    const queue = read('app/components/analytics/audiences/intelligence/NominationQueue.vue')

    expect(queue).toMatch(/Client nominations/)
    expect(queue).toMatch(/nominatedByName/)
    expect(queue).toMatch(/nominationReason/)
    expect(queue).toMatch(/Retry nominations/)
    expect(queue).toMatch(/Review/)
    expect(queue).toMatch(/\$emit\('review', nomination\)/)
    expect(queue).toMatch(/UAlert/)
  })
})
