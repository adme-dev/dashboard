# Anomalies Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/anomalies` from a passive computed-on-load dashboard into a workflow-grade incident system: persisted incidents with status workflow, scheduled detection across financial + ad-spend + per-client signals, push notifications on critical events, and per-incident drill-down and grouping.

**Architecture:** Persistent `anomalies` table with incident-model dedup (unique partial index on active fingerprint). Detection consolidates into a pluggable analyser pipeline (`server/utils/anomalyDetection/`). Daily 7am-tenant-local Cloudflare cron + manual scan endpoint write through a single `runDetectionForTenant` function gated by a 5-minute KV in-flight lock. Page reads from the table, never live-aggregates Xero. Critical-only Smart Watch + email push on first detection. Lazy Groq narrative on the action-plan slideover. Phased 4-PR rollout, each independently shippable.

**Tech Stack:** Nuxt 4 (Vue 3 / `<script setup>`), Nuxt UI v4, Nitro server (Cloudflare Pages preset), Postgres via `pg`/`@neondatabase/serverless`, Cloudflare KV, Resend (email), Groq (LLM), Vitest + happy-dom (tests), `wrangler` Cron Triggers.

---

## Spec corrections verified during planning

These items were flagged in the spec's "Open items resolved during planning" section. Findings:

| Spec assumption | Reality | Resolution |
|---|---|---|
| `xero_tenants` table with per-tenant rows | Single-tenant: `xero_org_connection` (one row, `tenant_id TEXT UNIQUE`) | Add `timezone TEXT` to `xero_org_connection`. Cron handler runs once per tick — no fan-out loop. |
| `notification_topics` table | Doesn't exist. Notifications go via `createNotification()` from `server/utils/notifications.ts` | Add `'anomaly_critical'` to `NotificationType` union. Direct fan-out to all team members with `PERMISSIONS.FINANCE`. |
| `permissions` / `role_permissions` DB tables for `view_anomalies` | Code-level `PERMISSIONS` constant in `server/utils/permissions.ts` | Use `PERMISSIONS.FINANCE` for gating. No DB rows for permissions. |
| User FK as `INTEGER REFERENCES users(id)` | App uses `team_members(id)` (UUID) | All user FKs in new tables use `UUID REFERENCES team_members(id)`. |
| Migration `082_anomaly_persistence.sql` | Latest sequential is `084-invoice-reminders.sql` | New migration is `085-anomaly-persistence.sql`. |
| `requireRole(event, PERMISSIONS.X)` shape | Real signature: `requireRole(event, roles: string[])` | Pass `PERMISSIONS.FINANCE` directly (it's already an array). |

YoY P&L window verification (>13 months) is deferred to Task 2.1, which fails fast and ships the analyser disabled if Xero doesn't return enough data.

Per-client cost formula uses **revenue minus tracked-time cost** as the canonical first definition. Ad-spend pass-through is added as a follow-up if the rate-card module review uncovers a clean way to compute markup; not blocking this plan.

---

## File Structure

### New files

```
server/database/migrations/
  085-anomaly-persistence.sql

server/utils/anomalyDetection/
  index.ts                  -- runAllAnalysers() entry
  runForTenant.ts           -- runDetectionForTenant(tenantId, opts)
  types.ts                  -- DetectedAnomaly, AnalyserContext, SharedData
  fingerprints.ts           -- buildFingerprint(type, subKey)
  reconcile.ts              -- diff detected vs. existing rows
  sharedData.ts             -- fetch Xero/Meta/Google data once per run
  groupRules.ts             -- correlation → group_key
  kvLock.ts                 -- acquire/release in-flight lock
  notify.ts                 -- queueAnomalyNotification()
  analysers/
    profitability.ts
    revenue.ts
    expenses.ts
    cashflow.ts
    receivables.ts
    budget.ts
    adspend.ts
    clients.ts
    transactions.ts

server/api/ai/anomalies/
  index.get.ts              -- list with filters (replaces old anomalies.get.ts)
  [id].get.ts               -- single anomaly + events
  [id].patch.ts             -- status mutations
  [id]/narrative.get.ts     -- lazy Groq narrative
  scan.post.ts              -- manual scan
  export.get.ts             -- CSV export
  count/critical-open.get.ts -- sidebar badge

server/api/cron/
  anomaly-detection.ts      -- hourly cron handler

server/api/admin/anomalies/
  cron-runs.get.ts

server/utils/email/templates/
  anomalyAlert.ts           -- single-incident email body builder

scripts/
  anomaly-backfill.ts       -- one-off: detect with notifications suppressed

app/composables/
  useOpenAnomalyCount.ts

tests/unit/anomalyDetection/
  fingerprints.test.ts
  reconcile.test.ts
  groupRules.test.ts
  analysers/
    profitability.test.ts
    revenue.test.ts
    expenses.test.ts
    cashflow.test.ts
    receivables.test.ts
    budget.test.ts
    adspend.test.ts
    clients.test.ts
    transactions.test.ts

tests/integration/
  anomalies-reconcile.test.ts
  anomalies-scan-endpoint.test.ts
  anomalies-mutation-endpoints.test.ts
  anomalies-kvlock.test.ts
```

### Modified files

```
app/pages/anomalies/index.vue                         -- rewrite against new endpoint
app/layouts/agency.vue                                -- sidebar badge wiring
app/pages/features/[slug].vue                         -- marketing copy alignment
server/utils/notifications.ts                         -- add 'anomaly_critical' to NotificationType
wrangler.toml                                         -- add hourly cron trigger
server/utils/aiAgentAnalyzer.ts                       -- ad-spend logic moved to analyser; delete dead code

# Deleted
server/api/ai/anomaly-detection.get.ts                -- migrated into transactions analyser
server/api/ai/anomalies.get.ts                        -- replaced by index.get.ts in subfolder
```

---

# Phase 1 — Foundation (PR 1)

End-state: migration applied, page reads from new persisted endpoint, manual scan endpoint works, all status mutations work, no cron, no notifications, no new analysers (existing 6 categories ported).

---

## Task 1.1: Migration — anomalies + anomaly_events tables

**Files:**
- Create: `server/database/migrations/085-anomaly-persistence.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 085: Anomaly persistence
-- Tables for the /anomalies workflow-grade incident system.
-- See: docs/superpowers/specs/2026-04-30-anomalies-overhaul-design.md

BEGIN;

-- ── anomalies (incidents) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',

  title TEXT NOT NULL,
  description TEXT NOT NULL,
  recommendation TEXT,
  tags TEXT[],
  data_sources TEXT[] NOT NULL DEFAULT '{}',

  metric JSONB,
  comparison JSONB,
  context JSONB,

  group_key TEXT,
  driver_narrative TEXT,
  driver_narrative_at TIMESTAMPTZ,

  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_detected_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  snoozed_until TIMESTAMPTZ,
  notification_sent_at TIMESTAMPTZ,

  acknowledged_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  assignee_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  resolution_notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT anomalies_status_check CHECK (
    status IN ('open', 'acknowledged', 'snoozed', 'resolved', 'dismissed')
  ),
  CONSTRAINT anomalies_severity_check CHECK (
    severity IN ('critical', 'warning', 'info')
  ),
  CONSTRAINT anomalies_type_check CHECK (
    type IN ('profitability','revenue','expenses','cashflow','receivables',
             'budget','adspend','clients','transactions')
  )
);

-- Enforces incident model: one ACTIVE row per fingerprint per tenant.
-- Resolved/dismissed rows are out of the index, so re-occurrences create new rows.
CREATE UNIQUE INDEX IF NOT EXISTS anomalies_active_fingerprint_idx
  ON anomalies (tenant_id, fingerprint)
  WHERE status NOT IN ('resolved', 'dismissed');

CREATE INDEX IF NOT EXISTS anomalies_tenant_status_idx ON anomalies (tenant_id, status);
CREATE INDEX IF NOT EXISTS anomalies_group_key_idx ON anomalies (group_key) WHERE group_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS anomalies_severity_idx ON anomalies (tenant_id, severity, status);
CREATE INDEX IF NOT EXISTS anomalies_first_detected_idx ON anomalies (tenant_id, first_detected_at DESC);

-- ── anomaly_events (audit trail) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS anomaly_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anomaly_id UUID NOT NULL REFERENCES anomalies(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  user_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT anomaly_events_event_check CHECK (
    event IN ('detected','re-detected','acknowledged','snoozed','resolved',
              'dismissed','reopened','assigned','narrative-generated','unsnoozed')
  )
);

CREATE INDEX IF NOT EXISTS anomaly_events_anomaly_id_idx
  ON anomaly_events (anomaly_id, created_at DESC);

-- ── timezone column on the org's Xero connection ────────────────────
-- Used by the cron handler to gate "is it 7am locally?".
-- Defaults to Australia/Sydney (the agency's HQ TZ).
ALTER TABLE xero_org_connection
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Australia/Sydney';

-- ── updated_at trigger on anomalies ─────────────────────────────────
DROP TRIGGER IF EXISTS update_anomalies_updated_at ON anomalies;
CREATE TRIGGER update_anomalies_updated_at
  BEFORE UPDATE ON anomalies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
```

- [ ] **Step 2: Apply the migration**

```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/085-anomaly-persistence.sql
```

Expected: `BEGIN`, `CREATE TABLE`, `CREATE INDEX` × 5, `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE`, `DROP TRIGGER`, `CREATE TRIGGER`, `COMMIT`.

- [ ] **Step 3: Verify schema**

```bash
psql "$DATABASE_URL" -c "\d anomalies" | head -40
psql "$DATABASE_URL" -c "\d anomaly_events" | head -20
psql "$DATABASE_URL" -c "SELECT column_name FROM information_schema.columns WHERE table_name='xero_org_connection' AND column_name='timezone';"
```

Expected: anomalies table shown with all columns + 5 indexes; anomaly_events shown; timezone column present.

- [ ] **Step 4: Commit**

```bash
git add server/database/migrations/085-anomaly-persistence.sql
git commit -m "feat(anomalies): migration 085 — persistence + audit trail tables"
```

---

## Task 1.2: Type definitions for the detection pipeline

**Files:**
- Create: `server/utils/anomalyDetection/types.ts`

- [ ] **Step 1: Write the types**

```ts
// server/utils/anomalyDetection/types.ts

export type AnomalySeverity = 'critical' | 'warning' | 'info'

export type AnomalyType =
  | 'profitability' | 'revenue' | 'expenses' | 'cashflow'
  | 'receivables' | 'budget' | 'adspend' | 'clients' | 'transactions'

export type AnomalyStatus =
  | 'open' | 'acknowledged' | 'snoozed' | 'resolved' | 'dismissed'

export type AnomalyEvent =
  | 'detected' | 're-detected' | 'acknowledged' | 'snoozed'
  | 'resolved' | 'dismissed' | 'reopened' | 'assigned'
  | 'narrative-generated' | 'unsnoozed'

export interface AnomalyMetric {
  label: string
  value: number
  format: 'currency' | 'percent' | 'number'
}

export interface AnomalyContext {
  period?: string
  range?: { from?: string | null; to?: string | null }
  category?: string
  vendor?: string
  client?: string
  account?: string
}

export interface DetectedAnomaly {
  fingerprint: string
  type: AnomalyType
  severity: AnomalySeverity
  title: string
  description: string
  metric?: AnomalyMetric
  comparison?: AnomalyMetric & { trend?: 'up' | 'down' }
  context?: AnomalyContext
  recommendation?: string
  tags?: string[]
  dataSources: string[]
  groupKey?: string
}

export interface SharedData {
  pnl: any | null
  expenses: any | null
  bankMonitoring: any | null
  cashForecast: any | null
  aging: any | null
  budgetVariance: any | null
  // P2: filled by adspend / clients / transactions analysers in Phase 2
  mediaSpend: any | null
  clientRevenue: any | null
  invoiceLines: any | null
}

export interface AnalyserContext {
  tenantId: string
  data: SharedData
  now: Date
}

export type Analyser = (ctx: AnalyserContext) => Promise<DetectedAnomaly[]>

// Persisted row shape (DB → API)
export interface AnomalyRow {
  id: string
  tenant_id: string
  fingerprint: string
  type: AnomalyType
  severity: AnomalySeverity
  status: AnomalyStatus
  title: string
  description: string
  recommendation: string | null
  tags: string[] | null
  data_sources: string[]
  metric: AnomalyMetric | null
  comparison: (AnomalyMetric & { trend?: 'up' | 'down' }) | null
  context: AnomalyContext | null
  group_key: string | null
  driver_narrative: string | null
  driver_narrative_at: string | null
  first_detected_at: string
  last_detected_at: string
  resolved_at: string | null
  snoozed_until: string | null
  notification_sent_at: string | null
  acknowledged_by: string | null
  acknowledged_at: string | null
  assignee_id: string | null
  resolution_notes: string | null
  created_at: string
  updated_at: string
}
```

- [ ] **Step 2: Commit**

```bash
git add server/utils/anomalyDetection/types.ts
git commit -m "feat(anomalies): canonical types for detection pipeline"
```

---

## Task 1.3: Fingerprints utility (TDD)

**Files:**
- Create: `tests/unit/anomalyDetection/fingerprints.test.ts`
- Create: `server/utils/anomalyDetection/fingerprints.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/anomalyDetection/fingerprints.test.ts
import { describe, it, expect } from 'vitest'
import { buildFingerprint } from '~~/server/utils/anomalyDetection/fingerprints'

describe('buildFingerprint', () => {
  it('returns the bare type+subkey when subkey is simple', () => {
    expect(buildFingerprint('profitability', 'net-loss')).toBe('profitability:net-loss')
  })

  it('lowercases and slug-safes the subkey', () => {
    expect(buildFingerprint('expenses', 'Vendor Outlier: Stripe Inc.'))
      .toBe('expenses:vendor-outlier-stripe-inc')
  })

  it('truncates long subkeys to 80 chars to keep the fingerprint readable', () => {
    const long = 'x'.repeat(200)
    const fp = buildFingerprint('expenses', long)
    expect(fp.length).toBeLessThanOrEqual(80 + 'expenses:'.length)
  })

  it('is stable: same inputs → same output', () => {
    const a = buildFingerprint('cashflow', 'overdraft:Main Account')
    const b = buildFingerprint('cashflow', 'overdraft:Main Account')
    expect(a).toBe(b)
  })

  it('is collision-resistant for two different subkeys', () => {
    const a = buildFingerprint('expenses', 'Stripe')
    const b = buildFingerprint('expenses', 'stripe-payments')
    expect(a).not.toBe(b)
  })
})
```

- [ ] **Step 2: Run, expect failure**

```bash
npx vitest run tests/unit/anomalyDetection/fingerprints.test.ts
```

Expected: 5 failed (module not found).

- [ ] **Step 3: Implement**

```ts
// server/utils/anomalyDetection/fingerprints.ts
import type { AnomalyType } from './types'

const MAX_SUBKEY_LEN = 80

/**
 * Stable, slug-safe identifier for an anomaly across detection runs.
 * Active rows are deduped on (tenant_id, fingerprint) — see migration 085.
 */
export function buildFingerprint(type: AnomalyType, subKey: string): string {
  const slug = subKey
    .toLowerCase()
    .replace(/[^a-z0-9-:]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, MAX_SUBKEY_LEN)
  return `${type}:${slug}`
}
```

- [ ] **Step 4: Run, expect pass**

```bash
npx vitest run tests/unit/anomalyDetection/fingerprints.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add server/utils/anomalyDetection/fingerprints.ts tests/unit/anomalyDetection/fingerprints.test.ts
git commit -m "feat(anomalies): fingerprint helper with stable slug semantics"
```

---

## Task 1.4: KV in-flight lock utility (TDD)

**Files:**
- Create: `tests/integration/anomalies-kvlock.test.ts`
- Create: `server/utils/anomalyDetection/kvLock.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/anomalies-kvlock.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { acquireScanLock, releaseScanLock } from '~~/server/utils/anomalyDetection/kvLock'

// Tests use an in-memory KV mock injected via globalThis. The real
// implementation reads the binding from the H3 event when running on CF.
const memKV = new Map<string, { value: string; expiresAt: number }>()

beforeEach(() => {
  memKV.clear()
  ;(globalThis as any).__TEST_KV__ = {
    get: async (k: string) => {
      const v = memKV.get(k)
      if (!v) return null
      if (v.expiresAt < Date.now()) { memKV.delete(k); return null }
      return v.value
    },
    put: async (k: string, value: string, opts?: { expirationTtl?: number }) => {
      const expiresAt = opts?.expirationTtl ? Date.now() + opts.expirationTtl * 1000 : Number.MAX_SAFE_INTEGER
      memKV.set(k, { value, expiresAt })
    },
    delete: async (k: string) => { memKV.delete(k) },
  }
})

describe('scan KV lock', () => {
  it('acquires when free', async () => {
    const got = await acquireScanLock('tenant-A')
    expect(got).toBe(true)
  })

  it('rejects when already held', async () => {
    await acquireScanLock('tenant-A')
    const second = await acquireScanLock('tenant-A')
    expect(second).toBe(false)
  })

  it('releases and allows re-acquisition', async () => {
    await acquireScanLock('tenant-A')
    await releaseScanLock('tenant-A')
    const got = await acquireScanLock('tenant-A')
    expect(got).toBe(true)
  })

  it('isolates tenants', async () => {
    await acquireScanLock('tenant-A')
    const got = await acquireScanLock('tenant-B')
    expect(got).toBe(true)
  })
})
```

- [ ] **Step 2: Run, expect failure**

```bash
npx vitest run tests/integration/anomalies-kvlock.test.ts
```

Expected: 4 failed.

- [ ] **Step 3: Implement**

```ts
// server/utils/anomalyDetection/kvLock.ts

/**
 * In-flight scan lock backed by Cloudflare KV.
 *
 * 5-minute TTL — well above realistic detection time (~15-60s) but short
 * enough that a crashed run unlocks itself naturally. Concurrent callers
 * for the same tenant see the lock and return early; the page polls every
 * 5s for up to 60s to surface completion.
 */
const LOCK_TTL_SECONDS = 300
const LOCK_PREFIX = 'anomaly-scan-lock:'

function getKV() {
  // In tests, an in-memory binding is injected via globalThis.__TEST_KV__.
  // In production, the binding is `CACHE` (per CLAUDE.md memory).
  const test = (globalThis as any).__TEST_KV__
  if (test) return test

  // @ts-expect-error CF runtime global
  const env = globalThis.process?.env || {}
  // Resolve via the CF event context in real callers; this util is also
  // called from cron where the context is implicit. The wrapper at
  // server/utils/kv.ts handles binding resolution.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { kvGet, kvPut, kvDelete } = require('~~/server/utils/kv')
  return {
    get: (k: string) => kvGet(null, k),
    put: (k: string, v: string, o?: { expirationTtl?: number }) =>
      kvPut(null, k, v, o?.expirationTtl ?? LOCK_TTL_SECONDS),
    delete: (k: string) => kvDelete(null, k),
  }
}

export async function acquireScanLock(tenantId: string): Promise<boolean> {
  const kv = getKV()
  const key = LOCK_PREFIX + tenantId
  const existing = await kv.get(key)
  if (existing) return false
  await kv.put(key, new Date().toISOString(), { expirationTtl: LOCK_TTL_SECONDS })
  return true
}

export async function releaseScanLock(tenantId: string): Promise<void> {
  const kv = getKV()
  await kv.delete(LOCK_PREFIX + tenantId)
}
```

- [ ] **Step 4: Run, expect pass**

```bash
npx vitest run tests/integration/anomalies-kvlock.test.ts
```

Expected: 4 passed.

> NOTE: The `acquireScanLock`/`get`-then-`put` pattern is not atomic on KV. Race window is ~50–200ms. Acceptable here because concurrent callers for the same tenant are extremely rare (one cron handler + one user click), and the unique partial index on `anomalies` is the correctness backstop. If the race ever surfaces, switch to a Durable Object for the lock — out of scope here.

- [ ] **Step 5: Commit**

```bash
git add server/utils/anomalyDetection/kvLock.ts tests/integration/anomalies-kvlock.test.ts
git commit -m "feat(anomalies): KV-backed in-flight scan lock with 5min TTL"
```

---

## Task 1.5: Reconciliation logic (TDD)

This is the most behaviourally important module. Test the state machine before writing it.

**Files:**
- Create: `tests/unit/anomalyDetection/reconcile.test.ts`
- Create: `server/utils/anomalyDetection/reconcile.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/anomalyDetection/reconcile.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { reconcile } from '~~/server/utils/anomalyDetection/reconcile'
import type { DetectedAnomaly, AnomalyRow } from '~~/server/utils/anomalyDetection/types'

// We mock the DB layer at the helper level — reconcile calls these only.
const mockRows: AnomalyRow[] = []
const inserted: any[] = []
const updated: any[] = []
const events: any[] = []
const notified: string[] = []

vi.mock('~~/server/utils/db', () => ({
  queryRows: vi.fn(async () => mockRows),
  queryOne: vi.fn(async (sql: string, params: any[]) => {
    if (sql.startsWith('INSERT INTO anomalies')) {
      const row = { id: `row-${inserted.length + 1}`, ...mapInsertParams(params) }
      inserted.push(row)
      return row
    }
    if (sql.startsWith('UPDATE anomalies')) {
      updated.push({ sql, params })
      return null
    }
    return null
  }),
  execute: vi.fn(async (sql: string, params: any[]) => {
    if (sql.includes('INSERT INTO anomaly_events')) events.push({ sql, params })
    if (sql.includes('UPDATE anomalies')) updated.push({ sql, params })
  }),
  transaction: vi.fn(async (fn: any) => fn({
    query: async (sql: string, params: any[]) => {
      if (sql.startsWith('INSERT INTO anomalies')) {
        const row = { id: `row-${inserted.length + 1}`, ...mapInsertParams(params) }
        inserted.push(row)
        return { rows: [row] }
      }
      if (sql.startsWith('UPDATE anomalies')) {
        updated.push({ sql, params })
        return { rows: [] }
      }
      if (sql.includes('INSERT INTO anomaly_events')) {
        events.push({ sql, params })
        return { rows: [] }
      }
      return { rows: [] }
    },
  })),
}))

vi.mock('~~/server/utils/anomalyDetection/notify', () => ({
  queueAnomalyNotification: vi.fn(async (id: string) => { notified.push(id) }),
}))

function mapInsertParams(params: any[]) {
  return {
    tenant_id: params[0], fingerprint: params[1], type: params[2],
    severity: params[3], status: params[4],
    title: params[5], description: params[6],
  }
}

beforeEach(() => {
  mockRows.length = 0
  inserted.length = 0
  updated.length = 0
  events.length = 0
  notified.length = 0
})

const make = (overrides: Partial<DetectedAnomaly>): DetectedAnomaly => ({
  fingerprint: 'profitability:net-loss',
  type: 'profitability',
  severity: 'critical',
  title: 'Net loss',
  description: 'Operating at a net loss',
  dataSources: ['Profit & Loss'],
  ...overrides,
})

describe('reconcile', () => {
  it('inserts a new row when fingerprint is unseen', async () => {
    const result = await reconcile('tenant-A', [make({})])
    expect(inserted).toHaveLength(1)
    expect(events.find(e => e.params.includes('detected'))).toBeTruthy()
    expect(result.inserted).toBe(1)
    expect(result.updated).toBe(0)
    expect(result.resolved).toBe(0)
  })

  it('queues notification when inserting a critical anomaly', async () => {
    await reconcile('tenant-A', [make({ severity: 'critical' })])
    expect(notified).toHaveLength(1)
  })

  it('does NOT queue notification for warning/info inserts', async () => {
    await reconcile('tenant-A', [
      make({ fingerprint: 'profitability:low-margin', severity: 'warning' }),
      make({ fingerprint: 'expenses:concentration', severity: 'info' }),
    ])
    expect(notified).toHaveLength(0)
  })

  it('updates last_detected_at on re-detection of an active row', async () => {
    mockRows.push({
      id: 'row-existing',
      tenant_id: 'tenant-A',
      fingerprint: 'profitability:net-loss',
      type: 'profitability', severity: 'critical', status: 'open',
      title: 'Net loss', description: 'old', recommendation: null,
      tags: null, data_sources: ['Profit & Loss'],
      metric: null, comparison: null, context: null,
      group_key: null, driver_narrative: null, driver_narrative_at: null,
      first_detected_at: '2026-04-01T00:00:00Z',
      last_detected_at: '2026-04-01T00:00:00Z',
      resolved_at: null, snoozed_until: null, notification_sent_at: '2026-04-01T00:00:00Z',
      acknowledged_by: null, acknowledged_at: null, assignee_id: null, resolution_notes: null,
      created_at: '2026-04-01T00:00:00Z', updated_at: '2026-04-01T00:00:00Z',
    } as AnomalyRow)

    const result = await reconcile('tenant-A', [make({})])
    expect(inserted).toHaveLength(0)
    expect(result.updated).toBe(1)
    expect(events.some(e => e.params.includes('re-detected'))).toBe(true)
    expect(notified).toHaveLength(0)
  })

  it('resolves an active row that is not detected this run', async () => {
    mockRows.push({
      id: 'row-stale', tenant_id: 'tenant-A', fingerprint: 'profitability:net-loss',
      type: 'profitability', severity: 'critical', status: 'open',
      title: 'Net loss', description: 'old', recommendation: null,
      tags: null, data_sources: [], metric: null, comparison: null, context: null,
      group_key: null, driver_narrative: null, driver_narrative_at: null,
      first_detected_at: '2026-04-01T00:00:00Z',
      last_detected_at: '2026-04-01T00:00:00Z',
      resolved_at: null, snoozed_until: null, notification_sent_at: null,
      acknowledged_by: null, acknowledged_at: null, assignee_id: null, resolution_notes: null,
      created_at: '2026-04-01T00:00:00Z', updated_at: '2026-04-01T00:00:00Z',
    } as any)

    const result = await reconcile('tenant-A', []) // no detections
    expect(result.resolved).toBe(1)
    expect(events.some(e => e.params.includes('resolved'))).toBe(true)
  })

  it('flips a snoozed row back to open when snooze expired and still detected', async () => {
    mockRows.push({
      id: 'row-snoozed', tenant_id: 'tenant-A', fingerprint: 'profitability:net-loss',
      type: 'profitability', severity: 'critical', status: 'snoozed',
      title: 'Net loss', description: 'old', recommendation: null,
      tags: null, data_sources: [], metric: null, comparison: null, context: null,
      group_key: null, driver_narrative: null, driver_narrative_at: null,
      first_detected_at: '2026-04-01T00:00:00Z', last_detected_at: '2026-04-01T00:00:00Z',
      resolved_at: null,
      snoozed_until: '2026-04-29T00:00:00Z', // expired (test "now" defaults to system time post-2026-04-29)
      notification_sent_at: '2026-04-01T00:00:00Z',
      acknowledged_by: null, acknowledged_at: null, assignee_id: null, resolution_notes: null,
      created_at: '2026-04-01T00:00:00Z', updated_at: '2026-04-01T00:00:00Z',
    } as any)

    await reconcile('tenant-A', [make({})])
    expect(events.some(e => e.params.includes('unsnoozed'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run, expect failure**

```bash
npx vitest run tests/unit/anomalyDetection/reconcile.test.ts
```

Expected: 6 failed (module not found).

- [ ] **Step 3: Implement reconcile**

```ts
// server/utils/anomalyDetection/reconcile.ts
import { queryRows, transaction } from '~~/server/utils/db'
import { queueAnomalyNotification } from './notify'
import type { DetectedAnomaly, AnomalyRow } from './types'

export interface ReconcileResult {
  inserted: number
  updated: number
  resolved: number
  unsnoozed: number
  notifications_queued: number
}

const NOTIFICATIONS_DISABLED = () =>
  process.env.ANOMALY_NOTIFICATIONS_DISABLED === 'true'

export async function reconcile(
  tenantId: string,
  detected: DetectedAnomaly[],
): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    inserted: 0, updated: 0, resolved: 0, unsnoozed: 0, notifications_queued: 0,
  }

  // Active = not resolved/dismissed.
  const activeRows: AnomalyRow[] = await queryRows<AnomalyRow>(
    `SELECT * FROM anomalies
     WHERE tenant_id = $1 AND status NOT IN ('resolved','dismissed')`,
    [tenantId],
  )

  const byFingerprint = new Map(activeRows.map(r => [r.fingerprint, r]))
  const detectedFingerprints = new Set(detected.map(d => d.fingerprint))
  const newlyInsertedCriticalIds: string[] = []

  await transaction(async (client) => {
    // Pass 1: insert/update for each detected anomaly
    for (const det of detected) {
      const existing = byFingerprint.get(det.fingerprint)

      if (!existing) {
        const ins = await client.query(
          `INSERT INTO anomalies
            (tenant_id, fingerprint, type, severity, status, title, description,
             recommendation, tags, data_sources, metric, comparison, context,
             group_key, notification_sent_at)
           VALUES ($1,$2,$3,$4,'open',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           RETURNING id, severity`,
          [
            tenantId, det.fingerprint, det.type, det.severity,
            det.title, det.description,
            det.recommendation ?? null,
            det.tags ?? null,
            det.dataSources,
            det.metric ? JSON.stringify(det.metric) : null,
            det.comparison ? JSON.stringify(det.comparison) : null,
            det.context ? JSON.stringify(det.context) : null,
            det.groupKey ?? null,
            det.severity === 'critical' && !NOTIFICATIONS_DISABLED() ? new Date() : null,
          ],
        )
        const id = ins.rows[0].id
        await client.query(
          `INSERT INTO anomaly_events (anomaly_id, event, metadata) VALUES ($1, $2, $3)`,
          [id, 'detected', JSON.stringify({ severity: det.severity })],
        )
        result.inserted++
        if (det.severity === 'critical' && !NOTIFICATIONS_DISABLED()) {
          newlyInsertedCriticalIds.push(id)
        }
        continue
      }

      // Re-detection of an existing active row.
      // Snooze housekeeping: if the row is snoozed and snooze has expired,
      // flip back to open.
      const wasSnoozedAndExpired =
        existing.status === 'snoozed' &&
        existing.snoozed_until &&
        new Date(existing.snoozed_until) <= new Date()

      const newStatus = wasSnoozedAndExpired ? 'open' : existing.status

      await client.query(
        `UPDATE anomalies
           SET last_detected_at = NOW(),
               severity = $1,
               title = $2,
               description = $3,
               recommendation = $4,
               tags = $5,
               metric = $6,
               comparison = $7,
               context = $8,
               group_key = $9,
               status = $10,
               snoozed_until = CASE WHEN $11::boolean THEN NULL ELSE snoozed_until END
         WHERE id = $12`,
        [
          det.severity, det.title, det.description, det.recommendation ?? null,
          det.tags ?? null,
          det.metric ? JSON.stringify(det.metric) : null,
          det.comparison ? JSON.stringify(det.comparison) : null,
          det.context ? JSON.stringify(det.context) : null,
          det.groupKey ?? null,
          newStatus,
          wasSnoozedAndExpired,
          existing.id,
        ],
      )

      if (wasSnoozedAndExpired) {
        await client.query(
          `INSERT INTO anomaly_events (anomaly_id, event) VALUES ($1, 'unsnoozed')`,
          [existing.id],
        )
        result.unsnoozed++
      }

      await client.query(
        `INSERT INTO anomaly_events (anomaly_id, event) VALUES ($1, 're-detected')`,
        [existing.id],
      )
      result.updated++
    }

    // Pass 2: resolve active rows whose fingerprint wasn't detected this run.
    for (const row of activeRows) {
      if (detectedFingerprints.has(row.fingerprint)) continue
      await client.query(
        `UPDATE anomalies
           SET status = 'resolved', resolved_at = NOW()
         WHERE id = $1`,
        [row.id],
      )
      await client.query(
        `INSERT INTO anomaly_events (anomaly_id, event, metadata) VALUES ($1, 'resolved', $2)`,
        [row.id, JSON.stringify({ reason: 'no-longer-detected' })],
      )
      result.resolved++
    }
  })

  // Pass 3 (post-transaction): queue notifications for newly-inserted critical rows.
  for (const id of newlyInsertedCriticalIds) {
    try {
      await queueAnomalyNotification(id)
      result.notifications_queued++
    } catch (err) {
      console.error('[anomalies] notification queue failed for', id, err)
      // Notification is best-effort; row is already persisted with notification_sent_at.
    }
  }

  return result
}
```

- [ ] **Step 4: Stub `notify.ts` so reconcile compiles**

```ts
// server/utils/anomalyDetection/notify.ts
// Filled in for real in Phase 3, Task 3.4.
export async function queueAnomalyNotification(_anomalyId: string): Promise<void> {
  // Phase 1: no-op. Tests mock this module directly.
  return
}
```

- [ ] **Step 5: Run tests, expect pass**

```bash
npx vitest run tests/unit/anomalyDetection/reconcile.test.ts
```

Expected: 6 passed.

- [ ] **Step 6: Commit**

```bash
git add server/utils/anomalyDetection/reconcile.ts \
        server/utils/anomalyDetection/notify.ts \
        tests/unit/anomalyDetection/reconcile.test.ts
