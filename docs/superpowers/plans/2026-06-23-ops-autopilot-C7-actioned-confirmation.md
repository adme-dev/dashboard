# C7 Actioned-Confirmation Loop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tell a briefer when their brief is actioned, and alert when it stalls — so the system answers "is this actioned?" instead of Matthew chasing.

**Architecture:** A pure helper module (`actionedConfirmation.ts`) holds all decision/format logic (unit-tested, no DB). A thin fail-open DB adapter (`actionedConfirmationRunner.ts`) is called from the brief assignment/conversion endpoints (ack) and a daily cron (stall sweep). All gated by `C7_CONFIRMATION_ENABLED` (off) + an unregistered cron → dormant by default. No task/status mutation.

**Tech Stack:** Nitro (h3) server routes, Neon Postgres via `server/utils/db.ts` (`queryOne`/`queryRows`/`execute`), Vitest (pure-helper tests, no DB), existing `createNotification` + A.1 escalation spine.

## Global Constraints
- Server imports use `~~/server/...` (NOT `~/server/...`).
- Dormant by default: every runtime path no-ops unless `C7_CONFIRMATION_ENABLED === 'true'`.
- Fail-open: hooks/cron never throw into the request; errors are `console.error`-logged.
- No platform/task/status mutation — C7 only notifies + raises escalations.
- Stall fan-out is capped by `OPS_AUTOPILOT_NOTIFY_ALLOWLIST` (already implemented in `notifyEscalationApprovers`).
- SLA = **1 working day** (Mon–Fri; holidays ignored in v1), or `requested_deadline` if sooner.
- Notification type for briefer-facing messages: `brief_actioned`.
- Pure-helper tests live in `test/automation/` and import via `~~/server/...`; they must not touch the DB.

---

### Task 1: Migration 195 + `brief_actioned` notification type

**Files:**
- Create: `server/database/migrations/195_ops_autopilot_c7_actioned.sql`
- Modify: `server/utils/notifications.ts` (NotificationType union, ~line 37)
- Modify: `app/composables/useNotifications.ts` (icon map ~line 160, color map ~line 183)
- Modify: `app/components/inbox/InboxNotification.vue` (typeLabelMap, ~line 64)

**Interfaces:**
- Produces: two nullable `briefs` columns `c7_acknowledged_at`, `c7_stall_alerted_at`; notification type string `'brief_actioned'`.

- [ ] **Step 1: Write the migration**

```sql
-- 195_ops_autopilot_c7_actioned.sql
-- Ops Autopilot C7 — dedup stamps for the actioned-confirmation loop. Additive, dormant
-- (only read/written when C7_CONFIRMATION_ENABLED=true). Rollback: drop the two columns.
ALTER TABLE briefs ADD COLUMN IF NOT EXISTS c7_acknowledged_at TIMESTAMPTZ;
ALTER TABLE briefs ADD COLUMN IF NOT EXISTS c7_stall_alerted_at TIMESTAMPTZ;
```

- [ ] **Step 2: Apply it (additive, zero behaviour — 0 briefs, flag off)**

Run:
```bash
export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d= -f2-)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/database/migrations/195_ops_autopilot_c7_actioned.sql
psql "$DATABASE_URL" -tA -c "SELECT column_name FROM information_schema.columns WHERE table_name='briefs' AND column_name LIKE 'c7_%' ORDER BY 1"
```
Expected: `ALTER TABLE` ×2, then `c7_acknowledged_at` / `c7_stall_alerted_at`.

- [ ] **Step 3: Add the notification type to the union**

In `server/utils/notifications.ts`, in the `NotificationType` union, after `| 'social_sla_breach'` add:
```ts
  | 'brief_actioned'
```

- [ ] **Step 4: Add icon + color (frontend maps)**

In `app/composables/useNotifications.ts` `getNotificationIcon` icons map add:
```ts
      brief_actioned: 'i-lucide-circle-check-big',
```
In `getNotificationColor` colors map add:
```ts
      brief_actioned: 'text-emerald-500',
```

