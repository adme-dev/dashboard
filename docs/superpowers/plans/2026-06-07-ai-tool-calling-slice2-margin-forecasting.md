# AI Tool-Calling Slice 2 — Margin & Forecasting Tools — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 4 read-only FINANCE tools (`get_client_profitability`, `monitor_retainer_burn`, `flag_over_servicing`, `forecast_revenue`) to the shipped Slice-1 AI tool-calling loop so the agency assistant can answer margin, retainer-burn, over-servicing, and revenue-forecast questions on demand.

**Architecture:** Each tool mirrors the Slice-1 pattern — a pure handler `fn(args, ctx, deps = defaultDeps): Promise<ToolResult>` plus an `AiTool` registry entry. Three tools read Postgres directly (`agency_clients`, `xero_invoices_cache`, `media_spend`, `time_entries`, `projects`) through a new shared `economics.ts` module; `forecast_revenue` calls the existing `get-out/forecast` + `get-out/pipeline-coverage` endpoints (they make live Xero calls) via an injectable internal fetch. All four are FINANCE-gated, `returnsUntrusted: false`, agency-internal only, and join the Finance persona allowlist. No migration.

**Tech Stack:** Nuxt 4 / Nitro, Vercel AI SDK v6 (`ai`), Zod, Neon Postgres (`server/utils/db`), Vitest. Server imports use the `~~/` alias.

---

## Spec

Implements `docs/superpowers/specs/2026-06-07-ai-tool-calling-slice2-margin-forecasting-design.md`.

## Planning-time corrections to the spec (read first)

Discovered while grounding against `origin/main`:

1. **`get_client_profitability` is Postgres-direct, not route-fetch.** `get-out/margin.get.ts` is **agency-wide only** and reads Postgres caches (`xero_invoices_cache`, `media_spend`, `time_entries`) via `getSelectedTenant`. There is **no per-client margin endpoint**. So we build a new per-client computation in `economics.ts` (Postgres-direct). (Resolves spec §13.1.)
2. **Labor cost = `time_entries.hours × time_entries.hourly_rate`** (rate is on the entry), attributed to a client via `time_entries.project_id → projects.client_id`. **`rate_cards` is NOT needed** for v1 cost math. (Resolves spec §13.2: consumption = time × on-entry rate.)
3. **Retainer cap / scope baseline = `agency_clients.retainer_amount`** where `billing_type IN ('retainer','hybrid')`. No separate retainers table is needed for the cap.
4. **`forecast_revenue` stays route-fetch** — `forecast.get.ts` and `pipeline-coverage.get.ts` make live Xero calls (quotes, repeating invoices, credit notes), so we reuse them via internal fetch rather than re-implementing.
5. **`churnRisk` is trimmed from the v1 `get_client_profitability` deep-dive** (it lives in a separate insights/rollup table; margin is the headline). Noted as a fast-follow. All other spec contract fields are implemented.

Confirmed schema (from `server/database/schema.sql` + `migrations/092-xero-customer-cache.sql`):
- `agency_clients(id uuid, name, xero_contact_id, billing_type, retainer_amount decimal, hourly_rate, media_commission_rate)`
- `media_spend(client_id uuid→agency_clients, actual_spend decimal, period varchar(7) 'YYYY-MM')`
- `time_entries(hours decimal, hourly_rate decimal, project_id, date)`
- `projects(id uuid, client_id uuid→agency_clients)`
- `xero_invoices_cache(tenant_id, contact_id text, type, status, date, total_cents bigint)`

## File Structure

**Create**
- `server/utils/ai/tools/economics.ts` — shared pure helpers (`periodBounds`, `resolveByName`) + Postgres data fns (`fetchClientEconomics`, `fetchRetainerCaps`, `fetchClientProjectLabor`).
- `server/utils/ai/tools/profitability.ts` — `get_client_profitability`.
- `server/utils/ai/tools/retainerBurn.ts` — `monitor_retainer_burn`.
- `server/utils/ai/tools/overServicing.ts` — `flag_over_servicing`.
- `server/utils/ai/tools/revenueForecast.ts` — `forecast_revenue`.
- `test/ai/tools/economics.test.ts`, `profitability.test.ts`, `retainerBurn.test.ts`, `overServicing.test.ts`, `revenueForecast.test.ts`.

**Modify**
- `server/utils/ai/tools/index.ts` — register the 4 tools.
- `server/utils/ai/personas.ts` — add the 4 to the Finance persona allowlist.
- `test/ai/registry.assembly.test.ts` — expect 14 tools incl. the 4 names.
- `test/ai/personas.test.ts` — assert the finance persona lists the 4.
- `test/ai/toolLoop.test.ts` — one positive + one negative tool-selection case.
- `app/pages/features/[slug].vue` (+ `app/pages/features/index.vue` if needed) — truthful AI capability copy.

---

## Task 0: Isolated worktree off origin/main

**Files:** none (environment).

- [ ] **Step 1: Create the worktree from origin/main** (the local `main` is diverged and the working tree holds unrelated WIP — do NOT use it)

```bash
cd /Users/paulgiurin/Documents/Projects/dashboard
git fetch origin
git worktree add .worktrees/ai-slice2 -b feat/ai-tools-slice2 origin/main
cd .worktrees/ai-slice2
```

- [ ] **Step 2: Install + prepare** (a fresh worktree needs `nuxt prepare` before Vitest can resolve `~~/` aliases)

```bash
pnpm install --frozen-lockfile
pnpm exec nuxt prepare
```

- [ ] **Step 3: Confirm baseline AI tests pass**

Run: `pnpm exec vitest run test/ai`
Expected: PASS (the shipped Slice-1 suite is green before we add anything).

---

## Task 1: Shared `economics.ts` helpers

**Files:**
- Create: `server/utils/ai/tools/economics.ts`
- Test: `test/ai/tools/economics.test.ts`

The pure helpers (`periodBounds`, `resolveByName`) are unit-tested. The Postgres data functions run live SQL and are exercised through each tool's tests via injected mock deps (mirroring how `finance.ts`/`tasks.ts` keep `defaultDeps` SQL out of unit tests).

- [ ] **Step 1: Write the failing test for the pure helpers**

