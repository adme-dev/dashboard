import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const endpoint = readFileSync(
  new URL('../../server/api/portal/analytics/audiences.get.ts', import.meta.url),
  'utf8'
)
const authorization = readFileSync(
  new URL('../../server/api/portal/analytics/audiences/authorization.put.ts', import.meta.url),
  'utf8'
)

describe('portal audience intelligence contract', () => {
  it('is tenant scoped and returns aggregate accuracy rather than identifiers', () => {
    expect(endpoint).toContain('requireClientAuth(event)')
    expect(endpoint).toContain('client.clientId')
    expect(endpoint).toContain('exportEligible')
    expect(endpoint).not.toContain('identity_hash')
    expect(endpoint).not.toContain('access_token')
  })

  it('requires an authorized client contact and all attestations', () => {
    expect(authorization).toContain('client.isPrimaryContact')
    expect(authorization).toContain('client.permissions.canApproveWork')
    expect(authorization).toContain('All authorization attestations are required')
    expect(authorization).toContain('crm_persona_audience_client_authorization_events')
  })
})
