# Spend Auto-Action Engine (v1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the existing pacing detectors, a per-severity policy can notify and/or auto-propose a PLANNED budget adjustment into the existing approve→apply queue — no autonomous platform writes.

**Architecture:** Pure decision engine (`decideAutoActions`) over `buildPacingReview` items + a per-severity policy in `agency_settings`; an injected-deps executor that creates planned `campaign_action_log` rows (`source:'auto_action'`, deduped) and notifications; a cron on the existing pages-cron rails; a small settings panel + "Auto-proposed" badge. Ships dormant (`enabled:false`).

**Tech Stack:** Nitro (Nuxt 4), TypeScript, Vitest, Zod, Nuxt UI v4.

**Spec:** `docs/superpowers/specs/2026-06-16-spend-auto-action-engine-design.md`
**Working dir:** worktree `.worktrees/spend-auto-action` (branch `feat/spend-auto-action`). Run `npx nuxt prepare` once if `.nuxt` is missing.

---

## Task 1: Policy config module

**Files:**
- Create: `server/utils/spendAutoActionConfig.ts`
- Test: `test/server/utils/spendAutoActionConfig.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { mergeAutoActionPolicy, DEFAULT_AUTO_ACTION_POLICY } from '~~/server/utils/spendAutoActionConfig'

describe('mergeAutoActionPolicy', () => {
  it('defaults to disabled with all severities off', () => {
    expect(DEFAULT_AUTO_ACTION_POLICY.enabled).toBe(false)
    expect(DEFAULT_AUTO_ACTION_POLICY.perSeverity).toEqual({ critical: 'off', warning: 'off', info: 'off' })
  })
  it('overlays a stored partial over defaults', () => {
    const m = mergeAutoActionPolicy({ enabled: true, perSeverity: { critical: 'propose' } as any })
    expect(m.enabled).toBe(true)
    expect(m.perSeverity.critical).toBe('propose')
    expect(m.perSeverity.warning).toBe('off') // default preserved
  })
  it('returns defaults for null/undefined', () => {
    expect(mergeAutoActionPolicy(null)).toEqual(DEFAULT_AUTO_ACTION_POLICY)
  })
})
```

- [ ] **Step 2: Run — expect FAIL (module missing).** `npx vitest run test/server/utils/spendAutoActionConfig.test.ts`

- [ ] **Step 3: Implement**

```ts
import { execute, queryOne } from '~~/server/utils/db'

export type AutoActionMode = 'off' | 'notify' | 'propose'
export interface AutoActionPolicy {
  enabled: boolean
  perSeverity: { critical: AutoActionMode; warning: AutoActionMode; info: AutoActionMode }
  clientOverrides?: Record<string, { perSeverity?: Partial<Record<'critical' | 'warning' | 'info', AutoActionMode>> }>
}

export const DEFAULT_AUTO_ACTION_POLICY: AutoActionPolicy = {
  enabled: false,
  perSeverity: { critical: 'off', warning: 'off', info: 'off' },
}

export function mergeAutoActionPolicy(stored: Partial<AutoActionPolicy> | null | undefined): AutoActionPolicy {
  if (!stored) return { ...DEFAULT_AUTO_ACTION_POLICY, perSeverity: { ...DEFAULT_AUTO_ACTION_POLICY.perSeverity } }
  return {
    enabled: stored.enabled ?? DEFAULT_AUTO_ACTION_POLICY.enabled,
    perSeverity: { ...DEFAULT_AUTO_ACTION_POLICY.perSeverity, ...(stored.perSeverity ?? {}) },
    clientOverrides: stored.clientOverrides,
  }
}

export async function getSpendAutoActionPolicy(tenantId: string): Promise<AutoActionPolicy> {
  const row = await queryOne<{ value: Partial<AutoActionPolicy> }>(
    `SELECT value FROM agency_settings WHERE tenant_id = $1 AND key = 'spend_auto_action'`,
    [tenantId],
  )
  return mergeAutoActionPolicy(row?.value)
}

export async function saveSpendAutoActionPolicy(tenantId: string, policy: AutoActionPolicy, updatedBy: string | null): Promise<void> {
  await execute(
    `INSERT INTO agency_settings (tenant_id, key, value, updated_by, updated_at, created_at)
     VALUES ($1, 'spend_auto_action', $2::jsonb, $3, NOW(), NOW())
     ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [tenantId, JSON.stringify(policy), updatedBy],
  )
}
```

- [ ] **Step 4: Run — expect PASS (3 tests).**
- [ ] **Step 5: Commit** — `git add ... && git commit -m "feat(spend): auto-action policy config (agency_settings)"`

---

## Task 2: Pure decision engine

**Files:**
- Create: `server/utils/spendAutoAction.ts`
- Test: `test/server/utils/spendAutoAction.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { decideAutoActions } from '~~/server/utils/spendAutoAction'
import type { AutoActionPolicy } from '~~/server/utils/spendAutoActionConfig'

