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

async function rowsFor(sql: string): Promise<unknown[]> {
  if (sql.includes('SUM(line.line_ex_gst_cents)')) {
    return [
      { client_id: 'client-a', name: 'Acme', revenue_cents: '602000', revenue_available: true },
      { client_id: 'client-loss', name: 'LossCo', revenue_cents: '10000', revenue_available: true },
      { client_id: 'client-empty', name: 'No Activity', revenue_cents: '0', revenue_available: true },
      { client_id: 'client-unlinked', name: 'Unlinked Xero', revenue_cents: '0', revenue_available: false },
      { client_id: 'client-unmapped', name: 'Missing Tracking', revenue_cents: '100000', revenue_available: true },
      { client_id: 'client-no-media', name: 'No Media Source', revenue_cents: '100000', revenue_available: true },
    ]
  }
  if (sql.includes('LEFT JOIN media_spend spend')) {
    return [
      { client_id: 'client-a', passthrough_cents: '259282', media_available: true },
      { client_id: 'client-loss', passthrough_cents: '12000', media_available: true },
      { client_id: 'client-empty', passthrough_cents: '0', media_available: true },
      { client_id: 'client-unlinked', passthrough_cents: '0', media_available: true },
      { client_id: 'client-unmapped', passthrough_cents: '0', media_available: true },
      { client_id: 'client-no-media', passthrough_cents: '0', media_available: false },
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
      // An unallocated Xero bill is still represented at client level and also wins deduplication.
      { client_id: 'client-a', expense_id: 'expense-unallocated-duplicate', amount_cents: '15000', xero_invoice_id: 'BILL-2' },
    ]
  }
  if (sql.includes('agency_client_xero_tracking_mappings mapping')) {
    return [
      {
        client_id: 'client-a',
        invoice_id: 'bill-1',
        amount_cents: '35000',
        supplier_tracking_available: true,
        allocation_project_id: 'project-a',
        allocation_project_client_id: 'client-a',
        source_fingerprint: 'current-allocation',
      },
      {
        client_id: 'client-a',
        invoice_id: 'bill-2',
        amount_cents: '15000',
        supplier_tracking_available: true,
        allocation_project_id: null,
        allocation_project_client_id: null,
        source_fingerprint: null,
      },
      { client_id: 'client-loss', invoice_id: null, amount_cents: null, supplier_tracking_available: true },
      { client_id: 'client-empty', invoice_id: null, amount_cents: null, supplier_tracking_available: true },
      { client_id: 'client-unlinked', invoice_id: null, amount_cents: null, supplier_tracking_available: true },
      { client_id: 'client-unmapped', invoice_id: null, amount_cents: null, supplier_tracking_available: false },
      { client_id: 'client-no-media', invoice_id: null, amount_cents: null, supplier_tracking_available: true },
    ]
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

  it('returns exact canonical cents including unallocated supplier costs and null margin for non-positive AGI', async () => {
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
        xeroSupplierCostCents: 50000,
        deliveryCostCents: 105000,
        deliveryMarginPct: 69.36,
        revenueAvailable: true,
        mediaAvailable: true,
        supplierTrackingAvailable: true,
        profitabilityAvailable: true,
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
        revenueAvailable: true,
        mediaAvailable: true,
        supplierTrackingAvailable: true,
        profitabilityAvailable: true,
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
        revenueAvailable: true,
        mediaAvailable: true,
        supplierTrackingAvailable: true,
        profitabilityAvailable: true,
        hours: 0,
      },
      {
        clientId: 'client-unlinked', name: 'Unlinked Xero', revenueCents: 0, passthroughCents: 0,
        agiCents: 0, laborCents: 0, projectExpenseCents: 0, xeroSupplierCostCents: 0,
        deliveryCostCents: 0, deliveryMarginPct: null, revenueAvailable: false,
        mediaAvailable: true, supplierTrackingAvailable: true, profitabilityAvailable: false, hours: 0,
      },
      {
        clientId: 'client-unmapped', name: 'Missing Tracking', revenueCents: 100000, passthroughCents: 0,
        agiCents: 100000, laborCents: 0, projectExpenseCents: 0, xeroSupplierCostCents: 0,
        deliveryCostCents: 0, deliveryMarginPct: null, revenueAvailable: true,
        mediaAvailable: true, supplierTrackingAvailable: false, profitabilityAvailable: false, hours: 0,
      },
      {
        clientId: 'client-no-media', name: 'No Media Source', revenueCents: 100000, passthroughCents: 0,
        agiCents: 100000, laborCents: 0, projectExpenseCents: 0, xeroSupplierCostCents: 0,
        deliveryCostCents: 0, deliveryMarginPct: null, revenueAvailable: true,
        mediaAvailable: false, supplierTrackingAvailable: true, profitabilityAvailable: false, hours: 0,
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

    expect(revenue.sql).toContain('ac.xero_contact_id IS NOT NULL')
    expect(revenue.sql).toContain('invoice.date BETWEEN $2::date AND $3::date')
    expect(revenue.sql).toContain('COUNT(line.line_item_id) > 0')

    const media = calls.find(call => call.sql.includes('LEFT JOIN media_spend spend'))!
    expect(media.sql).toContain('FROM daily_spend day')
    expect(media.sql).toContain('FROM social_connections connection')
    expect(media.sql).toContain('COUNT(spend.id) FILTER (WHERE spend.connection_id IS NULL) > 0')
    expect(media.sql).toContain('day.spend_date BETWEEN $2::date AND $3::date')
    expect(media.params).toEqual([['2026-08'], '2026-08-01', '2026-08-22'])

    const labour = calls.find(call => call.sql.includes('FROM time_entries te'))!
    expect(labour.sql).toContain('JOIN projects p ON te.project_id = p.id')
    expect(labour.sql).toContain('te.date BETWEEN $1::date AND $2::date')
    expect(labour.sql).not.toContain('LIMIT')

    const expenses = calls.find(call => call.sql.includes('FROM project_expenses expense'))!
    expect(expenses.sql).toContain('project.id = expense.project_id')
    expect(expenses.sql).toContain('expense.date BETWEEN $1::date AND $2::date')

    const suppliers = calls.find(call => call.sql.includes('LEFT JOIN agency_client_xero_tracking_mappings mapping'))!
    expect(suppliers.sql).toContain('mapping.tenant_id = $1')
    expect(suppliers.sql).toContain("UPPER(line.invoice_type) = 'ACCPAY'")
    expect(suppliers.sql).toContain('LOWER(line.tracking_client) = LOWER(mapping.tracking_option_name)')
    expect(suppliers.sql).toContain("UPPER(account.type) = 'DIRECTCOSTS'")
    expect(suppliers.sql).toContain('(mapping.client_id IS NOT NULL) AS supplier_tracking_available')
    expect(suppliers.sql).toContain('LEFT JOIN agency_client_xero_tracking_mappings mapping')
    expect(suppliers.sql).toContain('LEFT JOIN xero_project_allocations allocation')
    expect(suppliers.sql).toContain('allocation.source_fingerprint')
    expect(suppliers.sql).toContain('LEFT JOIN projects project')
    expect(suppliers.sql).not.toContain('allocation.client_id = mapping.client_id')
    expect(suppliers.sql).not.toContain('project.client_id = mapping.client_id')
    expect(suppliers.params).toEqual(['tenant-1', '2026-08-01', '2026-08-22'])
  })

  it('marks unlinked Xero, missing Client tracking, and missing media sources as unavailable', async () => {
    const result = await fetchPortfolioClientEconomics({} as any, 'mtd')

    expect(result.find(row => row.clientId === 'client-unlinked')).toMatchObject({
      revenueAvailable: false,
      profitabilityAvailable: false,
      deliveryMarginPct: null,
    })
    expect(result.find(row => row.clientId === 'client-unmapped')).toMatchObject({
      supplierTrackingAvailable: false,
      profitabilityAvailable: false,
      deliveryMarginPct: null,
    })
    expect(result.find(row => row.clientId === 'client-no-media')).toMatchObject({
      mediaAvailable: false,
      profitabilityAvailable: false,
      deliveryMarginPct: null,
    })
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
