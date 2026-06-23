# Ops Autopilot — C2.1: Client Ad-Performance Report Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A scheduled, autonomous engine that builds a client's monthly paid-ads performance report (spend/CTR/CPC/CPA + MoM deltas + top campaigns) from `media_spend`, renders HTML→PDF, archives to R2, and emails recipients — reusing the existing social-report rails. Read-only with respect to ad platforms; the only side effects are a PDF in R2 + an email.

**Architecture:** Mirror the proven social-report pipeline (`processDueReports`): a new `ad_report_schedules` table, a **pure** model+HTML layer (unit-tested), an **injected-deps orchestrator** `processDueAdReports(db, deps)` (unit-tested with fakes), and a cron that wires the real deps (aggregation query, `renderReportPdf`, `uploadFile`, `sendAnalyticsReportEmail`). Gated by a new `AD_REPORTS_ENABLED` flag, default off.

**Tech Stack:** Nitro, Neon via `~~/server/utils/db`, existing `~~/server/utils/socialReporting/pdf` (CF Browser Rendering), `~~/server/utils/storage` (R2), `~~/server/utils/email`, Vitest.

## Global Constraints

- **No ad-platform writes.** Reads `media_spend`; writes only a PDF to R2 + sends email. Never calls a Meta/Google mutation.
- **Reuse the rails:** `renderReportPdf(event, html)` from `~~/server/utils/socialReporting/pdf`, `uploadFile(buffer, key, contentType)` from `~~/server/utils/storage`, `sendAnalyticsReportEmail({ event?, to, subject, html, reportUrl? })` from `~~/server/utils/email`. PDF gracefully degrades to HTML-only + archive link when the `BROWSER` binding is absent (mirror social).
- **Gate:** `AD_REPORTS_ENABLED === 'true'` (default off) — checked at the orchestrator entry, exactly like `isSocialReportsEnabled`.
- **Cadence:** monthly only (matches `media_spend.period` 'YYYY-MM'); the report covers the **previous complete month**, prior column = the month before. Weekly is out of scope (data granularity).
- **DB via `~~/server/utils/db` helpers, `$1` params; server imports `~~/server/utils/...`.**
- **Cron auth:** `x-cron-secret` == `process.env.CRON_SECRET` (dev-skip), mirroring `send-social-reports.post.ts`.
- **Migration:** `193` (highest in this branch is `192`; `190/191` are on other in-flight branches). Verify the next free number at execution; the number is ordering only. Run it against the DB after creating it.
- **Test command:** `pnpm -C <worktree> exec vitest run <file>`.

---

## File Structure

- `server/database/migrations/193_ad_report_schedules.sql` — **Create.** New schedule table (mirror `social_report_schedules`).
- `server/utils/adReporting/model.ts` — **Create.** Pure: aggregate `media_spend` rows → KPIs + MoM deltas + top campaigns.
- `server/utils/adReporting/html.ts` — **Create.** Pure: `buildAdReportHtml(model)` → HTML doc.
- `server/utils/adReporting/send.ts` — **Create.** `isAdReportsEnabled`, `isAdReportDue`, `processDueAdReports(db, deps)` (injected deps).
- `test/automation/adReporting.test.ts` — **Create.** Unit tests for model + due-check + orchestrator (with fakes).
- `server/api/cron/send-ad-reports.post.ts` — **Create.** Cron: wires real deps into `processDueAdReports`.

**Interfaces produced:** `AdSpendRow`, `AdReportKpis`, `AdReportModel`, `aggregateAdKpis`, `pctDelta`, `buildAdReportModel`, `buildAdReportHtml`, `isAdReportsEnabled`, `isAdReportDue`, `processDueAdReports`.

---

### Task 1: Migration — `ad_report_schedules`