```typescript
// test/ai/tools/economics.test.ts
import { describe, it, expect } from 'vitest'
import { periodBounds, resolveByName } from '~~/server/utils/ai/tools/economics'

describe('periodBounds', () => {
  const now = new Date('2026-06-07T10:00:00Z')

  it('mtd → first..last of the current month + single media period', () => {
    const b = periodBounds('mtd', now)
    expect(b.start).toBe('2026-06-01')
    expect(b.end).toBe('2026-06-30')
    expect(b.mediaPeriods).toEqual(['2026-06'])
  })

  it('ytd → Jan 1..today + one media period per elapsed month', () => {
    const b = periodBounds('ytd', now)
    expect(b.start).toBe('2026-01-01')
    expect(b.end).toBe('2026-06-07')
    expect(b.mediaPeriods).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'])
  })
})

describe('resolveByName', () => {
  const rows = [{ name: 'Acme Corp' }, { name: 'Acme Media' }, { name: 'Globex' }]

  it('exact case-insensitive match wins even when substrings also match', () => {
    expect(resolveByName([{ name: 'Acme' }, { name: 'Acme Corp' }], 'acme').match).toEqual({ name: 'Acme' })
  })
  it('single substring match resolves', () => {
    expect(resolveByName(rows, 'globe').match).toEqual({ name: 'Globex' })
  })
  it('multiple substring matches → no match, candidates listed', () => {
    const r = resolveByName(rows, 'acme')
    expect(r.match).toBeUndefined()
    expect(r.candidates).toHaveLength(2)
  })
  it('no match → empty', () => {
    expect(resolveByName(rows, 'zzz')).toEqual({ candidates: [] })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run test/ai/tools/economics.test.ts`
Expected: FAIL — `economics` module not found.

- [ ] **Step 3: Implement `economics.ts`**

```typescript
// server/utils/ai/tools/economics.ts
import type { H3Event } from 'h3'
import { queryRows } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'

export type Period = 'mtd' | 'ytd'

export interface PeriodBounds {
  /** inclusive ISO date 'YYYY-MM-DD' */
  start: string
  end: string
  /** media_spend.period values ('YYYY-MM') covering the window */
  mediaPeriods: string[]
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const ym = (y: number, m0: number) => `${y}-${String(m0 + 1).padStart(2, '0')}`

export function periodBounds(period: Period, now: Date = new Date()): PeriodBounds {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  if (period === 'ytd') {
    return {
      start: iso(new Date(Date.UTC(y, 0, 1))),
      end: iso(now),
      mediaPeriods: Array.from({ length: m + 1 }, (_, i) => ym(y, i)),
    }
  }
  return {
    start: iso(new Date(Date.UTC(y, m, 1))),
    end: iso(new Date(Date.UTC(y, m + 1, 0))),
    mediaPeriods: [ym(y, m)],
  }
}

export interface NameMatch<T> { match?: T, candidates: T[] }

/** Resolve a model-supplied name against already-fetched rows: exact wins, else unique substring, else ambiguous/none. */
export function resolveByName<T extends { name: string | null }>(rows: T[], query: string): NameMatch<T> {
  const q = query.trim().toLowerCase()
  if (!q) return { candidates: [] }
  const exact = rows.filter(r => (r.name ?? '').toLowerCase() === q)
  if (exact.length === 1) return { match: exact[0], candidates: exact }
  const contains = rows.filter(r => (r.name ?? '').toLowerCase().includes(q))
  if (contains.length === 1) return { match: contains[0], candidates: contains }
  return { candidates: contains }
}

// ── Postgres data functions (default-deps source; covered via tool tests with mock deps) ──

export interface ClientEconomicsRow {
  clientId: string
  name: string
  revenueCents: number
  passthroughCents: number
  laborCents: number
  hours: number
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Per-client revenue − pass-through + labor for the period. Returns [] if no Xero tenant is selected. */
export async function fetchClientEconomics(event: H3Event, period: Period): Promise<ClientEconomicsRow[]> {
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) return []
  const { start, end, mediaPeriods } = periodBounds(period)

  const revenue = await queryRows<{ client_id: string, name: string, revenue_cents: string }>(
    `SELECT ac.id AS client_id, ac.name AS name,
            COALESCE(SUM(ic.total_cents), 0)::text AS revenue_cents
       FROM agency_clients ac
       LEFT JOIN xero_invoices_cache ic
         ON ic.contact_id = ac.xero_contact_id
        AND ic.tenant_id = $1
        AND ic.type = 'ACCREC'
        AND ic.status NOT IN ('VOIDED','DRAFT','DELETED')
        AND ic.date BETWEEN $2::date AND $3::date
      GROUP BY ac.id, ac.name`,
    [tenantId, start, end],
  )

  const passthrough = await queryRows<{ client_id: string, passthrough_cents: string }>(
    `SELECT client_id, COALESCE(SUM(actual_spend) * 100, 0)::bigint::text AS passthrough_cents
       FROM media_spend
      WHERE period = ANY($1::text[])
      GROUP BY client_id`,
    [mediaPeriods],
  )
  const ptMap = new Map(passthrough.map(r => [r.client_id, num(r.passthrough_cents)]))

  const labor = await queryRows<{ client_id: string, labor_cents: string, hours: string }>(
    `SELECT p.client_id,
            COALESCE(SUM(te.hours * te.hourly_rate) * 100, 0)::bigint::text AS labor_cents,
            COALESCE(SUM(te.hours), 0)::text AS hours
       FROM time_entries te
       JOIN projects p ON te.project_id = p.id
      WHERE te.date BETWEEN $1::date AND $2::date
      GROUP BY p.client_id`,
    [start, end],
  )
  const laborMap = new Map(labor.map(r => [r.client_id, { cents: num(r.labor_cents), hours: num(r.hours) }]))

  return revenue.map(r => ({
    clientId: r.client_id,
    name: r.name,
    revenueCents: num(r.revenue_cents),
    passthroughCents: ptMap.get(r.client_id) ?? 0,
    laborCents: laborMap.get(r.client_id)?.cents ?? 0,
    hours: laborMap.get(r.client_id)?.hours ?? 0,
  }))
}

export interface RetainerRow { clientId: string, name: string, capDollars: number, billingType: string }

/** Clients on a retainer/hybrid plan with a positive cap. The cap is the v1 scope baseline. */
export async function fetchRetainerCaps(): Promise<RetainerRow[]> {
  const rows = await queryRows<{ client_id: string, name: string, cap: string, billing_type: string }>(
    `SELECT id AS client_id, name, COALESCE(retainer_amount, 0)::text AS cap, billing_type
       FROM agency_clients
      WHERE billing_type IN ('retainer','hybrid') AND COALESCE(retainer_amount, 0) > 0`,
  )
  return rows.map(r => ({ clientId: r.client_id, name: r.name, capDollars: num(r.cap), billingType: r.billing_type }))
}

export interface ProjectLaborRow { project: string, deliveredValue: number }

/** Labor $ by project for one client over the period — powers the over-servicing deep-dive. */
export async function fetchClientProjectLabor(clientId: string, period: Period): Promise<ProjectLaborRow[]> {
  const { start, end } = periodBounds(period)
  const rows = await queryRows<{ project_name: string, labor_dollars: string }>(
    `SELECT p.name AS project_name,
            COALESCE(SUM(te.hours * te.hourly_rate), 0)::text AS labor_dollars
       FROM time_entries te
       JOIN projects p ON te.project_id = p.id
      WHERE p.client_id = $1 AND te.date BETWEEN $2::date AND $3::date
      GROUP BY p.name
      ORDER BY 2 DESC`,
    [clientId, start, end],
  )
  return rows.map(r => ({ project: r.project_name, deliveredValue: Math.round(num(r.labor_dollars) * 100) / 100 }))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run test/ai/tools/economics.test.ts`