- [ ] **Step 5: Add the inbox label**

In `app/components/inbox/InboxNotification.vue` `typeLabelMap` add:
```ts
  brief_actioned: 'Brief',
```

- [ ] **Step 6: Commit**

```bash
git add server/database/migrations/195_ops_autopilot_c7_actioned.sql server/utils/notifications.ts app/composables/useNotifications.ts app/components/inbox/InboxNotification.vue
git commit -m "feat(c7): brief actioned dedup columns (mig 195) + brief_actioned notification type"
```

---

### Task 2: Working-day SLA helpers (pure, TDD)

**Files:**
- Create: `server/utils/automation/actionedConfirmation.ts`
- Test: `test/automation/actionedConfirmation.test.ts`

**Interfaces:**
- Produces: `addWorkingDays(from: Date, n: number): Date`; `isStalled(b: BriefForC7, now: Date, slaWorkingDays?: number): boolean`; `isC7Enabled(): boolean`; and the `BriefForC7` interface (consumed by Tasks 3–4).

- [ ] **Step 1: Write the failing tests**

```ts
// test/automation/actionedConfirmation.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import { addWorkingDays, isStalled, isC7Enabled, type BriefForC7 } from '~~/server/utils/automation/actionedConfirmation'

const brief = (o: Partial<BriefForC7> = {}): BriefForC7 => ({
  id: 'b1', title: 'Test brief', submitted_by: 'u1', submitted_at: '2026-06-15T00:00:00Z',
  assigned_to: null, assignee_name: null, client_id: null,
  converted_to_task_id: null, converted_to_project_id: null, requested_deadline: null,
  c7_acknowledged_at: null, c7_stall_alerted_at: null, ...o
})

describe('addWorkingDays', () => {
  it('Mon + 1 = Tue', () => { expect(addWorkingDays(new Date('2026-06-15T00:00:00Z'), 1).getUTCDate()).toBe(16) }) // 15 Jun 2026 = Monday
  it('Fri + 1 = Mon (skips weekend)', () => { expect(addWorkingDays(new Date('2026-06-19T00:00:00Z'), 1).getUTCDate()).toBe(22) }) // 19 Jun = Fri → 22 = Mon
})

describe('isC7Enabled', () => {
  const prev = process.env.C7_CONFIRMATION_ENABLED
  afterEach(() => { if (prev === undefined) delete process.env.C7_CONFIRMATION_ENABLED; else process.env.C7_CONFIRMATION_ENABLED = prev })
  it('only "true" enables', () => {
    delete process.env.C7_CONFIRMATION_ENABLED; expect(isC7Enabled()).toBe(false)
    process.env.C7_CONFIRMATION_ENABLED = 'true'; expect(isC7Enabled()).toBe(true)
  })
})

describe('isStalled', () => {
  const now = new Date('2026-06-17T09:00:00Z') // Wed, 2 days after Mon submit
  it('stalled when past 1 working day and untouched', () => { expect(isStalled(brief(), now)).toBe(true) })
  it('not stalled before SLA', () => { expect(isStalled(brief({ submitted_at: '2026-06-17T08:00:00Z' }), now)).toBe(false) })
  it('not stalled once assigned', () => { expect(isStalled(brief({ assigned_to: 'x' }), now)).toBe(false) })
  it('not stalled once converted', () => { expect(isStalled(brief({ converted_to_task_id: 't' }), now)).toBe(false) })
  it('not stalled if already alerted', () => { expect(isStalled(brief({ c7_stall_alerted_at: '2026-06-16T00:00:00Z' }), now)).toBe(false) })
  it('not stalled if already acknowledged', () => { expect(isStalled(brief({ c7_acknowledged_at: '2026-06-16T00:00:00Z' }), now)).toBe(false) })
  it('uses requested_deadline if sooner', () => { expect(isStalled(brief({ submitted_at: '2026-06-16T00:00:00Z', requested_deadline: '2026-06-16T18:00:00Z' }), now)).toBe(true) })
})
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `pnpm exec vitest run test/automation/actionedConfirmation.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the module (helpers used by this task)**

