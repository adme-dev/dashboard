import { describe, expect, it } from 'vitest'

import { buildSocialInboxAccountsQuery } from '~~/server/utils/socialInbox/syncAccounts'

describe('social inbox account sync ordering', () => {
  it('prioritises never-synced and stalest accounts so request budgets do not starve later accounts', () => {
    const { sql, params } = buildSocialInboxAccountsQuery(null)

    expect(params).toEqual([])
    expect(sql).toMatch(/MIN\(c\.last_synced_at\)/)
    expect(sql).toMatch(/ASC NULLS FIRST/)
    expect(sql).toMatch(/sa\.id ASC/)
  })

  it('preserves client-scoped refreshes while applying the same fair ordering', () => {
    const { sql, params } = buildSocialInboxAccountsQuery('client-1')

    expect(params).toEqual(['client-1'])
    expect(sql).toContain('sa.client_id = $1')
    expect(sql).toMatch(/ASC NULLS FIRST/)
  })
})
