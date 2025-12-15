import type { AvatarProps } from '@nuxt/ui'

export type UserStatus = 'subscribed' | 'unsubscribed' | 'bounced'
export type SaleStatus = 'paid' | 'failed' | 'refunded'

export interface User {
  id: number
  name: string
  email: string
  avatar?: AvatarProps
  status: UserStatus
  location: string
}

export interface Mail {
  id: number
  unread?: boolean
  from: User
  subject: string
  body: string
  date: string
}

export interface Member {
  name: string
  username: string
  role: 'member' | 'owner'
  avatar: AvatarProps
}

export interface Stat {
  title: string
  icon: string
  value: number | string
  variation: number
  formatter?: (value: number) => string
}

export interface Sale {
  id: string
  date: string
  status: SaleStatus
  email: string
  amount: number
}

export interface Notification {
  id: number
  unread?: boolean
  sender: User
  body: string
  date: string
}

export type Period = 'daily' | 'weekly' | 'monthly'

export interface Range {
  start: Date
  end: Date
}

// ============================================
// Agency Platform Types
// ============================================

// Chart of Accounts Categories
export type AccountCategory = 'asset' | 'liability' | 'equity' | 'revenue' | 'cost_of_services' | 'operating_expense'

export interface ChartOfAccount {
  id: string
  code: string // e.g., "4100", "5200"
  name: string
  category: AccountCategory
  description?: string
  parentId?: string // for sub-accounts
  isActive: boolean
  xeroAccountId?: string // link to Xero account
}

// Client & Project Types
export type BillingType = 'retainer' | 'project' | 'hybrid' | 'commission'
export type ProjectStatus = 'draft' | 'active' | 'on_hold' | 'completed' | 'cancelled'
export type BudgetType = 'fixed' | 'time_materials' | 'retainer_allocation' | 'media_commission'

export interface AgencyClient {
  id: string
  name: string
  xeroContactId?: string
  billingType: BillingType
  retainerAmount?: number // monthly retainer if applicable
  paymentTerms: number // days
  hourlyRate?: number // default rate for time-based work
  mediaCommissionRate?: number // % commission on media spend
  isActive: boolean
  createdAt: string
  updatedAt: string
  notes?: string
}

export interface Project {
  id: string
  clientId: string
  name: string
  description?: string
  budgetAmount: number
  budgetType: BudgetType
  startDate: string
  endDate?: string
  status: ProjectStatus
  projectManagerId?: string
  createdAt: string
  updatedAt: string
}

// Time Tracking
export interface TimeEntry {
  id: string
  projectId: string
  userId: string
  date: string
  hours: number
  billable: boolean
  hourlyRate: number
  description: string
  approved: boolean
  invoiced: boolean
  invoiceId?: string
  createdAt: string
}

// Expense Tracking
export type ExpenseCategory =
  | 'direct_labor'
  | 'contractor'
  | 'media_cost'
  | 'production'
  | 'software'
  | 'travel'
  | 'other'

export interface ProjectExpense {
  id: string
  projectId?: string
  clientId?: string
  accountCode: string // links to ChartOfAccount
  category: ExpenseCategory
  description: string
  amount: number
  billable: boolean
  markup?: number // percentage markup for pass-through
  date: string
  vendorName?: string
  xeroInvoiceId?: string
  approved: boolean
  invoiced: boolean
  createdAt: string
}

// Media Spend Tracking
export type MediaPlatform = 'google_ads' | 'meta' | 'linkedin' | 'tiktok' | 'programmatic' | 'traditional' | 'other'

export interface MediaSpend {
  id: string
  clientId: string
  projectId?: string
  platform: MediaPlatform
  budgetAllocated: number
  actualSpend: number
  commissionRate: number // percentage
  commissionAmount: number // calculated
  period: string // YYYY-MM format
  reconciled: boolean
  notes?: string
  createdAt: string
  updatedAt: string
}

// Invoicing
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'void'
export type InvoiceLineType = 'time' | 'expense' | 'retainer' | 'media' | 'fixed_fee' | 'other'

export interface AgencyInvoice {
  id: string
  clientId: string
  projectId?: string
  invoiceNumber: string
  xeroInvoiceId?: string
  status: InvoiceStatus
  issueDate: string
  dueDate: string
  subtotal: number
  tax: number
  total: number
  paidAmount: number
  lines: AgencyInvoiceLine[]
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface AgencyInvoiceLine {
  id: string
  invoiceId: string
  type: InvoiceLineType
  description: string
  quantity: number
  unitPrice: number
  amount: number
  accountCode: string
  taxRate?: number
  // Reference to source records
  timeEntryIds?: string[]
  expenseIds?: string[]
  mediaSpendIds?: string[]
}

// Retainer Management
export interface RetainerPeriod {
  id: string
  clientId: string
  period: string // YYYY-MM
  retainerAmount: number
  hoursIncluded?: number
  hoursUsed: number
  amountUsed: number
  rolloverHours?: number
  rolloverAmount?: number
  status: 'active' | 'invoiced' | 'closed'
  invoiceId?: string
  createdAt: string
}

// Profitability & KPIs
export interface ProjectProfitability {
  projectId: string
  projectName: string
  clientName: string
  budget: number
  laborCost: number
  expenseCost: number
  mediaCost: number
  totalCost: number
  revenue: number
  grossProfit: number
  grossMargin: number // percentage
  hoursWorked: number
  effectiveRate: number // revenue / hours
  status: ProjectStatus
}

export interface ClientProfitability {
  clientId: string
  clientName: string
  totalRevenue: number
  totalCost: number
  grossProfit: number
  grossMargin: number
  projectCount: number
  activeProjects: number
  avgProjectMargin: number
  lifetimeValue: number
}

export interface UtilizationMetrics {
  userId: string
  userName: string
  period: string // YYYY-MM
  totalHours: number
  billableHours: number
  nonBillableHours: number
  utilizationRate: number // percentage
  targetUtilization: number
  billableRevenue: number
  effectiveRate: number
}

export interface AgencyKPIs {
  period: string
  // Financial
  totalRevenue: number
  totalCost: number
  grossProfit: number
  grossMargin: number
  netProfit: number
  netMargin: number
  mrr: number // monthly recurring revenue (retainers)
  // Operational
  avgUtilizationRate: number
  avgBillableRate: number
  writeOffAmount: number
  writeOffRate: number
  // Client
  activeClients: number
  activeProjects: number
  avgProjectValue: number
  clientChurnRate: number
  // Benchmarks
  billingsPerFTE: number
  revenuePerEmployee: number
}

// Budget Pacing
export interface BudgetPacing {
  clientId: string
  projectId?: string
  period: string
  budgetType: 'project' | 'media' | 'retainer'
  totalBudget: number
  spentToDate: number
  projectedSpend: number
  remainingBudget: number
  pacingPercentage: number // actual vs expected at this point
  daysElapsed: number
  daysRemaining: number
  onTrack: boolean
  alerts: string[]
}
