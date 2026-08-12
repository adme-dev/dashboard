import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/367_google_pmax_new_account_bootstrap.sql', import.meta.url),
  'utf8'
)

describe('Google PMax new-account bootstrap migration 367', () => {
  it('adds API control-plane and shop-identity work without replacing the launch template', () => {
    expect(migration).toContain('Validate the Google API control plane')
    expect(migration).toContain('Discover and bind the dealership shop identity')
    expect(migration).toContain('locations/{locationId}')
    expect(migration).toContain('Search before creating')
    expect(migration).not.toContain('DELETE FROM template_tasks')
  })

  it('tracks immutable Ads settings, billing, legal acceptance, client ownership, and one-state policy', () => {
    for (const requirement of [
      'Currency and time zone approved before creation',
      'Billing active',
      'Merchant terms accepted by the business',
      'Homepage verified and claimed',
      'One-state account scope confirmed'
    ]) {
      expect(migration).toContain(requirement)
    }
  })

  it('keeps credentials out of operational tasks and remains transactional and idempotent', () => {
    expect(migration).toContain('No credentials stored in tasks or evidence')
    expect(migration).toContain('IF NOT EXISTS')
    expect(migration).toContain('BEGIN;')
    expect(migration).toContain('COMMIT;')
  })
})
