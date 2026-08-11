import { describe, expect, it, vi } from 'vitest'
import type { CrmSearchContext } from '~~/server/utils/crm/searchContext'
import { getLeaderboard } from '~~/server/utils/crm/targetsDb'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '22222222-2222-4222-8222-222222222222'
const HIDDEN_OWNER_ID = '33333333-3333-4333-8333-333333333333'

const ownerContext: CrmSearchContext = {
  organisationScopeId: '44444444-4444-4444-8444-444444444444',
  clientId: CLIENT_ID,
  correlationId: '55555555-5555-4555-8555-555555555555',
  actorType: 'staff',
  actorId: ACTOR_ID,
  surface: 'agency_global',
  permissionSet: ['CLIENTS'],
  visibility: { ownerScoped: true }
}

describe('owner-scoped CRM targets', () => {
  it('filters target rows and won amounts before leaderboard attainment is aggregated', async () => {
    const queryRows = vi.fn(async (sql: string) => {
      if (/FROM crm_sales_targets/.test(sql)) {
        const rows = [
          { id: 't1', user_id: ACTOR_ID, user_name: 'Visible', target_type: 'revenue', target_value: 100, period_start: '2026-08-01', period_end: '2026-08-31' },
          { id: 't2', user_id: HIDDEN_OWNER_ID, user_name: 'Hidden', target_type: 'revenue', target_value: 1, period_start: '2026-08-01', period_end: '2026-08-31' }
        ]
        return /t\.user_id\s*=/.test(sql) ? rows.slice(0, 1) : rows
      }
      if (/FROM crm_opportunities/.test(sql)) {
        const rows = [
          { owner_id: ACTOR_ID, amount: 50 },
          { owner_id: HIDDEN_OWNER_ID, amount: 9999 }
        ]
        return /crm_opportunities\.owner_id\s*=/.test(sql) ? rows.slice(0, 1) : rows
      }
      return []
    })

    const rows = await getLeaderboard(ownerContext, '2026-08-01', '2026-08-31', { queryRows })

    expect(rows).toEqual([expect.objectContaining({ user_id: ACTOR_ID, actual: 50, attainment_pct: 50 })])
    expect(rows.some(row => row.user_id === HIDDEN_OWNER_ID)).toBe(false)
  })
})
