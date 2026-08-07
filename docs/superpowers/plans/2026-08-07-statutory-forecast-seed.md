# Statutory Forecast Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seed wages, super, SRO payroll tax and the ATO debt instalment into the existing `cashflow_commitments` register so the 13-week Treasury forecast includes payroll/statutory outflows (spec: `docs/superpowers/specs/2026-08-07-payroll-statutory-forecast-sync-design.md`).

**Architecture:** No forecast-endpoint changes — `server/api/xero/get-out/cashflow-13w.get.ts` already expands commitment recurrences and suppresses weeks with real bills. We add: a migration widening the `source` CHECK, a seed-config module, an idempotent FINANCE-gated seeding endpoint, and a badge + button on the commitments page.

**Tech Stack:** Nitro (h3), Neon Postgres via `~~/server/utils/db`, Vitest, Nuxt UI v4.

## Global Constraints

- Server imports use `~~/server/utils/` (double-tilde), never `~/`.
- Money is integer cents (`amount_cents BIGINT`).
- The seeder NEVER updates existing rows — human edits always win.
- Seed config MUST NOT contain PAYGW or BAS entries (they exist as authorised Xero bills; seeding would double-count).
- Migrations run automatically against the DB per CLAUDE.md (`export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-); psql "$DATABASE_URL" -f <file>`).
- Tests live under `test/server/...` and run with `pnpm vitest run <path>`.

---

### Task 1: Migration + source enum extension

**Files:**
- Create: `server/database/migrations/333-statutory-seed-source.sql`
- Modify: `server/utils/cashflowCommitments.ts` (the `SOURCES` set, ~line 16)
- Test: `test/server/utils/cashflowCommitments.test.ts`

**Interfaces:**
- Produces: `validateCommitmentBody` accepts `source: 'statutory-seed'` (existing signature unchanged: `(body: Record<string, unknown>, opts: { partial: boolean }) => CommitmentInput`).

- [ ] **Step 1: Write the failing test**

```ts
// test/server/utils/cashflowCommitments.test.ts
import { describe, it, expect } from 'vitest'
import { validateCommitmentBody } from '../../../server/utils/cashflowCommitments'

const base = {
  supplier: 'Wages — weekly pay run',
  amountCents: 1_650_000,
  expectedDate: '2026-08-14',
  recurrence: 'weekly',
  paymentAccount: 'NAB_BUSINESS',
  status: 'expected',
  confidence: 'committed',
}

describe('validateCommitmentBody source enum', () => {
  it('accepts statutory-seed as a source', () => {
    const v = validateCommitmentBody({ ...base, source: 'statutory-seed' }, { partial: false })
    expect(v.source).toBe('statutory-seed')
  })

  it('still rejects unknown sources', () => {
    expect(() => validateCommitmentBody({ ...base, source: 'robot-guess' }, { partial: false })).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/server/utils/cashflowCommitments.test.ts`
Expected: FAIL — first test throws because `statutory-seed` is not in `SOURCES`.

- [ ] **Step 3: Implement**

In `server/utils/cashflowCommitments.ts` change:

```ts
const SOURCES = new Set(['manual', 'spreadsheet-import', 'statutory-seed'])
```

Create `server/database/migrations/333-statutory-seed-source.sql`:

