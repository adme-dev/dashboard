/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ access: vi.fn(), queryOneFresh: vi.fn(), queryOne: vi.fn(), queryRows: vi.fn(), transaction: vi.fn(), query: vi.fn() }))
vi.mock('~~/server/utils/clientScoping', () => ({ requireInvoiceAccess: m.access }))
vi.mock('~~/server/utils/db', () => m)
vi.stubGlobal('defineEventHandler', (fn: any) => fn)
vi.stubGlobal('getRouterParam', () => 'invoice')
vi.stubGlobal('getQuery', (event: any) => event.query ?? {})
vi.stubGlobal('readBody', (event: any) => event.body ?? {})
const create = (await import('../../../server/api/agency/invoices/index.post')).default
const generate = (await import('../../../server/api/agency/invoices/generate.post')).default
const remove = (await import('../../../server/api/agency/invoices/[id].delete')).default
const invoice = { id: 'invoice', client_id: 'client-a', created_by: 'am', status: 'draft', amount_paid: 0 }
beforeEach(() => {
  vi.clearAllMocks()
  m.access.mockResolvedValue({ user: { id: 'am' }, clientIds: ['client-a'] })
  m.queryOneFresh.mockResolvedValue(invoice)
  m.queryOne.mockResolvedValue({ name: 'Client A' })
  m.queryRows.mockResolvedValue([])
  m.query.mockImplementation(async (sql: string) => ({ rows: sql.includes('client_team_assignments') ? [{ client_id: 'client-a' }] : [] }))
  m.transaction.mockImplementation(async fn => fn({ query: m.query }))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
describe('invoice creation and deletion scope', () => {
  it.each([{ projectId: 'foreign-project' }, { lineItems: [{ description: 'Work', projectId: 'foreign-project' }] }, { lineItems: [{ description: 'Work', time_entry_id: 'foreign-time' }] }])('rejects foreign create references before creating the invoice: %o', async (extra) => {
    await expect(create({ body: { clientId: 'client-a', ...extra } } as any)).rejects.toMatchObject({ statusCode: 403 })
    expect(m.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO'))).toBe(false)
    expect(m.access).toHaveBeenCalledWith(expect.anything(), true)
  })
  it('rejects a foreign project before selecting generation time entries', async () => {
    await expect(generate({ body: { clientId: 'client-a', projectId: 'foreign-project' } } as any)).rejects.toMatchObject({ statusCode: 403 })
    expect(m.query.mock.calls.some(([sql]) => sql.includes('te.billable'))).toBe(false)
  })
  it.each([create, generate])('denies a client outside the assigned book before data access', async (handler) => {
    await expect(handler({ body: { clientId: 'foreign-client' } } as any)).rejects.toMatchObject({ statusCode: 403 })
    expect(m.transaction).not.toHaveBeenCalled()
  })
  it.each([create, generate])('rejects assignments revoked before transactional creation', async (handler) => {
    m.query.mockResolvedValue({ rows: [] })
    await expect(handler({ body: { clientId: 'client-a' } } as any)).rejects.toMatchObject({ statusCode: 403 })
    expect(m.query).toHaveBeenCalledOnce()
  })
  it.each([{}, { hard: 'true' }])('does not cancel/delete when own draft changes before locked write: %o', async (query) => {
    m.query.mockResolvedValue({ rows: [] })
    await expect(remove({ query } as any)).rejects.toMatchObject({ statusCode: 403 })
    expect(m.query).toHaveBeenCalledOnce()
    expect(m.query.mock.calls[0][0]).toContain('FOR UPDATE')
  })
  it.each([{}, { hard: 'true' }])('allows own draft removal with own-draft predicates: %o', async (query) => {
    m.query.mockImplementation(async (sql: string) => ({ rows: sql.includes('FOR UPDATE') ? [invoice] : [{ id: 'invoice' }] }))
    await expect(remove({ query } as any)).resolves.toMatchObject({ success: true })
    const sql = m.query.mock.calls.find(([sql]) => sql.includes('UPDATE invoices') || sql.includes('DELETE FROM invoices'))![0]
    expect(sql).toContain('status = \'draft\'')
    expect(sql).toContain('created_by')
  })
})
