# Design — Intent-tier scoring (Phase C, item 2 of 4)

Date: 2026-07-27

## Problem

The persona/cohort system in this codebase has two halves that don't talk to each other. `cohorts.ts`'s `getAudienceCohortPreview()` scores subjects against `crm_persona_definitions` (3 seeded automotive personas already exist: `active_vehicle_shopper`, `finance_ready`, `returning_high_intent`, matched via positive/negative signal-key sets) — but this is preview/reporting-only. The actual live export path, `audienceSync.ts`'s `loadEligibleMembers`, selects Meta/Google Customer Match audience members purely by attribution filters (platform, campaign, landing page, date range) — it never consults persona scoring at all. So today, "personas" are something account managers can look at, not something they can export as an audience.

This is item 2 of 4 candidate Phase C (ad-spend efficiency) items from the `2026-07-26-phase-b-shipped-phase-c-next.md` handoff. The user's own framing called intent-tier scoring (hot/warm/cold from cross-shop depth + VDP dwell + form-start) "the single highest-leverage item" — but delivering it for real means closing the gap above: wiring tier qualification into the live export pipeline, not just the preview.

## Scope

**In scope:**
- Three new ranked tier definitions (Hot/Warm/Cold), built from Phase B's new signal-ledger events plus existing intent signals — see Tier Definitions below.
- A precomputed, nightly-refreshed tier-membership table, joined into the real export pipeline (`loadEligibleMembers`) so a tier can be a genuine audience filter, not just a preview stat.
- Binary signal-presence matching only (reusing the existing `scorePersonaDefinition` engine as-is).

**Explicitly out of scope (deliberate, not overlooked):**
- **Numeric threshold signals** (e.g. "VDP dwell > 60s"). The current engine only matches discrete signal-key presence/absence; extending it to numeric thresholds is a real data-model change to `crm_persona_definitions` and `scorePersonaDefinition`, deferred as a fast-follow. v1 uses only discrete Phase B events (`vehicle_comparison`, `return_to_vehicle`) as proxies for shopping depth.
- **Exclusion audiences** (bounce <3s, `competitive_referrer` click) — this is Phase C item 3 (a separate handoff item), not folded into tier scoring. Tiers here are additive-only; none of the 3 new tier definitions use `negative_signals`.
- **Live/on-demand tier computation.** Tiers are precomputed nightly, not recalculated at export time. Accepted staleness: bounded by refresh cadence, and not meaningfully worse than Meta/Google's own multi-hour Customer Match audience processing lag.
- **Retrofitting `getPersonaMetrics`** (the lead-based metrics query used for activation-request size estimates) to understand tiers. It's a large, separate concept from audience-membership selection; tier-filtered size estimates use a small dedicated count against the new table instead (see Export Pipeline Wiring).
- **New UI.** No Vue component exists today for creating persona activation requests at all — this remains API/backend-only, consistent with how this feature has shipped so far.

## Why a precomputed table, not live SQL scoring or the existing preview cache

Three approaches were considered for making tier membership a real export-time filter:

1. **Precomputed tier-membership table, refreshed nightly** (chosen). A batch job runs the existing, already-tested `scorePersonaDefinition` JS logic over recent signals and writes `(client_id, profile_id) → tier_key` into a new table. `loadEligibleMembers` gains one simple join. Reuses one scoring implementation as the single source of truth; keeps the live export query's complexity bounded in a path that already carefully handles consent and suppression.
2. **Compute tier membership live in SQL at export time** — rejected. Would require reimplementing positive/negative signal-set matching as raw SQL, recreating the exact "two disconnected implementations that can drift" problem this feature exists to fix, just relocated into the query itself. Adds scoring complexity to a security/privacy-sensitive query.
3. **Extend the existing cohort-preview cache (`crm_audience_cohort_snapshots`) to double as the export source** — rejected. That cache is tuned for a fast UI preview (15-minute TTL, stores aggregate counts, not member lists) and conflates two consumers with different durability and PII-surface needs.

## Tier definitions

