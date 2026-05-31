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
