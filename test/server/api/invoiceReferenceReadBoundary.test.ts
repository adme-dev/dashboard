/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ queryOne: vi.fn(), queryOneFresh: vi.fn(), queryRows: vi.fn() }))
vi.mock('~~/server/utils/clientScoping', () => ({ requireInvoiceAccess: async () => ({ user: { id: 'am' }, clientIds: ['client-a'] }) }))
vi.mock('~~/server/utils/db', () => ({ ...m, queryRowsFresh: m.queryRows }))
vi.stubGlobal('defineEventHandler', (fn: any) => fn)
vi.stubGlobal('getRouterParam', () => 'invoice')
vi.stubGlobal('getQuery', () => ({}))
const detail = (await import('../../../server/api/agency/invoices/[id].get')).default
const lineItems = (await import('../../../server/api/agency/invoices/[id]/line-items.get')).default
const list = (await import('../../../server/api/agency/invoices/index.get')).default
beforeEach(() => {
  vi.clearAllMocks()
  m.queryOne.mockResolvedValue({ id: 'invoice', client_id: 'client-a', status: 'draft', project_id: 'foreign-project', project_name: null, scoped_project_id: null })
  m.queryOneFresh.mockResolvedValue({ id: 'invoice', client_id: 'client-a', scoped_project_id: null })
  m.queryRows.mockImplementation(async (sql: string) => sql.includes('FROM invoice_line_items') ? [{ id: 'line', time_entry_id: 'foreign-time', project_id: 'foreign-project', scoped_time_entry_id: null, scoped_project_id: null }] : [])
})
describe('legacy invoice reference disclosure', () => {
  it.each([detail, lineItems])('omits foreign project/time-entry IDs and constrains joined descriptions to invoice client', async (handler) => {
    const result = await handler({} as any) as any
    const lines = result.lineItems ?? result.invoice.lineItems
    expect(lines[0].timeEntryId).toBeNull()
    expect(lines[0].projectId).toBeNull()
    const [sql] = m.queryRows.mock.calls.find(([sql]) => sql.includes('FROM invoice_line_items'))!
    expect(sql).toContain('p.client_id = i.client_id')
    expect(sql).toContain('tp.client_id = i.client_id')
  })
  it('hides a foreign parent project ID on detail and constrains the project name join', async () => {
    const result = await detail({} as any) as any
    expect(result.invoice.projectId).toBeNull()
    expect(m.queryOneFresh.mock.calls[0][0]).toContain('p.client_id = i.client_id')
  })
  it('constrains list project names to the invoice client', async () => {
    await list({} as any)
    const [sql] = m.queryRows.mock.calls.find(([sql]) => sql.includes('FROM invoices i'))!
    expect(sql).toContain('p.client_id = i.client_id')
  })
})
