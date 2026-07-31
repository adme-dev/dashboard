import { beforeEach, describe, expect, it, vi } from 'vitest'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const CONNECTION_ID = '22222222-2222-4222-8222-222222222222'

const mocks = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  body: {} as Record<string, unknown>,
  requireAccess: vi.fn(),
  queryRows: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
  resolveCredential: vi.fn(),
  refreshCredential: vi.fn(),
  listProperties: vi.fn()
}))

vi.mock('h3', () => ({
  getQuery: () => mocks.query
}))
vi.mock('~~/server/utils/searchAuthority/access', () => ({
  requireAgencySearchAuthorityAccess: mocks.requireAccess
}))
vi.mock('~~/server/utils/db', () => ({
  queryRows: mocks.queryRows,
  queryOne: mocks.queryOne,
  execute: mocks.execute,
  transaction: mocks.transaction
}))
vi.mock('~~/server/utils/searchAuthority/credentials', () => ({
  resolveSearchConsoleCredential: mocks.resolveCredential,
  refreshSearchConsoleCredential: mocks.refreshCredential
}))
vi.mock('~~/server/utils/searchAuthority/googleClient', () => ({
  listSearchConsoleProperties: mocks.listProperties
}))

vi.stubGlobal('eventHandler', (handler: unknown) => handler)
vi.stubGlobal('readBody', async () => mocks.body)

describe('Search Authority property discovery and mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.query = { clientId: CLIENT_ID }
    mocks.body = {}
    mocks.requireAccess.mockResolvedValue({ id: 'user-1', role: 'owner' })
    mocks.resolveCredential.mockResolvedValue({
      connectionId: CONNECTION_ID,
      clientId: CLIENT_ID,
      googleSub: 'google-subject',
      email: 'buyer@example.com',
      scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
      accessToken: 'access-secret',
      refreshToken: 'refresh-secret',
      tokenExpiresAt: '2099-01-01T00:00:00.000Z',
      profileId: 'profile-secret'
    })
  })

  it('returns property and connection health without credential material', async () => {
    mocks.queryRows
      .mockResolvedValueOnce([{
        id: CONNECTION_ID,
        google_email: 'buyer@example.com',
        status: 'active',
        last_checked_at: null,
        last_success_at: null,
        last_error_code: null,
        last_error_message: null
      }])
      .mockResolvedValueOnce([{
        id: '33333333-3333-4333-8333-333333333333',
        connection_id: CONNECTION_ID,
        property_uri: 'sc-domain:example.com',
        permission_level: 'siteOwner',
        property_type: 'domain',
        status: 'active'
      }])
    mocks.listProperties.mockResolvedValue([{
      propertyUri: 'sc-domain:example.com',
      propertyType: 'domain',
      permissionLevel: 'siteOwner'
    }])

    const handler = (await import(
      '~~/server/api/agency/search-authority/google/properties.get'
    )).default
    const result = await handler({} as never)

    expect(result.connections[0]).toMatchObject({
      connectionId: CONNECTION_ID,
      email: 'buyer@example.com',
      properties: [{
        propertyUri: 'sc-domain:example.com',
        propertyType: 'domain',
        permissionLevel: 'siteOwner'
      }]
    })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('access-secret')
    expect(serialized).not.toContain('refresh-secret')
    expect(serialized).not.toContain('profile-secret')
    expect(serialized).not.toContain('google-subject')
  })

  it('rejects an unverified provider property before writing a map', async () => {
    mocks.body = {
      clientId: CLIENT_ID,
      connectionId: CONNECTION_ID,
      propertyUri: 'sc-domain:example.com',
      permissionLevel: 'siteUnverifiedUser'
    }
    mocks.queryOne.mockResolvedValue({
      connection_id: CONNECTION_ID,
      site_id: '33333333-3333-4333-8333-333333333333'
    })
    mocks.listProperties.mockResolvedValue([{
      propertyUri: 'sc-domain:example.com',
      propertyType: 'domain',
      permissionLevel: 'siteUnverifiedUser'
    }])

    const handler = (await import(
      '~~/server/api/agency/search-authority/google/map.post'
    )).default

    await expect(handler({} as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('rejects a connection owned by another client', async () => {
    mocks.body = {
      clientId: CLIENT_ID,
      connectionId: CONNECTION_ID,
      propertyUri: 'sc-domain:example.com',
      permissionLevel: 'siteOwner'
    }
    mocks.queryOne.mockResolvedValue(null)

    const handler = (await import(
      '~~/server/api/agency/search-authority/google/map.post'
    )).default

    await expect(handler({} as never)).rejects.toMatchObject({ statusCode: 404 })
    expect(mocks.resolveCredential).not.toHaveBeenCalled()
  })

  it('maps the provider-verified property with a derived property type', async () => {
    mocks.body = {
      clientId: CLIENT_ID,
      connectionId: CONNECTION_ID,
      propertyUri: 'https://www.example.com/',
      permissionLevel: 'siteFullUser'
    }
    mocks.queryOne.mockResolvedValue({
      connection_id: CONNECTION_ID,
      site_id: '33333333-3333-4333-8333-333333333333'
    })
    mocks.listProperties.mockResolvedValue([{
      propertyUri: 'https://www.example.com/',
      propertyType: 'url_prefix',
      permissionLevel: 'siteFullUser'
    }])
    mocks.execute.mockResolvedValue(1)

    const handler = (await import(
      '~~/server/api/agency/search-authority/google/map.post'
    )).default
    const result = await handler({} as never)

    expect(result).toEqual({ ok: true })
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO search_console_property_maps'),
      [
        CLIENT_ID,
        '33333333-3333-4333-8333-333333333333',
        CONNECTION_ID,
        'https://www.example.com/',
        'siteFullUser',
        'url_prefix',
        'active'
      ]
    )
  })

  it('disconnects only the client-owned connection and its encrypted profile', async () => {
    mocks.query = { clientId: CLIENT_ID, connectionId: CONNECTION_ID }
    const queries: Array<{ sql: string, params: unknown[] }> = []
    mocks.transaction.mockImplementation(async callback => callback({
      query: async (sql: string, params: unknown[]) => {
        queries.push({ sql, params })
        return sql.includes('RETURNING google_credential_profile_id')
          ? { rows: [{ google_credential_profile_id: 'profile-1' }] }
          : { rows: [] }
      }
    }))

    const handler = (await import(
      '~~/server/api/agency/search-authority/google/disconnect.delete'
    )).default
    await expect(handler({} as never)).resolves.toEqual({ ok: true })

    expect(queries).toHaveLength(3)
    expect(queries[0]?.params).toEqual([CONNECTION_ID, CLIENT_ID])
    expect(queries[1]?.sql).toContain('search_console_property_maps')
    expect(queries[2]?.params).toEqual(['profile-1'])
  })
})
