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

// ============================================
// Workflow Management Types (Monday.com-style)
// ============================================

export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low'
export type TaskType = 'task' | 'milestone' | 'bug' | 'feature' | 'review' | 'meeting'
export type StatusCategory = 'not_started' | 'in_progress' | 'review' | 'done' | 'cancelled'
export type DepartmentRole = 'lead' | 'senior' | 'member' | 'junior'
export type TaskAssigneeRole = 'assignee' | 'reviewer' | 'approver' | 'watcher'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'skipped'

export interface Department {
  id: string
  name: string
  slug: string
  description?: string
  color: string
  icon: string
  managerId?: string
  managerName?: string
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
  // Stats (optional, included in list responses)
  memberCount?: number
  activeTasks?: number
  overdueTasks?: number
  completedThisWeek?: number
}

export interface DepartmentMember {
  membershipId: string
  departmentRole: DepartmentRole
  isPrimary: boolean
  joinedAt: string
  id: string
  name: string
  email: string
  role?: string
  isActive: boolean
  activeTaskCount?: number
  overdueTaskCount?: number
  estimatedHours?: number
}

export interface TaskStatus {
  id: string
  departmentId?: string
  departmentName?: string
  name: string
  slug: string
  color: string
  icon?: string
  category: StatusCategory
  isDefault: boolean
  isFinal: boolean
  sortOrder: number
  createdAt: string
}

export interface TaskLabel {
  id: string
  departmentId?: string
  departmentName?: string
  name: string
  color: string
  description?: string
  createdAt: string
  usageCount?: number
}

export interface Task {
  id: string
  projectId?: string
  departmentId: string
  parentTaskId?: string
  statusId: string
  title: string
  description?: string
  priority: TaskPriority
  taskType: TaskType
  assigneeId?: string
  reporterId?: string
  dueDate?: string
  startDate?: string
  estimatedHours?: number
  actualHours?: number
  sortOrder: number
  isBlocked: boolean
  blockedReason?: string
  completedAt?: string
  createdAt: string
  updatedAt: string
  // Related data (included in API responses)
  status?: {
    id: string
    name: string
    color: string
    category: StatusCategory
    isFinal: boolean
  }
  department?: {
    id: string
    name: string
    color: string
    slug?: string
  }
  project?: {
    id: string
    name: string
    clientId?: string
    clientName?: string
  } | null
  assignee?: {
    id: string
    name: string
    email: string
  } | null
  reporter?: {
    id: string
    name: string
    email?: string
  } | null
  parent?: {
    id: string
    title: string
  } | null
  labels?: TaskLabel[]
  subtaskCount?: number
  completedSubtasks?: number
  commentCount?: number
}

export interface TaskActivity {
  id: string
  type: string
  content: string
  oldValue?: any
  newValue?: any
  createdAt: string
  user?: {
    id: string
    name: string
    email: string
  } | null
}

export interface TaskAttachment {
  id: string
  fileName: string
  fileType: string
  fileSize: number
  fileUrl: string
  uploadedByName?: string
  createdAt: string
}

export interface TaskDependency {
  dependencyId: string
  dependencyType: 'blocks' | 'is_blocked_by' | 'relates_to'
  task: {
    id: string
    title: string
    status: {
      name: string
      color: string
      isFinal: boolean
    }
  }
}

export interface ApprovalWorkflow {
  id: string
  name: string
  description?: string
  departmentId?: string
  isActive: boolean
  createdAt: string
}

export interface ApprovalWorkflowStep {
  stepId: string
  stepNumber: number
  stepName: string
  approverRole?: string
  isRequired: boolean
  response?: {
    id: string
    status: ApprovalStatus
    comment?: string
    respondedAt: string
    responder?: {
      id: string
      name: string
    } | null
  } | null
}

export interface TaskApproval {
  id: string
  taskId: string
  workflowId: string
  workflowName: string
  workflowDescription?: string
  status: ApprovalStatus
  currentStepNumber: number
  requestedBy?: {
    id: string
    name: string
  } | null
  createdAt: string
  completedAt?: string
  steps: ApprovalWorkflowStep[]
  progress: {
    totalSteps: number
    completedSteps: number
    requiredSteps: number
    approvedRequiredSteps: number
    hasRejection: boolean
  }
}

// Kanban Board Types
export interface KanbanColumn {
  status: TaskStatus
  tasks: Task[]
  isCollapsed?: boolean
}

