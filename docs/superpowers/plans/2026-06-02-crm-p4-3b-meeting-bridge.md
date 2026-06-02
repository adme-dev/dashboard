# CRM P4.3b — Meeting Action-Items → CRM Tasks Bridge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an office-meeting action-item become a CRM task (`crm_tasks`) — resolved to a CRM person/company/opportunity via guest-email matching — through three surfaces: a manual office-side button, manual CRM-side surfacing, and a flag-gated auto-create cron.

**Architecture:** One shared core util (`server/utils/crm/meetingBridge.ts`) does deterministic email→CRM-target resolution (pure, TDD) and idempotent transactional conversion. Three thin surfaces call it. One additive migration adds `crm_task_id` to `office_meeting_action_items` plus two opt-in columns to `crm_settings`. Mirrors the proven board-task bridge at `server/api/office/[officeId]/meetings/[meetingId]/action-items/[actionItemId]/task.post.ts`.

**Tech Stack:** Nitro (Nuxt 4 server), Neon Postgres via `server/utils/db.ts` (`queryOne`/`queryRows`/`execute`/`transaction`), Zod 4, Vitest, Nuxt UI v4, Cloudflare companion Worker (`workers/crm-cron`).

**Spec:** `docs/superpowers/specs/2026-06-02-crm-p4-3b-meeting-bridge-design.md`

---

## Conventions for every task
- `meetingBridge.ts` is built incrementally across Tasks 2–4. When a later task's code introduces an `import`, place it at the **top** of the file with the other imports — do not append imports inline at the point of use.
- Server imports use `~~/server/utils/...` (double-tilde), never `~/`.
- Run unit tests: `pnpm exec vitest run test/crm/<file>`.
- Typecheck (only when asked / before a slice PR): `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck` — goal **0 NEW** errors over the ~1252 baseline.
- Fresh worktree first run needs `pnpm exec nuxt prepare` or vitest/eslint die.
- `z.record(...)` MUST be two-arg (`z.record(z.string(), x)`) — single-arg 500s at runtime under Zod 4.
- USelectMenu values are never empty strings — use sentinels.

---

# Slice P4.3b-1 — Core + migration + office-side manual path

### Task 1: Migration 159 — `crm_task_id` + `crm_settings` opt-in columns

**Files:**
- Create: `server/database/migrations/159-crm-meeting-action-item-bridge.sql`

- [ ] **Step 1: Re-verify the next migration number**

Run: `ls server/database/migrations/ | grep -oE '^[0-9]+' | sort -n | tail -3`
Expected: highest is `158`. If a parallel session took 159, use the next free number and rename the file accordingly (and everywhere this plan says 159).

- [ ] **Step 2: Write the migration**

```sql
-- =============================================================================
-- CRM P4.3b — Meeting action-item → CRM task bridge
-- Independent of the existing task_id (board) column: one action item can become
-- both a board task and a CRM task. Plus per-client auto-create opt-in.
-- =============================================================================
BEGIN;

ALTER TABLE office_meeting_action_items
  ADD COLUMN IF NOT EXISTS crm_task_id uuid REFERENCES crm_tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_office_meeting_action_items_crm_task
  ON office_meeting_action_items(crm_task_id)
  WHERE crm_task_id IS NOT NULL;

ALTER TABLE crm_settings
  ADD COLUMN IF NOT EXISTS meeting_bridge_autocreate boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS meeting_bridge_enabled_at timestamptz;

COMMIT;
```

- [ ] **Step 3: Apply against the DB** (CLAUDE.md "Database Migrations" — run automatically)

Run:
```bash
export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/159-crm-meeting-action-item-bridge.sql
```
Expected: `BEGIN … ALTER TABLE … CREATE INDEX … ALTER TABLE … COMMIT`, no error. (Re-running is safe — all `IF NOT EXISTS`.)
⚠️ `.env DATABASE_URL` is the **live prod DB** — additive only; this is intended.

- [ ] **Step 4: Verify columns landed**

Run:
```bash
psql "$DATABASE_URL" -c "\d office_meeting_action_items" | grep crm_task_id
psql "$DATABASE_URL" -c "\d crm_settings" | grep meeting_bridge
```
Expected: `crm_task_id | uuid`, `meeting_bridge_autocreate | boolean`, `meeting_bridge_enabled_at | timestamp with time zone`.

- [ ] **Step 5: Commit**

```bash
git add server/database/migrations/159-crm-meeting-action-item-bridge.sql
git commit -m "feat(crm): mig 159 — crm_task_id on meeting action items + bridge opt-in cols"
```

---

### Task 2: Core types + `rankTargets` (pure resolution — TDD)

