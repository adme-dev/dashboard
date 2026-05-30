// server/api/leads/rules/[ruleId]/test-fire.post.ts
// Synthesizes a sample lead from form metadata, runs filter eval per destination,
// dispatches via the adapter, and returns per-destination result. Persists nothing.

import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { execute, queryOne, queryRows } from '~~/server/utils/db'
import { evaluateFilter } from '~~/server/utils/leads/filterEval'
import { getAdapter } from '~~/server/utils/leads/destinations'
import { deliveryIdempotencyKey } from '~~/server/utils/leads/idempotency'
import type { Lead, LeadDelivery } from '~~/app/types'

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.MEDIA_BUYING)
  const ruleId = getRouterParam(event, 'ruleId')!
  const overrides = (await readBody(event)) as { field_data?: Record<string, string> } | null

  const rule: any = await queryOne(`SELECT * FROM lead_form_rules WHERE id = $1`, [ruleId])
  if (!rule) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  const meta: any = await queryOne(
    `SELECT * FROM lead_form_metadata WHERE source = $1 AND form_id = $2`,
    [rule.source, rule.form_id],
  )
  const sampleFields: Record<string, string> = {}
  for (const f of (meta?.fields ?? [])) {
    if (f.sample_value) sampleFields[f.key] = f.sample_value
  }
  const fakeLead: Lead = {
    id: 'TEST-LEAD',
    client_id: rule.client_id,
    source: rule.source,
    source_lead_id: 'test-fire',
    form_id: rule.form_id,
    form_name: rule.form_name,
    ad_id: null, ad_name: null, campaign_id: null, campaign_name: null,
    page_id: null,
    submitted_at: new Date().toISOString(),
    ingested_at: new Date().toISOString(),
    field_data: { ...sampleFields, ...(overrides?.field_data ?? {}) },
    attribution: null, score: null, score_reasons: null, status: 'new',
    spam_reasons: null, assigned_to: null, contacted_at: null, contacted_by: null,
    notes: null, created_by: null, deleted_at: null,
    created_at: new Date().toISOString(),
  }

  const destinations: any[] = await queryRows(
    `SELECT * FROM lead_rule_destinations WHERE rule_id = $1 ORDER BY sort_order`,
    [ruleId],
  )
  const results: any[] = []
  for (const d of destinations) {
    if (!d.enabled) { results.push({ id: d.id, skipped: 'disabled' }); continue }
    if (!evaluateFilter(fakeLead, d.filter)) { results.push({ id: d.id, skipped: 'filter' }); continue }
    const adapter = getAdapter(d.destination_type)
    if (!adapter) { results.push({ id: d.id, skipped: 'unknown_type' }); continue }
    const fakeDelivery: LeadDelivery = {
      id: 'TEST-DELIVERY',
      lead_id: fakeLead.id,
      rule_destination_id: d.id,
      destination_type: d.destination_type,
      status: 'claimed',
      scheduled_at: new Date().toISOString(),
      claimed_at: new Date().toISOString(),
      claimed_by: 'test',
      attempted_at: null,
      last_error: null,
      retry_count: 0,
      response_meta: null,
      idempotency_key: deliveryIdempotencyKey('TEST-LEAD', d.id),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    const r = await adapter.dispatch(fakeDelivery, fakeLead, d.config)
    results.push({ id: d.id, type: d.destination_type, ...r })
  }
  // Stamp the rule so the editor's "Verify" step stays checked across reloads.
  await execute(`UPDATE lead_form_rules SET last_test_fired_at = NOW() WHERE id = $1`, [ruleId])
  return { ok: true, lead_used: fakeLead, results }
})
