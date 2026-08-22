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
  unallocatedCents: number
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

function addCents(left: number, right: number, label: string): number {
  const total = left + right
  if (!Number.isSafeInteger(total)) throw new Error(`${label} exceeds the safe integer range`)
  return total
}

function subtractCents(left: number, right: number, label: string): number {
  return addCents(left, -right, label)
}

function sumCents<T>(items: T[], amount: (item: T) => number, label: string): number {
  return items.reduce((total, item) => addCents(total, amount(item), label), 0)
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
  label: string,
): FinancialAllocationCoverageEntry {
  const totalCents = sumCents(sources, source => source.amountCents, `${label} total`)
  const allocatedSources = sources.filter(source => source.projectId !== null && projectIds.has(source.projectId))
  const unallocatedSources = sources.filter(source => source.projectId === null || !projectIds.has(source.projectId))
  const allocatedCents = sumCents(allocatedSources, source => source.amountCents, `${label} allocated`)
  const unallocatedCents = sumCents(unallocatedSources, source => source.amountCents, `${label} unallocated`)
  return {
    allocated: dollars(allocatedCents),
    unallocated: dollars(unallocatedCents),
    allocatedItemCount: allocatedSources.length,
    totalItemCount: sources.length,
    percentage: totalCents > 0 ? Math.round((allocatedCents / totalCents) * 1000) / 10 : null,
  }
}

