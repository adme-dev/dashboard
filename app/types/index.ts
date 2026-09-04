import type { AvatarProps } from '@nuxt/ui'

// ============================================
// User Types
// ============================================
export interface User {
  id: string
  email: string
  name: string
  role: string
  is_active?: boolean
  avatar?: AvatarProps
  avatar_url?: string
  avatarUrl?: string | null
  custom_role_id?: string | null
  permissionGroups?: string[]
  isCustomReadOnly?: boolean
  timezone?: string
  locale?: string
  emailVerifiedAt?: string | null
  email_verified_at?: string | null
}

// ============================================
// Implementation Types
// ============================================
export interface Implementation {
  id: string
  client_id: string
  client_name: string
  xero_organization_id: string | null
  xero_connection_status: 'pending' | 'connected' | 'disconnected' | 'error'
  implementation_type: 'new_setup' | 'migration' | 'cleanup' | 'training_only'
  industry_template: string
  company_type: string
  status: 'not_started' | 'setup_phase' | 'in_progress' | 'review' | 'go_live' | 'complete' | 'on_hold'
  progress_percent: number
  start_date: string | null
  target_date: string | null
  go_live_date: string | null
  completed_date: string | null
  project_manager_id: string | null
  project_manager_name: string | null
  assigned_consultant_id: string | null
  assigned_consultant_name: string | null
  client_portal_enabled: boolean
  priority: 'low' | 'medium' | 'high' | 'urgent'
  estimated_hours: number
  actual_hours: number
  notes: string
  created_at: string
  updated_at: string
  // Computed
  completed_tasks?: number
  total_tasks?: number
}

// ============================================
// Implementation Task Types (legacy — used by useImplementations.ts)
// ============================================
export interface ImplementationTask {
  id: string
  implementation_id: string
  name: string
  description: string | null
  category: 'setup' | 'configuration' | 'data_migration' | 'training' | 'review' | 'go_live' | 'support'
  status: 'not_started' | 'in_progress' | 'blocked' | 'review' | 'complete' | 'skipped'
  assigned_to_id: string | null
  assigned_to_name: string | null
  due_date: string | null
  started_at: string | null
  completed_at: string | null
  estimated_hours: number | null
  actual_hours: number
  sort_order: number
  checklist_items: ChecklistItem[]
  checklist_progress: number
  show_to_client: boolean
  client_notes: string | null
  is_blocked: boolean
  blocked_reason: string | null
  created_at: string
  updated_at: string
}

// ============================================
// Workflow Enums & Primitives
// ============================================
export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low'
export type TaskType = 'task' | 'milestone' | 'bug' | 'feature' | 'review' | 'meeting'
export type StatusCategory = 'not_started' | 'in_progress' | 'review' | 'done' | 'cancelled'
export type DepartmentRole = 'lead' | 'senior' | 'member' | 'junior'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'skipped'
export type BoardViewType = 'kanban' | 'table' | 'timeline' | 'calendar' | 'list' | 'gallery'

// ============================================
// Department Types
// ============================================
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
  memberCount?: number
  activeTasks?: number
  overdueTasks?: number
  completedThisWeek?: number
}

// ============================================
// Task Status & Label Types
// ============================================
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

// ============================================
// Workflow Task Types
// ============================================
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
  version?: number
  lastModifiedBy?: string
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

// ============================================
// Kanban & Board Types
// ============================================
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

export interface BoardGroupingOption {
  id: string
  departmentId?: string
  groupBy: string
  displayName: string
  sortOrder: number
  isEnabled: boolean
  config?: Record<string, any>
  createdAt: string
}

export interface GlobalTag {
  id: string
  name: string
  slug: string
  color: string
  description?: string
  usageCount: number
  createdBy?: string
  createdAt: string
  updatedAt: string
}

// ============================================
// Task Activity & Attachment Types
// ============================================
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

export interface ChecklistItem {
  id: string
  text: string
  completed: boolean
}

// ============================================
// Template Types
// ============================================
export interface Template {
  id: string
  name: string
  description: string | null
  template_type: string
  company_type: string
  estimated_duration_days: number
  default_priority: string
  is_system_template: boolean
  is_active: boolean
  usage_count: number
  created_at: string
  tasks?: TemplateTask[]
}

export interface TemplateTask {
  id: string
  template_id: string
  name: string
  description: string | null
  sort_order: number
  category: string
  estimated_hours: number | null
  default_assignee_role: string
  checklist_items: ChecklistItem[]
  is_required: boolean
  client_description: string | null
  show_to_client: boolean
}

// ============================================
// Comment Types
// ============================================
export interface Comment {
  id: string
  task_id: string
  author_id: string | null
  author_name: string | null
  author_type: 'team_member' | 'client' | 'system'
  content: string
  comment_type: string
  is_internal: boolean
  created_at: string
}

// ============================================
// Document Types
// ============================================
export interface Document {
  id: string
  implementation_id: string
  task_id: string | null
  file_name: string
  file_type: string
  file_size_bytes: number
  file_url: string
  document_type: string
  description: string | null
  uploaded_by_name: string | null
  created_at: string
}

// ============================================
// Project Brief Submission System Types
// ============================================
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
  templateCount?: number
  briefCount?: number
}

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
    accept?: string
    maxFileSize?: number
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
  quote?: {
    id: string
    quoteNumber: string
    status: string
    currency?: string | null
    total: number
    xeroStatus?: string | null
  } | null
  linkedTasks?: Array<{
    id: string
    title: string
    statusName?: string | null
    statusCategory?: StatusCategory | string | null
    statusColor?: string | null
    boardName?: string | null
    assigneeId?: string | null
    assigneeName?: string | null
    actualHours?: number | null
    estimatedHours?: number | null
    dueDate?: string | null
    completedAt?: string | null
  }>
}

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