```ts
// server/utils/automation/actionedConfirmation.ts
// Pure decision + format logic for C7 (actioned-confirmation loop). No DB, no side effects.
import type { EscalationInput } from '~~/server/utils/automation/escalations'

export interface BriefForC7 {
  id: string
  title: string | null
  submitted_by: string | null
  submitted_at: string | null
  assigned_to: string | null
  assignee_name: string | null
  client_id: string | null
  converted_to_task_id: string | null
  converted_to_project_id: string | null
  requested_deadline: string | null
  c7_acknowledged_at: string | null
  c7_stall_alerted_at: string | null
}

export function isC7Enabled(): boolean {
  return process.env.C7_CONFIRMATION_ENABLED === 'true'
}

export function addWorkingDays(from: Date, n: number): Date {
  const d = new Date(from.getTime())
  let added = 0
  while (added < n) {
    d.setUTCDate(d.getUTCDate() + 1)
    const day = d.getUTCDay() // 0=Sun, 6=Sat
    if (day !== 0 && day !== 6) added++
  }
  return d
}

export function isStalled(b: BriefForC7, now: Date, slaWorkingDays = 1): boolean {
  if (b.c7_acknowledged_at || b.c7_stall_alerted_at) return false
  if (b.assigned_to || b.converted_to_task_id || b.converted_to_project_id) return false
  if (!b.submitted_at) return false
  const submitted = new Date(b.submitted_at)
  if (Number.isNaN(submitted.getTime())) return false
  let due = addWorkingDays(submitted, slaWorkingDays)
  if (b.requested_deadline) {
    const dl = new Date(b.requested_deadline)
    if (!Number.isNaN(dl.getTime()) && dl < due) due = dl
  }
  return now > due
}
```
> Note: `EscalationInput` import is used by Task 3 (same file). Add it now to avoid a second edit.

- [ ] **Step 4: Run tests, verify pass**

Run: `pnpm exec vitest run test/automation/actionedConfirmation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/automation/actionedConfirmation.ts test/automation/actionedConfirmation.test.ts
git commit -m "feat(c7): working-day SLA + isStalled pure helpers (TDD)"
```

---

### Task 3: Action-detection + message builders (pure, TDD)

**Files:**
- Modify: `server/utils/automation/actionedConfirmation.ts`
- Test: `test/automation/actionedConfirmation.test.ts` (append)

**Interfaces:**
- Consumes: `BriefForC7` (Task 2).
- Produces: `isFirstAction(b): boolean`; `ackNotification(b, suggestion?): AckParams | null`; `stallEscalation(b, suggestion?): { escalation: EscalationInput, briefer: AckParams | null }`. `AckParams = { userId: string, type: 'brief_actioned', title: string, message: string, link: string, reason: 'direct' }`.

- [ ] **Step 1: Append failing tests**