git commit -m "feat(anomalies): reconcile state machine — insert/update/resolve/unsnooze"
```

---

## Task 1.6: Port existing detection logic to analyser modules

The current `server/api/ai/anomalies.get.ts` has 6 categories of rules inline. Move each into its own analyser file. No new logic — just relocation, with the new contract.

**Files:**
- Create: `server/utils/anomalyDetection/analysers/profitability.ts`
- Create: `server/utils/anomalyDetection/analysers/revenue.ts` (prior-period only; YoY in Phase 2)
- Create: `server/utils/anomalyDetection/analysers/expenses.ts`
- Create: `server/utils/anomalyDetection/analysers/cashflow.ts`
- Create: `server/utils/anomalyDetection/analysers/receivables.ts`
- Create: `server/utils/anomalyDetection/analysers/budget.ts`

- [ ] **Step 1: Write a smoke test against profitability**

```ts
// tests/unit/anomalyDetection/analysers/profitability.test.ts
import { describe, it, expect } from 'vitest'
import { profitabilityAnalyser } from '~~/server/utils/anomalyDetection/analysers/profitability'

const ctx = (pnl: any) => ({
  tenantId: 'tenant-A',
  data: {
    pnl, expenses: null, bankMonitoring: null, cashForecast: null,
    aging: null, budgetVariance: null, mediaSpend: null,
    clientRevenue: null, invoiceLines: null,
  },
  now: new Date('2026-04-30T00:00:00Z'),
})