Expected: PASS (7 assertions).

- [ ] **Step 5: Commit**

```bash
git add server/utils/ai/tools/economics.ts test/ai/tools/economics.test.ts
git commit -m "feat(ai): shared economics helpers for Slice-2 margin tools"
```

---

## Task 2: `get_client_profitability`

**Files:**
- Create: `server/utils/ai/tools/profitability.ts`
- Test: `test/ai/tools/profitability.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/ai/tools/profitability.test.ts
import { describe, it, expect, vi } from 'vitest'
import { getClientProfitability, type ProfitabilityDeps } from '~~/server/utils/ai/tools/profitability'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import type { ClientEconomicsRow } from '~~/server/utils/ai/tools/economics'

const ctx: ToolContext = { userId: 'u1', userRole: 'owner', event: {} as any }

const rows: ClientEconomicsRow[] = [
  { clientId: 'a', name: 'Acme', revenueCents: 10000_00, passthroughCents: 2000_00, laborCents: 3000_00, hours: 100 },
  { clientId: 'b', name: 'Globex', revenueCents: 5000_00, passthroughCents: 0, laborCents: 4500_00, hours: 120 },
  { clientId: 'c', name: 'Initech', revenueCents: 0, passthroughCents: 0, laborCents: 0, hours: 0 },
]
const deps = (over: Partial<ProfitabilityDeps> = {}): ProfitabilityDeps => ({
  fetchEconomics: vi.fn().mockResolvedValue(rows),
  ...over,
})

describe('get_client_profitability', () => {
  it('portfolio: ranks by delivery margin and reports concentration', async () => {
    const res = await getClientProfitability({ period: 'mtd' }, ctx, deps())
    expect(res.ok).toBe(true)
    const d = (res as any).data
    // Acme AGI=8000, margin=(8000-3000)/8000=62.5 ; Globex AGI=5000, margin=(5000-4500)/5000=10
    expect(d.topByMargin[0].client).toBe('Acme')
    expect(d.topByMargin[0].marginPct).toBe(62.5)
    expect(d.bottomByMargin[0].client).toBe('Globex')
    expect(d.agencyConcentration.top5Pct).toBe(100) // 3 clients → all share
  })

  it('deep-dive: a named client returns its margin breakdown', async () => {
    const res = await getClientProfitability({ clientName: 'acme', period: 'mtd' }, ctx, deps())
    const d = (res as any).data
    expect(d.client).toBe('Acme')
    expect(d.revenue).toBe(10000)
    expect(d.agi).toBe(8000)
    expect(d.deliveryMarginPct).toBe(62.5)
  })

  it('ambiguous name → disambiguation list, no numbers leaked', async () => {
    const amb: ClientEconomicsRow[] = [
      { clientId: 'a', name: 'Acme Corp', revenueCents: 0, passthroughCents: 0, laborCents: 0, hours: 0 },
      { clientId: 'b', name: 'Acme Media', revenueCents: 0, passthroughCents: 0, laborCents: 0, hours: 0 },
    ]
    const res = await getClientProfitability({ clientName: 'acme' }, ctx, deps({ fetchEconomics: vi.fn().mockResolvedValue(amb) }))
    const d = (res as any).data
    expect(d.disambiguation).toEqual(['Acme Corp', 'Acme Media'])
  })

  it('no match → ok note (not an error)', async () => {
    const res = await getClientProfitability({ clientName: 'zzz' }, ctx, deps())
    expect(res.ok).toBe(true)
    expect((res as any).data.note).toMatch(/no client/i)
  })

  it('no data (no Xero tenant) → ok note', async () => {
    const res = await getClientProfitability({}, ctx, deps({ fetchEconomics: vi.fn().mockResolvedValue([]) }))
    expect(res.ok).toBe(true)
    expect((res as any).data.note).toMatch(/no/i)
  })

  it('source failure → recoverable error, never throws', async () => {
    const res = await getClientProfitability({}, ctx, deps({ fetchEconomics: vi.fn().mockRejectedValue(new Error('db down')) }))
    expect(res.ok).toBe(false)
    expect((res as any).error).toMatch(/profitab/i)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run test/ai/tools/profitability.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `profitability.ts`**

```typescript
// server/utils/ai/tools/profitability.ts
import { z } from 'zod'
import type { H3Event } from 'h3'
import type { AiTool } from '../toolRegistry'
import { ok, fail, type ToolContext, type ToolResult } from '../toolContext'
import { fetchClientEconomics, resolveByName, type ClientEconomicsRow, type Period } from './economics'

const params = z.object({
  clientName: z.string().optional(),
  period: z.enum(['mtd', 'ytd']).default('mtd'),
})
type Args = z.infer<typeof params>

export type ProfitabilityDeps = {
  fetchEconomics: (event: H3Event, period: Period) => Promise<ClientEconomicsRow[]>
}
const defaultDeps: ProfitabilityDeps = { fetchEconomics: fetchClientEconomics }

const round1 = (n: number) => Math.round(n * 10) / 10

type Computed = { client: string, revenue: number, passthrough: number, agi: number, laborCost: number, deliveryMarginPct: number | null }

function compute(r: ClientEconomicsRow): Computed {
  const revenue = r.revenueCents / 100
  const passthrough = r.passthroughCents / 100
  const agi = revenue - passthrough
  const laborCost = r.laborCents / 100
  return {
    client: r.name,
    revenue: Math.round(revenue * 100) / 100,
    passthrough: Math.round(passthrough * 100) / 100,
    agi: Math.round(agi * 100) / 100,
    laborCost: Math.round(laborCost * 100) / 100,
    deliveryMarginPct: agi > 0 ? round1(((agi - laborCost) / agi) * 100) : null,
  }
}

export async function getClientProfitability(args: Args, ctx: ToolContext, deps: ProfitabilityDeps = defaultDeps): Promise<ToolResult> {
  try {
    const rows = await deps.fetchEconomics(ctx.event, args.period)
    if (rows.length === 0) return ok({ period: args.period, note: 'No client financial data available — Xero may be disconnected or the invoice cache is empty.' })

    if (args.clientName) {
      const { match, candidates } = resolveByName(rows, args.clientName)
      if (!match) {
        if (candidates.length > 1) return ok({ disambiguation: candidates.map(c => c.name) })
        return ok({ note: `No client matching "${args.clientName}".` })
      }
      const c = compute(match)
      const totalRev = rows.reduce((s, r) => s + r.revenueCents, 0)
      const sharePct = totalRev > 0 ? round1((match.revenueCents / totalRev) * 100) : 0
      return ok({ period: args.period, ...c, sharePct })
    }

    const computed = rows.map(compute)
    const totalRev = rows.reduce((s, r) => s + r.revenueCents, 0)
    const byRevDesc = [...rows].sort((a, b) => b.revenueCents - a.revenueCents)
    const shareOfTop = (n: number) =>
      totalRev > 0 ? round1((byRevDesc.slice(0, n).reduce((s, r) => s + r.revenueCents, 0) / totalRev) * 100) : 0
    const ranked = computed.filter(c => c.deliveryMarginPct != null).sort((a, b) => b.deliveryMarginPct! - a.deliveryMarginPct!)

    return ok({
      period: args.period,
      topByMargin: ranked.slice(0, 5).map(({ client, revenue, agi, deliveryMarginPct }) => ({ client, revenue, agi, marginPct: deliveryMarginPct })),
      bottomByMargin: ranked.slice(-5).reverse().map(({ client, revenue, agi, deliveryMarginPct }) => ({ client, revenue, agi, marginPct: deliveryMarginPct })),
      agencyConcentration: { top5Pct: shareOfTop(5), top10Pct: shareOfTop(10) },
      more: Math.max(0, ranked.length - 5),
    })
  } catch {
    return fail('Could not compute client profitability — the financial data may be unavailable.')
  }
}