```sql
-- 333: allow statutory-seed as a cashflow_commitments source.
-- Seeded payroll/statutory obligations (wages, super, SRO, ATO instalment)
-- are ordinary commitments distinguished only by source, so the seeder can
-- find its own rows and the UI can badge them.
ALTER TABLE cashflow_commitments
  DROP CONSTRAINT IF EXISTS cashflow_commitments_source_check;
ALTER TABLE cashflow_commitments
  ADD CONSTRAINT cashflow_commitments_source_check
  CHECK (source IN ('manual','spreadsheet-import','statutory-seed'));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/server/utils/cashflowCommitments.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Run the migration**

```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/333-statutory-seed-source.sql
```

Expected: `ALTER TABLE` twice, no errors.

- [ ] **Step 6: Commit**

```bash
git add server/database/migrations/333-statutory-seed-source.sql server/utils/cashflowCommitments.ts test/server/utils/cashflowCommitments.test.ts
git commit -m "feat: allow statutory-seed source on cashflow commitments"
```

---

### Task 2: Seed config module

**Files:**
- Create: `server/utils/statutorySeed.ts`
- Test: `test/server/utils/statutorySeed.test.ts`

**Interfaces:**
- Produces:
  - `interface StatutorySeedDef { seedKey: string; supplier: string; description: string; amountCents: number; recurrence: 'weekly' | 'monthly'; paymentAccount: 'NAB_BUSINESS' | 'NAB_TAX'; confidence: 'committed' | 'provisional'; anchor: (today: Date) => string }`
  - `export const STATUTORY_SEEDS: StatutorySeedDef[]` (exactly 4 entries: wages-weekly, super-weekly, sro-payroll-tax, ato-debt-instalment)
  - `export function nextWeekday(today: Date, isoWeekday: number): string` — next occurrence of the weekday (1=Mon..7=Sun), strictly after today if today is that day; returns `YYYY-MM-DD` (UTC).
  - `export function nextMonthlyDay(today: Date, dayOfMonth: number): string` — the next date with that day-of-month strictly after today; returns `YYYY-MM-DD` (UTC).
  - `export function seedNoteFor(def: StatutorySeedDef): string` — returns `` `seedKey:${def.seedKey} — seeded statutory obligation; edit amounts freely, the seeder never overwrites.` ``

- [ ] **Step 1: Write the failing tests**

```ts
// test/server/utils/statutorySeed.test.ts
import { describe, it, expect } from 'vitest'
import { STATUTORY_SEEDS, nextWeekday, nextMonthlyDay, seedNoteFor } from '../../../server/utils/statutorySeed'

describe('statutory seed config', () => {
  it('contains exactly the four agreed obligations', () => {
    expect(STATUTORY_SEEDS.map(s => s.seedKey).sort()).toEqual([
      'ato-debt-instalment', 'sro-payroll-tax', 'super-weekly', 'wages-weekly',
    ])
  })

  it('never contains PAYGW or BAS entries (double-count guard)', () => {
    for (const s of STATUTORY_SEEDS) {
      const text = `${s.seedKey} ${s.supplier} ${s.description}`.toLowerCase()
      expect(text).not.toMatch(/paygw|pay-as-you-go|\bbas\b/)
    }
  })

  it('uses the spreadsheet working figures', () => {
    const byKey = Object.fromEntries(STATUTORY_SEEDS.map(s => [s.seedKey, s]))
    expect(byKey['wages-weekly'].amountCents).toBe(1_650_000)
    expect(byKey['super-weekly'].amountCents).toBe(240_000)
    expect(byKey['sro-payroll-tax'].amountCents).toBe(50_000)
    expect(byKey['ato-debt-instalment'].amountCents).toBe(600_000)
    expect(byKey['sro-payroll-tax'].paymentAccount).toBe('NAB_TAX')
    expect(byKey['sro-payroll-tax'].confidence).toBe('provisional')
  })
})

