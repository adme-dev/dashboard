# Ops Autopilot — Phase A.1: Escalation Spine (backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend "escalation spine" — a capability-raised, human-decided approval queue (`automation_escalations`) with a pure domain module, a DB adapter, and AUTOMATION-gated list/decide API endpoints — so autonomous capabilities can escalate judgment calls to a human and have decisions recorded and notified.

**Architecture:** A new `automation_escalations` table holds escalations raised by autonomous capabilities (decoupled from chat's `ai_pending_actions` and from task-bound `task_approvals`). A **pure** module (`server/utils/automation/escalations.ts`) carries all domain logic (validation, decision guards, notification-param building, grouping) and is unit-tested. A thin DB adapter (`escalationsStore.ts`) wraps it with parameterized SQL. Two API endpoints (list + decide) expose it to the future inbox UI, gated by the existing `AUTOMATION` permission group. Decisions are race-safe via an atomic `UPDATE … WHERE status='pending'`.

**Tech Stack:** Nuxt 4 / Nitro server routes, Neon Postgres via `server/utils/db.ts` helpers (`queryOne`/`queryRows`, `$1` positional params), Vitest (pure unit tests under `test/`), `~~/server/utils/...` import alias.

## Global Constraints

- **Dashboard is the system of record** — escalations live in the dashboard DB, not Monday.
- **Spend/deploy always human-approved** — this spine is the human-approval surface; it never auto-executes a proposed action. (Execution of approved actions is a later phase.)
- **Reuse, don't duplicate** — runs are recorded in the existing `automation_executions`; this spine adds only the *escalation* concept. Notifications reuse `createNotification` with the existing `'approval_requested'` type (no new NotificationType union member in A.1).
- **DB access** only via `~~/server/utils/db.ts` helpers; parameterized `$1` queries; never string-interpolate values.
- **Server imports use `~~/server/utils/...`** (Nitro double-tilde alias), never `~/server/...`.
- **Migrations are idempotent** — comment header describing intent + `IF NOT EXISTS` guards. After creating the migration file, run it against the DB: `export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-); psql "$DATABASE_URL" -f server/database/migrations/<file>.sql`.
- **Permission gate:** human-facing endpoints require the `AUTOMATION` group (`owner`/`admin`/`lead`/`project_manager`) via `requirePermission(event, 'AUTOMATION')`.
- **Test command:** `pnpm test <file>` (Vitest; tests live under `test/**/*.{test,spec}.ts`).
- **Migration number:** plan uses `192`. The highest on `main` is `189`; `190`/`191` are taken by in-flight branches. At execution time, verify the next free number in `server/database/migrations/` and bump if collided (the number is ordering only).

---

## File Structure

- `server/database/migrations/192_automation_escalations.sql` — **Create.** The escalation table + indexes.
- `server/utils/automation/escalations.ts` — **Create.** Pure domain logic: types, `buildEscalationInsert`, `canDecide`/`assertDecidable`, `escalationNotificationParams`, `groupEscalations`. No I/O. Unit-tested.
- `server/utils/automation/escalationsStore.ts` — **Create.** DB adapter: `raiseEscalation`, `listPendingEscalations`, `getEscalation`, `decideEscalation`. Thin; delegates logic to `escalations.ts`.
- `server/utils/automation/notifyEscalation.ts` — **Create.** `notifyEscalationApprovers(...)` — finds AUTOMATION-eligible users and calls `createNotification`.
- `server/api/agency/automation/escalations/index.get.ts` — **Create.** List pending escalations (grouped), `AUTOMATION`-gated.
- `server/api/agency/automation/escalations/[id]/decide.post.ts` — **Create.** Approve/reject one escalation, `AUTOMATION`-gated, notifies on decision.
- `test/automation/escalations.test.ts` — **Create.** Unit tests for the pure module.

**Interfaces produced (relied on by later tasks / capabilities):**
- `raiseEscalation(input: EscalationInput): Promise<{ id: string; status: string; created_at: string }>` — capabilities call this to escalate.
- `EscalationInput` (see Task 2).
- `decideEscalation(id, decision, deciderId, note?)` — used by the decide endpoint and (later) the inbox UI.

---

### Task 1: Migration — `automation_escalations` table

**Files:**
- Create: `server/database/migrations/192_automation_escalations.sql`

**Interfaces:**
- Produces: the `automation_escalations` table consumed by Tasks 3–5.

- [ ] **Step 1: Write the migration**

```sql
-- Ops Autopilot Phase A.1 — capability-raised escalations (the human-on-call queue).
-- Decoupled from chat (ai_pending_actions) and from task approvals (task_approvals):
-- autonomous capabilities raise these for a human to approve/reject in /agency/automation.
-- Additive + idempotent.

CREATE TABLE IF NOT EXISTS automation_escalations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  capability TEXT NOT NULL,
  title TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  client_id UUID,
  run_id UUID,
  detail JSONB NOT NULL DEFAULT '{}',
  proposed_action JSONB,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','auto_resolved','expired')),
  assigned_role TEXT NOT NULL DEFAULT 'AUTOMATION',
  decided_by UUID,
  decided_at TIMESTAMPTZ,
  audit JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_escalations_status ON automation_escalations(status);
CREATE INDEX IF NOT EXISTS idx_automation_escalations_client ON automation_escalations(client_id);
CREATE INDEX IF NOT EXISTS idx_automation_escalations_created ON automation_escalations(created_at);
```

- [ ] **Step 2: Run the migration against the DB**

Run:
```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/192_automation_escalations.sql
```
Expected: `CREATE TABLE` then three `CREATE INDEX` lines (or no error on rerun thanks to `IF NOT EXISTS`).

- [ ] **Step 3: Verify the table exists**

Run:
```bash
psql "$DATABASE_URL" -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='automation_escalations' ORDER BY ordinal_position;"
```
Expected: rows listing `id, capability, title, severity, client_id, run_id, detail, proposed_action, status, assigned_role, decided_by, decided_at, audit, created_at`.

- [ ] **Step 4: Commit**

```bash
git add server/database/migrations/192_automation_escalations.sql
git commit -m "feat(ops-autopilot): add automation_escalations table (Phase A.1)"
```

---

### Task 2: Pure domain module + unit tests

**Files:**
- Create: `server/utils/automation/escalations.ts`
- Test: `test/automation/escalations.test.ts`

**Interfaces:**
- Produces:
  - `EscalationInput` `{ capability: string; title: string; severity?: 'info'|'warning'|'critical'; clientId?: string|null; runId?: string|null; detail?: Record<string,any>; proposedAction?: Record<string,any>|null; assignedRole?: string }`
  - `EscalationInsert` (snake_case row payload with JSON-stringified `detail`/`proposed_action`)
  - `buildEscalationInsert(input): EscalationInsert`
  - `canDecide(status): boolean`, `assertDecidable(status): void`
  - `escalationNotificationParams(args): { userId; type: 'approval_requested'; title; message; link; metadata }`
  - `groupEscalations(rows): { severity; clientId; items }[]`

- [ ] **Step 1: Write the failing tests**

```typescript
// test/automation/escalations.test.ts
import { describe, expect, it } from 'vitest'
import {
  buildEscalationInsert,
  canDecide,
  assertDecidable,
  escalationNotificationParams,
  groupEscalations,
} from '~~/server/utils/automation/escalations'

describe('buildEscalationInsert', () => {
  it('normalizes input, defaults severity to warning, JSON-encodes detail', () => {
    const r = buildEscalationInsert({ capability: ' budget_pacing ', title: ' Over-pacing on Knox ' })
    expect(r.capability).toBe('budget_pacing')
    expect(r.title).toBe('Over-pacing on Knox')
    expect(r.severity).toBe('warning')
    expect(r.detail).toBe('{}')
    expect(r.proposed_action).toBeNull()
    expect(r.assigned_role).toBe('AUTOMATION')
    expect(r.client_id).toBeNull()
  })

  it('keeps a valid severity and encodes proposed_action + detail', () => {
    const r = buildEscalationInsert({
      capability: 'budget_pacing',
      title: 'Raise daily budget',
      severity: 'critical',
      clientId: 'c-1',
      detail: { campaign: 'X' },
      proposedAction: { type: 'budget_change', from: 50, to: 80 },
    })
    expect(r.severity).toBe('critical')
    expect(r.client_id).toBe('c-1')
    expect(JSON.parse(r.detail)).toEqual({ campaign: 'X' })
    expect(JSON.parse(r.proposed_action!)).toEqual({ type: 'budget_change', from: 50, to: 80 })
  })

  it('coerces an invalid severity back to warning', () => {
    const r = buildEscalationInsert({ capability: 'c', title: 't', severity: 'bogus' as any })
    expect(r.severity).toBe('warning')
  })

  it('throws when capability or title is missing', () => {
    expect(() => buildEscalationInsert({ capability: '', title: 't' })).toThrow(/capability/)
    expect(() => buildEscalationInsert({ capability: 'c', title: '  ' })).toThrow(/title/)
  })
})

describe('canDecide / assertDecidable', () => {
  it('only pending escalations are decidable', () => {
    expect(canDecide('pending')).toBe(true)
    expect(canDecide('approved')).toBe(false)
    expect(canDecide('rejected')).toBe(false)
    expect(() => assertDecidable('pending')).not.toThrow()
    expect(() => assertDecidable('approved')).toThrow(/pending/)
  })
})

describe('escalationNotificationParams', () => {
  it('builds approval_requested notification params linking to the inbox', () => {
    const p = escalationNotificationParams({
      approverId: 'u-1', escalationId: 'e-1', capability: 'budget_pacing',
      title: 'Raise daily budget', severity: 'critical',
    })
    expect(p.userId).toBe('u-1')
    expect(p.type).toBe('approval_requested')
    expect(p.message).toBe('Raise daily budget')
    expect(p.link).toBe('/agency/automation?escalation=e-1')
    expect(p.metadata).toMatchObject({ escalationId: 'e-1', capability: 'budget_pacing', kind: 'automation_escalation' })
  })
})

describe('groupEscalations', () => {
  it('groups by severity (critical→warning→info) then client', () => {
    const groups = groupEscalations([
      { id: 'a', severity: 'warning', client_id: 'c1' },
      { id: 'b', severity: 'critical', client_id: 'c1' },
      { id: 'c', severity: 'critical', client_id: 'c2' },
    ] as any)
    expect(groups[0].severity).toBe('critical')
    expect(groups.map(g => g.severity)).toEqual(['critical', 'critical', 'warning'])
    expect(groups[0].items).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test test/automation/escalations.test.ts`
Expected: FAIL — `Failed to resolve import "~~/server/utils/automation/escalations"`.

- [ ] **Step 3: Write the implementation**

```typescript
// server/utils/automation/escalations.ts
// Pure domain logic for the Ops Autopilot escalation spine. No I/O — unit-tested.

export type EscalationSeverity = 'info' | 'warning' | 'critical'
export type EscalationStatus = 'pending' | 'approved' | 'rejected' | 'auto_resolved' | 'expired'
export type EscalationDecision = 'approved' | 'rejected'

const SEVERITIES: EscalationSeverity[] = ['info', 'warning', 'critical']
const SEVERITY_RANK: Record<EscalationSeverity, number> = { critical: 0, warning: 1, info: 2 }

export interface EscalationInput {
  capability: string
  title: string
  severity?: EscalationSeverity
  clientId?: string | null
  runId?: string | null
  detail?: Record<string, any>
  proposedAction?: Record<string, any> | null
  assignedRole?: string
}

export interface EscalationInsert {
  capability: string
  title: string
  severity: EscalationSeverity
  client_id: string | null
  run_id: string | null
  detail: string
  proposed_action: string | null
  assigned_role: string
}

export function buildEscalationInsert(input: EscalationInput): EscalationInsert {
  const capability = (input.capability ?? '').trim()
  const title = (input.title ?? '').trim()
  if (!capability) throw new Error('escalation: capability is required')
  if (!title) throw new Error('escalation: title is required')
  const severity = input.severity && SEVERITIES.includes(input.severity) ? input.severity : 'warning'
  return {
    capability,
    title,
    severity,
    client_id: input.clientId ?? null,
    run_id: input.runId ?? null,
    detail: JSON.stringify(input.detail ?? {}),
    proposed_action: input.proposedAction ? JSON.stringify(input.proposedAction) : null,
    assigned_role: input.assignedRole ?? 'AUTOMATION',
  }
}

export function canDecide(status: EscalationStatus): boolean {
  return status === 'pending'
}

export function assertDecidable(status: EscalationStatus): void {
  if (!canDecide(status)) {
    throw new Error(`escalation is '${status}'; only 'pending' escalations can be decided`)
  }
}

export interface EscalationNotification {
  userId: string
  type: 'approval_requested'
  title: string
  message: string
  link: string
  metadata: Record<string, any>
}

export function escalationNotificationParams(args: {
  approverId: string
  escalationId: string
  capability: string
  title: string
  severity: EscalationSeverity
}): EscalationNotification {
  return {
    userId: args.approverId,
    type: 'approval_requested',
    title: `Automation needs approval: ${args.capability}`,
    message: args.title,
    link: `/agency/automation?escalation=${args.escalationId}`,
    metadata: {
      escalationId: args.escalationId,
      capability: args.capability,
      severity: args.severity,
      kind: 'automation_escalation',
    },
  }
}

export interface EscalationGroup {
  severity: EscalationSeverity
  clientId: string | null
  items: any[]
}

export function groupEscalations(rows: Array<{ severity: EscalationSeverity; client_id: string | null }>): EscalationGroup[] {
  const sorted = [...rows].sort((a, b) => {
    const s = (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3)
    if (s !== 0) return s
    return String(a.client_id ?? '').localeCompare(String(b.client_id ?? ''))
  })
  const groups: EscalationGroup[] = []
  for (const row of sorted) {
    const last = groups[groups.length - 1]
    if (last && last.severity === row.severity && last.clientId === (row.client_id ?? null)) {
      last.items.push(row)
    } else {
      groups.push({ severity: row.severity, clientId: row.client_id ?? null, items: [row] })
    }
  }
  return groups
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test test/automation/escalations.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add server/utils/automation/escalations.ts test/automation/escalations.test.ts
git commit -m "feat(ops-autopilot): pure escalation domain module + unit tests (Phase A.1)"
```

---

### Task 3: DB adapter — `escalationsStore.ts`

**Files:**
- Create: `server/utils/automation/escalationsStore.ts`

**Interfaces:**
- Consumes: `buildEscalationInsert`, `EscalationInput`, `EscalationDecision` from Task 2; `queryOne`/`queryRows` from `~~/server/utils/db`; the table from Task 1.
- Produces: `raiseEscalation(input)`, `listPendingEscalations()`, `getEscalation(id)`, `decideEscalation(id, decision, deciderId, note?)`.

> **Testing note:** This codebase unit-tests *pure* logic (Task 2) and does not mock the DB. This adapter is a thin SQL wrapper; its correctness is verified by (a) the Task 2 pure tests it delegates to and (b) the endpoint smoke test in Task 5. No separate unit test is added here (adding a fake DB mock would not match repo conventions).

- [ ] **Step 1: Write the implementation**

```typescript
// server/utils/automation/escalationsStore.ts
// Thin DB adapter for automation_escalations. Domain logic lives in ./escalations.
import { queryOne, queryRows } from '~~/server/utils/db'
import { buildEscalationInsert, type EscalationInput, type EscalationDecision } from '~~/server/utils/automation/escalations'

export async function raiseEscalation(input: EscalationInput) {
  const r = buildEscalationInsert(input)
  return await queryOne(
    `INSERT INTO automation_escalations
       (capability, title, severity, client_id, run_id, detail, proposed_action, assigned_role)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)
     RETURNING id, status, created_at`,
    [r.capability, r.title, r.severity, r.client_id, r.run_id, r.detail, r.proposed_action, r.assigned_role],
  )
}

export async function listPendingEscalations() {
  return await queryRows(
    `SELECT id, capability, title, severity, client_id, run_id, detail, proposed_action, status, created_at
       FROM automation_escalations
      WHERE status = 'pending'
      ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, created_at ASC`,
  )
}

export async function getEscalation(id: string) {
  return await queryOne(`SELECT * FROM automation_escalations WHERE id = $1`, [id])
}

// Race-safe: only a still-'pending' row transitions. Returns null if already decided / not found.
export async function decideEscalation(
  id: string,
  decision: EscalationDecision,
  deciderId: string,
  note?: string,
) {
  return await queryOne(
    `UPDATE automation_escalations
        SET status = $2,
            decided_by = $3,
            decided_at = NOW(),
            audit = jsonb_build_object('note', $4::text, 'decision', $2::text)
      WHERE id = $1 AND status = 'pending'
      RETURNING id, status, decided_by, decided_at`,
    [id, decision, deciderId, note ?? null],
  )
}
```

