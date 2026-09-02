import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('Page Studio workspace navigation', () => {
  it('adds a first-class permission-gated website workspace to the agency sidebar', () => {
    const layout = read('app/layouts/agency.vue')

    expect(layout).toContain('hasPermission')
    expect(layout).toContain(`hasPermission('PAGE_STUDIO_VIEW')`)
    expect(layout).toContain(`label: 'Websites'`)
    expect(layout).toContain(`label: 'Demo Sites'`)
    expect(layout).toContain(`to: '/agency/page-studio'`)
  })

  it('shows Websites in the client portal only when the user has an assigned site', () => {
    const layout = read('app/layouts/portal.vue')

    expect(layout).toContain(`'/api/portal/page-studio/sites'`)
    expect(layout).toContain('pageStudioNavigation.value.total > 0')
    expect(layout).toContain(`label: 'Websites'`)
    expect(layout).toContain(`to: '/portal/page-studio'`)
  })

  it('launches Studio without exposing a parallel dashboard page builder', () => {
    const workspace = read('app/components/page-studio/SiteWorkspace.vue')

    expect(workspace).toContain('label="Launch Studio"')
    expect(workspace).toContain('@click="launchStudio(site)"')
    expect(workspace).not.toContain('label="Manage Pages"')
    expect(workspace).not.toContain('/edit`')
  })

  it('provides agency and portal workspace pages backed by their scoped APIs', () => {
    const agencyPage = 'app/pages/agency/page-studio/index.vue'
    const portalPage = 'app/pages/portal/page-studio/index.vue'

    expect(existsSync(agencyPage)).toBe(true)
    expect(existsSync(portalPage)).toBe(true)
    expect(read(agencyPage)).toContain(`'/api/agency/page-studio/sites'`)
    expect(read(agencyPage)).toContain('PageStudioSiteWorkspace')
    expect(read(portalPage)).toContain(`definePageMeta({ layout: 'portal', middleware: 'portal-auth' })`)
    expect(read(portalPage)).toContain(`'/api/portal/page-studio/sites'`)
    expect(read(portalPage)).toContain('PageStudioSiteWorkspace')
  })

  it('uses a shared Nuxt UI workspace with explicit loading, error, and empty states', () => {
    const componentPath = 'app/components/page-studio/SiteWorkspace.vue'

    expect(existsSync(componentPath)).toBe(true)
    const component = read(componentPath)
    expect(component).toContain('<USkeleton')
    expect(component).toContain('<UAlert')
    expect(component).toContain('<UButton')
    expect(component).toContain('<UBadge')
    expect(component).toContain('<UPagination')
    expect(component).not.toMatch(/<(?:button|input|select|textarea)\b/)
  })

  it('keeps the public feature catalogue in sync', () => {
    const featureIndex = read('app/pages/features/index.vue')
    const featureDetail = read('app/pages/features/[slug].vue')
    const marketingNav = read('app/components/MarketingNav.vue')

    expect(featureIndex).toContain('title: \'Page Studio\'')
    expect(featureIndex).toContain('slug: \'page-studio\'')
    expect(featureDetail).toContain('\'page-studio\': {')
    expect(featureDetail).toContain('title: \'Page Studio\'')
    expect(marketingNav).toContain('to: \'/features/page-studio\'')
  })
})
