# Design — Exclusion Audiences (Phase C, item 3 of 4)

Date: 2026-07-27

## Problem

`crm_persona_definitions.negative_signals` exists in the schema (migration 295) but has exactly one reader in the entire codebase: `scorePersonaDefinition()` in `server/utils/persona/cohorts.ts`, which uses it purely to *disqualify* a subject from a positive cohort in the client-facing preview (`getAudienceCohortPreview`). The live Meta/Google export path — `loadEligibleMembers()` in `server/utils/persona/audienceSync.ts` — never reads `crm_persona_definitions` at all; it only knows about `crm_persona_tier_memberships` (Phase C item 2's positive intent tiers). So negative signals today have zero effect on what actually gets exported to ad platforms.

Two real, already-tracked signals are being collected and discarded for targeting purposes: `competitive_referrer` and `exit_intent` both fire in `public/track.js` and land in `crm_customer_signals` via `signalLedger.ts`, classified as `'behaviour'`, but nothing downstream ever uses them to suppress ad spend on these visitors.

This item closes that gap: a standalone "exclude these people" audience, exportable to Meta/Google the same way tier audiences are, built from negative signals that already exist.

## Scope

### In scope (v1)
- One blended exclusion audience per client, membership computed from `competitive_referrer` OR `exit_intent` occurring in the trailing 30 days (same lookback window the tier-recompute job already uses).
- Nightly precomputation via the existing tier-recompute cron (extended, not duplicated).
- Export through the existing activation-request → sync → provider-delivery pipeline, unchanged from how tier audiences are exported today.

### Explicitly out of scope (deferred, not overlooked)
- **Bounce-duration derivation.** No `bounce` event, and no session-exit/elapsed-time event of any kind, exists anywhere in `public/track.js` or `signalLedger.ts` — confirmed by full grep. The only duration-bearing signal, `engagement`, fires the opposite way (presence at ≥30s thresholds), not an early-exit read. Deriving "bounce <3s" would require new client-side instrumentation (an unload-time beacon) plus extending `scorePersonaDefinition` to understand numeric thresholds instead of binary signal presence — the same class of gap Phase C item 2 deferred for VDP dwell time. Left as a named follow-up, not folded into this item.
- **Per-reason split audiences** (e.g. a separate "Competitor Shoppers" list distinct from "Low-Engagement Exits"). V1 ships one blended list; the schema doesn't preclude splitting later.
- **Automating the platform-side "set as exclusion" campaign step.** This system creates and syncs a named audience list; attaching it to a campaign as an exclusion rule (vs. inclusion) in Meta/Google Ads Manager stays a manual account-manager action, identical to how tier audiences are attached today.
- **Client-level override of which signals trigger exclusion.** The schema supports it (the same `client_id`-override mechanism every persona definition already has) but no UI/API surfaces it yet — same non-goal Phase C item 2 already carries for tiers.

## Why this shape, not the alternatives

Three approaches were considered for computing and storing exclusion membership:

1. **Extend the existing tier-recompute cron with a second resolver (chosen).** The nightly job already aggregates each profile's last-30-days signal keys once per client to feed `resolveHighestTier()`. Adding a sibling pure function, `resolveIsExcluded()`, fed by the *same* aggregation avoids a second table scan, reuses `scorePersonaDefinition` with zero new scoring logic, and keeps one cron trigger to operate.
2. **Live/on-demand scoring, no membership table.** Rejected for the same reasons the Phase C item 2 design doc already rejected this for tiers: slower at export time, no `matched_signals` audit trail, and `runPersonaAudienceSync`'s diff-based sync would recompute from scratch every run instead of diffing against a stable snapshot.
3. **A separate dedicated cron/endpoint for exclusion recompute.** Cleanest separation of concerns in isolation, but a second full `crm_customer_signals` scan per client per night and a second secret-gated endpoint/cron trigger to register, for logic that shares ~90% of its signal-aggregation with the tier job.

Approach 1 is refined to avoid entangling two concerns in one function: the per-client job builds *one* shared signal-aggregation map, then calls two independent, individually-testable resolvers (`resolveHighestTier`, `resolveIsExcluded`) against it, writing to two membership tables in the same per-client transaction.

## Data Model

Migration `312_persona_exclusion_audiences.sql`, additive/idempotent, same style as 311:

```sql
BEGIN;

-- Marks a persona_definitions row as an exclusion audience rather than a
-- positive targeting cohort. Reuses scorePersonaDefinition unchanged: an
-- exclusion definition sets positive_signals to the trigger signals,
-- negative_signals empty, min_confidence near-zero (0.01, same trick
-- migration 311 used for tiers) so "qualifies" reduces to "matched at
-- least one trigger signal," not a weighted score.
ALTER TABLE crm_persona_definitions
  ADD COLUMN IF NOT EXISTS is_exclusion BOOLEAN NOT NULL DEFAULT FALSE;

-- One row per profile currently in the exclusion set, recomputed nightly
-- alongside tier memberships from the same signal aggregation. Single
-- blended list (no per-reason breakdown table) per the v1 scope decision;
-- matched_signals still records which trigger(s) fired, for debugging.
CREATE TABLE IF NOT EXISTS crm_persona_exclusion_memberships (
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL,
  matched_signals TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (client_id, profile_id),
  CONSTRAINT crm_persona_exclusion_memberships_profile_fk
    FOREIGN KEY (client_id, profile_id)
    REFERENCES crm_identity_profiles(client_id, id)
    ON DELETE CASCADE
);

-- Seed the one system-level exclusion definition (client_id NULL, same
-- override-per-client mechanism crm_persona_definitions already supports
-- for tiers/personas, available later without new plumbing).
INSERT INTO crm_persona_definitions (
  client_id, vertical, persona_key, version, label, description,
  positive_signals, negative_signals, min_confidence, is_exclusion,
  allowed_channels, targeting_allowed, reporting_allowed, status
)
SELECT NULL, 'automotive', 'negative_signal_exclusion', 1,
       'Negative Signal Exclusion',
       'Visitors who showed competitor-shopping or early-exit intent.',
       '["competitive_referrer","exit_intent"]'::jsonb, '[]'::jsonb,
       0.01, TRUE, ARRAY['google','meta']::TEXT[], TRUE, TRUE, 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM crm_persona_definitions existing
  WHERE existing.client_id IS NULL AND existing.vertical = 'automotive'
    AND existing.persona_key = 'negative_signal_exclusion' AND existing.version = 1
);

COMMIT;
```

No new index beyond the primary key — unlike tiers (which need `(client_id, tier_key)` to filter one of three values), a single blended list is always looked up by the full `(client_id, profile_id)` key the PK already covers.

## Recompute Job Wiring

**`server/utils/persona/cohorts.ts`** — add a sibling resolver next to `resolveHighestTier()`:

```ts
export function resolveIsExcluded(
  signalKeys: Set<string>,
  exclusionDefs: PersonaDefinition[]
): { excluded: boolean; matchedSignals: string[] } {
  const matched = new Set<string>()
  for (const def of exclusionDefs) {
    const result = scorePersonaDefinition(def, signalKeys)
    if (result.qualifies) result.positive.forEach(s => matched.add(s))
  }
  return { excluded: matched.size > 0, matchedSignals: [...matched] }
}
```

Plus `activeExclusionDefinitions(clientId)` alongside the existing `activeTierDefinitions(clientId)` — same client-override-merge query, filtered on `is_exclusion = TRUE` instead of `tier_rank IS NOT NULL`.

**`server/utils/persona/tierRecompute.ts`** — rename `recomputeClientTiers` → `recomputeClientPersonaMemberships` and top-level `recomputePersonaTiers` → `recomputePersonaMemberships`, since "tiers" no longer describes everything the function computes; a misleading name here would confuse the next reader more than a rename costs. One call site to update: the cron endpoint (`server/api/cron/persona-tier-recompute.post.ts`, path unchanged — no reason to touch the registered cron trigger for a rename).

Per client:
1. Load both `activeTierDefinitions` and `activeExclusionDefinitions`; skip the client only if *both* are empty (previously bailed if tier defs alone were empty).
2. Run the existing signal-aggregation query unchanged (profile → signal_keys, `occurred_at >= NOW() - INTERVAL '30 days'`).
3. Per profile: `resolveHighestTier()` if tier defs exist, `resolveIsExcluded()` if exclusion defs exist — independent, both operate on the same in-memory `signalKeys` set.
4. One transaction per client, extended with a second delete+bulk-insert pair (same `jsonb_to_recordset` shape as tiers, just `profile_id`/`matched_signals`, no `tier_key`) against `crm_persona_exclusion_memberships`.
5. Return value gains an `excluded` count alongside `tiered`; the cron endpoint's JSON response includes both.

## Export & Activation API Wiring

**`server/utils/persona/audienceSync.ts` — `loadEligibleMembers`**: the candidate-join branch becomes a 3-way choice:

```ts
let candidateJoinSql = ''
if (filters.tierKey) {
  params.push(filters.tierKey)
  candidateJoinSql = `JOIN crm_persona_tier_memberships tier
                         ON tier.client_id = signal.client_id
                        AND tier.profile_id = signal.profile_id
                        AND tier.tier_key = $${params.length}`
} else if (filters.excludeAudience) {
  candidateJoinSql = `JOIN crm_persona_exclusion_memberships excl
                         ON excl.client_id = signal.client_id
                        AND excl.profile_id = signal.profile_id`
}
```

No new query parameter for the exclusion branch (single blended list, nothing to filter by value). Everything downstream — consent checks, suppression exclusion via `crm_persona_current_suppressions`, hashing, `runPersonaAudienceSync`'s diff/sync — is untouched, same as the tier rollout's regression-safety guarantee: with no filter present, the query is byte-for-byte identical to today's behavior.

**`server/utils/persona/activation.ts`** — the size-estimation branch gains a third case: `filters.excludeAudience` → new `countExclusionMembers()` helper, same shape as `countTierMembers()`, joining the exclusion table with no key parameter.

**`server/api/agency/analytics/personas/activations.post.ts`** — add `excludeAudience: z.literal(true).optional()` to the `filters` strict object. This is the exact field-omission bug class the Phase C item 2 handoff flagged for `tierKey` (a `z.strictObject` silently rejecting an unlisted field) — added explicitly now, before shipping, not discovered after a broken merge. Also add a `.refine()` rejecting requests where both `tierKey` and `excludeAudience` are set: targeting a tier and requesting the negative-signal exclusion list are contradictory intents in the same request, so the schema rejects the combination rather than silently preferring one.

No new endpoint. A new endpoint would duplicate the entire approval/audit/export state machine (`crm_persona_audience_activation_requests` → `_approvals` → `_audit` → `crm_persona_audience_exports` → `_export_members` → `_member_state`) for one more optional filter key.

## Delivery Semantics

No platform-side code changes. `runPersonaAudienceSync` already pushes whatever membership list it's given to Meta Custom Audiences / Google Customer Match as a named list (the account manager's freeform `name` field on the activation request labels it, e.g. "Exclusion — Negative Signals"). Attaching that list to a campaign as an *exclusion* targeting rule happens manually in Meta/Google Ads Manager — this dashboard creates and syncs the list; campaign-level include/exclude wiring stays a human step, identical to how tier audiences are handled today.