export interface KanbanFilters {
  assigneeId?: string
  priority?: TaskPriority
  labels?: string[]
  tags?: string[]
  search?: string
  showCompleted?: boolean
  projectId?: string
  dateRange?: {
    start?: string
    end?: string
  }
}

// ============================================
// Monday.com-Style Advanced Features
// ============================================

// Global Tags/Hashtags System
export interface GlobalTag {
  id: string
  name: string
  slug: string // lowercase, no spaces - used as #hashtag
  color: string
  description?: string
  usageCount: number
  createdBy?: string
  createdAt: string
  updatedAt: string
}

// Custom Column Types
export type CustomColumnType =
  | 'text'
  | 'number'
  | 'currency'
  | 'date'
  | 'timeline'
  | 'status'
  | 'dropdown'
  | 'people'
  | 'checkbox'
  | 'rating'
  | 'link'
  | 'email'
  | 'phone'
  | 'location'
  | 'formula'
  | 'tags'
  | 'files'
  | 'progress'
  | 'color'
  | 'dependency'

export interface CustomColumn {
  id: string
  departmentId?: string
  name: string
  slug: string
  columnType: CustomColumnType
  description?: string
  settings: {
    defaultValue?: any
    options?: ColumnDropdownOption[]
    formula?: string
    currencyCode?: string
    decimalPlaces?: number
    prefix?: string
    suffix?: string
    minValue?: number
    maxValue?: number
    dateFormat?: string
    showTime?: boolean
  }
  isVisible: boolean
  isRequired: boolean
  allowedRoles?: string[] // Roles that can view this column
  editableRoles?: string[] // Roles that can edit
  width: number
  sortOrder: number
  createdBy?: string
  createdAt: string
  updatedAt: string
}

export interface ColumnDropdownOption {
  id: string
  columnId: string
  value: string
  label: string
  color: string
  sortOrder: number
  isDefault: boolean
}

export interface TaskColumnValue {
  id: string
  taskId: string
  columnId: string
  textValue?: string
  numberValue?: number
  dateValue?: string
  dateEndValue?: string // For timeline columns
  jsonValue?: any // For complex types
  createdAt: string
  updatedAt: string
}

// Pricing (Role-based visibility)
export type CostType = 'labor' | 'material' | 'contractor' | 'software' | 'other'

export interface TaskPricing {
  estimatedCost?: number
  actualCost?: number
  billingRate?: number
  currency: string
  isBillable: boolean
  xeroInvoiceId?: string
  invoicedAt?: string
}

export interface TaskCostEntry {
  id: string
  taskId: string
  costType: CostType
  description?: string
  quantity: number
  unitCost: number
  totalCost: number
  isBillable: boolean
  markupPercentage: number
  enteredBy?: string
  date: string
  createdAt: string
}

export interface PricingVisibilityRules {
  id: string
  departmentId?: string
  viewRoles: string[]
  editRoles: string[]
  showEstimatedCost: boolean
  showActualCost: boolean
  showBillingRate: boolean
  showCurrency: boolean
}

// Board Views
export type BoardViewType = 'kanban' | 'table' | 'timeline' | 'calendar' | 'list' | 'gallery'

