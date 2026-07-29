// server/utils/leads/db.ts
// Thin DB primitives for the leads engine. Wraps queryRows/queryOne/execute
// from ~~/server/utils/db. Keeps SQL out of route handlers.

import { queryRows, queryOne, execute } from '~~/server/utils/db'
import type {
  Lead, LeadDelivery, LeadFormRule, LeadRuleDestination,
  LeadFormMetadata, LeadFormMetadataField, LeadSource
} from '~~/app/types'

// ----------------------------------------------------------------------------
// Leads
// ----------------------------------------------------------------------------

export interface InsertLeadInput {
  client_id: string | null
  source: LeadSource
  source_lead_id: string
  form_id: string | null
  form_name: string | null
  ad_id: string | null
  ad_name: string | null
  campaign_id: string | null
  campaign_name: string | null
  page_id: string | null
  submitted_at: string
  field_data: Record<string, string>
  attribution: Record<string, string> | null
  assigned_to: string | null
  created_by: string | null
  is_test?: boolean
}

export interface LeadTransactionClient {
  query(sql: string, params?: unknown[]): Promise<{ rows?: unknown[] }>
}

/** Terminal states shared by private lead-ingestion adapters. */
export type LeadIngestionTerminalStatus = 'accepted' | 'duplicate' | 'quarantined'

/** INSERT … ON CONFLICT DO NOTHING RETURNING id. Returns null if duplicate. */
export async function insertLeadWithDedup(
  input: InsertLeadInput,
  db?: LeadTransactionClient
): Promise<string | null> {
  const sql = `
    INSERT INTO leads (
      client_id, source, source_lead_id, form_id, form_name,
      ad_id, ad_name, campaign_id, campaign_name, page_id,
      submitted_at, field_data, attribution, assigned_to, created_by, is_test
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14, $15, $16
    )
    ON CONFLICT (source, source_lead_id) WHERE deleted_at IS NULL
    DO NOTHING
    RETURNING id
  `
  const params = [
    input.client_id, input.source, input.source_lead_id, input.form_id, input.form_name,
    input.ad_id, input.ad_name, input.campaign_id, input.campaign_name, input.page_id,
    input.submitted_at,
    JSON.stringify(input.field_data),
    input.attribution ? JSON.stringify(input.attribution) : null,
    input.assigned_to, input.created_by, Boolean(input.is_test)
  ]
  const row = db
    ? (await db.query(sql, params)).rows?.[0] as { id: string } | undefined
    : await queryOne<{ id: string }>(sql, params)
  return row?.id ?? null
}

export async function loadLead(id: string): Promise<Lead | null> {
  return queryOne<Lead>(`SELECT * FROM leads WHERE id = $1 AND deleted_at IS NULL`, [id])
}

export async function softDeleteLead(id: string): Promise<number> {
  return execute(`UPDATE leads SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`, [id])
}

export async function purgeLead(id: string): Promise<number> {
  // ON DELETE CASCADE handles lead_deliveries
  return execute(`DELETE FROM leads WHERE id = $1`, [id])
}

// ----------------------------------------------------------------------------
// Form metadata
// ----------------------------------------------------------------------------

/**
 * Upsert form metadata, unioning newly-observed field keys.
 * Stable for concurrent ingestions (uses jsonb_object_agg pattern).
 */
export async function upsertFormMetadata(
  source: LeadSource,
  form_id: string,
  form_name: string | null,
  fieldData: Record<string, string>
): Promise<void> {
  const newFields: LeadFormMetadataField[] = Object.entries(fieldData).map(([key, value]) => ({
    key,
    sample_value: typeof value === 'string' ? value.slice(0, 200) : String(value),
    first_seen_at: new Date().toISOString()
  }))

  // Pull current fields, union by key, write back. Single round trip via CTE.
  await execute(`
    INSERT INTO lead_form_metadata (source, form_id, form_name, fields, last_lead_at)
    VALUES ($1, $2, $3, $4::jsonb, NOW())
    ON CONFLICT (source, form_id) DO UPDATE SET
      form_name = COALESCE(EXCLUDED.form_name, lead_form_metadata.form_name),
      last_lead_at = EXCLUDED.last_lead_at,
      -- Dedup by key, keep earliest first_seen_at. (jsonb_agg(DISTINCT f) was
      -- broken because each new entry's first_seen_at made every row unique.)
      fields = (
        SELECT jsonb_agg(winner ORDER BY (winner->>'key'))
        FROM (
          SELECT DISTINCT ON (f->>'key') f AS winner
          FROM (
            SELECT jsonb_array_elements(lead_form_metadata.fields) AS f
            UNION ALL
            SELECT jsonb_array_elements(EXCLUDED.fields) AS f
          ) all_fields
          ORDER BY (f->>'key'), (f->>'first_seen_at') ASC
        ) deduped
      ),
      updated_at = NOW()
  `, [source, form_id, form_name, JSON.stringify(newFields)])
}

export async function listFormMetadata(): Promise<LeadFormMetadata[]> {
  return queryRows<LeadFormMetadata>(
    `SELECT * FROM lead_form_metadata ORDER BY last_lead_at DESC NULLS LAST`
  )
}