**Files:**
- Create: `server/utils/crm/meetingBridge.ts`
- Test: `test/crm/meetingBridge.rankTargets.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { rankTargets, normalizeEmail } from '~~/server/utils/crm/meetingBridge'
import type { CandidatePerson, CandidateOpp } from '~~/server/utils/crm/meetingBridge'

const person = (over: Partial<CandidatePerson> = {}): CandidatePerson => ({
  person_id: 'p1', client_id: 'c1', company_id: 'co1', email: 'jane@acme.com', display_name: 'Jane Doe', ...over,
})
const opp = (over: Partial<CandidateOpp> = {}): CandidateOpp => ({
  opportunity_id: 'o1', client_id: 'c1', person_id: 'p1', company_id: 'co1', name: 'Acme renewal',
  updated_at: '2026-06-01T00:00:00.000Z', ...over,
})

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Jane@ACME.com ')).toBe('jane@acme.com')
  })
})

describe('rankTargets', () => {
  it('zero matches → empty', () => {
    expect(rankTargets({ candidatePeople: [], candidateOpps: [] })).toEqual([])
  })

  it('one person, one client, no opp → person target, high confidence', () => {
    const [t] = rankTargets({ candidatePeople: [person()], candidateOpps: [] })
    expect(t.target_type).toBe('person')
    expect(t.target_id).toBe('p1')
    expect(t.client_id).toBe('c1')
    expect(t.matched_email).toBe('jane@acme.com')
    expect(t.confidence).toBe('high')
    // company offered as an alternative when known
    expect(t.alternatives.some(a => a.target_type === 'company' && a.target_id === 'co1')).toBe(true)
  })

  it('one person with an open opp → opp target, person+company in alternatives', () => {
    const [t] = rankTargets({ candidatePeople: [person()], candidateOpps: [opp()] })
    expect(t.target_type).toBe('opportunity')
    expect(t.target_id).toBe('o1')
    expect(t.confidence).toBe('high')
    expect(t.alternatives.some(a => a.target_type === 'person' && a.target_id === 'p1')).toBe(true)
  })

  it('multiple open opps → most-recently-updated wins, others are alternatives', () => {
    const older = opp({ opportunity_id: 'o-old', name: 'Old', updated_at: '2026-05-01T00:00:00.000Z' })
    const newer = opp({ opportunity_id: 'o-new', name: 'New', updated_at: '2026-06-02T00:00:00.000Z' })
    const [t] = rankTargets({ candidatePeople: [person()], candidateOpps: [older, newer] })
    expect(t.target_id).toBe('o-new')
    expect(t.alternatives.some(a => a.target_id === 'o-old')).toBe(true)
  })

  it('no person-opp but a company-opp exists → company-opp is the target', () => {
    const companyOpp = opp({ opportunity_id: 'o-co', person_id: null, company_id: 'co1' })
    const [t] = rankTargets({ candidatePeople: [person()], candidateOpps: [companyOpp] })
    expect(t.target_type).toBe('opportunity')
    expect(t.target_id).toBe('o-co')
  })

  it('two people in the same client → ambiguous, one proposal each', () => {
    const people = [person(), person({ person_id: 'p2', email: 'bob@acme.com', display_name: 'Bob Roe' })]
    const out = rankTargets({ candidatePeople: people, candidateOpps: [] })
    expect(out).toHaveLength(2)
    expect(out.every(t => t.confidence === 'ambiguous')).toBe(true)
  })

  it('two people across different clients → ambiguous', () => {
    const people = [person(), person({ person_id: 'p2', client_id: 'c2', company_id: 'co2', email: 'x@other.com', display_name: 'X' })]
    const out = rankTargets({ candidatePeople: people, candidateOpps: [] })
    expect(out).toHaveLength(2)
    expect(out.every(t => t.confidence === 'ambiguous')).toBe(true)
  })

  it('dedupes a person matched by two different guest emails', () => {
    const out = rankTargets({
      candidatePeople: [person(), person({ email: 'jane.doe@acme.com' })],
      candidateOpps: [],
    })
    expect(out).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/crm/meetingBridge.rankTargets.test.ts`
Expected: FAIL — cannot resolve `~~/server/utils/crm/meetingBridge` / `rankTargets is not a function`.

- [ ] **Step 3: Implement the pure core**

```ts
// server/utils/crm/meetingBridge.ts
// Deterministic resolution of office-meeting guests → CRM targets, plus the
// pure CRM-task payload builder. DB-touching helpers live below the pure block.

export interface CandidatePerson {
  person_id: string
  client_id: string
  company_id: string | null
  email: string          // already normalized; the guest email that matched
  display_name: string
}

export interface CandidateOpp {
  opportunity_id: string
  client_id: string
  person_id: string | null
  company_id: string | null
  name: string
  updated_at: string     // ISO timestamp
}

export interface TargetRef {
  client_id: string
  target_type: 'opportunity' | 'person' | 'company'
  target_id: string
  label: string
}

export interface TargetProposal extends TargetRef {
  matched_email: string
  person_id: string
  confidence: 'high' | 'ambiguous'
  alternatives: TargetRef[]
}

export function normalizeEmail(s: string): string {
  return s.trim().toLowerCase()
}

function byUpdatedDesc(a: CandidateOpp, b: CandidateOpp): number {
  return b.updated_at.localeCompare(a.updated_at)
}

export function rankTargets(input: {
  candidatePeople: CandidatePerson[]
  candidateOpps: CandidateOpp[]
}): TargetProposal[] {
  // Dedupe people by person_id (a person can match via multiple guest emails);
  // keep the first matched email for provenance.
  const peopleById = new Map<string, CandidatePerson>()
  for (const p of input.candidatePeople) {
    if (!peopleById.has(p.person_id)) peopleById.set(p.person_id, p)
  }
  const people = [...peopleById.values()]
  if (people.length === 0) return []

  const distinctClients = new Set(people.map(p => p.client_id))
  const confidence: 'high' | 'ambiguous' =
    people.length === 1 && distinctClients.size === 1 ? 'high' : 'ambiguous'

  const proposals: TargetProposal[] = people.map((p) => {
    // Open opps for this person, then (fallback) for this person's company.
    const personOpps = input.candidateOpps
      .filter(o => o.person_id === p.person_id)
      .sort(byUpdatedDesc)
    const companyOpps = p.company_id
      ? input.candidateOpps
          .filter(o => o.person_id === null && o.company_id === p.company_id)
          .sort(byUpdatedDesc)
      : []
    const rankedOpps = personOpps.length ? personOpps : companyOpps

    const personRef: TargetRef = {
      client_id: p.client_id, target_type: 'person', target_id: p.person_id, label: p.display_name,
    }
    const companyRef: TargetRef | null = p.company_id
      ? { client_id: p.client_id, target_type: 'company', target_id: p.company_id, label: `${p.display_name} · company` }
      : null

    let primary: TargetRef
    const alternatives: TargetRef[] = []
    if (rankedOpps.length) {
      const [best, ...rest] = rankedOpps
      primary = { client_id: p.client_id, target_type: 'opportunity', target_id: best.opportunity_id, label: best.name }
      alternatives.push(personRef)
      if (companyRef) alternatives.push(companyRef)
      for (const o of rest) {
        alternatives.push({ client_id: p.client_id, target_type: 'opportunity', target_id: o.opportunity_id, label: o.name })
      }
    } else {
      primary = personRef
      if (companyRef) alternatives.push(companyRef)
    }

    return { ...primary, matched_email: p.email, person_id: p.person_id, confidence, alternatives }
  })

  // Deterministic order: opp-bearing proposals first, then by label.
  return proposals.sort((a, b) => {
    const ao = a.target_type === 'opportunity' ? 0 : 1
    const bo = b.target_type === 'opportunity' ? 0 : 1
    return ao - bo || a.label.localeCompare(b.label)
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/crm/meetingBridge.rankTargets.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add server/utils/crm/meetingBridge.ts test/crm/meetingBridge.rankTargets.test.ts
git commit -m "feat(crm): meetingBridge rankTargets — deterministic guest→CRM-target resolution"
```

