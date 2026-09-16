import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const config = readFileSync(new URL('../../wrangler.toml', import.meta.url), 'utf8')
const preview = config.split('[env.preview.vars]')[1]!.split(/^\[/m)[0]!
const production = config.split('[env.production.vars]')[1]!.split(/^\[/m)[0]!

describe('Page Studio staging access configuration', () => {
  it('connects the isolated staging organisation and editor', () => {
    expect(preview).toContain('PAGE_STUDIO_RELEASE_ENVIRONMENT = "staging"')
    expect(preview).toContain('PAGE_STUDIO_CONTENT_ENVIRONMENT = "staging"')
    expect(preview).toContain('PAGE_STUDIO_STAGING_TENANT_ID = "page-studio-staging"')
    expect(preview).toContain('NUXT_PUBLIC_PAGE_STUDIO_EDITOR_URL = "https://studio-staging.xeroflow.io"')
  })

  it('keeps the staging organisation fallback out of production', () => {
    expect(production).not.toContain('PAGE_STUDIO_STAGING_TENANT_ID')
    expect(production).toContain('NUXT_PUBLIC_PAGE_STUDIO_EDITOR_URL = "https://studio.xeroflow.io"')
  })
})
