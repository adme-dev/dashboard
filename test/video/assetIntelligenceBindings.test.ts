import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'smol-toml'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

type TomlValue = string | number | boolean | TomlValue[] | TomlObject | TomlObject[]
type TomlObject = { [key: string]: TomlValue }

function tomlArray(config: TomlObject, path: string): TomlObject[] {
  const value = path.split('.').reduce<TomlValue | undefined>((cursor, key) => {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) return undefined
    return (cursor as TomlObject)[key]
  }, config)

  if (!Array.isArray(value)) throw new Error(`Expected TOML array at ${path}`)
  return value as TomlObject[]
}

describe('asset intelligence production bindings', () => {
  it('documents the Pages producer and standalone consumer deployment wiring', () => {
    const docs = readFileSync(resolve(root, 'docs/ENVIRONMENT_VARIABLES.md'), 'utf8')
    const deployment = readFileSync(resolve(root, 'workers/asset-intelligence/DEPLOYMENT.md'), 'utf8')

    expect(docs).toContain('Video Asset Intelligence')
    expect(docs).toContain('ASSET_INTELLIGENCE_QUEUE')
    expect(docs).toContain('xeroflow-asset-intelligence')
    expect(docs).toContain('asset-intelligence')
    expect(docs).toContain('asset-intelligence-dlq')
    expect(docs).toContain('HYPERDRIVE')
    expect(docs).toContain('DATABASE_URL')
    expect(docs).toContain('MEDIA_BUCKET')
    expect(docs).toContain('AI')
    expect(docs).toContain('176_video_assets_metadata.sql')
    expect(docs).toContain('177_video_asset_harness.sql')
    expect(docs).toContain('178_video_derivative_bucket_item_unique_index.sql')
    expect(docs).toContain('workers/asset-intelligence/DEPLOYMENT.md')

    expect(deployment).toContain('pnpm exec wrangler queues create asset-intelligence')
    expect(deployment).toContain('pnpm exec wrangler queues create asset-intelligence-dlq')
    expect(deployment).toContain('176_video_assets_metadata.sql')
    expect(deployment).toContain('177_video_asset_harness.sql')
    expect(deployment).toContain('178_video_derivative_bucket_item_unique_index.sql')
    expect(deployment).toContain('pnpm --dir workers/asset-intelligence deploy')
    expect(deployment).toContain('pnpm deploy:production')
    expect(deployment).toContain('Smoke test extraction')
  })

  it('declares the Pages producer binding for asset intelligence jobs', () => {
    const rootWrangler = parse(readFileSync(resolve(root, 'wrangler.toml'), 'utf8')) as TomlObject

    const producer = tomlArray(rootWrangler, 'env.production.queues.producers')
      .find(item => item.binding === 'ASSET_INTELLIGENCE_QUEUE')
    expect(producer).toEqual({
      binding: 'ASSET_INTELLIGENCE_QUEUE',
      queue: 'asset-intelligence'
    })
  })

  it('declares the standalone asset intelligence worker bindings', () => {
    const workerWrangler = parse(readFileSync(resolve(root, 'workers/asset-intelligence/wrangler.toml'), 'utf8')) as TomlObject

    expect(workerWrangler.name).toBe('xeroflow-asset-intelligence')

    expect(tomlArray(workerWrangler, 'queues.consumers')).toEqual([
      {
        queue: 'asset-intelligence',
        max_batch_size: 1,
        max_batch_timeout: 5,
        max_retries: 2,
        dead_letter_queue: 'asset-intelligence-dlq'
      }
    ])

    expect(tomlArray(workerWrangler, 'r2_buckets')).toEqual([
      {
        binding: 'MEDIA_BUCKET',
        bucket_name: 'agency-files'
      }
    ])

    expect(tomlArray(workerWrangler, 'hyperdrive')).toEqual([
      {
        binding: 'HYPERDRIVE',
        id: '900b4b74ec41462cbbabebd0aa8775aa'
      }
    ])

    expect(workerWrangler.ai).toEqual({ binding: 'AI' })
  })
})
