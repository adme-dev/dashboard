import type {
  ClientFinancialMediaCampaign,
  ClientFinancialTimeEntry,
  ClientFinancialsResponse,
  ClientXeroInvoiceRow,
  FinancialAllocationSource,
  FinancialDataSource,
  FinancialSourceFreshness,
  FinancialSourceWarning,
  FinancialTrackingOption,
} from '~~/shared/types/clientFinancials'
import {
  calculateClientFinancials,
  parseClientFinancialRange,
  type ClientFinancialCalculationInput,
} from '~~/server/utils/clientFinancialCalculations'
import {
  loadClientFinancialDataset,
  type ClientFinancialDatabaseNumber,
  type ClientFinancialDatabaseTimestamp,
  type ClientFinancialRawXeroAllocation,
  type ClientFinancialRawXeroLine,
} from '~~/server/utils/clientFinancialRepository'

export interface ClientFinancialServiceDeps {
  loadDataset: typeof loadClientFinancialDataset
  now: () => Date
}

interface NormalizedXeroLine extends ClientFinancialRawXeroLine {
  invoiceDateIso: string
  invoiceTypeNormalized: string
  lineExGstCentsNormalized: number
  sourceFingerprint: string
}

interface AllocationState {
  allocation: ClientFinancialRawXeroAllocation | null
  isStale: boolean
  projectIdForCalculation: string | null
}

interface NormalizedMediaSpend {
  id: string
  projectId: string | null
  projectName: string | null
  platform: string
  campaignName: string
  period: string
  budgetCents: number | null
  amountCents: number
  sourceState: ClientFinancialMediaCampaign['sourceState']
  pacingStatus: string | null
  isStale: boolean
}

const defaultDeps: ClientFinancialServiceDeps = {
  loadDataset: loadClientFinancialDataset,
  now: () => new Date(),
}

function databaseNumber(value: ClientFinancialDatabaseNumber, label: string): number {
  const normalized = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(normalized)) throw new Error(`${label} must be a finite database number`)
  return normalized
}

function databaseCents(value: ClientFinancialDatabaseNumber, label: string): number {
  const normalized = databaseNumber(value, label)
  if (!Number.isSafeInteger(normalized)) throw new Error(`${label} must be integer cents`)
  return normalized
}

function dollarsToCents(value: ClientFinancialDatabaseNumber, label: string): number {
  const cents = Math.round(databaseNumber(value, label) * 100)
  if (!Number.isSafeInteger(cents)) throw new Error(`${label} exceeds the safe integer range`)
  return cents
}

function centsToDollars(cents: number): number {
  return cents / 100
}

function isoDate(value: string | Date, label: string): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error(`${label} must be a valid date`)
    return value.toISOString().slice(0, 10)
  }
  const normalized = String(value).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new Error(`${label} must use YYYY-MM-DD format`)
  return normalized
}