describe('profitabilityAnalyser', () => {
  it('flags net loss when netProfit is negative', async () => {
    const out = await profitabilityAnalyser(ctx({
      revenueTotal: 100_000, expensesTotal: 120_000, netProfit: -20_000,
      profitMargin: -0.2,
      periods: [{ label: 'Mar 2026', revenue: 100_000, netProfit: -20_000, profitMargin: -0.2 }],
      fromDate: '2026-03-01', toDate: '2026-03-31',
    }))
    expect(out.find(a => a.fingerprint === 'profitability:net-loss')).toBeDefined()
    expect(out[0].severity).toBe('critical')
  })

  it('flags low margin (≥0 net but <5%)', async () => {
    const out = await profitabilityAnalyser(ctx({
      revenueTotal: 100_000, expensesTotal: 97_000, netProfit: 3_000,
      profitMargin: 0.03, periods: [], fromDate: '2026-03-01', toDate: '2026-03-31',
    }))
    expect(out.find(a => a.fingerprint === 'profitability:low-margin')).toBeDefined()
  })

  it('returns empty when pnl is missing', async () => {
    const out = await profitabilityAnalyser(ctx(null))
    expect(out).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Implement `profitability.ts` by porting from `server/api/ai/anomalies.get.ts:90-148`**

```ts
// server/utils/anomalyDetection/analysers/profitability.ts
import { buildFingerprint } from '../fingerprints'
import type { AnalyserContext, DetectedAnomaly } from '../types'

const toPercent = (v: number | null | undefined) =>
  typeof v === 'number' && !Number.isNaN(v) ? v : 0

const toCurrency = toPercent

export async function profitabilityAnalyser(
  ctx: AnalyserContext,
): Promise<DetectedAnomaly[]> {
  const pnl = ctx.data.pnl
  if (!pnl) return []

  const out: DetectedAnomaly[] = []
  const margin = toPercent(pnl.profitMargin)
  const latestPeriod = pnl.periods?.[pnl.periods.length - 1]
  const previousPeriod = pnl.periods?.[pnl.periods.length - 2]
  const netProfit = typeof pnl.netProfit === 'number' ? pnl.netProfit : null

  if (netProfit !== null && netProfit < 0) {
    out.push({
      fingerprint: buildFingerprint('profitability', 'net-loss'),
      type: 'profitability', severity: 'critical',
      title: 'Operating at a net loss',
      description: 'Expenses exceeded revenue in the latest period, resulting in a negative net profit.',
      metric: { label: 'Net Profit', value: toCurrency(netProfit), format: 'currency' },
      comparison: { label: 'Total Revenue', value: toCurrency(pnl.revenueTotal ?? 0), format: 'currency', trend: 'down' },
      context: { period: latestPeriod?.label, range: { from: pnl.fromDate, to: pnl.toDate } },
      recommendation: 'Review pricing, defer discretionary spending, or identify cost reductions to return to profitability.',
      tags: ['net loss', 'profitability'],
      dataSources: ['Profit & Loss'],
    })
  } else if (margin < 0.05) {
    out.push({
      fingerprint: buildFingerprint('profitability', 'low-margin'),
      type: 'profitability', severity: 'warning',
      title: 'Profit margin is below target',
      description: `Gross margin dropped to ${(margin * 100).toFixed(1)}% in the latest reporting period.`,
      metric: { label: 'Profit Margin', value: margin, format: 'percent' },
      comparison: previousPeriod
        ? { label: 'Prior Period Margin', value: toPercent(previousPeriod.profitMargin ?? 0), format: 'percent', trend: previousPeriod.profitMargin && margin < previousPeriod.profitMargin ? 'down' : 'up' }
        : undefined,
      context: { period: latestPeriod?.label, range: { from: pnl.fromDate, to: pnl.toDate } },
      recommendation: 'Evaluate revenue drivers and high-cost categories to improve margins.',
      tags: ['margin', 'profitability'],
      dataSources: ['Profit & Loss'],
    })
  }

  if (previousPeriod && typeof previousPeriod.profitMargin === 'number') {
    const drop = previousPeriod.profitMargin - margin
    if (drop >= 0.08) {
      out.push({
        fingerprint: buildFingerprint('profitability', 'margin-compression'),
        type: 'profitability', severity: 'warning',
        title: 'Margin compression detected',
        description: `Profit margin declined by ${(drop * 100).toFixed(1)} percentage points compared to the prior period.`,
        metric: { label: 'Current Margin', value: margin, format: 'percent' },
        comparison: { label: 'Prior Margin', value: toPercent(previousPeriod.profitMargin ?? 0), format: 'percent', trend: 'down' },
        context: { period: latestPeriod?.label, range: { from: pnl.fromDate, to: pnl.toDate } },
        recommendation: 'Investigate changes in cost of goods sold or pricing adjustments that may have impacted profitability.',
        tags: ['trend', 'margin'],
        dataSources: ['Profit & Loss'],
      })
    }
  }

  return out
}
```

- [ ] **Step 3: Run profitability test, expect pass**

```bash
npx vitest run tests/unit/anomalyDetection/analysers/profitability.test.ts
```

Expected: 3 passed.

- [ ] **Step 4: Repeat for the other 5 analysers**

For each of `revenue`, `expenses`, `cashflow`, `receivables`, `budget`:

1. Port the inline rules block from `server/api/ai/anomalies.get.ts` (line ranges below) into the analyser file using the `buildFingerprint` helper.
2. Write a smoke test that exercises one or two rules per analyser.
3. Each analyser returns `[]` when its source data is null.

Source line ranges in the existing endpoint:
- `revenue` — lines 150–168 (revenue-decline only; the YoY rule is added in Task 2.1)
- `expenses` — lines 171–292 (concentration, share-of-revenue, vendor concentration, daily z-score, vendor outlier)
- `cashflow` — lines 294–390 (overdraft, low cash, velocity, burn rate, shortfall projected)
- `receivables` — lines 392–471 (overdue spike, aging concentration, slow payer, client concentration)
- `budget` — lines 473–566 (overspend critical/warning, projected, per-category, multi-overrun)

Translate each anomaly's literal `id` string into `buildFingerprint(type, subKey)`. Example: `id: 'overdue-spike'` → `fingerprint: buildFingerprint('receivables', 'overdue-spike')`.

> The literal `id` strings in the existing endpoint already include sub-keys for some rules (e.g. `daily-spike-${day.date}`, `vendor-outlier-${slug}`, `bank-overdraft-${slug}`). Preserve the suffix in the subKey passed to `buildFingerprint`.

- [ ] **Step 5: Run all analyser tests**

```bash
npx vitest run tests/unit/anomalyDetection/analysers
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add server/utils/anomalyDetection/analysers tests/unit/anomalyDetection/analysers
git commit -m "feat(anomalies): port 6 analysers (profitability/revenue/expenses/cashflow/receivables/budget)"
```

---

## Task 1.7: Shared data fetcher

**Files:**
- Create: `server/utils/anomalyDetection/sharedData.ts`

- [ ] **Step 1: Implement**

```ts
// server/utils/anomalyDetection/sharedData.ts
import type { SharedData } from './types'
import type { H3Event } from 'h3'

/**
 * Fetch every Xero/Meta/Google payload an analyser might need, in parallel,
 * once per detection run. Returning `null` for any source means analysers
 * that depend on it silently no-op rather than the run failing.
 *
 * `event` is needed because Xero endpoints currently read auth from H3.
 * For cron callers, an internal-event helper is used (see Task 3.2).
 */
export async function fetchSharedData(event: H3Event | null): Promise<SharedData> {
  const headers = event?.headers ?? new Headers()

  const safe = async <T>(promise: Promise<T>): Promise<T | null> => {
    try { return await promise } catch (err) {
      console.warn('[anomalies] shared data fetch failed:', err)
      return null
    }
  }

  const [pnl, expenses, bankMonitoring, cashForecast, aging, budgetVariance] =
    await Promise.all([
      safe($fetch<any>('/api/xero/reports/pnl', { headers })),
      safe($fetch<any>('/api/xero/expenses', { headers })),
      safe($fetch<any>('/api/xero/bank-monitoring', { headers })),
      safe($fetch<any>('/api/xero/reports/cash-flow-forecast', { headers })),
      safe($fetch<any>('/api/xero/reports/aging', { headers, query: { type: 'receivables' } })),
      safe($fetch<any>('/api/xero/reports/budget-variance', { headers })),
    ])

  return {
    pnl, expenses, bankMonitoring, cashForecast, aging, budgetVariance,
    // Phase 2 sources start out empty — populated when their analysers ship.
    mediaSpend: null, clientRevenue: null, invoiceLines: null,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add server/utils/anomalyDetection/sharedData.ts
git commit -m "feat(anomalies): shared data fetcher with per-source null-safety"
```

---

## Task 1.8: Pipeline assembly + runForTenant

**Files:**
- Create: `server/utils/anomalyDetection/index.ts`
- Create: `server/utils/anomalyDetection/groupRules.ts` (Phase 1 stub — no-op)
- Create: `server/utils/anomalyDetection/runForTenant.ts`

- [ ] **Step 1: Stub `groupRules.ts`**

```ts
// server/utils/anomalyDetection/groupRules.ts
import type { DetectedAnomaly } from './types'

/**
 * Assigns shared `groupKey` to correlated findings so the UI can collapse
 * them under one parent incident. Phase 1 stub — populated in Task 2.5.
 */
export function applyGroupRules(_anomalies: DetectedAnomaly[]): void {
  return
}
```

- [ ] **Step 2: Implement `index.ts`**

```ts
// server/utils/anomalyDetection/index.ts
import { profitabilityAnalyser } from './analysers/profitability'
import { revenueAnalyser } from './analysers/revenue'
import { expensesAnalyser } from './analysers/expenses'
import { cashflowAnalyser } from './analysers/cashflow'
import { receivablesAnalyser } from './analysers/receivables'
import { budgetAnalyser } from './analysers/budget'
// Phase 2 analysers — wired here as they ship. Empty arrays in Phase 1.
import { adspendAnalyser } from './analysers/adspend'
import { clientsAnalyser } from './analysers/clients'
import { transactionsAnalyser } from './analysers/transactions'

import type { AnalyserContext, DetectedAnomaly } from './types'

const ALL = [
  profitabilityAnalyser,
  revenueAnalyser,
  expensesAnalyser,
  cashflowAnalyser,
  receivablesAnalyser,
  budgetAnalyser,
  adspendAnalyser,
  clientsAnalyser,
  transactionsAnalyser,
]

export async function runAllAnalysers(ctx: AnalyserContext): Promise<DetectedAnomaly[]> {
  const results = await Promise.all(ALL.map(a => safeAnalyser(a, ctx)))
  return results.flat()
}

async function safeAnalyser(a: typeof ALL[number], ctx: AnalyserContext) {
  try { return await a(ctx) } catch (err) {
    console.error(`[anomalies] analyser failed: ${a.name}`, err)
    return []
  }
}
```

- [ ] **Step 3: Stub Phase-2 analysers as empty exports so `index.ts` compiles**

```ts
// server/utils/anomalyDetection/analysers/adspend.ts
import type { Analyser } from '../types'
export const adspendAnalyser: Analyser = async () => []
```

```ts
// server/utils/anomalyDetection/analysers/clients.ts
import type { Analyser } from '../types'
export const clientsAnalyser: Analyser = async () => []
```

```ts
// server/utils/anomalyDetection/analysers/transactions.ts
import type { Analyser } from '../types'
export const transactionsAnalyser: Analyser = async () => []
```

- [ ] **Step 4: Implement `runForTenant.ts`**

```ts
// server/utils/anomalyDetection/runForTenant.ts
import { acquireScanLock, releaseScanLock } from './kvLock'
import { fetchSharedData } from './sharedData'
import { runAllAnalysers } from './index'
import { applyGroupRules } from './groupRules'
import { reconcile, type ReconcileResult } from './reconcile'
import type { H3Event } from 'h3'

export interface RunOutcome {
  tenantId: string
  status: 'completed' | 'in_flight' | 'error'
  durationMs?: number
  reconcile?: ReconcileResult
  detected?: number
  error?: string
}

export async function runDetectionForTenant(
  tenantId: string,
  opts: { event?: H3Event | null } = {},
): Promise<RunOutcome> {
  const haveLock = await acquireScanLock(tenantId)
  if (!haveLock) return { tenantId, status: 'in_flight' }

  const start = Date.now()
  try {
    const data = await fetchSharedData(opts.event ?? null)
    const detected = await runAllAnalysers({ tenantId, data, now: new Date() })
    applyGroupRules(detected)
    const result = await reconcile(tenantId, detected)
    const durationMs = Date.now() - start
    if (durationMs > 60_000) {
      console.warn(`[anomalies] long detection run: tenant=${tenantId} durationMs=${durationMs}`)
    }
    return { tenantId, status: 'completed', durationMs, reconcile: result, detected: detected.length }
  } catch (err: any) {
    return { tenantId, status: 'error', error: String(err?.message || err) }
  } finally {
    await releaseScanLock(tenantId)
  }
}
```

- [ ] **Step 5: Type-check**

```bash
pnpm exec tsc --noEmit --project tsconfig.json 2>&1 | grep "server/utils/anomalyDetection" | head -10
```

Expected: no errors in `server/utils/anomalyDetection`.

- [ ] **Step 6: Commit**

```bash
git add server/utils/anomalyDetection/
git commit -m "feat(anomalies): runDetectionForTenant pipeline + Phase-2 analyser stubs"
```

---

## Task 1.9: Read endpoint — list anomalies with filters

**Files:**
- Create: `server/api/ai/anomalies/index.get.ts`

- [ ] **Step 1: Implement**

```ts
// server/api/ai/anomalies/index.get.ts
import { defineEventHandler, getQuery, createError } from 'h3'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { getSelectedTenant } from '~~/server/utils/session'
import { queryRows } from '~~/server/utils/db'
import type { AnomalyRow, AnomalyStatus, AnomalySeverity, AnomalyType } from '~~/server/utils/anomalyDetection/types'

const ACTIVE_STATUSES: AnomalyStatus[] = ['open', 'acknowledged', 'snoozed']
const HISTORY_STATUSES: AnomalyStatus[] = ['resolved', 'dismissed']

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.FINANCE)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No Xero organisation selected' })

  const q = getQuery(event)
  const tab = (q.tab === 'history') ? 'history' : 'active'
  const status = q.status ? String(q.status) as AnomalyStatus : null
  const severity = q.severity ? String(q.severity) as AnomalySeverity : null
  const type = q.type ? String(q.type) as AnomalyType : null
  const from = q.from ? String(q.from) : null
  const to = q.to ? String(q.to) : null

  const where: string[] = ['tenant_id = $1']
  const params: any[] = [tenantId]
  let i = 2

  if (status) {
    where.push(`status = $${i++}`); params.push(status)
  } else {
    const allowed = tab === 'history' ? HISTORY_STATUSES : ACTIVE_STATUSES
    where.push(`status = ANY($${i++})`); params.push(allowed)
  }
  if (severity) { where.push(`severity = $${i++}`); params.push(severity) }
  if (type)     { where.push(`type = $${i++}`); params.push(type) }
  if (from)     { where.push(`first_detected_at >= $${i++}`); params.push(from) }
  if (to)       { where.push(`first_detected_at <= $${i++}`); params.push(to) }

  const rows = await queryRows<AnomalyRow>(
    `SELECT * FROM anomalies WHERE ${where.join(' AND ')}
     ORDER BY severity = 'critical' DESC, first_detected_at DESC
     LIMIT 500`,
    params,
  )

  const summary = await queryRows<{ severity: AnomalySeverity; count: string }>(
    `SELECT severity, COUNT(*)::text AS count FROM anomalies
     WHERE tenant_id = $1 AND status = ANY($2) GROUP BY severity`,
    [tenantId, ACTIVE_STATUSES],
  )

  const bySeverity = { critical: 0, warning: 0, info: 0 } as Record<AnomalySeverity, number>
  for (const r of summary) bySeverity[r.severity] = Number(r.count)

  return {
    anomalies: rows,
    summary: {
      total: rows.length,
      bySeverity,
      generatedAt: new Date().toISOString(),
    },
  }
})
```

- [ ] **Step 2: Commit**

```bash
git add server/api/ai/anomalies/index.get.ts
git commit -m "feat(anomalies): GET /api/ai/anomalies — read from table with filters"
```

---

## Task 1.10: Manual scan endpoint

**Files:**
- Create: `server/api/ai/anomalies/scan.post.ts`

- [ ] **Step 1: Implement**

```ts
// server/api/ai/anomalies/scan.post.ts
import { defineEventHandler, createError } from 'h3'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { getSelectedTenant } from '~~/server/utils/session'
import { runDetectionForTenant } from '~~/server/utils/anomalyDetection/runForTenant'

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.FINANCE)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No Xero organisation selected' })
  return runDetectionForTenant(tenantId, { event })
})
```

- [ ] **Step 2: Test endpoint**

```ts
// tests/integration/anomalies-scan-endpoint.test.ts
import { describe, it, expect } from 'vitest'

// Skipped if no test server is available — wire to existing test harness pattern
// from another integration test in tests/integration. The shape we assert:
//   - 401 without auth
//   - 403 without finance permission
//   - 200 with { tenantId, status: 'completed' | 'in_flight' }
describe.todo('POST /api/ai/anomalies/scan — see existing endpoint integration tests for harness usage')
```

> The codebase has an existing integration-test harness pattern (look for `tests/integration/*.test.ts` with auth helpers). Wire the test against that harness in your local environment when implementing.

- [ ] **Step 3: Commit**

```bash
git add server/api/ai/anomalies/scan.post.ts tests/integration/anomalies-scan-endpoint.test.ts
git commit -m "feat(anomalies): POST /api/ai/anomalies/scan — manual on-demand scan"
```

---

## Task 1.11: Status mutation endpoint (PATCH)

**Files:**
- Create: `server/api/ai/anomalies/[id].patch.ts`

- [ ] **Step 1: Implement**

```ts
// server/api/ai/anomalies/[id].patch.ts
import { defineEventHandler, getRouterParam, readBody, createError } from 'h3'
import { z } from 'zod'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { getSelectedTenant } from '~~/server/utils/session'
import { queryOne, execute, transaction } from '~~/server/utils/db'

const Body = z.object({
  action: z.enum(['acknowledge', 'snooze', 'unsnooze', 'dismiss', 'resolve', 'assign', 'reopen']),
  snoozedUntil: z.string().optional(),    // ISO timestamp
  resolutionNotes: z.string().max(2000).optional(),
  assigneeId: z.string().uuid().optional(),
  reason: z.string().max(500).optional(), // for dismiss
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireRole(event, PERMISSIONS.FINANCE)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No Xero organisation selected' })

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  const body = Body.parse(await readBody(event))

  const row = await queryOne<{ id: string; status: string }>(
    `SELECT id, status FROM anomalies WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Anomaly not found' })

  await transaction(async (client) => {
    switch (body.action) {
      case 'acknowledge':
        await client.query(
          `UPDATE anomalies SET status = 'acknowledged', acknowledged_by = $1, acknowledged_at = NOW() WHERE id = $2`,
          [user.id, id])
        await client.query(
          `INSERT INTO anomaly_events (anomaly_id, event, user_id) VALUES ($1, 'acknowledged', $2)`,
          [id, user.id])
        break
      case 'snooze':
        if (!body.snoozedUntil) throw createError({ statusCode: 400, statusMessage: 'snoozedUntil required for snooze' })
        await client.query(
          `UPDATE anomalies SET status = 'snoozed', snoozed_until = $1 WHERE id = $2`,
          [body.snoozedUntil, id])
        await client.query(
          `INSERT INTO anomaly_events (anomaly_id, event, user_id, metadata) VALUES ($1, 'snoozed', $2, $3)`,
          [id, user.id, JSON.stringify({ snoozedUntil: body.snoozedUntil })])
        break
      case 'unsnooze':
        await client.query(
          `UPDATE anomalies SET status = 'open', snoozed_until = NULL WHERE id = $1`,
          [id])
        await client.query(
          `INSERT INTO anomaly_events (anomaly_id, event, user_id) VALUES ($1, 'unsnoozed', $2)`,
          [id, user.id])
        break
      case 'dismiss':
        await client.query(
          `UPDATE anomalies SET status = 'dismissed' WHERE id = $1`,
          [id])
        await client.query(
          `INSERT INTO anomaly_events (anomaly_id, event, user_id, metadata) VALUES ($1, 'dismissed', $2, $3)`,
          [id, user.id, JSON.stringify({ reason: body.reason ?? null })])
        break
      case 'resolve':
        await client.query(
          `UPDATE anomalies SET status = 'resolved', resolved_at = NOW(), resolution_notes = $1 WHERE id = $2`,
          [body.resolutionNotes ?? null, id])
        await client.query(
          `INSERT INTO anomaly_events (anomaly_id, event, user_id, metadata) VALUES ($1, 'resolved', $2, $3)`,
          [id, user.id, JSON.stringify({ manual: true, notes: body.resolutionNotes ?? null })])
        break
      case 'assign':
        if (!body.assigneeId) throw createError({ statusCode: 400, statusMessage: 'assigneeId required' })
        await client.query(
          `UPDATE anomalies SET assignee_id = $1 WHERE id = $2`,
          [body.assigneeId, id])
        await client.query(
          `INSERT INTO anomaly_events (anomaly_id, event, user_id, metadata) VALUES ($1, 'assigned', $2, $3)`,
          [id, user.id, JSON.stringify({ assigneeId: body.assigneeId })])
        break
      case 'reopen':
        await client.query(
          `UPDATE anomalies SET status = 'open', resolved_at = NULL, resolution_notes = NULL WHERE id = $1`,
          [id])
        await client.query(
          `INSERT INTO anomaly_events (anomaly_id, event, user_id) VALUES ($1, 'reopened', $2)`,
          [id, user.id])
        break
    }
  })

  return { ok: true }
})
```

- [ ] **Step 2: Commit**

```bash
git add server/api/ai/anomalies/[id].patch.ts
git commit -m "feat(anomalies): PATCH /api/ai/anomalies/:id — status mutations + audit"
```

---

## Task 1.12: Single anomaly read + sidebar count endpoint

**Files:**
- Create: `server/api/ai/anomalies/[id].get.ts`
- Create: `server/api/ai/anomalies/count/critical-open.get.ts`

- [ ] **Step 1: Implement single-anomaly read**

```ts
// server/api/ai/anomalies/[id].get.ts
import { defineEventHandler, getRouterParam, createError } from 'h3'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { getSelectedTenant } from '~~/server/utils/session'
import { queryOne, queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.FINANCE)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No Xero organisation selected' })

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  const row = await queryOne<any>(
    `SELECT * FROM anomalies WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Anomaly not found' })

  const events = await queryRows<any>(
    `SELECT id, event, user_id, metadata, created_at FROM anomaly_events
     WHERE anomaly_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [id],
  )

  return { anomaly: row, events }
})
```

- [ ] **Step 2: Implement count endpoint**

```ts
// server/api/ai/anomalies/count/critical-open.get.ts
import { defineEventHandler, createError } from 'h3'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { getSelectedTenant } from '~~/server/utils/session'
import { queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.FINANCE)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) return { count: 0 }
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM anomalies
     WHERE tenant_id = $1 AND status = 'open' AND severity = 'critical'`,
    [tenantId],
  )
  return { count: Number(row?.count ?? 0) }
})
```

