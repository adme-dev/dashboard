import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/409_measurement_default_on_policy.sql', import.meta.url),
  'utf8'
)

describe('measurement desired-on policy migration', () => {
  it('defaults new profiles on while marking existing profiles for review', () => {
    expect(migration).toMatch(/desired_enabled BOOLEAN/)
    expect(migration).toMatch(/desired_state_source TEXT/)
    expect(migration).toMatch(/SET desired_enabled = TRUE,[\s\S]*desired_state_source = 'existing_review'/)
    expect(migration).toMatch(/ALTER COLUMN desired_enabled SET DEFAULT TRUE/)
    expect(migration).toMatch(/ALTER COLUMN desired_state_source SET DEFAULT 'new_client_default'/)
  })

  it('does not activate runtime delivery for an existing profile', () => {
    expect(migration).not.toMatch(/SET enabled = TRUE/)
    expect(migration).not.toMatch(/SET environment = 'live'/)
  })
})
