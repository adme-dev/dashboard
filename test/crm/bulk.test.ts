import { describe, it, expect } from 'vitest'
import { buildBulkOp, BULK_TABLE } from '~~/server/utils/crm/bulk'

describe('buildBulkOp', () => {
  it('assign sets assigned_to (null clears)', () => {
    expect(buildBulkOp('people', 'assign', { user_id: 'u1' })).toEqual({ setSql: 'assigned_to = ?', params: ['u1'] })
    expect(buildBulkOp('people', 'assign', {})).toEqual({ setSql: 'assigned_to = ?', params: [null] })
  })

  it('status maps to lifecycle_stage for contacts and status for opportunities', () => {
    expect(buildBulkOp('people', 'status', { value: 'customer' })!.setSql).toBe('lifecycle_stage = ?')
    expect(buildBulkOp('companies', 'status', { value: 'lead' })!.setSql).toBe('lifecycle_stage = ?')
    expect(buildBulkOp('opportunities', 'status', { value: 'won' })!.setSql).toBe('status = ?')
  })

  it('tag / untag build array set fragments and pass the tag list as a param', () => {
    const add = buildBulkOp('people', 'tag', { tags: ['vip', ' hot '] })!
    expect(add.setSql).toBe('tags = ARRAY(SELECT DISTINCT unnest(tags || ?::text[]))')
    expect(add.params).toEqual([['vip', 'hot']]) // trimmed
    const rem = buildBulkOp('companies', 'untag', { tags: ['old'] })!
    expect(rem.setSql).toContain('EXCEPT SELECT unnest(?::text[])')
  })

  it('tag/untag are rejected for opportunities (no tags column)', () => {
    expect(buildBulkOp('opportunities', 'tag', { tags: ['x'] })).toBeNull()
    expect(buildBulkOp('opportunities', 'untag', { tags: ['x'] })).toBeNull()
  })

  it('tag with no usable tags is a no-op (null)', () => {
    expect(buildBulkOp('people', 'tag', { tags: [] })).toBeNull()
    expect(buildBulkOp('people', 'tag', { tags: [1, 2] })).toBeNull()
  })

  it('delete soft-deletes with no params', () => {
    expect(buildBulkOp('people', 'delete', {})).toEqual({ setSql: 'deleted_at = now()', params: [] })
  })

  it('exposes the table map and never derives a table from input', () => {
    expect(BULK_TABLE.people).toBe('crm_people')
    expect(BULK_TABLE.opportunities).toBe('crm_opportunities')
  })
})