- [ ] **Step 3: Commit**

```bash
git add server/api/ai/anomalies/[id].get.ts server/api/ai/anomalies/count
git commit -m "feat(anomalies): single read + critical-open count endpoints"
```

---

## Task 1.13: Page rewrite — read from new endpoint, status filters, scan button

The page rewrite for full Phase-4 polish (tabs, drill-down, narrative slideover) lands in Phase 4. This task does the minimum to wire the new endpoint and the scan button.

**Files:**
- Modify: `app/pages/anomalies/index.vue`

- [ ] **Step 1: Replace the inline `useFetch` URL and add scan button + filter state**

The existing file at `app/pages/anomalies/index.vue` already has the rendering scaffolding. Make these targeted changes:

1. **Line 42** — replace `useFetch` URL/options:
```ts
const route = useRoute()
const router = useRouter()

const filterParams = computed(() => {
  const q: Record<string, string> = {}
  if (activeSeverity.value !== 'all') q.severity = activeSeverity.value
  if (activeType.value !== 'all') q.type = activeType.value
  return q
})

const { data, pending, error, refresh } = await useFetch<{
  summary: AnomalySummary
  anomalies: Anomaly[]
}>('/api/ai/anomalies', {
  query: filterParams,
  watch: [activeSeverity, activeType],
  lazy: true,
})
```