- [ ] **Step 2: Typecheck the new file imports resolve**

Run: `pnpm exec tsc --noEmit -p .nuxt/tsconfig.server.json 2>&1 | grep -i "automation/escalationsStore" || echo "no errors in escalationsStore"`
Expected: `no errors in escalationsStore` (the repo has pre-existing unrelated TS errors; this checks only our file).

- [ ] **Step 3: Commit**

```bash
git add server/utils/automation/escalationsStore.ts
git commit -m "feat(ops-autopilot): escalation DB adapter (Phase A.1)"
```

---

### Task 4: Notify-approvers helper

**Files:**
- Create: `server/utils/automation/notifyEscalation.ts`

**Interfaces:**
- Consumes: `escalationNotificationParams` (Task 2), `createNotification` from `~~/server/utils/notifications`, `queryRows` from `~~/server/utils/db`.
- Produces: `notifyEscalationApprovers({ escalationId, capability, title, severity }): Promise<number>` — returns count of approvers notified.

> **Testing note:** Thin DB+notification wrapper; verified via the Task 5 smoke test. The notification-param construction it relies on is unit-tested in Task 2.

- [ ] **Step 1: Write the implementation**

```typescript
// server/utils/automation/notifyEscalation.ts
import { queryRows } from '~~/server/utils/db'
import { createNotification } from '~~/server/utils/notifications'
import { escalationNotificationParams, type EscalationSeverity } from '~~/server/utils/automation/escalations'

// Roles in the AUTOMATION permission group (see server/utils/permissions.ts).
const AUTOMATION_ROLES = ['owner', 'admin', 'lead', 'project_manager']

export async function notifyEscalationApprovers(args: {
  escalationId: string
  capability: string
  title: string
  severity: EscalationSeverity
}): Promise<number> {
  const approvers = await queryRows<{ id: string }>(
    `SELECT id FROM team_members WHERE is_active = true AND role = ANY($1)`,
    [AUTOMATION_ROLES],
  )
  let notified = 0
  for (const a of approvers) {
    try {
      await createNotification(escalationNotificationParams({
        approverId: a.id,
        escalationId: args.escalationId,
        capability: args.capability,
        title: args.title,
        severity: args.severity,
      }))
      notified++
    } catch (err) {
      console.error('[ops-autopilot] failed to notify escalation approver', a.id, err)
    }
  }
  return notified
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit -p .nuxt/tsconfig.server.json 2>&1 | grep -i "notifyEscalation" || echo "no errors in notifyEscalation"`
Expected: `no errors in notifyEscalation`.

