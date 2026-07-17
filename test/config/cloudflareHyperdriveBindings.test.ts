import { readFileSync } from 'node:fs'
import { parse } from 'smol-toml'
import { describe, expect, it } from 'vitest'

interface HyperdriveConfig {
  hyperdrive?: Array<Record<string, unknown>>
}

const HYPERDRIVE_ID = '900b4b74ec41462cbbabebd0aa8775aa'
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

    expect(config.hyperdrive).toContainEqual({
      binding: 'HYPERDRIVE',
      id: HYPERDRIVE_ID
    })
  })

  it('keeps standalone DB-writing workers on the same Hyperdrive config', () => {
    for (const configPath of HYPERDRIVE_WORKER_CONFIGS) {
      expect(readToml(configPath).hyperdrive, configPath).toContainEqual({
        binding: 'HYPERDRIVE',
        id: HYPERDRIVE_ID
      })
    }
  })

  it('keeps the shared Pages DB utility on Hyperdrive before DATABASE_URL fallback', () => {
    const dbUtil = readFileSync('server/utils/db.ts', 'utf8')
    const queryHelper = dbUtil.slice(dbUtil.indexOf('export async function query'))

    expect(dbUtil).toContain('cloudflare?.env?.HYPERDRIVE?.connectionString')
    expect(queryHelper.indexOf('getHyperdriveClient()')).toBeLessThan(queryHelper.indexOf('getSql()'))
    expect(dbUtil).toContain('fallback')
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
