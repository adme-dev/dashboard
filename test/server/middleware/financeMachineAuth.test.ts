/* eslint-disable @stylistic/max-statements-per-line */
import { createEvent, getCookie, getHeader, getRequestURL } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ session: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ validateSession: m.session, acceptGodModeInternalExecution: async () => null, TransientAuthError: class extends Error {} }))
vi.mock('~~/server/utils/roleResolver', () => ({ resolveUserPermissions: vi.fn() }))
vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('getHeader', getHeader)
vi.stubGlobal('getCookie', getCookie)
vi.stubGlobal('getRequestURL', getRequestURL)
const handler = (await import('~~/server/middleware/auth')).default
function event(path = '/api/xero/reports/pnl', method = 'GET', secret = 'internal') {
  const e = createEvent({ method, url: path, headers: { 'host': 'localhost', 'x-internal-cron-secret': secret } } as never, {} as never)
  e.context.cloudflare = { env: { CRON_INTERNAL_SECRET: 'internal' } } as never
  return e
}
beforeEach(() => { vi.clearAllMocks() })
afterEach(() => { vi.unstubAllEnvs() })
describe('auth middleware finance machine boundary', () => {
  it('grants only a synthetic member to an exact authenticated read', async () => {
    const e = event()
    await handler(e)
    expect(e.context.user).toMatchObject({ id: 'cron', role: 'member' })
    expect(e.context.auth).toEqual({ userId: 'cron', role: 'member' })
    expect(m.session).not.toHaveBeenCalled()
  })
  it.each([
    ['/api/xero/reports/pnl', 'POST'], ['/api/xero/disconnect', 'GET'], ['/api/advisor/recommendations', 'GET'], ['/api/ai/financial-advisor', 'POST']
  ])('does not bypass staff authentication for %s %s', async (path, method) => {
    await expect(handler(event(path, method))).rejects.toMatchObject({ statusCode: 401 })
  })
  it('rejects a forged owner context without valid machine authentication', async () => {
    const e = event(undefined, 'GET', 'wrong')
    e.context.user = { id: 'cron', role: 'owner' }
    await expect(handler(e)).rejects.toMatchObject({ statusCode: 401 })
  })
})