**Files:** Create `server/database/migrations/193_ad_report_schedules.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Ops Autopilot C2.1 — schedules for automated client ad-performance reports.
-- Mirrors social_report_schedules (mig 154); additive + idempotent. Monthly cadence only.
CREATE TABLE IF NOT EXISTS ad_report_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cadence TEXT NOT NULL DEFAULT 'monthly',
  recipients TEXT[] NOT NULL DEFAULT '{}'::text[],
  platform TEXT,                                   -- null = all platforms
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_sent_at TIMESTAMPTZ,
  last_error TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_report_schedules_enabled ON ad_report_schedules(enabled);
CREATE INDEX IF NOT EXISTS idx_ad_report_schedules_client ON ad_report_schedules(client_id);
```

- [ ] **Step 2: Run it**

```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/193_ad_report_schedules.sql
```
Expected: `CREATE TABLE` + 2× `CREATE INDEX` (idempotent on rerun).

- [ ] **Step 3: Verify**

```bash
psql "$DATABASE_URL" -c "SELECT column_name FROM information_schema.columns WHERE table_name='ad_report_schedules' ORDER BY ordinal_position;"
```
Expected: id, client_id, name, cadence, recipients, platform, enabled, last_sent_at, last_error, created_by, created_at, updated_at.

- [ ] **Step 4: Commit**

```bash
git add server/database/migrations/193_ad_report_schedules.sql
git commit -m "feat(ops-autopilot): ad_report_schedules table (C2.1)"
```

---

### Task 2: Pure model + HTML (+ unit tests)

**Files:** Create `server/utils/adReporting/model.ts`, `server/utils/adReporting/html.ts`, `test/automation/adReporting.test.ts`

**Interfaces — Produces:**
- `AdSpendRow`, `AdReportKpis`, `AdReportModel`
- `aggregateAdKpis(rows): AdReportKpis`
- `pctDelta(cur, prior): number | null`
- `buildAdReportModel(input): AdReportModel`
- `buildAdReportHtml(model): string`

- [ ] **Step 1: Write the failing tests**

