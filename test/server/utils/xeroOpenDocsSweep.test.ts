import { beforeEach, describe, expect, it, vi } from 'vitest'

const executeMock = vi.fn(async () => undefined)

vi.mock('../../../server/utils/db', () => ({
  execute: (...args: unknown[]) => executeMock(...args),
  query: vi.fn(async () => []),
  queryRows: vi.fn(async () => []),
  queryOne: vi.fn(async () => null),
}))

const xeroFetchMock = vi.fn()
vi.mock('../../../server/utils/xeroClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../server/utils/xeroClient')>()
  return { ...actual, xeroFetch: (...args: unknown[]) => xeroFetchMock(...args) }
})

const { syncXeroInvoicesCache } = await import('../../../server/utils/xeroCustomerSync')

// An open bill dated/updated long BEFORE any delta window — the case the
// sweep exists for (e.g. Bossio Dec-25 instalment bill still awaiting payment).
const OLD_OPEN_BILL = {
  InvoiceID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  Type: 'ACCPAY',
  Status: 'AUTHORISED',
  Contact: { ContactID: '99999999-8888-7777-6666-555555555555', Name: 'Bossio Advisory Pty Ltd' },
  Date: '/Date(1765497600000+0000)/',
  UpdatedDateUTC: '2025-12-12T00:00:00Z',
  Total: 1136.95,
  AmountDue: 1136.95,
}

function cacheUpsertsFor(invoiceId: string) {
  return executeMock.mock.calls.filter(c =>
    String(c[0]).includes('INSERT INTO xero_invoices_cache')
    && (c[1] as unknown[])?.[1] === invoiceId,
  )
}

describe('open-document sweep', () => {
  beforeEach(() => {
    executeMock.mockClear()
    xeroFetchMock.mockReset()
  })

  it('catches an open bill older than the delta window', async () => {
    const modifiedAfter = new Date('2026-08-01T00:00:00Z')
    xeroFetchMock.mockImplementation(async ({ path, headers }: any) => {
      // Delta passes carry If-Modified-Since and return nothing changed;
      // the sweep (no header) returns the old open bill for ACCPAY.
      if (headers?.['If-Modified-Since']) return { Invoices: [] }
      if (path.includes('ACCPAY')) return { Invoices: [OLD_OPEN_BILL] }
      return { Invoices: [] }
    })

    const upserted = await syncXeroInvoicesCache({ tenantId: 't1', accessToken: 'tok', modifiedAfter })

    expect(upserted).toBe(1)
    expect(cacheUpsertsFor(OLD_OPEN_BILL.InvoiceID)).toHaveLength(1)
  })

  it('sweep queries filter to open statuses and send no If-Modified-Since', async () => {
    xeroFetchMock.mockResolvedValue({ Invoices: [] })
    await syncXeroInvoicesCache({ tenantId: 't1', accessToken: 'tok', modifiedAfter: new Date() })

    const sweeps = xeroFetchMock.mock.calls
      .map(c => c[0] as { path: string; headers?: Record<string, string> })
      .filter(a => decodeURIComponent(a.path).includes('Status=="AUTHORISED"'))
    // One sweep per type, both without the delta header, both including drafts.
    expect(sweeps).toHaveLength(2)
    for (const s of sweeps) {
      expect(s.headers?.['If-Modified-Since']).toBeUndefined()
      expect(decodeURIComponent(s.path)).toContain('Status=="DRAFT"')
    }
  })

  it('does not double-upsert a bill seen by both the delta pass and the sweep', async () => {
    xeroFetchMock.mockImplementation(async ({ path }: any) => {
      if (path.includes('ACCPAY')) return { Invoices: [OLD_OPEN_BILL] }
      return { Invoices: [] }
    })

    // No modifiedAfter → delta pass upserts it; sweep sees it again.
    const upserted = await syncXeroInvoicesCache({ tenantId: 't1', accessToken: 'tok' })

    expect(upserted).toBe(1)
    expect(cacheUpsertsFor(OLD_OPEN_BILL.InvoiceID)).toHaveLength(1)
  })
})