2. **Lines 273-289** — replace the two `USelect`s with `USelectMenu` (Nuxt UI v4 API):
```vue
<USelectMenu
  v-model="activeType"
  :items="typeFilterOptions"
  value-key="value"
  size="sm"
  class="min-w-[180px]"
/>
<USelectMenu
  v-model="activeSeverity"
  :items="severityFilterOptions"
  value-key="value"
  size="sm"
  class="min-w-[180px]"
/>
```

3. **Lines 256-263** — change the "Refresh" button to a "Run scan now" button that calls the new endpoint:
```vue
<UButton
  label="Run scan now"
  color="neutral"
  icon="i-lucide-radar"
  :loading="scanning"
  :disabled="scanning"
  @click="runScan"
/>
```

4. Add the `runScan` function in the script:
```ts
const toast = useToast()
const scanning = ref(false)

async function runScan() {
  scanning.value = true
  try {
    const result = await $fetch<{ tenantId: string; status: string }>(
      '/api/ai/anomalies/scan',
      { method: 'POST' }
    )
    if (result.status === 'in_flight') {
      toast.add({ title: 'Scan in progress', description: 'Already running. Refreshing once it completes.', color: 'info' })
      // Poll critical-open count until status changes — simple 5s × 12 attempts.
      for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, 5000))
        const probe = await $fetch<{ tenantId: string; status: string }>('/api/ai/anomalies/scan', { method: 'POST' })
        if (probe.status === 'completed') { await refresh(); break }
      }
    } else if (result.status === 'completed') {
      toast.add({ title: 'Scan complete', color: 'success' })
      await refresh()
    } else {
      toast.add({ title: 'Scan failed', color: 'error' })
    }
  } catch (err: any) {
    toast.add({ title: 'Scan failed', description: err.statusMessage || String(err), color: 'error' })
  } finally {
    scanning.value = false
  }
}
```

5. **Update the `Anomaly` type definition** at the top of the file to match the new persisted row shape (all fields from `AnomalyRow` in `server/utils/anomalyDetection/types.ts`). Add `id`, `status`, `snoozed_until`, `acknowledged_at`, etc. Existing fields (title, description, metric, comparison, context, recommendation, tags, dataSources) carry over.

> Note: full status-pill UI lands in Phase 4 (Task 4.1). For now, the page renders all `open` anomalies (the API defaults to `tab=active` which is open + acknowledged + snoozed) — that matches today's UX.

- [ ] **Step 2: Visit the page in the dev server**

```bash
NODE_OPTIONS='--max-old-space-size=8192' pnpm dev
# Visit http://localhost:3000/anomalies
# Click "Run scan now" — verify toast + page refresh.
```

Expected: page loads, "Run scan now" runs detection and refreshes the list. Empty state shows because nothing has been written yet (cron not active).

- [ ] **Step 3: Run scan twice in quick succession to exercise the lock**

Expected: first click → success toast. Second click within ~30s while still running → "Scan in progress" toast.

- [ ] **Step 4: Commit**

```bash
git add app/pages/anomalies/index.vue
git commit -m "feat(anomalies): page reads from persisted endpoint + 'Run scan now' button"
```

---

## Task 1.14: Delete the old endpoints

**Files:**
- Delete: `server/api/ai/anomalies.get.ts`
- Delete: `server/api/ai/anomaly-detection.get.ts` (kept until Phase 2 Task 2.4 ports the transaction-level z-score)

- [ ] **Step 1: Delete the old anomalies aggregator (its logic now lives in analysers)**

```bash
git rm server/api/ai/anomalies.get.ts
```

- [ ] **Step 2: Confirm no callers remain**

```bash
grep -rn "/api/ai/anomalies\b" app/ server/ --include="*.ts" --include="*.vue" | grep -v "anomalies/" | head
```

Expected: no results referring to the bare `/api/ai/anomalies` GET (the page now calls `/api/ai/anomalies` which routes to `index.get.ts` in the new subfolder — verify Nitro auto-routes the subfolder correctly by visiting the URL).

- [ ] **Step 3: Verify the route still resolves**

```bash
NODE_OPTIONS='--max-old-space-size=8192' pnpm dev
curl -i 'http://localhost:3000/api/ai/anomalies?tab=active' -H "Cookie: $LOCAL_AUTH_COOKIE"
```

Expected: `200 OK` with `{ anomalies: [], summary: {...} }`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(anomalies): remove legacy aggregator endpoint (logic moved to analysers)"
```

---

# Phase 2 — Detection completeness (PR 2)

End-state: 9 analysers ship complete (revenue YoY, ad-spend, clients, transactions). Old `anomaly-detection.get.ts` deleted. Group rules collapse correlated findings.

---

## Task 2.1: Revenue analyser — add YoY rule

The Phase-1 port covered prior-period only. This task adds the year-over-year comparison and verifies the data window.

**Files:**
- Modify: `server/utils/anomalyDetection/analysers/revenue.ts`
- Modify: `tests/unit/anomalyDetection/analysers/revenue.test.ts`

- [ ] **Step 1: Verify data window**

The YoY rule needs ≥13 months of P&L periods. The existing `/api/xero/reports/pnl` endpoint must be inspected for the `?months=` or equivalent argument and patched if it doesn't return enough.

```bash
grep -n "months\|periodCount\|periods\|fromDate\|toDate" server/api/xero/reports/pnl.ts | head -20
```

If the endpoint returns ≤12 months, expand it (passing `?months=13` or similar — the fix must be additive, defaulting to existing behaviour). Document the decision in the analyser file as a comment.

- [ ] **Step 2: Add the YoY test**

```ts
// In tests/unit/anomalyDetection/analysers/revenue.test.ts — append:

it('flags revenue-yoy-decline when current month is >15% below same month last year', async () => {
  const periods = []
  for (let m = 0; m < 13; m++) {
    periods.push({ label: `Period ${m}`, revenue: m === 12 ? 70_000 : 100_000 })
  }
  const out = await revenueAnalyser(ctx({
    fromDate: '2025-04-01', toDate: '2026-04-30',
    periods,
  }))
  expect(out.find(a => a.fingerprint === 'revenue:yoy-decline')).toBeDefined()
})

it('does NOT fire YoY when there are fewer than 13 periods', async () => {
  const periods = Array.from({ length: 6 }, (_, i) => ({ label: `Period ${i}`, revenue: 100_000 }))
  const out = await revenueAnalyser(ctx({ periods, fromDate: '2025-11-01', toDate: '2026-04-30' }))
  expect(out.find(a => a.fingerprint === 'revenue:yoy-decline')).toBeUndefined()
})
```

- [ ] **Step 3: Implement the YoY rule**

```ts
// Append to server/utils/anomalyDetection/analysers/revenue.ts
// inside the analyser function, after the existing prior-period rule:

const periods = pnl.periods ?? []
if (periods.length >= 13) {
  const current = periods[periods.length - 1]
  const yearAgo = periods[periods.length - 13]
  if (
    typeof current?.revenue === 'number' &&
    typeof yearAgo?.revenue === 'number' &&
    yearAgo.revenue > 0
  ) {
    const drop = (yearAgo.revenue - current.revenue) / yearAgo.revenue
    if (drop >= 0.15) {
      out.push({
        fingerprint: buildFingerprint('revenue', 'yoy-decline'),
        type: 'revenue',
        severity: drop >= 0.3 ? 'critical' : 'warning',
        title: 'Revenue down vs. same month last year',
        description: `Revenue is ${Math.round(drop * 100)}% below ${yearAgo.label ?? 'this month last year'}.`,
        metric: { label: 'Current Month', value: current.revenue, format: 'currency' },
        comparison: { label: yearAgo.label ?? 'YoY Baseline', value: yearAgo.revenue, format: 'currency', trend: 'down' },
        context: { period: current.label, range: { from: pnl.fromDate, to: pnl.toDate } },
        recommendation: 'Compare this period to the same month last year — review pipeline, retainer renewals, and seasonal client patterns.',
        tags: ['revenue', 'YoY'],
        dataSources: ['Profit & Loss'],
      })
    }
  }
}
```

- [ ] **Step 4: Run, expect pass**

```bash
npx vitest run tests/unit/anomalyDetection/analysers/revenue.test.ts
```

Expected: existing tests + 2 new tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/utils/anomalyDetection/analysers/revenue.ts tests/unit/anomalyDetection/analysers/revenue.test.ts server/api/xero/reports/pnl.ts
git commit -m "feat(anomalies): YoY revenue analyser + P&L window expansion"
```

---

## Task 2.2: Adspend analyser

Lift the `media_spend > 2× 30-day avg` query from `server/utils/aiAgentAnalyzer.ts` into the new analyser. Add two new rules — budget breach and pacing.

**Files:**
- Create: `tests/unit/anomalyDetection/analysers/adspend.test.ts`
- Modify: `server/utils/anomalyDetection/analysers/adspend.ts` (currently a stub)
- Modify: `server/utils/anomalyDetection/sharedData.ts` (fetch media_spend rows)

- [ ] **Step 1: Add the data fetch to `sharedData.ts`**

In `fetchSharedData`, add a parallel query against the `media_spend` table for the last 31 days:

```ts
import { queryRows } from '~~/server/utils/db'

// Inside fetchSharedData(), add to the Promise.all:
const mediaSpend = await safe((async () => {
  return await queryRows(`
    SELECT id, client_id, client_name, platform, actual_spend, period
    FROM media_spend
    WHERE period >= NOW() - INTERVAL '31 days'
    ORDER BY period DESC
  `)
})())
// then assign into the returned object's mediaSpend slot.
```

- [ ] **Step 2: Write the analyser test**

```ts
// tests/unit/anomalyDetection/analysers/adspend.test.ts
import { describe, it, expect } from 'vitest'
import { adspendAnalyser } from '~~/server/utils/anomalyDetection/analysers/adspend'

const ctx = (mediaSpend: any[]) => ({
  tenantId: 'tenant-A',
  data: {
    pnl: null, expenses: null, bankMonitoring: null, cashForecast: null,
    aging: null, budgetVariance: null,
    mediaSpend, clientRevenue: null, invoiceLines: null,
  },
  now: new Date('2026-04-30T00:00:00Z'),
})

describe('adspendAnalyser', () => {
  it('flags spend > 2× 30-day average', async () => {
    const rows: any[] = []
    // 30 days at $100/day for client/platform (avg = 100)
    for (let d = 0; d < 30; d++) {
      rows.push({
        id: d, client_id: 'c1', client_name: 'Acme',
        platform: 'meta', actual_spend: 100,
        period: new Date(2026, 3, d + 1).toISOString().slice(0, 10),
      })
    }
    // today: $300 — 3× avg
    rows.push({
      id: 99, client_id: 'c1', client_name: 'Acme',
      platform: 'meta', actual_spend: 300,
      period: '2026-04-30',
    })
    const out = await adspendAnalyser(ctx(rows))
    expect(out.find(a => a.fingerprint.startsWith('adspend:spike-c1-meta'))).toBeDefined()
  })

  it('returns empty when no media spend rows', async () => {
    const out = await adspendAnalyser(ctx([]))
    expect(out).toHaveLength(0)
  })
})
```

- [ ] **Step 3: Implement**

```ts
// server/utils/anomalyDetection/analysers/adspend.ts
import { buildFingerprint } from '../fingerprints'
import type { Analyser, DetectedAnomaly } from '../types'

export const adspendAnalyser: Analyser = async (ctx) => {
  const rows = ctx.data.mediaSpend
  if (!rows || rows.length === 0) return []

  // Group by (client_id, platform), find the most recent day, compare to 30-day avg.
  const groups = new Map<string, { rows: any[]; clientId: string; clientName: string; platform: string }>()
  for (const r of rows) {
    const key = `${r.client_id}:${r.platform}`
    if (!groups.has(key)) {
      groups.set(key, { rows: [], clientId: r.client_id, clientName: r.client_name, platform: r.platform })
    }
    groups.get(key)!.rows.push(r)
  }

  const out: DetectedAnomaly[] = []

  for (const { rows: gRows, clientId, clientName, platform } of groups.values()) {
    if (gRows.length < 8) continue // need a stable baseline
    gRows.sort((a, b) => String(b.period).localeCompare(String(a.period)))
    const todayRow = gRows[0]
    const baseline = gRows.slice(1, 31)
    const avg = baseline.reduce((s, r) => s + Number(r.actual_spend || 0), 0) / baseline.length
    if (avg <= 0) continue
    const ratio = Number(todayRow.actual_spend || 0) / avg
    if (ratio < 2) continue

    const subKey = `spike-${clientId}-${platform}-${String(todayRow.period).slice(0, 10)}`
    out.push({
      fingerprint: buildFingerprint('adspend', subKey),
      type: 'adspend',
      severity: ratio >= 3 ? 'warning' : 'info',
      title: `${clientName} (${platform}) spend spike`,
      description: `Spent $${Number(todayRow.actual_spend).toLocaleString()} on ${todayRow.period} — ${ratio.toFixed(1)}× the 30-day average of $${avg.toLocaleString(undefined, { maximumFractionDigits: 0 })}.`,
      metric: { label: 'Day Spend', value: Number(todayRow.actual_spend), format: 'currency' },
      comparison: { label: '30-day Avg', value: avg, format: 'currency', trend: 'up' },
      context: { client: clientName, vendor: platform },
      recommendation: 'Review the campaign for delivery anomalies, frequency caps, or unintended audience expansion.',
      tags: ['ad spend', 'spike', platform],
      dataSources: ['Media Spend'],
    })
  }

  return out
}
```

> The "budget breach" and "pacing" rules need the `client_ad_budgets` table — verify it exists and add similar rules following this same pattern. If the table doesn't exist or has a different shape, ship just the spike rule in this PR and file a follow-up issue.

- [ ] **Step 4: Run, expect pass**