---

### Task 3: `buildCrmTaskPayload` (pure mapping — TDD)

**Files:**
- Modify: `server/utils/crm/meetingBridge.ts` (append)
- Test: `test/crm/meetingBridge.payload.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { buildCrmTaskPayload } from '~~/server/utils/crm/meetingBridge'
import type { ActionItemForBridge } from '~~/server/utils/crm/meetingBridge'
import type { TargetRef } from '~~/server/utils/crm/meetingBridge'

const actionItem: ActionItemForBridge = {
  id: 'ai1',
  meeting_session_id: 'm1',
  meeting_title: 'Acme Q3 review',
  source_artifact_id: 'art1',
  content: 'Send the renewal proposal to Jane by Friday',
  due_at: '2026-06-05T09:00:00.000Z',
}
const target: TargetRef = { client_id: 'c1', target_type: 'opportunity', target_id: 'o1', label: 'Acme renewal' }

describe('buildCrmTaskPayload', () => {
  it('maps content, target, due_at and task_type=meeting', () => {
    const p = buildCrmTaskPayload(actionItem, target)
    expect(p.client_id).toBe('c1')
    expect(p.target_type).toBe('opportunity')
    expect(p.target_id).toBe('o1')
    expect(p.title).toBe('Send the renewal proposal to Jane by Friday')
    expect(p.task_type).toBe('meeting')
    expect(p.priority).toBe('medium')
    expect(p.due_at).toBe('2026-06-05T09:00:00.000Z')
    expect(p.description).toContain('Acme Q3 review')
    expect(p.description).toContain('ai1')
  })

  it('truncates title to 255 chars and honours an explicit priority', () => {
    const long = { ...actionItem, content: 'x'.repeat(300) }
    const p = buildCrmTaskPayload(long, target, { priority: 'high' })
    expect(p.title).toHaveLength(255)
    expect(p.priority).toBe('high')
  })

  it('null due_at passes through as null', () => {
    const p = buildCrmTaskPayload({ ...actionItem, due_at: null }, target)
    expect(p.due_at).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/crm/meetingBridge.payload.test.ts`
Expected: FAIL — `buildCrmTaskPayload is not a function`.

- [ ] **Step 3: Append the implementation to `meetingBridge.ts`**

```ts
import type { TASK_PRIORITIES } from './tasks'

export interface ActionItemForBridge {
  id: string
  meeting_session_id: string
  meeting_title: string
  source_artifact_id: string | null
  content: string
  due_at: string | null
}

export interface CrmTaskPayload {
  client_id: string
  target_type: 'opportunity' | 'person' | 'company'
  target_id: string
  title: string
  description: string
  task_type: 'meeting'
  priority: (typeof TASK_PRIORITIES)[number]
  due_at: string | null
}

export function buildCrmTaskPayload(
  actionItem: ActionItemForBridge,
  target: { client_id: string, target_type: 'opportunity' | 'person' | 'company', target_id: string },
  opts: { priority?: (typeof TASK_PRIORITIES)[number] } = {},
): CrmTaskPayload {
  const description = [
    `Source: Office meeting "${actionItem.meeting_title}"`,
    '',
    actionItem.content,
    '',
    `Meeting ID: ${actionItem.meeting_session_id}`,
    `Action item ID: ${actionItem.id}`,
    actionItem.source_artifact_id ? `Artifact ID: ${actionItem.source_artifact_id}` : null,
  ].filter(Boolean).join('\n')

  return {
    client_id: target.client_id,
    target_type: target.target_type,
    target_id: target.target_id,
    title: actionItem.content.slice(0, 255),
    description,
    task_type: 'meeting',
    priority: opts.priority ?? 'medium',
    due_at: actionItem.due_at ?? null,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/crm/meetingBridge.payload.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/crm/meetingBridge.ts test/crm/meetingBridge.payload.test.ts
git commit -m "feat(crm): meetingBridge buildCrmTaskPayload — action item → crm_task mapping"
```

---

### Task 4: DB layer — `findMeetingCrmCandidates` + `convertActionItemToCrmTask`

**Files:**
- Modify: `server/utils/crm/meetingBridge.ts` (append DB helpers)

These touch the DB, so they're verified by a throwaway real-DB probe (Step 4), not a committed integration test (the suite has no DB in CI). The pure logic they depend on is already covered by Tasks 2–3.

- [ ] **Step 1: Append the candidate-finder**

