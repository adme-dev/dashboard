// scripts/backfill-lead-crm-promotions.ts
//
// Recovers lead → CRM promotions that failed while CRM search was dormant
// (2026-08-11 → fix deploy): every trusted CRM context lookup hit
// `relation "crm_search_organisation_scopes" does not exist`, so the lead row
// was stored but no crm_people / crm_opportunities / lead_crm_links /
// crm_activities rows were written. See docs/runbooks/lead-crm-promotion-backfill.md.
//
// DRY-RUN BY DEFAULT. Read-only: counts and per-outcome predictions only, no
// customer data is printed.
//
//   export DATABASE_URL=...   # prod, read access is enough for the dry run
//   pnpm exec tsx --tsconfig .nuxt/tsconfig.server.json scripts/backfill-lead-crm-promotions.ts
//
// APPLY (only after the fix is deployed to production and an owner approves):
//
//   LEAD_CRM_BACKFILL_CONFIRM=apply-crm-promotions \
//     pnpm exec tsx --tsconfig .nuxt/tsconfig.server.json scripts/backfill-lead-crm-promotions.ts --apply [--limit 50]
//
// Apply calls the same crmLeadPromotionService.promote(leadId) the queue uses,
// one lead per transaction. It is idempotent: promote() locks the lead row and
// returns `already_promoted` when a lead_crm_links row exists for
// (client_id, lead_id) (unique constraint), and the link records the
// provider's source_lead_id as source_reference. It writes CRM rows only — it
// does NOT re-run routing rules, destinations, notifications, conversions or
// any outbound contact.

import { extractCrmCustomerIdentity } from '../server/utils/leads/crmPromotion'

// Outside Nitro there is no request context; make the db layer use DATABASE_URL directly.
;(globalThis as { useEvent?: () => unknown }).useEvent ??= () => ({ context: {} })

interface CandidateRow {
  lead_id: string
  client_id: string
  source: string
  field_data: Record<string, string> | null
}

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const limitIndex = args.indexOf('--limit')
const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : null
if (limit !== null && (!Number.isInteger(limit) || limit <= 0)) {
  console.error('[backfill] --limit must be a positive integer')
  process.exit(1)
}

function bump(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1)
}

async function main() {
  if (apply && process.env.LEAD_CRM_BACKFILL_CONFIRM !== 'apply-crm-promotions') {
    console.error(
      '\n[backfill] REFUSING to apply.\n'
      + '  Set LEAD_CRM_BACKFILL_CONFIRM=apply-crm-promotions and pass --apply.\n'
      + '  Run the dry run first and get owner approval (see docs/runbooks/lead-crm-promotion-backfill.md).\n'
    )
    process.exit(1)
  }

  const { queryRows } = await import('../server/utils/db')

  // Candidates: stored, non-test, non-deleted leads whose promotion is not
  // completed/skipped and that have no CRM link yet, for clients that promote
  // internally today.
  const candidates = await queryRows<CandidateRow>(
    `SELECT l.id::text AS lead_id, l.client_id::text AS client_id, l.source, l.field_data
       FROM lead_crm_promotion_state s
       JOIN leads l ON l.id = s.lead_id
       JOIN agency_clients c ON c.id = l.client_id
      WHERE s.status IN ('failed', 'pending', 'processing')
        AND l.deleted_at IS NULL
        AND l.is_test = FALSE
        AND c.is_active = TRUE
        AND c.lead_capture_mode IN ('lightweight_crm', 'full_crm')
        AND NOT EXISTS (
          SELECT 1 FROM lead_crm_links k WHERE k.client_id = l.client_id AND k.lead_id = l.id
        )
      ORDER BY l.created_at ASC
      ${limit ? `LIMIT ${limit}` : ''}`
  )

  const bySource = new Map<string, number>()
  const byClient = new Map<string, number>()
  const predicted = new Map<string, number>()
  const promotable: CandidateRow[] = []
  for (const row of candidates) {
    bump(bySource, row.source)
    bump(byClient, row.client_id)
    const { identity, missing } = extractCrmCustomerIdentity(row.field_data ?? {})
    if (!identity) {
      bump(predicted, `insufficient_identity:${missing.join('+')}`)
      continue
    }
    const matches = await queryRows<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM crm_people
        WHERE client_id = $1 AND deleted_at IS NULL
          AND (($2::text IS NOT NULL AND lower(trim(email)) = $2)
            OR (cardinality($3::text[]) > 0 AND
                regexp_replace(COALESCE(NULLIF(mobile, ''), phone, ''), '[^0-9]', '', 'g') = ANY($3::text[])))`,
      [row.client_id, identity.email, identity.phoneVariants]
    )
    const n = Number(matches[0]?.n ?? 0)
    bump(predicted, n === 0 ? 'promote:new_person' : n === 1 ? 'promote:existing_person' : 'identity_conflict')
    if (n <= 1) promotable.push(row)
  }

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry_run',
    candidates: candidates.length,
    by_source: Object.fromEntries(bySource),
    clients: byClient.size,
    per_client_counts: [...byClient.values()].sort((a, b) => b - a),
    predicted_outcomes: Object.fromEntries(predicted)
  }, null, 2))

  if (!apply) {
    console.log('\n[backfill] Dry run only. Nothing was written.')
    return
  }

  const { crmLeadPromotionService } = await import('../server/utils/leads/crmPromotion')
  const { markCrmPromotionResult, markCrmPromotionStarted, markCrmPromotionFailure } = await import(
    '../server/utils/leads/crmPromotionState'
  )
  const results = new Map<string, number>()
  for (const row of promotable) {
    await markCrmPromotionStarted(row.lead_id)
    try {
      const result = await crmLeadPromotionService.promote(row.lead_id)
      await markCrmPromotionResult(row.lead_id, result.status)
      bump(results, result.status)
    } catch (error) {
      await markCrmPromotionFailure(row.lead_id, error)
      bump(results, `exception:${(error as { code?: string })?.code ?? (error instanceof Error ? error.name : 'unknown')}`)
    }
  }
  console.log(JSON.stringify({ applied: promotable.length, results: Object.fromEntries(results) }, null, 2))
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error('[backfill] failed', error instanceof Error ? error.message : error)
    process.exit(1)
  }
)
