import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const indexPage = readFileSync('app/pages/features/index.vue', 'utf8')
const detailPage = readFileSync('app/pages/features/[slug].vue', 'utf8')
const nav = readFileSync('app/components/MarketingNav.vue', 'utf8')
const integrations = readFileSync('app/pages/resources/integrations.vue', 'utf8')

describe('Meta catalogue platform public copy', () => {
  it('lists the client-scoped inventory feed feature in the index, detail route, and navigation', () => {
    expect(indexPage).toContain("slug: 'dealer-inventory-feeds'")
    expect(detailPage).toContain("'dealer-inventory-feeds':")
    expect(nav).toContain("to: '/features/dealer-inventory-feeds'")
  })

  it('describes verified capability without claiming blocked Meta access is already active', () => {
    for (const source of [indexPage, detailPage, integrations]) {
      expect(source).toContain('Meta catalogue')
    }
    expect(detailPage).toContain('when Meta grants the required catalogue permissions')
    expect(integrations).toContain('provider-readback evidence')
    expect(integrations).not.toContain('automatically launches live campaigns')
  })
})
