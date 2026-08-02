import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('client portal nearby market contract', () => {
  it('guards discovery with analytics access and keeps navigation and scrolling portal-safe', () => {
    const page = read('app/pages/portal/analytics/market.vue')
    const layout = read('app/layouts/portal.vue')
    const features = read('app/pages/portal/features.vue')
    const panel = read('app/components/portal/NearbyMarketPanel.vue')

    expect(page).toMatch(/definePageMeta\(\{\s*layout:\s*'portal',\s*middleware:\s*'portal-auth'/)
    expect(page).toMatch(/canViewAnalytics/)
    expect(page).toMatch(/navigateTo\('\/portal'\)/)
    expect(page).toMatch(/PortalNearbyMarketPanel/)
    expect(page).toMatch(/min-h-0/)

    expect(layout).toMatch(/canViewAnalytics[\s\S]*label:\s*'Nearby market'[\s\S]*to:\s*'\/portal\/analytics\/market'/)
    expect(layout).toMatch(/overflow-y-auto/)
    expect(features).toMatch(/Nearby market/)
    expect(features).toMatch(/to:\s*'\/portal\/analytics\/market'/)
    expect(features).toMatch(/permission:\s*canViewAnalytics\.value/)

    expect(panel).toMatch(/data-nearby-market-list/)
    expect(panel).toMatch(/max-h-\[28rem\][^"']*overflow-y-auto/)
    expect(panel).toMatch(/scrollIntoView/)
    expect(panel.indexOf('data-nearby-market-list'))
      .toBeLessThan(panel.indexOf('<NearbyMarketMap'))
    expect(panel).toMatch(/grid-cols-1[\s\S]*lg:grid-cols-/)
  })

  it('uses the client-authenticated API and exposes only client-safe market actions and states', () => {
    const panel = read('app/components/portal/NearbyMarketPanel.vue')
    const modal = read('app/components/portal/CompetitorNominationModal.vue')
    const portalUi = `${panel}\n${modal}`

    expect(panel).toMatch(/\/api\/client-portal\/site-intelligence\/nearby-market/)
    expect(panel).not.toMatch(/clientId/)
    expect(panel).toMatch(/NearbyMarketMap/)
    expect(panel).toMatch(/Up to 20/)
    expect(panel).toMatch(/Suggested/)
    expect(panel).toMatch(/Under review/)
    expect(panel).toMatch(/Monitored/)
    expect(panel).toMatch(/Not selected/)
    expect(panel).toMatch(/canNominateCompetitors/)
    expect(panel).toMatch(/Contact your agency/)
    expect(panel).toMatch(/UFormField[\s\S]*Monitoring status[\s\S]*USelectMenu/)
    expect(panel).toMatch(/value:\s*'not_selected'/)
    expect(panel).toMatch(/monitoringStatus/)
    expect(panel).not.toMatch(/as unknown as NearbyMarketCandidate/)

    expect(modal).toMatch(/UModal/)
    expect(modal).toMatch(/UFormField[\s\S]*Reason[\s\S]*UTextarea/)
    expect(modal).toMatch(/maxlength="1000"/)
    expect(modal).toMatch(/reason\.value\.trim\(\)/)
    expect(modal).toMatch(/nomination does not start indexing/i)
    expect(modal).toMatch(/encodeURIComponent\(candidate\.placeId\)/)
    expect(modal).toMatch(/marketLocationId[\s\S]*radiusKm[\s\S]*reason/)

    expect(portalUi).not.toMatch(/Review website|Manual website|Provider diagnostics|Crawler settings|Approve & index|Save for later|Dismiss|Retry crawl|agencyReviewReason|raw provider error/i)
  })
})
