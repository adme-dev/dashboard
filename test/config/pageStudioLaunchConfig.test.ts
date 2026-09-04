import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Page Studio launch configuration', () => {
  it('exposes the production editor origin through Nuxt public runtime config', () => {
    const nuxtConfig = readFileSync('nuxt.config.ts', 'utf8')
    const wranglerConfig = readFileSync('wrangler.toml', 'utf8')

    expect(nuxtConfig).toContain(
      "pageStudioEditorUrl: process.env.NUXT_PUBLIC_PAGE_STUDIO_EDITOR_URL || ''"
    )
    expect(wranglerConfig).toContain(
      'NUXT_PUBLIC_PAGE_STUDIO_EDITOR_URL = "https://studio.xeroflow.io"'
    )
  })
})