```bash
npx vitest run tests/unit/anomalyDetection/analysers/adspend.test.ts
```

Expected: 2 passed.

- [ ] **Step 5: Delete the dead code in `aiAgentAnalyzer.ts`**

The `analyseAdSpendAnomalies` function in `server/utils/aiAgentAnalyzer.ts` is now duplicated by the analyser. Replace its body with a one-line re-export from the new analyser to keep the AI Agent's existing call working:

```ts
// In server/utils/aiAgentAnalyzer.ts — replace the function body:
export async function analyseAdSpendAnomalies() {
  // Logic moved to server/utils/anomalyDetection/analysers/adspend.ts.
  // The AI Agent gets findings via the persisted anomalies table now.
  const { queryRows } = await import('~~/server/utils/db')
  const rows = await queryRows(
    `SELECT id, title, description, severity, fingerprint
     FROM anomalies
     WHERE type = 'adspend' AND status NOT IN ('resolved','dismissed')`,
    [],
  )
  return { type: 'ad_spend_anomalies', findings: rows, count: rows.length }
}
```

- [ ] **Step 6: Commit**

```bash
git add server/utils/anomalyDetection/analysers/adspend.ts \
        server/utils/anomalyDetection/sharedData.ts \
        server/utils/aiAgentAnalyzer.ts \
        tests/unit/anomalyDetection/analysers/adspend.test.ts
git commit -m "feat(anomalies): adspend analyser (spike) + thread AI Agent through table"
```

---

## Task 2.3: Clients analyser — per-client profitability

Use the simple definition: revenue minus tracked-time cost per client per period.

**Files:**
- Create: `tests/unit/anomalyDetection/analysers/clients.test.ts`
- Modify: `server/utils/anomalyDetection/analysers/clients.ts`
- Modify: `server/utils/anomalyDetection/sharedData.ts` (add `clientRevenue` query)

- [ ] **Step 1: Add data fetch**

In `fetchSharedData`, add a query that joins client revenue (from invoices) and time cost (from time entries × member rates) for the trailing 30-day window. Pseudo-shape returned:

```ts
type ClientRevenueRow = {
  client_id: string
  client_name: string
  revenue: number      // sum of paid + outstanding invoice amounts in window
  time_cost: number    // sum of (hours × member.cost_rate) in window
  period_start: string
  period_end: string
}
```

