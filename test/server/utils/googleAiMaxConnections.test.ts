import { describe, expect, it, vi } from 'vitest'
import {
  listGoogleAiMaxConnectionRows,
  loadGoogleAiMaxScanContext,
} from '~~/server/utils/googleAiMaxConnections'

describe('Google AI Max connection loading', () => {
  it('requires selected-tenant existence and scopes an optional connection id', async () => {
    const query = vi.fn(async () => [{
      id: 'connection-a',
      account_id: '123',
      account_name: 'Account A',
      access_token: 'legacy-token',
      refresh_token: null,
      token_expires_at: null,
      metadata: {},
    }])

    const rows = await listGoogleAiMaxConnectionRows(
      { tenantId: 'tenant-a', connectionId: 'connection-a' },
      query,
    )

    expect(rows).toHaveLength(1)
    expect(String(query.mock.calls[0]?.[0])).toContain('xo.tenant_id = $1')
    expect(String(query.mock.calls[0]?.[0])).toContain('sc.id = $2')
    expect(query.mock.calls[0]?.[1]).toEqual(['tenant-a', 'connection-a'])
  })

  it('defers credential resolution so one bad account can fail independently', async () => {
    const resolveAccountAuth = vi.fn(async (row: { id: string }) => {
      if (row.id === 'connection-b') throw new Error('credential incomplete')
      return { accessToken: 'token-a', loginCustomerId: '999' }
    })

    const context = await loadGoogleAiMaxScanContext({ tenantId: 'tenant-a' }, {
      listRows: async () => [
        {
          id: 'connection-a',
          account_id: '123',
          account_name: 'Account A',
          access_token: null,
          refresh_token: null,
          token_expires_at: null,
          metadata: {},
        },
        {
          id: 'connection-b',
          account_id: '789',
          account_name: 'Account B',
          access_token: null,
          refresh_token: null,
          token_expires_at: null,
          metadata: {},
        },
      ],
      getConfig: () => ({
        googleClientId: 'client-id',
        googleClientSecret: 'client-secret',
        googleDeveloperToken: 'developer-token',
        googleAdsLoginCustomerId: '',
      }),
      resolveAccountAuth,
    })

    expect(context.developerToken).toBe('developer-token')
    expect(context.accounts.map(account => ({
      connectionId: account.connectionId,
      customerId: account.customerId,
    }))).toEqual([
      { connectionId: 'connection-a', customerId: '123' },
      { connectionId: 'connection-b', customerId: '789' },
    ])
    await expect(context.accounts[0]?.resolveAuth?.()).resolves.toEqual({
      accessToken: 'token-a',
      loginCustomerId: '999',
    })
    await expect(context.accounts[1]?.resolveAuth?.()).rejects.toThrow('credential incomplete')
  })
})
