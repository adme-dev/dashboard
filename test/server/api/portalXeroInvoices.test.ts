import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  query?: Record<string, string>
  params?: Record<string, string>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getQuery: (event: TestEvent) => Record<string, string>
  getRouterParam: (event: TestEvent, key: string) => string | undefined
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getQuery = event => event.query ?? {}
testGlobal.getRouterParam = (event, key) => event.params?.[key]
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const mockRequireClientAuth = vi.fn()
const mockQueryRows = vi.fn()
const mockQueryOne = vi.fn()

vi.mock('~~/server/utils/clientAuth', () => ({
  requireClientAuth: (...args: unknown[]) => mockRequireClientAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

const { default: listInvoices } = await import(
  '../../../../server/api/portal/invoices/index.get'
)
const { default: getInvoice } = await import(
  '../../../../server/api/portal/invoices/[id].get'
)

describe('portal Xero invoice linkage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireClientAuth.mockResolvedValue({
      clientId: 'south-morang-client',
      permissions: { canViewInvoices: true }
    })
  })

  it('returns current Xero invoices for the portal client linked to that contact', async () => {
    mockQueryOne
      .mockResolvedValueOnce({
        xero_contact_id: 'south-morang-xero-contact',
        tenant_id: 'adme-xero-tenant'
      })
      .mockResolvedValueOnce({
        total: '24',
        paid: '21',
        sent: '0',
        overdue: '3',
        current: '3',
        history: '21',
        due_next_7_count: '0',
        last_paid_date: '2026-07-31',
        next_due_date: null,
        aging_current_count: '0',
        aging_30_count: '1',
        aging_60_count: '0',
        aging_90_count: '2',
        total_billed_cents: '6989259',
        total_paid_cents: '6446039',
        paid_last_90_cents: '2500000',
        avg_paid_invoice_cents: '306954',
        avg_days_to_pay: '9.6',
        total_outstanding_cents: '543210',
        due_next_7_cents: '0',
        overdue_cents: '543210',
        aging_current_cents: '0',
        aging_30_cents: '300000',
        aging_60_cents: '0',
        aging_90_cents: '243210'
      })
    mockQueryRows.mockResolvedValueOnce([{
      invoice_id: 'xero-invoice-21905',
      invoice_number: '21905',
      reference: 'August services',
      status: 'AUTHORISED',
      date: '2026-08-07',
      due_date: '2026-08-07',
      fully_paid_on_date: null,
      subtotal_cents: '272727',
      total_tax_cents: '27273',
      total_cents: '300000',
      amount_paid_cents: '0',
      amount_due_cents: '300000',
      currency_code: 'AUD'
    }])

    const result = await listInvoices({ query: { view: 'current', limit: '-1' } })

    expect(result.invoices).toEqual([expect.objectContaining({
      id: 'xero-invoice-21905',
      invoiceNumber: '21905',
      status: 'overdue',
      totalAmount: 3000,
      amountDue: 3000,
      isOverdue: true
    })])
    expect(result.summary).toMatchObject({
      current: 3,
      history: 21,
      totalOutstanding: 5432.1,
      overdueAmount: 5432.1,
      averageDaysToPay: 10
    })

    const listSql = String(mockQueryRows.mock.calls[0]?.[0])
    expect(listSql).toContain('FROM xero_invoices_cache')
    expect(mockQueryRows.mock.calls[0]?.[1]).toEqual([
      'adme-xero-tenant',
      'south-morang-xero-contact',
      50,
      'current'
    ])
  })

  it('returns a Xero invoice detail only when it belongs to the authenticated client', async () => {
    mockQueryOne.mockResolvedValueOnce({
      id: 'xero-invoice-21905',
      invoice_number: '21905',
      status: 'AUTHORISED',
      issue_date: '2026-08-07',
      due_date: '2026-08-07',
      paid_date: null,
      subtotal_cents: '272727',
      tax_cents: '27273',
      total_cents: '300000',
      amount_paid_cents: '0',
      amount_due_cents: '300000',
      currency: 'AUD',
      reference: 'August services'
    })
    mockQueryRows.mockResolvedValueOnce([{
      id: 'line-1',
      description: 'Digital marketing services',
      quantity: '1',
      unit_amount_cents: '272727',
      line_ex_gst_cents: '272727',
      tax_amount_cents: '27273'
    }])

    const result = await getInvoice({ params: { id: 'xero-invoice-21905' } })

    expect(result.invoice).toMatchObject({
      id: 'xero-invoice-21905',
      invoiceNumber: '21905',
      status: 'overdue',
      subtotal: 2727.27,
      taxAmount: 272.73,
      totalAmount: 3000,
      amountDue: 3000,
      isOverdue: true
    })
    expect(result.lineItems).toEqual([expect.objectContaining({
      id: 'line-1',
      description: 'Digital marketing services',
      unitPrice: 2727.27,
      amount: 2727.27
    })])

    const detailSql = String(mockQueryOne.mock.calls[0]?.[0])
    expect(detailSql).toContain('FROM xero_invoices_cache')
    expect(detailSql).toContain('c.id = $2')
    expect(mockQueryOne.mock.calls[0]?.[1]).toEqual([
      'xero-invoice-21905',
      'south-morang-client'
    ])
  })
})
