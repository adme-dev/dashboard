import { readFileSync } from 'node:fs'
import { parse } from 'smol-toml'
import { describe, expect, it } from 'vitest'

interface QueueConfig {
  queues?: {
    producers?: Array<{ binding: string, queue: string }>
  }
}

describe('measurement delivery queue production wiring', () => {
  it('declares the dedicated Pages producer binding', () => {
    const config = parse(readFileSync('wrangler.toml', 'utf8')) as QueueConfig

    expect(config.queues?.producers).toContainEqual({
      binding: 'MEASUREMENT_DELIVERY_QUEUE',
      queue: 'measurement-delivery'
    })
  })

  it('runs the stranded-outbox repair endpoint every five minutes', () => {
    const cronWorker = readFileSync('workers/pages-cron/src/index.ts', 'utf8')
    const repairRoute = readFileSync('server/api/cron/measurement-outbox-repair.post.ts', 'utf8')

    expect(cronWorker).toMatch(/'\*\/5 \* \* \* \*':[\s\S]*measurement-outbox-repair/)
    expect(repairRoute).toContain('getHeader(event, \'x-cron-secret\')')
    expect(repairRoute).toContain('conversionOutboxPublisher.repairPending(event')
  })
})