export interface BriefFormStep {
  number: number
  title: string
  fields: BriefTemplateField[]
}

export interface BriefFormValues {
  [fieldKey: string]: any
}

// ============================================
// Stats Types
// ============================================
export interface DashboardStats {
  activeImplementations: number
  completedThisMonth: number
  averageCompletionTime: number
  totalHoursLogged: number
  teamWorkload: TeamMemberWorkload[]
}

export interface TeamMemberWorkload {
  id: string
  name: string
  activeImplementations: number
  pendingTasks: number
  estimatedHoursRemaining: number
  overdueTasks: number
}

// ============================================
// Legacy Dashboard Template Types
// ============================================
export type UserStatus = 'subscribed' | 'unsubscribed' | 'bounced'
export type SaleStatus = 'paid' | 'failed' | 'refunded'

export interface Mail {
  id: number
  unread?: boolean
  from: User
  subject: string
  body: string
  date: string
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

export type Period = 'daily' | 'weekly' | 'monthly'

export interface Range {
  start: Date
  end: Date
}

// ============================================
// Agency Platform Types
// ============================================
export type BillingType = 'retainer' | 'project' | 'hybrid' | 'commission'
export type ProjectStatus = 'draft' | 'active' | 'on_hold' | 'completed' | 'cancelled'
export type BudgetType = 'fixed' | 'time_materials' | 'retainer_allocation' | 'media_commission'

export interface AgencyClient {
  id: string
  name: string
  xeroContactId?: string
  billingType: BillingType
  retainerAmount?: number
  paymentTerms: number
  hourlyRate?: number
  mediaCommissionRate?: number
  isActive: boolean
  createdAt: string
  updatedAt: string
  notes?: string
  totalRevenue?: number
  totalCost?: number
  grossProfit?: number
  grossMargin?: number
  projectCount?: number
  activeProjects?: number
}

// ============================================
// Board / Custom Column Types
// ============================================
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
  | 'invoice_status'
  | 'linked_items'

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
  allowedRoles?: string[]
  editableRoles?: string[]
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
  dateEndValue?: string
  jsonValue?: any
  createdAt: string
  updatedAt: string
}

// ============================================
// EOM Invoicing Types
// ============================================
export type EomRunStatus = 'draft' | 'generating' | 'review' | 'pushed' | 'complete' | 'failed'
export type EomLineItemSource = 'monday' | 'meta_ads' | 'google_ads' | 'manual'
export type EomConfidence = 'high' | 'medium' | 'low'
export type EomReviewStatus = 'auto' | 'reviewed' | 'flagged' | 'corrected'