export interface BoardView {
  id: string
  departmentId?: string
  name: string
  viewType: BoardViewType
  isDefault: boolean
  isPublic: boolean
  createdBy?: string
  config: BoardViewConfig
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface BoardViewConfig {
  filters?: KanbanFilters
  sort?: SortRule[]
  groupBy?: string
  visibleColumns?: string[]
  columnWidths?: Record<string, number>
  timeline?: {
    startDate?: string
    endDate?: string
    zoomLevel?: 'day' | 'week' | 'month' | 'quarter'
  }
  calendar?: {
    defaultView?: 'day' | 'week' | 'month'
  }
}

export interface UserSavedView {
  id: string
  userId: string
  departmentId?: string
  name: string
  viewType: BoardViewType
  filters: KanbanFilters
  sortConfig: SortRule[]
  groupBy?: string
  visibleColumns?: string[]
  columnWidths?: Record<string, number>
  isPinned: boolean
  createdAt: string
  updatedAt: string
}

// Sorting
export interface SortRule {
  column: string
  direction: 'asc' | 'desc'
  nullsLast?: boolean
}

export interface SortingPreset {
  id: string
  departmentId?: string
  name: string
  sortRules: SortRule[]
  isDefault: boolean
  isSystem: boolean
  createdBy?: string
  createdAt: string
}

// Grouping
export interface BoardGroupingOption {
  id: string
  departmentId?: string
  groupBy: string
  displayName: string
  sortOrder: number
  isEnabled: boolean
  config?: {
    buckets?: string[] // For date grouping: 'overdue', 'today', 'this_week', 'next_week', 'later', 'no_date'
    customGroups?: { value: string; label: string }[]
  }
}

// Extended Task with Monday.com features
export interface TaskWithExtras extends Task {
  tags?: GlobalTag[]
  columnValues?: TaskColumnValue[]
  pricing?: TaskPricing
  costEntries?: TaskCostEntry[]
  progressPercentage?: number
  dateConstraintType?: string
  constraintDate?: string
  milestoneDate?: string
}

// Timeline View Types
export interface TimelineTask {
  id: string
  title: string
  departmentId: string
  projectId?: string
  assigneeId?: string
  priority: TaskPriority
  taskType: TaskType
  startDate: string
  endDate: string
  progressPercentage: number
  estimatedHours?: number
  actualHours?: number
  statusName: string
  statusColor: string
  statusCategory: StatusCategory
  isFinal: boolean
  departmentName: string
  departmentColor: string
  assigneeName?: string
  projectName?: string
}

// Calendar View Types
export interface CalendarEvent {
  id: string
  title: string
  start: string
  end?: string
  allDay?: boolean
  color?: string
  task: Task
}

// Board Statistics
export interface BoardStats {
  totalTasks: number
  completedTasks: number
  overdueTasks: number
  tasksThisWeek: number
  totalEstimatedHours: number
  totalActualHours: number
  totalEstimatedCost?: number
  totalActualCost?: number
  byStatus: { statusId: string; statusName: string; count: number; color: string }[]
  byPriority: { priority: TaskPriority; count: number }[]
  byAssignee: { assigneeId: string; assigneeName: string; count: number }[]
}

// ============================================
// Project Brief Submission System Types
// ============================================

// Brief Categories
export interface BriefCategory {
  id: string
  name: string
  slug: string
  description?: string
  icon: string
  color: string
  sortOrder: number
  isActive: boolean
  createdAt: string
  updatedAt: string
  // Stats
  templateCount?: number
  briefCount?: number
}

// Brief Field Types
export type BriefFieldType =
  | 'text'
  | 'textarea'
  | 'richtext'
  | 'number'
  | 'currency'
  | 'date'
  | 'daterange'
  | 'datetime'
  | 'time'
  | 'dropdown'
  | 'multiselect'
  | 'checkbox'
  | 'checkboxgroup'
  | 'radio'
  | 'file'
  | 'files'
  | 'image'
  | 'images'
  | 'url'
  | 'email'
  | 'phone'
  | 'rating'
  | 'slider'
  | 'color'
  | 'user'
  | 'users'
  | 'client'
  | 'project'
  | 'department'
  | 'heading'
  | 'paragraph'
  | 'divider'

// Brief Template Field Definition
export interface BriefTemplateField {
  id: string
  templateId: string
  fieldKey: string
  fieldLabel: string
  fieldType: BriefFieldType
  placeholder?: string
  helpText?: string
  defaultValue?: any
  isRequired: boolean
  validationRules?: {
    min?: number
    max?: number
    minLength?: number
    maxLength?: number
    pattern?: string
    patternMessage?: string
    accept?: string // For file fields
    maxFileSize?: number // For file fields in bytes
  }
  options?: BriefFieldOption[]
  conditionalLogic?: BriefFieldCondition
  stepNumber: number
  stepTitle?: string
  section?: string
  width: 'full' | 'half' | 'third'
  sortOrder: number
  showInPreview: boolean
  showInList: boolean
  createdAt: string
}

export interface BriefFieldOption {
  value: string
  label: string
  color?: string
}

export interface BriefFieldCondition {
  fieldKey: string
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'is_empty' | 'is_not_empty'
  value?: any
  action: 'show' | 'hide' | 'require' | 'unrequire'
}

// Brief Template
export interface BriefTemplate {
  id: string
  categoryId: string
  departmentId?: string
  name: string
  slug: string
  description?: string
  icon?: string
  requiresApproval: boolean
  autoAssignTo?: string
  autoAssignDepartment?: string
  defaultPriority: TaskPriority
  isMultiStep: boolean
  showProgress: boolean
  allowDrafts: boolean
  allowAttachments: boolean
  maxAttachments: number
  isPublic: boolean
  requireClientLink: boolean
  isActive: boolean
  sortOrder: number
  createdBy?: string
  createdAt: string
  updatedAt: string
  // Related data
  category?: BriefCategory
  department?: {
    id: string
    name: string
    color: string
  }
  fields?: BriefTemplateField[]
  fieldCount?: number
  briefCount?: number
}

// Brief Status
export type BriefStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'needs_info'
  | 'approved'
  | 'rejected'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

// Brief Submission
export interface Brief {
  id: string
  templateId: string
  referenceNumber: string
  title: string
  submittedBy?: string
  submittedByName?: string
  submittedByEmail?: string
  clientId?: string
  projectId?: string
  departmentId?: string
  status: BriefStatus
  priority: TaskPriority
  assignedTo?: string
  assignedAt?: string
  reviewedBy?: string
  reviewedAt?: string
  reviewNotes?: string
  convertedToTaskId?: string
  convertedToProjectId?: string
  convertedAt?: string
  requestedDeadline?: string
  estimatedCompletion?: string
  budgetMin?: number
  budgetMax?: number
  budgetCurrency: string
  source: 'internal' | 'client_portal' | 'email' | 'api'
  createdAt: string
  updatedAt: string
  submittedAt?: string
  completedAt?: string
  // Related data
  template?: BriefTemplate
  category?: BriefCategory
  submitter?: {
    id: string
    name: string
    email: string
  }
  assignee?: {
    id: string
    name: string
    email: string
  }
  reviewer?: {
    id: string
    name: string
    email: string
  }
  client?: {
    id: string
    name: string
  }
  project?: {
    id: string
    name: string
  }
  department?: {
    id: string
    name: string
    color: string
  }
  fieldValues?: BriefFieldValue[]
  attachments?: BriefAttachment[]
  commentCount?: number
  attachmentCount?: number
}

// Brief Field Value
export interface BriefFieldValue {
  id: string
  briefId: string
  fieldId: string
  fieldKey: string
  fieldLabel: string
  fieldType: BriefFieldType
  value: any
  stepNumber?: number
  section?: string
  width?: 'full' | 'half' | 'third'
  sortOrder?: number
  createdAt: string
  updatedAt: string
}

// Brief Attachment
export interface BriefAttachment {
  id: string
  briefId: string
  fieldId?: string
  fileName: string
  fileUrl: string
  fileType?: string
  fileSize?: number
  thumbnailUrl?: string
  uploadedBy?: string
  uploadedByName?: string
  createdAt: string
}

// Brief Comment
export interface BriefComment {
  id: string
  briefId: string
  parentId?: string
  userId?: string
  content: string
  isInternal: boolean
  isResolution: boolean
  createdAt: string
  updatedAt: string
  user?: {
    id: string
    name: string
    email: string
    avatarUrl?: string
  }
  replies?: BriefComment[]
}

// Brief Activity
export type BriefActivityType =
  | 'created'
  | 'submitted'
  | 'updated'
  | 'status_changed'
  | 'assigned'
  | 'unassigned'
  | 'commented'
  | 'attachment_added'
  | 'reviewed'
  | 'approved'
  | 'rejected'
  | 'needs_info'
  | 'converted_to_task'
  | 'converted_to_project'
  | 'priority_changed'
  | 'deadline_changed'
  | 'completed'
  | 'cancelled'

export interface BriefActivity {
  id: string
  briefId: string
  userId?: string
  activityType: BriefActivityType
  oldValue?: any
  newValue?: any
  content?: string
  createdAt: string
  user?: {
    id: string
    name: string
    email: string
  }
}

// Brief Statistics
export interface BriefStats {
  total: number
  byStatus: { status: BriefStatus; count: number }[]
  byCategory: { categoryId: string; categoryName: string; count: number; color: string }[]
  byPriority: { priority: TaskPriority; count: number }[]
  submitted: number
  pending: number
  approved: number
  completed: number
  avgCompletionDays: number
}

// Brief Filters
export interface BriefFilters {
  categoryId?: string
  templateId?: string
  status?: BriefStatus | BriefStatus[]
  priority?: TaskPriority | TaskPriority[]
  assigneeId?: string
  submittedById?: string
  clientId?: string
  departmentId?: string
  search?: string
  dateRange?: {
    start?: string
    end?: string
  }
}

// Form Renderer Props
export interface BriefFormStep {
  number: number
  title: string
  fields: BriefTemplateField[]
}

export interface BriefFormValues {
  [fieldKey: string]: any
}