export const profitabilityTool: AiTool<Args> = {
  name: 'get_client_profitability',
  description: 'Per-client profitability: Agency Gross Income (revenue minus pass-through media) and delivery margin % (AGI minus labor cost, over AGI). Name a client for a deep-dive, or omit clientName for a portfolio ranking (most/least profitable + revenue concentration). Use for "which clients make us money / is Acme profitable / who has the worst margin". Returns compact numbers only. Do NOT use for cash position (use get_finance_snapshot) or ad-spend pacing.',
  parameters: params,
  requiredPermission: 'FINANCE',
  returnsUntrusted: false,
  handler: (a, c) => getClientProfitability(a, c),
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run test/ai/tools/profitability.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/ai/tools/profitability.ts test/ai/tools/profitability.test.ts
git commit -m "feat(ai): get_client_profitability tool"
```

---

## Task 3: `monitor_retainer_burn`

**Files:**
- Create: `server/utils/ai/tools/retainerBurn.ts`
- Test: `test/ai/tools/retainerBurn.test.ts`

`elapsedFraction` (how far through the month we are) is an injectable dep so projection logic is deterministic in tests.

- [ ] **Step 1: Write the failing test**

```typescript
// test/ai/tools/retainerBurn.test.ts
import { describe, it, expect, vi } from 'vitest'
import { monitorRetainerBurn, type RetainerBurnDeps } from '~~/server/utils/ai/tools/retainerBurn'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import type { ClientEconomicsRow, RetainerRow } from '~~/server/utils/ai/tools/economics'

const ctx: ToolContext = { userId: 'u1', userRole: 'finance', event: {} as any }

const retainers: RetainerRow[] = [
  { clientId: 'a', name: 'Acme', capDollars: 10000, billingType: 'retainer' },
  { clientId: 'b', name: 'Globex', capDollars: 5000, billingType: 'hybrid' },
]
const econ: ClientEconomicsRow[] = [
  { clientId: 'a', name: 'Acme', revenueCents: 0, passthroughCents: 0, laborCents: 4000_00, hours: 80 },  // 40% burn
  { clientId: 'b', name: 'Globex', revenueCents: 0, passthroughCents: 0, laborCents: 6000_00, hours: 90 }, // 120% burn → over
]
const deps = (over: Partial<RetainerBurnDeps> = {}): RetainerBurnDeps => ({
  fetchRetainers: vi.fn().mockResolvedValue(retainers),
  fetchEconomics: vi.fn().mockResolvedValue(econ),
  elapsedFraction: vi.fn().mockReturnValue(0.5), // halfway through the month
  ...over,
})

describe('monitor_retainer_burn', () => {
  it('portfolio: surfaces over-pace clients', async () => {
    const res = await monitorRetainerBurn({ period: 'mtd' }, ctx, deps())
    const d = (res as any).data
    expect(d.summary.count).toBe(2)
    expect(d.summary.overCount).toBe(1)
    expect(d.atRisk.find((x: any) => x.client === 'Globex').pace).toBe('over')
  })

  it('deep-dive: burn %, pace and projected end-of-period', async () => {
    const res = await monitorRetainerBurn({ clientName: 'acme', period: 'mtd' }, ctx, deps())
    const d = (res as any).data
    expect(d.client).toBe('Acme')
    expect(d.burnPct).toBe(40)
    expect(d.pace).toBe('under')               // 40% spent at 50% elapsed
    expect(d.projectedEndOfPeriod).toBe(8000)  // 4000 / 0.5
    expect(d.hoursLogged).toBe(80)
  })

  it('named client with no retainer → ok note', async () => {
    const res = await monitorRetainerBurn({ clientName: 'initech' }, ctx, deps())
    expect(res.ok).toBe(true)
    expect((res as any).data.note).toMatch(/no active retainer/i)
  })

  it('source failure → recoverable error', async () => {
    const res = await monitorRetainerBurn({}, ctx, deps({ fetchRetainers: vi.fn().mockRejectedValue(new Error('x')) }))
    expect(res.ok).toBe(false)
    expect((res as any).error).toMatch(/retainer/i)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run test/ai/tools/retainerBurn.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `retainerBurn.ts`**

```typescript
// server/utils/ai/tools/retainerBurn.ts
import { z } from 'zod'
import type { H3Event } from 'h3'
import type { AiTool } from '../toolRegistry'
import { ok, fail, type ToolContext, type ToolResult } from '../toolContext'
import { fetchClientEconomics, fetchRetainerCaps, resolveByName, type ClientEconomicsRow, type RetainerRow } from './economics'

const params = z.object({
  clientName: z.string().optional(),
  period: z.enum(['mtd']).default('mtd'),
})
type Args = z.infer<typeof params>

export type RetainerBurnDeps = {
  fetchRetainers: () => Promise<RetainerRow[]>
  fetchEconomics: (event: H3Event, period: 'mtd') => Promise<ClientEconomicsRow[]>
  /** Fraction of the current month elapsed (0..1) — injected for deterministic projection. */
  elapsedFraction: () => number
}

function monthElapsedFraction(now: Date = new Date()): number {
  const y = now.getUTCFullYear(); const m = now.getUTCMonth()
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return Math.min(1, Math.max(0.01, now.getUTCDate() / daysInMonth))
}

const defaultDeps: RetainerBurnDeps = {
  fetchRetainers: fetchRetainerCaps,
  fetchEconomics: (event, period) => fetchClientEconomics(event, period),
  elapsedFraction: () => monthElapsedFraction(),
}

const round = (n: number) => Math.round(n * 100) / 100
type Pace = 'under' | 'on' | 'over'

function paceOf(burnPct: number, elapsedPct: number): Pace {
  if (burnPct > elapsedPct + 10) return 'over'
  if (burnPct < elapsedPct - 10) return 'under'
  return 'on'
}

export async function monitorRetainerBurn(args: Args, ctx: ToolContext, deps: RetainerBurnDeps = defaultDeps): Promise<ToolResult> {
  try {
    const [retainers, econ] = await Promise.all([deps.fetchRetainers(), deps.fetchEconomics(ctx.event, 'mtd')])
    if (retainers.length === 0) return ok({ note: 'No clients on a retainer/hybrid plan with a cap on record.' })

    const consumedByClient = new Map(econ.map(e => [e.clientId, { consumed: e.laborCents / 100, hours: e.hours }]))
    const elapsed = deps.elapsedFraction()
    const elapsedPct = round(elapsed * 100)

    const rows = retainers.map((r) => {
      const c = consumedByClient.get(r.clientId) ?? { consumed: 0, hours: 0 }
      const burnPct = r.capDollars > 0 ? round((c.consumed / r.capDollars) * 100) : 0
      return {
        client: r.name,
        retainerCap: r.capDollars,
        consumed: round(c.consumed),
        burnPct,
        pace: paceOf(burnPct, elapsedPct),
        projectedEndOfPeriod: round(c.consumed / elapsed),
        hoursLogged: round(c.hours),
      }
    })

    if (args.clientName) {
      const { match, candidates } = resolveByName(retainers, args.clientName)
      if (!match) {
        if (candidates.length > 1) return ok({ disambiguation: candidates.map(c => c.name) })
        return ok({ note: `No active retainer on record for "${args.clientName}".` })
      }
      return ok(rows.find(x => x.client === match.name))
    }

    const atRisk = rows.filter(x => x.pace === 'over').sort((a, b) => b.burnPct - a.burnPct)
    return ok({
      period: 'mtd',
      elapsedPct,
      summary: { count: rows.length, overCount: atRisk.length },
      atRisk: atRisk.slice(0, 10).map(({ client, burnPct, pace }) => ({ client, burnPct, pace })),
      more: Math.max(0, atRisk.length - 10),
    })
  } catch {
    return fail('Could not compute retainer burn — retainer or time-tracking data may be unavailable.')
  }
}

export const retainerBurnTool: AiTool<Args> = {
  name: 'monitor_retainer_burn',
  description: 'How fast clients are consuming their monthly retainer: labor logged this month vs the retainer cap, with pace (under/on/over vs how far through the month we are) and a projected end-of-month spend. Name a client for a deep-dive, or omit clientName for the over-pacing watchlist. Use for "is Acme burning its retainer too fast / which retainers are over budget". Returns compact numbers only.',
  parameters: params,
  requiredPermission: 'FINANCE',
  returnsUntrusted: false,
  handler: (a, c) => monitorRetainerBurn(a, c),
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run test/ai/tools/retainerBurn.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/ai/tools/retainerBurn.ts test/ai/tools/retainerBurn.test.ts
git commit -m "feat(ai): monitor_retainer_burn tool"
```

---

## Task 4: `flag_over_servicing`

**Files:**
- Create: `server/utils/ai/tools/overServicing.ts`
- Test: `test/ai/tools/overServicing.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/ai/tools/overServicing.test.ts
import { describe, it, expect, vi } from 'vitest'
import { flagOverServicing, type OverServicingDeps } from '~~/server/utils/ai/tools/overServicing'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import type { ClientEconomicsRow, RetainerRow, ProjectLaborRow } from '~~/server/utils/ai/tools/economics'

const ctx: ToolContext = { userId: 'u1', userRole: 'finance', event: {} as any }

const retainers: RetainerRow[] = [
  { clientId: 'a', name: 'Acme', capDollars: 10000, billingType: 'retainer' },
  { clientId: 'b', name: 'Globex', capDollars: 5000, billingType: 'retainer' },
]
const econ: ClientEconomicsRow[] = [
  { clientId: 'a', name: 'Acme', revenueCents: 0, passthroughCents: 0, laborCents: 8000_00, hours: 100 },  // 80% util
  { clientId: 'b', name: 'Globex', revenueCents: 0, passthroughCents: 0, laborCents: 6500_00, hours: 90 },  // 130% util → over
]
const deps = (over: Partial<OverServicingDeps> = {}): OverServicingDeps => ({
  fetchRetainers: vi.fn().mockResolvedValue(retainers),
  fetchEconomics: vi.fn().mockResolvedValue(econ),
  fetchProjectLabor: vi.fn<[string, any], Promise<ProjectLaborRow[]>>().mockResolvedValue([{ project: 'Retainer BAU', deliveredValue: 6500 }]),
  ...over,
})

describe('flag_over_servicing', () => {
  it('portfolio: flags clients over the threshold (default 100% of scope)', async () => {
    const res = await flagOverServicing({}, ctx, deps())
    const d = (res as any).data
    expect(d.flagged.map((f: any) => f.client)).toEqual(['Globex'])
    expect(d.flagged[0].overByPct).toBe(30) // 130% - 100%
  })

  it('custom threshold widens the flag set', async () => {
    const res = await flagOverServicing({ thresholdPct: 75 }, ctx, deps())
    const d = (res as any).data
    expect(d.flagged.map((f: any) => f.client)).toEqual(['Globex', 'Acme']) // sorted by overage desc
  })

  it('deep-dive: scope vs delivered + top projects', async () => {
    const res = await flagOverServicing({ clientName: 'globex' }, ctx, deps())
    const d = (res as any).data
    expect(d.client).toBe('Globex')
    expect(d.scopeValue).toBe(5000)
    expect(d.deliveredValue).toBe(6500)
    expect(d.overByAmount).toBe(1500)
    expect(d.topProjects[0].project).toBe('Retainer BAU')
  })

  it('named client with no scope baseline → ok note', async () => {
    const res = await flagOverServicing({ clientName: 'initech' }, ctx, deps())
    expect(res.ok).toBe(true)
    expect((res as any).data.note).toMatch(/no scope baseline/i)
  })

  it('source failure → recoverable error', async () => {
    const res = await flagOverServicing({}, ctx, deps({ fetchEconomics: vi.fn().mockRejectedValue(new Error('x')) }))
    expect(res.ok).toBe(false)
    expect((res as any).error).toMatch(/over-servicing/i)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run test/ai/tools/overServicing.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `overServicing.ts`**

```typescript
// server/utils/ai/tools/overServicing.ts
import { z } from 'zod'
import type { H3Event } from 'h3'
import type { AiTool } from '../toolRegistry'
import { ok, fail, type ToolContext, type ToolResult } from '../toolContext'
import {
  fetchClientEconomics, fetchRetainerCaps, fetchClientProjectLabor, resolveByName,
  type ClientEconomicsRow, type RetainerRow, type ProjectLaborRow, type Period,
} from './economics'

const params = z.object({
  clientName: z.string().optional(),
  thresholdPct: z.number().min(1).max(500).default(100),
})
type Args = z.infer<typeof params>

export type OverServicingDeps = {
  fetchRetainers: () => Promise<RetainerRow[]>
  fetchEconomics: (event: H3Event, period: Period) => Promise<ClientEconomicsRow[]>
  fetchProjectLabor: (clientId: string, period: Period) => Promise<ProjectLaborRow[]>
}
const defaultDeps: OverServicingDeps = {
  fetchRetainers: fetchRetainerCaps,
  fetchEconomics: fetchClientEconomics,
  fetchProjectLabor: fetchClientProjectLabor,
}

const round = (n: number) => Math.round(n * 100) / 100

export async function flagOverServicing(args: Args, ctx: ToolContext, deps: OverServicingDeps = defaultDeps): Promise<ToolResult> {
  try {
    const [retainers, econ] = await Promise.all([deps.fetchRetainers(), deps.fetchEconomics(ctx.event, 'mtd')])
    if (retainers.length === 0) return ok({ note: 'No clients with a scope baseline (retainer cap) on record.' })

    const deliveredByClient = new Map(econ.map(e => [e.clientId, e.laborCents / 100]))
    const computed = retainers.map((r) => {
      const delivered = deliveredByClient.get(r.clientId) ?? 0
      const utilizationPct = r.capDollars > 0 ? (delivered / r.capDollars) * 100 : 0
      return {
        clientId: r.clientId,
        client: r.name,
        scopeValue: r.capDollars,
        deliveredValue: round(delivered),
        utilizationPct: round(utilizationPct),
        overByPct: round(utilizationPct - 100),
        overByAmount: round(delivered - r.capDollars),
      }
    })

    if (args.clientName) {
      const { match, candidates } = resolveByName(retainers, args.clientName)
      if (!match) {
        if (candidates.length > 1) return ok({ disambiguation: candidates.map(c => c.name) })
        return ok({ note: `No scope baseline on record for "${args.clientName}".` })
      }
      const c = computed.find(x => x.clientId === match.clientId)!
      const topProjects = await deps.fetchProjectLabor(match.clientId, 'mtd')
      const { clientId, ...rest } = c
      return ok({ ...rest, topProjects: topProjects.slice(0, 5) })
    }

    const flagged = computed
      .filter(c => c.utilizationPct >= args.thresholdPct)
      .sort((a, b) => b.overByPct - a.overByPct)
    return ok({
      threshold: args.thresholdPct,
      flagged: flagged.slice(0, 10).map(({ client, overByPct, deliveredValue, scopeValue }) => ({ client, overByPct, deliveredValue, scopeValue })),
      more: Math.max(0, flagged.length - 10),
    })
  } catch {
    return fail('Could not assess over-servicing — time-tracking or retainer data may be unavailable.')
  }
}

export const overServicingTool: AiTool<Args> = {
  name: 'flag_over_servicing',
  description: 'Where the agency is delivering more labor than a client\'s retainer covers: labor value logged this month vs the retainer cap (the scope baseline). Name a client for a deep-dive (scope vs delivered + top projects), or omit clientName for the over-serviced watchlist (thresholdPct defaults to 100% of scope). Use for "where are we over-servicing / is Globex over scope". Returns compact numbers only.',
  parameters: params,
  requiredPermission: 'FINANCE',
  returnsUntrusted: false,
  handler: (a, c) => flagOverServicing(a, c),
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run test/ai/tools/overServicing.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/ai/tools/overServicing.ts test/ai/tools/overServicing.test.ts
git commit -m "feat(ai): flag_over_servicing tool"
```

---

## Task 5: `forecast_revenue`

**Files:**
- Create: `server/utils/ai/tools/revenueForecast.ts`
- Test: `test/ai/tools/revenueForecast.test.ts`

This tool reuses the live `get-out/forecast` and `get-out/pipeline-coverage` endpoints (they make live Xero calls). Default deps use the Nitro global `$fetch` with the caller's headers forwarded; tests inject mock deps. The mock responses below mirror the real return shapes of those endpoints.

- [ ] **Step 1: Write the failing test**

```typescript
// test/ai/tools/revenueForecast.test.ts
import { describe, it, expect, vi } from 'vitest'
import { forecastRevenue, type ForecastDeps } from '~~/server/utils/ai/tools/revenueForecast'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx: ToolContext = { userId: 'u1', userRole: 'finance', event: { headers: {} } as any }

// Mirrors server/api/xero/get-out/forecast.get.ts return shape.
const forecastResp = {
  target: 200000,
  layers: { invoiced: 120000, arCollectible: 40000, recurring: 25000, quotesProbable: 10000 },
  leakage: { total: 5000, creditNotes: 3000, creditNotesCount: 2, voidedInvoices: 2000 },
  totalProjected: 190000, gap: 10000, surplus: 0, onTrack: false,
}
// Mirrors server/api/xero/get-out/pipeline-coverage.get.ts return shape.
const coverageResp = {
  quarterlyTarget: 600000,
  pipeline: { totalFace: 900000, totalWeighted: 720000 },
  coverage: { face: 1.5, weighted: 1.2, band: 'low' },
}
const deps = (over: Partial<ForecastDeps> = {}): ForecastDeps => ({
  fetchForecast: vi.fn().mockResolvedValue(forecastResp),
  fetchCoverage: vi.fn().mockResolvedValue(coverageResp),
  ...over,
})

describe('forecast_revenue', () => {
  it('month (default): maps the month-end landing layers', async () => {
    const res = await forecastRevenue({ horizon: 'month' }, ctx, deps())
    const d = (res as any).data
    expect(d.horizon).toBe('month')
    expect(d.projected).toBe(190000)
    expect(d.invoiced).toBe(120000)
    expect(d.quotesProbable).toBe(10000)
    expect(d.leakage).toBe(5000)
    expect(d.onTrack).toBe(false)
  })

  it('quarter: maps pipeline coverage', async () => {
    const res = await forecastRevenue({ horizon: 'quarter' }, ctx, deps())
    const d = (res as any).data
    expect(d.horizon).toBe('quarter')
    expect(d.coverageWeighted).toBe(1.2)
    expect(d.band).toBe('low')
    expect(d.quarterlyTarget).toBe(600000)
  })

  it('Xero failure → recoverable error', async () => {
    const res = await forecastRevenue({ horizon: 'month' }, ctx, deps({ fetchForecast: vi.fn().mockRejectedValue(new Error('xero down')) }))
    expect(res.ok).toBe(false)
    expect((res as any).error).toMatch(/forecast/i)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run test/ai/tools/revenueForecast.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `revenueForecast.ts`**

```typescript
// server/utils/ai/tools/revenueForecast.ts
import { z } from 'zod'
import type { AiTool } from '../toolRegistry'
import { ok, fail, type ToolContext, type ToolResult } from '../toolContext'

const params = z.object({
  horizon: z.enum(['month', 'quarter']).default('month'),
})
type Args = z.infer<typeof params>

export type ForecastDeps = {
  fetchForecast: (ctx: ToolContext) => Promise<any>
  fetchCoverage: (ctx: ToolContext) => Promise<any>
}

// Nitro global $fetch (auto-imported in the server runtime). Preferred over `import {$fetch} from 'ofetch'`
// because raw ofetch relative URLs failed on CF Workers (PR #129). Forward the caller's headers so Xero
// connection + tenant resolve in the endpoint.
const $f = (globalThis as any).$fetch as <T>(url: string, opts?: any) => Promise<T>
const defaultDeps: ForecastDeps = {
  fetchForecast: ctx => $f('/api/xero/get-out/forecast', { headers: (ctx.event as any).headers }),
  fetchCoverage: ctx => $f('/api/xero/get-out/pipeline-coverage', { headers: (ctx.event as any).headers }),
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

export async function forecastRevenue(args: Args, ctx: ToolContext, deps: ForecastDeps = defaultDeps): Promise<ToolResult> {
  try {
    if (args.horizon === 'quarter') {
      const c = await deps.fetchCoverage(ctx)
      return ok({
        horizon: 'quarter',
        quarterlyTarget: num(c?.quarterlyTarget),
        pipelineOpen: num(c?.pipeline?.totalWeighted),
        coverageFace: c?.coverage?.face ?? null,
        coverageWeighted: c?.coverage?.weighted ?? null,
        band: c?.coverage?.band ?? 'unknown',
      })
    }
    const f = await deps.fetchForecast(ctx)
    return ok({
      horizon: 'month',
      target: num(f?.target),
      invoiced: num(f?.layers?.invoiced),
      arCollectible: num(f?.layers?.arCollectible),
      recurring: num(f?.layers?.recurring),
      quotesProbable: num(f?.layers?.quotesProbable),
      leakage: num(f?.leakage?.total),
      projected: num(f?.totalProjected),
      gap: num(f?.gap),
      surplus: num(f?.surplus),
      onTrack: Boolean(f?.onTrack),
    })
  } catch {
    return fail('Could not load the revenue forecast — Xero may be disconnected.')
  }
}

export const revenueForecastTool: AiTool<Args> = {
  name: 'forecast_revenue',
  description: 'Where revenue is heading. horizon="month" projects month-end landing (invoiced + collectible AR + recurring + weighted quotes, minus leakage) vs the Get-Out target. horizon="quarter" gives 90-day pipeline coverage (open pipeline / quarterly target + a health band). Use for "are we going to hit target / what\'s our pipeline coverage / month-end revenue forecast". Returns compact numbers only.',
  parameters: params,
  requiredPermission: 'FINANCE',
  returnsUntrusted: false,
  handler: (a, c) => forecastRevenue(a, c),
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run test/ai/tools/revenueForecast.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/ai/tools/revenueForecast.ts test/ai/tools/revenueForecast.test.ts
git commit -m "feat(ai): forecast_revenue tool"
```

---

## Task 6: Register the 4 tools

**Files:**
- Modify: `server/utils/ai/tools/index.ts`
- Test: `test/ai/registry.assembly.test.ts`

- [ ] **Step 1: Update the assembly test to expect 14 tools incl. the new names**

First read the current expectations: `pnpm exec cat test/ai/registry.assembly.test.ts` is not needed — edit by adding assertions. Append inside the existing `describe`:

```typescript
// test/ai/registry.assembly.test.ts  (add to the existing suite)
import { registry } from '~~/server/utils/ai/tools'

it('includes the Slice-2 margin & forecasting tools', () => {
  const names = registry.map(t => t.name)
  for (const n of ['get_client_profitability', 'monitor_retainer_burn', 'flag_over_servicing', 'forecast_revenue']) {
    expect(names).toContain(n)
  }
})

it('Slice-2 tools are FINANCE-gated read tools (not mutating)', () => {
  const slice2 = registry.filter(t => ['get_client_profitability', 'monitor_retainer_burn', 'flag_over_servicing', 'forecast_revenue'].includes(t.name))
  expect(slice2).toHaveLength(4)
  for (const t of slice2) {
    expect(t.requiredPermission).toBe('FINANCE')
    expect(t.mutates).toBeFalsy()
  }
})
```

> If `registry.assembly.test.ts` asserts an exact registry length (e.g. `toHaveLength(10)`), update that number to `14`.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run test/ai/registry.assembly.test.ts`
Expected: FAIL — names not found (and/or length mismatch).

- [ ] **Step 3: Register the tools in `index.ts`**

```typescript
// server/utils/ai/tools/index.ts — add imports after the existing ones
import { profitabilityTool } from './profitability'
import { retainerBurnTool } from './retainerBurn'
import { overServicingTool } from './overServicing'
import { revenueForecastTool } from './revenueForecast'
```

```typescript
// ...and add to the registry array, after briefsTool (keep create_task last):
export const registry: AiTool<any>[] = [
  financeTool,
  adspendTool,
  tasksTool,
  projectsTool,
  anomaliesTool,
  clientOverviewTool,
  knowledgeTool,
  socialTool,
  briefsTool,
  profitabilityTool,
  retainerBurnTool,
  overServicingTool,
  revenueForecastTool,
  createTaskTool,
]
```

Update the file's `/** ... 9 read tools + 1 write tool */` comment to `13 read tools + 1 write tool (create_task), Slices 1–2.`

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run test/ai/registry.assembly.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/ai/tools/index.ts test/ai/registry.assembly.test.ts
git commit -m "feat(ai): register Slice-2 margin & forecasting tools"
```

---

## Task 7: Add the 4 tools to the Finance persona

**Files:**
- Modify: `server/utils/ai/personas.ts`
- Test: `test/ai/personas.test.ts`

- [ ] **Step 1: Add a failing assertion**

```typescript
// test/ai/personas.test.ts  (add to the existing suite)
import { PERSONAS } from '~~/server/utils/ai/personas'

it('the Finance persona includes the Slice-2 margin & forecasting tools', () => {
  const allow = PERSONAS.finance!.toolAllowlist ?? []
  for (const n of ['get_client_profitability', 'monitor_retainer_burn', 'flag_over_servicing', 'forecast_revenue']) {
    expect(allow).toContain(n)
  }
})
```

> The existing persona test already asserts every allowlisted name exists in the registry — Task 6 must land first so these names resolve.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run test/ai/personas.test.ts`
Expected: FAIL — names not in the finance allowlist.

- [ ] **Step 3: Extend the finance allowlist**

```typescript
// server/utils/ai/personas.ts — replace the finance persona's toolAllowlist line with:
    toolAllowlist: [
      'get_finance_snapshot', 'get_adspend_pacing', 'get_open_anomalies', 'get_client_overview',
      'get_client_profitability', 'monitor_retainer_burn', 'flag_over_servicing', 'forecast_revenue',
      ...COMMON,
    ],
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run test/ai/personas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/ai/personas.ts test/ai/personas.test.ts
git commit -m "feat(ai): add margin & forecasting tools to the Finance persona"
```

---

## Task 8: Loop tool-selection tests

**Files:**
- Modify: `test/ai/toolLoop.test.ts`

Verify the loop actually selects a Slice-2 tool for a finance question and stays hands-off for chit-chat, using the existing mock-model harness.

- [ ] **Step 1: Read the existing mock-model pattern**

Run: `pnpm exec vitest run test/ai/toolLoop.test.ts`
Then open `test/ai/toolLoop.test.ts` and note how it builds the mock language model (the project uses a `MockLanguageModelV3`-style mock) and how it asserts a tool was called. Mirror that exact construction for the two cases below (do not invent a new mock shape).

- [ ] **Step 2: Add a positive + negative selection case**

```typescript
// test/ai/toolLoop.test.ts  (add to the existing suite, mirroring the file's mock-model setup)
it('routes a profitability question to get_client_profitability', async () => {
  // Build the mock model to emit a tool-call for 'get_client_profitability' on the first step,
  // then a final text answer — following this file's existing mock pattern.
  // Assert the get_client_profitability handler/tool was invoked.
})

it('does NOT call a tool for chit-chat', async () => {
  // Mock model returns a plain text answer with no tool-call.
  // Assert no tool was invoked.
})
```

> These two cases follow the existing toolLoop test scaffold exactly; fill the bodies from the pattern read in Step 1 (same mock-model constructor, same invocation entrypoint, same assertion style as the shipped Slice-1 loop tests).

- [ ] **Step 3: Run the loop tests**

Run: `pnpm exec vitest run test/ai/toolLoop.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add test/ai/toolLoop.test.ts
git commit -m "test(ai): loop selects Slice-2 finance tools, skips chit-chat"
```

---

## Task 9: Marketing-page sync

**Files:**
- Modify: `app/pages/features/[slug].vue` (and `app/pages/features/index.vue` if the AI entry's summary lists capabilities)

- [ ] **Step 1: Locate the AI assistant feature entry (added/updated in PR #125)**

```bash
grep -rn "create_task\|tool-calling\|agentic\|AI assistant\|Agency Assistant" app/pages/features/ | head
```

Identify the AI assistant slug entry and its capability/bullets section.

- [ ] **Step 2: Add the four new capabilities to that entry's copy**

Append these truthful capability bullets to the AI assistant feature entry (match the surrounding array/section formatting exactly):

```
Ask which clients are most and least profitable (Agency Gross Income + delivery margin).
See how fast each client is burning its monthly retainer, with end-of-month projections.
Flag where the agency is over-servicing — labor delivered beyond the retainer scope.
Forecast month-end revenue and 90-day pipeline coverage against target.
```

If `app/pages/features/index.vue` shows a one-line summary for the AI feature, extend it to mention "client profitability and revenue forecasting" so counts/summaries stay truthful.

- [ ] **Step 3: Verify the pages build (typecheck happens in Task 10)**

Run: `pnpm exec vitest run test/ai` (sanity — no test regressions from doc edits)
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/pages/features/
git commit -m "docs(marketing): surface AI margin & forecasting capabilities"
```

---

## Task 10: Full typecheck + suite + green-build gate

**Files:** none (verification).

- [ ] **Step 1: Run the full AI test suite**

Run: `pnpm exec vitest run test/ai`
Expected: PASS — all Slice-1 + Slice-2 tests green.

- [ ] **Step 2: Typecheck (watch for the OOM gotcha)**

Run: `NODE_OPTIONS=--max-old-space-size=16384 pnpm exec nuxt typecheck`
Expected: 0 NEW errors over the documented baseline (~60 pre-existing + the 2 known `aiChatEngine.ts` GroqModel errors). If new errors appear, they are in Slice-2 files — fix before proceeding.

- [ ] **Step 3: Commit any typecheck fixes (if needed)**

```bash
git add -A
git commit -m "fix(ai): resolve Slice-2 typecheck findings"
```

---

## Task 11: UAT + deploy (operator gate)

**Files:** none. `AI_TOOLS_ENABLED` is already on and build-baked, so these tools go LIVE on the next prod deploy — UAT must precede it.

- [ ] **Step 1: Push the branch (adme-dev account) and open a PR**

```bash
git push -u origin feat/ai-tools-slice2   # requires the adme-dev gh account + `gh auth setup-git`
gh pr create --title "feat(ai): Slice 2 — margin & forecasting tools" --body "Implements docs/superpowers/specs/2026-06-07-ai-tool-calling-slice2-margin-forecasting-design.md"
```

- [ ] **Step 2: Request code review** (use superpowers:requesting-code-review or /code-review) and address findings.

- [ ] **Step 3: After merge, run live UAT via Kimi WebBridge** on Paul's authed prod session (Xero connected). Confirm each, as a FINANCE-permission user:
  - "Which clients are most and least profitable this month?" → `get_client_profitability` fires, real numbers.
  - "Is <client> burning its retainer too fast?" → `monitor_retainer_burn` deep-dive.
  - "Where are we over-servicing?" → `flag_over_servicing` watchlist.
  - "Are we going to hit target this month? What's our pipeline coverage?" → `forecast_revenue` month + quarter.
  - Switch to the **Finance persona** and confirm the 4 tools are offered.
  - As a non-finance role (e.g. creative), confirm the assistant does NOT expose these tools.

- [ ] **Step 4: Deploy from the clean prod worktree, flag baked on**

```bash
cd /Users/paulgiurin/Documents/Projects/dashboard/.worktrees/deploy-prod
git fetch origin && git checkout origin/main
pnpm install --frozen-lockfile
AI_TOOLS_ENABLED=true pnpm deploy:production
```

- [ ] **Step 5: Smoke-check prod** — `/agency/ai/chat` → 200, a finance question returns real numbers, cost row written to `ai_messages`.

- [ ] **Step 6: Worktree cleanup**

```bash
cd /Users/paulgiurin/Documents/Projects/dashboard
git worktree remove .worktrees/ai-slice2
```

---

## Self-Review (completed by plan author)

**Spec coverage:** all 4 tools (spec §5.1–5.4) → Tasks 2–5; wiring split (§4) → Task 1 + per-tool deps; FINANCE gating + agency-internal (§6) → tool defs + Task 6/7; untrusted/Rule-of-Two (§7) → `returnsUntrusted:false` on every tool; error/degradation (§8) → per-tool no-data/error tests; no migration (§9) → none added; testing (§10) → Tasks 1–8, 10; marketing (§11) → Task 9; rollout/branch/flag (§12) → Tasks 0, 11. Open questions §13.1/13.2 resolved in "Planning-time corrections"; §13.3 (freshness) and §13.4 (quarterly target = pipeline-coverage's configured monthly × 3, confirmed in `pipeline-coverage.get.ts`) noted.

**Deviations from spec (conscious):** (a) `get_client_profitability` is Postgres-direct not route-fetch; (b) `churnRisk` trimmed from the v1 deep-dive (separate insights table); (c) labor cost uses `time_entries.hourly_rate`, not `rate_cards`. All documented above.

**Placeholder scan:** Task 8 bodies reference the existing mock-model pattern rather than reproducing a mock shape that isn't in hand — flagged with an explicit "read Step 1" instruction; everything else is concrete code.

**Type consistency:** `ToolContext`/`ToolResult`/`ok`/`fail` from `toolContext`; `AiTool` from `toolRegistry`; `Period`/`ClientEconomicsRow`/`RetainerRow`/`ProjectLaborRow`/`NameMatch`/`resolveByName` defined in Task 1 and imported consistently in Tasks 2–5; `requiredPermission: 'FINANCE'` matches the `PermissionGroup` union.
