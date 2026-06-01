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
