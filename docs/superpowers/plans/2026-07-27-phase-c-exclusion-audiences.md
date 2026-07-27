# Exclusion Audiences (Phase C, item 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export a standalone "exclude these people" audience to Meta/Google, built from two already-tracked negative signals (`competitive_referrer`, `exit_intent`), by extending the exact infrastructure Phase C item 2 (intent-tier scoring) just shipped.

**Architecture:** One new migration adds an `is_exclusion` marker on `crm_persona_definitions` and a `crm_persona_exclusion_memberships` table. The nightly persona-tier-recompute cron gains a second resolver (`resolveIsExcluded`) that reuses the same per-client signal aggregation already built for tiers, writing both membership tables in one transaction. `loadEligibleMembers`'s candidate-join becomes a 3-way choice (tier / exclusion / neither) instead of 2-way, and `activations.post.ts` gains one new optional filter field — no new endpoint, no new cron, no platform-side code.

**Tech Stack:** Nitro server routes, Neon Postgres via `~~/server/utils/db` (`queryRows`/`queryOne`/`execute`/`transaction`), Zod validation, Vitest.

**Design doc:** `docs/superpowers/specs/2026-07-27-phase-c-exclusion-audiences-design.md`

## Global Constraints

- **Do not run the migration against the production database as part of this plan.** Author the SQL and its static-text test only. Running `psql` against production requires a separate, explicit user go-ahead after this plan's tasks are complete — this held for both migrations 310 and 311 earlier in Phase C, and the same caution applies here (this subsystem touches PII-adjacent audience export).
- All `filters` values throughout this subsystem are strings, including boolean-like flags — `PersonaMetricsFilters`, the Zod `filters` schema, and `Record<string, string>` all use string literals (e.g. `tierKey: 'hot'`). The new `excludeAudience` filter follows the same convention: the literal string `'true'`, never a boolean.
- Run a single test file with `pnpm exec vitest run <path>`; run the full suite with `pnpm exec vitest run`. This codebase has a pre-existing baseline of 20 failing test files / 39 failing tests unrelated to persona/measurement/CRM (email panels, audio/video studio, spend controller, GA4 funnel, channel taxonomy, role resolver, leads webhook, deploy scripts, actionPlanAi, financialInsightsAi, groqFeatureKeyCoverage) — don't treat those as regressions introduced by this work.
- Server code imports via `~~/server/utils/...` (double-tilde), never `~/`.
- No new API endpoint and no new cron trigger — every task extends existing files.

---

### Task 1: Migration 312 — data model

**Files:**
- Create: `server/database/migrations/312_persona_exclusion_audiences.sql`
- Test: `test/config/personaExclusionAudiencesMigration.test.ts`

**Interfaces:**
- Produces: `crm_persona_definitions.is_exclusion BOOLEAN NOT NULL DEFAULT FALSE` column; `crm_persona_exclusion_memberships` table with columns `client_id UUID`, `profile_id UUID`, `matched_signals TEXT[]`, `computed_at TIMESTAMPTZ`, primary key `(client_id, profile_id)`; one seeded row in `crm_persona_definitions` with `persona_key = 'negative_signal_exclusion'`, `vertical = 'automotive'`, `is_exclusion = TRUE`. Task 2 reads this column/table shape directly.

- [ ] **Step 1: Write the failing migration test**

Create `test/config/personaExclusionAudiencesMigration.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL(
  '../../server/database/migrations/312_persona_exclusion_audiences.sql',
  import.meta.url
)

describe('Persona exclusion audiences migration 312', () => {
  it('adds is_exclusion, an exclusion-membership table, and seeds the negative-signal exclusion definition', () => {
    const migration = readFileSync(migrationPath, 'utf8')

    expect(migration).toContain('BEGIN;')
    expect(migration).toMatch(/ALTER TABLE crm_persona_definitions\s+ADD COLUMN IF NOT EXISTS is_exclusion BOOLEAN NOT NULL DEFAULT FALSE;/)
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS crm_persona_exclusion_memberships')
    expect(migration).toContain('PRIMARY KEY (client_id, profile_id)')
    expect(migration).toContain('crm_persona_exclusion_memberships_profile_fk')
    expect(migration).toContain("'automotive', 'negative_signal_exclusion'")
    expect(migration).toContain('"competitive_referrer","exit_intent"')
    expect(migration).toContain('COMMIT;')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run test/config/personaExclusionAudiencesMigration.test.ts`
Expected: FAIL — `server/database/migrations/312_persona_exclusion_audiences.sql` does not exist yet.

- [ ] **Step 3: Write the migration**

