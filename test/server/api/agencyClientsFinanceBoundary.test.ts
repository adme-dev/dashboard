/* eslint-disable @typescript-eslint/no-explicit-any -- Partial Nitro/DB response fixtures. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createError } from 'h3'

const m = vi.hoisted(() => ({ auth: vi.fn(), role: vi.fn(), finance: vi.fn(), clients: vi.fn(), invoices: vi.fn(), marketing: vi.fn(), active: vi.fn(), one: vi.fn(), rows: vi.fn(), oneFresh: vi.fn(), rowsFresh: vi.fn(), cache: vi.fn(), writeQuery: vi.fn(), mutate: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: m.auth, requireRole: m.role }))
vi.mock('~~/server/utils/financeAccess', () => ({ assertFinancePermission: m.finance, assertPermissionGrant: m.clients }))
vi.mock('~~/server/utils/clients/marketingAccess', () => ({ isMarketingClientViewer: m.marketing, requireActiveMarketingClient: m.active, CLIENT_FINANCIAL_ACCESS_HEADER: 'x-client-financial-access', MARKETING_CLIENT_ACCESS: { financial: false, scope: 'marketing_management' } }))
vi.mock('~~/server/utils/db', () => ({ db: {}, queryOne: m.one, queryRows: m.rows, queryOneFresh: m.oneFresh, queryRowsFresh: m.rowsFresh }))
vi.mock('~~/server/utils/clientScoping', () => ({ requireInvoiceAccess: m.invoices }))
vi.mock('~~/server/utils/clients/godModeMutations', () => ({ executeGodModeAgencyClientCreate: m.mutate, executeGodModeAgencyClientUpdate: m.mutate }))
vi.mock('~~/server/utils/kv', () => ({ cachedFetch: m.cache }))
vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('readBody', async (event: any) => event.body)
vi.stubGlobal('getRouterParam', () => 'client-id')
vi.stubGlobal('getQuery', () => ({}))
vi.stubGlobal('createError', createError)
vi.stubGlobal('setResponseHeader', (event: any, key: string, value: string) => {
  event.headers[key] = value
})
const list = (await import('~~/server/api/agency/clients/index.get')).default
const detail = (await import('~~/server/api/agency/clients/[id].get')).default
const create = (await import('~~/server/api/agency/clients/index.post')).default
const update = (await import('~~/server/api/agency/clients/[id].put')).default
const event = () => ({ context: {}, headers: {} }) as any
const fixture = { id: 'client-id', name: 'Client', is_active: true, retainer_amount: 999, total_revenue: 123, hourly_rate: 80 }
beforeEach(() => {
  vi.clearAllMocks()
  m.auth.mockResolvedValue({ id: 'user-id', role: 'member' })
  m.role.mockResolvedValue({ id: 'user-id' })
  m.clients.mockRejectedValue(createError({ statusCode: 403 }))
  m.invoices.mockResolvedValue({ clientIds: [] })
  m.finance.mockRejectedValue(createError({ statusCode: 403 }))
  m.marketing.mockResolvedValue(false)
  m.one.mockResolvedValue(fixture)
  m.rows.mockResolvedValue([])
  m.oneFresh.mockResolvedValue(fixture)
  m.rowsFresh.mockResolvedValue([fixture])
  m.writeQuery.mockImplementation(async (sql: string) => ({ rows: sql.includes('SELECT id FROM') ? [] : [fixture] }))
  m.mutate.mockImplementation(async (_event, mutate) => mutate({ query: m.writeQuery }))
  m.cache.mockImplementation(async (_event, _key, _ttl, load) => load())
})
const financialKeys = ['retainerAmount', 'hourlyRate', 'totalRevenue', 'totalCost', 'grossProfit', 'grossMargin', 'invoices', 'recentTimeEntries', 'xeroContactId', 'mediaCommissionRate']
describe('client insights and company Finance separation', () => {
  it.each(['member', 'owner', 'marketing'])('keeps nongrant %s on minimized metadata without financial cache access', async (role) => {
    m.auth.mockResolvedValue({ id: 'user-id', role, isGodMode: true })
    m.marketing.mockResolvedValue(role === 'marketing')
    for (const handler of [list, detail]) {
      const e = event()
      const result = await handler(e)
      for (const key of financialKeys) expect(JSON.stringify(result)).not.toContain(`"${key}"`)
      expect(e.headers['cache-control']).toBe('private, no-store')
      expect(m.clients).toHaveBeenCalledWith(e, 'user-id', 'CLIENTS', false)
    }
    expect(m.cache).not.toHaveBeenCalled()
    expect(m.one).not.toHaveBeenCalled()
    expect(m.rows).not.toHaveBeenCalled()
  })
  it('retains MarketingManagement minimization even with CLIENTS but permits account-manager billing insights', async () => {
    m.clients.mockResolvedValue(undefined)
    m.marketing.mockResolvedValue(true)
    expect(await list(event())).toMatchObject([{ name: 'Client' }])
    expect(m.cache).not.toHaveBeenCalled()
    m.marketing.mockResolvedValue(false)
    m.rows.mockResolvedValueOnce([fixture])
    const result = await list(event())
    expect(result).toMatchObject([{ retainerAmount: 999, totalRevenue: 123, hourlyRate: 80 }])
    expect(result[0]).not.toHaveProperty('xeroContactId')
    expect(m.cache).toHaveBeenCalledOnce()
    const response = await detail(event())
    expect(response).toMatchObject({ access: { financial: true }, client: { retainerAmount: 999, hourlyRate: 80 } })
    expect(response.client).not.toHaveProperty('xeroContactId')
  })
  it('retains the preexisting CLIENTS route gate for full details', async () => {
    m.clients.mockResolvedValue(undefined)
    m.role.mockRejectedValue(createError({ statusCode: 403 }))
    await expect(detail(event())).rejects.toMatchObject({ statusCode: 403 })
    expect(m.one).not.toHaveBeenCalled()
  })
  it('omits nested invoice rows and totals outside fresh invoice client scope', async () => {
    m.clients.mockResolvedValue(undefined)
    m.invoices.mockResolvedValue({ clientIds: ['foreign-client'] })
    const result = await detail(event())
    expect(result).not.toHaveProperty('invoices')
    expect(result.summary).not.toHaveProperty('totalInvoiced')
    expect(m.rows.mock.calls.some(([sql]) => sql.includes('FROM invoices'))).toBe(false)
    m.invoices.mockResolvedValue({ clientIds: ['client-id'] })
    expect(await detail(event())).toHaveProperty('invoices')
    expect(m.rows.mock.calls.some(([sql]) => sql.includes('FROM invoices'))).toBe(true)
  })
  it('never selects individual internal staff rates without Finance but preserves their hours', async () => {
    m.clients.mockResolvedValue(undefined)
    m.rows.mockImplementation(async (sql: string) => sql.includes('FROM time_entries te') ? [{ id: 'entry', hours: 2, hourly_rate: 999 }] : [])
    const result = await detail(event())
    expect(result.recentTimeEntries).toEqual([expect.objectContaining({ hours: 2 })])
    expect(result.recentTimeEntries[0]).not.toHaveProperty('hourlyRate')
    expect(result.recentTimeEntries[0]).not.toHaveProperty('amount')
    const timeSql = m.rows.mock.calls.find(([sql]) => sql.includes('FROM time_entries te'))![0]
    expect(timeSql).not.toContain('te.*')
    expect(timeSql).not.toContain('te.hourly_rate')
  })
  it('fails closed on either grant or invoice-scope lookup outage', async () => {
    m.clients.mockRejectedValue(createError({ statusCode: 503 }))
    for (const handler of [list, detail]) await expect(handler(event())).rejects.toMatchObject({ statusCode: 503 })
    expect(m.cache).not.toHaveBeenCalled()
    m.clients.mockResolvedValue(undefined)
    m.invoices.mockRejectedValue(createError({ statusCode: 503 }))
    await expect(detail(event())).rejects.toMatchObject({ statusCode: 503 })
  })
})
describe('client billing mutations use CLIENTS; Xero binding uses Finance', () => {
  it.each(['billingType', 'retainerAmount', 'paymentTerms', 'hourlyRate', 'mediaCommissionRate'])('allows client %s with writable CLIENTS without Finance', async (key) => {
    m.clients.mockResolvedValue(undefined)
    for (const handler of [create, update]) {
      const e = { ...event(), body: { name: 'Client', [key]: key === 'billingType' ? 'project' : 123 } }
      expect(await handler(e)).toBeTruthy()
      expect(m.clients).toHaveBeenLastCalledWith(e, 'user-id', 'CLIENTS', true)
    }
  })
  it('denies mutations without fresh writable CLIENTS despite cached legacy owner identity', async () => {
    m.role.mockResolvedValue({ id: 'user-id', role: 'owner' })
    for (const handler of [create, update]) await expect(handler({ ...event(), body: { name: 'Client', hourlyRate: 1 } })).rejects.toMatchObject({ statusCode: 403 })
    expect(m.mutate).not.toHaveBeenCalled()
  })
  it('requires writable Finance only for company Xero binding and omits existing ID from other updates', async () => {
    m.clients.mockResolvedValue(undefined)
    await expect(update({ ...event(), body: { xeroContactId: 'contact-id' } })).rejects.toMatchObject({ statusCode: 403 })
    expect(m.mutate).not.toHaveBeenCalled()
    expect(m.finance).toHaveBeenCalledWith(expect.anything(), 'user-id', true)
    expect(await update({ ...event(), body: { contactPhone: 'updated' } })).toMatchObject({ client: { retainerAmount: 999 } })
    m.finance.mockResolvedValue(undefined)
    expect(await update({ ...event(), body: { xeroContactId: 'contact-id' } })).toBeTruthy()
  })
  it('fails closed on permission outage before mutation', async () => {
    m.clients.mockRejectedValue(createError({ statusCode: 503 }))
    for (const handler of [create, update]) await expect(handler({ ...event(), body: { name: 'Client' } })).rejects.toMatchObject({ statusCode: 503 })
    expect(m.mutate).not.toHaveBeenCalled()
  })
})
