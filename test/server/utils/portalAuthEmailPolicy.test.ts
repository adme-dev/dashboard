import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { PORTAL_AUTH_SENDER_ADDRESS } from '../../../server/utils/portalAuthEmailPolicy'

describe('portal authentication sender policy', () => {
  it('uses the Email Service-approved sender independently of Resend configuration', () => {
    const emailSource = readFileSync('server/utils/email.ts', 'utf8')
    const workerSource = readFileSync('workers/transactional-email/src/index.ts', 'utf8')
    const workerConfig = readFileSync('workers/transactional-email/wrangler.toml', 'utf8')

    expect(PORTAL_AUTH_SENDER_ADDRESS).toBe('notification@adme.net.au')
    expect(emailSource).toContain('address: PORTAL_AUTH_SENDER_ADDRESS')
    expect(workerSource).toContain('from.address !== PORTAL_AUTH_SENDER_ADDRESS')
    expect(workerConfig).toContain(
      `allowed_sender_addresses = ["${PORTAL_AUTH_SENDER_ADDRESS}"]`
    )
  })
})