Three new rows in `crm_persona_definitions` (`vertical = 'automotive'`, following the existing seed pattern from migration 295), ranked so a profile qualifying for multiple tiers gets the highest one:

| Rank | Tier | Positive signals | Rationale |
|---|---|---|---|
| 1 (highest) | **Hot** | `form_start`, `add_to_wishlist`, `test_drive_booking`, `finance_calculator_interact`, `trade_in_start`, `generate_lead`, `lead_created` | Near-conversion intent — action beyond browsing |
| 2 | **Warm** | `vehicle_comparison`, `return_to_vehicle` | Cross-shop depth and repeat consideration (Phase B's new signal-ledger events) |
| 3 (lowest) | **Cold** | `vehicle_view`, `vehicle_list_view`, `search`, `filter_change` | Baseline browsing — present, no depth signal yet |

No `negative_signals` on these three (see Scope). A profile with zero signals in the lookback window gets no tier at all — not a "cold-by-default" fallback, since absence of any signal is not evidence of cold-tier browsing.

## Data model

New migration:

```sql
BEGIN;

ALTER TABLE crm_persona_definitions
  ADD COLUMN tier_rank INTEGER NULL;

CREATE TABLE crm_persona_tier_memberships (
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL,
  tier_key TEXT NOT NULL CHECK (tier_key IN ('hot', 'warm', 'cold')),
  matched_signals TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (client_id, profile_id),
  CONSTRAINT crm_persona_tier_memberships_profile_fk
    FOREIGN KEY (client_id, profile_id)
    REFERENCES crm_identity_profiles(client_id, id)
    ON DELETE CASCADE
);

CREATE INDEX idx_crm_persona_tier_memberships_tier
  ON crm_persona_tier_memberships (client_id, tier_key);

-- Seed the 3 ranked tier definitions (same idempotent WHERE NOT EXISTS
-- pattern as migration 295's original 3 personas).
INSERT INTO crm_persona_definitions (
  client_id, vertical, persona_key, version, label, description,
  positive_signals, negative_signals, min_confidence, tier_rank,
  allowed_channels, targeting_allowed, reporting_allowed, status
)
SELECT NULL, seed.vertical, seed.persona_key, 1, seed.label, seed.description,
       seed.positive_signals::jsonb, '[]'::jsonb, 0.01, seed.tier_rank,
       ARRAY['google', 'meta']::TEXT[], TRUE, TRUE, 'active'
FROM (
  VALUES
    ('automotive', 'tier_hot', 'Hot', 'Near-conversion intent.',
     '["form_start","add_to_wishlist","test_drive_booking","finance_calculator_interact","trade_in_start","generate_lead","lead_created"]',
     1),
    ('automotive', 'tier_warm', 'Warm', 'Cross-shop depth and repeat consideration.',
     '["vehicle_comparison","return_to_vehicle"]',
     2),
    ('automotive', 'tier_cold', 'Cold', 'Baseline browsing.',
     '["vehicle_view","vehicle_list_view","search","filter_change"]',
     3)
) AS seed(vertical, persona_key, label, description, positive_signals, tier_rank)
WHERE NOT EXISTS (
  SELECT 1 FROM crm_persona_definitions existing
  WHERE existing.client_id IS NULL AND existing.vertical = seed.vertical
    AND existing.persona_key = seed.persona_key AND existing.version = 1
);

COMMIT;
```

`min_confidence = 0.01` is intentionally near-zero: tier qualification is "matched at least one positive signal," not a confidence threshold — the existing `scorePersonaDefinition` confidence score (matched/total positive signals) isn't the mechanism doing the ranking here; rank order is.

One row per profile in `crm_persona_tier_memberships` — the primary key on `(client_id, profile_id)` directly enforces "exactly one current tier."

## Recompute job

Nightly, via this codebase's existing `workers/pages-cron` companion-worker pattern (Cloudflare Pages has no native `scheduled()` handler). For each client with persona identity enabled:

1. Aggregate `crm_customer_signals` from the last 30 days (matching `cohorts.ts`'s existing default lookback), grouped by `profile_id`, scoped to resolved profiles only (`profile_id IS NOT NULL` — an anonymous signal can't be exported to an ad platform regardless of tier).
2. For each profile, run a new `resolveHighestTier(tierDefinitions, signalKeys)` helper — wraps the existing `scorePersonaDefinition`, iterating the 3 tier definitions in rank order and returning the first that qualifies (or `null`).
3. Inside one transaction *per client*: delete all existing `crm_persona_tier_memberships` rows for that client, then bulk-insert the fresh results. Full delete+reinsert (not incremental upsert) — simpler and correct at this table's expected scale (bounded by a client's total identified profiles), and avoids needing a separate "no longer qualifies" cleanup pass, since a profile whose signals aged out of the 30-day window simply doesn't appear in the fresh insert set.

