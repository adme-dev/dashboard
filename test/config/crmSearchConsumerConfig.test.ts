import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parse } from 'smol-toml'
import { describe, expect, it } from 'vitest'

const workerRoot = join(process.cwd(), 'workers/crm-search-consumer')
const readWorkerFile = (path: string) => readFileSync(join(workerRoot, path), 'utf8')

interface QueueConsumerConfig {
  queue?: string
  max_batch_size?: number
  max_batch_timeout?: number
  max_retries?: number
  retry_delay?: number
  max_concurrency?: number
  dead_letter_queue?: string
}

interface WorkerConfig {
  name?: string
  main?: string
  compatibility_date?: string
  compatibility_flags?: string[]
  workers_dev?: boolean
  observability?: { enabled?: boolean }
  vars?: Record<string, unknown>
  secrets?: { required?: string[] }
  queues?: { producers?: unknown[], consumers?: QueueConsumerConfig[] }
  ai?: unknown
  vectorize?: unknown
}

const config = () => parse(readWorkerFile('wrangler.toml')) as WorkerConfig
const pkg = () => JSON.parse(readWorkerFile('package.json')) as {
  name: string
  scripts: Record<string, string>
}

describe('CRM search consumer configuration', () => {
  it('pins the immutable standalone Worker and its exact entry point', () => {
    expect(config()).toMatchObject({
      name: 'agency-crm-search-consumer',
      main: 'src/index.ts',
      compatibility_date: '2026-08-10',
      compatibility_flags: ['nodejs_compat'],
      workers_dev: false,
      observability: { enabled: true }
    })
    expect(config().vars?.CRM_SEARCH_PAGES_BASE_URL)
      .toBe('https://agency-dashboard-6cm.pages.dev')
  })

  it('declares only the dedicated primary/DLQ consumers with fail-closed limits', () => {
    const consumers = config().queues?.consumers
    expect(consumers).toEqual([
      {
        queue: 'agency-crm-search-index',
        max_batch_size: 5,
        max_batch_timeout: 5,
        max_retries: 5,
        retry_delay: 30,
        max_concurrency: 4,
        dead_letter_queue: 'agency-crm-search-index-dlq'
      },
      {
        queue: 'agency-crm-search-index-dlq',
        max_batch_size: 5,
        max_batch_timeout: 5,
        max_retries: 3,
        retry_delay: 30,
        max_concurrency: 2
      }
    ])
    expect(config().queues?.producers).toBeUndefined()
    expect(config().ai).toBeUndefined()
    expect(config().vectorize).toBeUndefined()
  })

  it('requires signing and frozen release/readback evidence instead of ready defaults', () => {
    expect(config().secrets?.required).toEqual(expect.arrayContaining([
      'CRM_SEARCH_SERVICE_KEYRING',
      'CRM_SEARCH_IMPLEMENTATION_SHA',
      'CRM_SEARCH_WORKER_ARTIFACT_DIGEST',
      'CRM_SEARCH_BINDING_MANIFEST_DIGEST',
      'CRM_SEARCH_EXPECTED_PAGES_SHA',
      'CRM_SEARCH_EXPECTED_PAGES_ARTIFACT_DIGEST',
      'CRM_SEARCH_EXPECTED_PAGES_BINDING_MANIFEST_DIGEST',
      'CRM_SEARCH_RESOURCE_MANIFEST'
    ]))
    expect(config().vars).toEqual({
      CRM_SEARCH_PAGES_BASE_URL: 'https://agency-dashboard-6cm.pages.dev'
    })
  })

  it('generates Cloudflare bindings, typechecks strictly, and exposes only a guarded dry run', () => {
    expect(pkg().name).toBe('@xeroflow/crm-search-consumer')
    expect(pkg().scripts.types).toContain('wrangler types')
    expect(pkg().scripts.types).toContain('--env-interface CrmSearchConsumerEnv')
    expect(pkg().scripts.typecheck).toContain('pnpm types')
    expect(pkg().scripts.typecheck).toContain('tsc --noEmit')
    expect(pkg().scripts['deploy:dry-run']).toBe('node scripts/deploy.mjs --dry-run')
    expect(pkg().scripts.deploy).toBeUndefined()

    const tsconfig = JSON.parse(readWorkerFile('tsconfig.json')) as {
      compilerOptions?: { strict?: boolean, noEmit?: boolean }
    }
    expect(tsconfig.compilerOptions).toMatchObject({ strict: true, noEmit: true })
  })

  it('uses an immutable deploy/config guard and never provisions or deploys resources', () => {
    const deploy = readWorkerFile('scripts/deploy.mjs')
    expect(deploy).toContain(`const IMMUTABLE_WORKER_NAME = 'agency-crm-search-consumer'`)
    expect(deploy).toContain(`const IMMUTABLE_CONFIG_NAME = 'wrangler.toml'`)
    expect(deploy).toContain(`const IMMUTABLE_PAGES_ORIGIN = 'https://agency-dashboard-6cm.pages.dev'`)
    expect(deploy).toContain(`const IMMUTABLE_COMPATIBILITY_DATE = '2026-08-10'`)
    expect(deploy).toContain('const REQUIRED_SECRET_NAMES = Object.freeze([')
    expect(deploy).toContain(`const REQUIRED_MODE = '--dry-run'`)
    expect(deploy).toContain(`'deploy', '--dry-run'`)
    expect(deploy).toContain('config.observability?.enabled === true')
    expect(deploy).toContain('config.ai === undefined')
    expect(deploy).toContain('config.vectorize === undefined')
    expect(deploy).not.toMatch(/queue\s+(create|delete)/)
    expect(deploy).not.toContain(`'deploy', '--config'`)
  })

  it('keeps the consumer isolated from generic jobs, Vectorize, and provider fallbacks', () => {
    const source = [
      readWorkerFile('src/index.ts'),
      readWorkerFile('src/consumer.ts'),
      readWorkerFile('src/health.ts')
    ].join('\n')
    expect(source).not.toContain('JOBS_QUEUE')
    expect(source).not.toContain('VECTORIZE')
    expect(source).not.toContain('agency-jobs')
    expect(source).not.toMatch(/provider.*fallback/i)
    expect(source).not.toMatch(/console\.(error|warn)\([^)]*(body|error|source)/i)
  })

  it('documents readback retention, rollout order, pause-first rollback, and no task-time deploy', () => {
    const deployment = readWorkerFile('DEPLOYMENT.md')
    expect(deployment).toContain('1,209,600')
    expect(deployment).toContain('agency-crm-search-index')
    expect(deployment).toContain('agency-crm-search-index-dlq')
    expect(deployment).toMatch(/Pages[^\n]*before[^\n]*Worker/i)
    expect(deployment).toMatch(/pause[^\n]*consumer[^\n]*before/i)
    expect(deployment).toContain('pnpm deploy:dry-run')
    expect(deployment).toMatch(/must not create[^\n]*resources/i)
  })
})
