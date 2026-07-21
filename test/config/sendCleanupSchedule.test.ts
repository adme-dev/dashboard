import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('Send cleanup schedule', () => {
  it('dispatches the protected cleanup endpoint every day', () => {
    const worker = readFileSync('workers/pages-cron/src/index.ts', 'utf8')

    expect(worker).toContain(`'35 3 * * *'`)
    expect(worker).toContain(`'/api/cron/send-cleanup'`)
  })
})