Create `server/database/migrations/312_persona_exclusion_audiences.sql`:

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

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run test/config/personaExclusionAudiencesMigration.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/database/migrations/312_persona_exclusion_audiences.sql test/config/personaExclusionAudiencesMigration.test.ts
git commit -m "feat(persona): migration 312 — exclusion audience data model"
```

---

### Task 2: `cohorts.ts` — exclusion definitions, resolver, and preview leak-fix

**Files:**
- Modify: `server/utils/persona/cohorts.ts`
- Test: `test/server/utils/persona/cohorts.test.ts`

**Interfaces:**
- Consumes: `crm_persona_definitions.is_exclusion` column and seeded row from Task 1.
- Produces: `PersonaDefinition.is_exclusion: boolean` field; `activeExclusionDefinitions(clientId: string): Promise<PersonaDefinition[]>`; `resolveIsExcluded(exclusionDefinitions: Array<Pick<PersonaDefinition, 'positive_signals' | 'negative_signals' | 'min_confidence'>>, signalKeys: string[]): { excluded: boolean, matchedSignals: string[] }`. Task 3 imports both `activeExclusionDefinitions` and `resolveIsExcluded`.

- [ ] **Step 1: Write the failing tests**

Replace `test/server/utils/persona/cohorts.test.ts` with:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()
vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

const mockIsPersonaIdentityEnabled = vi.fn()
vi.mock('~~/server/utils/persona/feature', () => ({
  isPersonaIdentityEnabled: (...args: unknown[]) => mockIsPersonaIdentityEnabled(...args)
}))

import {
  getAudienceCohortPreview,
  normalizeCohortFilters,
  resolveHighestTier,
  resolveIsExcluded,
  scorePersonaDefinition
} from '../../../../server/utils/persona/cohorts'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'

const definition = {
  positive_signals: ['vehicle_view', 'return_to_vehicle', 'form_start'],
  negative_signals: ['form_abandonment'],
  min_confidence: 0.5
}

beforeEach(() => {
  mockQueryOne.mockReset()
  mockQueryRows.mockReset()
  mockIsPersonaIdentityEnabled.mockReset()
})

describe('persona cohort scoring', () => {
  it('qualifies a subject when enough positive evidence exists', () => {
    const result = scorePersonaDefinition(definition, [
      'vehicle_view',
      'return_to_vehicle'
    ])

    expect(result.qualifies).toBe(true)
    expect(result.confidence).toBe(0.6667)
    expect(result.matchedPositive).toEqual(['vehicle_view', 'return_to_vehicle'])
  })

  it('fails closed when negative evidence exists', () => {
    const result = scorePersonaDefinition(definition, [
      'vehicle_view',
      'return_to_vehicle',
      'form_abandonment'
    ])

    expect(result.qualifies).toBe(false)
    expect(result.matchedNegative).toEqual(['form_abandonment'])
  })

  it('normalizes a default 30-day UTC range', () => {
    expect(normalizeCohortFilters({}, new Date('2026-07-25T12:30:00Z'))).toEqual({
      startDate: '2026-06-26',
      endDate: '2026-07-25',
      platform: null
    })
  })

  it('rejects reversed date ranges', () => {
    expect(() => normalizeCohortFilters({
      startDate: '2026-07-25',
      endDate: '2026-07-01'
    })).toThrow('startDate must not be after endDate')
  })
})

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

describe('resolveIsExcluded', () => {
  const exclusionDefinition = {
    positive_signals: ['competitive_referrer', 'exit_intent'],
    negative_signals: [],
    min_confidence: 0.01
  }

  it('excludes a profile that matched a trigger signal', () => {
    const result = resolveIsExcluded([exclusionDefinition], ['competitive_referrer', 'vehicle_view'])

    expect(result).toEqual({ excluded: true, matchedSignals: ['competitive_referrer'] })
  })

  it('unions matched signals across multiple qualifying exclusion definitions', () => {
    const secondDefinition = {
      positive_signals: ['exit_intent'],
      negative_signals: [],
      min_confidence: 0.01
    }

    const result = resolveIsExcluded(
      [exclusionDefinition, secondDefinition],
      ['competitive_referrer', 'exit_intent']
    )

    expect(result.excluded).toBe(true)
    expect(result.matchedSignals.sort()).toEqual(['competitive_referrer', 'exit_intent'])
  })

  it('does not exclude a profile with no matching trigger signal', () => {
    const result = resolveIsExcluded([exclusionDefinition], ['vehicle_view', 'search'])

    expect(result).toEqual({ excluded: false, matchedSignals: [] })
  })
})

describe('getAudienceCohortPreview definitions query', () => {
  it('excludes is_exclusion definitions from the client-facing preview, same as tier definitions', async () => {
    mockIsPersonaIdentityEnabled.mockResolvedValue(true)
    mockQueryOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'snapshot-1' })
    mockQueryRows.mockImplementation(async (sql: string) => {
      if (/FROM crm_persona_definitions/.test(sql)) return []
      if (/FROM crm_customer_signals/.test(sql)) return []
      return []
    })

    await getAudienceCohortPreview(CLIENT_ID, {})

    const definitionsCall = mockQueryRows.mock.calls.find(call => /FROM crm_persona_definitions/.test(call[0] as string))
    expect(definitionsCall?.[0]).toContain('tier_rank IS NULL')
    expect(definitionsCall?.[0]).toContain('is_exclusion = FALSE')
  })
})
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `pnpm exec vitest run test/server/utils/persona/cohorts.test.ts`
Expected: the four pre-existing describe blocks (`persona cohort scoring`, `resolveHighestTier`) still PASS; `resolveIsExcluded` FAILs with "resolveIsExcluded is not a function" (or similar import error); `getAudienceCohortPreview definitions query` FAILs because the SQL doesn't yet contain `is_exclusion = FALSE`.

- [ ] **Step 3: Implement the changes in `cohorts.ts`**

Add `is_exclusion` to the `PersonaDefinition` interface (after `tier_rank`):

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
  is_exclusion: boolean
}
```

Add `resolveIsExcluded` immediately after `resolveHighestTier`:

```ts
export function resolveIsExcluded(
  exclusionDefinitions: Array<Pick<PersonaDefinition, 'positive_signals' | 'negative_signals' | 'min_confidence'>>,
  signalKeys: string[]
): { excluded: boolean, matchedSignals: string[] } {
  const matched = new Set<string>()
  for (const definition of exclusionDefinitions) {
    const score = scorePersonaDefinition(definition, signalKeys)
    if (score.qualifies) score.matchedPositive.forEach(key => matched.add(key))
  }
  return { excluded: matched.size > 0, matchedSignals: [...matched] }
}
```

