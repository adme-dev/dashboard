// POST /api/leads/import-csv
//
// Bulk-import leads from a CSV (typically Meta Lead Center export). Bridges
// the gap until Meta leads_retrieval App Review lands.
//
// Body (JSON):
//   {
//     client_id: string,
//     source: 'meta' | 'csv',
//     form_id?: string,
//     form_name?: string,
//     run_rules?: boolean,           // fan-out via destinations? default false
//     csv: string,                    // raw CSV text (header row + data rows)
//     column_mapping?: Record<string, string>  // optional override of header → key
//   }
//
// Returns: { imported, skipped, errors }

import { z } from 'zod'
import { upsertFormMetadata } from '~~/server/utils/leads/db'
import {
  acceptLead,
  resolveLeadCaptureMode
} from '~~/server/utils/leads/acceptance'
import { resolveAssignedAm } from '~~/server/utils/leads/autoAssign'
import { randomUUID } from 'node:crypto'

const Body = z.object({
  client_id: z.string().uuid(),
  source: z.enum(['meta', 'csv']).default('meta'),
  form_id: z.string().optional(),
  form_name: z.string().optional(),
  run_rules: z.boolean().default(false),
  csv: z.string().min(1),
  column_mapping: z.record(z.string(), z.string()).optional(),
})

// Header normalisation — Meta's export uses some standard headers. Map these
// to canonical lead-engine keys; everything else is humanized.
const META_HEADER_MAP: Record<string, string> = {
  // Common Meta headers (case-insensitive match)
  'full name': 'full_name',
  'full_name': 'full_name',
  'name': 'full_name',
  'first name': 'first_name',
  'first_name': 'first_name',
  'last name': 'last_name',
  'last_name': 'last_name',
  'email': 'email',
  'email address': 'email',
  'phone': 'phone_number',
  'phone number': 'phone_number',
  'phone_number': 'phone_number',
  'mobile': 'phone_number',
  'postal code': 'postcode',
  'postal_code': 'postcode',
  'zip': 'postcode',
  'city': 'city',
  'state': 'state',
  'country': 'country',
  'company': 'company',
  'company name': 'company',
  'job title': 'job_title',
  'job_title': 'job_title',
}

// Meta-specific columns we don't want as field_data (they're metadata).
const META_RESERVED_HEADERS = new Set([
  'id', 'lead_id', 'created_time', 'submission_date', 'submitted_at',
  'campaign_id', 'campaign_name', 'adset_id', 'adset_name',
  'ad_id', 'ad_name', 'form_id', 'form_name', 'platform',
])

function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
}

// Tiny CSV parser. Handles quoted fields, escaped quotes, CRLF / LF line endings.
// Sufficient for Meta's well-formed export. For pathological input we'd reach
// for papaparse, but that adds 50KB to the bundle.
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  let i = 0
  const n = text.length

  while (i < n) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue }
        inQuotes = false
        i++
        continue
      }
      cell += ch
      i++
      continue
    }
    if (ch === '"') { inQuotes = true; i++; continue }
    if (ch === ',') { row.push(cell); cell = ''; i++; continue }
    if (ch === '\r') { i++; continue }
    if (ch === '\n') {
      row.push(cell)
      // Skip blank trailing lines
      if (row.length > 1 || row[0].trim() !== '') rows.push(row)
      row = []
      cell = ''
      i++
      continue
    }
    cell += ch
    i++
  }
  // Final cell
  row.push(cell)
  if (row.length > 1 || row[0].trim() !== '') rows.push(row)
  return rows
}

interface ImportResult {
  imported: number
  skipped_duplicate: number
  errors: Array<{ row: number; message: string }>
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_body', data: parsed.error.issues })
  }
  const input = parsed.data

  const rows = parseCsv(input.csv)
  if (rows.length < 2) {
    throw createError({ statusCode: 400, statusMessage: 'empty_csv' })
  }

  const headers = rows[0].map((h) => h.trim())
  const dataRows = rows.slice(1)

  // Build header → canonical key map
  const headerToKey: Record<number, string> = {}
  headers.forEach((h, idx) => {
    const lower = h.toLowerCase().trim()
    if (META_RESERVED_HEADERS.has(lower)) { headerToKey[idx] = '' /* skip */ ; return }
    if (input.column_mapping?.[h]) { headerToKey[idx] = input.column_mapping[h]; return }
    if (META_HEADER_MAP[lower]) { headerToKey[idx] = META_HEADER_MAP[lower]; return }
    const k = normalizeKey(h)
    headerToKey[idx] = k || `field_${idx}`
  })

  // Find positional indexes for metadata fields if present.
  const idxLeadId = headers.findIndex((h) => /^(id|lead_id|leadgen_id)$/i.test(h.trim()))
  const idxCreated = headers.findIndex((h) => /^(created_time|submission_date|submitted_at)$/i.test(h.trim()))

  const assignedAm = await resolveAssignedAm(input.client_id)
  const leadCaptureMode = await resolveLeadCaptureMode(input.client_id)
  if (leadCaptureMode === 'analytics_only') {
    throw createError({ statusCode: 409, statusMessage: 'Lead capture is disabled for this client' })
  }
  const aggregated: Record<string, string> = {}  // accumulate sample for form metadata

  const result: ImportResult = { imported: 0, skipped_duplicate: 0, errors: [] }

  for (let r = 0; r < dataRows.length; r++) {
    const cols = dataRows[r]
    if (cols.every((c) => !c.trim())) continue
    const fields: Record<string, string> = {}
    cols.forEach((val, idx) => {
      const key = headerToKey[idx]
      if (!key) return
      const trimmed = val.trim()
      if (!trimmed) return
      fields[key] = trimmed
    })
    if (!Object.keys(fields).length) continue

    Object.assign(aggregated, fields)

    const sourceLeadId =
      (idxLeadId >= 0 && cols[idxLeadId]?.trim())
        ? cols[idxLeadId].trim()
        : `csv-${randomUUID()}`

    const submittedAt =
      (idxCreated >= 0 && cols[idxCreated]?.trim())
        ? new Date(cols[idxCreated].trim()).toISOString()
        : new Date().toISOString()

    try {
      const accepted = await acceptLead(event, {
        lead: {
        client_id: input.client_id,
        source: input.source,
        source_lead_id: sourceLeadId,
        form_id: input.form_id ?? null,
        form_name: input.form_name ?? null,
        ad_id: null, ad_name: null,
        campaign_id: null, campaign_name: null,
        page_id: null,
        submitted_at: submittedAt,
        field_data: fields,
        attribution: null,
        assigned_to: assignedAm,
        created_by: user.id,
        is_test: false
        },
        leadCaptureMode,
        consentDecision: 'unknown',
        runRules: input.run_rules
      })
      if (accepted.status !== 'created') { result.skipped_duplicate++; continue }
      result.imported++
    } catch (e: any) {
      result.errors.push({ row: r + 2, message: e?.message ?? 'insert_failed' }) // r+2 = 1-indexed + header
    }
  }

  if (input.form_id && Object.keys(aggregated).length) {
    try {
      await upsertFormMetadata(input.source as any, input.form_id, input.form_name ?? null, aggregated)
    } catch { /* not fatal */ }
  }

  return result
})
