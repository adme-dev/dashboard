import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('private Page Studio management deployment configuration', () => {
  it.each([
    ['staging', '3865ea5568234fc7b0e9e3e595a30286'],
    ['production', '90228af3e2cc461bbc09accc3b47bd9f']
  ])('%s is private and uses its exact fresh Hyperdrive binding', (environment, id) => {
    const config = JSON.parse(readFileSync(fileURLToPath(new URL(`../../workers/page-studio-management/wrangler.${environment}.jsonc`, import.meta.url)), 'utf8'))
    expect(config.name).toBe(`xeroflow-page-studio-management-${environment}`)
    expect(config.account_id).toBe('a5b299b3ad15c1b5b895dc66f9357b17')
    expect(config.main).toBe('src/index.ts')
    expect(config.compatibility_date).toBe('2026-07-15')
    expect(config.compatibility_flags).toEqual(['nodejs_compat'])
    expect(config.workers_dev).toBe(false)
    expect(config.preview_urls).toBe(false)
    expect(config.routes).toEqual([])
    expect(config.route).toBeUndefined()
    expect(config.triggers).toEqual({ crons: [] })
    expect(config.vars).toEqual({ PAGE_STUDIO_RELEASE_ENVIRONMENT: environment,
      ...(environment === 'production'
        ? {
            PAGE_STUDIO_CLOUDFLARE_ACCOUNT_ID: 'a5b299b3ad15c1b5b895dc66f9357b17',
            PAGE_STUDIO_CLOUDFLARE_ZONE_ID: '8e38cbf3910d291dd218710296661073'
          }
        : {}) })
    expect(config.hyperdrive).toEqual([{ binding: 'HYPERDRIVE_FRESH', id }])
    expect(config.services).toEqual(environment === 'production'
      ? [{ binding: 'PAGE_STUDIO_CLIENT_STAGING', service: 'xeroflow-page-studio-client-staging' }]
      : undefined)
  })
})