- [ ] **Step 3: Commit**

```bash
git add server/utils/automation/notifyEscalation.ts
git commit -m "feat(ops-autopilot): notify AUTOMATION approvers on escalation (Phase A.1)"
```

---

### Task 5: API endpoints — list + decide

**Files:**
- Create: `server/api/agency/automation/escalations/index.get.ts`
- Create: `server/api/agency/automation/escalations/[id]/decide.post.ts`

**Interfaces:**
- Consumes: `requirePermission` from `~~/server/utils/auth`; `listPendingEscalations`/`getEscalation`/`decideEscalation` (Task 3); `groupEscalations` (Task 2); `notifyEscalationApprovers` is NOT used here (it fires on *raise*, in capability code).
- Produces: `GET /api/agency/automation/escalations` → `{ groups, count }`; `POST /api/agency/automation/escalations/:id/decide` → `{ escalation }`.

- [ ] **Step 1: Write the list endpoint**

```typescript
// server/api/agency/automation/escalations/index.get.ts
// List pending automation escalations (the human-on-call inbox feed). AUTOMATION-gated.
import { createError } from 'h3'
import { requirePermission } from '~~/server/utils/auth'
import { listPendingEscalations } from '~~/server/utils/automation/escalationsStore'
import { groupEscalations } from '~~/server/utils/automation/escalations'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'AUTOMATION')
  try {
    const items = await listPendingEscalations()
    return { groups: groupEscalations(items as any), count: items.length }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    throw createError({ statusCode: 500, statusMessage: `Failed to list escalations: ${message}` })
  }
})
```