```ts
import { queryRows, queryOne, transaction } from '~~/server/utils/db'
import { recordFieldChanges } from './audit'

// Cross-client by design: agency staff resolve a meeting against every client's
// contacts (the meeting carries no client_id). Tenant isolation is enforced at
// conversion (the chosen target's client_id is authoritative).
export async function findMeetingCrmCandidates(meetingSessionId: string): Promise<{
  candidatePeople: CandidatePerson[]
  candidateOpps: CandidateOpp[]
}> {
  const people = await queryRows<CandidatePerson>(
    `SELECT p.id AS person_id, p.client_id, p.company_id,
            lower(trim(p.email)) AS email,
            trim(concat_ws(' ', p.first_name, p.last_name)) AS display_name
     FROM office_meeting_sessions s
     CROSS JOIN LATERAL unnest(s.guest_emails) AS ge(email)
     JOIN crm_people p
       ON p.deleted_at IS NULL
      AND p.email IS NOT NULL
      AND lower(trim(p.email)) = lower(trim(ge.email))
     WHERE s.id = $1`,
    [meetingSessionId],
  )
  if (people.length === 0) return { candidatePeople: [], candidateOpps: [] }

  const personIds = [...new Set(people.map(p => p.person_id))]
  const companyIds = [...new Set(people.map(p => p.company_id).filter(Boolean))] as string[]

  const opps = await queryRows<CandidateOpp>(
    `SELECT id AS opportunity_id, client_id, person_id, company_id, name,
            to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at
     FROM crm_opportunities
     WHERE status = 'open' AND deleted_at IS NULL
       AND ( person_id = ANY($1::uuid[])
             OR (person_id IS NULL AND company_id = ANY($2::uuid[])) )`,
    [personIds, companyIds.length ? companyIds : ['00000000-0000-0000-0000-000000000000']],
  )
  return { candidatePeople: people, candidateOpps: opps }
}
```

- [ ] **Step 2: Append the idempotent converter**

```ts
export type BridgeMode = 'manual_office' | 'manual_crm' | 'auto'

export interface ConvertResult {
  task: Record<string, unknown>
  actionItem: Record<string, unknown>
  created: boolean
}

// Idempotent: if the action item already has a crm_task_id, return the existing
// task untouched. Otherwise insert the crm_task, stamp the action item, and write
// an audit row — all in one transaction.
export async function convertActionItemToCrmTask(
  actionItem: ActionItemForBridge & { crm_task_id: string | null },
  target: { client_id: string, target_type: 'opportunity' | 'person' | 'company', target_id: string },
  opts: { actor: string | null, mode: BridgeMode, priority?: (typeof TASK_PRIORITIES)[number] },
): Promise<ConvertResult> {
  if (actionItem.crm_task_id) {
    const existing = await queryOne(`SELECT * FROM crm_tasks WHERE id = $1`, [actionItem.crm_task_id])
    return { task: existing as Record<string, unknown>, actionItem: actionItem as unknown as Record<string, unknown>, created: false }
  }

  const payload = buildCrmTaskPayload(actionItem, target, { priority: opts.priority })

  const result = await transaction(async (client) => {
    const taskRes = await client.query(
      `INSERT INTO crm_tasks
         (client_id, target_type, target_id, title, description, task_type, priority, due_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [payload.client_id, payload.target_type, payload.target_id, payload.title,
       payload.description, payload.task_type, payload.priority, payload.due_at, opts.actor],
    )
    const task = taskRes.rows[0]

    const aiRes = await client.query(
      `UPDATE office_meeting_action_items
       SET crm_task_id = $1,
           metadata = metadata || $2::jsonb,
           updated_at = now()
       WHERE id = $3 AND crm_task_id IS NULL
       RETURNING *`,
      [task.id, JSON.stringify({
        crm_task_id: task.id,
        crm_task_created_at: new Date().toISOString(),
        crm_bridge_mode: opts.mode,
      }), actionItem.id],
    )
    // Lost-race guard: another tx stamped it first → roll back our insert.
    if (aiRes.rowCount === 0) {
      throw new Error('action_item_already_converted')
    }
    return { task, actionItem: aiRes.rows[0] }
  })

  // Best-effort audit (never rolls back the conversion).
  try {
    await recordFieldChanges({
      clientId: target.client_id, entityType: 'crm_task', entityId: result.task.id as string,
      before: null, after: { created_from_meeting: actionItem.id },
      fields: ['created_from_meeting'], actor: opts.actor,
    })
  } catch (e) {
    console.warn('[meetingBridge] audit write failed:', e)
  }

  return { ...result, created: true }
}
```

- [ ] **Step 3: Add a skip-reason recorder for the auto path** (used in Slice 3, defined here with the core)

```ts
export type SkipReason = 'ambiguous_multi_person' | 'ambiguous_multi_client' | 'no_crm_match'

