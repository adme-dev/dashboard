// server/utils/leads/normalizer.ts
// Convert raw provider payloads into the InsertLeadInput shape consumed by db.ts.
// Pure: no DB, no env access.

import { randomUUID } from 'node:crypto'
import type { InsertLeadInput } from './db'

interface GoogleColumn {
  column_id?: string
  column_name?: string
  string_value: string
}
export interface GooglePayload {
  lead_id: string
  api_version?: string
  form_id?: string
  campaign_id?: string
  gcl_id?: string
  user_column_data: GoogleColumn[]
  google_key?: string
  is_test?: boolean
}

// Canonical map of Google's stable column_id enums → our snake_case keys.
// When Google sends one of these IDs, we use the canonical key regardless of
// what the advertiser named the question. Custom questions (CUSTOM_QUESTION_*
// or unmapped IDs) fall back to column_name normalization, which is fine for
// readability but unstable if the advertiser renames the question.
const GOOGLE_COLUMN_ID_MAP: Record<string, string> = {
  FULL_NAME: 'full_name',
  GIVEN_NAME: 'first_name',
  FAMILY_NAME: 'last_name',
  USER_EMAIL: 'email',
  WORK_EMAIL: 'work_email',
  USER_PHONE: 'phone_number',
  WORK_PHONE: 'work_phone',
  POSTAL_CODE: 'postcode',
  STREET_ADDRESS: 'address',
  CITY: 'city',
  REGION: 'state',
  COUNTRY: 'country',
  JOB_TITLE: 'job_title',
  COMPANY_NAME: 'company',
  MARITAL_STATUS: 'marital_status',
  BIRTHDAY: 'birthday',
}

function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
}

function googleColumnKey(c: GoogleColumn): string {
  // Prefer stable column_id when it's one we recognize.
  if (c.column_id && GOOGLE_COLUMN_ID_MAP[c.column_id]) {
    return GOOGLE_COLUMN_ID_MAP[c.column_id]
  }
  // Fallback: humanized column_name (advertiser-set label).
  if (c.column_name) {
    const k = normalizeKey(c.column_name)
    if (k) return k
  }
  // Last resort: column_id verbatim (lowercased) for unknown enums.
  if (c.column_id) return c.column_id.toLowerCase()
  return ''
}

export function normalizeGooglePayload(p: GooglePayload, clientId: string | null): InsertLeadInput {
  const fields: Record<string, string> = {}
  for (const c of p.user_column_data ?? []) {
    if (!c.string_value) continue
    const k = googleColumnKey(c)
    if (k) fields[k] = c.string_value
  }
  return {
    client_id: clientId,
    source: 'google',
    source_lead_id: String(p.lead_id),
    form_id: p.form_id ?? null,
    form_name: null,
    ad_id: null,
    ad_name: null,
    campaign_id: p.campaign_id ?? null,
    campaign_name: null,
    page_id: null,
    submitted_at: new Date().toISOString(),
    field_data: fields,
    attribution: p.gcl_id ? { gclid: p.gcl_id } : null,
    assigned_to: null,
    created_by: null,
    is_test: Boolean(p.is_test),
  }
}

export interface ManualInput {
  client_id: string
  field_data: Record<string, string>
  form_name?: string | null
  created_by: string
}

export function normalizeManualPayload(input: ManualInput): InsertLeadInput {
  return {
    client_id: input.client_id,
    source: 'manual',
    source_lead_id: randomUUID(),
    form_id: null,
    form_name: input.form_name ?? null,
    ad_id: null, ad_name: null,
    campaign_id: null, campaign_name: null,
    page_id: null,
    submitted_at: new Date().toISOString(),
    field_data: input.field_data,
    attribution: null,
    assigned_to: null,
    created_by: input.created_by,
    is_test: false,
  }
}

// ----------------------------------------------------------------------------
// Meta (Facebook / Instagram) Lead Ads
// ----------------------------------------------------------------------------

interface MetaLeadgenChange {
  field_data?: Array<{ name: string; values: string[] }>
  // From the leadgen webhook event itself (no field_data — caller fetches lead via Graph API)
  ad_id?: string
  form_id?: string
  leadgen_id?: string
  page_id?: string
  created_time?: number
  is_test?: boolean
}

export interface MetaLeadResolved {
  // What we get back after fetching GET /{leadgen_id} from Meta Graph API
  id: string
  field_data: Array<{ name: string; values: string[] }>
  ad_id?: string
  ad_name?: string
  form_id: string
  form_name?: string
  campaign_id?: string
  campaign_name?: string
  created_time?: string
  is_organic?: boolean
}

export function normalizeMetaPayload(
  resolved: MetaLeadResolved,
  pageId: string | null,
  clientId: string | null,
): InsertLeadInput {
  const fields: Record<string, string> = {}
  for (const f of resolved.field_data ?? []) {
    const v = (f.values ?? [])[0]
    if (!v) continue
    const k = normalizeKey(f.name)
    if (k) fields[k] = v
  }
  return {
    client_id: clientId,
    source: 'meta',
    source_lead_id: resolved.id,
    form_id: resolved.form_id,
    form_name: resolved.form_name ?? null,
    ad_id: resolved.ad_id ?? null,
    ad_name: resolved.ad_name ?? null,
    campaign_id: resolved.campaign_id ?? null,
    campaign_name: resolved.campaign_name ?? null,
    page_id: pageId,
    submitted_at: resolved.created_time ?? new Date().toISOString(),
    field_data: fields,
    attribution: null,
    assigned_to: null,
    created_by: null,
    is_test: false,
  }
}
