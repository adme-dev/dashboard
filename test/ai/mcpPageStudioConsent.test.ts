import { beforeEach, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { captureMcpPageStudioLogin } from '~~/server/utils/ai/mcp/pageStudioLogin'

const m = vi.hoisted(() => ({ resolve: vi.fn(), bind: vi.fn(), transaction: vi.fn(), db: {} }))
vi.mock('~~/server/utils/db', () => ({ transaction: m.transaction }))
vi.mock('~~/server/utils/pageStudio/loginSessions', () => ({ resolvePageStudioLoginSession: m.resolve, bindPageStudioLoginSession: m.bind }))
const uid = '11111111-1111-4111-8111-111111111111'
const event = { context: {} } as H3Event
const login = { role: 'agency', userId: uid, tokenHash: 'c'.repeat(64), issuedAt: new Date(Date.now() - 60_000), expiresAt: new Date(Date.now() + 600_000) }
beforeEach(() => {
  vi.resetAllMocks()
  m.transaction.mockImplementation(fn => fn(m.db))
  m.resolve.mockResolvedValue(login)
  m.bind.mockResolvedValue(undefined)
})
it('captures and binds only the genuine original agency session with its original timestamps', async () => {
  expect(await captureMcpPageStudioLogin(event, uid)).toEqual({ ...login, issuedAt: login.issuedAt.getTime(), expiresAt: login.expiresAt.getTime() })
  expect(m.resolve).toHaveBeenCalledWith(m.db, event, 'agency', uid)
  expect(m.bind).toHaveBeenCalledWith(m.db, login)
})
it('provides no Studio proof if login is missing, invalid, revoked or storage fails', async () => {
  m.resolve.mockRejectedValueOnce(new Error('no JWT'))
  expect(await captureMcpPageStudioLogin(event, uid)).toBeUndefined()
  m.bind.mockRejectedValueOnce(new Error('revoked'))
  expect(await captureMcpPageStudioLogin(event, uid)).toBeUndefined()
  m.transaction.mockRejectedValueOnce(new Error('storage unavailable'))
  expect(await captureMcpPageStudioLogin(event, uid)).toBeUndefined()
})
it('never serializes a different user, client role or extra credential field', async () => {
  for (const invalid of [{ ...login, userId: '22222222-2222-4222-8222-222222222222' }, { ...login, role: 'client' }, { ...login, tokenHash: 'JWT' }]) {
    m.resolve.mockResolvedValueOnce(invalid)
    expect(await captureMcpPageStudioLogin(event, uid)).toBeUndefined()
  }
})
