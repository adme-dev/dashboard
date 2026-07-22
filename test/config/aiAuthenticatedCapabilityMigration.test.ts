import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/273_ai_authenticated_capability_ceiling.sql', import.meta.url),
  'utf8'
)

describe('AI authenticated capability ceiling migration 273', () => {
  it('adds the explicit authenticated ceiling without relaxing the permission column', () => {
    expect(migration).toMatch(/ALTER TABLE ai_capability_versions/)
    expect(migration).toMatch(/required_permission_group IN \([\s\S]*'AUTHENTICATED'/)
    expect(migration).not.toMatch(/DROP NOT NULL/)
  })
})