```typescript
// test/automation/adReporting.test.ts
import { describe, expect, it } from 'vitest'
import { aggregateAdKpis, pctDelta, buildAdReportModel } from '~~/server/utils/adReporting/model'
import { buildAdReportHtml } from '~~/server/utils/adReporting/html'

const rows = [
  { platform: 'meta', campaign_name: 'A', budget_allocated: 1000, actual_spend: 800, impressions: 10000, clicks: 200, conversions: 20 },
  { platform: 'google_ads', campaign_name: 'B', budget_allocated: 500, actual_spend: 600, impressions: 5000, clicks: 50, conversions: 5 },
]

describe('aggregateAdKpis', () => {
  it('sums spend/budget/impressions/clicks/conversions and derives ctr/cpc/cpa/utilization', () => {
    const k = aggregateAdKpis(rows as any)
    expect(k.spend).toBe(1400)
    expect(k.budget).toBe(1500)
    expect(k.impressions).toBe(15000)
    expect(k.clicks).toBe(250)
    expect(k.conversions).toBe(25)
    expect(k.ctr).toBeCloseTo((250 / 15000) * 100, 5)
    expect(k.cpc).toBeCloseTo(1400 / 250, 5)
    expect(k.cpa).toBeCloseTo(1400 / 25, 5)
    expect(k.budgetUtilizationPct).toBeCloseTo((1400 / 1500) * 100, 5)
  })
  it('guards divide-by-zero (no clicks/conversions/impressions/budget → 0)', () => {
    const k = aggregateAdKpis([{ platform: 'meta', campaign_name: 'X', budget_allocated: 0, actual_spend: 0, impressions: 0, clicks: 0, conversions: 0 }] as any)
    expect(k.ctr).toBe(0)
    expect(k.cpc).toBe(0)
    expect(k.cpa).toBe(0)
    expect(k.budgetUtilizationPct).toBe(0)
  })
  it('coerces string/null numerics from the DB', () => {
    const k = aggregateAdKpis([{ platform: 'meta', campaign_name: 'X', budget_allocated: '100', actual_spend: '50', impressions: null, clicks: '10', conversions: null }] as any)
    expect(k.spend).toBe(50)
    expect(k.budget).toBe(100)
    expect(k.clicks).toBe(10)
    expect(k.conversions).toBe(0)
  })
})

describe('pctDelta', () => {
  it('computes percent change and handles null/zero prior', () => {
    expect(pctDelta(120, 100)).toBeCloseTo(20, 5)
    expect(pctDelta(80, 100)).toBeCloseTo(-20, 5)
    expect(pctDelta(50, null)).toBeNull()
    expect(pctDelta(50, 0)).toBeNull()
  })
})

describe('buildAdReportModel', () => {
  it('assembles KPIs, MoM deltas, and top campaigns sorted by spend desc', () => {
    const m = buildAdReportModel({
      clientName: 'Knox GWM', periodLabel: 'May 2026',
      current: rows as any,
      prior: [{ platform: 'meta', campaign_name: 'A', budget_allocated: 1000, actual_spend: 700, impressions: 9000, clicks: 180, conversions: 18 }] as any,
    })
    expect(m.clientName).toBe('Knox GWM')
    expect(m.kpis.spend).toBe(1400)
    expect(m.deltas.spend).toBeCloseTo(pctDelta(1400, 700)!, 5)
    expect(m.topCampaigns[0].campaign).toBe('A') // 800 spend > 600
    expect(m.topCampaigns).toHaveLength(2)
  })
  it('handles no prior period (deltas null)', () => {
    const m = buildAdReportModel({ clientName: 'C', periodLabel: 'May 2026', current: rows as any })
    expect(m.deltas.spend).toBeNull()
    expect(m.prior).toBeNull()
  })
})

describe('buildAdReportHtml', () => {
  it('renders a full HTML doc containing the client, period, and key numbers', () => {
    const m = buildAdReportModel({ clientName: 'Knox GWM', periodLabel: 'May 2026', current: rows as any })
    const html = buildAdReportHtml(m)
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('Knox GWM')
    expect(html).toContain('May 2026')
    expect(html).toContain('1,400') // formatted spend
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm -C /Users/paulgiurin/Documents/Projects/dashboard/.worktrees/ops-autopilot exec vitest run test/automation/adReporting.test.ts`
Expected: FAIL — cannot resolve `~~/server/utils/adReporting/model`.

- [ ] **Step 3: Write `model.ts`**

```typescript
// server/utils/adReporting/model.ts
// Pure aggregation for the ad-performance report. No I/O — unit-tested.

export interface AdSpendRow {
  platform: string
  campaign_name: string | null
  budget_allocated: number | string | null
  actual_spend: number | string | null
  impressions: number | string | null
  clicks: number | string | null
  conversions: number | string | null
}

export interface AdReportKpis {
  spend: number
  budget: number
  impressions: number
  clicks: number
  conversions: number
  ctr: number
  cpc: number
  cpa: number
  budgetUtilizationPct: number
}

export interface AdReportModel {
  clientName: string
  periodLabel: string
  kpis: AdReportKpis
  prior: AdReportKpis | null
  deltas: { spend: number | null, clicks: number | null, conversions: number | null, cpa: number | null }
  topCampaigns: Array<{ campaign: string, platform: string, spend: number, conversions: number, cpa: number }>
}

function num(v: number | string | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}
function safeDiv(a: number, b: number): number {
  return b > 0 ? a / b : 0
}

export function aggregateAdKpis(rows: AdSpendRow[]): AdReportKpis {
  let spend = 0, budget = 0, impressions = 0, clicks = 0, conversions = 0
  for (const r of rows) {
    spend += num(r.actual_spend)
    budget += num(r.budget_allocated)
    impressions += num(r.impressions)
    clicks += num(r.clicks)
    conversions += num(r.conversions)
  }
  return {
    spend, budget, impressions, clicks, conversions,
    ctr: safeDiv(clicks, impressions) * 100,
    cpc: safeDiv(spend, clicks),
    cpa: safeDiv(spend, conversions),
    budgetUtilizationPct: safeDiv(spend, budget) * 100,
  }
}

export function pctDelta(cur: number, prior: number | null | undefined): number | null {
  if (prior == null || prior === 0) return null
  return ((cur - prior) / prior) * 100
}

export function buildAdReportModel(input: {
  clientName: string
  periodLabel: string
  current: AdSpendRow[]
  prior?: AdSpendRow[]
}): AdReportModel {
  const kpis = aggregateAdKpis(input.current)
  const prior = input.prior && input.prior.length ? aggregateAdKpis(input.prior) : null
  const topCampaigns = [...input.current]
    .map(r => ({
      campaign: r.campaign_name || 'Unknown',
      platform: r.platform,
      spend: num(r.actual_spend),
      conversions: num(r.conversions),
      cpa: safeDiv(num(r.actual_spend), num(r.conversions)),
    }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 10)
  return {
    clientName: input.clientName,
    periodLabel: input.periodLabel,
    kpis,
    prior,
    deltas: {
      spend: pctDelta(kpis.spend, prior?.spend),
      clicks: pctDelta(kpis.clicks, prior?.clicks),
      conversions: pctDelta(kpis.conversions, prior?.conversions),
      cpa: pctDelta(kpis.cpa, prior?.cpa),
    },
    topCampaigns,
  }
}
```

