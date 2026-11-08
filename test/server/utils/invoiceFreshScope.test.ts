import { beforeEach, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import type { User } from '~~/server/utils/auth'
import { resolveInvoiceAccess } from '~~/server/utils/clientScoping'

const mocks = vi.hoisted(() => ({ finance: vi.fn(), invoice: vi.fn(), fresh: vi.fn(), legacy: vi.fn(), cache: vi.fn() }))
vi.mock('~~/server/utils/financeAccess', () => ({ assertFinancePermission: mocks.finance, assertPermissionGrant: mocks.invoice }))
vi.mock('~~/server/utils/db', () => ({ queryRowsFresh: mocks.fresh, queryRows: mocks.legacy, queryOneFresh: vi.fn() }))
vi.mock('~~/server/utils/kv', () => ({ kvGet: mocks.cache, kvPut: vi.fn(), kvDelete: vi.fn() }))
const event = {} as H3Event
const user = { id: 'staff', role: 'owner', permissionGroups: ['FINANCE', 'INVOICE_OWN_CLIENTS'] } as User
beforeEach(() => {
  vi.clearAllMocks()
  mocks.finance.mockRejectedValue({ statusCode: 403 })
  mocks.invoice.mockResolvedValue(undefined)
  mocks.fresh.mockResolvedValue([{ client_id: 'assigned' }])
  mocks.cache.mockResolvedValue(['revoked'])
})
it('ignores stale owner/Finance context and reads assigned active clients freshly', async () => {
  expect(await resolveInvoiceAccess(event, user)).toEqual(['assigned'])
  expect(mocks.invoice).toHaveBeenCalledWith(event, 'staff', 'INVOICE_OWN_CLIENTS')
  expect(mocks.fresh).toHaveBeenCalledWith(expect.stringContaining('JOIN agency_clients'), ['staff'])
  expect(mocks.fresh.mock.calls[0][0]).toContain('is_active = TRUE')
  expect(mocks.cache).not.toHaveBeenCalled()
  expect(mocks.legacy).not.toHaveBeenCalled()
})
it('observes assignment removal immediately despite stale KV and caller grants', async () => {
  expect(await resolveInvoiceAccess(event, user)).toEqual(['assigned'])
  mocks.fresh.mockResolvedValueOnce([])
  expect(await resolveInvoiceAccess(event, user)).toEqual([])
})
it('denies an invoice grant revoked in the database', async () => {
  mocks.invoice.mockRejectedValueOnce({ statusCode: 403 })
  await expect(resolveInvoiceAccess(event, user)).rejects.toMatchObject({ statusCode: 403 })
  expect(mocks.fresh).not.toHaveBeenCalled()
})
it('retains all-client access only for a current Finance grant', async () => {
  mocks.finance.mockResolvedValueOnce(undefined)
  expect(await resolveInvoiceAccess(event, user)).toBe('all')
  expect(mocks.invoice).not.toHaveBeenCalled()
  expect(mocks.fresh).not.toHaveBeenCalled()
})
it('propagates unavailable Finance authority rather than widening or downgrading', async () => {
  mocks.finance.mockRejectedValueOnce({ statusCode: 503 })
  await expect(resolveInvoiceAccess(event, user)).rejects.toMatchObject({ statusCode: 503 })
  expect(mocks.invoice).not.toHaveBeenCalled()
})
it('retains read-only Finance reads but denies invoice mutation authority', async () => {
  mocks.finance.mockImplementation(async (_event, _id, write = false) => {
    if (write) throw { statusCode: 403 }
  })
  mocks.invoice.mockRejectedValue({ statusCode: 403 })
  expect(await resolveInvoiceAccess(event, user)).toBe('all')
  await expect(resolveInvoiceAccess(event, user, true)).rejects.toMatchObject({ statusCode: 403 })
  expect(mocks.finance).toHaveBeenLastCalledWith(event, 'staff', true)
  expect(mocks.invoice).toHaveBeenLastCalledWith(event, 'staff', 'INVOICE_OWN_CLIENTS', true)
  expect(mocks.fresh).not.toHaveBeenCalled()
})
it('retains assigned invoice reads for a read-only role but rejects draft writes', async () => {
  mocks.invoice.mockImplementation(async (_event, _id, _group, write = false) => {
    if (write) throw { statusCode: 403 }
  })
  expect(await resolveInvoiceAccess(event, user)).toEqual(['assigned'])
  await expect(resolveInvoiceAccess(event, user, true)).rejects.toMatchObject({ statusCode: 403 })
  expect(mocks.fresh).toHaveBeenCalledOnce()
})
it('admits a current writable assigned-invoice grant without broad Finance access', async () => {
  expect(await resolveInvoiceAccess(event, user, true)).toEqual(['assigned'])
  expect(mocks.invoice).toHaveBeenCalledWith(event, 'staff', 'INVOICE_OWN_CLIENTS', true)
})
