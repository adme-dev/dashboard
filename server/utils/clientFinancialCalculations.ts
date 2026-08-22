import type {
  ClientFinancialSummary,
  ClientProjectFinancialRow,
  FinancialAllocatableSourceType,
  FinancialAllocationCoverage,
  FinancialAllocationCoverageEntry,
  FinancialMarginReason,
  FinancialReconciliation,
  FinancialSourceWarning,
  FinancialUnallocatedSummary,
} from '~~/shared/types/clientFinancials'

export interface ClientFinancialProjectInput {
  id: string
  name: string
  status: string
  projectBudgetCents: number | null
}

export interface ClientFinancialAllocatedAmountInput {
  id: string
  amountCents: number
  projectId: string | null
}

export interface ClientFinancialLabourInput {
  id: string
  costCents: number
  hours: number
  projectId: string | null
}

export interface ClientFinancialManualExpenseInput extends ClientFinancialAllocatedAmountInput {
  xeroInvoiceId?: string | null
}

export interface ClientFinancialXeroSupplierCostInput extends ClientFinancialAllocatedAmountInput {
  invoiceId: string
}

export interface ClientFinancialCalculationInput {
  projects: ClientFinancialProjectInput[]
  xeroRevenue: ClientFinancialAllocatedAmountInput[]
  mediaSpend: ClientFinancialAllocatedAmountInput[]
  labour: ClientFinancialLabourInput[]
  manualExpenses: ClientFinancialManualExpenseInput[]
  xeroSupplierCosts: ClientFinancialXeroSupplierCostInput[]
  warnings?: FinancialSourceWarning[]
}

export interface ClientFinancialCalculationResult {
  summary: ClientFinancialSummary
  projects: ClientProjectFinancialRow[]
  unallocated: FinancialUnallocatedSummary
  allocationCoverage: FinancialAllocationCoverage
  warnings: FinancialSourceWarning[]
  reconciliation: FinancialReconciliation[]
}

interface CentTotals {
  xeroRevenueCents: number
  mediaSpendCents: number
  labourCostCents: number
  projectExpenseCostCents: number
  xeroSupplierCostCents: number
  hours: number
}

interface ReconciliationInput {
  source: FinancialReconciliation['source']
  totalCents: number
  allocatedCents: number
}

const DAY_MS = 24 * 60 * 60 * 1000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function parseIsoDate(value: unknown, field: string): { iso: string, time: number, year: number, month: number, day: number } {
  if (typeof value !== 'string') {
    throw new Error(`${field} must use YYYY-MM-DD format`)
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    throw new Error(`${field} must use YYYY-MM-DD format`)
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const time = Date.UTC(year, month - 1, day)
  const parsed = new Date(time)
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    throw new Error(`${field} must use YYYY-MM-DD format and be a valid date`)
  }

  return { iso: value, time, year, month, day }
}

function dateLabel(
  start: ReturnType<typeof parseIsoDate>,
  end: ReturnType<typeof parseIsoDate>,
): string {
  const startMonth = MONTHS[start.month - 1]
  const endMonth = MONTHS[end.month - 1]
  if (start.iso === end.iso) return `${start.day} ${startMonth} ${start.year}`
  if (start.year === end.year && start.month === end.month) {
    return `${start.day}–${end.day} ${endMonth} ${end.year}`
  }
  if (start.year === end.year) {
    return `${start.day} ${startMonth}–${end.day} ${endMonth} ${end.year}`
  }
  return `${start.day} ${startMonth} ${start.year}–${end.day} ${endMonth} ${end.year}`
}

export function parseClientFinancialRange(
  from: unknown,
  to: unknown,
  now: Date = new Date(),
): { from: string, to: string, label: string } {
  if (Number.isNaN(now.getTime())) throw new Error('now must be a valid date')

  const defaultTo = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
  ].join('-')
  const defaultFrom = `${defaultTo.slice(0, 8)}01`
  const start = parseIsoDate(from ?? defaultFrom, 'from')
  const end = parseIsoDate(to ?? defaultTo, 'to')

  if (start.time > end.time) throw new Error('from must be before or equal to to')
  if ((end.time - start.time) / DAY_MS >= 366) {
    throw new Error('financial ranges cannot exceed 366 days')
  }

  return { from: start.iso, to: end.iso, label: dateLabel(start, end) }
}

