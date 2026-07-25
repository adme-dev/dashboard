import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/297_persona_audience_client_authorization.sql', import.meta.url),
  'utf8'
)

describe('persona audience client authorization migration', () => {
  it('keeps client authorization separate and auditable', () => {
    expect(migration).toContain('crm_persona_audience_client_authorizations')
    expect(migration).toContain('crm_persona_audience_client_authorization_events')
    expect(migration).toContain('prevent_measurement_append_only_mutation')
    expect(migration).toContain("status IN ('accepted', 'withdrawn')")
  })

  it('blocks additions without blocking removal propagation', () => {
    expect(migration).toContain("IF NEW.operation = 'sync'")
    expect(migration).toContain("authorization.status = 'accepted'")
    expect(migration).not.toContain("IF NEW.operation = 'remove'")
  })
})
