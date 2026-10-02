import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ role: vi.fn(), access: vi.fn(), query: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireRole: mocks.role }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ requireSocialClientAccess: mocks.access }))
vi.mock('~~/server/utils/social/publishingAccountGodMode', () => ({ executeGodModeSocialPublishingAccountDisconnect: (_event: unknown, fn: (db: { query: typeof mocks.query }) => unknown) => fn({ query: mocks.query }) }))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('getRouterParam', () => 'account')
vi.stubGlobal('createError', (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input))
const { default: handler } = await import('../../../server/api/agency/social/publishing/accounts/[id].delete')
const disconnect = handler as unknown as (event: unknown) => Promise<unknown>
beforeEach(() => {
  vi.clearAllMocks()
  mocks.role.mockResolvedValue({ id: 'user' })
  mocks.access.mockResolvedValue({ id: 'user' })
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql === 'SELECT client_id FROM social_accounts WHERE id=$1') return { rows: [{ client_id: 'client' }] }
    if (sql.includes('FOR UPDATE')) return { rows: [{ client_id: 'client', platform: 'facebook', platform_account_id: 'page', metadata: {} }] }
    return { rows: [] }
  })
})
describe('Facebook disconnect with news automation', () => {
  it('locks the client before the account so FK cancellation cannot deadlock replenishment', async () => {
    await disconnect({})
    const calls = mocks.query.mock.calls.map(call => String(call[0]))
    expect(calls[0]).toBe('SELECT client_id FROM social_accounts WHERE id=$1')
    expect(calls[1]).toContain('pg_advisory_xact_lock')
    expect(calls[2]).toContain('FOR UPDATE')
    expect(calls.at(-1)).toContain('DELETE FROM social_accounts')
  })
  it('does not lock or disconnect a client the user cannot access', async () => {
    mocks.access.mockRejectedValue(new Error('Forbidden'))
    await expect(disconnect({})).rejects.toThrow('Forbidden')
    expect(mocks.query).toHaveBeenCalledTimes(1)
  })
  it('aborts if the account moves to a different client before locking', async () => {
    const original = mocks.query.getMockImplementation()!
    mocks.query.mockImplementation((sql: string, params: unknown[]) => sql.includes('FOR UPDATE') ? Promise.resolve({ rows: [{ client_id: 'other' }] }) : original(sql, params))
    await expect(disconnect({})).rejects.toThrow('Account client changed')
    expect(mocks.query.mock.calls.some(call => String(call[0]).includes('DELETE FROM social_accounts'))).toBe(false)
  })
})