```ts
// append to test/automation/actionedConfirmation.test.ts
import { isFirstAction, ackNotification, stallEscalation } from '~~/server/utils/automation/actionedConfirmation'

describe('isFirstAction', () => {
  it('true when assigned + not acked', () => { expect(isFirstAction(brief({ assigned_to: 'x' }))).toBe(true) })
  it('true when converted + not acked', () => { expect(isFirstAction(brief({ converted_to_task_id: 't' }))).toBe(true) })
  it('false when not actioned', () => { expect(isFirstAction(brief())).toBe(false) })
  it('false when already acked', () => { expect(isFirstAction(brief({ assigned_to: 'x', c7_acknowledged_at: '2026-06-16T00:00:00Z' }))).toBe(false) })
})

describe('ackNotification', () => {
  it('assigned → "picked up by" + emerald type/route', () => {
    const n = ackNotification(brief({ assigned_to: 'x', assignee_name: 'Craig' }))!
    expect(n).toMatchObject({ userId: 'u1', type: 'brief_actioned', reason: 'direct', link: '/agency/briefs/b1' })
    expect(n.message).toContain('picked up by Craig')
  })
  it('converted without assignee → "production pipeline", never null name', () => {
    const n = ackNotification(brief({ converted_to_task_id: 't' }))!
    expect(n.message).toContain('production pipeline')
    expect(n.message).not.toContain('null')
  })
  it('appends suggestion when given', () => {
    expect(ackNotification(brief({ assigned_to: 'x' }), 'Check the deadline')!.message).toContain('Suggested next step: Check the deadline')
  })
  it('null when no briefer', () => { expect(ackNotification(brief({ submitted_by: null, assigned_to: 'x' }))).toBeNull() })
})

describe('stallEscalation', () => {
  it('builds a brief_sla warning escalation + briefer alert', () => {
    const { escalation, briefer } = stallEscalation(brief({ client_id: 'c1' }))
    expect(escalation).toMatchObject({ capability: 'brief_sla', severity: 'warning', clientId: 'c1', proposedAction: null })
    expect(escalation.detail).toMatchObject({ briefId: 'b1' })
    expect(briefer).toMatchObject({ userId: 'u1', type: 'brief_actioned', reason: 'direct' })
  })
  it('briefer null when no submitter', () => { expect(stallEscalation(brief({ submitted_by: null })).briefer).toBeNull() })
})
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm exec vitest run test/automation/actionedConfirmation.test.ts`
Expected: FAIL (functions not exported).

- [ ] **Step 3: Append the implementation**

```ts
// append to server/utils/automation/actionedConfirmation.ts
export interface AckParams {
  userId: string
  type: 'brief_actioned'
  title: string
  message: string
  link: string
  reason: 'direct'
}

export function isFirstAction(b: BriefForC7): boolean {
  if (b.c7_acknowledged_at) return false
  return Boolean(b.assigned_to || b.converted_to_task_id || b.converted_to_project_id)
}

function withSuggestion(base: string, suggestion?: string): string {
  return suggestion ? `${base}\n\nSuggested next step: ${suggestion}` : base
}

export function ackNotification(b: BriefForC7, suggestion?: string): AckParams | null {
  if (!b.submitted_by) return null
  const title = b.title || 'Your brief'
  const base = b.assigned_to
    ? `Your brief "${title}" has been picked up${b.assignee_name ? ` by ${b.assignee_name}` : ''}.`
    : `Your brief "${title}" is now in the production pipeline.`
  return { userId: b.submitted_by, type: 'brief_actioned', title: 'Brief actioned', message: withSuggestion(base, suggestion), link: `/agency/briefs/${b.id}`, reason: 'direct' }
}

export function stallEscalation(b: BriefForC7, suggestion?: string): { escalation: EscalationInput, briefer: AckParams | null } {
  const title = b.title || 'Untitled brief'
  const escalation: EscalationInput = {
    capability: 'brief_sla',
    title: `Brief SLA breach: ${title}`,
    severity: 'warning',
    clientId: b.client_id ?? null,
    detail: { briefId: b.id, submittedAt: b.submitted_at, requestedDeadline: b.requested_deadline },
    proposedAction: null,
    assignedRole: 'AUTOMATION'
  }
  const briefer: AckParams | null = b.submitted_by
    ? { userId: b.submitted_by, type: 'brief_actioned', title: 'Brief not actioned', message: withSuggestion(`Brief "${title}" hasn't been actioned yet.`, suggestion), link: `/agency/briefs/${b.id}`, reason: 'direct' }
    : null
  return { escalation, briefer }
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm exec vitest run test/automation/actionedConfirmation.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git add server/utils/automation/actionedConfirmation.ts test/automation/actionedConfirmation.test.ts
git commit -m "feat(c7): action-detection + ack/stall message builders (TDD)"
```

---

### Task 4: DB adapter (ack + SLA sweep runners)

**Files:**
- Create: `server/utils/automation/actionedConfirmationRunner.ts`

**Interfaces:**
- Consumes: pure helpers (Tasks 2–3), `createNotification`, `raiseEscalation`, `notifyEscalationApprovers`, `queryOne`/`queryRows`/`execute`.
- Produces: `maybeAcknowledgeBrief(briefId: string, opts?: { force?: boolean }): Promise<void>`; `runBriefSlaSweep(opts?: { now?: Date, force?: boolean }): Promise<{ checked: number, alerted: number }>`.

> No unit test — DB adapters are not unit-tested in this repo (the pure logic in Tasks 2–3 is the tested surface; mirrors `briefGatekeeper` vs `briefGatekeeperRunner`). Verified by `tsc` + the activation smoke (Task 7 / runbook).

- [ ] **Step 1: Write the adapter**

```ts
// server/utils/automation/actionedConfirmationRunner.ts
// Thin, fail-open DB adapter for C7. Pure logic lives in ./actionedConfirmation.
import { queryOne, queryRows, execute } from '~~/server/utils/db'
import { createNotification } from '~~/server/utils/notifications'
import { raiseEscalation } from '~~/server/utils/automation/escalationsStore'
import { notifyEscalationApprovers } from '~~/server/utils/automation/notifyEscalation'
import { isC7Enabled, isFirstAction, ackNotification, isStalled, stallEscalation, type BriefForC7 } from '~~/server/utils/automation/actionedConfirmation'

