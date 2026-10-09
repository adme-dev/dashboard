import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pagesConfig = readFileSync('wrangler.toml', 'utf8')
const workerConfig = readFileSync(
  'workers/transactional-email/wrangler.toml',
  'utf8'
)

describe('Cloudflare Email Service production bindings', () => {
  it('isolates the new XeroFlow auth sender behind private production and staging targets', () => {
    const config = readFileSync('workers/agency-auth-email/wrangler.toml', 'utf8')
    expect(pagesConfig).toContain('binding = "AGENCY_AUTH_EMAIL"')
    expect(pagesConfig).toContain('service = "xeroflow-agency-auth-email"')
    expect(pagesConfig).toContain('service = "xeroflow-agency-auth-email-staging"')
    expect(config.match(/workers_dev = false/g)).toHaveLength(2)
    expect(config.match(/preview_urls = false/g)).toHaveLength(2)
    expect(config.match(/allowed_sender_addresses = \["notification@xeroflow.io"\]/g)).toHaveLength(2)
    expect(config).not.toMatch(/routes|custom_domain|allowed_destination_addresses/)
  })

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
