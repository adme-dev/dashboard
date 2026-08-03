import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL(
  '../../server/database/migrations/336_search_authority_portal_approval_actor.sql',
  import.meta.url
), 'utf8')

describe('Search Authority portal approval attribution migration', () => {
  it('requires exactly one attributable agency or portal actor', () => {
    expect(sql).toMatch(/decided_by_client_user_id UUID REFERENCES client_users\(id\)/i)
    expect(sql).toMatch(/actor_client_user_id UUID REFERENCES client_users\(id\)/i)
    expect(sql).toMatch(/actor_type = 'agency'[\s\S]*actor_type = 'portal'/i)
    expect(sql).toMatch(/decided_by IS NULL AND decided_by_client_user_id IS NOT NULL/i)
  })
})