const SELECT_BRIEF = `
  SELECT b.id, b.title, b.submitted_by, b.submitted_at, b.assigned_to, b.client_id,
         b.converted_to_task_id, b.converted_to_project_id, b.requested_deadline,
         b.c7_acknowledged_at, b.c7_stall_alerted_at,
         tm.name AS assignee_name
    FROM briefs b
    LEFT JOIN team_members tm ON b.assigned_to = tm.id`

// Called from the brief assignment/conversion endpoints. One ack per brief, ever.
export async function maybeAcknowledgeBrief(briefId: string, opts: { force?: boolean } = {}): Promise<void> {
  if (!isC7Enabled() && !opts.force) return
  try {
    const b = await queryOne<BriefForC7>(`${SELECT_BRIEF} WHERE b.id = $1`, [briefId])
    if (!b || !isFirstAction(b)) return
    // Stamp first (idempotent guard against double-fire) then notify.
    await execute(`UPDATE briefs SET c7_acknowledged_at = NOW() WHERE id = $1 AND c7_acknowledged_at IS NULL`, [briefId])
    const n = ackNotification(b)
    if (n) await createNotification(n)
  } catch (err) {
    console.error('[c7] ack failed', briefId, err)
  }
}

// Daily: find stalled, un-actioned briefs → escalation (team, allowlist-capped) + briefer alert.
export async function runBriefSlaSweep(opts: { now?: Date, force?: boolean } = {}): Promise<{ checked: number, alerted: number }> {
  if (!isC7Enabled() && !opts.force) return { checked: 0, alerted: 0 }
  const now = opts.now ?? new Date()
  let checked = 0
  let alerted = 0
  try {
    const rows = await queryRows<BriefForC7>(
      `${SELECT_BRIEF}
        WHERE b.submitted_at IS NOT NULL
          AND b.c7_acknowledged_at IS NULL AND b.c7_stall_alerted_at IS NULL
          AND b.assigned_to IS NULL AND b.converted_to_task_id IS NULL AND b.converted_to_project_id IS NULL`)
    for (const b of rows) {
      checked++
      if (!isStalled(b, now)) continue
      await execute(`UPDATE briefs SET c7_stall_alerted_at = NOW() WHERE id = $1 AND c7_stall_alerted_at IS NULL`, [b.id])
      const { escalation, briefer } = stallEscalation(b)
      const row = await raiseEscalation(escalation)
      if (row?.id) {
        await notifyEscalationApprovers({ escalationId: row.id, capability: escalation.capability, title: escalation.title, severity: 'warning' })
      }
      if (briefer) await createNotification(briefer)
      alerted++
    }
  } catch (err) {
    console.error('[c7] sla sweep failed', err)
  }
  return { checked, alerted }
}
```

- [ ] **Step 2: Typecheck the changed files**

Run: `pnpm exec nuxi prepare && NODE_OPTIONS='--max-old-space-size=16384' pnpm exec vue-tsc --noEmit -p .nuxt/tsconfig.server.json 2>&1 | grep actionedConfirmation || echo "no new errors in C7 files"`
Expected: `no new errors in C7 files`.

- [ ] **Step 3: Commit**

```bash
git add server/utils/automation/actionedConfirmationRunner.ts
git commit -m "feat(c7): fail-open DB adapter — maybeAcknowledgeBrief + runBriefSlaSweep"
```

---

### Task 5: Hook ack into the assignment + conversion endpoints

**Files:**
- Modify: `server/api/agency/briefs/[id].put.ts`
- Modify: `server/api/agency/briefs/bulk/assign.patch.ts`
- Modify: `server/api/agency/briefs/[id]/convert.post.ts`

**Interfaces:**
- Consumes: `maybeAcknowledgeBrief` (Task 4).

> `maybeAcknowledgeBrief` is internally fail-open and flag-gated, so each call is a single awaited line after the successful write. It self-checks `isFirstAction`, so calling it on every update/assign/convert is safe (no-op when not the first action or flag off).

- [ ] **Step 1: Hook the single-brief update/assign**

In `server/api/agency/briefs/[id].put.ts`: add the import at top:
```ts
import { maybeAcknowledgeBrief } from '~~/server/utils/automation/actionedConfirmationRunner'
```
After the brief `UPDATE` succeeds and before the handler returns its response, add:
```ts
  // C7: confirm to the briefer once the brief is first actioned (flag-gated, fail-open).
  await maybeAcknowledgeBrief(id)
