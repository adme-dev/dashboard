import { describe, it, expect } from 'vitest'
import { buildWhere } from '~~/server/utils/crm/queryScope'

describe('buildWhere', () => {
  it('always scopes by client_id and excludes soft-deleted', () => {
    const { where, params } = buildWhere('c1', [])
    expect(where).toBe('WHERE deleted_at IS NULL AND client_id = $1')
    expect(params).toEqual(['c1'])
  })

  it('appends single-placeholder conditions with correct param indexes', () => {
    const { where, params } = buildWhere('c1', [
      { sql: 'company_id = ?', params: ['co9'] },
      { sql: 'first_name ILIKE ?', params: ['%ann%'] },
    ])
    expect(where).toBe(
      'WHERE deleted_at IS NULL AND client_id = $1 AND company_id = $2 AND first_name ILIKE $3',
    )
    expect(params).toEqual(['c1', 'co9', '%ann%'])
  })

  it('supports multi-placeholder conditions (OR search) with correct numbering', () => {
    const { where, params } = buildWhere('c1', [
      { sql: '(first_name ILIKE ? OR last_name ILIKE ? OR email ILIKE ?)', params: ['%a%', '%a%', '%a%'] },
    ])
    expect(where).toBe(
      'WHERE deleted_at IS NULL AND client_id = $1 AND (first_name ILIKE $2 OR last_name ILIKE $3 OR email ILIKE $4)',
    )
    expect(params).toEqual(['c1', '%a%', '%a%', '%a%'])
  })

  it('throws when placeholder count does not match params length', () => {
    expect(() => buildWhere('c1', [{ sql: '(a = ? OR b = ?)', params: ['x'] }])).toThrow(/mismatch/)
  })
})
