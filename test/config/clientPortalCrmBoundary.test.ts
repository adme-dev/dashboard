import { describe, expect, it } from 'vitest'
import { resolveClientCrmAccessLevel } from '~~/server/utils/crm/clientCrmAccess'

describe('client portal CRM search boundary', () => {
  it('classifies only the exact search POST route as a read', () => {
    expect(resolveClientCrmAccessLevel('/api/client-portal/crm/search', 'POST')).toBe('view')

    for (const pathname of [
      '/api/client-portal/crm/search/',
      '/api/client-portal/crm/search/advanced',
      '/api/client-portal/crm/searching'
    ]) {
      expect(resolveClientCrmAccessLevel(pathname, 'POST')).toBe('edit')
    }
  })

  it('does not weaken any ordinary or high-risk portal mutation', () => {
    expect(resolveClientCrmAccessLevel('/api/client-portal/crm/people', 'POST')).toBe('edit')
    expect(resolveClientCrmAccessLevel('/api/client-portal/crm/bulk', 'POST')).toBe('admin')
    expect(resolveClientCrmAccessLevel('/api/client-portal/crm/search', 'DELETE')).toBe('admin')
  })
})