function reconcile({ source, totalCents, allocatedCents, unallocatedCents }: ReconciliationInput): FinancialReconciliation {
  const differenceCents = subtractCents(
    subtractCents(totalCents, allocatedCents, `${source} difference`),
    unallocatedCents,
    `${source} difference`,
  )
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
  let hasUnscopedConflict = false
  for (const warning of warnings) {
    if (warning.code !== 'possible_duplicate') continue
    if (warning.projectId && projectIds.has(warning.projectId)) conflicts.add(warning.projectId)
    else hasUnscopedConflict = true
  }

  const representedSupplierInvoices = new Set<string>()
  const supplierProjectsByInvoice = new Map<string, Set<string>>()
  for (const cost of input.xeroSupplierCosts) {
    const invoiceId = normalizeInvoiceId(cost.invoiceId)
    if (!invoiceId) continue
    representedSupplierInvoices.add(invoiceId)
    if (!cost.projectId || !projectIds.has(cost.projectId)) continue
    const projects = supplierProjectsByInvoice.get(invoiceId) ?? new Set<string>()
    projects.add(cost.projectId)
    supplierProjectsByInvoice.set(invoiceId, projects)
  }

  const manualExpenses = input.manualExpenses.filter((expense) => {
    const invoiceId = normalizeInvoiceId(expense.xeroInvoiceId)
    if (!invoiceId) return true
    if (!representedSupplierInvoices.has(invoiceId)) return true
    const supplierProjects = supplierProjectsByInvoice.get(invoiceId) ?? new Set<string>()

    if (expense.projectId && projectIds.has(expense.projectId)) {
      const otherProjects = [...supplierProjects].filter(projectId => projectId !== expense.projectId)
      if (otherProjects.length > 0) {
        conflicts.add(expense.projectId)
        for (const projectId of otherProjects) conflicts.add(projectId)
        const warning: FinancialSourceWarning = {
          code: 'possible_duplicate',
          source: 'project_expenses',
          sourceId: expense.id,
          projectId: expense.projectId,
          message: 'A linked manual expense and Xero supplier cost are allocated to different projects.',
        }
        const isAlreadyReported = warnings.some(existing => (
          existing.code === warning.code
          && existing.source === warning.source
          && existing.sourceId === warning.sourceId
          && existing.projectId === warning.projectId
        ))
        if (!isAlreadyReported) warnings.push(warning)
      }
    }
    return false
  })

  const projectTotals = new Map(input.projects.map(project => [project.id, emptyTotals()]))
  const isAllocated = (source: { projectId: string | null }): source is { projectId: string } => (
    source.projectId !== null && projectIds.has(source.projectId)
  )
  const allocated = <T extends { projectId: string | null }>(sources: T[]): T[] => sources.filter(isAllocated)
  const unallocatedSources = <T extends { projectId: string | null }>(sources: T[]): T[] => (
    sources.filter(source => !isAllocated(source))
  )

  for (const source of allocated(input.xeroRevenue)) {
    const totals = projectTotals.get(source.projectId!)!
    totals.xeroRevenueCents = addCents(
      totals.xeroRevenueCents,
      source.amountCents,
      `project ${source.projectId} xero revenue`,
    )
  }
  for (const source of allocated(input.mediaSpend)) {
    const totals = projectTotals.get(source.projectId!)!
    totals.mediaSpendCents = addCents(
      totals.mediaSpendCents,
      source.amountCents,
      `project ${source.projectId} media spend`,
    )
  }
  for (const source of allocated(input.labour)) {
    const totals = projectTotals.get(source.projectId!)!
    totals.labourCostCents = addCents(
      totals.labourCostCents,
      source.costCents,
      `project ${source.projectId} labour cost`,
    )
    totals.hours += source.hours
  }
  for (const source of allocated(manualExpenses)) {
    const totals = projectTotals.get(source.projectId!)!
    totals.projectExpenseCostCents = addCents(
      totals.projectExpenseCostCents,
      source.amountCents,
      `project ${source.projectId} expense cost`,
    )
  }
  for (const source of allocated(input.xeroSupplierCosts)) {
    const totals = projectTotals.get(source.projectId!)!
    totals.xeroSupplierCostCents = addCents(
      totals.xeroSupplierCostCents,
      source.amountCents,
      `project ${source.projectId} Xero supplier cost`,
    )
  }

  const projectRows = input.projects.map((project): ClientProjectFinancialRow => {
    const totals = projectTotals.get(project.id)!
    const agiCents = subtractCents(
      totals.xeroRevenueCents,
      totals.mediaSpendCents,
      `project ${project.id} AGI`,
    )
    const deliveryCostCents = addCents(
      addCents(
        totals.labourCostCents,
        totals.projectExpenseCostCents,
        `project ${project.id} delivery cost`,
      ),
      totals.xeroSupplierCostCents,
      `project ${project.id} delivery cost`,
    )
    const deliveryProfitCents = subtractCents(
      agiCents,
      deliveryCostCents,
      `project ${project.id} delivery profit`,
    )
    const reason = marginReason(agiCents, hasUnscopedConflict || conflicts.has(project.id))
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
    xeroRevenue: sumCents(input.xeroRevenue, source => source.amountCents, 'xero revenue total'),
    mediaSpend: sumCents(input.mediaSpend, source => source.amountCents, 'media spend total'),
    labour: sumCents(input.labour, source => source.costCents, 'labour cost total'),
    projectExpenses: sumCents(manualExpenses, source => source.amountCents, 'project expense total'),
    xeroSupplierCost: sumCents(input.xeroSupplierCosts, source => source.amountCents, 'Xero supplier cost total'),
  }
  const allProjectTotals = [...projectTotals.values()]
  const allocatedCents = {
    xeroRevenue: sumCents(allProjectTotals, totals => totals.xeroRevenueCents, 'allocated xero revenue'),
    mediaSpend: sumCents(allProjectTotals, totals => totals.mediaSpendCents, 'allocated media spend'),
    labour: sumCents(allProjectTotals, totals => totals.labourCostCents, 'allocated labour cost'),
    projectExpenses: sumCents(allProjectTotals, totals => totals.projectExpenseCostCents, 'allocated project expense'),
    xeroSupplierCost: sumCents(allProjectTotals, totals => totals.xeroSupplierCostCents, 'allocated Xero supplier cost'),
  }
  const unallocatedCents = {
    xeroRevenue: sumCents(unallocatedSources(input.xeroRevenue), source => source.amountCents, 'unallocated xero revenue'),
    mediaSpend: sumCents(unallocatedSources(input.mediaSpend), source => source.amountCents, 'unallocated media spend'),
    labour: sumCents(unallocatedSources(input.labour), source => source.costCents, 'unallocated labour cost'),
    projectExpenses: sumCents(unallocatedSources(manualExpenses), source => source.amountCents, 'unallocated project expense'),
    xeroSupplierCost: sumCents(unallocatedSources(input.xeroSupplierCosts), source => source.amountCents, 'unallocated Xero supplier cost'),
  }
  const agiCents = subtractCents(totalCents.xeroRevenue, totalCents.mediaSpend, 'client AGI')
  const deliveryCostCents = addCents(
    addCents(totalCents.labour, totalCents.projectExpenses, 'client delivery cost'),
    totalCents.xeroSupplierCost,
    'client delivery cost',
  )
  const deliveryProfitCents = subtractCents(agiCents, deliveryCostCents, 'client delivery profit')
  const reason = marginReason(agiCents, hasUnscopedConflict || conflicts.size > 0)
  const reconciliation = [
    reconcile({ source: 'xero_revenue', totalCents: totalCents.xeroRevenue, allocatedCents: allocatedCents.xeroRevenue, unallocatedCents: unallocatedCents.xeroRevenue }),
    reconcile({ source: 'media_spend', totalCents: totalCents.mediaSpend, allocatedCents: allocatedCents.mediaSpend, unallocatedCents: unallocatedCents.mediaSpend }),
    reconcile({ source: 'labour', totalCents: totalCents.labour, allocatedCents: allocatedCents.labour, unallocatedCents: unallocatedCents.labour }),
    reconcile({ source: 'project_expenses', totalCents: totalCents.projectExpenses, allocatedCents: allocatedCents.projectExpenses, unallocatedCents: unallocatedCents.projectExpenses }),
    reconcile({ source: 'xero_supplier_cost', totalCents: totalCents.xeroSupplierCost, allocatedCents: allocatedCents.xeroSupplierCost, unallocatedCents: unallocatedCents.xeroSupplierCost }),
  ]
  if (reconciliation.some(item => Math.abs(item.differenceCents) > 1)) {
    warnings.push({
      code: 'reconciliation_failed',
      source: 'reconciliation',
      message: 'One or more financial sources did not reconcile within one cent.',
    })
  }

  const xeroRevenueCoverage = coverageEntry(input.xeroRevenue, projectIds, 'xero revenue coverage')
  const mediaSpendCoverage = coverageEntry(input.mediaSpend, projectIds, 'media spend coverage')
  const xeroSupplierCostCoverage = coverageEntry(input.xeroSupplierCosts, projectIds, 'Xero supplier cost coverage')
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
    xeroRevenue: dollars(unallocatedCents.xeroRevenue),
    mediaSpend: dollars(unallocatedCents.mediaSpend),
    labourCost: dollars(unallocatedCents.labour),
    projectExpenseCost: dollars(unallocatedCents.projectExpenses),
    xeroSupplierCost: dollars(unallocatedCents.xeroSupplierCost),
    deliveryCost: dollars(
      addCents(
        addCents(
          unallocatedCents.labour,
          unallocatedCents.projectExpenses,
          'unallocated delivery cost',
        ),
        unallocatedCents.xeroSupplierCost,
        'unallocated delivery cost',
      ),
    ),
  }

  return {
    summary,
    projects: projectRows,
    unallocated,
    allocationCoverage: {
      overall: coverageEntry(allAllocatableSources, projectIds, 'overall allocation coverage'),
      xeroRevenue: xeroRevenueCoverage,
      mediaSpend: mediaSpendCoverage,
      xeroSupplierCost: xeroSupplierCostCoverage,
    },
    warnings,
    reconciliation,
  }
}