- [ ] **Step 2: Write the decide endpoint**

```typescript
// server/api/agency/automation/escalations/[id]/decide.post.ts
// Approve or reject one escalation. AUTOMATION-gated. Race-safe via atomic store update.
import { createError, getRouterParam, readBody } from 'h3'
import { requirePermission } from '~~/server/utils/auth'
import { getEscalation, decideEscalation } from '~~/server/utils/automation/escalationsStore'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'AUTOMATION')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing escalation id' })

  const body = await readBody(event)
  const decision = body?.decision
  if (decision !== 'approved' && decision !== 'rejected') {
    throw createError({ statusCode: 400, statusMessage: "decision must be 'approved' or 'rejected'" })
  }

  const existing = await getEscalation(id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Escalation not found' })

  const decided = await decideEscalation(id, decision, user.id, typeof body?.note === 'string' ? body.note : undefined)
  if (!decided) {
    // Lost the race — another approver already decided it.
    throw createError({ statusCode: 409, statusMessage: 'Escalation already decided' })
  }
  return { escalation: decided }
})
```

- [ ] **Step 3: Typecheck both endpoints**

Run: `pnpm exec tsc --noEmit -p .nuxt/tsconfig.server.json 2>&1 | grep -iE "automation/escalations/(index|\[id\])" || echo "no errors in escalation endpoints"`
Expected: `no errors in escalation endpoints`.