Update `activeDefinitions` to exclude `is_exclusion` rows from the client-facing preview, same as it already excludes tier rows via `tier_rank IS NULL`:

```ts
async function activeDefinitions(clientId: string): Promise<PersonaDefinition[]> {
  return queryRows<PersonaDefinition>(
    `SELECT DISTINCT ON (persona_key)
            id, persona_key, version, label, description,
            positive_signals, negative_signals, min_confidence,
            allowed_channels, targeting_allowed, reporting_allowed, tier_rank
       FROM crm_persona_definitions
      WHERE status = 'active'
        AND vertical IN ('universal', 'automotive')
        AND tier_rank IS NULL
        AND is_exclusion = FALSE
        AND (client_id IS NULL OR client_id = $1)
      ORDER BY persona_key, (client_id IS NOT NULL) DESC, version DESC`,
    [clientId]
  )
}
```

Add `activeExclusionDefinitions` immediately after `activeTierDefinitions`:

```ts
export async function activeExclusionDefinitions(clientId: string): Promise<PersonaDefinition[]> {
  return queryRows<PersonaDefinition>(
    `SELECT DISTINCT ON (persona_key)
            id, persona_key, version, label, description,
            positive_signals, negative_signals, min_confidence,
            allowed_channels, targeting_allowed, reporting_allowed, tier_rank
       FROM crm_persona_definitions
      WHERE status = 'active'
        AND vertical IN ('universal', 'automotive')
        AND is_exclusion = TRUE
        AND (client_id IS NULL OR client_id = $1)
      ORDER BY persona_key, (client_id IS NOT NULL) DESC, version DESC`,
    [clientId]
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run test/server/utils/persona/cohorts.test.ts`
Expected: PASS (all describe blocks)

- [ ] **Step 5: Commit**

```bash
git add server/utils/persona/cohorts.ts test/server/utils/persona/cohorts.test.ts
git commit -m "feat(persona): exclusion definitions, resolveIsExcluded, and preview leak-fix"
```

---

### Task 3: `tierRecompute.ts` — extend the nightly cron with exclusion recompute

**Files:**
- Modify: `server/utils/persona/tierRecompute.ts`
- Modify: `server/api/cron/persona-tier-recompute.post.ts`
- Test: `test/server/utils/persona/tierRecompute.test.ts`

**Interfaces:**
- Consumes: `activeExclusionDefinitions`, `resolveIsExcluded` from Task 2.
- Produces: `recomputeClientPersonaMemberships(clientId: string): Promise<ClientPersonaMembershipRecomputeResult>` (renamed from `recomputeClientTiers`) and `recomputePersonaMemberships(): Promise<ClientPersonaMembershipRecomputeResult[]>` (renamed from `recomputePersonaTiers`), where `ClientPersonaMembershipRecomputeResult = { clientId: string, tiered: number, excluded: number, error?: string }`. No other task imports these — this is the cron's own entry point.

- [ ] **Step 1: Write the failing tests**

Replace `test/server/utils/persona/tierRecompute.test.ts` with:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueryRows = vi.fn()
const mockTransaction = vi.fn()
const mockTxQuery = vi.fn()
vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  transaction: (...args: unknown[]) => mockTransaction(...args)
}))

import { recomputeClientPersonaMemberships, recomputePersonaMemberships } from '../../../../server/utils/persona/tierRecompute'

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

function exclusionDefinitionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    persona_key: 'negative_signal_exclusion',
    version: 1,
    label: 'Negative Signal Exclusion',
    description: 'Visitors who showed competitor-shopping or early-exit intent.',
    positive_signals: ['competitive_referrer', 'exit_intent'],
    negative_signals: [],
    min_confidence: 0.01,
    allowed_channels: ['google', 'meta'],
    targeting_allowed: true,
    reporting_allowed: true,
    tier_rank: null,
    ...overrides
  }
}

const TIER_DEFINITIONS = [
  tierDefinitionRow(),
  tierDefinitionRow({ persona_key: 'warm', label: 'Warm', positive_signals: ['vehicle_comparison', 'return_to_vehicle'], tier_rank: 2 }),
  tierDefinitionRow({ persona_key: 'cold', label: 'Cold', positive_signals: ['vehicle_view', 'vehicle_list_view'], tier_rank: 3 })
]

const EXCLUSION_DEFINITIONS = [exclusionDefinitionRow()]

function mockDefinitionsQuery(options: { tiers?: unknown[], exclusions?: unknown[] } = {}) {
  const tiers = options.tiers ?? TIER_DEFINITIONS
  const exclusions = options.exclusions ?? EXCLUSION_DEFINITIONS
  return async (sql: string) => {
    if (/is_exclusion = TRUE/.test(sql)) return exclusions
    if (/tier_rank IS NOT NULL/.test(sql)) return tiers
    return []
  }
}

beforeEach(() => {
  mockQueryRows.mockReset()
  mockTransaction.mockReset()
  mockTxQuery.mockReset()
  mockTransaction.mockImplementation(async (callback: (db: { query: typeof mockTxQuery }) => unknown) =>
    callback({ query: mockTxQuery }))
})