The exact SQL depends on existing tables — check `clients`, `invoices`, `invoice_lines`, `time_entries`, `team_members.cost_rate` in the live schema and write the JOIN accordingly. Mark the analyser as a no-op if the join returns 0 rows (e.g. cost rates aren't populated yet) and log a one-line warning.

- [ ] **Step 2: Write tests**

```ts
// tests/unit/anomalyDetection/analysers/clients.test.ts
import { describe, it, expect } from 'vitest'
import { clientsAnalyser } from '~~/server/utils/anomalyDetection/analysers/clients'

const ctx = (clientRevenue: any[]) => ({
  tenantId: 'tenant-A',
  data: {
    pnl: null, expenses: null, bankMonitoring: null, cashForecast: null,
    aging: null, budgetVariance: null,
    mediaSpend: null, clientRevenue, invoiceLines: null,
  },
  now: new Date('2026-04-30T00:00:00Z'),
})

describe('clientsAnalyser', () => {
  it('flags client-unprofitable when time cost exceeds revenue', async () => {
    const out = await clientsAnalyser(ctx([
      { client_id: 'c1', client_name: 'Acme', revenue: 5_000, time_cost: 8_000,
        period_start: '2026-04-01', period_end: '2026-04-30' },
    ]))
    expect(out.find(a => a.fingerprint === 'clients:unprofitable-c1')).toBeDefined()
    expect(out[0].severity).toBe('warning')
  })

  it('flags client-revenue-concentration at >40% share', async () => {
    const out = await clientsAnalyser(ctx([
      { client_id: 'c1', client_name: 'Big', revenue: 50_000, time_cost: 10_000,
        period_start: '2026-04-01', period_end: '2026-04-30' },
      { client_id: 'c2', client_name: 'Small', revenue: 5_000, time_cost: 1_000,
        period_start: '2026-04-01', period_end: '2026-04-30' },
    ]))
    // c1 is 50/55 = 90.9% of revenue.
    expect(out.find(a => a.fingerprint === 'clients:concentration-c1')).toBeDefined()
  })

  it('returns empty when no rows', async () => {
    expect(await clientsAnalyser(ctx([]))).toHaveLength(0)
  })
})
```

- [ ] **Step 3: Implement**

```ts
// server/utils/anomalyDetection/analysers/clients.ts
import { buildFingerprint } from '../fingerprints'
import type { Analyser, DetectedAnomaly } from '../types'

export const clientsAnalyser: Analyser = async (ctx) => {
  const rows = ctx.data.clientRevenue
  if (!rows || rows.length === 0) return []

  const out: DetectedAnomaly[] = []
  const totalRevenue = rows.reduce((s, r) => s + Number(r.revenue || 0), 0)
  const periodLabel = `${rows[0].period_start} → ${rows[0].period_end}`

  for (const r of rows) {
    const revenue = Number(r.revenue || 0)
    const timeCost = Number(r.time_cost || 0)

    if (revenue > 0 && timeCost > revenue) {
      out.push({
        fingerprint: buildFingerprint('clients', `unprofitable-${r.client_id}`),
        type: 'clients',
        severity: 'warning',
        title: `${r.client_name} unprofitable`,
        description: `Time cost ($${timeCost.toLocaleString()}) exceeded revenue ($${revenue.toLocaleString()}) for the period.`,
        metric: { label: 'Revenue', value: revenue, format: 'currency' },
        comparison: { label: 'Time Cost', value: timeCost, format: 'currency', trend: 'up' },
        context: { client: r.client_name, period: periodLabel },
        recommendation: `Review rate card and scope creep for ${r.client_name}; consider raising rates or capping non-billable time.`,
        tags: ['client', 'profitability'],
        dataSources: ['Time Entries', 'Invoices'],
      })
    }

    if (totalRevenue > 0 && revenue / totalRevenue > 0.4) {
      out.push({
        fingerprint: buildFingerprint('clients', `concentration-${r.client_id}`),
        type: 'clients',
        severity: 'warning',
        title: `${r.client_name} revenue concentration`,
        description: `${r.client_name} is ${Math.round(revenue / totalRevenue * 100)}% of period revenue ($${revenue.toLocaleString()} of $${totalRevenue.toLocaleString()}).`,
        metric: { label: r.client_name, value: revenue, format: 'currency' },
        comparison: { label: 'Total Revenue', value: totalRevenue, format: 'currency', trend: 'up' },
        context: { client: r.client_name, period: periodLabel },
        recommendation: 'Diversify the client base; loss of this client would be material.',
        tags: ['client', 'concentration'],
        dataSources: ['Invoices'],
      })
    }
  }

  return out
}
```

- [ ] **Step 4: Run, expect pass**

```bash
npx vitest run tests/unit/anomalyDetection/analysers/clients.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add server/utils/anomalyDetection/analysers/clients.ts \
        server/utils/anomalyDetection/sharedData.ts \
        tests/unit/anomalyDetection/analysers/clients.test.ts
git commit -m "feat(anomalies): per-client profitability + concentration analyser"
```

---

## Task 2.4: Transactions analyser — port from old endpoint, then delete it

The old `server/api/ai/anomaly-detection.get.ts` does z-score on individual Xero invoices. Move that into a new analyser and delete the endpoint.

**Files:**
- Create: `tests/unit/anomalyDetection/analysers/transactions.test.ts`
- Modify: `server/utils/anomalyDetection/analysers/transactions.ts`
- Modify: `server/utils/anomalyDetection/sharedData.ts`
- Delete: `server/api/ai/anomaly-detection.get.ts`

- [ ] **Step 1: Read the existing endpoint to understand its data shape**

```bash
sed -n '50,250p' server/api/ai/anomaly-detection.get.ts
```

Preserve the `calculateStandardDeviation` and `isAnomaly` helper logic; the cache wrapper is replaced by the run-level cache from `runDetectionForTenant`.

- [ ] **Step 2: Add `invoiceLines` to `sharedData.ts`**

```ts
// In sharedData.ts, fetch invoice line items (or aggregated transactions per account)
// using the same Xero call the old endpoint uses. Cap at 90 days.
const invoiceLines = await safe(/* same Xero query the old endpoint runs */)
```

- [ ] **Step 3: Implement the analyser**

Port the per-account z-score loop from the old endpoint. Each outlier becomes a `DetectedAnomaly` with fingerprint `transactions:outlier-<accountSlug>-<periodMonth>`.

- [ ] **Step 4: Test**

```ts
// Two key cases to assert:
//   - 5 transactions: 100, 100, 100, 100, 1000 — 1000 fires
//   - 5 transactions: 100, 100, 100, 100, 110 — none fire
```

- [ ] **Step 5: Delete the old endpoint**

```bash
git rm server/api/ai/anomaly-detection.get.ts
grep -rn "anomaly-detection" app/ server/ --include="*.ts" --include="*.vue" | head
```

Fix any callers (none expected — the endpoint had no UI consumer).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(anomalies): transactions z-score analyser (replaces legacy /api/ai/anomaly-detection)"
```

---

## Task 2.5: Group rules — collapse correlated incidents

**Files:**
- Modify: `server/utils/anomalyDetection/groupRules.ts`
- Create: `tests/unit/anomalyDetection/groupRules.test.ts`

- [ ] **Step 1: Test**

```ts
// tests/unit/anomalyDetection/groupRules.test.ts
import { describe, it, expect } from 'vitest'
import { applyGroupRules } from '~~/server/utils/anomalyDetection/groupRules'
import type { DetectedAnomaly } from '~~/server/utils/anomalyDetection/types'

const make = (fingerprint: string, ctx?: any): DetectedAnomaly => ({
  fingerprint, type: fingerprint.split(':')[0] as any,
  severity: 'warning', title: '', description: '',
  dataSources: [], context: ctx,
})

describe('applyGroupRules', () => {
  it('groups profitability findings for the same period', () => {
    const list = [
      make('profitability:low-margin', { period: 'Mar 2026' }),
      make('profitability:margin-compression', { period: 'Mar 2026' }),
      make('revenue:revenue-decline', { period: 'Mar 2026' }),
    ]
    applyGroupRules(list)
    const keys = list.map(a => a.groupKey)
    expect(keys.every(k => k === 'incident:profitability:Mar 2026')).toBe(true)
  })

  it('groups liquidity-cluster findings', () => {
    const list = [
      make('cashflow:high-burn-rate', { period: 'Apr 2026' }),
      make('cashflow:low-cash-reserves', { period: 'Apr 2026' }),
      make('cashflow:shortfall-projected', { period: 'Apr 2026' }),
    ]
    applyGroupRules(list)
    expect(list[0].groupKey).toBe('incident:liquidity:Apr 2026')
  })

  it('does not group unrelated findings', () => {
    const list = [
      make('expenses:concentration'),
      make('receivables:slow-payer-risk'),
    ]
    applyGroupRules(list)
    expect(list.every(a => a.groupKey === undefined)).toBe(true)
  })
})
```

- [ ] **Step 2: Implement**

```ts
// server/utils/anomalyDetection/groupRules.ts
import type { DetectedAnomaly } from './types'

const PROFITABILITY_FPS = new Set([
  'profitability:low-margin',
  'profitability:margin-compression',
  'profitability:net-loss',
  'revenue:revenue-decline',
  'revenue:yoy-decline',
])

const BUDGET_FPS = new Set([
  'budget:overspend-warning',
  'budget:overspend-critical',
  'budget:projected-overspend',
  'budget:multiple-overruns',
])
const BUDGET_PREFIX = 'budget:cat-'

const LIQUIDITY_FPS = new Set([
  'cashflow:high-burn-rate',
  'cashflow:low-cash-reserves',
  'cashflow:shortfall-projected',
])

export function applyGroupRules(anomalies: DetectedAnomaly[]): void {
  // Profitability cluster keyed on context.period.
  const profPeriod = anomalies.find(a => PROFITABILITY_FPS.has(a.fingerprint))?.context?.period
  if (profPeriod) {
    for (const a of anomalies) {
      if (PROFITABILITY_FPS.has(a.fingerprint) && a.context?.period === profPeriod) {
        a.groupKey = `incident:profitability:${profPeriod}`
      }
    }
  }

  // Budget cluster.
  const budgetPeriod = anomalies.find(a =>
    BUDGET_FPS.has(a.fingerprint) || a.fingerprint.startsWith(BUDGET_PREFIX),
  )?.context?.period
  if (budgetPeriod) {
    for (const a of anomalies) {
      const isBudget = BUDGET_FPS.has(a.fingerprint) || a.fingerprint.startsWith(BUDGET_PREFIX)
      if (isBudget && a.context?.period === budgetPeriod) {
        a.groupKey = `incident:budget:${budgetPeriod}`
      }
    }
  }

  // Liquidity cluster.
  const liqPeriod = anomalies.find(a => LIQUIDITY_FPS.has(a.fingerprint))?.context?.period
  if (liqPeriod) {
    for (const a of anomalies) {
      if (LIQUIDITY_FPS.has(a.fingerprint) && a.context?.period === liqPeriod) {
        a.groupKey = `incident:liquidity:${liqPeriod}`
      }
    }
  }
}
```

- [ ] **Step 3: Run, expect pass**

```bash
npx vitest run tests/unit/anomalyDetection/groupRules.test.ts
```

Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add server/utils/anomalyDetection/groupRules.ts tests/unit/anomalyDetection/groupRules.test.ts
git commit -m "feat(anomalies): correlation rules group profitability/budget/liquidity findings"
```

---

# Phase 3 — Cron + notifications (PR 3)

End-state: hourly cron with local-7am gate runs detection daily; critical anomalies push Smart Watch + email; daily digest gains an Anomalies section; backfill script populates table without flooding.

---

## Task 3.1: Add the new notification type

**Files:**
- Modify: `server/utils/notifications.ts`

- [ ] **Step 1: Add to the union**

In `NotificationType` (around line 12 of `server/utils/notifications.ts`), append:

```ts
  | 'anomaly_critical'
```

- [ ] **Step 2: Add the in-app preference key in `TYPE_TO_INAPP_PREF`**

```ts
  anomaly_critical: 'inapp_anomaly_critical',
```

This lets users opt out via the existing `/settings/notifications` UI — no new screen needed; the existing system reads `team_members.notification_preferences` JSON keyed by these preference names.

- [ ] **Step 3: Verify the legacy `notifications_type_check` constraint isn't blocking**

```bash
psql "$DATABASE_URL" -c "
  SELECT con.conname, pg_get_constraintdef(con.oid)
  FROM pg_constraint con
  JOIN pg_class cls ON con.conrelid = cls.oid
  WHERE cls.relname = 'notifications' AND con.contype = 'c';
"
```

If there's still a CHECK constraint listing only legacy types (the schema-xeroflow.sql original constraint), drop it:

```sql
-- Inline migration step (no migration file) — apply once if the constraint exists.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
```

- [ ] **Step 4: Commit**

```bash
git add server/utils/notifications.ts
git commit -m "feat(anomalies): NotificationType += 'anomaly_critical' + in-app pref key"
```

---

## Task 3.2: Implement `notify.ts` for real

**Files:**
- Modify: `server/utils/anomalyDetection/notify.ts`
- Create: `server/utils/email/templates/anomalyAlert.ts`

- [ ] **Step 1: Implement the email template**

```ts
// server/utils/email/templates/anomalyAlert.ts
import type { AnomalyRow } from '~~/server/utils/anomalyDetection/types'

export function buildAnomalyAlertEmail(a: AnomalyRow, baseUrl: string) {
  const subject = `[Critical] ${a.title}`
  const link = `${baseUrl}/anomalies?focus=${encodeURIComponent(a.id)}`

  const html = `
    <table width="100%" style="font-family: -apple-system, system-ui, sans-serif; max-width: 560px;">
      <tr><td style="padding: 16px 0; font-size: 12px; color: #c43c3c; font-weight: 600;">CRITICAL ANOMALY</td></tr>
      <tr><td style="font-size: 20px; font-weight: 600; padding-bottom: 12px;">${escapeHtml(a.title)}</td></tr>
      <tr><td style="font-size: 14px; line-height: 1.5; color: #333;">${escapeHtml(a.description)}</td></tr>
      ${a.metric ? `<tr><td style="padding-top: 12px; font-size: 13px; color: #555;"><b>${escapeHtml(a.metric.label)}:</b> ${formatMetric(a.metric)}</td></tr>` : ''}
      ${a.recommendation ? `<tr><td style="padding-top: 16px; padding: 12px; background: #fff7e6; border-left: 3px solid #f39c12; font-size: 13px;">${escapeHtml(a.recommendation)}</td></tr>` : ''}
      <tr><td style="padding-top: 24px;">
        <a href="${link}" style="display: inline-block; background: #111; color: #fff; padding: 10px 16px; border-radius: 6px; text-decoration: none; font-size: 14px;">Open in dashboard</a>
      </td></tr>
    </table>
  `
  const text = `${a.title}\n\n${a.description}\n\n${a.recommendation || ''}\n\n${link}`
  return { subject, html, text }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

function formatMetric(m: { label: string; value: number; format: string }) {
  if (m.format === 'currency') return `$${m.value.toLocaleString()}`
  if (m.format === 'percent') return `${(m.value * 100).toFixed(1)}%`
  return m.value.toLocaleString()
}
```

- [ ] **Step 2: Implement `notify.ts`**

```ts
// server/utils/anomalyDetection/notify.ts
import { queryOne, queryRows } from '~~/server/utils/db'
import { createNotification } from '~~/server/utils/notifications'
import { sendEmail } from '~~/server/utils/email' // existing helper
import { buildAnomalyAlertEmail } from '~~/server/utils/email/templates/anomalyAlert'
import type { AnomalyRow } from './types'

const BASE_URL = process.env.PUBLIC_BASE_URL || 'https://agency-dashboard-6cm.pages.dev'

/**
 * Fan a critical anomaly out to every team_member with FINANCE permission.
 * No-ops if env flag ANOMALY_NOTIFICATIONS_DISABLED=true (used by the
 * backfill script in Task 3.5).
 */
export async function queueAnomalyNotification(anomalyId: string): Promise<void> {
  if (process.env.ANOMALY_NOTIFICATIONS_DISABLED === 'true') return

  const anomaly = await queryOne<AnomalyRow>(
    `SELECT * FROM anomalies WHERE id = $1`,
    [anomalyId],
  )
  if (!anomaly) return

  // Recipients: every team_member whose role grants FINANCE.
  // The role list is a code-level constant; we resolve it via SQL.
  const recipients = await queryRows<{ id: string; email: string }>(
    `SELECT id, email FROM team_members
     WHERE role IN ('owner','admin','lead','project_manager','finance','accounts')
       AND status = 'active'`,
    [],
  )

  for (const u of recipients) {
    // Smart Watch (in-app) — gates on user's notification_preferences via createNotification.
    try {
      await createNotification({
        userId: u.id,
        type: 'anomaly_critical',
        title: anomaly.title,
        message: anomaly.description,
        link: `/anomalies?focus=${anomaly.id}`,
        metadata: { anomalyId: anomaly.id, fingerprint: anomaly.fingerprint, severity: anomaly.severity },
        reason: 'direct',
      })
    } catch (err) {
      console.error('[anomalies notify] in-app failed for', u.id, err)
    }

    // Email — uses existing sendEmail helper.
    try {
      const { subject, html, text } = buildAnomalyAlertEmail(anomaly, BASE_URL)
      await sendEmail({ to: u.email, subject, html, text })
    } catch (err) {
      console.error('[anomalies notify] email failed for', u.email, err)
    }
  }
}
```

> Verify the exact `sendEmail` import from your codebase — it's likely `~~/server/utils/email` or `~~/server/utils/resend`. Adjust the import to match.

- [ ] **Step 3: Commit**

```bash
git add server/utils/anomalyDetection/notify.ts server/utils/email/templates/anomalyAlert.ts
git commit -m "feat(anomalies): wire critical-anomaly notifications (Smart Watch + email)"
```

---

## Task 3.3: Cron handler

**Files:**
- Create: `server/api/cron/anomaly-detection.ts`

- [ ] **Step 1: Implement**

```ts
// server/api/cron/anomaly-detection.ts
import { defineEventHandler } from 'h3'
import { queryOne, execute } from '~~/server/utils/db'
import { runDetectionForTenant } from '~~/server/utils/anomalyDetection/runForTenant'

const CRON_SECRET = process.env.CRON_SECRET

/**
 * Hourly Cloudflare Cron Trigger. The dashboard is single-tenant per install
 * (one row in xero_org_connection). We gate per-tick on whether it's 7am
 * locally for the connected org's timezone.
 */
export default defineEventHandler(async (event) => {
  const auth = getHeader(event, 'authorization')
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return new Response('unauthorised', { status: 401 })
  }

  const conn = await queryOne<{ tenant_id: string; timezone: string }>(
    `SELECT tenant_id, timezone FROM xero_org_connection LIMIT 1`,
    [],
  )
  if (!conn) return { ok: true, skipped: 'no Xero connection' }

  const localHour = Number(
    new Date().toLocaleString('en-US', {
      timeZone: conn.timezone || 'Australia/Sydney',
      hour: 'numeric', hour12: false,
    }),
  )
  if (localHour !== 7) {
    return { ok: true, skipped: `local hour=${localHour}` }
  }

  const start = Date.now()
  const result = await runDetectionForTenant(conn.tenant_id, { event: null })
  const durationMs = Date.now() - start

  // Persist the run for observability.
  await execute(
    `INSERT INTO cron_runs (kind, tenant_id, duration_ms, payload)
     VALUES ('anomaly-detection', $1, $2, $3)`,
    [conn.tenant_id, durationMs, JSON.stringify(result)],
  ).catch(() => { /* table optional; don't fail run on logging */ })

  return { ok: true, ...result, durationMs }
})
```

- [ ] **Step 2: Add the trigger to `wrangler.toml`**

```toml
# wrangler.toml — append:
[triggers]
crons = ["0 * * * *"]
```

- [ ] **Step 3: Verify the `cron_runs` table exists or relax the insert**

```bash
psql "$DATABASE_URL" -c "\d cron_runs" | head -10
```

If the table doesn't exist, the `.catch(() => {})` swallows the error so the cron still runs. Optionally create a small `cron_runs` table in a follow-up — not blocking.

- [ ] **Step 4: Test the handler locally**

```bash
NODE_OPTIONS='--max-old-space-size=8192' pnpm dev
# Override timezone to verify the gate:
psql "$DATABASE_URL" -c "UPDATE xero_org_connection SET timezone='UTC';"
# At UTC 07:00 (or simulate by editing the gate to localHour === <current_hour>) — call:
curl -i -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/anomaly-detection
```

Expected: `200` with run result; rows appear in `anomalies` table.

- [ ] **Step 5: Commit**

```bash
git add server/api/cron/anomaly-detection.ts wrangler.toml
git commit -m "feat(anomalies): hourly cron with local-7am gate for the connected org"
```

---

## Task 3.4: Daily-digest section for anomalies

The existing daily digest pipeline aggregates Smart Watch notifications and runs Groq narrative. Add a new "Anomalies" section that lists all `open|acknowledged|snoozed` anomalies grouped by severity.

**Files:**
- Modify: existing daily digest builder (find via `grep -ln "daily digest\|generateDailyDigest" server/`)

- [ ] **Step 1: Locate the digest builder**

```bash
grep -rln "daily.*digest\|generateDailyDigest\|buildDigest" server/utils server/api 2>/dev/null
```

- [ ] **Step 2: Add a section that fetches open/acknowledged/snoozed anomalies and renders them**

```ts
// In the digest builder, after existing notification aggregation, add:
const anomalies = await queryRows(
  `SELECT id, title, description, severity, type, fingerprint, recommendation
   FROM anomalies
   WHERE tenant_id = $1 AND status IN ('open','acknowledged','snoozed')
   ORDER BY severity = 'critical' DESC, first_detected_at DESC
   LIMIT 25`,
  [tenantId],
)

if (anomalies.length > 0) {
  digestSections.push({
    title: 'Anomalies',
    items: anomalies.map(a => ({
      severity: a.severity,
      title: a.title,
      description: a.description,
      link: `${BASE_URL}/anomalies?focus=${a.id}`,
    })),
    // Pass into existing Groq summarise() to get the top-3 narrative.
  })
}
```

The exact integration depends on the digest's existing data shape — match that pattern and don't introduce a new templating library.

- [ ] **Step 3: Test the digest renders the section**

Trigger the digest manually (look for a `/api/admin/digest/preview` or similar test endpoint, or run the digest builder via a one-off script). Verify the section renders.

- [ ] **Step 4: Commit**

```bash
git add server/utils/<digest-file>.ts
git commit -m "feat(anomalies): daily digest gains open-anomalies section with Groq narrative"
```

---

## Task 3.5: Backfill script (notifications suppressed)

**Files:**
- Create: `scripts/anomaly-backfill.ts`

- [ ] **Step 1: Implement**

```ts
// scripts/anomaly-backfill.ts
/**
 * One-off: populate the anomalies table for the connected Xero org without
 * triggering notifications. Run AFTER deploying PR 3 (cron + notify wired)
 * but BEFORE enabling the cron in the CF dashboard.
 *
 * Usage:
 *   ANOMALY_NOTIFICATIONS_DISABLED=true tsx scripts/anomaly-backfill.ts
 */
import { runDetectionForTenant } from '../server/utils/anomalyDetection/runForTenant'
import { queryOne } from '../server/utils/db'

async function main() {
  if (process.env.ANOMALY_NOTIFICATIONS_DISABLED !== 'true') {
    console.error('Refusing to run: ANOMALY_NOTIFICATIONS_DISABLED must be "true"')
    process.exit(1)
  }
  const conn = await queryOne<{ tenant_id: string }>(
    `SELECT tenant_id FROM xero_org_connection LIMIT 1`, [])
  if (!conn) {
    console.error('No Xero connection found.')
    process.exit(1)
  }
  console.log(`Backfilling anomalies for tenant=${conn.tenant_id}…`)
  const result = await runDetectionForTenant(conn.tenant_id, { event: null })
  console.log(JSON.stringify(result, null, 2))
}

main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Document the runbook**

Add to the project's deploy notes (the existing CLAUDE.md or a deploy README):

```
After deploying PR 3 of the anomalies overhaul:
  1. Run the backfill (notifications suppressed):
       ANOMALY_NOTIFICATIONS_DISABLED=true tsx scripts/anomaly-backfill.ts
  2. Verify rows in `anomalies` table.
  3. Enable the cron in Cloudflare dashboard (Workers > anomaly-detection trigger).
```

- [ ] **Step 3: Commit**

```bash
git add scripts/anomaly-backfill.ts
git commit -m "feat(anomalies): backfill script with notifications-disabled guard"
```

---

# Phase 4 — UI polish (PR 4)

End-state: tabs (Active/History), per-card status mutation buttons, drill-down links, lazy Groq narrative, CSV export, sidebar badge, marketing copy aligned.

---

## Task 4.1: Tabs and status pills

**Files:**
- Modify: `app/pages/anomalies/index.vue`

- [ ] **Step 1: Add `UTabs` and pill state, persist to URL query**

In `<script setup>`:

```ts
const tab = computed({
  get: () => (route.query.tab === 'history' ? 'history' : 'active'),
  set: (v: string) => router.replace({ query: { ...route.query, tab: v } }),
})

const statusPill = computed({
  get: () => (route.query.status as string) || 'all',
  set: (v: string) => router.replace({
    query: { ...route.query, status: v === 'all' ? undefined : v },
  }),
})

const activePillOptions = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'snoozed', label: 'Snoozed' },
]
const historyPillOptions = [
  { value: 'all', label: 'All' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'dismissed', label: 'Dismissed' },
]
const pillOptions = computed(() =>
  tab.value === 'history' ? historyPillOptions : activePillOptions,
)
```

In the template, replace the breadcrumb/toolbar block with:

```vue
<UTabs
  :items="[
    { value: 'active', label: 'Active', slot: 'active' },
    { value: 'history', label: 'History', slot: 'history' },
  ]"
  v-model="tab"
  class="mb-4"
/>

<div class="flex flex-wrap items-center gap-2 mb-4">
  <UButton
    v-for="opt in pillOptions"
    :key="opt.value"
    :variant="statusPill === opt.value ? 'solid' : 'subtle'"
    color="neutral"
    size="xs"
    @click="statusPill = opt.value"
  >
    {{ opt.label }}
  </UButton>
