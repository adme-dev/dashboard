# Phase C Intent-Tier Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire hot/warm/cold intent-tier qualification into the real Meta/Google audience export pipeline via a nightly-refreshed tier-membership table, so tier-based audiences can actually be exported — not just previewed.

**Architecture:** Three new ranked persona definitions (Hot/Warm/Cold) reuse the existing `scorePersonaDefinition` scoring engine. A nightly cron job resolves each identified profile's highest-qualifying tier from the last 30 days of signals and writes it to a new `crm_persona_tier_memberships` table. The live export path (`audienceSync.ts`'s `loadEligibleMembers`) gains an optional join against that table so a tier becomes a real audience filter, alongside the existing attribution filters — unchanged when no tier filter is supplied.

**Tech Stack:** Nuxt 4 / Nitro server (`server/utils/`, `server/api/`), Cloudflare Worker cron (`workers/pages-cron/`), Postgres (Neon) migrations, Vitest.

## Global Constraints

- Server code imports use `~~/server/utils/` (double-tilde), never `~/`.
- Tier scoring is binary signal-presence matching only (reuses `scorePersonaDefinition` as-is) — no numeric-threshold signals (e.g. dwell time) in this phase.
- Tiers are ranked and mutually exclusive per profile: Hot (rank 1) > Warm (rank 2) > Cold (rank 3) — a profile qualifying for multiple gets the highest one, never more than one row in `crm_persona_tier_memberships`.
- None of the three tier definitions use `negative_signals` — additive-only for v1. Exclusion audiences are a separate, later Phase C item.
- Tier membership is computed from a rolling 30-day signal window (matches `cohorts.ts`'s existing default lookback) — not all-time history.
- Tier computation is precomputed nightly, never live at export time.
- `loadEligibleMembers`'s query must be **byte-for-byte identical to today when no tier filter is supplied** — this is regression-tested explicitly, the same pattern used for the conversion-value-passing item's "omit when null."
- `getPersonaMetrics` (the lead-based metrics query) is not modified. Non-tier-filtered `createPersonaActivationRequest` calls must behave identically to today.
- Full design rationale: `docs/superpowers/specs/2026-07-27-phase-c-intent-tier-scoring-design.md`.

---

### Task 1: Database migration

**Files:**
- Create: `server/database/migrations/311_persona_intent_tiers.sql`
- Test: `test/config/personaIntentTiersMigration.test.ts`

**Interfaces:**
- Produces: `crm_persona_definitions.tier_rank INTEGER NULL`, `crm_persona_tier_memberships` table, and 3 seeded rows in `crm_persona_definitions` with `persona_key` values `'hot'`, `'warm'`, `'cold'` — consumed by Task 2's `activeTierDefinitions()` and Task 3's recompute job.

- [ ] **Step 1: Write the failing migration contract test**

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL(
  '../../server/database/migrations/311_persona_intent_tiers.sql',
  import.meta.url
)

describe('Persona intent tiers migration 311', () => {
  it('adds tier_rank, a tier-membership table, and seeds 3 ranked tier definitions', () => {
    const migration = readFileSync(migrationPath, 'utf8')

    expect(migration).toContain('BEGIN;')
    expect(migration).toMatch(/ALTER TABLE crm_persona_definitions\s+ADD COLUMN tier_rank INTEGER NULL;/)
    expect(migration).toContain('CREATE TABLE crm_persona_tier_memberships')
    expect(migration).toMatch(/tier_key TEXT NOT NULL CHECK \(tier_key IN \('hot', 'warm', 'cold'\)\)/)
    expect(migration).toContain('PRIMARY KEY (client_id, profile_id)')
    expect(migration).toContain('crm_persona_tier_memberships_profile_fk')
    expect(migration).toContain('idx_crm_persona_tier_memberships_tier')
    expect(migration).toContain("'automotive', 'hot'")
    expect(migration).toContain("'automotive', 'warm'")
    expect(migration).toContain("'automotive', 'cold'")
    expect(migration).toContain('COMMIT;')
  })
})
```

Save as `test/config/personaIntentTiersMigration.test.ts`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run test/config/personaIntentTiersMigration.test.ts`
Expected: FAIL — `server/database/migrations/311_persona_intent_tiers.sql` does not exist yet.

- [ ] **Step 3: Write the migration**

```sql
BEGIN;

-- Persona/cohort scoring (crm_persona_definitions, scorePersonaDefinition)
-- has been preview-only — the live Meta/Google export path never consults
-- it. tier_rank marks a persona definition as a ranked intent tier (Hot=1,
-- Warm=2, Cold=3); the other existing personas (active_vehicle_shopper,
-- finance_ready, returning_high_intent) stay NULL, unaffected.
ALTER TABLE crm_persona_definitions
  ADD COLUMN tier_rank INTEGER NULL;

-- One row per profile: their current single highest-ranked tier, recomputed
-- nightly from the last 30 days of crm_customer_signals. This is what makes
-- a tier a real, joinable audience filter for loadEligibleMembers, not just
-- a preview stat.
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

-- Seed the 3 ranked tier definitions, same idempotent pattern as migration
-- 295's original 3 personas. persona_key is exactly 'hot'/'warm'/'cold' so
-- it maps 1:1 onto crm_persona_tier_memberships.tier_key with no
-- transformation needed in the recompute job. min_confidence is
-- near-zero (0.01): tier qualification means "matched at least one
-- positive signal," not a confidence threshold — rank order does the
-- actual tie-breaking, not scorePersonaDefinition's confidence score.
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
    ('automotive', 'hot', 'Hot', 'Near-conversion intent.',
     '["form_start","add_to_wishlist","test_drive_booking","finance_calculator_interact","trade_in_start","generate_lead","lead_created"]',
     1),
    ('automotive', 'warm', 'Warm', 'Cross-shop depth and repeat consideration.',
     '["vehicle_comparison","return_to_vehicle"]',
     2),
    ('automotive', 'cold', 'Cold', 'Baseline browsing.',
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

Save as `server/database/migrations/311_persona_intent_tiers.sql`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run test/config/personaIntentTiersMigration.test.ts`
Expected: PASS

- [ ] **Step 5: Ask the user for explicit go-ahead, then run the migration**

Stop and ask the user before running this against the real database (same pattern established for migration 310 in the prior Phase C item). Once confirmed:

```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/311_persona_intent_tiers.sql
```

- [ ] **Step 6: Commit**

```bash
git add server/database/migrations/311_persona_intent_tiers.sql test/config/personaIntentTiersMigration.test.ts
git commit -m "feat(persona): add tier_rank and crm_persona_tier_memberships"
```

---

### Task 2: Tier ranking helper and tier-definition query

**Files:**
- Modify: `server/utils/persona/cohorts.ts` (`PersonaDefinition` interface, add `activeTierDefinitions`, add `resolveHighestTier`)
- Test: `test/server/utils/persona/cohorts.test.ts`

**Interfaces:**
- Consumes: Task 1's `crm_persona_definitions.tier_rank` column (SQL text only — tests mock the DB, no live dependency).
- Produces: `resolveHighestTier(tierDefinitions, signalKeys): { personaKey: string, matchedSignals: string[] } | null` and `activeTierDefinitions(clientId): Promise<PersonaDefinition[]>` — both consumed by Task 3's recompute job.

- [ ] **Step 1: Write the failing tests**

Add these to `test/server/utils/persona/cohorts.test.ts` — update the import line and add a new `describe` block:

```ts
import { describe, expect, it } from 'vitest'
import {
  normalizeCohortFilters,
  resolveHighestTier,
  scorePersonaDefinition
} from '../../../../server/utils/persona/cohorts'
```

```ts
describe('resolveHighestTier', () => {
  const hot = {
    persona_key: 'hot',
    positive_signals: ['form_start', 'add_to_wishlist'],
    negative_signals: [],
    min_confidence: 0.01,
    tier_rank: 1
  }
  const warm = {
    persona_key: 'warm',
    positive_signals: ['vehicle_comparison', 'return_to_vehicle'],
    negative_signals: [],
    min_confidence: 0.01,
    tier_rank: 2
  }
  const cold = {
    persona_key: 'cold',
    positive_signals: ['vehicle_view'],
    negative_signals: [],
    min_confidence: 0.01,
    tier_rank: 3
  }

  it('picks the highest-ranked tier when a subject qualifies for more than one, regardless of input order', () => {
    const result = resolveHighestTier([cold, warm, hot], ['vehicle_view', 'vehicle_comparison', 'form_start'])

    expect(result).toEqual({ personaKey: 'hot', matchedSignals: ['form_start'] })
  })

  it('falls back to a lower tier when the subject only matches its signals', () => {
    const result = resolveHighestTier([cold, warm, hot], ['vehicle_view', 'vehicle_comparison'])

    expect(result).toEqual({ personaKey: 'warm', matchedSignals: ['vehicle_comparison'] })
  })

  it('returns null when no tier signals match', () => {
    const result = resolveHighestTier([cold, warm, hot], ['search'])

    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run test/server/utils/persona/cohorts.test.ts`
Expected: FAIL — `resolveHighestTier` is not exported from `cohorts.ts` yet.

- [ ] **Step 3: Add `tier_rank` to `PersonaDefinition` and implement `resolveHighestTier` and `activeTierDefinitions`**

In `server/utils/persona/cohorts.ts`, update the `PersonaDefinition` interface (currently lines 4-16):

```ts
export interface PersonaDefinition {
  id: string
  persona_key: string
  version: number
  label: string
  description: string
  positive_signals: string[]
  negative_signals: string[]
  min_confidence: number | string
  allowed_channels: string[]
  targeting_allowed: boolean
  reporting_allowed: boolean
  tier_rank: number | null
}
```

Add `resolveHighestTier` after `scorePersonaDefinition` (currently ending around line 57):

```ts
export function resolveHighestTier(
  tierDefinitions: Array<Pick<PersonaDefinition, 'persona_key' | 'positive_signals' | 'negative_signals' | 'min_confidence' | 'tier_rank'>>,
  signalKeys: string[]
): { personaKey: string, matchedSignals: string[] } | null {
  const ranked = [...tierDefinitions].sort((a, b) => Number(a.tier_rank) - Number(b.tier_rank))
  for (const definition of ranked) {
    const score = scorePersonaDefinition(definition, signalKeys)
    if (score.qualifies) {
      return { personaKey: definition.persona_key, matchedSignals: score.matchedPositive }
    }
  }
  return null
}
```

Add `activeTierDefinitions` after the existing `activeDefinitions` function (currently lines 98-111), mirroring its exact query shape but scoped to tier rows:

```ts
export async function activeTierDefinitions(clientId: string): Promise<PersonaDefinition[]> {
  return queryRows<PersonaDefinition>(
    `SELECT DISTINCT ON (persona_key)
            id, persona_key, version, label, description,
            positive_signals, negative_signals, min_confidence,
            allowed_channels, targeting_allowed, reporting_allowed, tier_rank
       FROM crm_persona_definitions
      WHERE status = 'active'
        AND vertical IN ('universal', 'automotive')
        AND tier_rank IS NOT NULL
        AND (client_id IS NULL OR client_id = $1)
      ORDER BY persona_key, (client_id IS NOT NULL) DESC, version DESC`,
    [clientId]
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run test/server/utils/persona/cohorts.test.ts`
Expected: PASS — all tests including the three new ones and the four pre-existing ones.

- [ ] **Step 5: Commit**

```bash
git add server/utils/persona/cohorts.ts test/server/utils/persona/cohorts.test.ts
git commit -m "feat(persona): add resolveHighestTier ranking and activeTierDefinitions"
```

---

### Task 3: Nightly tier-recompute job

**Files:**
- Modify: `server/utils/persona/feature.ts` (add `listPersonaIdentityEnabledClientIds`)
- Create: `server/utils/persona/tierRecompute.ts`
- Create: `server/api/cron/persona-tier-recompute.post.ts`
- Modify: `workers/pages-cron/src/index.ts`
- Modify: `workers/pages-cron/wrangler.toml`
- Test: `test/server/utils/persona/tierRecompute.test.ts`

**Interfaces:**
- Consumes: Task 2's `activeTierDefinitions(clientId)` and `resolveHighestTier(tierDefinitions, signalKeys)`.
- Produces: rows in `crm_persona_tier_memberships`, consumed by Task 4's `loadEligibleMembers` tier join and `countTierMembers`.

- [ ] **Step 1: Write the failing tests**

Create `test/server/utils/persona/tierRecompute.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueryRows = vi.fn()
const mockTransaction = vi.fn()
const mockTxQuery = vi.fn()
vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  transaction: (...args: unknown[]) => mockTransaction(...args)
}))

import { recomputeClientTiers, recomputePersonaTiers } from '../../../../server/utils/persona/tierRecompute'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'

function tierDefinitionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    persona_key: 'hot',
    version: 1,
    label: 'Hot',
    description: 'Near-conversion intent.',
    positive_signals: ['form_start', 'add_to_wishlist'],
    negative_signals: [],
    min_confidence: 0.01,
    allowed_channels: ['google', 'meta'],
    targeting_allowed: true,
    reporting_allowed: true,
    tier_rank: 1,
    ...overrides
  }
}

const TIER_DEFINITIONS = [
  tierDefinitionRow(),
  tierDefinitionRow({ persona_key: 'warm', label: 'Warm', positive_signals: ['vehicle_comparison', 'return_to_vehicle'], tier_rank: 2 }),
  tierDefinitionRow({ persona_key: 'cold', label: 'Cold', positive_signals: ['vehicle_view', 'vehicle_list_view'], tier_rank: 3 })
]

beforeEach(() => {
  mockQueryRows.mockReset()
  mockTransaction.mockReset()
  mockTxQuery.mockReset()
  mockTransaction.mockImplementation(async (callback: (db: { query: typeof mockTxQuery }) => unknown) =>
    callback({ query: mockTxQuery }))
})

describe('recomputeClientTiers', () => {
  it('assigns each profile its highest-qualifying tier and replaces prior memberships in one transaction', async () => {
    mockQueryRows.mockImplementation(async (sql: string) => {
      if (/FROM crm_persona_definitions/.test(sql)) return TIER_DEFINITIONS
      if (/FROM crm_customer_signals/.test(sql)) {
        return [
          { profile_id: 'profile-hot', signal_keys: ['vehicle_view', 'form_start'] },
          { profile_id: 'profile-warm', signal_keys: ['vehicle_comparison'] },
          { profile_id: 'profile-none', signal_keys: ['search'] }
        ]
      }
      return []
    })

    const result = await recomputeClientTiers(CLIENT_ID)

    expect(result).toEqual({ clientId: CLIENT_ID, tiered: 2 })
    expect(mockTxQuery).toHaveBeenCalledWith(
      'DELETE FROM crm_persona_tier_memberships WHERE client_id = $1',
      [CLIENT_ID]
    )
    expect(mockTxQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO crm_persona_tier_memberships'),
      [CLIENT_ID, 'profile-hot', 'hot', ['form_start']]
    )
    expect(mockTxQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO crm_persona_tier_memberships'),
      [CLIENT_ID, 'profile-warm', 'warm', ['vehicle_comparison']]
    )
    expect(mockTxQuery).not.toHaveBeenCalledWith(expect.anything(), expect.arrayContaining(['profile-none']))
  })

  it('skips a client with no active tier definitions without opening a transaction', async () => {
    mockQueryRows.mockImplementation(async (sql: string) => {
      if (/FROM crm_persona_definitions/.test(sql)) return []
      return []
    })

    const result = await recomputeClientTiers(CLIENT_ID)

    expect(result).toEqual({ clientId: CLIENT_ID, tiered: 0 })
    expect(mockTransaction).not.toHaveBeenCalled()
  })
})

describe('recomputePersonaTiers', () => {
  it('recomputes tiers independently for every persona-identity-enabled client', async () => {
    mockQueryRows.mockImplementation(async (sql: string) => {
      if (/FROM client_feature_entitlements/.test(sql)) {
        return [{ client_id: 'client-a' }, { client_id: 'client-b' }]
      }
      if (/FROM crm_persona_definitions/.test(sql)) return TIER_DEFINITIONS
      if (/FROM crm_customer_signals/.test(sql)) return []
      return []
    })

    const results = await recomputePersonaTiers()

    expect(results).toEqual([
      { clientId: 'client-a', tiered: 0 },
      { clientId: 'client-b', tiered: 0 }
    ])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run test/server/utils/persona/tierRecompute.test.ts`
Expected: FAIL — `server/utils/persona/tierRecompute.ts` does not exist yet.

- [ ] **Step 3: Add `listPersonaIdentityEnabledClientIds` to `feature.ts`**

In `server/utils/persona/feature.ts`, update the import line and add the new function at the end of the file:

```ts
import { queryOne, queryRows } from '~~/server/utils/db'
```

```ts
export async function listPersonaIdentityEnabledClientIds(): Promise<string[]> {
  const rows = await queryRows<{ client_id: string }>(
    `SELECT DISTINCT client_id
       FROM client_feature_entitlements
      WHERE feature_key = $1
        AND status IN ('active', 'trial')
        AND (starts_at IS NULL OR starts_at <= NOW())
        AND (expires_at IS NULL OR expires_at > NOW())`,
    [PERSONA_IDENTITY_FEATURE]
  )
  return rows.map(row => row.client_id)
}
```

- [ ] **Step 4: Write `tierRecompute.ts`**

Create `server/utils/persona/tierRecompute.ts`:

```ts
import { queryRows, transaction } from '~~/server/utils/db'
import { listPersonaIdentityEnabledClientIds } from '~~/server/utils/persona/feature'
import { activeTierDefinitions, resolveHighestTier } from '~~/server/utils/persona/cohorts'

interface SignalRow {
  profile_id: string
  signal_keys: string[]
}

interface TransactionClient {
  query(sql: string, params?: unknown[]): Promise<{ rows?: unknown[] }>
}

export interface ClientTierRecomputeResult {
  clientId: string
  tiered: number
}

export async function recomputeClientTiers(clientId: string): Promise<ClientTierRecomputeResult> {
  const tierDefinitions = await activeTierDefinitions(clientId)
  if (!tierDefinitions.length) return { clientId, tiered: 0 }

  const signalRows = await queryRows<SignalRow>(
    `SELECT signal.profile_id,
            ARRAY_AGG(DISTINCT signal.signal_key) AS signal_keys
       FROM crm_customer_signals signal
      WHERE signal.client_id = $1
        AND signal.profile_id IS NOT NULL
        AND signal.occurred_at >= NOW() - INTERVAL '30 days'
      GROUP BY signal.profile_id`,
    [clientId]
  )

  const assignments = signalRows.flatMap((row) => {
    const resolved = resolveHighestTier(tierDefinitions, row.signal_keys)
    return resolved
      ? [{ profileId: row.profile_id, tierKey: resolved.personaKey, matchedSignals: resolved.matchedSignals }]
      : []
  })

  await transaction(async (db: TransactionClient) => {
    await db.query(
      'DELETE FROM crm_persona_tier_memberships WHERE client_id = $1',
      [clientId]
    )
    for (const assignment of assignments) {
      await db.query(
        `INSERT INTO crm_persona_tier_memberships (
           client_id, profile_id, tier_key, matched_signals, computed_at
         ) VALUES ($1, $2, $3, $4, NOW())`,
        [clientId, assignment.profileId, assignment.tierKey, assignment.matchedSignals]
      )
    }
  })

  return { clientId, tiered: assignments.length }
}

export async function recomputePersonaTiers(): Promise<ClientTierRecomputeResult[]> {
  const clientIds = await listPersonaIdentityEnabledClientIds()
  const results: ClientTierRecomputeResult[] = []
  for (const clientId of clientIds) {
    results.push(await recomputeClientTiers(clientId))
  }
  return results
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run test/server/utils/persona/tierRecompute.test.ts`
Expected: PASS — all four tests.

- [ ] **Step 6: Add the cron endpoint**

Create `server/api/cron/persona-tier-recompute.post.ts`, following the exact auth pattern used by every other `/api/cron/*` endpoint in this codebase (e.g. `server/api/cron/tracking-retention.post.ts`):

```ts
/** Nightly hot/warm/cold intent-tier recompute for every persona-identity-
 *  enabled client. Cron-gated. Wire in CF dashboard: POST with header
 *  x-cron-secret: $CRON_SECRET, daily. */
import { recomputePersonaTiers } from '~~/server/utils/persona/tierRecompute'

export default defineEventHandler(async (event) => {
  const secret = getHeader(event, 'x-cron-secret')
  if (!secret || secret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const results = await recomputePersonaTiers()
  return {
    ok: true,
    clients: results.length,
    tiered: results.reduce((sum, result) => sum + result.tiered, 0)
  }
})
```

- [ ] **Step 7: Wire the new endpoint into the `pages-cron` worker**

In `workers/pages-cron/src/index.ts`, add a new entry to the `ROUTES` map (after the `'45 3 * * *'` entry, matching the existing spacing of the other daily-3am jobs):

```ts
  // daily — recompute hot/warm/cold intent-tier membership from the last 30
  // days of customer signals, feeding tier-filtered Meta/Google audience
  // exports. Full delete+reinsert per client inside one transaction.
  '55 3 * * *': ['/api/cron/persona-tier-recompute'],
```

In `workers/pages-cron/wrangler.toml`, add the matching cron trigger to the `crons` array (after the `"45 3 * * *"` line):

```toml
  "45 3 * * *",   # tracking-retention
  "55 3 * * *",   # persona-tier-recompute (hot/warm/cold audience tiers)
  "10 4 * * *",   # feed-post-rules (flag-gated, review-only drafts)
```

- [ ] **Step 8: Commit**

```bash
git add server/utils/persona/feature.ts server/utils/persona/tierRecompute.ts server/api/cron/persona-tier-recompute.post.ts test/server/utils/persona/tierRecompute.test.ts workers/pages-cron/src/index.ts workers/pages-cron/wrangler.toml
git commit -m "feat(persona): nightly hot/warm/cold tier recompute job"
```

---

### Task 4: Tier filter in the live export pipeline

**Files:**
- Modify: `server/utils/persona/audienceSync.ts` (export `loadEligibleMembers`, add tier join, add `countTierMembers`)
- Test: `test/server/utils/persona/audienceSync.test.ts`

**Interfaces:**
- Consumes: Task 1's `crm_persona_tier_memberships` table (SQL text only — tests mock the DB).
- Produces: `countTierMembers(clientId, tierKey, filters): Promise<number>` — consumed by Task 5's `activation.ts`.

- [ ] **Step 1: Write the failing tests**

Create `test/server/utils/persona/audienceSync.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueryRows = vi.fn()
const mockQueryOne = vi.fn()
vi.mock('~~/server/utils/db', () => ({
  execute: vi.fn(),
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

import { countTierMembers, loadEligibleMembers } from '../../../../server/utils/persona/audienceSync'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'

function context(overrides: Record<string, unknown> = {}) {
  return {
    id: 'export-1',
    client_id: CLIENT_ID,
    request_id: 'request-1',
    provider: 'meta' as const,
    operation: 'sync' as const,
    status: 'pending',
    provider_request_ids: [],
    request_name: 'Test export',
    request_status: 'approved',
    filters: {},
    minimum_size: 1000,
    connection_id: 'connection-1',
    provider_audience_id: null,
    enabled: true,
    emergency_stop: false,
    terms_accepted_at: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

beforeEach(() => {
  mockQueryRows.mockReset()
  mockQueryRows.mockResolvedValue([])
  mockQueryOne.mockReset()
})

describe('loadEligibleMembers', () => {
  it('builds the candidate query without a tier join when no tier filter is supplied', async () => {
    await loadEligibleMembers(context())

    const [sql, params] = mockQueryRows.mock.calls[0]!
    expect(sql).not.toContain('crm_persona_tier_memberships')
    expect(params).toEqual([CLIENT_ID, 'meta'])
  })

  it('joins the tier-membership table and filters by tier_key when a tier filter is supplied', async () => {
    await loadEligibleMembers(context({ filters: { tierKey: 'hot' } }))

    const [sql, params] = mockQueryRows.mock.calls[0]!
    expect(sql).toContain('JOIN crm_persona_tier_memberships tier')
    expect(sql).toContain('tier.tier_key = $2')
    expect(params).toEqual([CLIENT_ID, 'hot', 'meta'])
  })

  it('still applies attribution filters alongside a tier filter', async () => {
    await loadEligibleMembers(context({ filters: { tierKey: 'warm', platform: 'google' } }))

    const [sql, params] = mockQueryRows.mock.calls[0]!
    expect(sql).toContain('crm_persona_tier_memberships')
    expect(params).toEqual([CLIENT_ID, 'google', 'warm', 'meta'])
  })
})

describe('countTierMembers', () => {
  it('counts distinct profiles matching the tier and any attribution filters', async () => {
    mockQueryOne.mockResolvedValue({ count: '42' })

    const result = await countTierMembers(CLIENT_ID, 'hot', { platform: 'meta' })

    expect(result).toBe(42)
    const [sql, params] = mockQueryOne.mock.calls[0]!
    expect(sql).toContain('crm_persona_tier_memberships')
    expect(sql).toContain('COUNT(DISTINCT signal.profile_id)')
    expect(params).toEqual([CLIENT_ID, 'meta', 'hot'])
  })

  it('returns 0 when no row is found', async () => {
    mockQueryOne.mockResolvedValue(undefined)

    const result = await countTierMembers(CLIENT_ID, 'cold', {})

    expect(result).toBe(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run test/server/utils/persona/audienceSync.test.ts`
Expected: FAIL — `loadEligibleMembers` is not exported yet, `countTierMembers` does not exist yet.

- [ ] **Step 3: Export `loadEligibleMembers` and add the tier join**

In `server/utils/persona/audienceSync.ts`, replace the `loadEligibleMembers` function signature and its opening lines (currently starting at line 386):

```ts
export async function loadEligibleMembers(context: ExportContext): Promise<HashedAudienceMember[]> {
  const filters = context.filters || {}
  const params: unknown[] = [context.client_id]
  const candidatesFilterSql = signalFilterSql(filters, params)
  let tierJoinSql = ''
  if (filters.tierKey) {
    params.push(filters.tierKey)
    tierJoinSql = `JOIN crm_persona_tier_memberships tier
                      ON tier.client_id = signal.client_id
                     AND tier.profile_id = signal.profile_id
                     AND tier.tier_key = $${params.length}`
  }
  params.push(context.provider)
  const destinationParamIndex = params.length
  const rows = await queryRows<SourceMember>(
    `WITH candidates AS (
       SELECT DISTINCT signal.profile_id
         FROM crm_customer_signals signal
         ${tierJoinSql}
        WHERE ${candidatesFilterSql}
     ),
```

(The rest of the function — `latest_consent`, `latest_person`, `latest_lead`, the final `SELECT`, and the return statement — is unchanged. Only the opening lines through the `candidates` CTE's `FROM`/join/`WHERE` clause change.)

- [ ] **Step 4: Add `countTierMembers`**

Add this new exported function to `server/utils/persona/audienceSync.ts`, near `loadEligibleMembers`:

```ts
export async function countTierMembers(
  clientId: string,
  tierKey: string,
  filters: Record<string, string>
): Promise<number> {
  const params: unknown[] = [clientId]
  const filterSql = signalFilterSql(filters, params)
  params.push(tierKey)
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(DISTINCT signal.profile_id) AS count
       FROM crm_customer_signals signal
       JOIN crm_persona_tier_memberships tier
         ON tier.client_id = signal.client_id
        AND tier.profile_id = signal.profile_id
        AND tier.tier_key = $${params.length}
      WHERE ${filterSql}`,
    params
  )
  return Number(row?.count ?? 0)
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run test/server/utils/persona/audienceSync.test.ts`
Expected: PASS — all five tests.

- [ ] **Step 6: Commit**

```bash
git add server/utils/persona/audienceSync.ts test/server/utils/persona/audienceSync.test.ts
git commit -m "feat(persona): tier filter in the live audience export pipeline"
```

---

### Task 5: Tier-aware activation-request size estimation

**Files:**
- Modify: `server/utils/persona/metrics.ts` (`PersonaMetricsFilters` gains `tierKey`)
- Modify: `server/utils/persona/activation.ts` (`createPersonaActivationRequest` branches on `tierKey`)
- Test: `test/server/utils/persona/activation.test.ts`

**Interfaces:**
- Consumes: Task 4's `countTierMembers(clientId, tierKey, filters)`.
- Produces: nothing new consumed by later tasks — this is the final leaf of the pipeline.

- [ ] **Step 1: Write the failing tests**

Create `test/server/utils/persona/activation.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueryOne = vi.fn()
vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  transaction: vi.fn()
}))

const mockIsPersonaIdentityEnabled = vi.fn()
vi.mock('~~/server/utils/persona/feature', () => ({
  isPersonaIdentityEnabled: (...args: unknown[]) => mockIsPersonaIdentityEnabled(...args)
}))

const mockGetCachedPersonaMetrics = vi.fn()
vi.mock('~~/server/utils/persona/snapshots', () => ({
  getCachedPersonaMetrics: (...args: unknown[]) => mockGetCachedPersonaMetrics(...args)
}))

const mockCountTierMembers = vi.fn()
vi.mock('~~/server/utils/persona/audienceSync', () => ({
  countTierMembers: (...args: unknown[]) => mockCountTierMembers(...args)
}))

import { createPersonaActivationRequest } from '../../../../server/utils/persona/activation'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  mockQueryOne.mockReset()
  mockIsPersonaIdentityEnabled.mockReset()
  mockGetCachedPersonaMetrics.mockReset()
  mockCountTierMembers.mockReset()
})

describe('createPersonaActivationRequest', () => {
  it('uses the tier-member count for a tier-filtered request without calling getCachedPersonaMetrics', async () => {
    mockIsPersonaIdentityEnabled.mockResolvedValue(true)
    mockCountTierMembers.mockResolvedValue(1500)
    mockQueryOne.mockResolvedValueOnce({ id: 'request-1' }).mockResolvedValueOnce({ id: 'audit-1' })

    const result = await createPersonaActivationRequest({
      clientId: CLIENT_ID,
      provider: 'meta',
      name: 'Hot tier',
      filters: { tierKey: 'hot' },
      expiresAt: '2026-08-01T00:00:00.000Z',
      actorId: ACTOR_ID
    })

    expect(result).toMatchObject({ id: 'request-1', estimatedSize: 1500, status: 'pending_privacy' })
    expect(mockCountTierMembers).toHaveBeenCalledWith(CLIENT_ID, 'hot', { tierKey: 'hot' })
    expect(mockGetCachedPersonaMetrics).not.toHaveBeenCalled()
  })

  it('rejects a tier-filtered request when persona identity is disabled, without querying tier membership', async () => {
    mockIsPersonaIdentityEnabled.mockResolvedValue(false)

    await expect(createPersonaActivationRequest({
      clientId: CLIENT_ID,
      provider: 'meta',
      name: 'Hot tier',
      filters: { tierKey: 'hot' },
      expiresAt: '2026-08-01T00:00:00.000Z',
      actorId: ACTOR_ID
    })).rejects.toMatchObject({ statusCode: 409 })
    expect(mockCountTierMembers).not.toHaveBeenCalled()
  })

  it('keeps the existing getCachedPersonaMetrics path unchanged for a non-tier-filtered request', async () => {
    mockGetCachedPersonaMetrics.mockResolvedValue({
      enabled: true,
      metrics: { totalPersonas: 5000 }
    })
    mockQueryOne.mockResolvedValueOnce({ id: 'request-2' }).mockResolvedValueOnce({ id: 'audit-2' })

    const result = await createPersonaActivationRequest({
      clientId: CLIENT_ID,
      provider: 'google_ads',
      name: 'All personas',
      filters: { platform: 'google' },
      expiresAt: '2026-08-01T00:00:00.000Z',
      actorId: ACTOR_ID
    })

    expect(result).toMatchObject({ id: 'request-2', estimatedSize: 5000 })
    expect(mockIsPersonaIdentityEnabled).not.toHaveBeenCalled()
    expect(mockCountTierMembers).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run test/server/utils/persona/activation.test.ts`
Expected: FAIL — `filters.tierKey` isn't a recognized field yet, and `createPersonaActivationRequest` doesn't branch on it.

- [ ] **Step 3: Add `tierKey` to `PersonaMetricsFilters`**

In `server/utils/persona/metrics.ts`, update the interface (currently lines 4-15):

```ts
export interface PersonaMetricsFilters {
  startDate?: string
  endDate?: string
  platform?: string
  campaignId?: string
  adGroupId?: string
  adSetId?: string
  adId?: string
  creativeId?: string
  landingPage?: string
  device?: string
  tierKey?: 'hot' | 'warm' | 'cold'
}
```

- [ ] **Step 4: Branch `createPersonaActivationRequest` on `tierKey`**

In `server/utils/persona/activation.ts`, add the import and replace the size-estimation logic (currently the `const projection = ...` through `const estimatedSize = projection.metrics.totalPersonas` lines, around lines 79-84):

```ts
import { isPersonaIdentityEnabled } from '~~/server/utils/persona/feature'
import { countTierMembers } from '~~/server/utils/persona/audienceSync'
```

```ts
  let estimatedSize: number
  if (input.filters.tierKey) {
    if (!await isPersonaIdentityEnabled(input.clientId)) {
      throw createError({ statusCode: 409, statusMessage: 'Persona Identity is not enabled for this client' })
    }
    estimatedSize = await countTierMembers(input.clientId, input.filters.tierKey, input.filters as Record<string, string>)
  } else {
    const projection = await getCachedPersonaMetrics(input.clientId, input.filters)
    if (!projection.enabled || !projection.metrics) {
      throw createError({ statusCode: 409, statusMessage: 'Persona Identity is not enabled for this client' })
    }
    estimatedSize = projection.metrics.totalPersonas
  }
```

(The rest of the function — `minimumSize`, `blockedReason`, `status`, the two INSERT statements — is unchanged; it already reads from `estimatedSize`, not from `projection` directly.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run test/server/utils/persona/activation.test.ts`
Expected: PASS — all three tests.

- [ ] **Step 6: Run the full test suite**

Run: `pnpm test:run`
Expected: Same pre-existing failing files as the pre-work baseline (email panels, audio/video studio, spend controller, GA4 funnel, channel taxonomy, role resolver, leads webhook, deploy scripts) — no new failures introduced by this feature.

- [ ] **Step 7: Commit**

```bash
git add server/utils/persona/metrics.ts server/utils/persona/activation.ts test/server/utils/persona/activation.test.ts
git commit -m "feat(persona): tier-aware audience size estimation on activation requests"
```

---

## Self-Review Notes

- **Spec coverage:** Data model (Task 1) → ranking logic (Task 2) → nightly recompute (Task 3) → live export join (Task 4) → activation-request size estimation (Task 5) covers every section of the design doc. The "byte-for-byte unchanged when no tier filter" and "getPersonaMetrics untouched" constraints are enforced by construction (both paths are separate branches, not a shared modified code path) and covered by dedicated tests in Tasks 4 and 5.
- **Type consistency:** `tierKey: 'hot' | 'warm' | 'cold'` is the same literal union everywhere it appears (`PersonaMetricsFilters`, the CHECK constraint, the seeded `persona_key` values). `resolveHighestTier`'s return shape (`{ personaKey, matchedSignals }`) is consumed identically in Task 3's `tierRecompute.ts`. `countTierMembers`'s signature (`clientId, tierKey, filters`) matches its Task 5 call site exactly.
- **Placeholder scan:** No TBD/TODO/"handle appropriately" anywhere in this plan — every step has literal code.
