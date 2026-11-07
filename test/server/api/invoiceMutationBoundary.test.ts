/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ access: vi.fn(), finance: vi.fn(), queryOneFresh: vi.fn(), queryOne: vi.fn(), queryRows: vi.fn(), txQuery: vi.fn(), transaction: vi.fn() }))
vi.mock('~~/server/utils/clientScoping', () => ({ requireInvoiceAccess: mocks.access }))
vi.mock('~~/server/utils/financeAccess', () => ({ assertFinancePermission: mocks.finance }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: vi.fn(async () => ({ id: 'am' })) }))
vi.mock('~~/server/utils/db', () => mocks)
vi.stubGlobal('defineEventHandler', (handler: any) => handler)
vi.stubGlobal('getRouterParam', (_event: any, key: string) => key === 'id' ? 'invoice' : 'line')
vi.stubGlobal('readBody', async (event: any) => event.body ?? {})
const update = (await import('../../../server/api/agency/invoices/[id].put')).default
const linesRead = (await import('../../../server/api/agency/invoices/[id]/line-items.get')).default
const linesAdd = (await import('../../../server/api/agency/invoices/[id]/line-items.post')).default
const linesUpdate = (await import('../../../server/api/agency/invoices/[id]/line-items/[lineItemId].put')).default
const linesDelete = (await import('../../../server/api/agency/invoices/[id]/line-items/[lineItemId].delete')).default
const payment = (await import('../../../server/api/agency/invoices/[id]/payments.post')).default
const send = (await import('../../../server/api/agency/invoices/[id]/send.post')).default
const invoice = { id: 'invoice', client_id: 'client-a', status: 'draft', created_by: 'am', invoice_number: 'INV', tax_rate: 10 }
const event = { body: { description: 'Work', quantity: 1, unitPrice: 10, notes: 'Note' } } as any
beforeEach(() => {
  vi.clearAllMocks()
  mocks.access.mockResolvedValue({ user: { id: 'am' }, clientIds: ['client-a'] })
  mocks.queryOneFresh.mockResolvedValue(invoice)
  mocks.queryRows.mockResolvedValue([])
  mocks.finance.mockResolvedValue(undefined)
  mocks.transaction.mockImplementation(async callback => callback({ query: mocks.txQuery }))
  mocks.txQuery.mockResolvedValue({ rows: [] })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
describe('native invoice mutation scope', () => {
  it.each([['invoice update', update], ['line read', linesRead], ['line add', linesAdd], ['line update', linesUpdate], ['line delete', linesDelete]])('blocks other-client %s before child data or writes', async (_name, handler) => {
    mocks.queryOneFresh.mockResolvedValue({ ...invoice, client_id: 'other-client' })
    await expect((handler as any)(event)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.queryRows).not.toHaveBeenCalled()
    expect(mocks.queryOne).not.toHaveBeenCalled()
  })
  it.each([update, linesAdd, linesUpdate, linesDelete])('requires write authority and rejects another creator or a sent invoice', async (handler) => {
    mocks.queryOneFresh.mockResolvedValue({ ...invoice, created_by: 'other' })
    await expect((handler as any)(event)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.access).toHaveBeenCalledWith(event, true)
    mocks.queryOneFresh.mockResolvedValue({ ...invoice, status: 'sent' })
    await expect((handler as any)(event)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('allows assigned-client line reads regardless of creator/status', async () => {
    mocks.queryOneFresh.mockResolvedValue({ ...invoice, status: 'sent', created_by: 'finance' })
    await expect(linesRead(event)).resolves.toMatchObject({ invoiceId: 'invoice', lineItems: [] })
  })
  it.each([update, linesAdd, linesUpdate, linesDelete])('stops when a draft changes or assignment is revoked before the locked mutation', async (handler) => {
    await expect((handler as any)(event)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.txQuery).toHaveBeenCalledOnce()
    expect(mocks.txQuery.mock.calls[0][0]).toContain('FOR UPDATE')
  })
  it.each([{ status: 'sent' }, { status: 'approved' }, { clientId: 'unassigned' }])('rejects draft/client escape %o before transaction', async (body) => {
    await expect(update({ body } as any)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it.each([payment, send])('requires fresh writable Finance before any payment or send row query', async (handler) => {
    mocks.finance.mockRejectedValue(Object.assign(new Error('Forbidden'), { statusCode: 403 }))
    await expect((handler as any)(event)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.finance).toHaveBeenCalledWith(event, 'am', true)
    expect(mocks.queryOne).not.toHaveBeenCalled()
  })
  it('allows an own-draft line insertion under the locked parent', async () => {
    mocks.txQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FOR UPDATE')) return { rows: [invoice] }
      if (sql.includes('MAX(sort_order)')) return { rows: [{ max_order: 0 }] }
      if (sql.includes('INSERT INTO invoice_line_items')) return { rows: [{ id: 'new-line', invoice_id: 'invoice', description: 'Work', quantity: 1, unit_price: 10 }] }
      if (sql.includes('SUM(quantity')) return { rows: [{ subtotal: 10, taxable_amount: 10 }] }
      return { rows: [] }
    })
    await expect(linesAdd(event)).resolves.toMatchObject({ success: true, lineItem: { id: 'new-line' } })
    expect(mocks.txQuery.mock.calls[0][0]).toContain('FOR UPDATE')
  })
  it('keeps the creator/draft predicate on the parent UPDATE', async () => {
    mocks.txQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FOR UPDATE')) return { rows: [invoice] }
      if (sql.includes('SELECT cta.client_id')) return { rows: [{ client_id: 'client-a' }] }
      return { rows: [] }
    })
    await expect(update({ body: { notes: 'Hello' } } as any)).rejects.toMatchObject({ statusCode: 403 })
    const call = mocks.txQuery.mock.calls.find(([sql]) => sql.includes('UPDATE invoices SET'))!
    expect(call[0]).toContain('status = \'draft\' AND created_by = $15')
    expect(call[1].slice(-2)).toEqual([false, 'am'])
  })
})
