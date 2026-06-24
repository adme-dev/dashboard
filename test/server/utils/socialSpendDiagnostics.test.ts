import { describe, expect, it } from 'vitest'
import { buildSpendControlDiagnostics } from '~~/server/utils/socialSpendDiagnostics'

describe('buildSpendControlDiagnostics', () => {
  it('flags duplicate accounts, unmapped spend, and stale connections', () => {
    const result = buildSpendControlDiagnostics({
      connections: [
        {
          id: 'conn-1',
          platform: 'meta',
          accountId: 'act_123',
          accountName: 'ADME Meta',
          status: 'active',
          tokenExpiresAt: null,
          refreshToken: null,
          lastSyncedAt: '2026-06-24T00:00:00.000Z',
          clientId: 'client-1',
          spend: 100,
          budget: 200,
          campaignCount: 2
        },
        {
          id: 'conn-2',
          platform: 'meta',
          accountId: 'act_123',
          accountName: 'ADME Meta duplicate',
          status: 'active',
          tokenExpiresAt: null,
          refreshToken: null,
          lastSyncedAt: '2026-06-24T00:00:00.000Z',
          clientId: 'client-1',
          spend: 50,
          budget: 100,
          campaignCount: 1
        },
        {
          id: 'conn-3',
          platform: 'google',
          accountId: '999-111',
          accountName: 'Google Ads',
          status: 'active',
          tokenExpiresAt: null,
          refreshToken: 'refresh-token',
          lastSyncedAt: '2026-06-20T00:00:00.000Z',
          clientId: null,
          spend: 0,
          budget: 0,
          campaignCount: 0
        }
      ],
      unmappedSpend: [
        {
          platform: 'google_ads',
          accountId: '999-111',
          accountName: 'Google Ads',
          spend: 300,
          budget: 400,
          campaignCount: 3
        }
      ],
      now: new Date('2026-06-25T00:00:00.000Z')
    })

    expect(result.summary.duplicateConnectionGroups).toBe(1)
    expect(result.summary.unmappedSpendGroups).toBe(1)
    expect(result.summary.staleConnections).toBe(1)
    expect(result.summary.issueCount).toBe(3)
    expect(result.overallStatus).toBe('critical')
    expect(result.issues.map(issue => issue.type)).toEqual([
      'duplicate_connection',
      'unmapped_spend',
      'stale_connection'
    ])
  })

  it('returns a healthy status when there are no account control issues', () => {
    const result = buildSpendControlDiagnostics({
      connections: [
        {
          id: 'conn-1',
          platform: 'meta',
          accountId: 'act_123',
          accountName: 'ADME Meta',
          status: 'active',
          tokenExpiresAt: null,
          refreshToken: null,
          lastSyncedAt: '2026-06-25T00:00:00.000Z',
          clientId: 'client-1',
          spend: 100,
          budget: 200,
          campaignCount: 2
        }
      ],
      unmappedSpend: [],
      now: new Date('2026-06-25T01:00:00.000Z')
    })

    expect(result.overallStatus).toBe('healthy')
    expect(result.summary.issueCount).toBe(0)
    expect(result.issues).toEqual([])
  })
})
