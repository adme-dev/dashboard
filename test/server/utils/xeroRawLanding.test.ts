import { beforeEach, describe, expect, it, vi } from 'vitest'

const executeMock = vi.fn(async () => undefined)

vi.mock('../../../server/utils/db', () => ({
  execute: (...args: unknown[]) => executeMock(...args),
  queryRows: vi.fn(async () => []),
  queryOne: vi.fn(async () => null),
}))

const xeroFetchMock = vi.fn()
vi.mock('../../../server/utils/xeroClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../server/utils/xeroClient')>()
  return { ...actual, xeroFetch: (...args: unknown[]) => xeroFetchMock(...args) }
})

const { syncXeroInvoicesCache } = await import('../../../server/utils/xeroCustomerSync')

const RAW_INVOICE = {
  InvoiceID: '11111111-2222-3333-4444-555555555555',
  Type: 'ACCPAY',
  Status: 'AUTHORISED',
  Contact: { ContactID: '99999999-8888-7777-6666-555555555555', Name: 'SuperChoice Pty Ltd' },
  Date: '/Date(1786060800000+0000)/',
  UpdatedDateUTC: '/Date(1786060800000+0000)/',
  Total: 2462.98,
  AmountDue: 2462.98,
}

describe('xero raw landing layer', () => {
  beforeEach(() => {
    executeMock.mockClear()
    xeroFetchMock.mockReset()
  })

  it('lands the untransformed PascalCase payload in mirror + history', async () => {
    xeroFetchMock
      .mockResolvedValueOnce({ Invoices: [RAW_INVOICE] }) // ACCREC page 1 (reused fixture)
      .mockResolvedValue({ Invoices: [] })

    await syncXeroInvoicesCache({ tenantId: 't1', accessToken: 'tok' })

    const sqls = executeMock.mock.calls.map(c => String(c[0]))
    const mirror = executeMock.mock.calls.find(c => String(c[0]).includes('INSERT INTO xero_raw_invoices'))
    const history = executeMock.mock.calls.find(c => String(c[0]).includes('INSERT INTO xero_raw_history'))
    expect(mirror, `no mirror write in: ${sqls.join(' | ')}`).toBeTruthy()
    expect(history).toBeTruthy()

    // Payload stored EXACTLY as Xero sent it: PascalCase keys, MS-JSON dates.
    const mirrorPayload = JSON.parse((mirror![1] as unknown[])[3] as string)
    expect(mirrorPayload.InvoiceID).toBe(RAW_INVOICE.InvoiceID)
    expect(mirrorPayload.UpdatedDateUTC).toBe('/Date(1786060800000+0000)/')

    // xero_updated_utc param is normalized ISO (parseable timestamp).
    const mirrorUpdated = (mirror![1] as unknown[])[2] as string
    expect(Number.isFinite(Date.parse(mirrorUpdated))).toBe(true)

    // History insert is append-only (conflict-ignoring).
    expect(String(history![0])).toContain('ON CONFLICT DO NOTHING')
  })

  it('lands DELETED invoices for audit even though the cache skips them', async () => {
    xeroFetchMock
      .mockResolvedValueOnce({ Invoices: [{ ...RAW_INVOICE, Status: 'DELETED' }] })
      .mockResolvedValue({ Invoices: [] })

    await syncXeroInvoicesCache({ tenantId: 't1', accessToken: 'tok' })

    const cacheWrite = executeMock.mock.calls.find(c => String(c[0]).includes('xero_invoices_cache'))
    const mirror = executeMock.mock.calls.find(c => String(c[0]).includes('INSERT INTO xero_raw_invoices'))
    expect(cacheWrite).toBeUndefined()
    expect(mirror).toBeTruthy()
  })
})
