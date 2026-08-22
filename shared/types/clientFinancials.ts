export type FinancialMarginReason = 'no_agi' | 'negative_agi' | 'source_conflict' | null

export type FinancialWarningCode =
  | 'xero_not_linked'
  | 'xero_lines_unavailable'
  | 'media_not_connected'
  | 'media_partial'
  | 'stale_allocation'
  | 'possible_duplicate'
  | 'reconciliation_failed'
  | 'activity_truncated'

export type FinancialDataSource =
  | 'xero_invoices'
  | 'xero_revenue'
  | 'xero_supplier_cost'
  | 'media_spend'
  | 'time_entries'
  | 'project_expenses'
  | 'activity'
  | 'reconciliation'

export type FinancialAllocatableSourceType = 'xero_revenue' | 'media_spend' | 'xero_cost'

export type FinancialAllocationMutation =
  | { sourceType: 'media_spend'; sourceId: string; projectId: string | null }
  | { sourceType: 'xero_line'; sourceId: string; projectId: string | null }
  | { sourceType: 'client_tracking'; trackingOptionId: string | null; trackingOptionName: string }

export interface FinancialAllocationResult {
  sourceType: FinancialAllocationMutation['sourceType']
  sourceId: string
  previousProjectId: string | null
  projectId: string | null
  changedAt: string
}

export interface ClientFinancialSummary {
  xeroRevenue: number
  mediaSpend: number
  agi: number
  labourCost: number
  projectExpenseCost: number
  xeroSupplierCost: number
  deliveryCost: number
  deliveryProfit: number
  deliveryMarginPct: number | null
  marginReason: FinancialMarginReason
  hours: number
  activeProjects: number
}

export interface FinancialProjectCoverage {
  mappedSourceCount: number
  sourceTypes: FinancialAllocatableSourceType[]
}

export interface ClientProjectFinancialRow {
  projectId: string
  projectName: string
  status: string
  projectBudget: number | null
  xeroRevenue: number
  mediaSpend: number
  agi: number
  labourCost: number
  projectExpenseCost: number
  xeroSupplierCost: number
  deliveryCost: number
  deliveryProfit: number
  deliveryMarginPct: number | null
  marginReason: FinancialMarginReason
  hours: number
  coverage: FinancialProjectCoverage
}

export interface FinancialUnallocatedSummary {
  xeroRevenue: number
  mediaSpend: number
  labourCost: number
  projectExpenseCost: number
  xeroSupplierCost: number
  deliveryCost: number
}

export interface FinancialAllocationCoverageEntry {
  allocated: number
  unallocated: number
  allocatedItemCount: number
  totalItemCount: number
  percentage: number | null
}

export interface FinancialAllocationCoverage {
  overall: FinancialAllocationCoverageEntry
  xeroRevenue: FinancialAllocationCoverageEntry
  mediaSpend: FinancialAllocationCoverageEntry
  xeroSupplierCost: FinancialAllocationCoverageEntry
}

export interface FinancialAllocationSource {
  sourceType: FinancialAllocatableSourceType
  sourceId: string
  projectId: string | null
  projectName?: string | null
  date: string | null
  label: string
  description: string | null
  platformVendor: string | null
  amount: number
  isStale: boolean
}

export interface FinancialTrackingOption {
  id: string | null
  name: string
  isActive: boolean
}

export interface FinancialSourceFreshness {
  source: FinancialDataSource
  status: 'fresh' | 'stale' | 'partial' | 'unavailable' | 'not_connected'
  updatedAt: string | null
  label: string
}

export interface FinancialSourceWarning {
  code: FinancialWarningCode
  source: FinancialDataSource
  message: string
  sourceId?: string
  projectId?: string
}

export interface FinancialReconciliation {
  source: 'xero_revenue' | 'media_spend' | 'labour' | 'project_expenses' | 'xero_supplier_cost'
  total: number
  allocated: number
  unallocated: number
  differenceCents: number
}

export interface ClientFinancialTimeEntry {
  id: string
  projectId: string
  projectName: string
  date: string
  userName: string | null
  description: string | null
  hours: number
  hourlyRate: number
  labourCost: number
}

export interface ClientXeroInvoiceRow {
  id: string
  invoiceNumber: string
  type: 'ACCREC' | 'ACCPAY'
  status: string
  date: string
  dueDate: string | null
  total: number
  amountPaid: number
  amountDue: number
  currency: string
}

export interface ClientFinancialMediaCampaign {
  id: string
  projectId: string | null
  projectName: string | null
  campaignName: string
  platform: string
  budget: number | null
  actualSpend: number
  pacingStatus: string | null
  sourceState: 'available' | 'partial' | 'unavailable' | 'not_connected'
}

export interface ClientFinancialsResponse {
  period: { from: string; to: string; label: string }
  basis: {
    currency: 'AUD'
    revenue: 'xero_accrec_ex_gst'
    media: 'agency_paid_passthrough'
    projectBudget: 'lifetime_plan'
  }
  summary: ClientFinancialSummary
  projects: ClientProjectFinancialRow[]
  activity: {
    timeEntries: ClientFinancialTimeEntry[]
    invoices: ClientXeroInvoiceRow[]
    mediaCampaigns: ClientFinancialMediaCampaign[]
    totalTimeEntries: number
    truncated: boolean
  }
  unallocated: FinancialUnallocatedSummary
  allocationCoverage: FinancialAllocationCoverage
  sources?: FinancialAllocationSource[]
  tracking?: {
    selected: FinancialTrackingOption | null
    options: FinancialTrackingOption[]
  }
  freshness: FinancialSourceFreshness[]
  warnings: FinancialSourceWarning[]
  reconciliation: FinancialReconciliation[]
  permissions: { canViewSources: boolean; canAllocate: boolean }
}
