import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const portalLayout = readFileSync('app/layouts/portal.vue', 'utf8')
const trendsRoute = readFileSync('server/api/portal/analytics/trends.get.ts', 'utf8')
const websitePage = readFileSync('app/pages/portal/analytics/website.vue', 'utf8')
const platformPage = readFileSync('app/pages/portal/analytics/[platform].vue', 'utf8')

describe('portal analytics navigation', () => {
  it('exposes all supported analytics destinations', () => {
    expect(portalLayout).toContain("to: '/portal/analytics/google'")
    expect(portalLayout).toContain("to: '/portal/analytics/meta'")
    expect(portalLayout).toContain("to: '/portal/analytics/linkedin'")
    expect(portalLayout).toContain("to: '/portal/analytics/tiktok'")
    expect(portalLayout).toContain("to: '/portal/analytics/website'")
  })

  it('opens the analytics submenu when an analytics route is active', () => {
    expect(portalLayout).toContain("route.path === '/portal/analytics' || route.path.startsWith('/portal/analytics/')")
    expect(portalLayout).toContain('defaultOpen: analyticsMenuOpen.value')
  })

  it('renders website tracking and funnel reporting on the dedicated route', () => {
    expect(websitePage).toContain('<PortalFunnelChart')
    expect(websitePage).toContain('<PortalTrackingAnalyticsSection')
  })

  it('keeps website tracking and funnel reporting off paid-platform routes', () => {
    expect(platformPage).not.toContain('<PortalFunnelChart')
    expect(platformPage).not.toContain('<PortalTrackingAnalyticsSection')
  })
})

describe('portal analytics trend fallback', () => {
  it('converts the text month period to a PostgreSQL date', () => {
    expect(trendsRoute).toContain("TO_DATE(ms.period || '-01', 'YYYY-MM-DD') as date")
    expect(trendsRoute).not.toContain("to_char(ms.period || '-01'")
  })
})