</div>
```

Update the `useFetch` query to include `tab` and `status`:

```ts
const filterParams = computed(() => {
  const q: Record<string, string> = { tab: tab.value }
  if (statusPill.value !== 'all') q.status = statusPill.value
  if (activeSeverity.value !== 'all') q.severity = activeSeverity.value
  if (activeType.value !== 'all') q.type = activeType.value
  return q
})
```

- [ ] **Step 2: Verify in dev**

```bash
NODE_OPTIONS='--max-old-space-size=8192' pnpm dev
# Visit /anomalies, click between Active/History tabs, click pills.
# URL should update; data should refetch.
```

- [ ] **Step 3: Commit**

```bash
git add app/pages/anomalies/index.vue
git commit -m "feat(anomalies): tabs (Active/History) + status pills with URL persistence"
```

---

## Task 4.2: Per-card status mutation buttons

**Files:**
- Modify: `app/pages/anomalies/index.vue`

- [ ] **Step 1: Extract a card component**

Pull the existing card body (lines 425–558 of the current file) into a new component `app/components/anomalies/AnomalyCard.vue` with props `(anomaly, onMutate)` and emits `mutated`. This keeps the page file under control as it grows.

- [ ] **Step 2: Add the action footer**

In `AnomalyCard.vue`, after the existing recommendation/tags block:

```vue
<div class="flex flex-wrap items-center gap-2 pt-3 border-t border-default/40">
  <UButton
    v-if="anomaly.status === 'open' || anomaly.status === 'snoozed'"
    label="Acknowledge"
    icon="i-lucide-check"
    color="neutral"
    variant="soft"
    size="sm"
    @click="mutate('acknowledge')"
  />
  <UPopover>
    <UButton label="Snooze" icon="i-lucide-clock" color="neutral" variant="soft" size="sm" />
    <template #panel>
      <div class="p-2 flex flex-col gap-1">
        <UButton size="xs" variant="ghost" @click="snooze(24)">24 hours</UButton>
        <UButton size="xs" variant="ghost" @click="snooze(24 * 7)">7 days</UButton>
        <UButton size="xs" variant="ghost" @click="snooze(24 * 30)">30 days</UButton>
      </div>
    </template>
  </UPopover>
  <UButton label="Dismiss" icon="i-lucide-x" color="neutral" variant="soft" size="sm" @click="askDismiss" />
  <UButton
    v-if="anomaly.status !== 'resolved'"
    label="Resolve"
    icon="i-lucide-check-check"
    color="neutral"
    variant="soft"
    size="sm"
    @click="askResolve"
  />
</div>
```

- [ ] **Step 3: Implement the mutation calls in `<script setup>`**

```ts
const props = defineProps<{ anomaly: AnomalyRow }>()
const emit = defineEmits<{ (e: 'mutated'): void }>()
const toast = useToast()

async function mutate(action: string, body: Record<string, any> = {}) {
  try {
    await $fetch(`/api/ai/anomalies/${props.anomaly.id}`, {
      method: 'PATCH',
      body: { action, ...body },
    })
    toast.add({ title: 'Updated', color: 'success' })
    emit('mutated')
  } catch (err: any) {
    toast.add({ title: 'Update failed', description: err.statusMessage, color: 'error' })
  }
}

function snooze(hours: number) {
  const until = new Date(Date.now() + hours * 3600_000).toISOString()
  return mutate('snooze', { snoozedUntil: until })
}

const dismissOpen = ref(false)
const dismissReason = ref('')
function askDismiss() { dismissOpen.value = true }

const resolveOpen = ref(false)
const resolveNotes = ref('')
function askResolve() { resolveOpen.value = true }
```

Add the dismiss/resolve `UModal`s — straightforward `UTextarea` + confirm button.

- [ ] **Step 4: Wire the parent page to `refresh()` on `mutated`**

```vue
<AnomalyCard v-for="a in section.items" :key="a.id" :anomaly="a" @mutated="refresh" />
```

- [ ] **Step 5: Commit**

```bash
git add app/components/anomalies/AnomalyCard.vue app/pages/anomalies/index.vue
git commit -m "feat(anomalies): per-card acknowledge/snooze/dismiss/resolve actions"
```

---

## Task 4.3: Lazy Groq narrative endpoint and slideover wiring

**Files:**
- Create: `server/api/ai/anomalies/[id]/narrative.get.ts`
- Modify: `app/components/ActionPlanSlideover.vue` (existing)

- [ ] **Step 1: Implement the endpoint**

```ts
// server/api/ai/anomalies/[id]/narrative.get.ts
import { defineEventHandler, getRouterParam, createError } from 'h3'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { getSelectedTenant } from '~~/server/utils/session'
import { queryOne, execute } from '~~/server/utils/db'
import { groq } from '~~/server/utils/groqClient' // existing helper

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.FINANCE)
  const tenantId = await getSelectedTenant(event)
  const id = getRouterParam(event, 'id')
  if (!id || !tenantId) throw createError({ statusCode: 400, statusMessage: 'bad request' })

  const row = await queryOne<any>(
    `SELECT * FROM anomalies WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'not found' })
  if (row.driver_narrative && row.driver_narrative_at) {
    return { narrative: row.driver_narrative, cached: true }
  }

  const prompt = `You are a senior FP&A analyst. In 3 short paragraphs, explain to an agency owner what likely caused this anomaly and what they should investigate first.

Anomaly: ${row.title}
Description: ${row.description}
Metric: ${JSON.stringify(row.metric)}
Comparison: ${JSON.stringify(row.comparison)}
Context: ${JSON.stringify(row.context)}

Tone: direct, practical, no fluff. End with a 3-bullet "Investigate next:" list.`

  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile', // match existing groqClient usage
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 600,
    temperature: 0.4,
  })
  const narrative = completion.choices[0].message.content || ''

  await execute(
    `UPDATE anomalies SET driver_narrative = $1, driver_narrative_at = NOW() WHERE id = $2`,
    [narrative, id],
  )
  await execute(
    `INSERT INTO anomaly_events (anomaly_id, event) VALUES ($1, 'narrative-generated')`,
    [id],
  )

  return { narrative, cached: false }
})
```

> Verify the existing Groq model name in `server/utils/groqClient.ts` and match it.

- [ ] **Step 2: Wire `ActionPlanSlideover.vue` to call this endpoint when opened**

When the slideover opens for an anomaly, fetch from `/api/ai/anomalies/:id/narrative`. Show a spinner on first open; cached on subsequent opens.

- [ ] **Step 3: Commit**

```bash
git add server/api/ai/anomalies/\[id\]/narrative.get.ts app/components/ActionPlanSlideover.vue
git commit -m "feat(anomalies): lazy Groq narrative endpoint + slideover wiring"
```

---

## Task 4.4: Drill-down links and CSV export

**Files:**
- Modify: `app/components/anomalies/AnomalyCard.vue`
- Create: `server/api/ai/anomalies/export.get.ts`

- [ ] **Step 1: Drill-down link mapping in the card**

```ts
function drillDownLink(a: AnomalyRow): string | null {
  if (a.fingerprint.startsWith('receivables:aging-concentration')) return '/invoices?aging=90+'
  if (a.fingerprint.startsWith('expenses:vendor-outlier-')) {
    const vendor = a.context?.vendor
    return vendor ? `/expenses?vendor=${encodeURIComponent(vendor)}` : null
  }
  if (a.fingerprint.startsWith('clients:unprofitable-')) {
    const cid = a.fingerprint.split('-').slice(1).join('-')
    return `/clients/${cid}/profitability`
  }
  if (a.fingerprint.startsWith('adspend:spike-')) {
    const [, , clientId, platform] = a.fingerprint.split('-')
    return `/agency/social/spend?client=${clientId}&platform=${platform}`
  }
  if (a.fingerprint.startsWith('transactions:outlier-')) {
    const account = a.context?.account
    return account ? `/expenses?account=${encodeURIComponent(account)}` : null
  }
  return null
}
```

In the template, add `<NuxtLink v-if="drillDownLink(anomaly)" ...>View source →</NuxtLink>` in the card footer.

- [ ] **Step 2: CSV export endpoint**

```ts
// server/api/ai/anomalies/export.get.ts
import { defineEventHandler, getQuery, setHeader, createError } from 'h3'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { getSelectedTenant } from '~~/server/utils/session'
import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.FINANCE)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'bad request' })

  const rows = await queryRows<any>(
    `SELECT type, severity, status, title, description, fingerprint,
            first_detected_at, last_detected_at, resolved_at
     FROM anomalies WHERE tenant_id = $1 ORDER BY first_detected_at DESC LIMIT 5000`,
    [tenantId],
  )

  const cols = ['type','severity','status','title','description','fingerprint',
                'first_detected_at','last_detected_at','resolved_at']
  const csv = [
    cols.join(','),
    ...rows.map(r => cols.map(c => csvEscape(r[c])).join(',')),
  ].join('\n')

  setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
  setHeader(event, 'Content-Disposition', `attachment; filename="anomalies-${new Date().toISOString().slice(0,10)}.csv"`)
  return csv
})

function csvEscape(v: any): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}
```

In the page toolbar, add a `UButton` linking to `/api/ai/anomalies/export`.

- [ ] **Step 3: Commit**

```bash
git add app/components/anomalies/AnomalyCard.vue server/api/ai/anomalies/export.get.ts app/pages/anomalies/index.vue
git commit -m "feat(anomalies): drill-down links + CSV export"
```

---

## Task 4.5: Sidebar badge

**Files:**
- Create: `app/composables/useOpenAnomalyCount.ts`
- Modify: `app/layouts/agency.vue`

- [ ] **Step 1: Composable**

```ts
// app/composables/useOpenAnomalyCount.ts
export function useOpenAnomalyCount() {
  const count = useState<number>('open-anomaly-count', () => 0)

  async function refresh() {
    try {
      const r = await $fetch<{ count: number }>('/api/ai/anomalies/count/critical-open')
      count.value = r.count
    } catch { /* silent */ }
  }

  if (import.meta.client) {
    onMounted(() => {
      refresh()
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') refresh()
      })
    })
  }

  return { count, refresh }
}
```

- [ ] **Step 2: Wire the badge**

In `app/layouts/agency.vue`, line 173 area:

```ts
const { count: anomalyCount, refresh: refreshAnomalyCount } = useOpenAnomalyCount()

// In the sidebar items config:
{
  label: 'Anomalies',
  icon: 'i-lucide-alert-triangle',
  to: '/anomalies',
  badge: anomalyCount.value > 0 ? String(anomalyCount.value) : undefined,
  onSelect: close,
},
```

- [ ] **Step 3: Refresh on local mutation**

In `app/pages/anomalies/index.vue`, after a successful mutation, call `useOpenAnomalyCount().refresh()`.

- [ ] **Step 4: Commit**

```bash
git add app/composables/useOpenAnomalyCount.ts app/layouts/agency.vue app/pages/anomalies/index.vue
git commit -m "feat(anomalies): sidebar badge for open critical anomalies"
```

---

## Task 4.6: Grouped incident card

**Files:**
- Modify: `app/components/anomalies/AnomalyCard.vue` or extract `AnomalyGroupCard.vue`

- [ ] **Step 1: Group anomalies by `group_key` in the page**

```ts
const grouped = computed(() => {
  const groups = new Map<string, any[]>()
  const ungrouped: any[] = []
  for (const a of filteredAnomalies.value) {
    if (a.group_key) {
      if (!groups.has(a.group_key)) groups.set(a.group_key, [])
      groups.get(a.group_key)!.push(a)
    } else {
      ungrouped.push(a)
    }
  }
  return { groups: Array.from(groups.entries()), ungrouped }
})
```

- [ ] **Step 2: Render groups as a wrapping `UCard` with children inside**

```vue
<div v-for="[key, items] in grouped.groups" :key="key" class="rounded-lg border border-default p-4 space-y-3">
  <div class="flex items-center justify-between">
    <h3 class="text-sm font-semibold">
      {{ key.replace('incident:', '').replace(':', ' — ') }} · {{ items.length }} findings
    </h3>
  </div>
  <AnomalyCard v-for="a in items" :key="a.id" :anomaly="a" :nested="true" @mutated="refresh" />
</div>

<AnomalyCard v-for="a in grouped.ungrouped" :key="a.id" :anomaly="a" @mutated="refresh" />
```

- [ ] **Step 3: Commit**

```bash
git add app/pages/anomalies/index.vue app/components/anomalies/AnomalyCard.vue
git commit -m "feat(anomalies): group correlated findings under parent incident card"
```

---

## Task 4.7: Marketing copy alignment

**Files:**
- Modify: `app/pages/features/[slug].vue`
- Modify: `app/pages/features/index.vue` (description)

- [ ] **Step 1: Update copy**

In `features/[slug].vue` (around line 806 — the anomaly-detection entry):

- Replace `8 specialised analysers` → `9 specialised analysers`.
- Remove the sentence "The scoring adapts over time as the system learns which types of anomalies your team acts on and which they dismiss." (not implemented).
- Add a short line about the new ad-spend, per-client and YoY analysers.

In `features/index.vue` (line 211): update the same `8` → `9`.

- [ ] **Step 2: Commit**

```bash
git add app/pages/features/index.vue app/pages/features/\[slug\].vue
git commit -m "docs(marketing): align anomaly detection copy with shipped behaviour"
```

---

# Self-Review

After writing all tasks above, the spec sections were re-checked end-to-end. All sections in the spec map to at least one task:

| Spec section | Task(s) |
|---|---|
| Architecture overview | 1.1 (migration), 1.7–1.8 (pipeline), 3.3 (cron) |
| Data model: anomalies + anomaly_events | 1.1 |
| Status semantics + snooze | 1.5 (reconcile), 1.11 (mutations) |
| Detection pipeline folder structure | 1.2, 1.7, 1.8 |
| Analyser contract | 1.2 |
| New analysers (revenue/clients/adspend/transactions) | 2.1–2.4 |
| Correlation / grouping | 2.5 |
| Reconciliation (5 steps) | 1.5 |
| Notification flow | 3.1, 3.2 |
| Daily digest section | 3.4 |
| UI: tabs/pills/cards/groups | 4.1, 4.2, 4.6 |
| Drill-down links | 4.4 |
| Sidebar badge | 4.5 |
| Cron with local-7am gate | 3.3 |
| Manual scan + 5min in-flight lock | 1.4, 1.10 |
| Backfill | 3.5 |
| Endpoint deprecation | 1.14, 2.4 |
| Marketing copy alignment | 4.7 |
| YoY data window verification | 2.1 |
| Per-client cost formula fallback | 2.3 |

**Placeholder scan:** No `TBD`/`TODO` placeholders inside actionable steps. Ambiguous items (`existing sendEmail import`, `digest builder location`, `groq model name`) are explicit verification steps with grep commands rather than vague directives.

**Type consistency:** `runDetectionForTenant` is consistent across cron handler, scan endpoint, and runForTenant module. Types `DetectedAnomaly`, `AnomalyRow`, `Analyser` are all defined in `types.ts` and imported consistently.

**Spec corrections section** at the top of the plan documents the codebase drift between the spec's assumptions and reality (no multi-tenant, no notification topics, code-level PERMISSIONS, UUID team_members). All downstream tasks reference the corrected names.

---

**Plan complete.**
