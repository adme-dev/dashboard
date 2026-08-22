import { describe, expect, it } from 'vitest'
import {
  calculateClientFinancials,
  parseClientFinancialRange,
  type ClientFinancialCalculationInput,
} from '~~/server/utils/clientFinancialCalculations'

function makeInput(
  overrides: Partial<ClientFinancialCalculationInput> = {},
): ClientFinancialCalculationInput {
  return {
    projects: [
      {
        id: 'project-1',
        name: 'Website refresh',
        status: 'active',
        projectBudgetCents: 1_000_000,
      },
    ],
    xeroRevenue: [],
    mediaSpend: [],
    labour: [],
    manualExpenses: [],
    xeroSupplierCosts: [],
    warnings: [],
    ...overrides,
  }
}

describe('parseClientFinancialRange', () => {
  it('defaults to the current UTC month through today', () => {
    expect(parseClientFinancialRange(
      undefined,
      undefined,
      new Date('2026-08-22T00:00:00Z'),
    )).toEqual({
      from: '2026-08-01',
      to: '2026-08-22',
      label: '1–22 Aug 2026',
    })
  })

  it('rejects a range whose start is after its end', () => {
    expect(() => parseClientFinancialRange('2026-08-23', '2026-08-22'))
      .toThrow(/before or equal/)
  })

  it('rejects a range longer than 366 inclusive days', () => {
    expect(() => parseClientFinancialRange('2025-01-01', '2026-08-22'))
      .toThrow(/366 days/)
  })

  it('rejects malformed and impossible calendar dates', () => {
    expect(() => parseClientFinancialRange('2026-02-30', '2026-03-01'))
      .toThrow(/YYYY-MM-DD/)
    expect(() => parseClientFinancialRange('22-08-2026', '2026-08-22'))
      .toThrow(/YYYY-MM-DD/)
  })
})

