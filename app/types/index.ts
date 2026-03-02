// ============================================
// User Types
// ============================================
export interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'project_manager' | 'consultant' | 'client' | 'owner' | 'sales' | 'member' | 'viewer' | 'guest'
  is_active?: boolean
  avatar_url?: string
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