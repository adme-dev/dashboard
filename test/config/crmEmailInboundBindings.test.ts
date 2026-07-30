import { readFileSync } from 'node:fs'
import { parse } from 'smol-toml'
import { describe, expect, it } from 'vitest'

interface PagesConfig {
  vars?: Record<string, string>
  queues?: {
    producers?: Array<{ binding: string, queue: string }>
  }
}

interface WorkerConfig {
  compatibility_flags?: string[]
  vars?: Record<string, string>
  r2_buckets?: Array<{ binding: string, bucket_name: string }>
  queues?: {
    consumers?: Array<{
      queue: string
      dead_letter_queue?: string
      max_retries?: number
    }>
  }
}

describe('CRM inbound email production wiring', () => {
  it('enables the Pages feature gate and dedicated queue producer', () => {
    const config = parse(readFileSync('wrangler.toml', 'utf8')) as PagesConfig

    expect(config.vars?.CRM_EMAIL_CONVERSATIONS_ENABLED).toBe('true')
    expect(config.queues?.producers).toContainEqual({
      binding: 'CRM_EMAIL_INBOUND_QUEUE',
      queue: 'crm-email-inbound-queue'
    })
  })

  it('enables the standalone Worker with private R2 and a dedicated DLQ', () => {
    const config = parse(
      readFileSync('workers/email-worker/wrangler.toml', 'utf8')
    ) as WorkerConfig

    expect(config.vars?.API_URL).toBe('https://app.xeroflow.io')
    expect(config.compatibility_flags).toContain('global_fetch_strictly_public')
    expect(config.vars?.CRM_EMAIL_INBOUND_ENABLED).toBe('true')
    expect(config.vars?.CRM_EMAIL_RETENTION_DAYS).toBe('30')
    expect(config.r2_buckets).toContainEqual({
      binding: 'CRM_EMAIL_BUCKET',
      bucket_name: 'crm-email-inbound'
    })
    expect(config.queues?.consumers).toContainEqual(expect.objectContaining({
      queue: 'crm-email-inbound-queue',
      dead_letter_queue: 'crm-email-inbound-dlq',
      max_retries: 3
    }))
  })

  it('documents required secrets without committing secret values', () => {
    const pages = readFileSync('wrangler.toml', 'utf8')
    const worker = readFileSync('workers/email-worker/wrangler.toml', 'utf8')

    expect(pages).toContain('CRM_EMAIL_WORKER_SECRET')
    expect(pages).toContain('CRM_EMAIL_REPLY_SECRETS')
    expect(worker).toContain('CRM_EMAIL_WORKER_SECRET')
    expect(`${pages}\n${worker}`).not.toMatch(
      /CRM_EMAIL_(?:WORKER_SECRET|REPLY_SECRETS)\s*=\s*["'][^"']+/
    )
  })
})
