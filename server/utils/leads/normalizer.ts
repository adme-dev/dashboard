// server/utils/leads/normalizer.ts
// Convert raw provider payloads into the InsertLeadInput shape consumed by db.ts.
// Pure: no DB, no env access.

import { randomUUID } from 'node:crypto'
import type { InsertLeadInput } from './db'

interface GoogleColumn { column_name: string; string_value: string }
export interface GooglePayload {
  lead_id: string
  api_version?: string
  form_id?: string
  campaign_id?: string
  gcl_id?: string
  user_column_data: GoogleColumn[]
  google_key?: string
}

function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
}

export function normalizeGooglePayload(p: GooglePayload, clientId: string | null): InsertLeadInput {
  const fields: Record<string, string> = {}
  for (const c of p.user_column_data ?? []) {
    if (!c.string_value) continue
    const k = normalizeKey(c.column_name)
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
  }
}
