import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const component = () => readFileSync('app/components/search-authority/MenuAgentCard.vue', 'utf8')
const workspace = () => readFileSync('app/components/search-authority/Workspace.vue', 'utf8')

describe('Search Authority Menu Agent setup card', () => {
  it('uses Nuxt UI form controls and exposes the versioned GTM bootstrap without calling it a secret', () => {
    const source = component()
    expect(source).toContain('<UFormField')
    expect(source).toContain('<UInput')
    expect(source).toContain('<USelect')
    expect(source).toContain('<UCheckbox')
    expect(source).toContain('menu-agent.v1.js')
    expect(source).toContain('GTM bootstrap snippet')
    expect(source).not.toMatch(/secret|credential/i)
  })

  it('mounts the setup card for the selected tenant and site', () => {
    expect(workspace()).toContain('<SearchAuthorityMenuAgentCard')
    expect(workspace()).toContain(':site-id="selectedSiteId"')
  })
})
