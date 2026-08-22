import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchClientEconomics,
  fetchPortfolioClientEconomics,
} from '~~/server/utils/ai/tools/economics'

const mocks = vi.hoisted(() => ({
  getSelectedTenant: vi.fn(),
  queryRows: vi.fn(),
}))

vi.mock('~~/server/utils/session', () => ({
  getSelectedTenant: mocks.getSelectedTenant,
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: mocks.queryRows,
}))

async function xeroFingerprint(input: {
  tenantId: string
  lineItemId: string
  invoiceId: string
  invoiceType: string
  invoiceDate: string
  accountCode: string | null
  amountCents: string
  description: string | null
}): Promise<string> {
  const source = [
    input.tenantId,
    input.lineItemId,
    input.invoiceId,
    input.invoiceType,
    input.invoiceDate,
    input.accountCode ?? '',
    input.amountCents,
    input.description ?? '',
  ].join('|')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

async function rowsFor(sql: string): Promise<unknown[]> {
  if (sql.includes('SUM(line.line_ex_gst_cents)')) {
    return [
      { client_id: 'client-a', name: 'Acme', revenue_cents: '602000' },
      { client_id: 'client-loss', name: 'LossCo', revenue_cents: '10000' },
      { client_id: 'client-empty', name: 'No Activity', revenue_cents: '0' },
    ]
  }
  if (sql.includes('FROM media_spend spend')) {
    return [
      { client_id: 'client-a', passthrough_cents: '259282' },
      { client_id: 'client-loss', passthrough_cents: '12000' },
    ]
  }
  if (sql.includes('FROM time_entries te')) {
    return [{ client_id: 'client-a', labor_cents: '30000', hours: '12.5' }]
  }
  if (sql.includes('FROM project_expenses expense')) {
    return [
      { client_id: 'client-a', expense_id: 'expense-1', amount_cents: '25000', xero_invoice_id: null },
      // The linked manual expense is excluded because the represented Xero bill wins.
      { client_id: 'client-a', expense_id: 'expense-duplicate', amount_cents: '35000', xero_invoice_id: ' BILL-1 ' },
    ]
  }
  if (sql.includes('FROM agency_client_xero_tracking_mappings mapping')) {
    const source = {
      tenantId: 'tenant-1',
      lineItemId: 'line-bill-1',
      invoiceId: 'bill-1',
      invoiceType: 'ACCPAY',
      invoiceDate: '2026-08-10',
      accountCode: '310',
      amountCents: '35000',
      description: 'Production supplier',
    }
    return [{
      client_id: 'client-a',
      line_item_id: source.lineItemId,
      invoice_id: source.invoiceId,
      invoice_type: source.invoiceType,
      invoice_date: source.invoiceDate,
      account_code: source.accountCode,
      description: source.description,
      amount_cents: source.amountCents,
      source_fingerprint: await xeroFingerprint(source),
    }]
  }
  throw new Error(`Unexpected portfolio query: ${sql}`)
}

describe('fetchPortfolioClientEconomics', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-22T12:00:00.000Z'))
    mocks.getSelectedTenant.mockReset().mockResolvedValue('tenant-1')
    mocks.queryRows.mockReset().mockImplementation((sql: string) => rowsFor(sql))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns exact canonical cents and null margin for non-positive AGI', async () => {
    const result = await fetchPortfolioClientEconomics({} as any, 'mtd')

    expect(result).toEqual([
      {
        clientId: 'client-a',
        name: 'Acme',
        revenueCents: 602000,
        passthroughCents: 259282,
        agiCents: 342718,
        laborCents: 30000,
        projectExpenseCents: 25000,
        xeroSupplierCostCents: 35000,
        deliveryCostCents: 90000,
        deliveryMarginPct: 73.73,
        hours: 12.5,
      },
      {
        clientId: 'client-loss',
        name: 'LossCo',
        revenueCents: 10000,
        passthroughCents: 12000,
        agiCents: -2000,
        laborCents: 0,
        projectExpenseCents: 0,
        xeroSupplierCostCents: 0,
        deliveryCostCents: 0,
        deliveryMarginPct: null,
        hours: 0,
      },
      {
        clientId: 'client-empty',
        name: 'No Activity',
        revenueCents: 0,
        passthroughCents: 0,
        agiCents: 0,
        laborCents: 0,
        projectExpenseCents: 0,
        xeroSupplierCostCents: 0,
        deliveryCostCents: 0,
        deliveryMarginPct: null,
        hours: 0,
      },
    ])
  })

  it('uses one parameterized batch query per source with tenant/client isolation rules', async () => {
    await fetchPortfolioClientEconomics({} as any, 'mtd')

    expect(mocks.queryRows).toHaveBeenCalledTimes(5)
    const calls = mocks.queryRows.mock.calls.map(([rawSql, params]) => ({
      sql: String(rawSql),
      params,
    }))
    const revenue = calls.find(call => call.sql.includes('SUM(line.line_ex_gst_cents)'))!
    expect(revenue.sql).toContain('invoice.contact_id = ac.xero_contact_id')
    expect(revenue.sql).toContain("UPPER(line.invoice_type) = 'ACCREC'")
    expect(revenue.sql).toContain("NOT IN ('DRAFT', 'VOIDED', 'DELETED')")
    expect(revenue.sql).not.toContain('xero_project_allocations')
    expect(revenue.params).toEqual(['tenant-1', '2026-08-01', '2026-08-22'])

    const media = calls.find(call => call.sql.includes('FROM media_spend spend'))!
    expect(media.sql).toContain('FROM daily_spend day')
    expect(media.sql).toContain('day.spend_date BETWEEN $2::date AND $3::date')
    expect(media.params).toEqual([['2026-08'], '2026-08-01', '2026-08-22'])

    const labour = calls.find(call => call.sql.includes('FROM time_entries te'))!
    expect(labour.sql).toContain('JOIN projects p ON te.project_id = p.id')
    expect(labour.sql).toContain('te.date BETWEEN $1::date AND $2::date')
    expect(labour.sql).not.toContain('LIMIT')

    const expenses = calls.find(call => call.sql.includes('FROM project_expenses expense'))!
    expect(expenses.sql).toContain('project.id = expense.project_id')
    expect(expenses.sql).toContain('expense.date BETWEEN $1::date AND $2::date')

    const suppliers = calls.find(call => call.sql.includes('FROM agency_client_xero_tracking_mappings mapping'))!
    expect(suppliers.sql).toContain('mapping.tenant_id = $1')
    expect(suppliers.sql).toContain("UPPER(line.invoice_type) = 'ACCPAY'")
    expect(suppliers.sql).toContain('LOWER(line.tracking_client) = LOWER(mapping.tracking_option_name)')
    expect(suppliers.sql).toContain("UPPER(account.type) = 'DIRECTCOSTS'")
    expect(suppliers.sql).toContain('JOIN xero_project_allocations allocation')
    expect(suppliers.sql).toContain('allocation.source_fingerprint')
    expect(suppliers.sql).toContain('project.client_id = mapping.client_id')
    expect(suppliers.params).toEqual(['tenant-1', '2026-08-01', '2026-08-22'])
  })

  it('preserves fetchClientEconomics as the rollout compatibility alias', () => {
    expect(fetchClientEconomics).toBe(fetchPortfolioClientEconomics)
  })

  it('does not query any source without a selected Xero tenant', async () => {
    mocks.getSelectedTenant.mockResolvedValueOnce(null)

    await expect(fetchPortfolioClientEconomics({} as any, 'ytd')).resolves.toEqual([])
    expect(mocks.queryRows).not.toHaveBeenCalled()
  })
})