describe('calculateClientFinancials', () => {
  it('calculates the approved AGI and delivery model from integer cents', () => {
    const result = calculateClientFinancials(makeInput({
      xeroRevenue: [{ id: 'revenue-1', amountCents: 602_000, projectId: 'project-1' }],
      mediaSpend: [{ id: 'media-1', amountCents: 259_282, projectId: 'project-1' }],
      labour: [{ id: 'time-1', costCents: 50_000, hours: 10, projectId: 'project-1' }],
      manualExpenses: [{ id: 'expense-1', amountCents: 10_000, projectId: 'project-1' }],
      xeroSupplierCosts: [{
        id: 'cost-1',
        invoiceId: 'bill-1',
        amountCents: 30_000,
        projectId: 'project-1',
      }],
    }))

    expect(result.summary.xeroRevenue).toBe(6020)
    expect(result.summary.mediaSpend).toBe(2592.82)
    expect(result.summary.agi).toBe(3427.18)
    expect(result.summary.deliveryCost).toBe(900)
    expect(result.summary.deliveryProfit).toBe(2527.18)
    expect(result.summary.deliveryMarginPct).toBeCloseTo(73.74, 2)
    expect(result.reconciliation.every(item => item.differenceCents === 0)).toBe(true)
  })

  it('returns a null margin with no_agi when AGI is zero', () => {
    const result = calculateClientFinancials(makeInput({
      xeroRevenue: [{ id: 'revenue-1', amountCents: 10_000, projectId: 'project-1' }],
      mediaSpend: [{ id: 'media-1', amountCents: 10_000, projectId: 'project-1' }],
    }))

    expect(result.summary.deliveryMarginPct).toBeNull()
    expect(result.summary.marginReason).toBe('no_agi')
    expect(result.projects[0]?.deliveryMarginPct).toBeNull()
    expect(result.projects[0]?.marginReason).toBe('no_agi')
  })

  it('returns a null margin with negative_agi when media exceeds revenue', () => {
    const result = calculateClientFinancials(makeInput({
      xeroRevenue: [{ id: 'revenue-1', amountCents: 10_000, projectId: 'project-1' }],
      mediaSpend: [{ id: 'media-1', amountCents: 12_500, projectId: 'project-1' }],
    }))

    expect(result.summary.deliveryMarginPct).toBeNull()
    expect(result.summary.marginReason).toBe('negative_agi')
  })

  it('excludes a linked manual expense once when Xero represents the same invoice', () => {
    const result = calculateClientFinancials(makeInput({
      xeroRevenue: [{ id: 'revenue-1', amountCents: 100_000, projectId: 'project-1' }],
      manualExpenses: [{
        id: 'expense-1',
        amountCents: 10_000,
        projectId: 'project-1',
        xeroInvoiceId: 'BILL-42',
      }],
      xeroSupplierCosts: [
        { id: 'cost-1', invoiceId: 'bill-42', amountCents: 12_000, projectId: 'project-1' },
        { id: 'cost-2', invoiceId: 'BILL-42', amountCents: 8_000, projectId: 'project-1' },
      ],
    }))

    expect(result.summary.projectExpenseCost).toBe(0)
    expect(result.summary.xeroSupplierCost).toBe(200)
    expect(result.summary.deliveryCost).toBe(200)
    expect(result.warnings).toEqual([])
  })

  it('invalidates margins when a Xero/manual link conflicts across projects', () => {
    const result = calculateClientFinancials(makeInput({
      projects: [
        { id: 'project-1', name: 'Website', status: 'active', projectBudgetCents: 100_000 },
        { id: 'project-2', name: 'Campaign', status: 'active', projectBudgetCents: 100_000 },
      ],
      xeroRevenue: [
        { id: 'revenue-1', amountCents: 100_000, projectId: 'project-1' },
        { id: 'revenue-2', amountCents: 100_000, projectId: 'project-2' },
      ],
      manualExpenses: [{
        id: 'expense-1',
        amountCents: 10_000,
        projectId: 'project-1',
        xeroInvoiceId: 'bill-42',
      }],
      xeroSupplierCosts: [{
        id: 'cost-1',
        invoiceId: 'BILL-42',
        amountCents: 20_000,
        projectId: 'project-2',
      }],
    }))

    expect(result.summary.deliveryMarginPct).toBeNull()
    expect(result.summary.marginReason).toBe('source_conflict')
    expect(result.projects.map(project => project.marginReason))
      .toEqual(['source_conflict', 'source_conflict'])
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'possible_duplicate',
        source: 'project_expenses',
        sourceId: 'expense-1',
      }),
    ]))
  })

  it('uses amount-weighted client coverage and mapped source counts for projects', () => {
    const result = calculateClientFinancials(makeInput({
      xeroRevenue: [
        { id: 'revenue-1', amountCents: 4_000, projectId: 'project-1' },
        { id: 'revenue-2', amountCents: 6_000, projectId: null },
      ],
      mediaSpend: [
        { id: 'media-1', amountCents: 2_500, projectId: 'project-1' },
        { id: 'media-2', amountCents: 7_500, projectId: null },
      ],
    }))

    expect(result.allocationCoverage.xeroRevenue).toEqual({
      allocated: 40,
      unallocated: 60,
      allocatedItemCount: 1,
      totalItemCount: 2,
      percentage: 40,
    })
    expect(result.allocationCoverage.mediaSpend.percentage).toBe(25)
    expect(result.projects[0]?.coverage).toEqual({
      mappedSourceCount: 2,
      sourceTypes: ['xero_revenue', 'media_spend'],
    })
    expect(result.projects[0]?.coverage).not.toHaveProperty('percentage')
  })

  it('retains unallocated sources in client totals but excludes them from project rows', () => {
    const result = calculateClientFinancials(makeInput({
      xeroRevenue: [
        { id: 'revenue-1', amountCents: 4_000, projectId: 'project-1' },
        { id: 'revenue-2', amountCents: 6_000, projectId: null },
      ],
      xeroSupplierCosts: [{
        id: 'cost-1',
        invoiceId: 'bill-1',
        amountCents: 3_000,
        projectId: null,
      }],
    }))

    expect(result.summary.xeroRevenue).toBe(100)
    expect(result.projects[0]?.xeroRevenue).toBe(40)
    expect(result.unallocated.xeroRevenue).toBe(60)
    expect(result.summary.xeroSupplierCost).toBe(30)
    expect(result.projects[0]?.xeroSupplierCost).toBe(0)
    expect(result.unallocated.xeroSupplierCost).toBe(30)
  })

  it('rejects non-integer source amounts at the cent-only calculation boundary', () => {
    expect(() => calculateClientFinancials(makeInput({
      xeroRevenue: [{ id: 'revenue-1', amountCents: 100.5, projectId: 'project-1' }],
    }))).toThrow(/integer cents/)
  })
})