function assertIntegerCents(value: number, field: string): void {
  if (!Number.isSafeInteger(value)) throw new Error(`${field} must be represented as integer cents`)
}

function assertCalculationInput(input: ClientFinancialCalculationInput): void {
  for (const project of input.projects) {
    if (project.projectBudgetCents !== null) {
      assertIntegerCents(project.projectBudgetCents, `project ${project.id} budget`)
    }
  }
  for (const source of input.xeroRevenue) assertIntegerCents(source.amountCents, `revenue ${source.id}`)
  for (const source of input.mediaSpend) assertIntegerCents(source.amountCents, `media ${source.id}`)
  for (const source of input.labour) {
    assertIntegerCents(source.costCents, `labour ${source.id}`)
    if (!Number.isFinite(source.hours)) throw new Error(`labour ${source.id} hours must be finite`)
  }
  for (const source of input.manualExpenses) assertIntegerCents(source.amountCents, `expense ${source.id}`)
  for (const source of input.xeroSupplierCosts) assertIntegerCents(source.amountCents, `Xero cost ${source.id}`)
}

function dollars(cents: number): number {
  return cents / 100
}

function normalizeInvoiceId(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLocaleLowerCase('en-AU')
  return normalized || null
}

function sum<T>(items: T[], amount: (item: T) => number): number {
  return items.reduce((total, item) => total + amount(item), 0)
}

function marginReason(agiCents: number, hasConflict: boolean): FinancialMarginReason {
  if (hasConflict) return 'source_conflict'
  if (agiCents === 0) return 'no_agi'
  if (agiCents < 0) return 'negative_agi'
  return null
}

function marginPercentage(
  deliveryProfitCents: number,
  agiCents: number,
  reason: FinancialMarginReason,
): number | null {
  if (reason !== null) return null
  return Math.round((deliveryProfitCents / agiCents) * 10_000) / 100
}

function coverageEntry<T extends { amountCents: number, projectId: string | null }>(
  sources: T[],
  projectIds: Set<string>,
): FinancialAllocationCoverageEntry {
  const totalCents = sum(sources, source => source.amountCents)
  const allocatedSources = sources.filter(source => source.projectId !== null && projectIds.has(source.projectId))
  const allocatedCents = sum(allocatedSources, source => source.amountCents)
  const unallocatedCents = totalCents - allocatedCents
  return {
    allocated: dollars(allocatedCents),
    unallocated: dollars(unallocatedCents),
    allocatedItemCount: allocatedSources.length,
    totalItemCount: sources.length,
    percentage: totalCents > 0 ? Math.round((allocatedCents / totalCents) * 1000) / 10 : null,
  }
}

function reconcile({ source, totalCents, allocatedCents }: ReconciliationInput): FinancialReconciliation {
  const unallocatedCents = totalCents - allocatedCents
  const differenceCents = totalCents - allocatedCents - unallocatedCents
  return {
    source,
    total: dollars(totalCents),
    allocated: dollars(allocatedCents),
    unallocated: dollars(unallocatedCents),
    differenceCents,
  }
}

function emptyTotals(): CentTotals {
  return {
    xeroRevenueCents: 0,
    mediaSpendCents: 0,
    labourCostCents: 0,
    projectExpenseCostCents: 0,
    xeroSupplierCostCents: 0,
    hours: 0,
  }
}

