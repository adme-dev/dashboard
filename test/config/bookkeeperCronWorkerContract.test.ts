import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const worker = readFileSync(new URL('../../workers/pages-cron/src/index.ts', import.meta.url), 'utf8')
const config = readFileSync(new URL('../../workers/pages-cron/wrangler.toml', import.meta.url), 'utf8')

describe('bookkeeper and Auto Feed cron registrations', () => {
  it('keeps the nightly Xero invoice-line cache refresh registered', () => {
    expect(worker).toContain('\'20 3 * * *\': [\'/api/cron/xero-invoice-lines-sync\']')
    expect(config).toContain('"20 3 * * *"')
  })

  it('refreshes the Xero customer cache hourly at :45', () => {
    expect(worker).toContain('\'45 * * * *\': [\'/api/cron/xero-customer-sync\']')
    expect(config).toContain('"45 * * * *"')
  })

  it('runs the flag-gated Auto Feed rules once daily', () => {
    expect(worker).toContain('\'10 4 * * *\': [\'/api/cron/feed-post-rules\']')
    expect(config).toContain('"10 4 * * *"')
  })
})
