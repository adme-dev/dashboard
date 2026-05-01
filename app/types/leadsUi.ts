import type { Lead, LeadSource, LeadStatus } from '~/types'

export interface LeadsListFilters {
  client_id: string | null
  unmapped: boolean
  source: LeadSource | null
  form_id: string | null
  status: LeadStatus | null
  assigned_to: string | null
  q: string
  from: string | null
  to: string | null
  include_test: boolean
}

export interface LeadsListResponse {
  items: Lead[]
  total: number
  page: number
  page_size: number
}

export const DEFAULT_FILTERS: LeadsListFilters = {
  client_id: null, unmapped: false, source: null, form_id: null,
  status: null, assigned_to: null, q: '', from: null, to: null,
  include_test: false,
}
