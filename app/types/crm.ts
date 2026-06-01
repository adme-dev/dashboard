// app/types/crm.ts
export interface CrmCompany {
  id: string
  client_id: string
  name: string
  domain: string | null
  phone: string | null
  employees: number | null
  address_line1: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string | null
  notes: string | null
  lifecycle_stage: string | null
  tags: string[]
  owner_id: string | null
  assigned_to: string | null
  custom_fields: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface CrmPerson {
  id: string
  client_id: string
  company_id: string | null
  first_name: string
  last_name: string | null
  email: string | null
  phone: string | null
  mobile: string | null
  job_title: string | null
  department: string | null
  city: string | null
  notes: string | null
  lifecycle_stage: string | null
  tags: string[]
  owner_id: string | null
  assigned_to: string | null
  custom_fields: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface CrmCustomField {
  id: string
  client_id: string
  object_type: 'person' | 'company'
  key: string
  label: string
  field_type: string
  options: string[]
  position: number
}

export interface CrmListResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface CrmStage {
  id: string
  client_id: string | null
  code: string
  name: string
  probability: number
  sort_order: number
  color: string
  is_won: boolean
  is_lost: boolean
  is_active: boolean
}

export interface CrmOpportunity {
  id: string
  client_id: string
  name: string
  person_id: string | null
  company_id: string | null
  stage_id: string
  owner_id: string | null
  amount: number
  probability: number
  weighted_value: number
  expected_close_date: string | null
  actual_close_date: string | null
  status: 'open' | 'won' | 'lost'
  source: string | null
  competitor: string | null
  lost_reason: string | null
  notes: string | null
  next_action: string | null
  next_action_date: string | null
  stage_changed_at: string
  custom_fields: Record<string, unknown>
  created_at: string
  updated_at: string
  person_name?: string | null
  company_name?: string | null
}

export interface CrmPipelineSummary {
  byStage: Record<string, { count: number, total: number, weighted: number }>
  openTotal: number
  weightedTotal: number
}

export interface CrmActivity {
  id: string
  client_id: string
  target_type: 'person' | 'company' | 'opportunity'
  target_id: string
  type: 'note' | 'call' | 'email' | 'meeting' | 'task' | 'stage_change' | 'system'
  title: string
  body: string | null
  scheduled_at: string | null
  completed_at: string | null
  is_completed: boolean
  metadata: Record<string, unknown>
  created_by: string | null
  created_at: string
  updated_at: string
}

// --- Custom-objects engine (Phase B) ---
export interface CrmObjectDef {
  id: string
  client_id: string
  vertical_key: string
  key: string
  label: string
  label_plural: string
  icon: string | null
  has_pipeline: boolean
  position: number
}

export interface CrmFieldDef {
  id: string
  client_id: string
  object_def_id: string
  key: string
  label: string
  field_type: string
  options: string[]
  relation_target: 'person' | 'company' | null
  is_required: boolean
  is_title: boolean
  position: number
}

export interface CrmRecord {
  id: string
  client_id: string
  object_def_id: string
  data: Record<string, unknown>
  stage_id: string | null
  created_at: string
  updated_at: string
}

// --- Sales Productivity (Phase 1) ---
export type CrmTaskType = 'call' | 'email' | 'sms' | 'meeting' | 'follow_up' | 'general'
export type CrmTaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type CrmTaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'
// 'overdue' is a derived (read-time) status, never persisted.
export type CrmTaskDerivedStatus = CrmTaskStatus | 'overdue'
export type CrmTaskOutcome =
  | 'contacted' | 'voicemail' | 'no_answer' | 'rescheduled' | 'converted' | 'not_interested'

export interface CrmTask {
  id: string
  client_id: string
  target_type: 'person' | 'company' | 'opportunity'
  target_id: string
  title: string
  description: string | null
  task_type: CrmTaskType
  priority: CrmTaskPriority
  status: CrmTaskStatus
  derived_status?: CrmTaskDerivedStatus
  due_at: string | null
  reminder_at: string | null
  completed_at: string | null
  outcome: CrmTaskOutcome | null
  assigned_to: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CrmTaskFilters {
  target_type?: 'person' | 'company' | 'opportunity'
  target_id?: string
  status?: string
  priority?: string
  task_type?: string
  assigned_to?: string
  page?: number
  page_size?: number
}

export interface CrmStageAutomationTemplate {
  title: string
  task_type: CrmTaskType
  priority: CrmTaskPriority
  due_offset_days: number
  assigned_to?: string | null
}

export interface CrmStageAutomation {
  id: string
  client_id: string
  stage_id: string
  object_type: string
  action: 'create_task'
  task_template: CrmStageAutomationTemplate
  is_active: boolean
  created_at: string
}

export type CrmScoreType = 'lead' | 'health'
export type CrmGrade = 'Hot' | 'Warm' | 'Cold'

export interface CrmScore {
  id: string
  client_id: string
  target_type: 'person' | 'company'
  target_id: string
  score_type: CrmScoreType
  total_score: number
  grade: CrmGrade
  engagement_score: number
  intent_score: number
  fit_score: number
  recency_score: number
  score_version: number
  computed_at: string
  updated_at: string
}

export interface CrmScoreComponents {
  engagement: number
  intent: number
  fit: number
  recency: number
  total: number
  grade: CrmGrade
}

export interface CrmOpportunityStageHistoryRow {
  id: string
  client_id: string
  opportunity_id: string
  from_stage_id: string | null
  to_stage_id: string
  changed_by: string | null
  changed_at: string
}

// --- Data Quality, Relationships & Governance (Phase 2) ---
export type CrmEndpointType = 'person' | 'company'

export interface CrmRelationship {
  id: string
  client_id: string
  from_type: CrmEndpointType
  from_id: string
  to_type: CrmEndpointType
  to_id: string
  relationship_type: string
  is_decision_maker: boolean
  is_primary_contact: boolean
  notes: string | null
  created_by: string | null
  created_at: string
}

export interface CrmAuditRow {
  id: string
  client_id: string
  entity_type: string
  entity_id: string
  field: string
  old_value: string | null
  new_value: string | null
  changed_by: string | null
  changed_at: string
}

export type CrmAssignmentStrategy = 'round_robin' | 'load_balanced' | 'priority' | 'single'

export interface CrmAssignmentRule {
  id: string
  client_id: string
  object_type: 'person' | 'opportunity'
  strategy: CrmAssignmentStrategy
  pool: string[]
  assignment_index: number
  is_active: boolean
  created_at: string
}

export interface CrmMergeLogRow {
  id: string
  client_id: string
  entity_type: CrmEndpointType
  winner_id: string
  loser_id: string
  detail: Record<string, unknown>
  merged_by: string | null
  merged_at: string
}

export interface CrmSettings {
  client_id: string
  record_visibility: 'team' | 'owner'
  updated_at: string
}

// ── Phase 3: Power-User UX & Integrations ────────────────────────────────────

export type CrmEntity = 'people' | 'companies' | 'opportunities'

/** F8 — a unified search hit across CRM entities. */
export type CrmSearchTargetType = 'person' | 'company' | 'opportunity' | 'activity' | 'task'
export interface CrmSearchResult {
  type: CrmSearchTargetType
  id: string
  title: string
  subtitle: string | null
  rank: number
}

/** F9 — a saved list view (filters + visible columns). */
export interface CrmView {
  id: string
  client_id: string
  entity: CrmEntity
  name: string
  filters: Record<string, unknown>
  columns: string[]
  is_shared: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

/** F10 — a logged communication on the unified timeline. */
export type CrmCommChannel = 'email' | 'call' | 'sms' | 'meeting' | 'note'
export type CrmCommDirection = 'inbound' | 'outbound'
export type CrmCommSource = 'manual' | 'email_bridge' | 'lead_bridge'
export interface CrmCommunication {
  id: string
  client_id: string
  person_id: string | null
  company_id: string | null
  channel: CrmCommChannel
  direction: CrmCommDirection | null
  subject: string | null
  body: string | null
  occurred_at: string
  external_id: string | null
  source: CrmCommSource
  metadata: Record<string, unknown>
  created_by: string | null
  created_at: string
}

/** F10 — contact-preference flags (live on the person record). */
export interface CrmContactPrefs {
  do_not_contact: boolean
  do_not_email: boolean
  do_not_call: boolean
  do_not_sms: boolean
  preferred_channel: string | null
  best_time: string | null
}

/** F13 — a document/attachment stored in R2 against a record. */
export interface CrmDocument {
  id: string
  client_id: string
  target_type: 'person' | 'company' | 'opportunity'
  target_id: string
  file_key: string
  file_name: string
  content_type: string | null
  size_bytes: number | null
  document_type: string | null
  expires_at: string | null
  uploaded_by: string | null
  created_at: string
}

/** F14 — an opportunity line-item (line_total is generated). */
export interface CrmLineItem {
  id: string
  client_id: string
  opportunity_id: string
  description: string
  quantity: number
  unit_price: number
  line_total: number
  position: number
}

/** F15 — a per-rep sales target over a window, with computed attainment. */
export type CrmTargetType = 'revenue' | 'count'
export interface CrmSalesTarget {
  id: string
  client_id: string
  user_id: string
  period_start: string
  period_end: string
  target_type: CrmTargetType
  target_value: number
  created_at: string
}
export interface CrmAttainmentRow {
  user_id: string
  user_name: string | null
  target_type: CrmTargetType
  target_value: number
  actual: number
  attainment_pct: number
}