- [ ] **Step 4: Smoke test the full path against the dev DB**

Start the dev server in one terminal (`pnpm dev`). Then, using a valid auth cookie/token for an AUTOMATION-role user, seed one escalation and exercise the endpoints:

```bash
# Seed a pending escalation directly (simulates a capability raising one):
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -c "INSERT INTO automation_escalations (capability, title, severity) VALUES ('budget_pacing','SMOKE TEST raise daily budget','critical') RETURNING id;"

# List (expect the seeded row under a 'critical' group):
curl -s -H "Cookie: auth_token=$DEV_TOKEN" http://localhost:3000/api/agency/automation/escalations | python3 -m json.tool

# Decide (replace <ID>):
curl -s -X POST -H "Cookie: auth_token=$DEV_TOKEN" -H 'Content-Type: application/json' \
  -d '{"decision":"approved","note":"smoke test"}' \
  http://localhost:3000/api/agency/automation/escalations/<ID>/decide | python3 -m json.tool

# Decide again (expect HTTP 409 already decided):
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Cookie: auth_token=$DEV_TOKEN" -H 'Content-Type: application/json' \
  -d '{"decision":"approved"}' http://localhost:3000/api/agency/automation/escalations/<ID>/decide
```
Expected: list returns the row in a `critical` group with `count: 1`; first decide returns `{ "escalation": { "status": "approved", ... } }`; second decide prints `409`.

