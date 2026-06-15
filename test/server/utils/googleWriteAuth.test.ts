import { describe, it, expect, vi } from 'vitest'
import { resolveGoogleWriteAuth } from '~~/server/utils/googleWriteAuth'

const config = {
  googleClientId: 'cid',
  googleClientSecret: 'secret',
  googleDeveloperToken: 'devtok',
  googleAdsLoginCustomerId: '',
}

function baseConn(over: Partial<any> = {}) {
  return {
    id: 'conn-1',
    account_id: '123-456-7890',
    access_token: 'old-token',
    refresh_token: 'refresh-tok',
    token_expires_at: new Date(Date.now() - 60_000).toISOString(), // expired
    ...over,
  }
}

describe('resolveGoogleWriteAuth — token refresh', () => {
  it('refreshes an expired token and persists the new one', async () => {
    const refreshGoogleToken = vi.fn().mockResolvedValue({ access_token: 'new-token', expires_in: 3600 })
    const listAccessibleCustomers = vi.fn().mockResolvedValue(['5250473322', '1234567890'])
    const updateToken = vi.fn().mockResolvedValue(undefined)

    const res = await resolveGoogleWriteAuth(baseConn(), config, { refreshGoogleToken, listAccessibleCustomers, updateToken })

    expect(refreshGoogleToken).toHaveBeenCalledWith('refresh-tok', 'cid', 'secret')
    expect(updateToken).toHaveBeenCalledTimes(1)
    expect(updateToken.mock.calls[0][0]).toBe('conn-1')
    expect(updateToken.mock.calls[0][1]).toBe('new-token')
    expect(res.accessToken).toBe('new-token')
  })

  it('does NOT refresh a token that is still valid', async () => {
    const refreshGoogleToken = vi.fn()
    const listAccessibleCustomers = vi.fn().mockResolvedValue(['5250473322'])
    const updateToken = vi.fn()
    const conn = baseConn({ token_expires_at: new Date(Date.now() + 60 * 60_000).toISOString() })

    const res = await resolveGoogleWriteAuth(conn, config, { refreshGoogleToken, listAccessibleCustomers, updateToken })

    expect(refreshGoogleToken).not.toHaveBeenCalled()
    expect(updateToken).not.toHaveBeenCalled()
    expect(res.accessToken).toBe('old-token')
  })
})

describe('resolveGoogleWriteAuth — MCC resolution', () => {
  it('uses the configured login-customer-id when set (dashes stripped)', async () => {
    const refreshGoogleToken = vi.fn()
    const listAccessibleCustomers = vi.fn()
    const updateToken = vi.fn()
    const conn = baseConn({ token_expires_at: new Date(Date.now() + 60 * 60_000).toISOString() })

    const res = await resolveGoogleWriteAuth(conn, { ...config, googleAdsLoginCustomerId: '525-047-3322' }, {
      refreshGoogleToken, listAccessibleCustomers, updateToken,
    })

    expect(res.loginCustomerId).toBe('5250473322')
    expect(listAccessibleCustomers).not.toHaveBeenCalled()
  })

  it('auto-detects the manager id, excluding the client account itself', async () => {
    const refreshGoogleToken = vi.fn()
    // 1234567890 is the connected client account; 5250473322 is the manager.
    const listAccessibleCustomers = vi.fn().mockResolvedValue(['1234567890', '5250473322'])
    const updateToken = vi.fn()
    const conn = baseConn({ token_expires_at: new Date(Date.now() + 60 * 60_000).toISOString() })

    const res = await resolveGoogleWriteAuth(conn, config, { refreshGoogleToken, listAccessibleCustomers, updateToken })

    expect(res.loginCustomerId).toBe('5250473322')
  })

  it('falls back to no manager id when account discovery fails', async () => {
    const refreshGoogleToken = vi.fn()
    const listAccessibleCustomers = vi.fn().mockRejectedValue(new Error('403'))
    const updateToken = vi.fn()
    const conn = baseConn({ token_expires_at: new Date(Date.now() + 60 * 60_000).toISOString() })

    const res = await resolveGoogleWriteAuth(conn, config, { refreshGoogleToken, listAccessibleCustomers, updateToken })

    expect(res.loginCustomerId).toBeUndefined()
    expect(res.accessToken).toBe('old-token')
  })
})
