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
  ['app/pages/agency/social/listening/index.vue', 'SocialSuiteSectionNav'],
  ['app/pages/agency/social/reporting/index.vue', 'SocialSuiteSectionNav'],
  ['app/pages/agency/social/publishing/accounts.vue', 'SocialPublishingSectionNav'],
  ['app/pages/agency/social/publishing/analytics.vue', 'SocialPublishingSectionNav'],
  ['app/pages/agency/social/publishing/approvals.vue', 'SocialPublishingSectionNav'],
  ['app/pages/agency/social/publishing/compose.vue', 'SocialPublishingSectionNav'],
  ['app/pages/agency/social/publishing/index.vue', 'SocialPublishingSectionNav'],
  ['app/pages/agency/social/publishing/planner.vue', 'SocialPublishingSectionNav'],
  ['app/pages/agency/social/publishing/queue.vue', 'SocialPublishingSectionNav']
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
})
