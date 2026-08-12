import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pagesConfig = readFileSync('wrangler.toml', 'utf8')
const workerConfig = readFileSync(
  'workers/transactional-email/wrangler.toml',
  'utf8'
)

describe('Cloudflare Email Service production bindings', () => {
  it('connects production Pages to the private transactional Worker', () => {
    expect(pagesConfig).toContain('binding = "TRANSACTIONAL_EMAIL"')
    expect(pagesConfig).toContain('service = "xeroflow-transactional-email"')
  })

  it('restricts Email Sending to the approved XeroFlow sender', () => {
    expect(workerConfig).toContain('workers_dev = false')
    expect(workerConfig).toContain('preview_urls = false')
    expect(workerConfig).toContain('name = "EMAIL"')
    expect(workerConfig).toContain(
      'allowed_sender_addresses = ["notification@adme.net.au"]'
    )
  })
})