```bash
# Cleanup the smoke row:
psql "$DATABASE_URL" -c "DELETE FROM automation_escalations WHERE title='SMOKE TEST raise daily budget';"
```

- [ ] **Step 5: Commit**

```bash
git add server/api/agency/automation/escalations/
git commit -m "feat(ops-autopilot): list + decide escalation endpoints, AUTOMATION-gated (Phase A.1)"
```

---

## Self-Review

**Spec coverage (against §4.1 / §4.4 of the program spec):**
- Escalation entity decoupled from `ai_pending_actions`/`task_approvals` → Task 1. ✅
- AUTOMATION-gated human decisions → Tasks 4–5 (`requirePermission(event,'AUTOMATION')`). ✅
- Reuse `createNotification` + approval-notification pattern → Task 4. ✅
- Race-safe approval (mirrors `ai_pending_actions` confirm) → Task 3 atomic update + Task 5 409. ✅
- Runs recorded in existing `automation_executions` → out of scope for A.1 (no new runs table), consistent with Global Constraints. ✅
- **Deferred to follow-on plans (not gaps):** A.2 = the `/agency/automation` inbox UI (Nuxt UI v4); A.3 = lifecycle state-machine adoption over the 34-status taxonomy; capability `raiseEscalation` wiring lands when each capability (C1–C7) is built.

**Placeholder scan:** No TBD/TODO; every code step has complete code; every test step has runnable assertions and an expected result. ✅

**Type consistency:** `EscalationInput`/`EscalationInsert`/`EscalationDecision`/`EscalationSeverity` defined in Task 2 and consumed unchanged in Tasks 3–5. `escalationNotificationParams` returns `type: 'approval_requested'` (an existing NotificationType — no union edit). Endpoint return shapes (`{ groups, count }`, `{ escalation }`) match the store's returns. ✅

**Known environment caveats:** the `tsc` typecheck steps grep for our files only because the repo carries ~60 pre-existing unrelated TS errors (and `typescript.strict: false`); a fresh worktree may need `pnpm nuxt prepare` before `.nuxt/tsconfig.server.json` exists. The smoke test needs a dev auth token for an AUTOMATION-role user.
