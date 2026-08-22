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

  it.each([
    ['unallocated', null],
    ['stale-project', 'missing-project'],
  ] as const)(
    'deduplicates a manual expense when the authoritative Xero cost is %s',
    (_case, xeroProjectId) => {
      const result = calculateClientFinancials(makeInput({
        xeroRevenue: [{ id: 'revenue-1', amountCents: 100_000, projectId: 'project-1' }],
        manualExpenses: [{
          id: 'expense-1',
          amountCents: 10_000,
          projectId: 'project-1',
          xeroInvoiceId: 'bill-42',
        }],
        xeroSupplierCosts: [{
          id: 'cost-1',
          invoiceId: 'BILL-42',
          amountCents: 30_000,
          projectId: xeroProjectId,
        }],
      }))

      expect(result.summary.deliveryCost).toBe(300)
      expect(result.summary.deliveryProfit).toBe(700)
      expect(result.summary.deliveryMarginPct).toBe(70)
      expect(result.projects[0]).toMatchObject({
        projectExpenseCost: 0,
        xeroSupplierCost: 0,
        deliveryCost: 0,
      })
      expect(result.unallocated).toMatchObject({
        projectExpenseCost: 0,
        xeroSupplierCost: 300,
        deliveryCost: 300,
      })
      expect(result.reconciliation.every(item => item.differenceCents === 0)).toBe(true)
    },
  )

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

  it('propagates a caller-supplied duplicate warning to its project and summary margin', () => {
    const duplicateWarning = {
      code: 'possible_duplicate' as const,
      source: 'project_expenses' as const,
      sourceId: 'expense-1',
      projectId: 'project-1',
      message: 'This expense cannot yet be deterministically deduplicated.',
    }
    const result = calculateClientFinancials(makeInput({
      projects: [
        { id: 'project-1', name: 'Website', status: 'active', projectBudgetCents: null },
        { id: 'project-2', name: 'Campaign', status: 'active', projectBudgetCents: null },
      ],
      xeroRevenue: [
        { id: 'revenue-1', amountCents: 100_000, projectId: 'project-1' },
        { id: 'revenue-2', amountCents: 100_000, projectId: 'project-2' },
      ],
      warnings: [duplicateWarning],
    }))

    expect(result.summary.marginReason).toBe('source_conflict')
    expect(result.summary.deliveryMarginPct).toBeNull()
    expect(result.projects.map(project => project.marginReason))
      .toEqual(['source_conflict', null])
    expect(result.warnings).toEqual([duplicateWarning])
  })

  it('does not add a duplicate warning for a conflict already supplied by the caller', () => {
    const duplicateWarning = {
      code: 'possible_duplicate' as const,
      source: 'project_expenses' as const,
      sourceId: 'expense-1',
      projectId: 'project-1',
      message: 'This expense cannot yet be deterministically deduplicated.',
    }
    const result = calculateClientFinancials(makeInput({
      projects: [
        { id: 'project-1', name: 'Website', status: 'active', projectBudgetCents: null },
        { id: 'project-2', name: 'Campaign', status: 'active', projectBudgetCents: null },
      ],
      manualExpenses: [{
        id: 'expense-1',
        amountCents: 10_000,
        projectId: 'project-1',
        xeroInvoiceId: 'bill-42',
      }],
      xeroSupplierCosts: [{
        id: 'cost-1',
        invoiceId: 'bill-42',
        amountCents: 20_000,
        projectId: 'project-2',
      }],
      warnings: [duplicateWarning],
    }))

    expect(result.warnings).toEqual([duplicateWarning])
  })

  it('conservatively invalidates all margins for an unscoped duplicate warning', () => {
    const duplicateWarning = {
      code: 'possible_duplicate' as const,
      source: 'xero_supplier_cost' as const,
      sourceId: 'cost-1',
      message: 'The duplicate source cannot be assigned to a single project.',
    }
    const result = calculateClientFinancials(makeInput({
      projects: [
        { id: 'project-1', name: 'Website', status: 'active', projectBudgetCents: null },
        { id: 'project-2', name: 'Campaign', status: 'active', projectBudgetCents: null },
      ],
      xeroRevenue: [
        { id: 'revenue-1', amountCents: 100_000, projectId: 'project-1' },
        { id: 'revenue-2', amountCents: 100_000, projectId: 'project-2' },
      ],
      mediaSpend: [
        { id: 'media-1', amountCents: 100_000, projectId: 'project-1' },
        { id: 'media-2', amountCents: 200_000, projectId: 'project-2' },
      ],
      warnings: [duplicateWarning],
    }))

    expect(result.summary.marginReason).toBe('source_conflict')
    expect(result.projects.map(project => project.marginReason))
      .toEqual(['source_conflict', 'source_conflict'])
    expect(result.projects.every(project => project.deliveryMarginPct === null)).toBe(true)
    expect(result.warnings).toEqual([duplicateWarning])
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

  it('reconciles independent project and unallocated partitions source-by-source', () => {
    const result = calculateClientFinancials(makeInput({
      projects: [
        { id: 'project-1', name: 'Website', status: 'active', projectBudgetCents: null },
        { id: 'project-2', name: 'Campaign', status: 'active', projectBudgetCents: null },
      ],
      xeroRevenue: [
        { id: 'revenue-1', amountCents: 10_000, projectId: 'project-1' },
        { id: 'revenue-2', amountCents: 5_000, projectId: null },
      ],
      mediaSpend: [
        { id: 'media-1', amountCents: 3_000, projectId: 'project-2' },
        { id: 'media-2', amountCents: 2_000, projectId: 'missing-project' },
      ],
      labour: [
        { id: 'time-1', costCents: 1_000, hours: 1, projectId: 'project-1' },
        { id: 'time-2', costCents: 500, hours: 0.5, projectId: null },
      ],
      manualExpenses: [
        { id: 'expense-1', amountCents: 700, projectId: 'project-2' },
        { id: 'expense-2', amountCents: 300, projectId: 'missing-project' },
      ],
      xeroSupplierCosts: [
        { id: 'cost-1', invoiceId: 'bill-1', amountCents: 1_100, projectId: 'project-1' },
        { id: 'cost-2', invoiceId: 'bill-2', amountCents: 1_300, projectId: null },
      ],
    }))

    const expectations = [
      { source: 'xero_revenue', summary: 150, projects: 100, unallocated: 50 },
      { source: 'media_spend', summary: 50, projects: 30, unallocated: 20 },
      { source: 'labour', summary: 15, projects: 10, unallocated: 5 },
      { source: 'project_expenses', summary: 10, projects: 7, unallocated: 3 },
      { source: 'xero_supplier_cost', summary: 24, projects: 11, unallocated: 13 },
    ] as const
    const projectSums = {
      xero_revenue: result.projects.reduce((total, project) => total + project.xeroRevenue, 0),
      media_spend: result.projects.reduce((total, project) => total + project.mediaSpend, 0),
      labour: result.projects.reduce((total, project) => total + project.labourCost, 0),
      project_expenses: result.projects.reduce((total, project) => total + project.projectExpenseCost, 0),
      xero_supplier_cost: result.projects.reduce((total, project) => total + project.xeroSupplierCost, 0),
    }
    const summaryTotals = {
      xero_revenue: result.summary.xeroRevenue,
      media_spend: result.summary.mediaSpend,
      labour: result.summary.labourCost,
      project_expenses: result.summary.projectExpenseCost,
      xero_supplier_cost: result.summary.xeroSupplierCost,
    }
    const unallocated = {
      xero_revenue: result.unallocated.xeroRevenue,
      media_spend: result.unallocated.mediaSpend,
      labour: result.unallocated.labourCost,
      project_expenses: result.unallocated.projectExpenseCost,
      xero_supplier_cost: result.unallocated.xeroSupplierCost,
    }

    for (const expected of expectations) {
      const reconciliation = result.reconciliation.find(item => item.source === expected.source)
      expect(reconciliation).toEqual({
        source: expected.source,
        total: expected.summary,
        allocated: expected.projects,
        unallocated: expected.unallocated,
        differenceCents: 0,
      })
      expect(summaryTotals[expected.source]).toBe(expected.summary)
      expect(projectSums[expected.source]).toBe(expected.projects)
      expect(unallocated[expected.source]).toBe(expected.unallocated)
      expect(projectSums[expected.source] + unallocated[expected.source])
        .toBe(summaryTotals[expected.source])
    }
  })

  it('rejects non-integer source amounts at the cent-only calculation boundary', () => {
    expect(() => calculateClientFinancials(makeInput({
      xeroRevenue: [{ id: 'revenue-1', amountCents: 100.5, projectId: 'project-1' }],
    }))).toThrow(/integer cents/)
  })

  it('rejects a client cent aggregate that exceeds the safe integer range', () => {
    expect(() => calculateClientFinancials(makeInput({
      xeroRevenue: [
        { id: 'revenue-1', amountCents: Number.MAX_SAFE_INTEGER, projectId: null },
        { id: 'revenue-2', amountCents: 1, projectId: null },
      ],
    }))).toThrow(/xero revenue total exceeds the safe integer range/)
  })

  it('rejects a project cent aggregate that exceeds the safe integer range', () => {
    expect(() => calculateClientFinancials(makeInput({
      projects: [
        { id: 'project-1', name: 'Website', status: 'active', projectBudgetCents: null },
        { id: 'project-2', name: 'Campaign', status: 'active', projectBudgetCents: null },
      ],
      xeroRevenue: [
        { id: 'revenue-1', amountCents: Number.MAX_SAFE_INTEGER, projectId: 'project-1' },
        { id: 'revenue-2', amountCents: -1, projectId: 'project-2' },
        { id: 'revenue-3', amountCents: 1, projectId: 'project-1' },
      ],
    }))).toThrow(/project project-1 xero revenue exceeds the safe integer range/)
  })
})
