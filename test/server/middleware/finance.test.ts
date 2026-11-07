/* eslint-disable @stylistic/max-statements-per-line */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import middleware from '~~/server/middleware/finance'

const m = vi.hoisted(() => ({ auth: vi.fn(), finance: vi.fn(), machine: vi.fn(), header: vi.fn() }))
vi.mock('h3', async importOriginal => ({ ...(await importOriginal<typeof import('h3')>()), setResponseHeader: m.header }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: m.auth }))
vi.mock('~~/server/utils/financeAccess', () => ({ assertFinancePermission: m.finance }))
vi.mock('~~/server/utils/financeMachineAccess', () => ({ isFinanceReadMachineRequest: m.machine }))
const event = (path = '/api/xero/invoices', method = 'GET') => ({ path, method, node: { req: { url: path, headers: { host: 'localhost' } } }, context: {} }) as never
beforeEach(() => { vi.clearAllMocks(); m.auth.mockResolvedValue({ id: 'actor', role: 'owner' }); m.finance.mockResolvedValue(undefined); m.machine.mockReturnValue(false) })
describe('server accounting boundary', () => {
  it('checks fresh explicit Finance before a protected read even for owner', async () => {
    await middleware(event())
    expect(m.finance).toHaveBeenCalledWith(expect.anything(), 'actor', false)
  })
  it('requests fresh write permission for mutations and connection starts', async () => {
    await middleware(event('/api/cashflow/commitments', 'POST'))
    expect(m.finance).toHaveBeenLastCalledWith(expect.anything(), 'actor', true)
    await middleware(event('/api/xero/login'))
    expect(m.finance).toHaveBeenLastCalledWith(expect.anything(), 'actor', true)
  })
  it('returns permission failures without dispatch or owner fallback', async () => {
    m.finance.mockRejectedValue({ statusCode: 403 })
    await expect(middleware(event())).rejects.toMatchObject({ statusCode: 403 })
    expect(m.header).toHaveBeenCalledWith(expect.anything(), 'Cache-Control', 'private, no-store, max-age=0')
    m.finance.mockRejectedValue({ statusCode: 503 })
    await expect(middleware(event())).rejects.toMatchObject({ statusCode: 503 })
  })
  it('retains unauthenticated denial', async () => {
    m.auth.mockRejectedValue({ statusCode: 401 })
    await expect(middleware(event())).rejects.toMatchObject({ statusCode: 401 })
    expect(m.finance).not.toHaveBeenCalled()
  })
  it('leaves marketing and scoped invoice APIs to their existing boundaries', async () => {
    await middleware(event('/api/agency/social/spend'))
    await middleware(event('/api/agency/invoices/id'))
    expect(m.auth).not.toHaveBeenCalled()
  })
  it('allows only independently verified machine reads', async () => {
    m.machine.mockReturnValue(true)
    await middleware(event())
    expect(m.auth).not.toHaveBeenCalled()
    m.machine.mockReturnValue(false)
    await middleware(event())
    expect(m.finance).toHaveBeenCalled()
  })
  it('defers only the exact GET OAuth callback to its inline grant check', async () => {
    await middleware(event('/api/xero/callback'))
    expect(m.auth).not.toHaveBeenCalled()
    await middleware(event('/api/xero/callback', 'POST'))
    expect(m.finance).toHaveBeenCalled()
  })
})
