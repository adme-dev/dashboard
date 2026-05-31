import { describe, it, expect } from 'vitest'
import { buildWhere } from '~~/server/utils/crm/queryScope'

describe('buildWhere', () => {
  it('always scopes by client_id and excludes soft-deleted', () => {
    const { where, params } = buildWhere('c1', [])
    expect(where).toBe('WHERE deleted_at IS NULL AND client_id = $1')
    expect(params).toEqual(['c1'])
  })

  it('appends extra conditions with correct param indexes', () => {
    const { where, params } = buildWhere('c1', [
      { sql: 'company_id = ?', value: 'co9' },
      { sql: 'first_name ILIKE ?', value: '%ann%' },
    ])
    expect(where).toBe(
      'WHERE deleted_at IS NULL AND client_id = $1 AND company_id = $2 AND first_name ILIKE $3',
    )
    expect(params).toEqual(['c1', 'co9', '%ann%'])
  })
})
