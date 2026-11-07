import { beforeEach, expect, it, vi } from 'vitest'
import { createError, type H3Event } from 'h3'

const mocks = vi.hoisted(() => ({ finance: vi.fn(), invoice: vi.fn(), auth: vi.fn(), assigned: vi.fn(), one: vi.fn(), rows: vi.fn(), cache: vi.fn() }))
vi.mock('~~/server/utils/financeAccess', () => ({ assertFinancePermission: mocks.finance, assertPermissionGrant: mocks.invoice }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: mocks.auth }))
vi.mock('~~/server/utils/db', () => ({ queryRowsFresh: mocks.assigned, queryOneFresh: vi.fn(), queryOne: mocks.one, queryRows: mocks.rows }))
vi.mock('~~/server/utils/kv', () => ({ kvGet: mocks.cache, kvPut: vi.fn(), kvDelete: vi.fn() }))
const request = {} as H3Event
let clientId = 'client-a'
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('getQuery', () => ({ clientId }))
  vi.stubGlobal('createError', createError)
  clientId = 'client-a'
  mocks.auth.mockResolvedValue({ id: 'staff', role: 'account_manager', permissionGroups: ['FINANCE', 'INVOICE_OWN_CLIENTS'] })
  mocks.finance.mockRejectedValue({ statusCode: 403 })
  mocks.invoice.mockResolvedValue(undefined)
  mocks.assigned.mockResolvedValue([{ client_id: 'client-a' }])
  mocks.cache.mockResolvedValue(['client-a', 'client-b'])
  mocks.one.mockResolvedValue({ id: 'client-a', name: 'Assigned Client', is_active: true })
  mocks.rows.mockResolvedValue([])
})
const handler = async (route: string) => route === 'dashboard'
  ? (await import('~~/server/api/agency/client-portal/dashboard.get')).default
  : (await import('~~/server/api/agency/client-portal/invoices.get')).default
it.each(['dashboard', 'invoices'])('retains assigned-client %s access for a currently granted account manager', async (route) => {
  const read = await handler(route)
  await expect(read(request)).resolves.toBeDefined()
  expect(mocks.invoice).toHaveBeenCalledWith(request, 'staff', 'INVOICE_OWN_CLIENTS')
  expect(mocks.cache).not.toHaveBeenCalled()
  expect(mocks.one.mock.calls.every(([, params]) => params[0] === 'client-a')).toBe(true)
  expect(mocks.rows.mock.calls.every(([, params]) => params[0] === 'client-a')).toBe(true)
})
it.each(['dashboard', 'invoices'])('blocks cross-client %s before billing or insight queries', async (route) => {
  clientId = 'client-b'
  await expect((await handler(route))(request)).rejects.toMatchObject({ statusCode: 403 })
  expect(mocks.one).not.toHaveBeenCalled()
  expect(mocks.rows).not.toHaveBeenCalled()
})
it.each(['dashboard', 'invoices'])('blocks %s immediately after an assignment is revoked', async (route) => {
  const read = await handler(route)
  await read(request)
  mocks.one.mockClear()
  mocks.rows.mockClear()
  mocks.assigned.mockResolvedValueOnce([])
  await expect(read(request)).rejects.toMatchObject({ statusCode: 403 })
  expect(mocks.one).not.toHaveBeenCalled()
  expect(mocks.rows).not.toHaveBeenCalled()
})
it.each(['dashboard', 'invoices'])('blocks %s for ordinary staff without the current invoice grant', async (route) => {
  mocks.invoice.mockRejectedValueOnce({ statusCode: 403 })
  await expect((await handler(route))(request)).rejects.toMatchObject({ statusCode: 403 })
  expect(mocks.assigned).not.toHaveBeenCalled()
  expect(mocks.one).not.toHaveBeenCalled()
  expect(mocks.rows).not.toHaveBeenCalled()
})
it.each(['dashboard', 'invoices'])('retains Finance access to %s beyond assigned clients', async (route) => {
  mocks.finance.mockResolvedValueOnce(undefined)
  clientId = 'client-b'
  await expect((await handler(route))(request)).resolves.toBeDefined()
  expect(mocks.invoice).not.toHaveBeenCalled()
  expect(mocks.assigned).not.toHaveBeenCalled()
})