```
(`id` is the existing `getRouterParam(event, 'id')` value in this handler.)

- [ ] **Step 2: Hook the bulk assign**

In `server/api/agency/briefs/bulk/assign.patch.ts`: add the same import, then after the bulk assignment write, loop the affected ids:
```ts
  // C7: ack each newly-assigned brief (flag-gated, fail-open, deduped per brief).
  for (const briefId of ids) await maybeAcknowledgeBrief(briefId)
```
(Use the handler's existing variable holding the assigned brief id list; if it is named differently than `ids`, use that name.)

- [ ] **Step 3: Hook the conversion**

In `server/api/agency/briefs/[id]/convert.post.ts`: add the same import, then after `converted_to_task_id`/`converted_to_project_id` is written, add:
```ts
  // C7: a converted brief counts as actioned (flag-gated, fail-open).
  await maybeAcknowledgeBrief(id)
```

- [ ] **Step 4: Typecheck**

Run: `pnpm exec nuxi prepare && NODE_OPTIONS='--max-old-space-size=16384' pnpm exec vue-tsc --noEmit -p .nuxt/tsconfig.server.json 2>&1 | grep -E "briefs/\[id\]|bulk/assign|convert" || echo "no new errors in hooked endpoints"`
Expected: `no new errors in hooked endpoints`.

- [ ] **Step 5: Commit**

```bash
git add server/api/agency/briefs/[id].put.ts server/api/agency/briefs/bulk/assign.patch.ts server/api/agency/briefs/[id]/convert.post.ts
git commit -m "feat(c7): fire actioned-ack on brief assign/convert (flag-gated, fail-open)"
```

---

### Task 6: SLA cron endpoint (dormant — not registered)

**Files:**
- Create: `server/api/cron/ops-autopilot-brief-sla.post.ts`

**Interfaces:**
- Consumes: `runBriefSlaSweep` (Task 4).

- [ ] **Step 1: Write the cron handler**

```ts
// server/api/cron/ops-autopilot-brief-sla.post.ts
// C7 daily brief-SLA sweep. Notify-only (escalations + briefer alerts); no platform/task writes.
// DORMANT: no-ops unless C7_CONFIRMATION_ENABLED=true; NOT registered in workers/pages-cron.
import { createError, getHeader, getQuery } from 'h3'
import { runBriefSlaSweep } from '~~/server/utils/automation/actionedConfirmationRunner'

