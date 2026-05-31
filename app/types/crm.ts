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
