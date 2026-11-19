# Lead → CRM promotion backfill (dormant CRM search incident)

## What happened

From 2026-08-11 (merge of #384, commit `461cab2a1` "fix(crm): align authority scope
contracts") every trusted CRM context (`resolveTrustedCrmSystemContext`) read
`crm_search_organisation_scopes`. That table only exists after migrations 350–352,
which are intentionally **not** applied in production while CRM search is dormant
(`CRM_SEARCH_PROVIDER_APIS_ENABLED="false"`, enforced by `scripts/deploy-pages.mjs`).
Every lead CRM promotion therefore failed with `42P01`:

- the `leads` row **was stored** and routing rules ran;
- no `crm_people` / `crm_opportunities` / `lead_crm_links` / `crm_activities` rows were
  written (`lead_crm_promotion_state.status = 'failed'`);
- the promotion runs inline, so `acceptLead` rethrew after the lead was committed: the
  webhook logged `lead_ingestion_errors` (only the last 30 days survive retention) and
  skipped the account-manager new-lead notification. Providers still got HTTP 200.

The fix (PR "Leads: CRM promotion no longer fails while CRM search is dormant") resolves a
search-dormant trusted context when the `crm_search_*` schema is absent and stops a CRM
promotion failure from aborting ingestion.

## Backfill

`scripts/backfill-lead-crm-promotions.ts` replays **only** the CRM promotion for stored
leads whose promotion is `failed|pending|processing` and that have no `lead_crm_links`
row. It calls the production `crmLeadPromotionService.promote(leadId)` — one lead per
transaction, idempotent via the `(client_id, lead_id)` unique link and the lead row lock
(`source_lead_id` is recorded as the link's `source_reference`). It does not re-run rules,
destinations, notifications, conversions or any outbound contact.

1. **Prerequisite:** the fix is deployed to production (otherwise every apply fails again).
2. **Dry run (read-only, counts only):**

   ```bash
   export DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"')
   pnpm exec tsx --tsconfig .nuxt/tsconfig.server.json scripts/backfill-lead-crm-promotions.ts
   ```

   2026-11-19 dry run: 284 candidates (262 dealer-feed webhook, 22 Meta) across 2 clients
   (South Morang Motor Group 262, Northern Motor Group 22); predicted 282 new people +
   2 matched to existing people, 0 identity conflicts, 0 insufficient identity. Candidates
   are processed oldest first, so a repeat customer's later leads link to the person
   created by their first lead.
3. **Approval:** the owner (Paul) approves; tell the dealers' account managers first —
   ~280 new opportunities will appear in the `new` stage with original lead timestamps
   in metadata (CRM `created_at` will be the backfill time).
4. **Apply** (optionally in batches with `--limit 50`; re-running is safe):

   ```bash
   LEAD_CRM_BACKFILL_CONFIRM=apply-crm-promotions \
     pnpm exec tsx --tsconfig .nuxt/tsconfig.server.json scripts/backfill-lead-crm-promotions.ts --apply
   ```

5. **Verify:** `SELECT status, COUNT(*) FROM lead_crm_promotion_state GROUP BY 1` — failed
   should drop to ~0; re-run the dry run, expect 0 candidates.
