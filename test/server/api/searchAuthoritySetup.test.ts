import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  body: {} as Record<string, unknown>,
  requireAccess: vi.fn(),
  transaction: vi.fn()
}))

vi.mock('~~/server/utils/searchAuthority/access', () => ({
  requireAgencySearchAuthorityAccess: mocks.requireAccess
}))
vi.mock('~~/server/utils/db', () => ({
  transaction: mocks.transaction
}))

vi.stubGlobal('eventHandler', (handler: unknown) => handler)
vi.stubGlobal('readBody', async () => mocks.body)

describe('Search Authority site readiness API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAccess.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      role: 'owner'
    })
  })

  it('normalizes root URLs and activates the client pilot atomically', async () => {
    mocks.body = {
      clientId: '11111111-1111-4111-8111-111111111111',
      canonicalHostname: ' HTTPS://WWW.KnoxGWMHaval.com.au/ ',
      contentHostname: 'knox-content.xeroflow.app'
    }
    const calls: Array<{ sql: string, params: unknown[] }> = []
    mocks.transaction.mockImplementation(async callback => callback({
      query: async (sql: string, params: unknown[]) => {
        calls.push({ sql, params })
        return sql.includes('INSERT INTO search_authority_sites')
          ? {
              rows: [{
                id: '33333333-3333-4333-8333-333333333333',
                client_id: mocks.body.clientId,
                canonical_hostname: 'www.knoxgwmhaval.com.au',
                content_hostname: 'knox-content.xeroflow.app',
                status: 'active'
              }]
            }
          : { rows: [] }
      }
    }))

    const handler = (await import(
      '~~/server/api/agency/search-authority/sites/index.post'
    )).default
    const result = await handler({} as never)

    expect(result).toEqual({
      site: {
        id: '33333333-3333-4333-8333-333333333333',
        clientId: '11111111-1111-4111-8111-111111111111',
        canonicalHostname: 'www.knoxgwmhaval.com.au',
        contentHostname: 'knox-content.xeroflow.app',
        status: 'active'
      }
    })
    expect(mocks.requireAccess).toHaveBeenCalledWith(
      expect.anything(),
      '11111111-1111-4111-8111-111111111111',
      { requireEntitlement: false }
    )
    expect(calls[0]?.params).toEqual([
      '11111111-1111-4111-8111-111111111111',
      'www.knoxgwmhaval.com.au',
      'knox-content.xeroflow.app',
      '22222222-2222-4222-8222-222222222222'
    ])
    expect(calls[1]?.sql).toContain('client_feature_entitlements')
    expect(calls[1]?.params).toEqual([
      '11111111-1111-4111-8111-111111111111',
      'search_authority.core'
    ])
  })

  it.each([
    'http://localhost/',
    'https://127.0.0.1/',
    'https://example.com/path',
    'https://user:secret@example.com/'
  ])('rejects a non-public root hostname: %s', async (canonicalHostname) => {
    mocks.body = {
      clientId: '11111111-1111-4111-8111-111111111111',
      canonicalHostname
    }

    const handler = (await import(
      '~~/server/api/agency/search-authority/sites/index.post'
    )).default

    await expect(handler({} as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
})
