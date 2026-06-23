# Ops Autopilot — C1.1: Budget & Pacing Watchdog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A daily, monitoring-only watchdog that classifies ad-spend pacing per campaign using the EXISTING pacing engine, and raises a deduped escalation into the A.2 inbox for any actionable pacing issue — never writing to a live ad platform. Plus a read-only `check_pacing` AI tool.

**Architecture:** Reuse `buildPacingReview()` (it already classifies overpacing/underpacing/no-spend/paused-with-budget/stale-sync from `media_spend` rows). A pure mapping layer turns each actionable `PacingReviewItem` into an `EscalationInput` (with a *proposed* budget action — for a human to approve, never auto-applied). The runner fetches rows, builds the review, dedupes against already-pending watchdog escalations, raises the rest via the A.1 `raiseEscalation`, and notifies approvers for critical items. A cron endpoint (x-cron-secret + 7am-local gate) drives it; an AI tool exposes the same read on demand.

**Tech Stack:** Nitro server routes, Neon via `~~/server/utils/db`, existing `~~/server/utils/socialSpendPacingReview` + `~~/server/utils/budgetPacing`, A.1 escalation spine, the AI tool registry, Vitest (pure unit tests).

## Global Constraints

- **No live ad-platform writes.** The watchdog only reads `media_spend` and raises escalations. The `proposed_action` it attaches is data for a human to approve via the inbox — it is NEVER executed here. (Honors the program's spend ceiling.)
- **Reuse, don't reimplement pacing.** Use `buildPacingReview` + `PACING_REVIEW_SELECT_COLUMNS` from `~~/server/utils/socialSpendPacingReview`; do not recompute pacing.
- **DB access only via `~~/server/utils/db` helpers**, parameterized `$1`; server imports use `~~/server/utils/...`.
- **Cron auth:** `x-cron-secret` header == `process.env.CRON_SECRET` (skip in `import.meta.dev`); `?force=true|1` bypasses the time gate. Mirror `server/api/cron/anomaly-detection.post.ts`.
- **Dedup:** never raise a second pending escalation for the same `(platform, campaignId, issueType)` while one is still `pending`.
- **Notify on critical only** (C1.1): warnings appear in the inbox silently; criticals also `notifyEscalationApprovers`. Avoids first-run notification floods.
- **Test command:** `pnpm -C <worktree> exec vitest run <file>` (worktree has `node_modules` symlinked + `.nuxt` prepared).

---

## File Structure

- `server/utils/automation/pacingWatchdog.ts` — **Create.** Pure mapping/dedup helpers (`isActionablePacingItem`, `labelForIssue`, `pacingItemToEscalation`, `dedupeKey`, `filterAlreadyPending`) + the impure `runPacingWatchdog()` runner.
- `test/automation/pacingWatchdog.test.ts` — **Create.** Unit tests for the pure helpers.
- `server/api/cron/ops-autopilot-pacing.post.ts` — **Create.** Daily cron endpoint → `runPacingWatchdog()`.
- `server/utils/ai/tools/checkPacing.ts` — **Create.** Read-only `check_pacing` AI tool.
- `server/utils/ai/tools/index.ts` — **Modify.** Register `checkPacingTool` in the `registry` array.

**Interfaces produced:**
- `runPacingWatchdog(opts?: { now?: Date }): Promise<{ evaluated: number, raised: number, skipped: number }>`
- pure helpers (signatures in Task 1).

---

### Task 1: Pure mapping + dedup helpers (+ unit tests)

**Files:**
- Create: `server/utils/automation/pacingWatchdog.ts` (pure section only — the runner is added in Task 2)
- Test: `test/automation/pacingWatchdog.test.ts`

**Interfaces — Produces:**
- `ACTIONABLE_ISSUES`, `isActionablePacingItem(item): boolean`
- `labelForIssue(issueType): string`
- `pacingItemToEscalation(item, opts: { runId?: string|null }): EscalationInput`
- `dedupeKey(d: { platform?, campaignId?, issueType? }): string`
- `filterAlreadyPending(candidates: EscalationInput[], pendingDetails: Record<string,any>[]): EscalationInput[]`

- [ ] **Step 1: Write the failing tests**

```typescript
// test/automation/pacingWatchdog.test.ts
import { describe, expect, it } from 'vitest'
import {
  isActionablePacingItem,
  pacingItemToEscalation,
  dedupeKey,
  filterAlreadyPending,
  labelForIssue,
} from '~~/server/utils/automation/pacingWatchdog'

function item(overrides: Record<string, any> = {}): any {
  return {
    mediaSpendId: 'ms-1', clientName: 'Knox GWM', platform: 'meta',
    campaignId: 'c-1', campaignName: 'EOFY Lead Gen', campaignStatus: 'ACTIVE',
    issueType: 'overpacing', severity: 'critical',
    budget: 3000, mtdSpend: 2000, expectedToDate: 1500, projectedMonthEnd: 4000,
    currentDailyBudget: 100, recommendedDailyBudget: 70, pacingRatio: 1.33,
    performance: {}, syncedAt: '2026-06-23T00:00:00Z', recommendedAction: 'Reduce daily budget',
    canApplyAutomatically: false, ...overrides,
  }
}

describe('isActionablePacingItem', () => {
  it('accepts actionable issue + severity', () => {
    expect(isActionablePacingItem(item())).toBe(true)
    expect(isActionablePacingItem(item({ issueType: 'stale_sync', severity: 'warning' }))).toBe(true)
  })
  it('rejects non-actionable issue types and info severity', () => {
    expect(isActionablePacingItem(item({ issueType: 'zero_conversion' }))).toBe(false)
    expect(isActionablePacingItem(item({ severity: 'info' }))).toBe(false)
  })
})

describe('pacingItemToEscalation', () => {
  it('maps an overpacing item to a reduce_daily_budget proposal (never auto-applied)', () => {
    const e = pacingItemToEscalation(item(), { runId: 'run-1' })
    expect(e.capability).toBe('budget_pacing_watchdog')
    expect(e.severity).toBe('critical')
    expect(e.runId).toBe('run-1')
    expect(e.title).toContain('Knox GWM')
    expect(e.title).toContain('EOFY Lead Gen')
    expect(e.proposedAction).toMatchObject({ action: 'reduce_daily_budget', from: 100, to: 70, campaignId: 'c-1', platform: 'meta' })
    expect(e.detail).toMatchObject({ campaignId: 'c-1', issueType: 'overpacing', platform: 'meta' })
  })
  it('maps underpacing to increase, stale_sync to resync, no_spend to investigate', () => {
    expect(pacingItemToEscalation(item({ issueType: 'underpacing' }), {}).proposedAction).toMatchObject({ action: 'increase_daily_budget' })
    expect(pacingItemToEscalation(item({ issueType: 'stale_sync' }), {}).proposedAction).toMatchObject({ action: 'resync_spend' })
    expect(pacingItemToEscalation(item({ issueType: 'no_spend' }), {}).proposedAction).toMatchObject({ action: 'investigate_delivery' })
  })
})

describe('dedupeKey + filterAlreadyPending', () => {
  it('builds a stable key from platform/campaign/issue', () => {
    expect(dedupeKey({ platform: 'meta', campaignId: 'c-1', issueType: 'overpacing' })).toBe('meta::c-1::overpacing')
  })
  it('drops candidates whose key matches an already-pending escalation detail', () => {
    const candidates = [
      pacingItemToEscalation(item({ campaignId: 'c-1', issueType: 'overpacing' }), {}),
      pacingItemToEscalation(item({ campaignId: 'c-2', issueType: 'overpacing' }), {}),
    ]
    const pending = [{ platform: 'meta', campaignId: 'c-1', issueType: 'overpacing' }]
    const fresh = filterAlreadyPending(candidates, pending)
    expect(fresh).toHaveLength(1)
    expect((fresh[0].detail as any).campaignId).toBe('c-2')
  })
})

describe('labelForIssue', () => {
  it('gives a human label per issue type', () => {
    expect(labelForIssue('overpacing')).toMatch(/over/i)
    expect(labelForIssue('no_spend')).toMatch(/no spend/i)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm -C /Users/paulgiurin/Documents/Projects/dashboard/.worktrees/ops-autopilot exec vitest run test/automation/pacingWatchdog.test.ts`
Expected: FAIL — cannot resolve `~~/server/utils/automation/pacingWatchdog`.

- [ ] **Step 3: Write the pure helpers**

```typescript
// server/utils/automation/pacingWatchdog.ts
import type { PacingReviewItem, PacingReviewIssueType } from '~~/server/utils/socialSpendPacingReview'
import type { EscalationInput } from '~~/server/utils/automation/escalations'

const ACTIONABLE_ISSUES: PacingReviewIssueType[] = ['overpacing', 'underpacing', 'no_spend', 'paused_with_budget', 'stale_sync']
const ACTIONABLE_SEVERITIES = ['critical', 'warning']

export function isActionablePacingItem(item: Pick<PacingReviewItem, 'issueType' | 'severity'>): boolean {
  return (ACTIONABLE_ISSUES as string[]).includes(item.issueType)
    && ACTIONABLE_SEVERITIES.includes(item.severity)
}

export function labelForIssue(issueType: string): string {
  switch (issueType) {
    case 'overpacing': return 'is over-pacing'
    case 'underpacing': return 'is under-pacing'
    case 'no_spend': return 'has no spend'
    case 'paused_with_budget': return 'is paused with budget'
    case 'stale_sync': return 'has stale spend data'
    default: return `needs review (${issueType})`
  }
}

export function pacingItemToEscalation(item: PacingReviewItem, opts: { runId?: string | null }): EscalationInput {
  let proposedAction: Record<string, any> | null = null
  const base = { platform: item.platform, campaignId: item.campaignId }
  if (item.issueType === 'overpacing') {
    proposedAction = { action: 'reduce_daily_budget', ...base, from: item.currentDailyBudget, to: item.recommendedDailyBudget }
  } else if (item.issueType === 'underpacing') {
    proposedAction = { action: 'increase_daily_budget', ...base, from: item.currentDailyBudget, to: item.recommendedDailyBudget }
  } else if (item.issueType === 'stale_sync') {
    proposedAction = { action: 'resync_spend', ...base }
  } else if (item.issueType === 'no_spend' || item.issueType === 'paused_with_budget') {
    proposedAction = { action: 'investigate_delivery', ...base }
  }
  return {
    capability: 'budget_pacing_watchdog',
    title: `${item.clientName}: ${item.campaignName} ${labelForIssue(item.issueType)} (${item.platform})`,
    severity: item.severity,
    clientId: null, // PacingReviewItem carries clientName, not id; client linkage is a later refinement.
    runId: opts.runId ?? null,
    detail: {
      campaignId: item.campaignId,
      campaignName: item.campaignName,
      clientName: item.clientName,
      platform: item.platform,
      issueType: item.issueType,
      budget: item.budget,
      mtdSpend: item.mtdSpend,
      projectedMonthEnd: item.projectedMonthEnd,
      pacingRatio: item.pacingRatio,
      currentDailyBudget: item.currentDailyBudget,
      recommendedDailyBudget: item.recommendedDailyBudget,
      recommendedAction: item.recommendedAction,
    },
    proposedAction,
  }
}

export function dedupeKey(d: { platform?: string | null, campaignId?: string | null, issueType?: string | null }): string {
  return `${d.platform ?? ''}::${d.campaignId ?? ''}::${d.issueType ?? ''}`
}

export function filterAlreadyPending(candidates: EscalationInput[], pendingDetails: Record<string, any>[]): EscalationInput[] {
  const seen = new Set(pendingDetails.map(d => dedupeKey({ platform: d.platform, campaignId: d.campaignId, issueType: d.issueType })))
  return candidates.filter((c) => {
    const det = (c.detail ?? {}) as Record<string, any>
    return !seen.has(dedupeKey({ platform: det.platform, campaignId: det.campaignId, issueType: det.issueType }))
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm -C /Users/paulgiurin/Documents/Projects/dashboard/.worktrees/ops-autopilot exec vitest run test/automation/pacingWatchdog.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add server/utils/automation/pacingWatchdog.ts test/automation/pacingWatchdog.test.ts
git commit -m "feat(ops-autopilot): pacing-watchdog pure mapping + dedup helpers (C1.1)"
```

---

### Task 2: The watchdog runner

**Files:**
- Modify: `server/utils/automation/pacingWatchdog.ts` (append the impure `runPacingWatchdog`)

**Interfaces:**
- Consumes: pure helpers (Task 1); `buildPacingReview`, `PACING_REVIEW_SELECT_COLUMNS`, `PacingReviewRow` from `~~/server/utils/socialSpendPacingReview`; `queryRows` from `~~/server/utils/db`; `raiseEscalation` from `~~/server/utils/automation/escalationsStore`; `notifyEscalationApprovers` from `~~/server/utils/automation/notifyEscalation`.
- Produces: `runPacingWatchdog(opts?: { now?: Date }): Promise<{ evaluated: number, raised: number, skipped: number }>`.

> **Testing note:** DB-integration runner; no unit test (repo convention — pure logic is covered in Task 1). Verified by typecheck + the cron smoke in Task 3.

- [ ] **Step 1: Append the runner**

```typescript
// append to server/utils/automation/pacingWatchdog.ts
import { queryRows } from '~~/server/utils/db'
import { buildPacingReview, PACING_REVIEW_SELECT_COLUMNS, type PacingReviewRow } from '~~/server/utils/socialSpendPacingReview'
import { raiseEscalation } from '~~/server/utils/automation/escalationsStore'
import { notifyEscalationApprovers } from '~~/server/utils/automation/notifyEscalation'

function periodFor(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

export async function runPacingWatchdog(opts: { now?: Date } = {}): Promise<{ evaluated: number, raised: number, skipped: number }> {
  const now = opts.now ?? new Date()
  const period = periodFor(now)

  const rows = await queryRows<PacingReviewRow>(
    `SELECT ${PACING_REVIEW_SELECT_COLUMNS}
       FROM media_spend ms
       LEFT JOIN agency_clients ac ON ac.id = ms.client_id
      WHERE ms.period = $1`,
    [period],
  )

  const review = buildPacingReview(rows, { now, period })
  const actionable = review.items.filter(isActionablePacingItem)
  const evaluated = review.items.length

  // Dedupe against escalations still pending for this capability.
  const pending = await queryRows<{ detail: Record<string, any> }>(
    `SELECT detail FROM automation_escalations WHERE capability = 'budget_pacing_watchdog' AND status = 'pending'`,
  )
  const candidates = actionable.map(it => pacingItemToEscalation(it, {}))
  const fresh = filterAlreadyPending(candidates, pending.map(p => p.detail ?? {}))

  let raised = 0
  for (const input of fresh) {
    try {
      const row = await raiseEscalation(input)
      raised++
      if (input.severity === 'critical' && row?.id) {
        await notifyEscalationApprovers({
          escalationId: row.id,
          capability: input.capability,
          title: input.title,
          severity: 'critical',
        })
      }
    } catch (err) {
      console.error('[pacing-watchdog] failed to raise escalation', input.title, err)
    }
  }

  return { evaluated, raised, skipped: candidates.length - fresh.length }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm -C /Users/paulgiurin/Documents/Projects/dashboard/.worktrees/ops-autopilot exec tsc --noEmit -p .nuxt/tsconfig.server.json 2>&1 | grep -i "automation/pacingWatchdog" || echo "no errors in pacingWatchdog"`
Expected: `no errors in pacingWatchdog`.

- [ ] **Step 3: Re-run the pure tests (regression)**

Run: `pnpm -C /Users/paulgiurin/Documents/Projects/dashboard/.worktrees/ops-autopilot exec vitest run test/automation/pacingWatchdog.test.ts`
Expected: PASS (7+ tests).

- [ ] **Step 4: Commit**

```bash
git add server/utils/automation/pacingWatchdog.ts
git commit -m "feat(ops-autopilot): pacing-watchdog runner — read media_spend, dedupe, raise escalations (C1.1)"
```

---

### Task 3: Cron endpoint

**Files:**
- Create: `server/api/cron/ops-autopilot-pacing.post.ts`

**Interfaces:**
- Consumes: `runPacingWatchdog` (Task 2); `queryOne` from `~~/server/utils/db`.

- [ ] **Step 1: Write the cron handler**

```typescript
// server/api/cron/ops-autopilot-pacing.post.ts
// Daily budget & pacing watchdog. Reads media_spend, raises escalations into the inbox.
// Monitoring-only: never writes to an ad platform. Mirrors anomaly-detection's auth + 7am-local gate.
import { createError, getHeader, getQuery } from 'h3'
import { queryOne } from '~~/server/utils/db'
import { runPacingWatchdog } from '~~/server/utils/automation/pacingWatchdog'

export default defineEventHandler(async (event) => {
  const cronSecret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && cronSecret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const query = getQuery(event)
  const force = query.force === 'true' || query.force === '1'

  // 7am-local gate (default Australia/Sydney; reuse the connected org's tz if present).
  const conn = await queryOne<{ timezone: string }>(
    `SELECT timezone FROM xero_org_connection ORDER BY connected_at DESC LIMIT 1`,
  )
  const tz = conn?.timezone || 'Australia/Sydney'
  let localHour: number
  try {
    localHour = Number(new Date().toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false }))
  } catch {
    localHour = new Date().getUTCHours()
  }
  if (!force && localHour !== 7) {
    return { ok: true, skipped: `local hour=${localHour}`, timezone: tz }
  }

  const start = Date.now()
  const result = await runPacingWatchdog({ now: new Date() })
  return { ok: true, durationMs: Date.now() - start, ...result }
})
```

- [ ] **Step 2: Typecheck**

Run: `pnpm -C /Users/paulgiurin/Documents/Projects/dashboard/.worktrees/ops-autopilot exec tsc --noEmit -p .nuxt/tsconfig.server.json 2>&1 | grep -i "ops-autopilot-pacing" || echo "no errors in ops-autopilot-pacing"`
Expected: `no errors in ops-autopilot-pacing`.

- [ ] **Step 3: Local smoke (force-run)**

> Operator step (documented, not run by the implementer — needs the dev server). With `pnpm dev` running:
> `curl -s -X POST "http://localhost:3000/api/cron/ops-autopilot-pacing?force=true" -H "x-cron-secret: $CRON_SECRET" | python3 -m json.tool`
> Expected: `{ "ok": true, "evaluated": <n>, "raised": <n>, "skipped": <n>, ... }`. Re-running immediately should show `raised: 0` (dedup) and `skipped` > 0.

- [ ] **Step 4: Commit**

```bash
git add server/api/cron/ops-autopilot-pacing.post.ts
git commit -m "feat(ops-autopilot): daily pacing-watchdog cron endpoint (C1.1)"
```

---

### Task 4: `check_pacing` read-only AI tool

**Files:**
- Create: `server/utils/ai/tools/checkPacing.ts`
- Modify: `server/utils/ai/tools/index.ts` (register `checkPacingTool` in the `registry` array)

**Interfaces:**
- Consumes: the `AiTool` shape + `ToolContext`/`ok` helpers (mirror an existing read tool, e.g. `server/utils/ai/tools/anomalies.ts`); `buildPacingReview` + `PACING_REVIEW_SELECT_COLUMNS` + `PacingReviewRow`; `queryRows`.

- [ ] **Step 1: Read an existing read-tool to mirror the exact `ok()`/`ToolContext` imports**

Run: `sed -n '1,40p' server/utils/ai/tools/anomalies.ts`
Use its exact import paths for `AiTool`, the `ok(...)` result helper, the zod `params` pattern, and how `handler` returns.

- [ ] **Step 2: Write the tool (adapt imports to match anomalies.ts exactly)**

```typescript
// server/utils/ai/tools/checkPacing.ts
import { z } from 'zod'
import type { AiTool } from '~~/server/utils/ai/toolRegistry'
import { ok } from '~~/server/utils/ai/toolContext' // <-- match anomalies.ts; adjust if it differs
import { queryRows } from '~~/server/utils/db'
import { buildPacingReview, PACING_REVIEW_SELECT_COLUMNS, type PacingReviewRow } from '~~/server/utils/socialSpendPacingReview'
import { isActionablePacingItem } from '~~/server/utils/automation/pacingWatchdog'

const params = z.object({
  issueType: z.enum(['overpacing', 'underpacing', 'no_spend', 'paused_with_budget', 'stale_sync']).optional(),
})
type Args = z.infer<typeof params>

async function checkPacing(args: Args) {
  const now = new Date()
  const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  const rows = await queryRows<PacingReviewRow>(
    `SELECT ${PACING_REVIEW_SELECT_COLUMNS} FROM media_spend ms LEFT JOIN agency_clients ac ON ac.id = ms.client_id WHERE ms.period = $1`,
    [period],
  )
  const review = buildPacingReview(rows, { now, period })
  let items = review.items.filter(isActionablePacingItem)
  if (args.issueType) items = items.filter(i => i.issueType === args.issueType)
  const top = items.slice(0, 25).map(i => ({
    client: i.clientName, campaign: i.campaignName, platform: i.platform,
    issue: i.issueType, severity: i.severity, pacingRatio: i.pacingRatio,
    currentDailyBudget: i.currentDailyBudget, recommendedDailyBudget: i.recommendedDailyBudget,
    recommendedAction: i.recommendedAction,
  }))
  return ok({ period, count: items.length, items: top })
}

export const checkPacingTool: AiTool<Args> = {
  name: 'check_pacing',
  description: 'List campaigns with current ad-spend pacing issues (over/under-pacing, no-spend, paused-with-budget, stale data) for the current month. Each item has the client, campaign, platform, issue type, severity, current vs recommended daily budget, and a recommended action. Use for "what is pacing badly / which campaigns are overspending / what needs a budget review". Read-only — it never changes any budget. Optionally filter by issueType.',
  parameters: params,
  requiredPermission: 'MEDIA_BUYING',
  handler: (a) => checkPacing(a),
}
```

- [ ] **Step 3: Register the tool**

Add `checkPacingTool` to the `registry` array in `server/utils/ai/tools/index.ts` (import it at the top, add to the array).

- [ ] **Step 4: Typecheck**

Run: `pnpm -C /Users/paulgiurin/Documents/Projects/dashboard/.worktrees/ops-autopilot exec tsc --noEmit -p .nuxt/tsconfig.server.json 2>&1 | grep -iE "checkPacing|tools/index" || echo "no errors in check_pacing tool"`
Expected: `no errors in check_pacing tool`.

- [ ] **Step 5: Commit**

```bash
git add server/utils/ai/tools/checkPacing.ts server/utils/ai/tools/index.ts
git commit -m "feat(ops-autopilot): check_pacing read-only AI tool (C1.1)"
```

---

## Self-Review

**Spec coverage:** monitoring-only pacing watchdog (Tasks 1–3) raising deduped escalations into the A.1 inbox; read-only `check_pacing` tool (Task 4). No platform writes anywhere. ✅
**Deferred (not gaps):** companion-Worker cron registration (infra/operator — add the trigger like `pages-cron`); live on-platform daily-budget read-back; client_id linkage on escalations (PacingReviewItem lacks it); auto-resolving escalations when an issue clears; run-level telemetry. Each is a clean follow-on (C1.2).
**Placeholder scan:** none — Task 4 Step 1 explicitly verifies the `ok()`/`ToolContext` import path against `anomalies.ts` before writing (the one spot that could drift).
**Type consistency:** `EscalationInput`/`PacingReviewItem`/`PacingReviewIssueType`/`PacingReviewRow` are imported from their real modules; `raiseEscalation` returns `{ id, status, created_at }` (A.1) — runner uses `row.id`. ✅
**Safety:** the only writes are `INSERT`s into `automation_escalations` (via `raiseEscalation`) + notifications. No ad-platform API calls. Cron is `x-cron-secret`-gated and dormant until a trigger is registered.