Skips clients where `isPersonaIdentityEnabled()` is false, same gate used everywhere else in this pipeline. One client's failure doesn't block recompute for others (per-client transaction, not one global transaction).

## Export pipeline wiring

**`PersonaMetricsFilters`** (`server/utils/persona/metrics.ts`) gains an optional `tierKey?: 'hot' | 'warm' | 'cold'` — this is the same filters shape stored as JSONB on `crm_persona_audience_activation_requests` and read back for both size estimation and the actual export, so one type change covers both consumers.

**`loadEligibleMembers`** (`audienceSync.ts`): when `context.filters.tierKey` is present, the candidates CTE gains a join:
```sql
candidates AS (
   SELECT DISTINCT signal.profile_id
     FROM crm_customer_signals signal
     JOIN crm_persona_tier_memberships tier
       ON tier.client_id = signal.client_id
      AND tier.profile_id = signal.profile_id
      AND tier.tier_key = $N
    WHERE ${candidatesFilterSql}
)
```
Everything downstream (consent check, suppression check, PII resolution) is unchanged — tiering only narrows which profiles enter the pipeline. **With no tier filter, the query is byte-for-byte identical to today** — same regression-safety pattern as the conversion-value-passing item's "omit when null."

**Size estimation** (`activation.ts`'s `createPersonaActivationRequest`): when `filters.tierKey` is present, use a small dedicated count against the new table (`SELECT COUNT(*) FROM crm_persona_tier_memberships WHERE client_id = $1 AND tier_key = $2`, further joined against any other attribution filters the same way `loadEligibleMembers` does) instead of `getPersonaMetrics`. Non-tier-filtered requests are completely unchanged — still use `getPersonaMetrics` exactly as today. `getPersonaMetrics` itself is not modified.

## Error handling & edge cases

- A profile matching zero tier definitions gets no row — not a cold-by-default fallback (see Tier Definitions).
- A client missing the 3 tier definitions (e.g. persona identity just enabled, seed hasn't run yet) produces zero tier rows for that client; tier-filtered activation requests correctly show 0 estimated size / 0 candidates rather than erroring — same non-fatal-empty-result philosophy as `getAudienceCohortPreview`'s existing handling of an unconfigured client.
- Per-client transaction isolation in the recompute job bounds blast radius and lock duration.

## Testing

- Migration contract test (new table, columns, index, `tier_rank` column, 3 seeded tier rows with correct ranks) — static SQL-text assertions, matching this codebase's convention (no test database in this project).
- `resolveHighestTier`: multiple qualifying tiers → highest wins; no qualifying tier → `null`; single match → that tier.
- Recompute job: correct tier assignment from a mocked signal set; 30-day window applied; profiles with no matching signals get no row; per-client transaction isolation confirmed.
- `loadEligibleMembers`: tier filter adds the correct join/params; no tier filter → identical query to today (regression test).
- `createPersonaActivationRequest`: tier-filtered request uses the new count query; non-tier-filtered request is unchanged.

## Non-goals (deferred to later Phase C items or future work)

- Numeric-threshold signals (VDP dwell time) — the current engine's binary signal-presence model is used as-is; extending it is a real, separate data-model change.
- Exclusion audiences (Phase C item 3) and micro-conversions to GA4/Google Ads (Phase C item 4) remain separate, unscoped items — not touched here.
- No UI for creating tier-filtered activation requests — this feature has no UI at all yet, consistent with its current state.
