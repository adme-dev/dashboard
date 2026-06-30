import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function read(relativePath: string) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8')
}

describe('analytics connection routing', () => {
  it('keeps GA4 connection management in analytics instead of ad platform connections', () => {
    const route = read('app/pages/agency/analytics/connections.vue')
    const analyticsIndex = read('app/pages/agency/analytics/index.vue')
    const socialIndex = read('app/pages/agency/social/index.vue')
    const funnel = read('app/components/analytics/FunnelChartData.client.vue')

    expect(route).toContain('SocialGa4ConnectCard')
    expect(route).toContain('Analytics Data Sources')
    expect(analyticsIndex).toContain('/agency/analytics/connections')
    expect(socialIndex).not.toContain('SocialGa4ConnectCard')
    expect(funnel).toContain('/agency/analytics/connections')
    expect(funnel).not.toContain('/agency/social/ga4')
  })
})
