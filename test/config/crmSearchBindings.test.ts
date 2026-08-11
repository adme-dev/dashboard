import { readFileSync } from 'node:fs'
import { parse } from 'smol-toml'
import { describe, expect, it } from 'vitest'

interface QueueConfig {
  queues?: {
    producers?: Array<{ binding: string, queue: string }>
    consumers?: Array<{ queue: string }>
  }
  env?: { production?: QueueConfig }
}

describe('CRM search producer and repair wiring', () => {
  it('declares only the dedicated identifier-message producer on Pages', () => {
    const config = parse(readFileSync('wrangler.toml', 'utf8')) as QueueConfig
    const production = config.env?.production
    const crmBinding = production?.queues?.producers?.filter(({ binding, queue }) =>
      binding.includes('CRM_SEARCH') || queue.includes('crm-search')
    )

    expect(crmBinding).toEqual([{
      binding: 'CRM_SEARCH_INDEX_QUEUE',
      queue: 'agency-crm-search-index'
    }])
    expect(production?.queues?.consumers ?? []).not.toContainEqual(expect.objectContaining({
      queue: 'agency-crm-search-index'
    }))
    expect(crmBinding?.[0]?.binding).not.toBe('JOBS_QUEUE')
  })

  it('runs repair every five minutes and documents the binding as non-secret infrastructure', () => {
    const cronWorker = readFileSync('workers/pages-cron/src/index.ts', 'utf8')
    const envExample = readFileSync('.env.example', 'utf8')

    expect(cronWorker).toMatch(
      /'\*\/5 \* \* \* \*':\s*\[[\s\S]*'\/api\/cron\/crm-search-index-repair'/
    )
    expect(envExample).toContain('CRM_SEARCH_INDEX_QUEUE')
    expect(envExample).toContain('agency-crm-search-index')
    expect(envExample).not.toMatch(/^CRM_SEARCH_INDEX_QUEUE=/m)
  })

  it('keeps producer and consumer package/config names pinned to the same dedicated queue', () => {
    const pages = parse(readFileSync('wrangler.toml', 'utf8')) as QueueConfig
    const production = pages.env?.production
    const consumer = parse(
      readFileSync('workers/crm-search-consumer/wrangler.toml', 'utf8')
    ) as { queues?: { consumers?: Array<{ queue: string }> } }
    const rootPackage = JSON.parse(readFileSync('package.json', 'utf8')) as {
      devDependencies?: Record<string, string>
    }
    const workerPackage = JSON.parse(
      readFileSync('workers/crm-search-consumer/package.json', 'utf8')
    ) as {
      name?: string
      scripts?: Record<string, string>
      devDependencies?: Record<string, string>
    }

    const producer = production?.queues?.producers?.find(
      item => item.binding === 'CRM_SEARCH_INDEX_QUEUE'
    )
    expect(producer?.queue).toBe('agency-crm-search-index')
    expect(consumer.queues?.consumers?.[0]?.queue).toBe(producer?.queue)
    expect(workerPackage.name).toBe('@xeroflow/crm-search-consumer')
    expect(workerPackage.scripts?.['deploy:dry-run']).toBe('node scripts/deploy.mjs --dry-run')
    expect(workerPackage.scripts?.deploy).toBeUndefined()
    expect(workerPackage.devDependencies?.wrangler).toBe(rootPackage.devDependencies?.wrangler)
  })

  it('guards the source binding names and excludes generic queue/provider fallbacks', () => {
    const bindings = readFileSync('server/utils/crm/searchIndex/bindings.ts', 'utf8')
    const publisher = readFileSync('server/utils/crm/searchIndex/publisher.ts', 'utf8')
    const envExample = readFileSync('.env.example', 'utf8')

    expect(bindings).toContain('\'CRM_SEARCH_INDEX_QUEUE\' as const')
    expect(bindings).toContain('\'CRM_SEARCH_CONFIRMATION_KEYRING\' as const')
    expect(`${bindings}\n${publisher}`).not.toMatch(/JOBS_QUEUE|agency-jobs|VECTORIZE/)
    expect(`${bindings}\n${publisher}`).not.toMatch(/provider.*fallback/i)
    expect(envExample).toMatch(/^CRM_SEARCH_CONFIRMATION_KEYRING=$/m)
    expect(envExample).toMatch(/never reuse CRON_SECRET or\s*# CRM_SEARCH_SERVICE_KEYRING/)
  })
})