describe('anchor date helpers', () => {
  it('nextWeekday finds the next Friday', () => {
    // 2026-08-07 is a Friday → next Friday is the 14th (strictly after)
    expect(nextWeekday(new Date('2026-08-07T00:00:00Z'), 5)).toBe('2026-08-14')
    expect(nextWeekday(new Date('2026-08-05T00:00:00Z'), 5)).toBe('2026-08-07')
  })

  it('nextMonthlyDay rolls into next month when the day has passed', () => {
    expect(nextMonthlyDay(new Date('2026-08-07T00:00:00Z'), 7)).toBe('2026-09-07')
    expect(nextMonthlyDay(new Date('2026-08-07T00:00:00Z'), 13)).toBe('2026-08-13')
  })

  it('seedNoteFor leads with the seedKey marker', () => {
    expect(seedNoteFor(STATUTORY_SEEDS[0]!)).toMatch(/^seedKey:[a-z-]+ /)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run test/server/utils/statutorySeed.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```ts
// server/utils/statutorySeed.ts
/**
 * Statutory obligation seed set for the commitment register.
 *
 * Source of truth for amounts/timing: the bookkeeper's 3 Aug 2026 sheet and
 * the PRD — Bookkeeper Process working doc (Monday doc 45543750). PAYGW and
 * BAS are deliberately ABSENT: the bookkeeper enters those as authorised
 * Xero bills, so they already reach the forecast through the bills path.
 */

export interface StatutorySeedDef {
  seedKey: string
  supplier: string
  description: string
  amountCents: number
  recurrence: 'weekly' | 'monthly'
  paymentAccount: 'NAB_BUSINESS' | 'NAB_TAX'
  confidence: 'committed' | 'provisional'
  anchor: (today: Date) => string
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function nextWeekday(today: Date, isoWeekday: number): string {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  const current = d.getUTCDay() === 0 ? 7 : d.getUTCDay()
  let delta = (isoWeekday - current + 7) % 7
  if (delta === 0) delta = 7
  d.setUTCDate(d.getUTCDate() + delta)
  return iso(d)
}

export function nextMonthlyDay(today: Date, dayOfMonth: number): string {
  const y = today.getUTCFullYear()
  const m = today.getUTCMonth()
  const candidate = new Date(Date.UTC(y, m, dayOfMonth))
  if (candidate > today) return iso(candidate)
  return iso(new Date(Date.UTC(y, m + 1, dayOfMonth)))
}

export function seedNoteFor(def: StatutorySeedDef): string {
  return `seedKey:${def.seedKey} — seeded statutory obligation; edit amounts freely, the seeder never overwrites.`
}

export const STATUTORY_SEEDS: StatutorySeedDef[] = [
  {
    seedKey: 'wages-weekly',
    supplier: 'Wages — weekly pay run',
    description: 'Weekly staff wages, excl super and CP & PG (working figure from 3 Aug sheet)',
    amountCents: 1_650_000,
    recurrence: 'weekly',
    paymentAccount: 'NAB_BUSINESS',
    confidence: 'committed',
    anchor: t => nextWeekday(t, 5),
  },
  {
    seedKey: 'super-weekly',
    supplier: 'SuperChoice — employee super',
    description: 'Weekly employee super via SuperChoice clearing house (est.)',
    amountCents: 240_000,
    recurrence: 'weekly',
    paymentAccount: 'NAB_BUSINESS',
    confidence: 'committed',
    anchor: t => nextWeekday(t, 5),
  },
  {
    seedKey: 'sro-payroll-tax',
    supplier: 'SRO — payroll tax (monthly)',
    description: 'Victorian payroll tax, due 7th of following month; amount varies with monthly wages',
    amountCents: 50_000,
    recurrence: 'monthly',
    paymentAccount: 'NAB_TAX',
    confidence: 'provisional',
    anchor: t => nextMonthlyDay(t, 7),
  },
  {
    seedKey: 'ato-debt-instalment',
    supplier: 'ATO — debt instalment',
    description: 'ATO payment-arrangement instalment, direct debit ~13th monthly',
    amountCents: 600_000,
    recurrence: 'monthly',
    paymentAccount: 'NAB_BUSINESS',
    confidence: 'committed',
    anchor: t => nextMonthlyDay(t, 13),
  },
]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run test/server/utils/statutorySeed.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add server/utils/statutorySeed.ts test/server/utils/statutorySeed.test.ts
git commit -m "feat: statutory obligation seed config with anchor-date helpers"
```

---

### Task 3: Idempotent seeding endpoint

**Files:**
- Create: `server/api/cashflow/commitments/seed-statutory.post.ts`
- Test: `test/server/api/seedStatutory.test.ts`

**Interfaces:**
- Consumes: `STATUTORY_SEEDS`, `seedNoteFor` from `~~/server/utils/statutorySeed` (Task 2); `transaction` from `~~/server/utils/db`; `requireRole`/`PERMISSIONS` from existing auth utils (same pattern as other FINANCE endpoints — check `server/api/cashflow/commitments/index.post.ts` neighbourhood for the exact import, it is auto-imported in Nitro).
- Produces: `POST /api/cashflow/commitments/seed-statutory` → `{ created: string[]; skipped: string[] }` (arrays of seedKeys).

- [ ] **Step 1: Write the failing test**

```ts
// test/server/api/seedStatutory.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// In-memory stand-in for cashflow_commitments filtered by the seeder's lookup.
const existingRows: Array<{ notes: string }> = []
const inserts: any[] = []

vi.mock('~~/server/utils/db', () => ({
  transaction: async (fn: (client: any) => Promise<any>) => {
    const client = {
      query: vi.fn(async (sql: string, params: any[]) => {
        if (/SELECT/i.test(sql)) {
          const like = String(params[1] ?? '')
          const prefix = like.replace(/%$/, '')
          return { rows: existingRows.filter(r => r.notes.startsWith(prefix)) }
        }
        inserts.push(params)
        return { rows: [{ id: 'new-id' }] }
      }),
    }
    return fn(client)
  },
}))
vi.mock('~~/server/utils/session', () => ({ getSelectedTenant: async () => 'tenant-1' }))

import { runStatutorySeed } from '../../../server/api/cashflow/commitments/seed-statutory.post'

describe('statutory seeder', () => {
  beforeEach(() => { existingRows.length = 0; inserts.length = 0 })

  it('creates all four on first run', async () => {
    const res = await runStatutorySeed('tenant-1', 'user-1', new Date('2026-08-07T00:00:00Z'))
    expect(res.created.sort()).toEqual(['ato-debt-instalment', 'sro-payroll-tax', 'super-weekly', 'wages-weekly'])
    expect(res.skipped).toEqual([])
    expect(inserts).toHaveLength(4)
  })

  it('second run creates nothing (idempotent)', async () => {
    await runStatutorySeed('tenant-1', 'user-1', new Date('2026-08-07T00:00:00Z'))
    existingRows.push(...inserts.map(p => ({ notes: String(p[12]) }))) // notes param position
    inserts.length = 0
    const res = await runStatutorySeed('tenant-1', 'user-1', new Date('2026-08-07T00:00:00Z'))
    expect(res.created).toEqual([])
    expect(res.skipped.sort()).toEqual(['ato-debt-instalment', 'sro-payroll-tax', 'super-weekly', 'wages-weekly'])
    expect(inserts).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/server/api/seedStatutory.test.ts`
Expected: FAIL — endpoint module does not exist.

- [ ] **Step 3: Implement**

```ts
// server/api/cashflow/commitments/seed-statutory.post.ts
/**
 * POST /api/cashflow/commitments/seed-statutory
 *
 * Idempotently seeds the statutory obligation set (wages, super, SRO,
 * ATO instalment) into the commitment register. Existing seeded rows are
 * NEVER updated — human edits win. Returns { created, skipped } seedKeys.
 */

import { defineEventHandler, createError } from 'h3'
import { transaction } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'
import { STATUTORY_SEEDS, seedNoteFor } from '~~/server/utils/statutorySeed'

export async function runStatutorySeed(tenantId: string, userId: string, today: Date) {
  const created: string[] = []
  const skipped: string[] = []

  await transaction(async (client) => {
    for (const def of STATUTORY_SEEDS) {
      const marker = `seedKey:${def.seedKey}%`
      const existing = await client.query(
        `SELECT id FROM cashflow_commitments
         WHERE tenant_id = $1 AND source = 'statutory-seed' AND notes LIKE $2
         LIMIT 1`,
        [tenantId, marker],
      )
      if (existing.rows.length) {
        skipped.push(def.seedKey)
        continue
      }
      await client.query(
        `INSERT INTO cashflow_commitments (
           tenant_id, supplier, contact_id, description, amount_cents, expected_date,
           recurrence, recurrence_end, payment_account, status, confidence,
           owner, notes, source, created_by)
         VALUES ($1,$2,NULL,$3,$4,$5,$6,NULL,$7,'expected',$8,NULL,$9,'statutory-seed',$10)`,
        [
          tenantId, def.supplier, def.description, def.amountCents, def.anchor(today),
          def.recurrence, def.paymentAccount, def.confidence, seedNoteFor(def), userId,
        ],
      )
      created.push(def.seedKey)
    }
  })

  return { created, skipped }
}

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, [PERMISSIONS.FINANCE])
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No Xero organization selected' })
  }
  return runStatutorySeed(tenantId, user.id, new Date())
})
```

Note for the implementer: `requireRole` and `PERMISSIONS` are Nitro auto-imports in this codebase (used across `server/api/**`). Check a neighbouring finance endpoint (e.g. `server/api/eom/*.ts`) for the exact permission constant — use the same one guarding the cashflow/commitments pages. If commitments endpoints only use `requireAuth`, match THAT instead and note it in the commit message.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/server/api/seedStatutory.test.ts`
Expected: PASS. If the notes param position assertion fails, count the INSERT params — notes is `$9` in the params array (index 8); fix the test's index, not the endpoint.

- [ ] **Step 5: Commit**

```bash
git add server/api/cashflow/commitments/seed-statutory.post.ts test/server/api/seedStatutory.test.ts
git commit -m "feat: idempotent statutory commitment seeding endpoint"
```

---

### Task 4: UI — badge and seed button

**Files:**
- Modify: `app/pages/cashflow/commitments.vue`

**Interfaces:**
- Consumes: `POST /api/cashflow/commitments/seed-statutory` → `{ created: string[]; skipped: string[] }` (Task 3). Commitment rows already expose `source`.

- [ ] **Step 1: Read the page and locate the rows rendering + toolbar**

Read `app/pages/cashflow/commitments.vue` fully. Identify: (a) where each commitment row renders its supplier/description, (b) the page-level action toolbar.

- [ ] **Step 2: Add the Statutory badge**

Next to the supplier name in the row template (adapt to the actual markup):

```vue
<UBadge v-if="row.source === 'statutory-seed'" variant="subtle" color="neutral" size="sm">
  Statutory
</UBadge>
```

- [ ] **Step 3: Add the seed button + handler**

In the toolbar:

```vue
<UButton size="sm" variant="outline" icon="i-lucide-calendar-plus" :loading="seeding" @click="seedStatutory">
  Seed statutory set
</UButton>
```

```ts
const seeding = ref(false)
async function seedStatutory() {
  seeding.value = true
  try {
    const res = await $fetch<{ created: string[]; skipped: string[] }>(
      '/api/cashflow/commitments/seed-statutory', { method: 'POST' },
    )
    toast.add({
      title: 'Statutory seed complete',
      description: `${res.created.length} created, ${res.skipped.length} already present`,
      color: 'success',
    })
    await refresh() // use the page's existing refresh/reload function name
  } catch (err: any) {
    toast.add({ title: 'Seeding failed', description: err?.data?.statusMessage ?? String(err), color: 'error' })
  } finally {
    seeding.value = false
  }
}
```

Use the page's existing `useToast()` instance and its existing data-refresh function — do not add duplicates.

- [ ] **Step 4: Verify in dev**

Run: `pnpm dev` (or `CHOKIDAR_USEPOLLING=true pnpm dev` in a worktree), open `/cashflow/commitments`, click **Seed statutory set**. Expected: toast "4 created, 0 already present"; four rows with Statutory badges. Click again: "0 created, 4 already present"; still four rows.

- [ ] **Step 5: Commit**

```bash
git add app/pages/cashflow/commitments.vue
git commit -m "feat: statutory badge and seed action on commitments page"
```

---

### Task 5: End-to-end forecast verification

**Files:**
- None created — verification only (fix forward if a gap is found).

- [ ] **Step 1: Run the full new test suite**

Run: `pnpm vitest run test/server/utils/statutorySeed.test.ts test/server/api/seedStatutory.test.ts test/server/utils/cashflowCommitments.test.ts`
Expected: all PASS.

- [ ] **Step 2: Verify forecast inclusion against the live dev DB**

With the seeds applied (Task 4 step 4), hit the forecast endpoint from the dev session (`/api/xero/get-out/cashflow-13w`) and confirm:
- weekly outflows now include ~$18,900/week (wages 16,500 + super 2,400) in every week,
- the week containing the 7th includes the SRO amount, the week containing the 13th includes $6,000.

If seeded commitments do NOT appear: the likely gap is the forecast's commitment query (`status IN ('expected','hold')`, date window) — debug there and fix minimally.

- [ ] **Step 3: Mutation check (test-suite honesty)**

Temporarily add a fake PAYGW entry to `STATUTORY_SEEDS` locally; run `test/server/utils/statutorySeed.test.ts`; expect the double-count guard test to FAIL. Revert the fake entry.

- [ ] **Step 4: Commit any verification fixes; push branch**

```bash
git push -u origin feat/statutory-forecast-seed
```