export async function recordSkipReason(actionItemId: string, reason: SkipReason): Promise<void> {
  await execute(
    `UPDATE office_meeting_action_items
     SET metadata = metadata || $2::jsonb, updated_at = now()
     WHERE id = $1`,
    [actionItemId, JSON.stringify({ crm_skip_reason: reason, crm_skip_at: new Date().toISOString() })],
  )
}
```
Add `execute` to the existing db import line: `import { queryRows, queryOne, execute, transaction } from '~~/server/utils/db'`.

- [ ] **Step 4: Real-DB idempotency probe** (throwaway — do NOT commit the script)

Write `scripts/_probe.mjs` per handoff §5 (shim `globalThis.createError`; import the util, not an endpoint). Seed one `agency_client` (`billing_type='retainer'`, `name`), one `crm_people` with `email='probe@x.com'`, one `office_meeting_sessions` with `guest_emails='{probe@x.com}'`, one `office_meeting_action_items`. Then:
```bash
export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d= -f2-)
pnpm exec tsx --tsconfig .nuxt/tsconfig.server.json scripts/_probe.mjs
```
Expected: `findMeetingCrmCandidates` returns the one person; `convertActionItemToCrmTask` returns `created:true` first call, `created:false` second call; exactly one `crm_tasks` row references the action item. Delete the seed rows and `scripts/_probe.mjs` after.

- [ ] **Step 5: Commit**

```bash
git add server/utils/crm/meetingBridge.ts
git commit -m "feat(crm): meetingBridge DB layer — candidate finder + idempotent converter + skip recorder"
```

---

### Task 5: Office-side `GET .../crm-candidates` endpoint

**Files:**
- Create: `server/api/office/[officeId]/meetings/[meetingId]/action-items/[actionItemId]/crm-candidates.get.ts`

- [ ] **Step 1: Write the endpoint** (auth mirrors the board `task.post.ts`)

```ts
/**
 * GET /api/office/:officeId/meetings/:meetingId/action-items/:actionItemId/crm-candidates
 * Ranked CRM-target proposals for converting a meeting action item into a CRM task.
 */
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { ensureOfficeMeetingArtifactsTables } from '~~/server/utils/officeMeetingArtifacts'
import { findMeetingCrmCandidates, rankTargets } from '~~/server/utils/crm/meetingBridge'
import type { OfficeMemberRow, OfficeMeetingActionItemRow } from '~~/app/types/office'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const officeId = getRouterParam(event, 'officeId')
  const meetingId = getRouterParam(event, 'meetingId')
  const actionItemId = getRouterParam(event, 'actionItemId')
  if (!officeId || !meetingId || !actionItemId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId, meetingId and actionItemId are required' })
  }

  const membership = await queryOne<OfficeMemberRow>(
    `SELECT * FROM office_members WHERE office_id = $1 AND user_id = $2`, [officeId, user.id])
  if (!membership) throw createError({ statusCode: 403, statusMessage: 'Not a member of this office' })

  await ensureOfficeMeetingArtifactsTables()
  const actionItem = await queryOne<OfficeMeetingActionItemRow>(
    `SELECT omai.* FROM office_meeting_action_items omai
     JOIN office_meeting_sessions oms ON oms.id = omai.meeting_session_id
     WHERE omai.id = $1 AND omai.office_id = $2 AND omai.meeting_session_id = $3 AND oms.office_id = $2`,
    [actionItemId, officeId, meetingId])
  if (!actionItem) throw createError({ statusCode: 404, statusMessage: 'Action item not found' })

  const candidates = await findMeetingCrmCandidates(meetingId)
  return { proposals: rankTargets(candidates), alreadyConverted: !!actionItem.crm_task_id }
})
```

- [ ] **Step 2: Smoke the route shape** (typecheck only — no committed runtime test for Nitro endpoints)

Run: `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck 2>&1 | grep crm-candidates || echo "no new errors in crm-candidates"`
Expected: `no new errors in crm-candidates`. (If `OfficeMeetingActionItemRow` lacks `crm_task_id`, add it as optional in `app/types/office` — see note below.)

> Note: extend `OfficeMeetingActionItemRow` in `app/types/office(.ts/.d.ts)` with `crm_task_id?: string | null` to match migration 159. Do this in whichever file already declares the row type.

- [ ] **Step 3: Commit**

```bash
git add "server/api/office/[officeId]/meetings/[meetingId]/action-items/[actionItemId]/crm-candidates.get.ts" app/types/office*
git commit -m "feat(office): GET crm-candidates — ranked CRM targets for a meeting action item"
```

---

### Task 6: Office-side `POST .../crm-task` endpoint

**Files:**
- Create: `server/api/office/[officeId]/meetings/[meetingId]/action-items/[actionItemId]/crm-task.post.ts`

- [ ] **Step 1: Write the endpoint** (validates chosen target against the candidate set, then converts)

```ts
/**
 * POST /api/office/:officeId/meetings/:meetingId/action-items/:actionItemId/crm-task
 * Converts a meeting action item into a CRM task against a chosen CRM target.
 */
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { ensureOfficeMeetingArtifactsTables } from '~~/server/utils/officeMeetingArtifacts'
import {
  findMeetingCrmCandidates, rankTargets, convertActionItemToCrmTask,
} from '~~/server/utils/crm/meetingBridge'
import type { OfficeMemberRow } from '~~/app/types/office'