export default defineEventHandler(async (event) => {
  const cronSecret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && cronSecret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const query = getQuery(event)
  const force = query.force === 'true' || query.force === '1'
  const start = Date.now()
  const result = await runBriefSlaSweep({ now: new Date(), force })
  return { ok: true, durationMs: Date.now() - start, ...result }
})
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec nuxi prepare && NODE_OPTIONS='--max-old-space-size=16384' pnpm exec vue-tsc --noEmit -p .nuxt/tsconfig.server.json 2>&1 | grep "ops-autopilot-brief-sla" || echo "no new errors in cron"`
Expected: `no new errors in cron`.

- [ ] **Step 3: Commit**

```bash
git add server/api/cron/ops-autopilot-brief-sla.post.ts
git commit -m "feat(c7): daily brief-SLA sweep cron (dormant, unregistered)"
```

---

### Task 7: Activation runbook entry + full-suite verification

**Files:**
- Modify: `docs/superpowers/runbooks/2026-06-23-ops-autopilot-activation-runbook.md`

- [ ] **Step 1: Add a C7 section to the runbook** (after the C2 section)

```markdown
## C7 — Brief actioned-confirmation  *(no platform writes; needs brief adoption)*
**Prereqs:** §0 allowlist set; briefing actually flowing through the dashboard.
**Turn on:** set `C7_CONFIRMATION_ENABLED=true` → redeploy; register
`'/api/cron/ops-autopilot-brief-sla'` in `pages-cron` ROUTES (daily).
**Verify:** assign a test brief → its submitter gets one "picked up" notification (no repeat on
re-assign). Leave a test brief un-actioned + force the cron (`?force=true`) → one `brief_sla`
escalation (allowlisted recipients) + one "not actioned" alert to the submitter; force again →
no repeat (dedup via `c7_stall_alerted_at`).
**Rollback:** unset `C7_CONFIRMATION_ENABLED` (and/or remove the cron route) → redeploy.
```

- [ ] **Step 2: Run the full automation suite**

Run: `pnpm exec vitest run test/automation/`
Expected: all pass (includes `actionedConfirmation.test.ts`).

- [ ] **Step 3: Lint the changed source**

Run: `pnpm exec eslint server/utils/automation/actionedConfirmation.ts server/utils/automation/actionedConfirmationRunner.ts server/api/cron/ops-autopilot-brief-sla.post.ts test/automation/actionedConfirmation.test.ts`
Expected: no new errors (auto-fix stylistic with `--fix` if needed).

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/runbooks/2026-06-23-ops-autopilot-activation-runbook.md
git commit -m "docs(c7): activation runbook entry for the brief actioned-confirmation loop"
```

---

## Self-review notes
- **Spec coverage:** ack-on-pickup (Tasks 3–5), stall-SLA (Tasks 3,4,6), 1-working-day SLA + requested_deadline (Task 2), dedup columns (Task 1), `brief_actioned` type + maps (Task 1), allowlist-capped fan-out (Task 4 via `notifyEscalationApprovers`), no mutation (proposedAction null, no status writes), AI `suggestion` seam (`withSuggestion` in Task 3), dormancy (`isC7Enabled` everywhere + unregistered cron), fail-open (try/catch in Task 4 adapters). All covered.
- **Dedup correctness:** ack guarded by `c7_acknowledged_at` (+ `isFirstAction`); stall guarded by `c7_stall_alerted_at` + the SELECT filter. One ack, one stall alert per brief.
- **Types:** `BriefForC7` (Task 2) reused by Tasks 3–4; `AckParams` (Task 3) returned by `ackNotification`/`stallEscalation`; `runBriefSlaSweep`/`maybeAcknowledgeBrief` signatures match across Tasks 4–6.
