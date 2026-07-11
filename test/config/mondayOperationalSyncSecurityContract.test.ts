import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync('server/api/agency/monday/sync/index.post.ts', 'utf8')

describe('Monday operational sync security contract', () => {
  it('limits sync execution to owners and administrators', () => {
    expect(source).toContain("requireRole(event, ['admin', 'owner'])")
    expect(source).not.toContain('requireAuth(event)')
  })

  it('validates board IDs, mappings, batch size, and target departments', () => {
    expect(source).toContain('OperationalSyncSchema.safeParse')
    expect(source).toContain(".regex(/^\\d+$/")
    expect(source).toContain('.max(25)')
    expect(source).toContain('SELECT id FROM departments WHERE id = ANY')
  })

  it('does not expose third-party or database error detail to callers', () => {
    expect(source).not.toContain('statusMessage: `Sync failed: ${error.message}`')
  })
})
