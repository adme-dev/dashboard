/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { assertInvoiceRowAccess, lockInvoiceForEdit, assertInvoiceDraftChanges, assertInvoiceReferences } from '../../../server/utils/invoiceRowAccess'

const db = vi.hoisted(() => ({ queryOneFresh: vi.fn() }))
vi.mock('~~/server/utils/db', () => db)
const access = { user: { id: 'am' }, clientIds: ['client-a'] } as any
const invoice = { id: 'inv', client_id: 'client-a', status: 'draft', created_by: 'am' }
beforeEach(() => vi.clearAllMocks())
describe('invoice row boundary', () => {
  it('allows assigned-client reads but denies other-client reads', async () => {
    db.queryOneFresh.mockResolvedValue({ ...invoice, client_id: 'client-b' })
    await expect(assertInvoiceRowAccess('inv', access)).rejects.toMatchObject({ statusCode: 403 })
    db.queryOneFresh.mockResolvedValue({ ...invoice, status: 'sent', created_by: 'someone' })
    await expect(assertInvoiceRowAccess('inv', access)).resolves.toMatchObject({ status: 'sent' })
  })
  it.each([{ status: 'sent' }, { created_by: 'other' }, { client_id: 'client-b' }])('denies draft mutation outside own assigned draft: %o', async (change) => {
    db.queryOneFresh.mockResolvedValue({ ...invoice, ...change })
    await expect(assertInvoiceRowAccess('inv', access, true)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('allows Finance to edit non-draft rows and returns 404 for missing rows', async () => {
    db.queryOneFresh.mockResolvedValue({ ...invoice, status: 'sent' })
    await expect(assertInvoiceRowAccess('inv', { ...access, clientIds: 'all' }, true)).resolves.toMatchObject({ status: 'sent' })
    db.queryOneFresh.mockResolvedValue(null)
    await expect(assertInvoiceRowAccess('inv', access)).rejects.toMatchObject({ statusCode: 404 })
  })
  it('rechecks own draft and fresh assignment under a transaction row lock', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [invoice] }) }
    await lockInvoiceForEdit(client, 'inv', access)
    const [sql, params] = client.query.mock.calls[0]
    expect(sql).toContain('FOR UPDATE')
    expect(sql).toContain('i.status = \'draft\'')
    expect(sql).toContain('i.created_by = $2')
    expect(sql).toContain('client_team_assignments')
    expect(params).toEqual(['inv', 'am'])
    client.query.mockResolvedValue({ rows: [] })
    await expect(lockInvoiceForEdit(client, 'inv', access)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('rejects status transitions and unassigned client moves while allowing an assigned move', () => {
    expect(() => assertInvoiceDraftChanges(access, { status: 'sent' })).toThrow()
    expect(() => assertInvoiceDraftChanges(access, { clientId: 'client-b' })).toThrow()
    expect(() => assertInvoiceDraftChanges(access, { clientId: 'client-a', status: 'draft' })).not.toThrow()
    expect(() => assertInvoiceDraftChanges({ ...access, clientIds: 'all' }, { status: 'sent', clientId: 'client-b' })).not.toThrow()
  })
  it('rejects project/time-entry links to a different client', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    await expect(assertInvoiceReferences(client, 'client-a', { projectId: 'other-project' })).rejects.toMatchObject({ statusCode: 403 })
    expect(client.query.mock.calls[0][1]).toEqual(['other-project', 'client-a'])
    client.query.mockResolvedValue({ rows: [{ id: 'time' }] })
    await expect(assertInvoiceReferences(client, 'client-a', { timeEntryId: 'time' })).resolves.toBeUndefined()
    expect(client.query.mock.calls.at(-1)?.[0]).toContain('JOIN projects')
  })
})
