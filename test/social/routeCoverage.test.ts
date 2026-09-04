import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function listVueFiles(relativeDir: string): string[] {
  const dir = new URL(`../../${relativeDir}`, import.meta.url)

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(relativeDir, entry.name)

    if (entry.isDirectory()) return listVueFiles(path)
    if (entry.isFile() && entry.name.endsWith('.vue')) return [path]

    return []
  })
}

function read(relativePath: string) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8')
}

const agencySocialRouteNavs = new Map([
  ['app/pages/agency/social/[platform].vue', 'SocialSpendSectionNav'],
  ['app/pages/agency/social/index.vue', 'SocialSpendSectionNav'],
  ['app/pages/agency/social/spend.vue', 'SocialSpendSectionNav'],
  ['app/pages/agency/social/inbox/analytics.vue', 'SocialSuiteSectionNav'],
  ['app/pages/agency/social/inbox/approvals.vue', 'SocialSuiteSectionNav'],
  ['app/pages/agency/social/inbox/automation.vue', 'SocialSuiteSectionNav'],
  ['app/pages/agency/social/inbox/index.vue', 'SocialSuiteSectionNav'],
  ['app/pages/agency/social/inbox/reviews.vue', 'SocialSuiteSectionNav'],
  ['app/pages/agency/social/inbox/settings.vue', 'SocialSuiteSectionNav'],
  ['app/pages/agency/social/inbox/wall.vue', 'SocialSuiteSectionNav'],
  ['app/pages/agency/social/listening/index.vue', 'SocialSuiteSectionNav'],
  ['app/pages/agency/social/reporting/index.vue', 'SocialSuiteSectionNav'],
  ['app/pages/agency/social/publishing/accounts.vue', 'SocialPublishingShell'],
  ['app/pages/agency/social/publishing/analytics.vue', 'SocialPublishingShell'],
  ['app/pages/agency/social/publishing/approvals.vue', 'SocialPublishingShell'],
  ['app/pages/agency/social/publishing/calendar.vue', 'SocialPublishingCalendarView'],
  ['app/pages/agency/social/publishing/compose.vue', 'SocialPublishingShell'],
  ['app/pages/agency/social/publishing/feed.vue', 'SocialPublishingShell'],
  ['app/pages/agency/social/publishing/news.vue', 'SocialPublishingShell'],
  ['app/pages/agency/social/publishing/index.vue', '/agency/social/publishing/calendar'],
  ['app/pages/agency/social/publishing/planner.vue', 'SocialPublishingShell'],
  ['app/pages/agency/social/publishing/queue.vue', 'SocialPublishingShell'],
  ['app/pages/agency/social/publishing/wall.vue', 'SocialPublishingShell']
])

const portalSocialRouteNavs = new Map([
  ['app/pages/portal/social-inbox.vue', 'PortalSocialSectionNav'],
  ['app/pages/portal/social-listening.vue', 'PortalSocialSectionNav'],
  ['app/pages/portal/social-reporting.vue', 'PortalSocialSectionNav']
])

describe('social route navigation coverage', () => {
  it('keeps every agency social route covered by the expected section navigation', () => {
    const routeFiles = listVueFiles('app/pages/agency/social').sort()

    expect(routeFiles).toEqual([...agencySocialRouteNavs.keys()].sort())

    for (const routeFile of routeFiles) {
      expect(read(routeFile)).toContain(agencySocialRouteNavs.get(routeFile))
    }
  })

  it('keeps every portal social route covered by the expected section navigation', () => {
    const routeFiles = listVueFiles('app/pages/portal')
      .filter(path => path.includes('/social-'))
      .sort()

    expect(routeFiles).toEqual([...portalSocialRouteNavs.keys()].sort())

    for (const routeFile of routeFiles) {
      expect(read(routeFile)).toContain(portalSocialRouteNavs.get(routeFile))
    }
  })

  it('keeps the full agency Social group near the media buying shortcuts', () => {
    const layout = read('app/layouts/agency.vue')

    const budgetIndex = layout.indexOf('// Budget Tracker')
    const socialIndex = layout.indexOf('// Social — paid + organic social operations')
    const leadsIndex = layout.indexOf('// Leads — inbound inquiries')
    const creativeIndex = layout.indexOf('// Page Studio has its own permission')

    expect(socialIndex).toBeGreaterThan(budgetIndex)
    expect(socialIndex).toBeLessThan(leadsIndex)
    expect(socialIndex).toBeLessThan(creativeIndex)
  })

  it('keeps paid social routes in the Social group instead of duplicating them in Budget Tracker', () => {
    const layout = read('app/layouts/agency.vue')

    const budgetIndex = layout.indexOf('// Budget Tracker')
    const socialIndex = layout.indexOf('// Social — paid + organic social operations')
    const budgetSection = layout.slice(budgetIndex, socialIndex)

    expect(budgetSection).not.toContain('socialSpendNavItems')
    expect(budgetSection).not.toContain('/agency/social')
  })

  it('keeps active social sidebar items scrolled into view on social routes', () => {
    const layout = read('app/layouts/agency.vue')

    expect(layout).toContain('agency-main-nav')
    expect(layout).toContain('scrollActiveMainNavItemIntoView')
    expect(layout).toContain('route.path.startsWith(\'/agency/social\')')
    expect(layout).toContain('window.setTimeout(() => scrollActiveMainNavItemIntoView')
    expect(layout).toContain('watch([() => route.path, () => mainNav.value.length]')
  })

  it('keeps engagement social headers responsive around client controls', () => {
    const compactInboxHeaders = [
      'app/pages/agency/social/inbox/index.vue',
      'app/pages/agency/social/inbox/reviews.vue'
    ]
    const stackedInboxHeaders = [
      'app/pages/agency/social/inbox/analytics.vue',
      'app/pages/agency/social/inbox/approvals.vue',
      'app/pages/agency/social/inbox/automation.vue'
    ]

    for (const routeFile of compactInboxHeaders) {
      const source = read(routeFile)
      expect(source).toContain('flex flex-wrap items-center gap-3 p-4 border-b border-default')
      expect(source).toContain('w-56 max-w-full')
    }

    for (const routeFile of stackedInboxHeaders) {
      const source = read(routeFile)
      expect(source).toContain('flex flex-wrap')
      expect(source).toContain('w-56 max-w-full')
    }

    const settingsSource = read('app/pages/agency/social/inbox/settings.vue')
    expect(settingsSource).toContain('flex flex-wrap')
    expect(settingsSource).toContain('w-full sm:w-64')
  })

  it('keeps publishing analytics connected to the existing AI reporting summary', () => {
    const source = read('app/pages/agency/social/publishing/analytics.vue')

    expect(source).toContain('aiSummary')
    expect(source).toContain('generateSummary')
    expect(source).toContain('/api/agency/social/publishing/analytics/overview')
  })
})