describe('recomputeClientPersonaMemberships', () => {
  it('assigns each profile its highest-qualifying tier and exclusion status, replacing prior memberships in one transaction', async () => {
    mockQueryRows.mockImplementation(async (sql: string) => {
      if (/FROM crm_persona_definitions/.test(sql)) return mockDefinitionsQuery()(sql)
      if (/FROM crm_customer_signals/.test(sql)) {
        return [
          { profile_id: 'profile-hot', signal_keys: ['vehicle_view', 'form_start'] },
          { profile_id: 'profile-warm', signal_keys: ['vehicle_comparison'] },
          { profile_id: 'profile-excluded', signal_keys: ['competitive_referrer'] },
          { profile_id: 'profile-none', signal_keys: ['search'] }
        ]
      }
      return []
    })

    const result = await recomputeClientPersonaMemberships(CLIENT_ID)

    expect(result).toEqual({ clientId: CLIENT_ID, tiered: 2, excluded: 1 })
    expect(mockTxQuery).toHaveBeenCalledTimes(4)
    expect(mockTxQuery).toHaveBeenCalledWith(
      'DELETE FROM crm_persona_tier_memberships WHERE client_id = $1',
      [CLIENT_ID]
    )
    expect(mockTxQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO crm_persona_tier_memberships'),
      [CLIENT_ID, JSON.stringify([
        { profile_id: 'profile-hot', tier_key: 'hot', matched_signals: ['form_start'] },
        { profile_id: 'profile-warm', tier_key: 'warm', matched_signals: ['vehicle_comparison'] }
      ])]
    )
    expect(mockTxQuery).toHaveBeenCalledWith(
      'DELETE FROM crm_persona_exclusion_memberships WHERE client_id = $1',
      [CLIENT_ID]
    )
    expect(mockTxQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO crm_persona_exclusion_memberships'),
      [CLIENT_ID, JSON.stringify([
        { profile_id: 'profile-excluded', matched_signals: ['competitive_referrer'] }
      ])]
    )

    const signalCall = mockQueryRows.mock.calls.find(call => /FROM crm_customer_signals/.test(call[0] as string))
    expect(signalCall?.[0]).toContain("INTERVAL '30 days'")
    expect(signalCall?.[0]).toContain('profile_id IS NOT NULL')
  })

  it('does not attempt a bulk insert for either table when no profile qualifies', async () => {
    mockQueryRows.mockImplementation(async (sql: string) => {
      if (/FROM crm_persona_definitions/.test(sql)) return mockDefinitionsQuery()(sql)
      if (/FROM crm_customer_signals/.test(sql)) {
        return [{ profile_id: 'profile-none', signal_keys: ['search'] }]
      }
      return []
    })

    const result = await recomputeClientPersonaMemberships(CLIENT_ID)

    expect(result).toEqual({ clientId: CLIENT_ID, tiered: 0, excluded: 0 })
    expect(mockTxQuery).toHaveBeenCalledTimes(2)
    expect(mockTxQuery).toHaveBeenCalledWith(
      'DELETE FROM crm_persona_tier_memberships WHERE client_id = $1',
      [CLIENT_ID]
    )
    expect(mockTxQuery).toHaveBeenCalledWith(
      'DELETE FROM crm_persona_exclusion_memberships WHERE client_id = $1',
      [CLIENT_ID]
    )
  })

  it('still computes exclusion membership for a client with no active tier definitions', async () => {
    mockQueryRows.mockImplementation(async (sql: string) => {
      if (/FROM crm_persona_definitions/.test(sql)) return mockDefinitionsQuery({ tiers: [] })(sql)
      if (/FROM crm_customer_signals/.test(sql)) {
        return [{ profile_id: 'profile-excluded', signal_keys: ['exit_intent'] }]
      }
      return []
    })

    const result = await recomputeClientPersonaMemberships(CLIENT_ID)

    expect(result).toEqual({ clientId: CLIENT_ID, tiered: 0, excluded: 1 })
  })

  it('skips a client with no active tier or exclusion definitions without opening a transaction', async () => {
    mockQueryRows.mockImplementation(async (sql: string) => {
      if (/FROM crm_persona_definitions/.test(sql)) return []
      return []
    })

    const result = await recomputeClientPersonaMemberships(CLIENT_ID)

    expect(result).toEqual({ clientId: CLIENT_ID, tiered: 0, excluded: 0 })
    expect(mockTransaction).not.toHaveBeenCalled()
  })
})

describe('recomputePersonaMemberships', () => {
  it('recomputes memberships independently for every persona-identity-enabled client', async () => {
    mockQueryRows.mockImplementation(async (sql: string) => {
      if (/FROM client_feature_entitlements/.test(sql)) {
        return [{ client_id: 'client-a' }, { client_id: 'client-b' }]
      }
      if (/FROM crm_persona_definitions/.test(sql)) return mockDefinitionsQuery({ exclusions: [] })(sql)
      if (/FROM crm_customer_signals/.test(sql)) return []
      return []
    })

    const results = await recomputePersonaMemberships()

    expect(results).toEqual([
      { clientId: 'client-a', tiered: 0, excluded: 0 },
      { clientId: 'client-b', tiered: 0, excluded: 0 }
    ])
  })

  it('records a per-client error and continues to the next client when one client fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockQueryRows.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (/FROM client_feature_entitlements/.test(sql)) {
        return [{ client_id: 'client-a' }, { client_id: 'client-b' }]
      }
      if (/FROM crm_persona_definitions/.test(sql)) {
        if (params?.[0] === 'client-a') throw new Error('db unavailable')
        return mockDefinitionsQuery({ exclusions: [] })(sql)
      }
      if (/FROM crm_customer_signals/.test(sql)) return []
      return []
    })

    const results = await recomputePersonaMemberships()

    expect(results).toEqual([
      { clientId: 'client-a', tiered: 0, excluded: 0, error: 'db unavailable' },
      { clientId: 'client-b', tiered: 0, excluded: 0 }
    ])
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('client-a'))
    consoleErrorSpy.mockRestore()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run test/server/utils/persona/tierRecompute.test.ts`
Expected: FAIL — `recomputeClientPersonaMemberships`/`recomputePersonaMemberships` don't exist yet (still named `recomputeClientTiers`/`recomputePersonaTiers`).

- [ ] **Step 3: Replace `server/utils/persona/tierRecompute.ts`**

```ts
import { queryRows, transaction } from '~~/server/utils/db'
import { listPersonaIdentityEnabledClientIds } from '~~/server/utils/persona/feature'
import {
  activeExclusionDefinitions,
  activeTierDefinitions,
  resolveHighestTier,
  resolveIsExcluded
} from '~~/server/utils/persona/cohorts'