function isoTimestamp(value: ClientFinancialDatabaseTimestamp): string | null {
  if (value === null) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function normalizedText(value: string | null | undefined): string {
  return value?.trim().toLocaleLowerCase('en-AU') ?? ''
}

async function calculateSourceFingerprint(
  tenantId: string | null,
  line: ClientFinancialRawXeroLine,
  invoiceDateIso: string,
  lineExGstCents: number,
): Promise<string> {
  const source = [
    tenantId ?? '',
    line.lineItemId,
    line.invoiceId,
    line.invoiceType,
    invoiceDateIso,
    line.accountCode ?? '',
    lineExGstCents,
    line.description ?? '',
  ].join('|')
  const bytes = new TextEncoder().encode(source)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

function pushWarning(warnings: FinancialSourceWarning[], warning: FinancialSourceWarning): void {
  const duplicate = warnings.some(existing => (
    existing.code === warning.code
    && existing.source === warning.source
    && existing.sourceId === warning.sourceId
    && existing.projectId === warning.projectId
  ))
  if (!duplicate) warnings.push(warning)
}

function monthBounds(period: string): { first: string, last: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(period)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (month < 1 || month > 12) return null
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return {
    first: `${match[1]}-${match[2]}-01`,
    last: `${match[1]}-${match[2]}-${String(lastDay).padStart(2, '0')}`,
  }
}

function todayIso(now: Date): string {
  return now.toISOString().slice(0, 10)
}

function canUseMonthlyFallback(
  period: string,
  from: string,
  to: string,
  now: Date,
): boolean {
  const bounds = monthBounds(period)
  if (!bounds) return false
  const today = todayIso(now)
  const currentMonth = today.slice(0, 7)
  if (period < currentMonth) return from <= bounds.first && to >= bounds.last
  if (period === currentMonth) return from <= bounds.first && to === today
  return false
}

function freshnessEntry(
  source: FinancialDataSource,
  updatedAt: ClientFinancialDatabaseTimestamp,
  status: FinancialSourceFreshness['status'],
  fallbackLabel: string,
): FinancialSourceFreshness {
  const timestamp = isoTimestamp(updatedAt)
  return {
    source,
    status,
    updatedAt: timestamp,
    label: timestamp ? `Updated ${timestamp}` : fallbackLabel,
  }
}

function normalizeTracking(
  dataset: Awaited<ReturnType<typeof loadClientFinancialDataset>>,
  tenantId: string | null,
): {
  selected: FinancialTrackingOption | null
  options: FinancialTrackingOption[]
} {
  const options = dataset.trackingOptions
    .filter(option => option.tenantId === tenantId)
    .map(option => ({
      id: option.id,
      name: option.name,
      isActive: option.isActive,
    }))
  if (!dataset.trackingMapping) return { selected: null, options }
  const matchingOption = options.find(option => (
    (dataset.trackingMapping!.trackingOptionId !== null
      && option.id === dataset.trackingMapping!.trackingOptionId)
    || normalizedText(option.name) === normalizedText(dataset.trackingMapping!.trackingOptionName)
  ))
  return {
    selected: {
      id: dataset.trackingMapping.trackingOptionId,
      name: dataset.trackingMapping.trackingOptionName,
      isActive: matchingOption?.isActive ?? false,
    },
    options,
  }
}

export async function getClientFinancials(
  input: {
    tenantId: string | null
    clientId: string
    from?: unknown
    to?: unknown
    includeSources: boolean
    canAllocate: boolean
  },
  deps: ClientFinancialServiceDeps = defaultDeps,
): Promise<ClientFinancialsResponse> {
  const now = deps.now()
  const period = parseClientFinancialRange(input.from, input.to, now)
  const dataset = await deps.loadDataset({
    tenantId: input.tenantId,
    clientId: input.clientId,
    from: period.from,
    to: period.to,
    includeSources: input.includeSources,
  })
  const warnings: FinancialSourceWarning[] = []
  const sourceFailures = dataset.sourceFailures ?? []
  const hasDataFailure = (source: FinancialDataSource): boolean => sourceFailures.some(failure => (
    failure.source === source && failure.kind === 'data'
  ))
  const hasPartialFailure = (source: FinancialDataSource): boolean => sourceFailures.some(failure => (
    failure.source === source && failure.kind === 'partial'
  ))
  const hasFreshnessFailure = (source: FinancialDataSource): boolean => sourceFailures.some(failure => (
    failure.source === source && failure.kind === 'freshness'
  ))
  for (const failure of sourceFailures.filter(item => item.kind !== 'freshness')) {
    pushWarning(warnings, {
      code: 'source_unavailable',
      source: failure.source,
      message: failure.message,
    })
  }
  const projectIds = new Set(dataset.projects.map(project => project.id))
  const projectNames = new Map(dataset.projects.map(project => [project.id, project.name]))

  if (!dataset.client.xeroContactId) {
    pushWarning(warnings, {
      code: 'xero_not_linked',
      source: 'xero_invoices',
      message: 'This client is not linked to a Xero contact.',
    })
  }

  const normalizedXeroLines: NormalizedXeroLine[] = await Promise.all(
    dataset.xeroLines.map(async (line) => {
      const invoiceDateIso = isoDate(line.invoiceDate, `Xero line ${line.lineItemId} date`)
      const lineExGstCentsNormalized = databaseCents(
        line.lineExGstCents,
        `Xero line ${line.lineItemId} amount`,
      )
      return {
        ...line,
        invoiceDateIso,
        invoiceTypeNormalized: line.invoiceType.toUpperCase(),
        lineExGstCentsNormalized,
        sourceFingerprint: await calculateSourceFingerprint(
          input.tenantId,
          line,
          invoiceDateIso,
          lineExGstCentsNormalized,
        ),
      }
    }),
  )
  const currentXeroLines = new Map(normalizedXeroLines.map(line => [line.lineItemId, line]))
  const allocations = new Map(dataset.savedXeroAllocations.map(allocation => [allocation.lineItemId, allocation]))
  for (const line of normalizedXeroLines) {
    if (
      allocations.has(line.lineItemId)
      || !line.allocationProjectId
      || !line.allocationFingerprint
    ) continue
    allocations.set(line.lineItemId, {
      lineItemId: line.lineItemId,
      invoiceId: line.invoiceId,
      projectId: line.allocationProjectId,
      sourceFingerprint: line.allocationFingerprint,
      sourceInvoiceType: line.invoiceType,
      sourceInvoiceDate: line.invoiceDateIso,
      sourceAccountCode: line.accountCode,
      sourceDescription: line.description,
      sourceExGstCents: line.lineExGstCentsNormalized,
    })
  }
  const allocationStates = new Map<string, AllocationState>()
  for (const line of normalizedXeroLines) {
    const allocation = allocations.get(line.lineItemId) ?? null
    const isStale = Boolean(allocation && (
      allocation.sourceFingerprint !== line.sourceFingerprint
      || !projectIds.has(allocation.projectId)
    ))
    allocationStates.set(line.lineItemId, {
      allocation,
      isStale,
      projectIdForCalculation: allocation && !isStale ? allocation.projectId : null,
    })
  }
  for (const allocation of allocations.values()) {
    const currentLine = currentXeroLines.get(allocation.lineItemId)
    const state = currentLine
      ? allocationStates.get(allocation.lineItemId)!
      : { allocation, isStale: true, projectIdForCalculation: null }
    if (!state.isStale) continue
    const source: FinancialDataSource = allocation.sourceInvoiceType.toUpperCase() === 'ACCREC'
      ? 'xero_revenue'
      : 'xero_supplier_cost'
    pushWarning(warnings, {
      code: 'stale_allocation',
      source,
      sourceId: allocation.lineItemId,
      projectId: allocation.projectId,
      message: currentLine
        ? 'The allocated Xero line changed after it was assigned and has been excluded from its project.'
        : 'The allocated Xero line is no longer present in the current cache and has been excluded.',
    })
    if (!currentLine) allocationStates.set(allocation.lineItemId, state)
  }

  const xeroContactId = dataset.client.xeroContactId
  const xeroAvailable = input.tenantId !== null && xeroContactId !== null
  const revenueLines = normalizedXeroLines.filter(line => (
    line.invoiceTypeNormalized === 'ACCREC'
    && xeroAvailable
    && line.contactId === xeroContactId
  ))
  const trackingName = dataset.trackingMapping?.trackingOptionName ?? null
  const supplierLines = normalizedXeroLines.filter(line => (
    line.invoiceTypeNormalized === 'ACCPAY'
    && trackingName !== null
    && normalizedText(line.trackingClient) === normalizedText(trackingName)
  ))
  const deliverySupplierLines = supplierLines.filter(line => line.accountType?.toUpperCase() === 'DIRECTCOSTS')

  if (input.tenantId && trackingName === null && !hasDataFailure('xero_supplier_cost')) {
    pushWarning(warnings, {
      code: 'source_unavailable',
      source: 'xero_supplier_cost',
      message: 'Supplier costs are unavailable until this client is linked to its Xero Client tracking option.',
    })
  }

  const hasEligibleAccrecHeader = dataset.invoices.some(invoice => (
    invoice.type.toUpperCase() === 'ACCREC'
    && !['DRAFT', 'VOIDED', 'DELETED'].includes(invoice.status.toUpperCase())
  ))
  if (xeroContactId && hasEligibleAccrecHeader && revenueLines.length === 0) {
    pushWarning(warnings, {
      code: 'xero_lines_unavailable',
      source: 'xero_revenue',
      message: 'Xero invoice headers are available, but invoice line details are unavailable for this period.',
    })
  }
  const xeroLinesUnavailable = warnings.some(warning => warning.code === 'xero_lines_unavailable')
  const revenueAvailable = xeroAvailable
    && !xeroLinesUnavailable
    && !hasDataFailure('xero_revenue')
  const supplierCostAvailable = input.tenantId !== null
    && trackingName !== null
    && !hasDataFailure('xero_supplier_cost')

  const normalizedMedia: NormalizedMediaSpend[] = dataset.mediaSpend.map((spend) => {
    let amountCents = 0
    let sourceState: ClientFinancialMediaCampaign['sourceState'] = 'available'
    if (spend.dailyRowCount > 0) {
      amountCents = dollarsToCents(spend.dailySpend ?? 0, `Media spend ${spend.id} daily amount`)
    } else if (canUseMonthlyFallback(spend.period, period.from, period.to, now)) {
      amountCents = dollarsToCents(spend.actualSpend, `Media spend ${spend.id} monthly amount`)
    } else {
      sourceState = 'partial'
      pushWarning(warnings, {
        code: 'media_partial',
        source: 'media_spend',
        sourceId: spend.id,
        projectId: spend.projectId ?? undefined,
        message: 'Daily spend is unavailable for this partial range, so the monthly total was excluded.',
      })
    }
    const isStale = spend.projectId !== null && !projectIds.has(spend.projectId)
    if (isStale) {
      pushWarning(warnings, {
        code: 'stale_allocation',
        source: 'media_spend',
        sourceId: spend.id,
        projectId: spend.projectId ?? undefined,
        message: 'The media campaign is assigned to a project outside this client and is treated as unallocated.',
      })
    }
    return {
      id: spend.id,
      projectId: isStale ? null : spend.projectId,
      projectName: spend.projectId ? projectNames.get(spend.projectId) ?? null : null,
      platform: spend.platform,
      campaignName: spend.campaignName,
      period: spend.period,
      budgetCents: spend.budgetAllocated === null
        ? null
        : dollarsToCents(spend.budgetAllocated, `Media spend ${spend.id} budget`),
      amountCents,
      sourceState,
      pacingStatus: spend.pacingStatus ?? null,
      isStale,
    }
  })
  const hasManualMediaRow = dataset.mediaSpend.some(spend => spend.connectionId === null)
  const mediaConnected = dataset.activeMediaConnection.exists || hasManualMediaRow
  if (!mediaConnected) {
    pushWarning(warnings, {
      code: 'media_not_connected',
      source: 'media_spend',
      message: 'No active media account or manual media row is connected to this client.',
    })
  }
  const mediaIsPartial = warnings.some(warning => warning.code === 'media_partial')
  const mediaAvailable = mediaConnected
    && !mediaIsPartial
    && !hasDataFailure('media_spend')

  const normalizedTimeEntries = dataset.timeEntries.map((entry) => {
    const hours = databaseNumber(entry.hours, `Time entry ${entry.id} hours`)
    const hourlyRateCents = dollarsToCents(entry.hourlyRate, `Time entry ${entry.id} hourly rate`)
    const costCents = Math.round(hours * hourlyRateCents)
    if (!Number.isSafeInteger(costCents)) throw new Error(`Time entry ${entry.id} labour cost exceeds the safe integer range`)
    return {
      raw: entry,
      hours,
      hourlyRateCents,
      costCents,
      date: isoDate(entry.date, `Time entry ${entry.id} date`),
    }
  })
  const labour: ClientFinancialCalculationInput['labour'] = dataset.timeSummaries.map(summary => ({
    id: `time-summary:${summary.projectId}`,
    projectId: summary.projectId,
    hours: databaseNumber(summary.hours, `Project ${summary.projectId} hours`),
    costCents: dollarsToCents(summary.labourCost, `Project ${summary.projectId} labour cost`),
  }))
  const totalTimeEntries = Number.isSafeInteger(dataset.totalTimeEntries) && dataset.totalTimeEntries >= 0
    ? dataset.totalTimeEntries
    : 0
  const displayedTimeEntries = normalizedTimeEntries.slice(0, 500)
  const activityTruncated = totalTimeEntries > displayedTimeEntries.length || normalizedTimeEntries.length > 500
  if (activityTruncated) {
    pushWarning(warnings, {
      code: 'activity_truncated',
      source: 'activity',
      message: 'Time-entry activity is limited to the 500 most recent rows.',
    })
  }

  const manualExpenses: ClientFinancialCalculationInput['manualExpenses'] = dataset.projectExpenses.map(expense => ({
    id: expense.id,
    projectId: expense.projectId,
    amountCents: dollarsToCents(expense.amount, `Project expense ${expense.id} amount`),
    xeroInvoiceId: expense.xeroInvoiceId,
  }))
  const projects: ClientFinancialCalculationInput['projects'] = dataset.projects.map(project => ({
    id: project.id,
    name: project.name,
    status: project.status,
    projectBudgetCents: project.budgetAmount === null
      ? null
      : dollarsToCents(project.budgetAmount, `Project ${project.id} budget`),
  }))
  const calculation = calculateClientFinancials({
    projects,
    xeroRevenue: revenueLines.map(line => ({
      id: line.lineItemId,
      amountCents: line.lineExGstCentsNormalized,
      projectId: allocationStates.get(line.lineItemId)?.projectIdForCalculation ?? null,
    })),
    mediaSpend: normalizedMedia.map(spend => ({
      id: spend.id,
      amountCents: spend.amountCents,
      projectId: spend.projectId,
    })),
    labour,
    manualExpenses,
    xeroSupplierCosts: deliverySupplierLines.map(line => ({
      id: line.lineItemId,
      invoiceId: line.invoiceId,
      amountCents: line.lineExGstCentsNormalized,
      projectId: allocationStates.get(line.lineItemId)?.projectIdForCalculation ?? null,
    })),
    warnings,
  })
  const labourAvailable = !hasDataFailure('time_entries')
  const projectExpensesAvailable = !hasDataFailure('project_expenses')
  const agiAvailable = revenueAvailable && mediaAvailable
  const deliveryCostAvailable = labourAvailable && projectExpensesAvailable && supplierCostAvailable
  const profitabilityAvailable = agiAvailable && deliveryCostAvailable
  const summary = {
    ...calculation.summary,
    agi: agiAvailable ? calculation.summary.agi : null,
    xeroSupplierCost: supplierCostAvailable ? calculation.summary.xeroSupplierCost : null,
    deliveryCost: deliveryCostAvailable ? calculation.summary.deliveryCost : null,
    deliveryProfit: profitabilityAvailable ? calculation.summary.deliveryProfit : null,
    deliveryMarginPct: profitabilityAvailable ? calculation.summary.deliveryMarginPct : null,
    marginReason: profitabilityAvailable ? calculation.summary.marginReason : 'source_unavailable' as const,
  }
  const staleSourcesByProject = new Map<string, Set<FinancialDataSource>>()
  for (const warning of calculation.warnings) {
    if (warning.code !== 'stale_allocation' || !warning.projectId || !projectIds.has(warning.projectId)) continue
    const sources = staleSourcesByProject.get(warning.projectId) ?? new Set<FinancialDataSource>()
    sources.add(warning.source)
    staleSourcesByProject.set(warning.projectId, sources)
  }
  const projectFinancials = calculation.projects.map((project) => {
    const staleSources = staleSourcesByProject.get(project.projectId)
    const projectAgiAvailable = agiAvailable
      && !staleSources?.has('xero_revenue')
      && !staleSources?.has('media_spend')
    const projectDeliveryCostAvailable = deliveryCostAvailable
      && !staleSources?.has('xero_supplier_cost')
    const projectProfitabilityAvailable = projectAgiAvailable && projectDeliveryCostAvailable
    return {
      ...project,
      agi: projectAgiAvailable ? project.agi : null,
      xeroSupplierCost: projectDeliveryCostAvailable ? project.xeroSupplierCost : null,
      deliveryCost: projectDeliveryCostAvailable ? project.deliveryCost : null,
      deliveryProfit: projectProfitabilityAvailable ? project.deliveryProfit : null,
      deliveryMarginPct: projectProfitabilityAvailable ? project.deliveryMarginPct : null,
      marginReason: projectProfitabilityAvailable ? project.marginReason : 'source_unavailable' as const,
    }
  })

  const invoices: ClientXeroInvoiceRow[] = dataset.invoices
    .filter(invoice => ['ACCREC', 'ACCPAY'].includes(invoice.type.toUpperCase()))
    .map(invoice => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber || invoice.id,
      type: invoice.type.toUpperCase() as ClientXeroInvoiceRow['type'],
      status: invoice.status,
      date: isoDate(invoice.date, `Invoice ${invoice.id} date`),
      dueDate: invoice.dueDate === null ? null : isoDate(invoice.dueDate, `Invoice ${invoice.id} due date`),
      total: centsToDollars(databaseCents(invoice.totalCents, `Invoice ${invoice.id} total`)),
      amountPaid: centsToDollars(databaseCents(invoice.amountPaidCents, `Invoice ${invoice.id} paid amount`)),
      amountDue: centsToDollars(databaseCents(invoice.amountDueCents, `Invoice ${invoice.id} due amount`)),
      currency: invoice.currencyCode || 'AUD',
    }))
  const timeEntries: ClientFinancialTimeEntry[] = displayedTimeEntries.map(entry => ({
    id: entry.raw.id,
    projectId: entry.raw.projectId,
    projectName: entry.raw.projectName,
    date: entry.date,
    userName: entry.raw.userName,
    description: entry.raw.description,
    hours: entry.hours,
    hourlyRate: centsToDollars(entry.hourlyRateCents),
    labourCost: centsToDollars(entry.costCents),
  }))
  const mediaCampaigns: ClientFinancialMediaCampaign[] = normalizedMedia.map(spend => ({
    id: spend.id,
    projectId: spend.projectId,
    projectName: spend.projectName,
    campaignName: spend.campaignName,
    platform: spend.platform,
    budget: spend.budgetCents === null ? null : centsToDollars(spend.budgetCents),
    actualSpend: centsToDollars(spend.amountCents),
    pacingStatus: spend.pacingStatus,
    sourceState: mediaConnected ? spend.sourceState : 'not_connected',
  }))

  const freshness: FinancialSourceFreshness[] = [
    freshnessEntry(
      'xero_invoices',
      dataset.freshness.xeroInvoices,
      !xeroAvailable || hasDataFailure('xero_invoices')
        ? 'unavailable'
        : hasFreshnessFailure('xero_invoices') ? 'stale' : 'fresh',
      !xeroAvailable || hasDataFailure('xero_invoices')
        ? 'Xero invoice source unavailable'
        : hasFreshnessFailure('xero_invoices') ? 'Freshness metadata unavailable' : 'No Xero invoices in this period',
    ),
    freshnessEntry(
      'xero_revenue',
      dataset.freshness.xeroLines,
      !revenueAvailable
        ? 'unavailable'
        : hasPartialFailure('xero_revenue') || hasFreshnessFailure('xero_revenue') ? 'partial' : 'fresh',
      !revenueAvailable
        ? 'Xero line cache unavailable'
        : hasPartialFailure('xero_revenue') || hasFreshnessFailure('xero_revenue')
          ? 'Some Xero allocation or freshness data is unavailable'
          : 'No eligible Xero lines in this period',
    ),
    freshnessEntry(
      'xero_supplier_cost',
      dataset.freshness.xeroLines,
      !supplierCostAvailable
        ? 'unavailable'
        : hasPartialFailure('xero_supplier_cost') || hasFreshnessFailure('xero_supplier_cost') ? 'partial' : 'fresh',
      !supplierCostAvailable
        ? 'Xero Client tracking or supplier line data unavailable'
        : hasPartialFailure('xero_supplier_cost') || hasFreshnessFailure('xero_supplier_cost')
          ? 'Some supplier allocation or freshness data is unavailable'
          : 'No eligible supplier costs in this period',
    ),
    freshnessEntry(
      'media_spend',
      dataset.freshness.media ?? dataset.activeMediaConnection.updatedAt,
      hasDataFailure('media_spend')
        ? 'unavailable'
        : !mediaConnected ? 'not_connected' : mediaIsPartial || hasPartialFailure('media_spend') || hasFreshnessFailure('media_spend') ? 'partial' : 'fresh',
      hasDataFailure('media_spend')
        ? 'Media spend source unavailable'
        : !mediaConnected ? 'Media not connected' : mediaIsPartial || hasPartialFailure('media_spend') || hasFreshnessFailure('media_spend') ? 'Partial media data' : 'Connected with no spend in this period',
    ),
    freshnessEntry(
      'time_entries',
      dataset.freshness.timeEntries,
      hasDataFailure('time_entries') ? 'unavailable' : hasFreshnessFailure('time_entries') ? 'stale' : 'fresh',
      hasDataFailure('time_entries') ? 'Time totals unavailable' : hasFreshnessFailure('time_entries') ? 'Freshness metadata unavailable' : 'Live operational time data',
    ),
    freshnessEntry(
      'project_expenses',
      dataset.freshness.projectExpenses,
      hasDataFailure('project_expenses') ? 'unavailable' : hasFreshnessFailure('project_expenses') ? 'stale' : 'fresh',
      hasDataFailure('project_expenses') ? 'Project expenses unavailable' : hasFreshnessFailure('project_expenses') ? 'Freshness metadata unavailable' : 'Live operational expense data',
    ),
  ]

  const response: ClientFinancialsResponse = {
    period,
    basis: {
      currency: 'AUD',
      revenue: 'xero_accrec_ex_gst',
      media: 'agency_paid_passthrough',
      projectBudget: 'lifetime_plan',
    },
    summary,
    projects: projectFinancials,
    activity: {
      timeEntries,
      invoices,
      mediaCampaigns,
      totalTimeEntries,
      truncated: activityTruncated,
    },
    unallocated: calculation.unallocated,
    allocationCoverage: calculation.allocationCoverage,
    freshness,
    warnings: calculation.warnings,
    reconciliation: calculation.reconciliation,
    permissions: {
      canViewSources: input.includeSources,
      canAllocate: input.includeSources && input.canAllocate,
    },
  }

  if (input.includeSources) {
    const xeroSources: FinancialAllocationSource[] = [
      ...revenueLines,
      ...supplierLines,
    ].map((line) => {
      const allocationState = allocationStates.get(line.lineItemId)
      const allocation = allocationState?.allocation ?? null
      const isExcludedOverhead = line.invoiceTypeNormalized === 'ACCPAY'
        && line.accountType?.toUpperCase() !== 'DIRECTCOSTS'
      return {
        sourceType: line.invoiceTypeNormalized === 'ACCREC' ? 'xero_revenue' : 'xero_cost',
        sourceId: line.lineItemId,
        projectId: allocation?.projectId ?? null,
        projectName: allocation ? projectNames.get(allocation.projectId) ?? null : null,
        date: line.invoiceDateIso,
        label: isExcludedOverhead
          ? `Excluded ${line.accountType || 'non-direct cost'} · ${line.invoiceNumber || line.invoiceId}`
          : line.invoiceNumber || line.invoiceId,
        description: line.description,
        platformVendor: line.accountCode ? `Xero ${line.accountCode}` : 'Xero',
        amount: centsToDollars(line.lineExGstCentsNormalized),
        isStale: allocationState?.isStale ?? false,
      }
    })
    const missingXeroSources: FinancialAllocationSource[] = dataset.savedXeroAllocations
      .filter(allocation => !currentXeroLines.has(allocation.lineItemId))
      .map(allocation => ({
        sourceType: allocation.sourceInvoiceType.toUpperCase() === 'ACCREC' ? 'xero_revenue' : 'xero_cost',
        sourceId: allocation.lineItemId,
        projectId: allocation.projectId,
        projectName: projectNames.get(allocation.projectId) ?? null,
        date: isoDate(allocation.sourceInvoiceDate, `Allocation ${allocation.lineItemId} source date`),
        label: allocation.invoiceId,
        description: allocation.sourceDescription,
        platformVendor: allocation.sourceAccountCode ? `Xero ${allocation.sourceAccountCode}` : 'Xero',
        amount: centsToDollars(databaseCents(
          allocation.sourceExGstCents,
          `Allocation ${allocation.lineItemId} source amount`,
        )),
        isStale: true,
      }))
    const mediaSources: FinancialAllocationSource[] = normalizedMedia.map(spend => ({
      sourceType: 'media_spend',
      sourceId: spend.id,
      projectId: spend.projectId,
      projectName: spend.projectName,
      date: monthBounds(spend.period)?.first ?? null,
      label: spend.campaignName,
      description: spend.sourceState === 'partial' ? 'Monthly total excluded for the selected partial range.' : null,
      platformVendor: spend.platform,
      amount: centsToDollars(spend.amountCents),
      isStale: spend.isStale,
    }))
    response.sources = [...xeroSources, ...missingXeroSources, ...mediaSources]
    response.tracking = normalizeTracking(dataset, input.tenantId)
  }

  return response
}