const item = (over: any = {}) => ({ mediaSpendId: 'm1', platform: 'google', issueType: 'overpacing', severity: 'critical', currentDailyBudget: 100, recommendedDailyBudget: 120, clientId: 'c1', clientName: 'X', recommendedAction: 'Lower budget', ...over })
const policy = (over: any = {}): AutoActionPolicy => ({ enabled: true, perSeverity: { critical: 'propose', warning: 'notify', info: 'off' }, ...over })

describe('decideAutoActions', () => {
  it('maps severity → mode and drops off decisions', () => {
    const d = decideAutoActions([item(), item({ severity: 'warning' }), item({ severity: 'info' })] as any, policy())
    expect(d.map(x => x.mode)).toEqual(['propose', 'notify'])
  })
  it('returns nothing when policy disabled', () => {
    expect(decideAutoActions([item()] as any, policy({ enabled: false }))).toEqual([])
  })
  it('applies a per-client override', () => {
    const p = policy({ clientOverrides: { c1: { perSeverity: { critical: 'notify' } } } })
    expect(decideAutoActions([item()] as any, p)[0].mode).toBe('notify')
  })
  it('downgrades stale_sync from propose to notify', () => {
    const d = decideAutoActions([item({ issueType: 'stale_sync' })] as any, policy())
    expect(d[0].mode).toBe('notify')
  })
  it('skips malformed items without throwing', () => {
    const d = decideAutoActions([null, item()] as any, policy())
    expect(d).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**

```ts
import type { PacingReviewItem } from '~~/server/utils/socialSpendPacingReview'
import type { AutoActionMode, AutoActionPolicy } from '~~/server/utils/spendAutoActionConfig'

export interface AutoActionDecision { item: PacingReviewItem; mode: Exclude<AutoActionMode, 'off'> }

export function decideAutoActions(items: PacingReviewItem[], policy: AutoActionPolicy): AutoActionDecision[] {
  if (!policy.enabled) return []
  const out: AutoActionDecision[] = []
  for (const item of items || []) {
    if (!item || !item.mediaSpendId || !item.severity) continue
    const sev = item.severity as 'critical' | 'warning' | 'info'
    const override = (item as any).clientId ? policy.clientOverrides?.[(item as any).clientId]?.perSeverity?.[sev] : undefined
    let mode: AutoActionMode = override ?? policy.perSeverity[sev] ?? 'off'
    // Stale data must never drive an auto-proposal — downgrade to notify.
    if (mode === 'propose' && item.issueType === 'stale_sync') mode = 'notify'
    if (mode === 'off') continue
    out.push({ item, mode })
  }
  return out
}
```

Note: `PacingReviewItem` may not expose `clientId`; if TS complains, the `(item as any).clientId` cast already handles it. If the real type lacks it, client overrides simply never match (acceptable v1) — verify by reading `socialSpendPacingReview.ts` and, if `clientId` exists on the row, surface it onto the item.

- [ ] **Step 4: Run — expect PASS (5 tests).**
- [ ] **Step 5: Commit** — `"feat(spend): pure auto-action decision engine"`

---

## Task 3: Executor (injected deps)

**Files:**
- Create: `server/utils/spendAutoActionExecutor.ts`
- Test: `test/server/utils/spendAutoActionExecutor.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest'
import { executeAutoActions } from '~~/server/utils/spendAutoActionExecutor'

const dec = (over: any = {}) => ({ mode: 'propose', item: { mediaSpendId: 'm1', platform: 'google', issueType: 'overpacing', severity: 'critical', currentDailyBudget: 100, recommendedDailyBudget: 120, recommendedAction: 'Lower', ...over } })

function deps(over: any = {}) {
  return {
    recordCampaignAction: vi.fn().mockResolvedValue({ id: 'a1' }),
    hasOpenAutoAction: vi.fn().mockResolvedValue(false),
    notify: vi.fn().mockResolvedValue(undefined),
    ...over,
  }
}

describe('executeAutoActions', () => {
  it('proposes a planned auto_action + notifies', async () => {
    const d = deps()
    const r = await executeAutoActions([dec()] as any, d)
    expect(r).toEqual({ proposed: 1, notified: 1, skipped: 0 })
    const input = d.recordCampaignAction.mock.calls[0][0]
    expect(input.actionStatus).toBe('planned')
    expect(input.metadata.source).toBe('auto_action')
    expect(input.newValue).toEqual({ dailyBudget: 120 })
  })
  it('skips proposing when an open auto_action already exists', async () => {
    const d = deps({ hasOpenAutoAction: vi.fn().mockResolvedValue(true) })
    const r = await executeAutoActions([dec()] as any, d)
    expect(r.proposed).toBe(0); expect(r.skipped).toBe(1)
    expect(d.recordCampaignAction).not.toHaveBeenCalled()
  })
  it('notify mode notifies without recording an action', async () => {
    const d = deps()
    const r = await executeAutoActions([{ ...dec(), mode: 'notify' }] as any, d)
    expect(d.recordCampaignAction).not.toHaveBeenCalled()
    expect(r.notified).toBe(1)
  })
  it('isolates a per-item failure', async () => {
    const d = deps({ recordCampaignAction: vi.fn().mockRejectedValue(new Error('boom')) })
    const r = await executeAutoActions([dec()] as any, d)
    expect(r.skipped).toBe(1); expect(r.proposed).toBe(0)
  })
})
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**

```ts
import type { AutoActionDecision } from '~~/server/utils/spendAutoAction'

export interface AutoActionExecutorDeps {
  recordCampaignAction: (input: any) => Promise<{ id: string }>
  hasOpenAutoAction: (mediaSpendId: string, dailyBudget: number) => Promise<boolean>
  notify: (item: AutoActionDecision['item']) => Promise<void>
}

export async function executeAutoActions(
  decisions: AutoActionDecision[],
  deps: AutoActionExecutorDeps,
): Promise<{ proposed: number; notified: number; skipped: number }> {
  let proposed = 0, notified = 0, skipped = 0
  for (const { item, mode } of decisions || []) {
    try {
      if (mode === 'propose') {
        const dailyBudget = Number(item.recommendedDailyBudget)
        if (!Number.isFinite(dailyBudget) || dailyBudget <= 0) { skipped++; continue }
        if (await deps.hasOpenAutoAction(item.mediaSpendId, dailyBudget)) { skipped++; continue }
        await deps.recordCampaignAction({
          mediaSpendId: item.mediaSpendId,
          platform: item.platform,
          actionType: 'budget_update',
          actionStatus: 'planned',
          previousValue: { dailyBudget: item.currentDailyBudget },
          newValue: { dailyBudget },
          reason: item.recommendedAction,
          metadata: { source: 'auto_action', autoProposed: true, issueType: item.issueType, severity: item.severity },
        })
        proposed++
        await deps.notify(item)
        notified++
      } else if (mode === 'notify') {
        await deps.notify(item)
        notified++
      }
    } catch (err) {
      console.error('[SpendAutoAction] item failed, skipping:', (err as any)?.message)
      skipped++
    }
  }
  return { proposed, notified, skipped }
}
```

- [ ] **Step 4: Run — expect PASS (4 tests).**
- [ ] **Step 5: Commit** — `"feat(spend): auto-action executor (propose + notify, deduped, fail-safe)"`

---

## Task 4: Settings endpoints (GET + PUT)

**Files:**
- Create: `server/api/agency/social/spend/auto-action-settings.get.ts`, `server/api/agency/social/spend/auto-action-settings.put.ts`

Mirror `budget-control-settings.{get,put}.ts`. No unit test (integration-level, matches existing settings endpoints).

- [ ] **Step 1: GET**

```ts
import { defineEventHandler } from 'h3'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { getSelectedTenant } from '~~/server/utils/session'
import { getSpendAutoActionPolicy } from '~~/server/utils/spendAutoActionConfig'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, ['owner', 'admin'])
  const tenantId = await getSelectedTenant(event)
  return getSpendAutoActionPolicy(tenantId || '')
})
```

- [ ] **Step 2: PUT**

```ts
import { createError, defineEventHandler, readBody } from 'h3'
import { z } from 'zod'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { getSelectedTenant } from '~~/server/utils/session'
import { getSpendAutoActionPolicy, saveSpendAutoActionPolicy } from '~~/server/utils/spendAutoActionConfig'

const Mode = z.enum(['off', 'notify', 'propose'])
const Body = z.object({
  enabled: z.boolean().optional(),
  perSeverity: z.object({ critical: Mode.optional(), warning: Mode.optional(), info: Mode.optional() }).optional(),
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireRole(event, ['owner', 'admin'])
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid auto-action settings' })
  const current = await getSpendAutoActionPolicy(tenantId)
  const config = { ...current, ...parsed.data, perSeverity: { ...current.perSeverity, ...(parsed.data.perSeverity ?? {}) } }
  await saveSpendAutoActionPolicy(tenantId, config, user.id)
  return { ok: true, config }
})
```

- [ ] **Step 3: `npx nuxt prepare` (clean). Commit** — `"feat(spend): auto-action settings GET/PUT endpoints"`

---

## Task 5: Cron entrypoint

**Files:**
- Create: `server/api/cron/spend-auto-action.post.ts`

Integration glue over the tested units. Mirrors `budget-slack-digest.post.ts` (x-cron-secret auth + tenant resolution).

- [ ] **Step 1: Implement**

```ts
import { defineEventHandler, getHeader, createError } from 'h3'
import { queryRows, queryOne } from '~~/server/utils/db'
import { buildPacingReview, PACING_REVIEW_SELECT_COLUMNS, type PacingReviewRow } from '~~/server/utils/socialSpendPacingReview'
import { getSpendAutoActionPolicy } from '~~/server/utils/spendAutoActionConfig'
import { decideAutoActions } from '~~/server/utils/spendAutoAction'
import { executeAutoActions } from '~~/server/utils/spendAutoActionExecutor'
import { recordCampaignAction } from '~~/server/utils/campaignActionLog'
import { createNotification } from '~~/server/utils/notifications'

export default defineEventHandler(async (event) => {
  const cronSecret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && cronSecret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  // Single-tenant prod: resolve tenant the same way the budget config does.
  const conn = await queryOne<{ tenant_id: string }>(`SELECT tenant_id FROM xero_org_connection ORDER BY connected_at DESC LIMIT 1`)
  const tenantId = conn?.tenant_id || ''
  const policy = await getSpendAutoActionPolicy(tenantId)
  if (!policy.enabled) return { ok: true, skipped: 'disabled' }

  const now = new Date()
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const rows = await queryRows<PacingReviewRow>(
    `SELECT ${PACING_REVIEW_SELECT_COLUMNS}
     FROM media_spend ms LEFT JOIN agency_clients ac ON ac.id = ms.client_id
     WHERE ms.period = $1 AND ms.platform IN ('meta','google_ads')
     ORDER BY ms.actual_spend DESC`,
    [period],
  )
  const review = buildPacingReview(rows, { now, period })
  const decisions = decideAutoActions(review.items, policy)

  // Recipients for notify: owner/admin team members (same surface that can act).
  const recipients = await queryRows<{ id: string }>(
    `SELECT id FROM team_members WHERE role IN ('owner','admin') AND status = 'active'`,
  ).catch(() => [])

  const result = await executeAutoActions(decisions, {
    recordCampaignAction,
    hasOpenAutoAction: async (mediaSpendId, dailyBudget) => {
      const existing = await queryOne<{ id: string }>(
        `SELECT id FROM campaign_action_log
         WHERE media_spend_id = $1 AND action_type = 'budget_update'
           AND action_status IN ('planned','approved') AND metadata->>'source' = 'auto_action'
           AND (new_value->>'dailyBudget')::numeric = $2 LIMIT 1`,
        [mediaSpendId, dailyBudget],
      )
      return !!existing
    },
    notify: async (item) => {
      for (const r of recipients) {
        await createNotification({
          userId: r.id,
          type: 'system' as any, // use an existing NotificationType; confirm a valid value from notifications.ts
          title: `Ad-spend pacing: ${item.severity}`,
          message: `${item.clientName || 'Campaign'} — ${item.recommendedAction}`,
          link: '/agency/social/spend',
          reason: 'low_signal' as any, // confirm a valid NotificationReason
        }).catch(() => {})
      }
    },
  })
  return { ok: true, ...result }
})
```

Before committing: open `server/utils/notifications.ts`, confirm a valid `NotificationType` (replace `'system'`) and `NotificationReason` (replace `'low_signal'`); also confirm `team_members` has `role` + `status` columns (adjust the recipients query to the real schema, e.g. a permissions check used elsewhere).

- [ ] **Step 2: `npx nuxt prepare` clean. Commit** — `"feat(spend): auto-action cron (pacing → decide → propose/notify)"`

---

## Task 6: UI — settings panel + "Auto-proposed" badge

**Files:**
- Create: `app/components/social/SpendAutoActionSettings.vue`
- Modify: the action-list rendering in `app/components/social/SpendCampaignHistorySlideover.vue` (badge)

- [ ] **Step 1: Settings panel** — a `UCard`/section with an enable `USwitch` and three `USelect`s (critical/warning/info → off/notify/propose), loading via `$fetch('/api/agency/social/spend/auto-action-settings')` and saving via PUT. Reuse the budget-control settings panel markup as the template. Mount it wherever budget-control settings render (read that page to place it).

- [ ] **Step 2: Badge** — where the slideover renders each `campaignAction`/`platformActions` row, add: `<UBadge v-if="action.metadata?.source === 'auto_action'" color="info" variant="subtle" size="xs">Auto-proposed</UBadge>`. (Read the action-row markup to place it; confirm the action entry exposes `metadata`.)

- [ ] **Step 3: `npx nuxt prepare` clean. Commit** — `"feat(spend): auto-action settings panel + auto-proposed badge"`

---

## Task 7: Marketing sync

**Files:**
- Modify: `app/pages/features/[slug].vue` (`campaign-alerts` entry)

- [ ] **Step 1:** Append a sentence to a relevant `campaign-alerts` detail noting that a per-severity automation policy can auto-propose budget adjustments into the review queue (human approves/applies; nothing auto-executes in this version). **Commit** — `"docs(marketing): note spend auto-action policy in campaign-alerts"`

---

## Final verification (after all tasks)

- [ ] Run: `npx vitest run test/server/utils/spendAutoActionConfig.test.ts test/server/utils/spendAutoAction.test.ts test/server/utils/spendAutoActionExecutor.test.ts test/server/utils/socialSpendPacingReview.test.ts` — all green.
- [ ] `npx nuxt prepare` clean.
- [ ] Adversarial review (gsd-code-reviewer): confirm NO autonomous platform write exists anywhere (propose only creates planned rows); dedupe prevents floods; cron is fail-safe + auth-gated; `stale_sync` cannot propose; ships dormant (`enabled:false`); NotificationType/Reason + team_members query use real values.
- [ ] Confirm: no migration; policy defaults dormant; pages-cron worker route is an operator step (note in handoff).
```