## Error Handling & Edge Cases

**Transactional scope**: both membership types for a client are written in one transaction (extending today's tier-only transaction) — a failure computing or writing either rolls back both for that client, but per-client failures still don't block other clients (the existing `recomputePersonaMemberships` try/catch loop is unchanged). Given both draw from the same signal aggregation and are cheap in-memory resolutions, splitting them into independent transactions would add complexity for a failure mode that's already rare and already isolated at the client level.

**A profile can be in a tier *and* excluded simultaneously.** E.g. someone browsing vehicles (Cold tier) who also clicked through from a competitor site (exclusion trigger). This is expected, not conflicting: tier membership answers "how positively engaged is this profile," exclusion membership answers "has this profile shown a negative signal" — two independent axes. The account manager decides which of the two separate audience exports to attach to a given campaign; the system doesn't arbitrate precedence between them.

## Testing

Following this codebase's established no-live-DB convention (migration tests assert static SQL text, not live behavior):
- Migration test: assert 312's idempotency guards (`IF NOT EXISTS`, `WHERE NOT EXISTS`), mirroring 311's migration test structure.
- Unit tests for `resolveIsExcluded()` — pure function, same test shape as existing `resolveHighestTier()` tests (fake signal sets, fake definitions).
- Extend `activations.post.ts`'s schema tests: `excludeAudience` accepted alone, rejected when combined with `tierKey`.
- Extend `loadEligibleMembers`'s existing tierKey-branch tests with the equivalent exclusion-branch case, and confirm the no-filter case remains byte-for-byte unchanged — the same regression-safety check the tier rollout used.

## Non-Goals (deferred to later Phase C items or future work)

- Bounce-duration derivation (needs new unload-beacon instrumentation) — a candidate follow-up to this item, not Phase C item 4.
- **Phase C item 4 (micro-conversions to GA4/Google Ads)** remains fully unscoped — no existing code to anchor on, needs its own brainstorm from scratch about what counts as a micro-conversion and which delivery pipeline it uses.
