// test/crm/engine/recordFilter.test.ts
import { describe, it, expect } from 'vitest'
import { buildRecordFilter } from '~~/server/utils/crm/engine/recordFilter'

describe('buildRecordFilter', () => {
  it('always scopes by client_id + object_def_id and excludes soft-deleted', () => {
    const { where, params } = buildRecordFilter('c1', 'o1', {})
    expect(where).toBe('WHERE deleted_at IS NULL AND client_id = $1 AND object_def_id = $2')
    expect(params).toEqual(['c1', 'o1'])
  })

  it('adds a title search across the given title keys with escaped wildcards', () => {
    const { where, params } = buildRecordFilter('c1', 'o1', { q: 'wid_get', titleKeys: ['name', 'reference'] })
    expect(where).toBe(
      "WHERE deleted_at IS NULL AND client_id = $1 AND object_def_id = $2 AND (data->>'name' ILIKE $3 OR data->>'reference' ILIKE $4)",
    )
    expect(params).toEqual(['c1', 'o1', '%wid\\_get%', '%wid\\_get%'])
  })

  it('ignores an empty query and empty titleKeys', () => {
    const { where, params } = buildRecordFilter('c1', 'o1', { q: '   ', titleKeys: [] })
    expect(where).toBe('WHERE deleted_at IS NULL AND client_id = $1 AND object_def_id = $2')
    expect(params).toEqual(['c1', 'o1'])
  })
})