const Body = z.object({
  client_id: z.string().uuid(),
  target_type: z.enum(['opportunity', 'person', 'company']),
  target_id: z.string().uuid(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const officeId = getRouterParam(event, 'officeId')
  const meetingId = getRouterParam(event, 'meetingId')
  const actionItemId = getRouterParam(event, 'actionItemId')
  if (!officeId || !meetingId || !actionItemId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId, meetingId and actionItemId are required' })
  }

  const membership = await queryOne<OfficeMemberRow>(
    `SELECT * FROM office_members WHERE office_id = $1 AND user_id = $2`, [officeId, user.id])
  if (!membership) throw createError({ statusCode: 403, statusMessage: 'Not a member of this office' })

  const body = Body.parse(await readBody(event))
  await ensureOfficeMeetingArtifactsTables()

  const actionItem = await queryOne<any>(
    `SELECT omai.*, oms.title AS meeting_title
     FROM office_meeting_action_items omai
     JOIN office_meeting_sessions oms ON oms.id = omai.meeting_session_id
     WHERE omai.id = $1 AND omai.office_id = $2 AND omai.meeting_session_id = $3 AND oms.office_id = $2`,
    [actionItemId, officeId, meetingId])
  if (!actionItem) throw createError({ statusCode: 404, statusMessage: 'Action item not found' })

  // Guard: the chosen target must be one the resolver actually proposed (primary
  // OR an alternative) — blocks injecting an arbitrary cross-tenant target.
  const proposals = rankTargets(await findMeetingCrmCandidates(meetingId))
  const allTargets = proposals.flatMap(p => [
    { client_id: p.client_id, target_type: p.target_type, target_id: p.target_id },
    ...p.alternatives.map(a => ({ client_id: a.client_id, target_type: a.target_type, target_id: a.target_id })),
  ])
  const ok = allTargets.some(t =>
    t.client_id === body.client_id && t.target_type === body.target_type && t.target_id === body.target_id)
  if (!ok) throw createError({ statusCode: 400, statusMessage: 'Chosen target is not a valid candidate for this meeting' })

  const result = await convertActionItemToCrmTask(
    {
      id: actionItem.id, meeting_session_id: actionItem.meeting_session_id,
      meeting_title: actionItem.meeting_title, source_artifact_id: actionItem.source_artifact_id,
      content: actionItem.content, due_at: actionItem.due_at, crm_task_id: actionItem.crm_task_id,
    },
    { client_id: body.client_id, target_type: body.target_type, target_id: body.target_id },
    { actor: user.id, mode: 'manual_office', priority: body.priority },
  )
  return result
})
```

- [ ] **Step 2: Typecheck**

Run: `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck 2>&1 | grep crm-task.post || echo "no new errors"`
Expected: `no new errors`.

- [ ] **Step 3: Commit**

```bash
git add "server/api/office/[officeId]/meetings/[meetingId]/action-items/[actionItemId]/crm-task.post.ts"
git commit -m "feat(office): POST crm-task — convert a meeting action item into a CRM task"
```

---

### Task 7: Office UI — "Create CRM task" button + disambiguation modal

**Files:**
- Modify: `app/components/office/OfficeMeetingArtifactsPanel.vue`

- [ ] **Step 1: Locate the existing "Create task" affordance**

Run: `grep -n "task\|action-item\|UButton" app/components/office/OfficeMeetingArtifactsPanel.vue | head -40`
Expected: find the per-action-item row and the existing board "Create task" button — add the CRM action beside it.

- [ ] **Step 2: Add the button + modal** (Nuxt UI v4; follow the file's existing `$fetch` + `useToast` patterns)

For each action-item row, add (only when `!actionItem.crm_task_id`):
```vue
<UButton size="xs" variant="ghost" icon="i-lucide-contact" @click="openCrmTask(actionItem)">
  Create CRM task
</UButton>
```
Modal logic (script `setup`): on open, `GET .../crm-candidates`; pre-select `proposals[0]` (its primary target); render a `USelectMenu` of `[primary, ...alternatives]` per proposal (label each with the cited `matched_email`); a priority `USelect` (sentinel-safe). Submit → `POST .../crm-task` with the chosen `{client_id, target_type, target_id, priority}`; on success `toast.add({ title: 'CRM task created', color: 'success' })`, mark the row converted, close. Zero proposals → show an empty state ("No CRM contact matched this meeting's guests") with no submit.

- [ ] **Step 3: Manual browser check** (after the slice deploys, or local `pnpm dev`)

Open a meeting with an action-item whose guest email matches a CRM contact → "Create CRM task" → modal shows the cited match → submit → toast + `crm_tasks` row exists (verify via psql). Re-clicking is disabled/idempotent.

- [ ] **Step 4: Commit**

```bash
git add app/components/office/OfficeMeetingArtifactsPanel.vue
git commit -m "feat(office): Create CRM task action + disambiguation modal on meeting action items"
```

- [ ] **Step 5: Slice gate — full CRM suite + typecheck**

Run: `pnpm exec vitest run test/crm` → green. `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck` → 0 NEW errors. Then open a PR for Slice P4.3b-1.

---

# Slice P4.3b-2 — CRM-side surfacing

### Task 8: `GET /api/crm/:targetType/:id/meeting-actions`

**Files:**
- Create: `server/api/crm/[targetType]/[id]/meeting-actions.get.ts`

> First confirm the existing CRM route param names: `ls server/api/crm` and an existing `[id]` route — match the established folder shape (e.g. `people/[id]`). If CRM routes are split by entity (`people/`, `companies/`) rather than a generic `[targetType]`, create two parallel routes (`people/[id]/meeting-actions.get.ts`, `companies/[id]/meeting-actions.get.ts`) sharing one helper. Adjust paths below to match what you find.

- [ ] **Step 1: Write the endpoint** (returns unconverted action-items whose meeting guests include this contact's email; client-scoped)

```ts
/**
 * GET /api/crm/:targetType/:id/meeting-actions
 * Unconverted meeting action items linkable to this CRM record (via guest-email
 * overlap with the contact's email). target = person | company.
 */
import { requireAuth } from '~~/server/utils/auth'
import { queryRows, queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const targetType = getRouterParam(event, 'targetType')
  const id = getRouterParam(event, 'id')
  if (!id || (targetType !== 'person' && targetType !== 'company')) {
    throw createError({ statusCode: 400, statusMessage: 'Valid targetType (person|company) and id required' })
  }

  // Collect the relevant contact emails for this record.
  const emails = targetType === 'person'
    ? await queryRows<{ email: string }>(
        `SELECT lower(trim(email)) AS email FROM crm_people
         WHERE id = $1 AND deleted_at IS NULL AND email IS NOT NULL`, [id])
    : await queryRows<{ email: string }>(
        `SELECT lower(trim(email)) AS email FROM crm_people
         WHERE company_id = $1 AND deleted_at IS NULL AND email IS NOT NULL`, [id])
  if (emails.length === 0) return { actionItems: [] }

  const emailList = emails.map(e => e.email)
  const actionItems = await queryRows(
    `SELECT DISTINCT omai.id, omai.content, omai.due_at, omai.meeting_session_id,
            oms.title AS meeting_title, omai.created_at
     FROM office_meeting_action_items omai
     JOIN office_meeting_sessions oms ON oms.id = omai.meeting_session_id
     CROSS JOIN LATERAL unnest(oms.guest_emails) AS ge(email)
     WHERE omai.crm_task_id IS NULL
       AND lower(trim(ge.email)) = ANY($1::text[])
     ORDER BY omai.created_at DESC
     LIMIT 50`,
    [emailList])
  return { actionItems }
})
```

- [ ] **Step 2: Typecheck** — `... | grep meeting-actions || echo "no new errors"` → `no new errors`.

- [ ] **Step 3: Commit**

```bash
git add server/api/crm
git commit -m "feat(crm): GET meeting-actions — surface unconverted meeting actions on a CRM record"
```

---

### Task 9: `POST /api/crm/meeting-actions/:actionItemId/convert`

**Files:**
- Create: `server/api/crm/meeting-actions/[actionItemId]/convert.post.ts`

- [ ] **Step 1: Write the endpoint** (target = the CRM record in context; validated against the resolver)

```ts
/**
 * POST /api/crm/meeting-actions/:actionItemId/convert
 * Convert a meeting action item into a CRM task against an in-context CRM target.
 */
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import {
  findMeetingCrmCandidates, rankTargets, convertActionItemToCrmTask,
} from '~~/server/utils/crm/meetingBridge'

