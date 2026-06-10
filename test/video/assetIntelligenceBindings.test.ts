import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

function tomlBlocks(config: string, table: string): string[] {
  const escapedTable = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return config.match(new RegExp(`\\[\\[${escapedTable}\\]\\][\\s\\S]*?(?=\\n\\[\\[|\\n\\[|$)`, 'g')) || []
}

function blockWithValue(config: string, table: string, key: string, value: string): string | null {
  return tomlBlocks(config, table).find(block => new RegExp(`${key}\\s*=\\s*["']${value}["']`).test(block)) ?? null
}

describe('asset intelligence production bindings', () => {
  it('documents the Pages producer and standalone consumer deployment wiring', () => {
    const docs = readFileSync(resolve(root, 'docs/ENVIRONMENT_VARIABLES.md'), 'utf8')

    expect(docs).toContain('Video Asset Intelligence')
    expect(docs).toContain('ASSET_INTELLIGENCE_QUEUE')
    expect(docs).toContain('xeroflow-asset-intelligence')
    expect(docs).toContain('asset-intelligence')
    expect(docs).toContain('asset-intelligence-dlq')
    expect(docs).toContain('HYPERDRIVE')
    expect(docs).toContain('DATABASE_URL')
    expect(docs).toContain('MEDIA_BUCKET')
    expect(docs).toContain('AI')
    expect(docs).toContain('178_video_derivative_bucket_item_unique_index.sql')
  })

  it('declares the Pages producer binding for asset intelligence jobs', () => {
    const rootWrangler = readFileSync(resolve(root, 'wrangler.toml'), 'utf8')

    const producer = blockWithValue(rootWrangler, 'queues.producers', 'binding', 'ASSET_INTELLIGENCE_QUEUE')
    expect(producer).not.toBeNull()
    expect(producer).toContain('queue = "asset-intelligence"')
  })

  it('declares the standalone asset intelligence worker bindings', () => {
    const workerWrangler = readFileSync(resolve(root, 'workers/asset-intelligence/wrangler.toml'), 'utf8')

    expect(workerWrangler).toContain('name = "xeroflow-asset-intelligence"')

    const consumer = blockWithValue(workerWrangler, 'queues.consumers', 'queue', 'asset-intelligence')
    expect(consumer).not.toBeNull()
    expect(consumer).toContain('max_retries = 2')
    expect(consumer).toContain('dead_letter_queue = "asset-intelligence-dlq"')

    const r2Bucket = blockWithValue(workerWrangler, 'r2_buckets', 'binding', 'MEDIA_BUCKET')
    expect(r2Bucket).not.toBeNull()

    const hyperdrive = blockWithValue(workerWrangler, 'hyperdrive', 'binding', 'HYPERDRIVE')
    expect(hyperdrive).not.toBeNull()

    expect(workerWrangler).toMatch(/\[ai\]\s+binding\s*=\s*["']AI["']/)
  })
})