export async function loadFormMetadata(
  source: LeadSource,
  form_id: string
): Promise<LeadFormMetadata | null> {
  return queryOne<LeadFormMetadata>(
    `SELECT * FROM lead_form_metadata WHERE source = $1 AND form_id = $2`,
    [source, form_id]
  )
}

// ----------------------------------------------------------------------------
// Rules + destinations
// ----------------------------------------------------------------------------

export async function loadRuleForForm(
  source: Exclude<LeadSource, 'manual'>,
  form_id: string,
  client_id: string | null
): Promise<{ rule: LeadFormRule, destinations: LeadRuleDestination[] } | null> {
  if (!client_id) return null
  const rule = await queryOne<LeadFormRule>(
    `SELECT * FROM lead_form_rules
     WHERE source = $1 AND form_id = $2 AND client_id = $3`,
    [source, form_id, client_id]
  )
  if (!rule) return null
  const destinations = await queryRows<LeadRuleDestination>(
    `SELECT * FROM lead_rule_destinations
     WHERE rule_id = $1 AND enabled = TRUE
     ORDER BY sort_order ASC, created_at ASC`,
    [rule.id]
  )
  return { rule, destinations }
}

// ----------------------------------------------------------------------------
// Deliveries
// ----------------------------------------------------------------------------

export interface InsertDeliveryInput {
  lead_id: string
  rule_destination_id: string
  destination_type: string
  scheduled_at: string
  idempotency_key: string
}

export async function insertDelivery(input: InsertDeliveryInput): Promise<string> {
  const row = await queryOne<{ id: string }>(`
    INSERT INTO lead_deliveries (
      lead_id, rule_destination_id, destination_type,
      scheduled_at, idempotency_key, status
    )
    VALUES ($1, $2, $3, $4, $5, 'pending')
    RETURNING id
  `, [
    input.lead_id, input.rule_destination_id, input.destination_type,
    input.scheduled_at, input.idempotency_key
  ])
  return row!.id
}

export async function insertCancelledPlaceholder(
  lead_id: string,
  reason: string
): Promise<void> {
  await execute(`
    INSERT INTO lead_deliveries (
      lead_id, destination_type, status, scheduled_at,
      idempotency_key, last_error
    )
    VALUES ($1, '_placeholder', 'cancelled', NOW(), $2, $3)
  `, [lead_id, `cancel:${lead_id}`, reason])
}

/**
 * Atomic claim: marks pending → claimed if no one else got it first.
 * Returns the full delivery row when claimed, null otherwise.
 */
export async function claimDelivery(
  delivery_id: string,
  worker_id: string
): Promise<LeadDelivery | null> {
  return queryOne<LeadDelivery>(`
    UPDATE lead_deliveries
    SET status = 'claimed', claimed_at = NOW(), claimed_by = $2, updated_at = NOW()
    WHERE id = $1 AND status = 'pending'
    RETURNING *
  `, [delivery_id, worker_id])
}

export async function releaseClaim(delivery_id: string): Promise<void> {
  await execute(`
    UPDATE lead_deliveries
    SET status = 'pending', claimed_at = NULL, claimed_by = NULL, updated_at = NOW()
    WHERE id = $1 AND status = 'claimed'
  `, [delivery_id])
}

export async function markDelivered(
  delivery_id: string,
  response_meta: unknown
): Promise<void> {
  await execute(`
    UPDATE lead_deliveries
    SET status = 'delivered', attempted_at = NOW(), response_meta = $2::jsonb, updated_at = NOW()
    WHERE id = $1
  `, [delivery_id, JSON.stringify(response_meta ?? null)])
}

export async function markFailed(
  delivery_id: string,
  error: string,
  retry_count: number,
  finalized: boolean
): Promise<void> {
  await execute(`
    UPDATE lead_deliveries
    SET status = $4, attempted_at = NOW(), last_error = $2,
        retry_count = $3, claimed_at = NULL, claimed_by = NULL, updated_at = NOW()
    WHERE id = $1
  `, [delivery_id, error, retry_count, finalized ? 'failed' : 'pending'])
}

export async function markSkipped(delivery_id: string, reason: string): Promise<void> {
  await execute(`
    UPDATE lead_deliveries
    SET status = 'skipped', last_error = $2, attempted_at = NOW(),
        claimed_at = NULL, claimed_by = NULL, updated_at = NOW()
    WHERE id = $1
  `, [delivery_id, reason])
}

export async function recoverStuckClaims(staleMinutes = 5): Promise<number> {
  return execute(`
    UPDATE lead_deliveries
    SET status = 'pending', claimed_at = NULL, claimed_by = NULL, updated_at = NOW()
    WHERE status = 'claimed' AND claimed_at < NOW() - MAKE_INTERVAL(mins => $1::int)
  `, [staleMinutes])
}

// ----------------------------------------------------------------------------
// Ingestion error log
// ----------------------------------------------------------------------------

export async function logIngestionError(
  source: LeadSource,
  raw_payload: unknown,
  headers: unknown,
  error: string
): Promise<void> {
  await execute(`
    INSERT INTO lead_ingestion_errors (source, raw_payload, headers, error)
    VALUES ($1, $2::jsonb, $3::jsonb, $4)
  `, [source, JSON.stringify(raw_payload ?? null), JSON.stringify(headers ?? null), error])
}