const Body = z.object({
  client_id: z.string().uuid(),
  target_type: z.enum(['opportunity', 'person', 'company']),
  target_id: z.string().uuid(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireWriteAccess(event)
  const actionItemId = getRouterParam(event, 'actionItemId')
  if (!actionItemId) throw createError({ statusCode: 400, statusMessage: 'actionItemId required' })
  const body = Body.parse(await readBody(event))

  const actionItem = await queryOne<any>(
    `SELECT omai.*, oms.title AS meeting_title
     FROM office_meeting_action_items omai
     JOIN office_meeting_sessions oms ON oms.id = omai.meeting_session_id
     WHERE omai.id = $1`, [actionItemId])
  if (!actionItem) throw createError({ statusCode: 404, statusMessage: 'Action item not found' })

  const proposals = rankTargets(await findMeetingCrmCandidates(actionItem.meeting_session_id))
  const allTargets = proposals.flatMap(p => [
    { client_id: p.client_id, target_type: p.target_type, target_id: p.target_id },
    ...p.alternatives.map(a => ({ client_id: a.client_id, target_type: a.target_type, target_id: a.target_id })),
  ])
  const ok = allTargets.some(t =>
    t.client_id === body.client_id && t.target_type === body.target_type && t.target_id === body.target_id)
  if (!ok) throw createError({ statusCode: 400, statusMessage: 'Chosen target is not a valid candidate for this meeting' })

  return convertActionItemToCrmTask(
    {
      id: actionItem.id, meeting_session_id: actionItem.meeting_session_id,
      meeting_title: actionItem.meeting_title, source_artifact_id: actionItem.source_artifact_id,
      content: actionItem.content, due_at: actionItem.due_at, crm_task_id: actionItem.crm_task_id,
    },
    { client_id: body.client_id, target_type: body.target_type, target_id: body.target_id },
    { actor: user.id, mode: 'manual_crm', priority: body.priority },
  )
})
```

- [ ] **Step 2: Typecheck** → `no new errors`.

- [ ] **Step 3: Commit**

```bash
git add server/api/crm/meeting-actions
git commit -m "feat(crm): POST meeting-actions convert — CRM-side action-item → task"
```

---

### Task 10: CRM slideover — "From recent meetings" section

**Files:**
- Modify: the CRM person/company slideover that already hosts `app/components/crm/AiSuggestions.client.vue`

- [ ] **Step 1: Find where AiSuggestions renders**

Run: `grep -rln "AiSuggestions\|CrmAiSuggestions" app/components app/pages`
Expected: the slideover component(s). Add the new section directly beneath it.

- [ ] **Step 2: Add the section** (read on open, convert in place)

In the slideover, when `record` is a person or company: `useFetch('/api/crm/' + targetType + '/' + record.id + '/meeting-actions')`. Render each `actionItem` (content + `meeting_title` + relative date) with a "Convert to task" `UButton`. Click → `$fetch('/api/crm/meeting-actions/' + actionItem.id + '/convert', { method:'POST', body: { client_id: record.client_id, target_type: targetType, target_id: record.id } })` → toast success, remove the row from the list. Hide the whole section when `actionItems.length === 0`.

- [ ] **Step 3: Manual browser check** — open a contact who attended a meeting with an action-item → section shows it → Convert → toast + the item disappears + `crm_tasks` row exists.

- [ ] **Step 4: Commit + slice gate**

```bash
git add app/components/crm
git commit -m "feat(crm): From-recent-meetings section — convert meeting actions from the CRM record"
```
Then `pnpm exec vitest run test/crm` green + typecheck 0 NEW → open a PR for Slice P4.3b-2.

---

# Slice P4.3b-3 — Auto-create cron (flag-gated, dormant)

### Task 11: `POST /api/cron/crm-meeting-actions`

**Files:**
- Create: `server/api/cron/crm-meeting-actions.post.ts`

- [ ] **Step 1: Inspect an existing CRM cron for the secret-gate + structure**

Run: `sed -n '1,40p' server/api/cron/crm-task-reminders.post.ts`
Expected: the `x-cron-secret` verification pattern + `CRM_AI_ENABLED`/flag reads. Mirror it exactly (header name, 401 on mismatch).

- [ ] **Step 2: Write the cron** (doubly-gated, since-deploy cutoff, high-confidence only, skip-reasons)

```ts
/**
 * POST /api/cron/crm-meeting-actions  (x-cron-secret gated)
 * Auto-converts eligible unconverted meeting action items into CRM tasks.
 * Doubly gated: CRM_AI_ENABLED + per-client crm_settings.meeting_bridge_autocreate.
 * Since-deploy cutoff (meeting_bridge_enabled_at) prevents a first-run backlog flood.
 */
import { queryRows, queryOne } from '~~/server/utils/db'
import {
  findMeetingCrmCandidates, rankTargets, convertActionItemToCrmTask, recordSkipReason,
} from '~~/server/utils/crm/meetingBridge'

export default defineEventHandler(async (event) => {
  const secret = getHeader(event, 'x-cron-secret')
  if (!secret || secret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (process.env.CRM_AI_ENABLED !== 'true') {
    return { skipped: 'flag_disabled', converted: 0 }
  }

  // Opt-in clients with an enable timestamp (the since-deploy cutoff).
  const optIns = await queryRows<{ client_id: string, enabled_at: string }>(
    `SELECT client_id, meeting_bridge_enabled_at AS enabled_at
     FROM crm_settings
     WHERE meeting_bridge_autocreate = true AND meeting_bridge_enabled_at IS NOT NULL`)
  if (optIns.length === 0) return { skipped: 'no_optin_clients', converted: 0 }

  const cutoffByClient = new Map(optIns.map(o => [o.client_id, o.enabled_at]))
  const clientIds = optIns.map(o => o.client_id)

  // Candidate action items: unconverted, no skip reason yet, created after the
  // earliest opt-in cutoff. Per-client cutoff re-checked after resolution.
  const earliestCutoff = optIns.map(o => o.enabled_at).sort()[0]
  const items = await queryRows<any>(
    `SELECT omai.id, omai.meeting_session_id, omai.content, omai.due_at,
            omai.source_artifact_id, omai.crm_task_id, omai.created_at,
            oms.title AS meeting_title
     FROM office_meeting_action_items omai
     JOIN office_meeting_sessions oms ON oms.id = omai.meeting_session_id
     WHERE omai.crm_task_id IS NULL
       AND omai.created_at >= $1
       AND NOT (omai.metadata ? 'crm_skip_reason')
     ORDER BY omai.created_at ASC
     LIMIT 200`, [earliestCutoff])

  let converted = 0, skipped = 0
  for (const item of items) {
    const proposals = rankTargets(await findMeetingCrmCandidates(item.meeting_session_id))
    if (proposals.length === 0) { await recordSkipReason(item.id, 'no_crm_match'); skipped++; continue }
    const distinctClients = new Set(proposals.map(p => p.client_id))
    if (proposals.length > 1 && distinctClients.size > 1) { await recordSkipReason(item.id, 'ambiguous_multi_client'); skipped++; continue }
    if (proposals.length > 1) { await recordSkipReason(item.id, 'ambiguous_multi_person'); skipped++; continue }

    const p = proposals[0]
    if (p.confidence !== 'high') { await recordSkipReason(item.id, 'ambiguous_multi_person'); skipped++; continue }
    // Per-client opt-in + cutoff (the matched client, not the meeting's).
    const cutoff = cutoffByClient.get(p.client_id)
    if (!cutoff || item.created_at < cutoff) { skipped++; continue }

    await convertActionItemToCrmTask(
      { id: item.id, meeting_session_id: item.meeting_session_id, meeting_title: item.meeting_title,
        source_artifact_id: item.source_artifact_id, content: item.content, due_at: item.due_at, crm_task_id: null },
      { client_id: p.client_id, target_type: p.target_type, target_id: p.target_id },
      { actor: null, mode: 'auto' })
    converted++
  }
  return { converted, skipped, scanned: items.length }
})
```

- [ ] **Step 3: Typecheck** → `no new errors`.

- [ ] **Step 4: Commit**

```bash
git add server/api/cron/crm-meeting-actions.post.ts
git commit -m "feat(cron): crm-meeting-actions — gated auto-convert with flood guard + skip reasons"
```

---

### Task 12: `workers/crm-cron` handler + schedule + runbook

**Files:**
- Modify: `workers/crm-cron/` (the P4.1 companion Worker — verify it exists; if P4.1 hasn't shipped it, create it mirroring `workers/meta-status-cron`)
- Modify: `docs/superpowers/specs/2026-06-02-crm-p4-3b-meeting-bridge-design.md` (append a short activation runbook delta, or add to the CRM handoff)

- [ ] **Step 1: Confirm the worker exists**

Run: `ls workers/crm-cron 2>/dev/null && sed -n '1,60p' workers/crm-cron/src/*.* 2>/dev/null || echo "crm-cron worker not present yet"`
Expected: either the worker (add a fetch to the new endpoint alongside the existing reminder/decay/dormancy calls) or "not present yet" (create it from the `workers/meta-status-cron` template — `scheduled()` handler POSTing to the endpoint with `x-cron-secret: env.CRON_SECRET`).

- [ ] **Step 2: Add the scheduled call**

In the worker's `scheduled()` handler, add a `fetch(\`${BASE}/api/cron/crm-meeting-actions\`, { method:'POST', headers: { 'x-cron-secret': env.CRON_SECRET } })` alongside the existing P4.1 cron POSTs. Schedule `0 * * * *` (the endpoint self-gates; hourly is ample for follow-up tasks).

- [ ] **Step 3: Write the activation runbook delta**

Append to the design doc §8 (or the next CRM handoff): the operator must (1) `CRM_AI_ENABLED='true'`; (2) for each pilot client, `UPDATE crm_settings SET meeting_bridge_autocreate=true, meeting_bridge_enabled_at=now() WHERE client_id='…'`; (3) deploy `workers/crm-cron` with `CRON_SECRET`. Cutoff = the `meeting_bridge_enabled_at` you set, so only action-items created *after* that moment convert. ⚠️ Never enable without explicit go-ahead.

- [ ] **Step 4: Commit + final slice gate**

```bash
git add workers/crm-cron docs/superpowers/specs/2026-06-02-crm-p4-3b-meeting-bridge-design.md
git commit -m "feat(cron): wire crm-meeting-actions into crm-cron worker + activation runbook"
```
Then `pnpm exec vitest run test/crm` green + typecheck 0 NEW → open a PR for Slice P4.3b-3.

---

## Final verification (before the program is "done")
- [ ] All three slices merged; `crm_tasks` reachable from a meeting action-item via office button, CRM record, and (when enabled) cron.
- [ ] `pnpm exec vitest run test/crm` green; `nuxt typecheck` 0 NEW errors.
- [ ] Migration 159 confirmed live on prod DB (`\d office_meeting_action_items`, `\d crm_settings`).
- [ ] Auto-create remains **dormant** (`CRM_AI_ENABLED` off / no opt-in clients) until operator go-ahead.
- [ ] Marketing-page sync (CLAUDE.md "Front-Facing Page Sync"): if P4.3b is user-visible enough to list, add a line under the CRM feature category — otherwise note it as internal-only in the PR.