export function calculateClientFinancials(
  input: ClientFinancialCalculationInput,
): ClientFinancialCalculationResult {
  assertCalculationInput(input)
  const projectIds = new Set(input.projects.map(project => project.id))
  const warnings = [...(input.warnings ?? [])]
  const conflicts = new Set<string>()

  const supplierProjectsByInvoice = new Map<string, Set<string>>()
  for (const cost of input.xeroSupplierCosts) {
    const invoiceId = normalizeInvoiceId(cost.invoiceId)
    if (!invoiceId || !cost.projectId || !projectIds.has(cost.projectId)) continue
    const projects = supplierProjectsByInvoice.get(invoiceId) ?? new Set<string>()
    projects.add(cost.projectId)
    supplierProjectsByInvoice.set(invoiceId, projects)
  }

  const manualExpenses = input.manualExpenses.filter((expense) => {
    const invoiceId = normalizeInvoiceId(expense.xeroInvoiceId)
    if (!invoiceId) return true
    const supplierProjects = supplierProjectsByInvoice.get(invoiceId)
    if (!supplierProjects?.size) return true

    if (expense.projectId && projectIds.has(expense.projectId)) {
      const otherProjects = [...supplierProjects].filter(projectId => projectId !== expense.projectId)
      if (otherProjects.length > 0) {
        conflicts.add(expense.projectId)
        for (const projectId of otherProjects) conflicts.add(projectId)
        warnings.push({
          code: 'possible_duplicate',
          source: 'project_expenses',
          sourceId: expense.id,
          projectId: expense.projectId,
          message: 'A linked manual expense and Xero supplier cost are allocated to different projects.',
        })
      }
    }
    return false
  })

  const projectTotals = new Map(input.projects.map(project => [project.id, emptyTotals()]))
  const allocated = <T extends { projectId: string | null }>(sources: T[]): T[] => (
    sources.filter(source => source.projectId !== null && projectIds.has(source.projectId))
  )

  for (const source of allocated(input.xeroRevenue)) {
    projectTotals.get(source.projectId!)!.xeroRevenueCents += source.amountCents
  }
  for (const source of allocated(input.mediaSpend)) {
    projectTotals.get(source.projectId!)!.mediaSpendCents += source.amountCents
  }
  for (const source of allocated(input.labour)) {
    const totals = projectTotals.get(source.projectId!)!
    totals.labourCostCents += source.costCents
    totals.hours += source.hours
  }
  for (const source of allocated(manualExpenses)) {
    projectTotals.get(source.projectId!)!.projectExpenseCostCents += source.amountCents
  }
  for (const source of allocated(input.xeroSupplierCosts)) {
    projectTotals.get(source.projectId!)!.xeroSupplierCostCents += source.amountCents
  }

  const projectRows = input.projects.map((project): ClientProjectFinancialRow => {
    const totals = projectTotals.get(project.id)!
    const agiCents = totals.xeroRevenueCents - totals.mediaSpendCents
    const deliveryCostCents = totals.labourCostCents
      + totals.projectExpenseCostCents
      + totals.xeroSupplierCostCents
    const deliveryProfitCents = agiCents - deliveryCostCents
    const reason = marginReason(agiCents, conflicts.has(project.id))
    const sourceTypes: FinancialAllocatableSourceType[] = []
    let mappedSourceCount = 0
    const mappedRevenue = input.xeroRevenue.filter(source => source.projectId === project.id).length
    const mappedMedia = input.mediaSpend.filter(source => source.projectId === project.id).length
    const mappedCosts = input.xeroSupplierCosts.filter(source => source.projectId === project.id).length
    if (mappedRevenue > 0) sourceTypes.push('xero_revenue')
    if (mappedMedia > 0) sourceTypes.push('media_spend')
    if (mappedCosts > 0) sourceTypes.push('xero_cost')
    mappedSourceCount += mappedRevenue + mappedMedia + mappedCosts

    return {
      projectId: project.id,
      projectName: project.name,
      status: project.status,
      projectBudget: project.projectBudgetCents === null ? null : dollars(project.projectBudgetCents),
      xeroRevenue: dollars(totals.xeroRevenueCents),
      mediaSpend: dollars(totals.mediaSpendCents),
      agi: dollars(agiCents),
      labourCost: dollars(totals.labourCostCents),
      projectExpenseCost: dollars(totals.projectExpenseCostCents),
      xeroSupplierCost: dollars(totals.xeroSupplierCostCents),
      deliveryCost: dollars(deliveryCostCents),
      deliveryProfit: dollars(deliveryProfitCents),
      deliveryMarginPct: marginPercentage(deliveryProfitCents, agiCents, reason),
      marginReason: reason,
      hours: totals.hours,
      coverage: { mappedSourceCount, sourceTypes },
    }
  })

  const totalCents = {
    xeroRevenue: sum(input.xeroRevenue, source => source.amountCents),
    mediaSpend: sum(input.mediaSpend, source => source.amountCents),
    labour: sum(input.labour, source => source.costCents),
    projectExpenses: sum(manualExpenses, source => source.amountCents),
    xeroSupplierCost: sum(input.xeroSupplierCosts, source => source.amountCents),
  }
  const allocatedCents = {
    xeroRevenue: sum(allocated(input.xeroRevenue), source => source.amountCents),
    mediaSpend: sum(allocated(input.mediaSpend), source => source.amountCents),
    labour: sum(allocated(input.labour), source => source.costCents),
    projectExpenses: sum(allocated(manualExpenses), source => source.amountCents),
    xeroSupplierCost: sum(allocated(input.xeroSupplierCosts), source => source.amountCents),
  }
  const agiCents = totalCents.xeroRevenue - totalCents.mediaSpend
  const deliveryCostCents = totalCents.labour + totalCents.projectExpenses + totalCents.xeroSupplierCost
  const deliveryProfitCents = agiCents - deliveryCostCents
  const reason = marginReason(agiCents, conflicts.size > 0)
  const reconciliation = [
    reconcile({ source: 'xero_revenue', totalCents: totalCents.xeroRevenue, allocatedCents: allocatedCents.xeroRevenue }),
    reconcile({ source: 'media_spend', totalCents: totalCents.mediaSpend, allocatedCents: allocatedCents.mediaSpend }),
    reconcile({ source: 'labour', totalCents: totalCents.labour, allocatedCents: allocatedCents.labour }),
    reconcile({ source: 'project_expenses', totalCents: totalCents.projectExpenses, allocatedCents: allocatedCents.projectExpenses }),
    reconcile({ source: 'xero_supplier_cost', totalCents: totalCents.xeroSupplierCost, allocatedCents: allocatedCents.xeroSupplierCost }),
  ]
  if (reconciliation.some(item => Math.abs(item.differenceCents) > 1)) {
    warnings.push({
      code: 'reconciliation_failed',
      source: 'reconciliation',
      message: 'One or more financial sources did not reconcile within one cent.',
    })
  }

  const xeroRevenueCoverage = coverageEntry(input.xeroRevenue, projectIds)
  const mediaSpendCoverage = coverageEntry(input.mediaSpend, projectIds)
  const xeroSupplierCostCoverage = coverageEntry(input.xeroSupplierCosts, projectIds)
  const allAllocatableSources = [
    ...input.xeroRevenue,
    ...input.mediaSpend,
    ...input.xeroSupplierCosts,
  ]

  const summary: ClientFinancialSummary = {
    xeroRevenue: dollars(totalCents.xeroRevenue),
    mediaSpend: dollars(totalCents.mediaSpend),
    agi: dollars(agiCents),
    labourCost: dollars(totalCents.labour),
    projectExpenseCost: dollars(totalCents.projectExpenses),
    xeroSupplierCost: dollars(totalCents.xeroSupplierCost),
    deliveryCost: dollars(deliveryCostCents),
    deliveryProfit: dollars(deliveryProfitCents),
    deliveryMarginPct: marginPercentage(deliveryProfitCents, agiCents, reason),
    marginReason: reason,
    hours: sum(input.labour, source => source.hours),
    activeProjects: input.projects.filter(project => project.status.toLocaleLowerCase('en-AU') === 'active').length,
  }

  const unallocated: FinancialUnallocatedSummary = {
    xeroRevenue: dollars(totalCents.xeroRevenue - allocatedCents.xeroRevenue),
    mediaSpend: dollars(totalCents.mediaSpend - allocatedCents.mediaSpend),
    labourCost: dollars(totalCents.labour - allocatedCents.labour),
    projectExpenseCost: dollars(totalCents.projectExpenses - allocatedCents.projectExpenses),
    xeroSupplierCost: dollars(totalCents.xeroSupplierCost - allocatedCents.xeroSupplierCost),
    deliveryCost: dollars(
      totalCents.labour - allocatedCents.labour
      + totalCents.projectExpenses - allocatedCents.projectExpenses
      + totalCents.xeroSupplierCost - allocatedCents.xeroSupplierCost,
    ),
  }

  return {
    summary,
    projects: projectRows,
    unallocated,
    allocationCoverage: {
      overall: coverageEntry(allAllocatableSources, projectIds),
      xeroRevenue: xeroRevenueCoverage,
      mediaSpend: mediaSpendCoverage,
      xeroSupplierCost: xeroSupplierCostCoverage,
    },
    warnings,
    reconciliation,
  }
}