interface SignalRow {
  profile_id: string
  signal_keys: string[]
}

interface TransactionClient {
  query(sql: string, params?: unknown[]): Promise<{ rows?: unknown[] }>
}

export interface ClientPersonaMembershipRecomputeResult {
  clientId: string
  tiered: number
  excluded: number
  error?: string
}

export async function recomputeClientPersonaMemberships(clientId: string): Promise<ClientPersonaMembershipRecomputeResult> {
  const [tierDefinitions, exclusionDefinitions] = await Promise.all([
    activeTierDefinitions(clientId),
    activeExclusionDefinitions(clientId)
  ])
  if (!tierDefinitions.length && !exclusionDefinitions.length) {
    return { clientId, tiered: 0, excluded: 0 }
  }

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

  const tierAssignments = tierDefinitions.length
    ? signalRows.flatMap((row) => {
        const resolved = resolveHighestTier(tierDefinitions, row.signal_keys)
        return resolved
          ? [{ profileId: row.profile_id, tierKey: resolved.personaKey, matchedSignals: resolved.matchedSignals }]
          : []
      })
    : []

  const exclusionAssignments = exclusionDefinitions.length
    ? signalRows.flatMap((row) => {
        const resolved = resolveIsExcluded(exclusionDefinitions, row.signal_keys)
        return resolved.excluded
          ? [{ profileId: row.profile_id, matchedSignals: resolved.matchedSignals }]
          : []
      })
    : []

  await transaction(async (db: TransactionClient) => {
    await db.query(
      'DELETE FROM crm_persona_tier_memberships WHERE client_id = $1',
      [clientId]
    )
    if (tierAssignments.length) {
      await db.query(
        `INSERT INTO crm_persona_tier_memberships (
           client_id, profile_id, tier_key, matched_signals, computed_at
         )
         SELECT $1, item.profile_id, item.tier_key, item.matched_signals, NOW()
           FROM jsonb_to_recordset($2::jsonb) AS item(
             profile_id uuid, tier_key text, matched_signals text[]
           )`,
        [clientId, JSON.stringify(tierAssignments.map(assignment => ({
          profile_id: assignment.profileId,
          tier_key: assignment.tierKey,
          matched_signals: assignment.matchedSignals
        })))]
      )
    }
    await db.query(
      'DELETE FROM crm_persona_exclusion_memberships WHERE client_id = $1',
      [clientId]
    )
    if (exclusionAssignments.length) {
      await db.query(
        `INSERT INTO crm_persona_exclusion_memberships (
           client_id, profile_id, matched_signals, computed_at
         )
         SELECT $1, item.profile_id, item.matched_signals, NOW()
           FROM jsonb_to_recordset($2::jsonb) AS item(
             profile_id uuid, matched_signals text[]
           )`,
        [clientId, JSON.stringify(exclusionAssignments.map(assignment => ({
          profile_id: assignment.profileId,
          matched_signals: assignment.matchedSignals
        })))]
      )
    }
  })

  return { clientId, tiered: tierAssignments.length, excluded: exclusionAssignments.length }
}

