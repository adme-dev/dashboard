import { readFileSync } from 'node:fs'
import { parse } from 'smol-toml'
import { describe, expect, it } from 'vitest'

interface HyperdriveConfig {
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

  it('documents Hyperdrive as active production infrastructure, not pending setup', () => {
    const optimizationPlan = readFileSync('docs/cloudflare-optimization-plan.md', 'utf8')

    expect(optimizationPlan).toContain(`id = "${HYPERDRIVE_ID}"`)
    expect(optimizationPlan).toContain('**Status**: Active in production')
    expect(optimizationPlan).toContain('Pages app and standalone DB-writing Workers share the same `HYPERDRIVE` binding id')
    expect(optimizationPlan).not.toContain('<your-hyperdrive-config-id>')
    expect(optimizationPlan).not.toContain('requires Hyperdrive config creation via CLI')
  })
})
