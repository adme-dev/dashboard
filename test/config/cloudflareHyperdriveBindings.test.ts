import { readFileSync } from 'node:fs'
import { parse } from 'smol-toml'
import { describe, expect, it } from 'vitest'

interface HyperdriveConfig {
  services?: Array<{ binding: string, service: string }>
  vars?: Record<string, string>
  hyperdrive?: Array<Record<string, unknown>>
  env?: { preview?: HyperdriveConfig, production?: HyperdriveConfig }
}

const HYPERDRIVE_ID = '900b4b74ec41462cbbabebd0aa8775aa'
const HYPERDRIVE_FRESH_ID = '90228af3e2cc461bbc09accc3b47bd9f'
const PAGE_STUDIO_STAGING_HYPERDRIVE_ID = '3865ea5568234fc7b0e9e3e595a30286'
const HYPERDRIVE_WORKER_CONFIGS = [
  'workers/leads-delivery-worker/wrangler.toml',
  'workers/audio-jobs/wrangler.toml',
  'workers/video-generation/wrangler.toml',
  'workers/asset-intelligence/wrangler.toml',
  'workers/measurement-delivery/wrangler.toml'
]

function readToml(path: string): HyperdriveConfig {
  return parse(readFileSync(path, 'utf8')) as HyperdriveConfig
}

describe('Cloudflare Hyperdrive production binding', () => {
  it('binds the Pages app to the production Neon Hyperdrive config', () => {
    const config = readToml('wrangler.toml')
    const production = config.env?.production

    expect(production?.hyperdrive).toContainEqual({
      binding: 'HYPERDRIVE',
      id: HYPERDRIVE_ID
    })
    expect(production?.hyperdrive).toContainEqual({
      binding: 'HYPERDRIVE_FRESH',
      id: HYPERDRIVE_FRESH_ID
    })
  })

  it('binds Pages preview only to the isolated Page Studio staging branch', () => {
    const config = readToml('wrangler.toml')
    const preview = config.env?.preview

    expect(preview?.hyperdrive).toEqual([
      { binding: 'HYPERDRIVE', id: PAGE_STUDIO_STAGING_HYPERDRIVE_ID },
      { binding: 'HYPERDRIVE_FRESH', id: PAGE_STUDIO_STAGING_HYPERDRIVE_ID }
    ])
    expect(PAGE_STUDIO_STAGING_HYPERDRIVE_ID).not.toBe(HYPERDRIVE_ID)
    expect(PAGE_STUDIO_STAGING_HYPERDRIVE_ID).not.toBe(HYPERDRIVE_FRESH_ID)
  })

  it('keeps production and preview provisioning on separate private services', () => {
    const config = readToml('wrangler.toml')
    expect(config.env?.preview?.services?.filter(service => service.binding === 'PAGE_STUDIO_PROVISIONER'))
      .toEqual([{ binding: 'PAGE_STUDIO_PROVISIONER', service: 'xeroflow-provisioning-staging' }])
    expect(config.env?.preview?.vars?.PAGE_STUDIO_PROVISIONING_ENVIRONMENT).toBe('staging')
    expect(config.services?.some(service => service.binding === 'PAGE_STUDIO_PROVISIONER')).not.toBe(true)
    expect(config.env?.production?.services?.filter(service => service.binding === 'PAGE_STUDIO_PROVISIONER'))
      .toEqual([{ binding: 'PAGE_STUDIO_PROVISIONER', service: 'xeroflow-provisioning-production' }])
    expect(config.env?.production?.vars?.PAGE_STUDIO_PROVISIONING_ENVIRONMENT).toBe('production')
  })

  it('keeps production and preview content on separate private routers without management credentials', () => {
    const config = readToml('wrangler.toml')
    expect(config.env?.preview?.services?.filter(service => service.binding === 'PAGE_STUDIO_CONTENT_ROUTER'))
      .toEqual([{ binding: 'PAGE_STUDIO_CONTENT_ROUTER', service: 'xeroflow-content-router-staging' }])
    expect(config.env?.preview?.vars?.PAGE_STUDIO_CONTENT_ENVIRONMENT).toBe('staging')
    expect(config.env?.production?.services?.filter(service => service.binding === 'PAGE_STUDIO_CONTENT_ROUTER'))
      .toEqual([{ binding: 'PAGE_STUDIO_CONTENT_ROUTER', service: 'xeroflow-content-router-production' }])
    expect(config.env?.production?.vars?.PAGE_STUDIO_CONTENT_ENVIRONMENT).toBe('production')
    expect(config.services?.some(service => service.binding === 'PAGE_STUDIO_CONTENT_ROUTER')).not.toBe(true)
    for (const environment of [config.env?.production, config.env?.preview]) {
      expect(environment?.services?.some(service => service.binding === 'PROVISIONING_EXECUTOR')).not.toBe(true)
      expect(environment?.vars?.PROVISIONING_API_TOKEN).toBeUndefined()
    }
  })

  it('keeps standalone DB-writing workers on the same Hyperdrive config', () => {
    for (const configPath of HYPERDRIVE_WORKER_CONFIGS) {
      expect(readToml(configPath).hyperdrive, configPath).toContainEqual({
        binding: 'HYPERDRIVE',
        id: HYPERDRIVE_ID
      })
    }
  })

  it('routes cached and consistency-sensitive Pages queries through separate bindings', () => {
    const dbUtil = readFileSync('server/utils/db.ts', 'utf8')

    expect(dbUtil).toContain('freshness === \'fresh\' ? env.HYPERDRIVE_FRESH : env.HYPERDRIVE')
    expect(dbUtil).toContain('return queryWithFreshness<T>(\'cached\', sql, params)')
    expect(dbUtil).toContain('return queryWithFreshness<T>(\'fresh\', sql, params)')
    expect(dbUtil).toContain('getHyperdriveClient(\'fresh\')')
    expect(dbUtil).toContain('getHyperdriveCs(\'fresh\')')
    expect(dbUtil).toContain('const sqlFn = getSql()')
  })

  it('enables Nitro request context before database helpers resolve Hyperdrive with useEvent', () => {
    const nuxtConfig = readFileSync('nuxt.config.ts', 'utf8')
    const dbUtil = readFileSync('server/utils/db.ts', 'utf8')

    expect(dbUtil).toContain('const event = useEvent()')
    expect(nuxtConfig).toContain('asyncContext: true')
  })

  it('documents Hyperdrive as active production infrastructure, not pending setup', () => {
    const optimizationPlan = readFileSync('docs/cloudflare-optimization-plan.md', 'utf8')

    expect(optimizationPlan).toContain(`id = "${HYPERDRIVE_ID}"`)
    expect(optimizationPlan).toContain('**Status**: Active in production')
    expect(optimizationPlan).toContain('Pages app and standalone DB-writing Workers share the same `HYPERDRIVE` binding id')
    expect(optimizationPlan).not.toContain('<your-hyperdrive-config-id>')
    expect(optimizationPlan).not.toContain('requires Hyperdrive config creation via CLI')
  })
})