export interface EomRun {
  id: string
  month: number
  year: number
  status: EomRunStatus
  totalExGst: number | null
  totalGst: number | null
  invoiceCount: number
  lineItemCount: number
  flaggedCount: number
  firstInvoiceNumber: number | null
  lastInvoiceNumber: number | null
  xeroBatchId: string | null
  notes: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface EomLineItem {
  id: string
  runId: string
  clientName: string
  clientCode: string | null
  mondayItemId: string | null
  description: string
  quantity: number
  unitAmount: number
  accountCode: string
  taxType: string
  trackingOption1: string | null
  invoiceNumber: number | null
  source: EomLineItemSource
  confidence: EomConfidence
  matchedKeyword: string | null
  reviewStatus: EomReviewStatus
  reviewNotes: string | null
  originalValues: Record<string, any> | null
  createdAt: string
}

// ============================================
// Social Connections & Ad Spend Types
// ============================================
export type SocialPlatform = 'meta' | 'google' | 'linkedin' | 'tiktok' | 'pinterest' | 'snapchat' | 'twitter' | 'microsoft_ads'
export type ConnectionStatus = 'active' | 'expired' | 'disconnected'

export interface SocialConnection {
  id: string
  platform: SocialPlatform
  accountId: string
  accountName: string | null
  status: ConnectionStatus
  tokenExpiresAt: string | null
  scopes: string[]
  metadata: Record<string, any> | null
  connectedBy: string | null
  createdAt: string
  updatedAt: string
  health?: 'healthy' | 'expiring_soon' | 'expired' | 'stale_sync' | 'never_synced' | 'error'
  daysUntilExpiry?: number | null
}

export interface AdAccountClientMap {
  id: string
  connectionId: string
  campaignId: string | null
  campaignNamePattern: string | null
  xeroClientName: string
  xeroClientCode: string | null
  createdAt: string
}

export interface MetaSpendRecord {
  id: string
  clientId: string
  clientName: string
  platform: string
  period: string
  budgetAllocated: number
  actualSpend: number
  commissionRate: number
  commissionAmount: number
  campaignId: string | null
  campaignName: string | null
  impressions: number | null
  clicks: number | null
  conversions: number | null
  syncedAt: string | null
}

export interface MetaSpendSync {
  synced: number
  accounts: number
  totalSpend: number
}

// ============================================
// Google Ads Types
// ============================================
export interface GoogleAdsAccount {
  customerId: string
  name: string
  currencyCode: string
  status: string
}

export interface GoogleAdsSpendRecord {
  campaignId: string
  campaignName: string
  spend: number
  impressions: number
  clicks: number
  conversions: number
  date: string
}

export interface CampaignDailyPoint {
  date: string; spend: number; impressions: number; clicks: number
}
export interface CampaignSeries {
  campaignId: string; campaignName: string
  campaignType: string | null; status: string | null
  monthlySpend: number; monthlyBudget: number
  color: string; daily: CampaignDailyPoint[]
}
export interface DailyTotal {
  date: string; spend: number; budget: number; impressions: number; clicks: number
  conversions: number; revenue: number
}
export interface CampaignDailySpendResponse {
  campaigns: CampaignSeries[]; totals: DailyTotal[]; estimated?: boolean
}

// ============================================
// AI Chat Types
// ============================================
export type AiIntent =
  | 'task_query' | 'brief_query' | 'project_query' | 'financial_query'
  | 'team_query' | 'process_query' | 'time_tracking_query'
  | 'pricing_query' | 'code_query'
  | 'search' | 'action_request' | 'general'

export interface AiConversation {
  id: string
  userId: string
  title: string | null
  model: string
  systemContext: Record<string, any>
  messageCount: number
  lastMessageAt: string | null
  isArchived: boolean
  isPinned: boolean
  pinnedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AiContextSource {
  type: string
  id: string
  title: string
  snippet: string
  url: string
}

export interface AiMessage {
  id: string
  conversationId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  contextSources: AiContextSource[]
  tokenCount: number | null
  model: string | null
  latencyMs: number | null
  isError: boolean
  /** Read-tool trace for AI tool-calling turns (powers the "Consulted: …" chip). */
  toolCalls?: Array<{ name: string, args?: unknown }> | null
  /** Transient (not persisted): a guarded write the assistant proposed, rendered as a confirm card. toolName selects the card shape. */
  proposedAction?: { proposalId: string, resolved: any, toolName?: string } | null
  feedback?: AiFeedback | null
  createdAt: string
}

// ============================================
// AI Agent Types
// ============================================
export type AgentRunType = 'daily_digest' | 'weekly_report' | 'anomaly_scan' | 'manual'
export type AgentRunStatus = 'running' | 'completed' | 'failed'

export interface AiAgentRun {
  id: string
  runType: AgentRunType
  status: AgentRunStatus
  startedAt: string
  completedAt: string | null
  durationMs: number | null
  checksPerformed: number
  findingsCount: number
  notificationsSent: number
  errors: any[]
  summary: Record<string, any>
  createdAt: string
}

export interface AiAgentReportSection {
  title: string
  content: string
  type: 'summary' | 'findings' | 'recommendations' | 'metrics'
  severity?: 'info' | 'warning' | 'critical'
}

export interface AiAgentReport {
  id: string
  runId: string
  userId: string
  reportType: string
  title: string
  content: string
  sections: AiAgentReportSection[]
  notificationId: string | null
  isRead: boolean
  createdAt: string
}

export interface AiAgentPreferences {
  dailyDigest: boolean
  weeklyReport: boolean
  anomalyAlerts: boolean
  digestTime: string
  timezone: string
  reportFocus: string[]
}

// ============================================
// AI Knowledge Base Types
// ============================================
export type KnowledgeCategory = 'sop' | 'process' | 'faq' | 'client_preference' | 'best_practice'
export type KnowledgeSource = 'manual' | 'learned' | 'imported'

export interface AiKnowledgeArticle {
  id: string
  title: string
  content: string
  category: KnowledgeCategory | null
  tags: string[]
  embeddingId: string | null
  source: KnowledgeSource | null
  authorId: string | null
  isPublished: boolean
  viewCount: number
  usefulnessScore: number
  createdAt: string
  updatedAt: string
}

// ============================================
// AI Feedback Types
// ============================================
export interface AiFeedback {
  id: string
  messageId: string
  userId: string
  rating: -1 | 1
  correction: string | null
  category: string | null
  createdAt: string
}

export interface AiLearnedPattern {
  id: string
  patternType: string
  subject: string
  content: string
  confidence: number
  sourceCount: number
  sourceFeedbackIds: string[]
  embeddingId: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

// ============================================
// AI Training Pipeline Types
// ============================================
export type TrainingDatasetType = 'chat_qa' | 'intent' | 'rag' | 'knowledge' | 'combined'
export type TrainingDatasetStatus = 'pending' | 'extracting' | 'uploading' | 'ready' | 'failed' | 'archived'
export type LoraAdapterType = 'chat' | 'intent' | 'rag'
export type LoraAdapterStatus = 'pending' | 'uploading' | 'active' | 'testing' | 'retired' | 'failed'
export type TrainingKnowledgeType = 'sop' | 'client_context' | 'qa_pair' | 'workflow' | 'glossary'

export interface AiTrainingDataset {
  id: string
  datasetType: TrainingDatasetType
  version: number
  status: TrainingDatasetStatus
  format: string
  rowCount: number
  filteredCount: number
  fileSizeBytes: number
  r2Path: string | null
  extractionOptions: Record<string, any>
  qualityMetrics: Record<string, any>
  errorMessage: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface AiLoraAdapter {
  id: string
  name: string
  displayName: string | null
  modelBase: string
  version: number
  datasetId: string | null
  r2Path: string | null
  cfFinetuneId: string | null
  status: LoraAdapterStatus
  adapterType: LoraAdapterType
  rank: number
  trafficPct: number
  metrics: Record<string, any>
  errorMessage: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface AiTrainingKnowledge {
  id: string
  knowledgeType: TrainingKnowledgeType
  title: string
  content: string
  answer: string | null
  category: string | null
  tags: string[]
  clientId: string | null
  source: string | null
  sourceFile: string | null
  isApproved: boolean
  approvedBy: string | null
  approvedAt: string | null
  embeddingId: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface TrainingPipelineStats {
  totalDatasets: number
  totalKnowledgeEntries: number
  approvedKnowledgeEntries: number
  totalAdapters: number
  activeAdapters: number
  newDataSince: {
    chat_qa: { count: number; since: string | null }
    intent: { count: number; since: string | null }
    knowledge: { count: number; since: string | null }
  }
}

export interface LoraMetricsComparison {
  lora: { avgLatencyMs: number; avgRating: number; errorRate: number; sampleCount: number }
  base: { avgLatencyMs: number; avgRating: number; errorRate: number; sampleCount: number }
}

// ============================================
// Chat Types
// ============================================
export interface ChatChannel {
  id: string
  name: string
  slug: string
  description?: string
  type: 'channel' | 'dm' | 'group_dm'
  is_private: boolean
  created_by?: string
  department_id?: string
  task_id?: string
  avatar_url?: string
  archived_at?: string
  created_at: string
  updated_at: string
  // Computed in queries
  unread_count?: number
  last_read_message_id?: number
  muted_until?: string
  notify_level?: 'all' | 'mentions' | 'nothing'
  last_message?: ChatMessage
  members?: ChatChannelMember[]
}

export interface ChatChannelMember {
  channel_id: string
  user_id: string
  role: 'owner' | 'admin' | 'member'
  muted_until?: string
  last_read_message_id?: number
  joined_at: string
  // Joined
  name?: string
  avatar_url?: string
}

export interface ChatMessage {
  id: number
  channel_id: string
  user_id: string
  content: string
  thread_parent_id?: number
  reply_to_id?: number
  edited_at?: string
  deleted_at?: string
  forwarded_from_channel_id?: string
  forwarded_from_message_id?: number
  link_previews?: Array<{
    url: string
    title?: string
    description?: string
    image?: string
    favicon?: string
    siteName?: string
  }>
  metadata?: {
    attachments?: Array<{ url: string; name: string; type: string; size: number }>
    mentions?: string[]
    task_refs?: string[]
    forwarded?: boolean
    forwardedFrom?: { channelId?: string; messageId?: number; userName?: string }
  }
  created_at: string
  // Joined
  user_name?: string
  user_avatar?: string
  reactions?: Array<{ emoji: string; user_ids: string[]; count: number }>
  thread_count?: number
  pinned_at?: string
  pinned_by?: string
}

export interface FeedMessage {
  id: number
  channelId: string
  userId: string
  content: string
  metadata: ChatMessage['metadata'] | null
  createdAt: string
  userName: string
  userAvatar: string | null
  channelName: string
  channelSlug: string
  channelType: 'channel' | 'dm' | 'group_dm'
  channelIsPrivate: boolean
  threadCount: number
}

export type ChatPresenceStatus = 'online' | 'away' | 'dnd' | 'offline'

export interface UserChatStatus {
  userId: string
  status: ChatPresenceStatus
  customText: string | null
  lastSeenAt: string
  userName?: string
  userAvatar?: string
}

// ============================================
// Client Portal Types
// ============================================
export interface ClientUser {
  id: string
  email: string
  name: string
  title?: string
  phone?: string
  avatarUrl?: string
  role: 'admin' | 'manager' | 'viewer' | 'guest'
  isPrimaryContact: boolean
  clientId: string
  clientName: string
  clientLogo?: string
  permissions: ClientPermissions
  notificationPreferences: Record<string, boolean>
  timezone: string
}

export interface ClientPermissions {
  canViewProjects: boolean
  canViewInvoices: boolean
  canApproveWork: boolean
  canViewTimeEntries: boolean
  canViewBudgets: boolean
  canAddComments: boolean
  canUploadFiles: boolean
  canInviteUsers: boolean
  canViewAnalytics: boolean
  canSubmitRequests: boolean
}

// ============================================
// Banner Studio Types
// ============================================
export interface BannerProject {
  id: string
  name: string
  clientId: string | null
  clientName?: string
  canvasData: Record<string, any>
  thumbnailUrl: string | null
  status: 'draft' | 'published'
  tags: string[]
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface BannerAsset {
  id: string
  name: string
  mimeType: string
  fileSize: number
  r2Key: string
  url: string
  thumbnailUrl: string | null
  tags: string[]
  uploadedBy: string
  createdAt: string
}

export interface BannerTemplate {
  id: string
  name: string
  category: string
  canvasData: Record<string, any>
  thumbnailUrl: string | null
  isSystem: boolean
  createdBy: string | null
  createdAt: string
}

export interface BannerExport {
  id: string
  projectId: string
  formatKey: string
  r2Key: string
  url: string
  fileSize: number | null
  exportedBy: string
  exportedAt: string
}

// Client Portal: Job Requests + Support Tickets
export type ClientRequestType = 'job_request' | 'support_ticket'
export type ClientRequestPriority = 'low' | 'normal' | 'high' | 'urgent'
export type ClientRequestStatus = 'submitted' | 'in_review' | 'approved' | 'in_progress' | 'completed' | 'closed' | 'cancelled'

export interface ClientRequest {
  id: string
  clientId: string
  clientUserId: string
  requestType: ClientRequestType
  category: string | null
  title: string
  description: string
  priority: ClientRequestPriority
  status: ClientRequestStatus
  assignedTo: string | null
  assignedName: string | null
  assignedAvatar: string | null
  assignedRole: string | null
  projectId: string | null
  projectName: string | null
  taskId: string | null
  attachments: any[]
  estimatedBudget: number | null
  desiredDeadline: string | null
  responseNotes: string | null
  respondedBy: string | null
  respondedAt: string | null
  resolvedAt: string | null
  submittedByName: string | null
  createdAt: string
  updatedAt: string
}

export interface ClientRequestMessage {
  id: string
  requestId: string
  content: string
  attachments: any[]
  isInternal: boolean
  authorName: string | null
  authorAvatar: string | null
  authorType: 'client' | 'team'
  createdAt: string
}

// ============================================================================
// Leads engine — see docs/superpowers/specs/2026-04-30-leads-engine-design.md
// ============================================================================

export type LeadSource = 'meta' | 'google' | 'manual' | 'webhook' | 'csv'
export type LeadStatus =
  | 'new' | 'contacted' | 'qualified' | 'won' | 'lost' | 'spam_suspected'
export type LeadDeliveryStatus =
  | 'pending' | 'claimed' | 'delivered' | 'failed' | 'cancelled' | 'skipped'
export type LeadDestinationType =
  | 'portal' | 'webhook' | 'slack' | 'email' | 'sheets' | 'assign_user'
  | 'sms' | 'autoresponder_email' | 'autoresponder_sms'

export interface Lead {
  id: string
  client_id: string | null
  source: LeadSource
  source_lead_id: string
  form_id: string | null
  form_name: string | null
  ad_id: string | null
  ad_name: string | null
  campaign_id: string | null
  campaign_name: string | null
  page_id: string | null
  submitted_at: string
  ingested_at: string
  field_data: Record<string, string>
  attribution: Record<string, string> | null
  score: number | null
  score_reasons: any | null
  status: LeadStatus
  is_test?: boolean
  spam_reasons: any | null
  assigned_to: string | null
  contacted_at: string | null
  contacted_by: string | null
  notes: string | null
  created_by: string | null
  deleted_at: string | null
  created_at: string
}

export type LeadFilterOp =
  | 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte'
  | 'contains' | 'starts_with' | 'ends_with'
  | 'is_empty' | 'is_not_empty' | 'in' | 'not_in'

export interface LeadFilter {
  field: string                // dotted path: 'field_data.budget' | 'attribution.utm_source' | 'score'
  op: LeadFilterOp
  value?: string | number | boolean | string[] | null
}

export interface LeadFormRule {
  id: string
  client_id: string
  source: Exclude<LeadSource, 'manual'>
  form_id: string
  form_name: string | null
  enabled: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface LeadRuleDestination {
  id: string
  rule_id: string
  destination_type: LeadDestinationType
  config: Record<string, any>
  filter: LeadFilter | null
  delay_minutes: number
  enabled: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface LeadDelivery {
  id: string
  lead_id: string
  rule_destination_id: string | null
  destination_type: LeadDestinationType
  status: LeadDeliveryStatus
  scheduled_at: string
  claimed_at: string | null
  claimed_by: string | null
  attempted_at: string | null
  last_error: string | null
  retry_count: number
  response_meta: any | null
  idempotency_key: string
  created_at: string
  updated_at: string
}

export interface LeadFormMetadataField {
  key: string
  label?: string
  sample_value?: string
  first_seen_at: string
}

export interface LeadFormMetadata {
  id: string
  source: LeadSource
  form_id: string
  form_name: string | null
  fields: LeadFormMetadataField[]
  last_lead_at: string | null
  created_at: string
  updated_at: string
}

export interface LeadWebhookEndpoint {
  id: string
  client_id: string
  source: 'google' | 'meta_app'
  url_token: string
  secret_key: string
  secret_key_previous: string | null
  secret_key_grace_until: string | null
  rotated_at: string | null
  created_at: string
}

export type DispatchResult =
  | { status: 'delivered'; response_meta?: any }
  | { status: 'failed'; error: string; retry_after_ms?: number }

export * from './office'

// ── Social Publishing ───────────────────────────────────────────────
// NB: distinct from the spend-side `SocialPlatform` (meta/google/…) above.
export type SocialPublishPlatform = 'facebook' | 'instagram' | 'linkedin' | 'tiktok' | 'youtube' | 'google-business'

export type SocialPostStatus =
  | 'draft' | 'approved' | 'scheduled' | 'publishing'
  | 'published' | 'partially_published' | 'failed' | 'cancelled'

export interface SocialPlatformOverride {
  content?: string
  mediaUrls?: string[]
  options?: Record<string, unknown>
}

export interface SocialPublishTarget {
  platform: SocialPublishPlatform
  accountId: string
  options?: Record<string, unknown>
}

export interface SocialPlatformResult {
  status: string
  platform?: SocialPublishPlatform
  accountId?: string
  platformAccountId?: string
  accountName?: string | null
  platformPostId?: string
  url?: string
  error?: string | null
  firstComment?: {
    status: string
    platformPostId?: string
    url?: string
    error?: string | null
  }
}

export interface SocialPost {
  id: string
  client_id: string
  created_by: string | null
  content: string
  media_urls: string[] | null
  link_url: string | null
  hashtags: string[] | null
  first_comment: string | null
  platforms: SocialPublishPlatform[]
  account_ids: string[] | null
  publish_targets: SocialPublishTarget[] | null
  platform_overrides: Record<string, SocialPlatformOverride>
  tags: string[] | null
  scheduled_at: string | null
  timezone: string
  status: SocialPostStatus
  platform_results: Record<string, SocialPlatformResult>
  publish_attempts: number
  published_at: string | null
  last_attempt_at: string | null
  approval_requested_at: string | null
  approval_requested_by: string | null
  approved_by: string | null
  approved_at: string | null
  rejection_reason: string | null
  client_approval_status?: 'pending' | 'approved' | 'rejected' | 'revision_requested' | null
  client_approval_responded_by?: string | null
  client_approval_responded_at?: string | null
  client_approval_feedback?: string | null
  queue_position: number | null
  campaign_id: string | null
  assigned_to: string | null
  due_at: string | null
  metadata: Record<string, any>
  created_at: string
  updated_at: string
}

export type PortalSocialNewsApprovalStatus = 'pending' | 'approved' | 'rejected' | 'revision_requested'
export type PortalSocialNewsAction = 'approve' | 'reject' | 'request_changes'

export interface PortalSocialNewsDraft {
  id: string
  content: string
  mediaUrls: string[]
  platformPreviews: Array<{
    platform: string
    content: string
    mediaUrls: string[]
    isAiRewrite: boolean
  }>
  source: {
    title: string
    url: string | null
    author: string | null
    publishedAt: string | null
    attributionLocked: boolean
  }
  targetAccounts: Array<{ id: string, platform: string, name: string }>
  scheduledAt: string | null
  timezone: string
  approval: {
    status: PortalSocialNewsApprovalStatus
    requestedAt: string
    dueAt: string | null
    respondedAt: string | null
    respondedBy: string | null
    feedback: string | null
    internalStatus: string
  }
  package: {
    name: string
    version: number
    includedPostVolumes: Record<string, number>
    approvalSlaHours: number | null
    overagePolicy: string
    usageByPlatform: Record<string, number>
    warnings: string[]
  } | null
  audit: Array<{ action: string, createdAt: string, actorType: 'client' | 'agency' }>
}

export interface SocialAccount {
  id: string
  client_id: string
  platform: SocialPublishPlatform
  platform_account_id: string
  account_name: string | null
  is_active: boolean
  last_error: string | null
  token_expires_at: string | null
  last_synced_at: string | null
  metadata?: Record<string, any>
  has_refresh_token?: boolean
  linked_facebook_account_id?: string | null
  linked_facebook_account_name?: string | null
  connection_health?: 'healthy' | 'attention' | 'reconnect' | 'disconnected'
  connection_health_label?: string
  connection_health_reason?: string | null
  requires_reconnect?: boolean
  days_until_expiry?: number | null
  created_at: string
}

export interface SocialSlot {
  id: string
  client_id: string
  name: string
  platforms: SocialPublishPlatform[]
  day_of_week: number
  time_of_day: string
  timezone: string
  capacity: number
  enabled: boolean
}

// --- Social Planner (Slice 3) ---
export type SocialCampaignStatus = 'active' | 'planning' | 'archived'

export interface SocialCampaign {
  id: string
  client_id: string
  name: string
  color: string
  status: SocialCampaignStatus
  start_date: string | null
  end_date: string | null
  brief: string | null
  goal_post_count: number | null
  metadata: Record<string, any>
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface SocialCampaignWithCounts extends SocialCampaign {
  post_count: number
  scheduled_count: number
  published_count: number
}

export type SocialPlannerLane = 'draft' | 'needs_approval' | 'scheduled' | 'published'

export interface SocialBoardPost extends SocialPost {
  lane: SocialPlannerLane
  needs_attention: boolean
  campaign: Pick<SocialCampaign, 'id' | 'name' | 'color'> | null
}

export interface SocialGeneratedDraft {
  content: string
  platforms: SocialPublishPlatform[]
  platform_overrides: Record<string, { content: string }>
  hashtags: string[]
  suggested_scheduled_at: string | null
}

// --- Social Inbox (Slice 2) ---
export type SocialChannelType = 'comment' | 'dm' | 'mention' | 'review'
export type SocialInboxPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface SocialConversation {
  id: string
  client_id: string
  social_account_id: string | null
  social_account_name?: string | null
  social_account_platform_id?: string | null
  platform: string
  channel_type: SocialChannelType
  permalink: string | null
  participant_name: string | null
  participant_handle: string | null
  status: 'open' | 'snoozed' | 'closed'
  last_message_at: string | null
  last_message_preview: string | null
  last_message_direction: 'in' | 'out' | null
  unread_count: number
  message_count: number
  priority: SocialInboxPriority | null
  rating: number | null
  tags: string[] | null
  created_at: string
  // Slice 2c team workflow
  assigned_to?: string | null
  assigned_at?: string | null
  sla_due_at?: string | null
  first_response_at?: string | null
  sla_breached?: boolean
  // Enterprise native workflow links
  linked_task_id?: string | null
  linked_client_request_id?: string | null
  native_linked_by?: string | null
  native_linked_at?: string | null
  linked_social_campaign_id?: string | null
  paid_media_platform?: string | null
  paid_media_connection_id?: string | null
  paid_media_account_id?: string | null
  paid_media_campaign_id?: string | null
  paid_media_campaign_name?: string | null
  paid_media_linked_at?: string | null
  linked_task?: {
    id: string
    title: string
    status_name: string | null
    project_name: string | null
  } | null
  linked_client_request?: {
    id: string
    title: string
    status: string | null
    request_type: string | null
  } | null
}

export interface SocialMessageMetadata {
  source?: 'platform_sync' | 'provider_sync' | 'xeroflow'
  authorAvatarUrl?: string
  authorProfileUrl?: string
  likeCount?: number
  replyCount?: number
  reactionCount?: number
  reactionSummary?: Record<string, number>
  sourcePost?: {
    id?: string
    platform?: string
    title?: string
    text?: string
    imageUrl?: string
    thumbnailUrl?: string
    mediaType?: string
    permalink?: string
    publishedAt?: string
    authorName?: string
    authorAvatarUrl?: string
  }
  [key: string]: unknown
}

export interface SocialMessage {
  id: string
  conversation_id: string
  platform_message_id: string | null
  parent_message_id?: string | null
  direction: 'in' | 'out'
  author_id?: string | null
  author_name: string | null
  message_type: string
  content: string | null
  attachments: Array<{ url: string, type: string }>
  is_internal_note: boolean
  sent_by_user_id?: string | null
  metadata?: SocialMessageMetadata | null
  platform_timestamp: string | null
  created_at: string
}

export interface SocialWallAccount {
  id: string
  platform: SocialPublishPlatform
  account_name: string | null
  platform_account_id: string
}

export interface SocialWallMetric {
  impressions: number
  engagements: number
  clicks: number
  reach: number
  likes: number
  comments_count: number
  shares: number
  saves: number
  video_views: number
  reactions: number
}

export interface SocialWallEngagement {
  conversation_count: number
  open_count: number
  unread_count: number
  message_count: number
  latest_activity_at: string | null
}

export interface SocialWallPost extends SocialPost {
  campaign_name: string | null
  campaign_color: string | null
  accounts: SocialWallAccount[]
  engagement: SocialWallEngagement
  metrics: SocialWallMetric
  metrics_by_platform: Record<string, SocialWallMetric>
}

export interface SocialEngagementWallConversationSummary {
  id: string
  participant_name: string | null
  participant_handle: string | null
  channel_type: string
  status: string
  assigned_to: string | null
  unread_count: number
  rating: number | null
  last_message_preview: string | null
  last_message_at: string | null
  latest_author_name: string | null
  latest_author_avatar_url: string | null
}

export interface SocialEngagementWallPost {
  key: string
  client_id: string
  platform: string
  social_account_id: string | null
  account_name: string | null
  platform_account_id: string | null
  source_post_id: string | null
  source_post_url: string | null
  source_post_title: string | null
  source_post_content: string | null
  source_post_media: Array<{ url: string, type?: string | null, thumbnailUrl?: string | null }>
  source_post_author_name: string | null
  source_post_author_avatar_url: string | null
  source_post_published_at: string | null
  linked_social_post_id: string | null
  campaign_name: string | null
  status_summary: { open: number, snoozed: number, closed: number }
  unread_count: number
  conversation_count: number
  message_count: number
  latest_activity_at: string | null
  latest_conversations: SocialEngagementWallConversationSummary[]
}

export interface SocialInboxCaseTimelineItem {
  id: string
  source: 'social_message' | 'conversation_event' | 'task_activity' | 'client_request_message'
  type: string
  occurred_at: string | null
  actor_name: string | null
  content: string | null
  is_internal: boolean
  metadata: {
    direction?: 'in' | 'out'
    platform_message_id?: string | null
    message_type?: string | null
    linked_task_id?: string | null
    linked_client_request_id?: string | null
    task_id?: string
    task_title?: string
    old_value?: unknown
    new_value?: unknown
    client_request_id?: string
    client_request_title?: string
    request_status?: string | null
    author_type?: 'client' | 'team'
  } | null
}

export type SocialInboxTriageSentiment = 'positive' | 'neutral' | 'negative' | 'urgent'
export type SocialInboxTriageRisk = 'low' | 'medium' | 'high'

export type SocialInboxTriageAction
  = | { type: 'link_task', taskId: string, reason: string }
    | { type: 'create_social_case', title: string, description: string, reason: string }
    | { type: 'client_approval', reason: string }

export interface SocialInboxAiTriageResult {
  summary: string
  sentiment: SocialInboxTriageSentiment
  riskLevel: SocialInboxTriageRisk
  suggestedPriority: SocialInboxPriority | null
  suggestedTags: string[]
  approvalRecommended: boolean
  actions: SocialInboxTriageAction[]
}

export type SocialInboxAiActionInput
  = | { type: 'link_task', taskId?: string, reason?: string }
    | { type: 'create_social_case', departmentId?: string, projectId?: string, title?: string, description?: string, reason?: string }

export interface SocialInboxAiActionProposal {
  proposalId: string
  toolName: 'link_social_conversation_task' | 'create_social_case_task'
  resolved: Record<string, unknown>
}

export interface SocialInboxSyncResult {
  synced: number
  automated?: number
  breaches?: number
  skipped?: number
  timedOut?: boolean
  channels?: SocialInboxSyncChannelResult[]
}

export interface SocialInboxSyncChannelResult {
  accountId: string
  accountName?: string | null
  platform: string
  channelType: string
  status: 'success' | 'error' | 'skipped'
  synced: number
  error?: string
}

export interface SocialInboxAccountHealthCursor {
  channel_type: string
  last_synced_at: string | null
  last_error: string | null
}

export interface SocialInboxAccountHealth {
  id: string
  client_id: string
  platform: string
  platform_account_id: string
  account_name: string | null
  is_active: boolean
  last_error: string | null
  token_expires_at: string | null
  last_synced_at: string | null
  cursor_count: number
  cursor_error_count: number
  conversation_count: number
  latest_message_at: string | null
  status: 'healthy' | 'attention' | 'reauth' | 'inactive' | 'not_synced'
  cursors: SocialInboxAccountHealthCursor[]
}

// --- Social Inbox automation (Slice 2 Phase 2b) ---
export type SocialAutomationMode = 'off' | 'suggest' | 'approval' | 'autopilot'

export interface SocialAutomationRule {
  id: string
  client_id: string
  name: string
  platform: string | null
  channel_type: 'comment' | 'dm' | 'mention' | 'review' | null
  mode: SocialAutomationMode
  conditions: {
    ratingMin?: number
    ratingMax?: number
    keywordsAny?: string[]
    keywordsNone?: string[]
    businessHoursOnly?: boolean
  }
  action: { aiPrompt?: string }
  approval_by: 'staff' | 'client' | 'none'
  rate_limit: number
  confidence_floor: number
  business_hours: { tz: string; days: number[]; start: string; end: string } | null
  priority: number
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface SocialResponseQueueItem {
  id: string
  client_id: string
  conversation_id: string
  message_id: string | null
  rule_id: string | null
  draft_content: string
  confidence: number | null
  status: 'pending' | 'approved' | 'rejected' | 'sent' | 'failed' | 'skipped' | 'sending'
  effective_mode: 'approval' | 'autopilot'
  approver_type: 'staff' | 'client' | 'none'
  approved_by: string | null
  approved_at: string | null
  guardrail_notes: string | null
  error: string | null
  created_at: string
  updated_at: string
  // joined for display
  rule_name?: string | null
  platform?: string
  channel_type?: string
  participant_name?: string | null
  permalink?: string | null
  inbound_preview?: string | null
}

// --- Social Inbox team workflow (Slice 2c) ---
export interface SocialSavedReply {
  id: string
  client_id: string | null
  name: string
  category: string | null
  content: string
  platforms: string[] | null
  usage_count: number
  created_at: string
  updated_at: string
}

export interface SocialSlaPolicy {
  id: string
  client_id: string
  channel_type: string | null
  target_minutes: number
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface SocialInboxAnalytics {
  total: number
  open: number
  closed: number
  responded: number
  responseRatePct: number
  avgFirstResponseMinutes: number
  slaTracked: number
  breaches: number
  dueSoon: number
  overdueOpen: number
  withinSlaPct: number | null
  linkedTasks: number
  linkedClientRequests: number
  converted: number
  conversionRatePct: number
  automationRatePct: number
  byChannel: SocialInboxAnalyticsBreakdown[]
  byPlatform: SocialInboxAnalyticsBreakdown[]
}

export interface SocialInboxAnalyticsBreakdown {
  key: string
  label: string
  total: number
  open: number
  responded: number
  avgFirstResponseMinutes: number
  slaTracked: number
  breaches: number
  withinSlaPct: number | null
  converted: number
  conversionRatePct: number
}

export interface AudioAsset {
  id: string
  clientId: string | null
  createdBy: string
  kind: 'voiceover' | 'music'
  status: 'queued' | 'processing' | 'rendering' | 'done' | 'failed' | 'ready'
  title: string | null
  prompt: string | null
  lang: string | null
  voice: string | null
  channels: string[]
  r2KeyMaster: string | null
  variants: Record<string, string>
  durationSec: number | null
  costCents: number | null
  error: string | null
  createdAt: string
  updatedAt: string
  /** Music (Phase 2) fields — null on voiceover assets. */
  isInstrumental?: boolean | null
  lyrics?: string | null
  format?: string | null
  /** Short-lived presigned playback URL, minted by the API on read. */
  streamUrl?: string
  /** Short-lived per-channel variant download URLs (Phase 3 render tier). */
  variantUrls?: Record<string, string>
}

export interface VideoReview {
  id: string
  clientId: string
  mediaProjectId: string
  jobId: string
  format: string
  r2Key: string
  title: string | null
  status: 'pending' | 'approved' | 'rejected' | 'revision_requested'
  responseNotes: string | null
  respondedBy: string | null
  respondedAt: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface VideoAsset {
  id: string
  clientId: string | null
  createdBy: string
  title: string | null
  sourceProjectId: string | null
  sourceJobId: string | null
  r2Key: string
  format: string
  width: number | null
  height: number | null
  durationSec: number | null
  createdAt: string
  updatedAt: string
}

// --- Media Studio (Phase 1b SP0) ---
// camelCase shapes returned by server/utils/audio/projects.ts mappers.

export type MediaProjectStatus = 'draft' | 'in_review' | 'approved' | 'archived'

export interface MediaProject {
  id: string
  clientId: string | null
  createdBy: string
  title: string | null
  mediaType: 'audio' | 'av'
  status: MediaProjectStatus
  currentTimelineId: string | null
  createdAt: string
  updatedAt: string
}

export interface MediaTimeline {
  id: string
  projectId: string
  version: number
  label: string | null
  // The TimelineState contract lives in server/utils/audio/timelineSchema.ts.
  // Typed as unknown here to avoid a server-util import in the shared app types;
  // server code narrows it via TimelineStateSchema.
  state: unknown
  schemaVersion: number
  createdBy: string
  createdAt: string
}

export type MediaRenderJobStatus = 'queued' | 'rendering' | 'done' | 'failed'

export interface MediaRenderJob {
  id: string
  timelineId: string
  projectId: string
  channels: string[]
  status: MediaRenderJobStatus
  variants: Record<string, string>
  costCents: number | null
  error: string | null
  requestedBy: string
  createdAt: string
  updatedAt: string
}

export interface PageStudioSiteSummary {
  id: string
  clientId: string
  name: string
  route: string
  starterVersion: string
  status: string
  createdAt: string
  updatedAt: string
}

export interface PageStudioDocumentSite {
  clientId: string
  id: string
  name: string
  route: string
}

export interface PageStudioDocumentResponse {
  id: string
  document: import('~~/shared/pageStudio/document').PageStudioDocument
  pageLimit: number
  revision: number
  site: PageStudioDocumentSite
  updatedAt: string | null
}
