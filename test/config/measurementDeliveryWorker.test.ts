import { readFileSync } from 'node:fs'
import { parse } from 'smol-toml'
import { describe, expect, it } from 'vitest'

interface WorkerConfig {
  name?: string
  triggers?: {
    crons?: string[]
  }
  queues?: {
    consumers?: Array<Record<string, unknown>>
  }
  hyperdrive?: Array<Record<string, unknown>>
}

describe('measurement delivery Worker production wiring', () => {
  it('declares the dedicated consumer, DLQ and production Hyperdrive binding', () => {
    const config = parse(
      readFileSync('workers/measurement-delivery/wrangler.toml', 'utf8')
    ) as WorkerConfig

    expect(config.name).toBe('measurement-delivery-worker')
    expect(config.queues?.consumers).toEqual([{
      queue: 'measurement-delivery',
      max_batch_size: 5,
      max_batch_timeout: 5,
      max_retries: 3,
      dead_letter_queue: 'measurement-delivery-dlq'
    }])
    expect(config.hyperdrive).toContainEqual({
      binding: 'HYPERDRIVE',
      id: '900b4b74ec41462cbbabebd0aa8775aa'
    })
    expect(config.triggers?.crons).toEqual(['*/15 * * * *'])
  })

  it('requests the Data Manager scope when Google connections are re-consented', () => {
    const googleClient = readFileSync('server/utils/googleAdsClient.ts', 'utf8')

    expect(googleClient).toContain('https://www.googleapis.com/auth/datamanager')
  })

  it('keeps worker secrets out of committed configuration', () => {
    const config = readFileSync('workers/measurement-delivery/wrangler.toml', 'utf8')
    const entry = readFileSync('workers/measurement-delivery/src/index.ts', 'utf8')
    const packageJson = JSON.parse(
      readFileSync('workers/measurement-delivery/package.json', 'utf8')
    ) as { scripts?: Record<string, string> }

    expect(config).not.toMatch(/GOOGLE_CLIENT_SECRET\s*=/)
    expect(config).not.toMatch(/DATABASE_URL\s*=/)
    expect(entry).toContain('env.GOOGLE_CLIENT_SECRET')
    expect(entry).toContain('env.HYPERDRIVE.connectionString')
    expect(entry).toContain('async scheduled(')
    expect(entry).toContain('createMeasurementDiagnosticReconciler')
    expect(packageJson.scripts?.deploy).toBe('node scripts/deploy.mjs')
    expect(packageJson.scripts?.['deploy:dry-run']).toBe('node scripts/deploy.mjs --dry-run')
  })
})
