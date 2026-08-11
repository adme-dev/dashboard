import { describe, it, expect } from 'vitest'
import { buildWhere, visibilityCondsForContext } from '~~/server/utils/crm/queryScope'
import type { CrmSearchContext } from '~~/server/utils/crm/searchContext'

const ownerContext: CrmSearchContext = {
  organisationScopeId: '11111111-1111-4111-8111-111111111111',
  clientId: '22222222-2222-4222-8222-222222222222',
  correlationId: '33333333-3333-4333-8333-333333333333',
  actorType: 'staff',
  actorId: '44444444-4444-4444-8444-444444444444',
  surface: 'agency_global',
  permissionSet: ['CLIENTS'],
  visibility: { ownerScoped: true },
}

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

describe('visibilityCondsForContext', () => {
  it('uses the authoritative context actor for an aliased owner-scoped entity', () => {
    expect(visibilityCondsForContext(ownerContext, 'opportunity', 'o')).toEqual([{
      sql: '(o.owner_id = ? OR o.assigned_to = ?)',
      params: [ownerContext.actorId, ownerContext.actorId],
    }])
  })

  it('returns no owner condition for portal or team-visible contexts', () => {
    expect(visibilityCondsForContext({ ...ownerContext, actorType: 'portal' }, 'person', 'p')).toEqual([])
    expect(visibilityCondsForContext({ ...ownerContext, visibility: { ownerScoped: false } }, 'person', 'p')).toEqual([])
  })
})