export async function recomputePersonaMemberships(): Promise<ClientPersonaMembershipRecomputeResult[]> {
  const clientIds = await listPersonaIdentityEnabledClientIds()
  const results: ClientPersonaMembershipRecomputeResult[] = []
  for (const clientId of clientIds) {
    try {
      results.push(await recomputeClientPersonaMemberships(clientId))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[persona-tier-recompute] client ${clientId} failed: ${message}`)
      results.push({ clientId, tiered: 0, excluded: 0, error: message })
    }
  }
  return results
}
```

- [ ] **Step 4: Update the cron endpoint**

Replace `server/api/cron/persona-tier-recompute.post.ts`:

```ts
/** Nightly hot/warm/cold intent-tier + negative-signal exclusion-audience
 *  recompute for every persona-identity-enabled client. Cron-gated. Wire in
 *  CF dashboard: POST with header x-cron-secret: $CRON_SECRET, daily. */
import { recomputePersonaMemberships } from '~~/server/utils/persona/tierRecompute'

export default defineEventHandler(async (event) => {
  const secret = getHeader(event, 'x-cron-secret')
  if (!secret || secret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const results = await recomputePersonaMemberships()
  const failures = results.filter(result => result.error)
  return {
    ok: true,
    clients: results.length,
    tiered: results.reduce((sum, result) => sum + result.tiered, 0),
    excluded: results.reduce((sum, result) => sum + result.excluded, 0),
    failed: failures.length,
    failures: failures.map(result => ({ clientId: result.clientId, error: result.error }))
  }
})
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run test/server/utils/persona/tierRecompute.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/utils/persona/tierRecompute.ts server/api/cron/persona-tier-recompute.post.ts test/server/utils/persona/tierRecompute.test.ts
git commit -m "feat(persona): extend nightly recompute cron with exclusion-audience resolution"
```

---

### Task 4: `audienceSync.ts` — 3-way candidate join and `countExclusionMembers`

**Files:**
- Modify: `server/utils/persona/audienceSync.ts`
- Test: `test/server/utils/persona/audienceSync.test.ts`

**Interfaces:**
- Consumes: `crm_persona_exclusion_memberships` table shape from Task 1 (referenced only in SQL text, no TS import needed).
- Produces: `countExclusionMembers(clientId: string, filters: Record<string, string>): Promise<number>`. Task 5 imports this. `loadEligibleMembers`'s exported signature is unchanged — only its internal candidate-join logic changes, so no other file needs updating for this.

- [ ] **Step 1: Write the failing tests**

Replace `test/server/utils/persona/audienceSync.test.ts` with:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueryRows = vi.fn()
const mockQueryOne = vi.fn()
vi.mock('~~/server/utils/db', () => ({
  execute: vi.fn(),
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

import { countExclusionMembers, countTierMembers, loadEligibleMembers } from '../../../../server/utils/persona/audienceSync'

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
  it('builds the candidate query without any membership join when no tier or exclusion filter is supplied', async () => {
    await loadEligibleMembers(context())

    const [sql, params] = mockQueryRows.mock.calls[0]!
    expect(sql).not.toContain('crm_persona_tier_memberships')
    expect(sql).not.toContain('crm_persona_exclusion_memberships')
    expect(params).toEqual([CLIENT_ID, 'meta'])
  })

  it('renders the candidate query byte-for-byte identical to the pre-tier-filter query when no tier filter is supplied', async () => {
    await loadEligibleMembers(context())

    const [sql] = mockQueryRows.mock.calls[0]!
    expect(sql).toContain('FROM crm_customer_signals signal\n        WHERE')
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

  it('joins the exclusion-membership table when the exclusion filter is supplied, with no extra parameter', async () => {
    await loadEligibleMembers(context({ filters: { excludeAudience: 'true' } }))

    const [sql, params] = mockQueryRows.mock.calls[0]!
    expect(sql).toContain('JOIN crm_persona_exclusion_memberships excl')
    expect(sql).not.toContain('crm_persona_tier_memberships')
    expect(params).toEqual([CLIENT_ID, 'meta'])
  })

  it('still applies attribution filters alongside the exclusion filter', async () => {
    await loadEligibleMembers(context({ filters: { excludeAudience: 'true', platform: 'google' } }))

    const [sql, params] = mockQueryRows.mock.calls[0]!
    expect(sql).toContain('crm_persona_exclusion_memberships')
    expect(params).toEqual([CLIENT_ID, 'google', 'meta'])
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

describe('countExclusionMembers', () => {
  it('counts distinct profiles in the exclusion membership set and any attribution filters', async () => {
    mockQueryOne.mockResolvedValue({ count: '7' })

    const result = await countExclusionMembers(CLIENT_ID, { platform: 'meta' })

    expect(result).toBe(7)
    const [sql, params] = mockQueryOne.mock.calls[0]!
    expect(sql).toContain('crm_persona_exclusion_memberships')
    expect(sql).toContain('COUNT(DISTINCT signal.profile_id)')
    expect(params).toEqual([CLIENT_ID, 'meta'])
  })

  it('returns 0 when no row is found', async () => {
    mockQueryOne.mockResolvedValue(undefined)

    const result = await countExclusionMembers(CLIENT_ID, {})

    expect(result).toBe(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `pnpm exec vitest run test/server/utils/persona/audienceSync.test.ts`
Expected: the pre-existing tier tests still PASS; the two new exclusion-filter tests in `loadEligibleMembers` and the whole `countExclusionMembers` describe block FAIL (`countExclusionMembers` is not exported yet, and the exclusion filter isn't wired into the join yet).

- [ ] **Step 3: Implement the changes in `audienceSync.ts`**

In `loadEligibleMembers`, rename `tierJoinSql` to `candidateJoinSql` and add the exclusion branch:

```ts
export async function loadEligibleMembers(context: ExportContext): Promise<HashedAudienceMember[]> {
  const filters = context.filters || {}
  const params: unknown[] = [context.client_id]
  const candidatesFilterSql = signalFilterSql(filters, params)
  let candidateJoinSql = ''
  if (filters.tierKey) {
    params.push(filters.tierKey)
    candidateJoinSql = `JOIN crm_persona_tier_memberships tier
                           ON tier.client_id = signal.client_id
                          AND tier.profile_id = signal.profile_id
                          AND tier.tier_key = $${params.length}`
  } else if (filters.excludeAudience === 'true') {
    candidateJoinSql = `JOIN crm_persona_exclusion_memberships excl
                           ON excl.client_id = signal.client_id
                          AND excl.profile_id = signal.profile_id`
  }
  params.push(context.provider)
  const destinationParamIndex = params.length
  const candidatesFromSql = candidateJoinSql
    ? `FROM crm_customer_signals signal\n         ${candidateJoinSql}`
    : 'FROM crm_customer_signals signal'
```

(The rest of the function body — the `WITH candidates AS (...)` query and everything after — is unchanged; it already references `candidatesFromSql`, `candidatesFilterSql`, and `destinationParamIndex` by name, not by the old `tierJoinSql` variable.)

Add `countExclusionMembers` immediately after `countTierMembers`:

```ts
// Upper-bound estimate only: applies just the attribution/consent-marketing gates from
// signalFilterSql, not the additional latest-consent/do-not-contact/contactability/suppression
// gates loadEligibleMembers applies at export time — the real deliverable audience is smaller.
export async function countExclusionMembers(
  clientId: string,
  filters: Record<string, string>
): Promise<number> {
  const params: unknown[] = [clientId]
  const filterSql = signalFilterSql(filters, params)
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(DISTINCT signal.profile_id) AS count
       FROM crm_customer_signals signal
       JOIN crm_persona_exclusion_memberships excl
         ON excl.client_id = signal.client_id
        AND excl.profile_id = signal.profile_id
      WHERE ${filterSql}`,
    params
  )
  return Number(row?.count ?? 0)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run test/server/utils/persona/audienceSync.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/utils/persona/audienceSync.ts test/server/utils/persona/audienceSync.test.ts
git commit -m "feat(persona): exclusion-audience candidate join and countExclusionMembers"
```

---

### Task 5: `activation.ts` + `metrics.ts` — size-estimation branch

**Files:**
- Modify: `server/utils/persona/metrics.ts`
- Modify: `server/utils/persona/activation.ts`
- Test: `test/server/utils/persona/activation.test.ts`

**Interfaces:**
- Consumes: `countExclusionMembers` from Task 4.
- Produces: `PersonaMetricsFilters.excludeAudience?: 'true'` field. Task 6's Zod schema output must structurally match this type (both use the literal string `'true'`).

- [ ] **Step 1: Write the failing tests**

Replace `test/server/utils/persona/activation.test.ts` with:

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
const mockCountExclusionMembers = vi.fn()
vi.mock('~~/server/utils/persona/audienceSync', () => ({
  countTierMembers: (...args: unknown[]) => mockCountTierMembers(...args),
  countExclusionMembers: (...args: unknown[]) => mockCountExclusionMembers(...args)
}))

import { createPersonaActivationRequest } from '../../../../server/utils/persona/activation'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  mockQueryOne.mockReset()
  mockIsPersonaIdentityEnabled.mockReset()
  mockGetCachedPersonaMetrics.mockReset()
  mockCountTierMembers.mockReset()
  mockCountExclusionMembers.mockReset()
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

  it('uses the exclusion-member count for an exclusion-filtered request without calling getCachedPersonaMetrics', async () => {
    mockIsPersonaIdentityEnabled.mockResolvedValue(true)
    mockCountExclusionMembers.mockResolvedValue(320)
    mockQueryOne.mockResolvedValueOnce({ id: 'request-3' }).mockResolvedValueOnce({ id: 'audit-3' })

    const result = await createPersonaActivationRequest({
      clientId: CLIENT_ID,
      provider: 'meta',
      name: 'Negative signal exclusion',
      filters: { excludeAudience: 'true' },
      expiresAt: '2026-08-01T00:00:00.000Z',
      actorId: ACTOR_ID
    })

    expect(result).toMatchObject({ id: 'request-3', estimatedSize: 320, status: 'pending_privacy' })
    expect(mockCountExclusionMembers).toHaveBeenCalledWith(CLIENT_ID, { excludeAudience: 'true' })
    expect(mockGetCachedPersonaMetrics).not.toHaveBeenCalled()
    expect(mockCountTierMembers).not.toHaveBeenCalled()
  })

  it('rejects an exclusion-filtered request when persona identity is disabled, without querying exclusion membership', async () => {
    mockIsPersonaIdentityEnabled.mockResolvedValue(false)

    await expect(createPersonaActivationRequest({
      clientId: CLIENT_ID,
      provider: 'meta',
      name: 'Negative signal exclusion',
      filters: { excludeAudience: 'true' },
      expiresAt: '2026-08-01T00:00:00.000Z',
      actorId: ACTOR_ID
    })).rejects.toMatchObject({ statusCode: 409 })
    expect(mockCountExclusionMembers).not.toHaveBeenCalled()
  })

  it('keeps the existing getCachedPersonaMetrics path unchanged for a non-tier-filtered, non-exclusion request', async () => {
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
    expect(mockCountExclusionMembers).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `pnpm exec vitest run test/server/utils/persona/activation.test.ts`
Expected: the 3 pre-existing tests still PASS; the 2 new exclusion tests FAIL (`filters.excludeAudience` isn't handled yet, `countExclusionMembers` isn't imported).

- [ ] **Step 3: Add `excludeAudience` to `PersonaMetricsFilters`**

In `server/utils/persona/metrics.ts`, add one field to the interface:

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
  excludeAudience?: 'true'
}
```

- [ ] **Step 4: Add the exclusion branch in `activation.ts`**

Update the import and the branch in `createPersonaActivationRequest`:

```ts
import { countExclusionMembers, countTierMembers } from '~~/server/utils/persona/audienceSync'
```

```ts
  let estimatedSize: number
  if (input.filters.tierKey) {
    if (!await isPersonaIdentityEnabled(input.clientId)) {
      throw createError({ statusCode: 409, statusMessage: 'Persona Identity is not enabled for this client' })
    }
    estimatedSize = await countTierMembers(input.clientId, input.filters.tierKey, input.filters as Record<string, string>)
  } else if (input.filters.excludeAudience === 'true') {
    if (!await isPersonaIdentityEnabled(input.clientId)) {
      throw createError({ statusCode: 409, statusMessage: 'Persona Identity is not enabled for this client' })
    }
    estimatedSize = await countExclusionMembers(input.clientId, input.filters as Record<string, string>)
  } else {
    const projection = await getCachedPersonaMetrics(input.clientId, input.filters)
    if (!projection.enabled || !projection.metrics) {
      throw createError({ statusCode: 409, statusMessage: 'Persona Identity is not enabled for this client' })
    }
    estimatedSize = projection.metrics.totalPersonas
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run test/server/utils/persona/activation.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/utils/persona/metrics.ts server/utils/persona/activation.ts test/server/utils/persona/activation.test.ts
git commit -m "feat(persona): exclusion-audience size estimation in activation requests"
```

---

### Task 6: `activations.post.ts` — Zod schema and mutual-exclusivity guard

**Files:**
- Modify: `server/api/agency/analytics/personas/activations.post.ts`
- Test: `test/server/api/personaActivationsEndpoint.test.ts`

**Interfaces:**
- Consumes: `PersonaMetricsFilters.excludeAudience` shape from Task 5 (both use the literal string `'true'`).
- Produces: nothing consumed by a later task — this is the outermost API surface.

- [ ] **Step 1: Write the failing tests**

Add these three tests inside the existing `describe('POST /agency/analytics/personas/activations', ...)` block in `test/server/api/personaActivationsEndpoint.test.ts`, after the existing `'still accepts a request with no tierKey filter (existing behavior)'` test:

```ts
  it('accepts an excludeAudience filter', async () => {
    mockBody = {
      clientId: CLIENT_ID,
      provider: 'meta',
      name: 'Negative signal exclusion',
      filters: { excludeAudience: 'true' },
      expiresAt: '2026-08-01T00:00:00.000Z'
    }
    const handler = (await import(
      '~~/server/api/agency/analytics/personas/activations.post'
    )).default

    await handler({ context: {} } as never)

    expect(mockCreatePersonaActivationRequest).toHaveBeenCalledWith(expect.objectContaining({
      filters: { excludeAudience: 'true' }
    }))
  })

  it('rejects a request combining tierKey and excludeAudience', async () => {
    mockBody = {
      clientId: CLIENT_ID,
      provider: 'meta',
      name: 'Contradictory filters',
      filters: { tierKey: 'hot', excludeAudience: 'true' },
      expiresAt: '2026-08-01T00:00:00.000Z'
    }
    const handler = (await import(
      '~~/server/api/agency/analytics/personas/activations.post'
    )).default

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mockCreatePersonaActivationRequest).not.toHaveBeenCalled()
  })

  it('still rejects an invalid excludeAudience value', async () => {
    mockBody = {
      clientId: CLIENT_ID,
      provider: 'meta',
      name: 'Bogus exclusion audience',
      filters: { excludeAudience: 'yes' },
      expiresAt: '2026-08-01T00:00:00.000Z'
    }
    const handler = (await import(
      '~~/server/api/agency/analytics/personas/activations.post'
    )).default

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mockCreatePersonaActivationRequest).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `pnpm exec vitest run test/server/api/personaActivationsEndpoint.test.ts`
Expected: the pre-existing tests still PASS; the 3 new tests FAIL (`excludeAudience` is an unrecognized key today, so `z.strictObject` rejects the whole body with a 400 for the first test too, but for the wrong reason — after Step 3, the first test should pass because the field is now recognized, and the other two should pass because the field/refine correctly reject them).

- [ ] **Step 3: Update `activations.post.ts`**

```ts
import { createError, defineEventHandler, readBody } from 'h3'
import { z } from 'zod'
import { requirePersonaAdminAccess } from '~~/server/utils/persona/access'
import { createPersonaActivationRequest } from '~~/server/utils/persona/activation'
import { requireClientEntitlement } from '~~/server/utils/billing/entitlements'

const Body = z.strictObject({
  clientId: z.string().uuid(),
  provider: z.enum(['google_ads', 'meta']),
  name: z.string().trim().min(3).max(120),
  filters: z.strictObject({
    startDate: z.string().date().optional(),
    endDate: z.string().date().optional(),
    platform: z.string().max(40).optional(),
    campaignId: z.string().max(512).optional(),
    adGroupId: z.string().max(512).optional(),
    adSetId: z.string().max(512).optional(),
    adId: z.string().max(512).optional(),
    creativeId: z.string().max(512).optional(),
    landingPage: z.string().max(2048).optional(),
    device: z.string().max(40).optional(),
    tierKey: z.enum(['hot', 'warm', 'cold']).optional(),
    excludeAudience: z.literal('true').optional()
  }),
  expiresAt: z.string().datetime({ offset: true })
}).refine(
  data => !(data.filters.tierKey && data.filters.excludeAudience),
  { message: 'A request cannot combine tierKey and excludeAudience filters', path: ['filters'] }
)

export default defineEventHandler(async event => {
  const user = await requirePersonaAdminAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  }
  await requireClientEntitlement(parsed.data.clientId, 'persona.identity')
  await requireClientEntitlement(
    parsed.data.clientId,
    parsed.data.provider === 'google_ads' ? 'audience.google' : 'audience.meta'
  )
  return createPersonaActivationRequest({
    ...parsed.data,
    actorId: user.id
  })
})
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run test/server/api/personaActivationsEndpoint.test.ts`
Expected: PASS (all tests, pre-existing and new)

- [ ] **Step 5: Commit**

```bash
git add server/api/agency/analytics/personas/activations.post.ts test/server/api/personaActivationsEndpoint.test.ts
git commit -m "feat(persona): accept excludeAudience filter on activation requests"
```

---

### Final Verification

- [ ] **Run the full test suite**

Run: `pnpm exec vitest run`
Expected: all persona/audienceSync/activation/cohorts/tierRecompute/migration tests PASS; the pre-existing baseline of 20 failing files / 39 failing tests (unrelated to this work, see Global Constraints) is unchanged in count and file list.

- [ ] **Typecheck**

Run: `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck`
Expected: no new type errors beyond the project's pre-existing ~60 baseline (all from `index.d.ts`-only types, per this project's known issues).