- [ ] **Step 4: Write `html.ts`**

```typescript
// server/utils/adReporting/html.ts
import type { AdReportModel } from '~~/server/utils/adReporting/model'

function fmtNum(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}
function fmtMoney(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`
}
function fmtDelta(d: number | null): string {
  if (d == null) return '<span class="d dn">—</span>'
  const sign = d >= 0 ? '+' : ''
  const cls = d >= 0 ? 'du' : 'dd'
  return `<span class="d ${cls}">${sign}${d.toFixed(0)}%</span>`
}
function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]!))
}

export function buildAdReportHtml(m: AdReportModel): string {
  const k = m.kpis
  const cards: Array<[string, string, number | null]> = [
    ['Spend', fmtMoney(k.spend), m.deltas.spend],
    ['Budget used', `${k.budgetUtilizationPct.toFixed(0)}%`, null],
    ['Clicks', fmtNum(k.clicks), m.deltas.clicks],
    ['Conversions', fmtNum(k.conversions), m.deltas.conversions],
    ['CTR', `${k.ctr.toFixed(2)}%`, null],
    ['CPA', fmtMoney(k.cpa), m.deltas.cpa],
  ]
  const cardsHtml = cards.map(([label, val, d]) =>
    `<div class="card"><div class="lbl">${label}</div><div class="val">${val}</div>${fmtDelta(d)}</div>`,
  ).join('')
  const rowsHtml = m.topCampaigns.map(c =>
    `<tr><td>${esc(c.campaign)}</td><td>${esc(c.platform)}</td><td>${fmtMoney(c.spend)}</td><td>${fmtNum(c.conversions)}</td><td>${fmtMoney(c.cpa)}</td></tr>`,
  ).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;margin:0;padding:24px}
    h1{font-size:20px;margin:0 0 2px} .sub{color:#666;font-size:13px;margin-bottom:20px}
    .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px}
    .card{border:1px solid #eee;border-radius:8px;padding:12px}
    .lbl{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.04em}
    .val{font-size:22px;font-weight:600;margin:4px 0} .d{font-size:12px} .du{color:#16a34a}.dd{color:#dc2626}.dn{color:#aaa}
    table{width:100%;border-collapse:collapse;font-size:13px} th,td{text-align:left;padding:8px;border-bottom:1px solid #eee}
    th{color:#888;font-weight:600;font-size:11px;text-transform:uppercase}
  </style></head><body>
    <h1>${esc(m.clientName)} — Ad performance</h1>
    <div class="sub">${esc(m.periodLabel)}</div>
    <div class="grid">${cardsHtml}</div>
    <table><thead><tr><th>Campaign</th><th>Platform</th><th>Spend</th><th>Conv.</th><th>CPA</th></tr></thead>
    <tbody>${rowsHtml || '<tr><td colspan="5">No campaigns in this period.</td></tr>'}</tbody></table>
  </body></html>`
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm -C /Users/paulgiurin/Documents/Projects/dashboard/.worktrees/ops-autopilot exec vitest run test/automation/adReporting.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/utils/adReporting/model.ts server/utils/adReporting/html.ts test/automation/adReporting.test.ts
git commit -m "feat(ops-autopilot): ad-report pure model + html + tests (C2.1)"
```

---

### Task 3: Orchestrator `processDueAdReports` (+ tests with fakes)

**Files:** Create `server/utils/adReporting/send.ts`; extend `test/automation/adReporting.test.ts`

**Interfaces — Produces:**
- `isAdReportsEnabled(): boolean`
- `isAdReportDue(row, now): boolean`
- `processDueAdReports(db, deps): Promise<{ gated: boolean, sent: number, skipped: number, failed: number }>`

- [ ] **Step 1: Append failing tests**

```typescript
// append to test/automation/adReporting.test.ts
import { isAdReportDue, processDueAdReports } from '~~/server/utils/adReporting/send'

describe('isAdReportDue', () => {
  const base = { id: 's1', client_id: 'c1', cadence: 'monthly', enabled: true, recipients: ['a@b.com'], last_sent_at: null as string | null }
  it('due when never sent', () => {
    expect(isAdReportDue(base, new Date('2026-05-02T00:00:00Z'))).toBe(true)
  })
  it('not due when disabled', () => {
    expect(isAdReportDue({ ...base, enabled: false }, new Date())).toBe(false)
  })
  it('not due when sent recently (< ~28d)', () => {
    expect(isAdReportDue({ ...base, last_sent_at: '2026-05-01T00:00:00Z' }, new Date('2026-05-10T00:00:00Z'))).toBe(false)
  })
  it('due when last send is older than a month', () => {
    expect(isAdReportDue({ ...base, last_sent_at: '2026-04-01T00:00:00Z' }, new Date('2026-05-10T00:00:00Z'))).toBe(true)
  })
})

describe('processDueAdReports', () => {
  function fakes(scheduleRows: any[]) {
    const execCalls: any[][] = []
    const sent: any[] = []
    const db = {
      queryRows: async (_sql: string) => scheduleRows,
      execute: async (_sql: string, params: any[]) => { execCalls.push(params); return 1 },
    }
    const deps = {
      now: new Date('2026-05-05T00:00:00Z'),
      buildModel: async (_s: any) => ({ clientName: 'C', periodLabel: 'Apr 2026', kpis: {} as any, prior: null, deltas: {} as any, topCampaigns: [] }),
      renderPdf: async (_html: string) => Buffer.from('pdf'),
      uploadPdf: async (_key: string, _buf: Buffer) => 'https://r2/report.pdf',
      sendEmail: async (a: any) => { sent.push(a) },
    }
    return { db, deps, execCalls, sent }
  }

  it('is gated off by default (AD_REPORTS_ENABLED unset)', async () => {
    delete process.env.AD_REPORTS_ENABLED
    const { db, deps } = fakes([])
    const r = await processDueAdReports(db as any, deps as any)
    expect(r.gated).toBe(true)
    expect(r.sent).toBe(0)
  })

  it('sends a due schedule and stamps last_sent_at', async () => {
    process.env.AD_REPORTS_ENABLED = 'true'
    const { db, deps, sent, execCalls } = fakes([
      { id: 's1', client_id: 'c1', cadence: 'monthly', enabled: true, recipients: ['a@b.com'], last_sent_at: null },
    ])
    const r = await processDueAdReports(db as any, deps as any)
    expect(r.sent).toBe(1)
    expect(sent).toHaveLength(1)
    expect(sent[0].recipients).toEqual(['a@b.com'])
    expect(execCalls.length).toBe(1) // last_sent_at update
    delete process.env.AD_REPORTS_ENABLED
  })

  it('skips schedules with no recipients', async () => {
    process.env.AD_REPORTS_ENABLED = 'true'
    const { db, deps, sent } = fakes([
      { id: 's1', client_id: 'c1', cadence: 'monthly', enabled: true, recipients: [], last_sent_at: null },
    ])
    const r = await processDueAdReports(db as any, deps as any)
    expect(r.sent).toBe(0)
    expect(r.skipped).toBe(1)
    expect(sent).toHaveLength(0)
    delete process.env.AD_REPORTS_ENABLED
  })

  it('records failure (last_error) when a send throws, without aborting the loop', async () => {
    process.env.AD_REPORTS_ENABLED = 'true'
    const { db, deps } = fakes([
      { id: 's1', client_id: 'c1', cadence: 'monthly', enabled: true, recipients: ['a@b.com'], last_sent_at: null },
    ])
    deps.sendEmail = async () => { throw new Error('boom') }
    const r = await processDueAdReports(db as any, deps as any)
    expect(r.failed).toBe(1)
    expect(r.sent).toBe(0)
    delete process.env.AD_REPORTS_ENABLED
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm -C /Users/paulgiurin/Documents/Projects/dashboard/.worktrees/ops-autopilot exec vitest run test/automation/adReporting.test.ts`
Expected: FAIL — cannot resolve `~~/server/utils/adReporting/send`.

- [ ] **Step 3: Write `send.ts`**

```typescript
// server/utils/adReporting/send.ts
import type { AdReportModel } from '~~/server/utils/adReporting/model'
import { buildAdReportHtml } from '~~/server/utils/adReporting/html'

export function isAdReportsEnabled(): boolean {
  return process.env.AD_REPORTS_ENABLED === 'true'
}

export interface AdReportScheduleRow {
  id: string
  client_id: string
  cadence: string
  enabled: boolean
  recipients: string[]
  last_sent_at: string | null
  [k: string]: any
}

// Monthly cadence: due if never sent or last send was >= 28 days ago.
export function isAdReportDue(s: AdReportScheduleRow, now: Date): boolean {
  if (!s.enabled) return false
  if (!s.last_sent_at) return true
  const last = new Date(s.last_sent_at)
  if (Number.isNaN(last.getTime())) return true
  const elapsedDays = (now.getTime() - last.getTime()) / 86400_000
  return elapsedDays >= 28
}

export interface AdReportSendDb {
  queryRows: <T = any>(sql: string, params?: any[]) => Promise<T[]>
  execute: (sql: string, params?: any[]) => Promise<number>
}

export interface AdReportSendDeps {
  now: Date
  buildModel: (s: AdReportScheduleRow) => Promise<AdReportModel | null>
  renderPdf: (html: string) => Promise<Buffer | null>
  uploadPdf: (key: string, pdf: Buffer) => Promise<string>
  sendEmail: (args: { recipients: string[], model: AdReportModel, pdfUrl: string | null, html: string }) => Promise<void>
}

export async function processDueAdReports(db: AdReportSendDb, deps: AdReportSendDeps): Promise<{ gated: boolean, sent: number, skipped: number, failed: number }> {
  if (!isAdReportsEnabled()) return { gated: true, sent: 0, skipped: 0, failed: 0 }

  const schedules = await db.queryRows<AdReportScheduleRow>(`SELECT * FROM ad_report_schedules WHERE enabled = TRUE`)
  let sent = 0, skipped = 0, failed = 0

  for (const s of schedules) {
    if (!isAdReportDue(s, deps.now)) { skipped++; continue }
    if (!Array.isArray(s.recipients) || s.recipients.length === 0) { skipped++; continue }
    try {
      const model = await deps.buildModel(s)
      if (!model) { skipped++; continue }
      const html = buildAdReportHtml(model)
      const pdf = await deps.renderPdf(html)
      const pdfUrl = pdf ? await deps.uploadPdf(`ad-reports/${s.client_id}/${s.id}-${deps.now.getTime()}.pdf`, pdf) : null
      await deps.sendEmail({ recipients: s.recipients, model, pdfUrl, html })
      await db.execute(`UPDATE ad_report_schedules SET last_sent_at = NOW(), last_error = NULL, updated_at = NOW() WHERE id = $1`, [s.id])
      sent++
    } catch (e: any) {
      await db.execute(`UPDATE ad_report_schedules SET last_error = $2, updated_at = NOW() WHERE id = $1`, [s.id, String(e?.message ?? e).slice(0, 500)])
      failed++
    }
  }
  return { gated: false, sent, skipped, failed }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm -C /Users/paulgiurin/Documents/Projects/dashboard/.worktrees/ops-autopilot exec vitest run test/automation/adReporting.test.ts`
Expected: PASS (model + due-check + orchestrator).

- [ ] **Step 5: Commit**

```bash
git add server/utils/adReporting/send.ts test/automation/adReporting.test.ts
git commit -m "feat(ops-autopilot): ad-report orchestrator processDueAdReports + tests (C2.1)"
```

---

### Task 4: Cron endpoint wiring real deps

**Files:** Create `server/api/cron/send-ad-reports.post.ts`

**Interfaces:** Consumes `processDueAdReports`/`buildAdReportModel`; `renderReportPdf` (`~~/server/utils/socialReporting/pdf`), `uploadFile` (`~~/server/utils/storage`), `sendAnalyticsReportEmail` (`~~/server/utils/email`), `queryRows`/`queryOne` (`~~/server/utils/db`).

- [ ] **Step 1: Verify the real signatures before writing**

Run (read, don't guess): 
`sed -n '1,30p' server/api/cron/send-social-reports.post.ts` (the deps-wiring template) and confirm the exact import paths/return shapes of `renderReportPdf`, `uploadFile` (does it return `{ url }`?), and `sendAnalyticsReportEmail` (param names + return `{ sent }`). Adapt the code below to the REAL signatures if they differ.

- [ ] **Step 2: Write the cron**

```typescript
// server/api/cron/send-ad-reports.post.ts
// Monthly client ad-performance reports. Reads media_spend → PDF → R2 → email.
// No ad-platform writes. Gated by AD_REPORTS_ENABLED. Mirrors send-social-reports.
import { createError, getHeader } from 'h3'
import { queryRows, queryOne } from '~~/server/utils/db'
import { processDueAdReports, type AdReportScheduleRow } from '~~/server/utils/adReporting/send'
import { buildAdReportModel, type AdSpendRow } from '~~/server/utils/adReporting/model'
import { renderReportPdf } from '~~/server/utils/socialReporting/pdf'
import { uploadFile } from '~~/server/utils/storage'
import { sendAnalyticsReportEmail } from '~~/server/utils/email'

// 'YYYY-MM' for the month `offset` months before `now` (offset 1 = previous month).
function periodMonthsAgo(now: Date, offset: number): { period: string, label: string } {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1))
  const period = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  const label = d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  return { period, label }
}

async function spendRows(clientId: string, period: string, platform: string | null): Promise<AdSpendRow[]> {
  const params: any[] = [clientId, period]
  let sql = `SELECT platform, campaign_name, budget_allocated, actual_spend, impressions, clicks, conversions
             FROM media_spend WHERE client_id = $1 AND period = $2`
  if (platform) { sql += ` AND platform = $3`; params.push(platform) }
  return await queryRows<AdSpendRow>(sql, params)
}

export default defineEventHandler(async (event) => {
  const secret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && secret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const now = new Date()
  const cur = periodMonthsAgo(now, 1)   // previous complete month
  const prev = periodMonthsAgo(now, 2)  // month before that

  const result = await processDueAdReports({ queryRows, execute }, {
    now,
    async buildModel(s: AdReportScheduleRow) {
      const client = await queryOne<{ name: string }>(`SELECT name FROM agency_clients WHERE id = $1`, [s.client_id])
      if (!client) return null
      const platform = s.platform || null
      const [current, prior] = await Promise.all([
        spendRows(s.client_id, cur.period, platform),
        spendRows(s.client_id, prev.period, platform),
      ])
      if (current.length === 0) return null // nothing to report this period
      return buildAdReportModel({ clientName: client.name, periodLabel: cur.label, current, prior })
    },
    renderPdf: html => renderReportPdf(event, html),
    uploadPdf: async (key, pdf) => (await uploadFile(pdf, key, 'application/pdf')).url,
    async sendEmail({ recipients, model, pdfUrl, html }) {
      const r = await sendAnalyticsReportEmail({
        event, to: recipients, subject: `${model.clientName} — Ad report (${model.periodLabel})`, html, reportUrl: pdfUrl,
      })
      if (!r.sent) throw new Error('email send failed (Resend not configured?)')
    },
  })
  return { ok: true, period: cur.period, ...result }
})
```

> Note: `execute` is auto-imported from `~~/server/utils/db` (Nitro auto-import) like `queryRows`/`queryOne`; if your lint requires explicit import, add `execute` to the db import. The `processDueAdReports` db arg needs `{ queryRows, execute }`.

- [ ] **Step 3: Typecheck**

Run: `pnpm -C /Users/paulgiurin/Documents/Projects/dashboard/.worktrees/ops-autopilot exec tsc --noEmit -p .nuxt/tsconfig.server.json 2>&1 | grep -i "send-ad-reports" || echo "no errors in send-ad-reports"`
Expected: `no errors in send-ad-reports`.

- [ ] **Step 4: Operator smoke (deferred — needs dev server)**

> Seed a schedule + force-run: `psql "$DATABASE_URL" -c "INSERT INTO ad_report_schedules (client_id, name, recipients) SELECT id, 'Smoke', ARRAY['you@adme.net.au'] FROM agency_clients LIMIT 1;"` then `AD_REPORTS_ENABLED=true` and `curl -X POST -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/send-ad-reports`. Expect `{ ok:true, sent/skipped/... }`. Cleanup the row after.

- [ ] **Step 5: Commit**

```bash
git add server/api/cron/send-ad-reports.post.ts
git commit -m "feat(ops-autopilot): monthly ad-report cron wiring (C2.1)"
```

---

## Self-Review

**Spec coverage:** scheduled client ad-performance report (Tasks 1–4): table, pure model+html, injected-deps orchestrator (gated, deduped via last_sent_at), cron wiring real PDF/R2/email. No ad-platform writes. ✅
**Deferred (not gaps):** SEO report (no data source); call report (no call-tracking data); schedule-management UI/CRUD endpoint (C2.2 — schedules seeded via SQL for now); companion-Worker cron registration (operator); weekly cadence (data is monthly).
**Placeholder scan:** none — Task 4 Step 1 verifies the real `renderReportPdf`/`uploadFile`/`sendAnalyticsReportEmail` signatures against `send-social-reports.post.ts` before writing.
**Type consistency:** `AdReportModel`/`AdSpendRow`/`AdReportScheduleRow` flow from Task 2/3 into Task 4; orchestrator deps shape matches the cron's wiring; `processDueAdReports` db arg = `{ queryRows, execute }`.
**Safety:** writes = a PDF to R2 + an email; reads `media_spend`. Gated `AD_REPORTS_ENABLED` (default off) + cron `x-cron-secret`; dormant until a trigger is registered. First-run email goes only to each schedule's explicit `recipients` (no fan-out), so no flood risk like C1.
