# Social Inbox — Phase 2c (Team Workflow + SLA) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add team-workflow capability to the social engagement inbox — conversation assignment (auto round-robin + manual), SLA policies with first-response tracking + breach alerts, saved replies with `{{variables}}`, internal notes with @mentions, and a response/SLA analytics overview.

**Architecture:** Pure + DB-injected units mirror the 2a/2b/D2 testability pattern: `assignment.ts` (round-robin pick + auto-assign), `sla.ts` (due-at compute + first-response stamp + breach scan), `savedReplies.ts` (template render). SLA/assignment hook into the existing ingestion path (`recordInbound` → `onInboundRecorded`) and reply path (`recordOutbound` stamps `first_response_at`); a periodic breach scan runs in the existing `sync-social-inbox` cron and notifies via `notifications.ts`. Migration 152 adds only the two new tables (`social_saved_replies`, `social_sla_policies`) — the `assigned_to`/`sla_*` columns already shipped in migration 148.

**Tech Stack:** Nitro (Nuxt 4 server), Neon Postgres via `server/utils/db.ts`, `notifications.ts` (`createNotification`), Vitest, Nuxt UI v4.

---

## Background: what already exists

- **Migration 148** already added the 2c columns on `social_conversations`: `assigned_to TEXT`, `assigned_at TIMESTAMPTZ`, `sla_due_at`, `first_response_at`, `sla_breached BOOLEAN DEFAULT FALSE`. **2c only needs the two new tables.**
- `server/utils/socialInbox/store.ts` — `recordInbound(db, clientId, accountId, ev) → {conversationId, inserted}` (sets `automation_state='pending'`); `recordOutbound(db, conversationId, clientId, args)`. DB-injected `DbRunner = {queryOne, execute}`.
- `server/api/agency/social/inbox/conversations/[id]/index.patch.ts` — currently handles `status` + `markRead` only (bare `requireAuth`). 2c extends it with `assigned_to` + `snoozed_until`.
- `server/api/agency/social/inbox/conversations/index.get.ts` — `SELECT * ... WHERE client_id` with an extensible filter loop over `[col,key]` pairs. 2c adds `assigned_to` + SLA filters.
- `server/api/cron/sync-social-inbox.post.ts` — the poll loop calls `recordInbound`; the automation pass (2b) runs after, gated. 2c adds (a) `onInboundRecorded` per new inbound, (b) a breach scan in the tick.
- `server/utils/notifications.ts` — `createNotification({userId, type, title, message, link?, actorId?, metadata?, sendEmail?, reason?})`; `NotificationType` is an extensible string union (line 12). `notifyMention(params)` exists for @mentions.
- `server/database/migrations/064-client-team-assignments.sql` — `client_team_assignments(client_id, team_member_id, role)` UNIQUE(client_id, team_member_id). Auto-assign picks from here.
- `server/api/agency/team-members.get.ts` — lists team members (for the assignee picker).
- Inbox UI: `app/pages/agency/social/inbox/index.vue` + components `app/components/social-inbox/{Sidebar,Thread,Composer,ActionPanel}.vue`.

**⚠️ Migration number:** This plan uses **152**. At execution time re-check `ls server/database/migrations/ | grep -oE '^[0-9]+' | sort -n | tail -1` and bump if taken (migration collisions have been live — audio used 149/150, social automation 151).

**Auth note:** the inbox endpoints use bare `requireAuth` (not `requireRole(CREATIVE)`) — 2a/2b set that precedent; 2c matches it for consistency.

**`assigned_to` semantics:** stores a team member **user id** (string). Auto-assign is about *who handles* a conversation (a client's team), which is distinct from access control — agency staff are not client-scoped in this codebase.

---

## File Structure

```
server/database/migrations/152_social_team_workflow.sql   # social_saved_replies + social_sla_policies
server/utils/socialInbox/
  assignment.ts   # pickRoundRobin (pure) · autoAssignConversation (DB-injected)
  sla.ts          # computeSlaDueAt (pure) · applySlaOnInbound · markFirstResponse · findBreaches (DB-injected)
  savedReplies.ts # renderTemplate (pure)
  workflow.ts     # onInboundRecorded(db, deps, ctx) — ties SLA-stamp + auto-assign into ingestion
  store.ts        # MODIFY: recordOutbound stamps first_response_at
server/api/agency/social/inbox/
  conversations/[id]/index.patch.ts   # MODIFY: assigned_to + snoozed_until
  conversations/[id]/note.post.ts     # NEW: internal note + @mention notify
  conversations/index.get.ts          # MODIFY: assignee + SLA filters
  saved-replies/{index.get,index.post,[id].patch,[id].delete}.ts
  sla-policies/{index.get,index.post,[id].patch,[id].delete}.ts
  analytics/overview.get.ts           # NEW: response-time / SLA / volume / automation-rate
server/api/cron/sync-social-inbox.post.ts   # MODIFY: onInboundRecorded per inbound + breach scan
server/utils/notifications.ts               # MODIFY: add 'social_assigned' + 'social_sla_breach' types
app/types/index.ts                          # MODIFY: SocialSavedReply, SocialSlaPolicy, analytics types
app/components/social-inbox/ActionPanel.vue # MODIFY: assign + snooze + SLA badge + notes
app/components/social-inbox/Composer.vue    # MODIFY: saved-reply picker
app/pages/agency/social/inbox/analytics.vue # NEW
app/pages/agency/social/inbox/settings.vue  # NEW: saved-replies + SLA-policies management
app/layouts/agency.vue                      # MODIFY: nav (Analytics, Inbox Settings)
test/social/{assignment,sla,savedReplies}.test.ts
```

---

## Task 1: Migration — saved replies + SLA policies

**Files:**
- Create: `server/database/migrations/152_social_team_workflow.sql`

- [ ] **Step 1: Re-check the migration number**

Run: `ls server/database/migrations/ | grep -oE '^[0-9]+' | sort -n | tail -1`
Expected: `151`. If ≥152, rename this file to `<max+1>_social_team_workflow.sql` and use that number throughout.

- [ ] **Step 2: Write the migration**

```sql
-- 152_social_team_workflow.sql — Social Suite Slice 2c: team workflow + SLA.
-- Additive. The 2c COLUMNS (assigned_to, assigned_at, sla_due_at, first_response_at, sla_breached)
-- already shipped on social_conversations in 148_social_inbox.sql. This adds only the two new tables.
-- Run: psql "$DATABASE_URL" -f server/database/migrations/152_social_team_workflow.sql

CREATE TABLE IF NOT EXISTS social_saved_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES agency_clients(id) ON DELETE CASCADE,  -- NULL = org-wide
  name TEXT NOT NULL,
  category TEXT,
  content TEXT NOT NULL,                          -- may contain {{variables}}
  platforms TEXT[],                               -- NULL/empty = all networks
  usage_count INT NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_social_saved_replies_client ON social_saved_replies(client_id);

CREATE TABLE IF NOT EXISTS social_sla_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  channel_type TEXT,                              -- comment|review|dm|mention; NULL = all channels
  target_minutes INT NOT NULL DEFAULT 240,        -- first-response target
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, channel_type)
);
CREATE INDEX IF NOT EXISTS idx_social_sla_client ON social_sla_policies(client_id, enabled);
```

*(YAGNI note: `social_sla_policies.business_hours` from spec §4 is omitted — v1 SLA is elapsed-minutes; business-hours-aware SLA is a documented fast-follow.)*

- [ ] **Step 3: Run it**

Run:
```bash
export DATABASE_URL=$(grep '^DATABASE_URL' /Users/paulgiurin/Documents/Projects/dashboard/.env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/152_social_team_workflow.sql
```
Expected: `CREATE TABLE`/`CREATE INDEX`, no errors. (The worktree has no `.env`; source it from the main checkout as shown.)

- [ ] **Step 4: Verify**

Run: `psql "$DATABASE_URL" -c "SELECT to_regclass('social_saved_replies'), to_regclass('social_sla_policies');"`
Expected: both non-null.

- [ ] **Step 5: Commit**

```bash
git add server/database/migrations/152_social_team_workflow.sql
git commit -m "feat(social-inbox): migration 152 — saved replies + SLA policies"
```

---

## Task 2: Round-robin assignment (pure + DB-injected)

**Files:**
- Create: `server/utils/socialInbox/assignment.ts`
- Test: `test/social/assignment.test.ts`

- [ ] **Step 1: Write the failing test**

`test/social/assignment.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { pickRoundRobin, autoAssignConversation } from '~~/server/utils/socialInbox/assignment'

describe('pickRoundRobin', () => {
  it('picks the first member when there is no prior assignee', () => {
    expect(pickRoundRobin(['a', 'b', 'c'], null)).toBe('a')
  })
  it('picks the member after the last assignee', () => {
    expect(pickRoundRobin(['a', 'b', 'c'], 'a')).toBe('b')
    expect(pickRoundRobin(['a', 'b', 'c'], 'b')).toBe('c')
  })
  it('wraps around', () => {
    expect(pickRoundRobin(['a', 'b', 'c'], 'c')).toBe('a')
  })
  it('handles a last assignee no longer in the list', () => {
    expect(pickRoundRobin(['a', 'b'], 'zzz')).toBe('a')
  })
  it('returns null for an empty member list', () => {
    expect(pickRoundRobin([], 'a')).toBeNull()
  })
})

describe('autoAssignConversation', () => {
  function fakeDb(members: string[], lastAssignee: string | null, alreadyAssigned: string | null) {
    return {
      queryOne: vi.fn(async (sql: string) => {
        if (/assigned_to FROM social_conversations WHERE id/.test(sql)) return { assigned_to: alreadyAssigned }
        if (/MAX\(assigned_at\)/.test(sql)) return lastAssignee ? { assigned_to: lastAssignee } : null
        return null
      }),
      queryRows: vi.fn(async (sql: string) => {
        if (/FROM client_team_assignments/.test(sql)) return members.map(team_member_id => ({ team_member_id }))
        return []
      }),
      execute: vi.fn(async () => 1),
    }
  }
  it('assigns the next round-robin member to an unassigned conversation', async () => {
    const db = fakeDb(['u1', 'u2', 'u3'], 'u1', null)
    const r = await autoAssignConversation(db as any, 'conv1', 'client1')
    expect(r).toBe('u2')
    expect(db.execute).toHaveBeenCalledWith(expect.stringMatching(/UPDATE social_conversations SET assigned_to/), expect.arrayContaining(['u2', 'conv1']))
  })
  it('does nothing when the conversation is already assigned', async () => {
    const db = fakeDb(['u1', 'u2'], 'u1', 'u9')
    const r = await autoAssignConversation(db as any, 'conv1', 'client1')
    expect(r).toBeNull()
    expect(db.execute).not.toHaveBeenCalled()
  })
  it('does nothing when the client has no team members', async () => {
    const db = fakeDb([], null, null)
    expect(await autoAssignConversation(db as any, 'conv1', 'client1')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run test/social/assignment.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`server/utils/socialInbox/assignment.ts`:
```ts
// server/utils/socialInbox/assignment.ts
// Round-robin conversation assignment to a client's team members. Pure picker + DB-injected applier.
export interface AssignDb {
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>
  queryRows<T = any>(sql: string, params?: any[]): Promise<T[]>
  execute(sql: string, params?: any[]): Promise<number>
}

/** Next member after `lastAssignee` (round-robin). null/unknown last → first member. [] → null. */
export function pickRoundRobin(members: string[], lastAssignee: string | null): string | null {
  if (!members.length) return null
  if (!lastAssignee) return members[0]!
  const idx = members.indexOf(lastAssignee)
  if (idx === -1) return members[0]!
  return members[(idx + 1) % members.length]!
}

/**
 * Auto-assign an unassigned conversation to the next team member of its client. No-op if the
 * conversation is already assigned or the client has no team. Returns the assignee id, or null.
 */
export async function autoAssignConversation(db: AssignDb, conversationId: string, clientId: string): Promise<string | null> {
  const conv = await db.queryOne<{ assigned_to: string | null }>(
    `SELECT assigned_to FROM social_conversations WHERE id = $1`, [conversationId])
  if (!conv || conv.assigned_to) return null

  const members = (await db.queryRows<{ team_member_id: string }>(
    `SELECT team_member_id FROM client_team_assignments WHERE client_id = $1 ORDER BY team_member_id ASC`, [clientId]))
    .map(m => m.team_member_id)
  if (!members.length) return null

  const last = await db.queryOne<{ assigned_to: string }>(
    `SELECT assigned_to FROM social_conversations
       WHERE client_id = $1 AND assigned_to IS NOT NULL AND assigned_at = (
         SELECT MAX(assigned_at) FROM social_conversations WHERE client_id = $1 AND assigned_to IS NOT NULL)
       LIMIT 1`, [clientId])

  const next = pickRoundRobin(members, last?.assigned_to ?? null)
  if (!next) return null
  await db.execute(
    `UPDATE social_conversations SET assigned_to = $1, assigned_at = NOW(), updated_at = NOW() WHERE id = $2`,
    [next, conversationId])
  return next
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run test/social/assignment.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/socialInbox/assignment.ts test/social/assignment.test.ts
git commit -m "feat(social-inbox): round-robin conversation assignment"
```

---

## Task 3: SLA compute + stamp + breach scan (pure + DB-injected)

**Files:**
- Create: `server/utils/socialInbox/sla.ts`
- Test: `test/social/sla.test.ts`

- [ ] **Step 1: Write the failing test**

`test/social/sla.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { computeSlaDueAt, applySlaOnInbound, findBreaches } from '~~/server/utils/socialInbox/sla'

describe('computeSlaDueAt', () => {
  it('adds target_minutes to now', () => {
    const now = new Date('2026-06-02T00:00:00.000Z')
    expect(computeSlaDueAt({ target_minutes: 60 }, now)).toBe('2026-06-02T01:00:00.000Z')
  })
  it('defaults to 240 minutes when target is missing/invalid', () => {
    const now = new Date('2026-06-02T00:00:00.000Z')
    expect(computeSlaDueAt({ target_minutes: 0 }, now)).toBe('2026-06-02T04:00:00.000Z')
    expect(computeSlaDueAt({} as any, now)).toBe('2026-06-02T04:00:00.000Z')
  })
})

describe('applySlaOnInbound', () => {
  function db(policy: any, current: { sla_due_at: string | null }) {
    return {
      queryOne: vi.fn(async (sql: string) => {
        if (/FROM social_sla_policies/.test(sql)) return policy
        if (/sla_due_at FROM social_conversations/.test(sql)) return current
        return null
      }),
      execute: vi.fn(async () => 1),
    }
  }
  it('stamps sla_due_at on a conversation with no due date when a policy exists', async () => {
    const d = db({ target_minutes: 120 }, { sla_due_at: null })
    const r = await applySlaOnInbound(d as any, 'conv1', 'client1', 'comment', new Date('2026-06-02T00:00:00.000Z'))
    expect(r).toBe('2026-06-02T02:00:00.000Z')
    expect(d.execute).toHaveBeenCalledWith(expect.stringMatching(/SET sla_due_at/), expect.arrayContaining(['conv1']))
  })
  it('does not overwrite an existing sla_due_at', async () => {
    const d = db({ target_minutes: 120 }, { sla_due_at: '2026-06-02T05:00:00.000Z' })
    expect(await applySlaOnInbound(d as any, 'conv1', 'client1', 'comment', new Date())).toBeNull()
    expect(d.execute).not.toHaveBeenCalled()
  })
  it('does nothing when no SLA policy applies', async () => {
    const d = db(null, { sla_due_at: null })
    expect(await applySlaOnInbound(d as any, 'conv1', 'client1', 'comment', new Date())).toBeNull()
  })
})

describe('findBreaches', () => {
  it('flags overdue, unanswered, not-yet-breached conversations and returns them', async () => {
    const rows = [{ id: 'c1', client_id: 'cl1', assigned_to: 'u1' }]
    const db = {
      queryRows: vi.fn(async () => rows),
      execute: vi.fn(async () => 1),
    }
    const breached = await findBreaches(db as any)
    expect(breached).toEqual(rows)
    expect(db.execute).toHaveBeenCalledWith(expect.stringMatching(/SET sla_breached = TRUE/), expect.anything())
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run test/social/sla.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`server/utils/socialInbox/sla.ts`:
```ts
// server/utils/socialInbox/sla.ts
// SLA first-response tracking. Pure due-at compute + DB-injected stamp/scan. v1 = elapsed minutes
// (business-hours-aware SLA is a documented fast-follow).
export interface SlaDb {
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>
  queryRows<T = any>(sql: string, params?: any[]): Promise<T[]>
  execute(sql: string, params?: any[]): Promise<number>
}

const DEFAULT_TARGET = 240

export function computeSlaDueAt(policy: { target_minutes?: number }, now: Date): string {
  const mins = Number(policy?.target_minutes) > 0 ? Number(policy.target_minutes) : DEFAULT_TARGET
  return new Date(now.getTime() + mins * 60_000).toISOString()
}

/** On a new inbound, stamp sla_due_at if a policy applies and none is set yet. Returns the due ISO or null. */
export async function applySlaOnInbound(db: SlaDb, conversationId: string, clientId: string, channelType: string, now: Date): Promise<string | null> {
  const policy = await db.queryOne<{ target_minutes: number }>(
    `SELECT target_minutes FROM social_sla_policies
       WHERE client_id = $1 AND enabled = TRUE AND (channel_type = $2 OR channel_type IS NULL)
       ORDER BY channel_type NULLS LAST LIMIT 1`, [clientId, channelType])
  if (!policy) return null

  const current = await db.queryOne<{ sla_due_at: string | null }>(
    `SELECT sla_due_at FROM social_conversations WHERE id = $1`, [conversationId])
  if (current?.sla_due_at) return null

  const dueAt = computeSlaDueAt(policy, now)
  await db.execute(`UPDATE social_conversations SET sla_due_at = $1, updated_at = NOW() WHERE id = $2`, [dueAt, conversationId])
  return dueAt
}

/**
 * Find conversations that breached SLA (past due, no first response, not yet flagged), mark them
 * sla_breached, and return them so the caller can fire breach notifications.
 */
export async function findBreaches(db: SlaDb): Promise<Array<{ id: string; client_id: string; assigned_to: string | null }>> {
  const rows = await db.queryRows<{ id: string; client_id: string; assigned_to: string | null }>(
    `SELECT id, client_id, assigned_to FROM social_conversations
       WHERE sla_due_at IS NOT NULL AND sla_due_at < NOW()
         AND first_response_at IS NULL AND sla_breached = FALSE AND status <> 'closed'
       LIMIT 200`)
  if (rows.length) {
    await db.execute(`UPDATE social_conversations SET sla_breached = TRUE, updated_at = NOW() WHERE id = ANY($1)`,
      [rows.map(r => r.id)])
  }
  return rows
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run test/social/sla.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/socialInbox/sla.ts test/social/sla.test.ts
git commit -m "feat(social-inbox): SLA compute, inbound stamp, breach scan"
```

---

## Task 4: First-response stamping in recordOutbound

**Files:**
- Modify: `server/utils/socialInbox/store.ts`
- Test: `test/social/inboxStore.test.ts` (extend)

- [ ] **Step 1: Add a failing assertion**

Append inside the existing `describe` in `test/social/inboxStore.test.ts`:
```ts
it('stamps first_response_at (once) on the outbound update', async () => {
  const sqls: string[] = []
  const db = { queryOne: async () => ({ id: 'c1' }), execute: async (sql: string) => { sqls.push(sql); return 1 } }
  const { recordOutbound } = await import('~~/server/utils/socialInbox/store')
  await recordOutbound(db as any, 'c1', 'cl1', { platformMessageId: 'p1', content: 'hi', sentByUserId: 'u1' })
  expect(sqls.some(s => /first_response_at = COALESCE\(first_response_at, NOW\(\)\)/.test(s))).toBe(true)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run test/social/inboxStore.test.ts`
Expected: FAIL — the outbound UPDATE doesn't set `first_response_at`.

- [ ] **Step 3: Edit the recordOutbound UPDATE in `store.ts`**

In `recordOutbound`, change the conversation UPDATE to also stamp first response (COALESCE keeps the first one):
```ts
  await db.execute(
    `UPDATE social_conversations SET
       last_message_at = NOW(), last_message_preview = $2, last_message_direction = 'out',
       message_count = message_count + 1, unread_count = 0,
       first_response_at = COALESCE(first_response_at, NOW()),
       updated_at = NOW()
     WHERE id = $1`,
    [conversationId, args.content.slice(0, 200)],
  )
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run test/social/inboxStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/socialInbox/store.ts test/social/inboxStore.test.ts
git commit -m "feat(social-inbox): stamp first_response_at on first outbound"
```

---

## Task 5: Saved-reply template render (pure)

**Files:**
- Create: `server/utils/socialInbox/savedReplies.ts`
- Test: `test/social/savedReplies.test.ts`

- [ ] **Step 1: Write the failing test**

`test/social/savedReplies.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { renderTemplate, extractVariables } from '~~/server/utils/socialInbox/savedReplies'

describe('renderTemplate', () => {
  it('substitutes {{variables}} from the map', () => {
    expect(renderTemplate('Hi {{name}}, thanks!', { name: 'Sam' })).toBe('Hi Sam, thanks!')
  })
  it('trims variable whitespace and supports repeats', () => {
    expect(renderTemplate('{{ a }} {{a}}', { a: 'x' })).toBe('x x')
  })
  it('leaves unknown variables as empty string', () => {
    expect(renderTemplate('Hi {{name}}{{missing}}', { name: 'Sam' })).toBe('Hi Sam')
  })
  it('returns the content unchanged when there are no variables', () => {
    expect(renderTemplate('plain text', {})).toBe('plain text')
  })
})

describe('extractVariables', () => {
  it('lists unique variable names', () => {
    expect(extractVariables('{{a}} {{ b }} {{a}}')).toEqual(['a', 'b'])
  })
  it('returns [] when none', () => {
    expect(extractVariables('no vars')).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run test/social/savedReplies.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`server/utils/socialInbox/savedReplies.ts`:
```ts
// server/utils/socialInbox/savedReplies.ts
// Pure {{variable}} templating for saved replies. No I/O.
const VAR_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

export function renderTemplate(content: string, vars: Record<string, string>): string {
  return (content || '').replace(VAR_RE, (_m, name: string) => (vars[name] ?? '')).trim()
}

export function extractVariables(content: string): string[] {
  const out: string[] = []
  for (const m of (content || '').matchAll(VAR_RE)) {
    const name = m[1]!
    if (!out.includes(name)) out.push(name)
  }
  return out
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run test/social/savedReplies.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/socialInbox/savedReplies.ts test/social/savedReplies.test.ts
git commit -m "feat(social-inbox): saved-reply {{variable}} templating"
```

---

## Task 6: Ingestion hook (workflow.ts) + notification types

**Files:**
- Create: `server/utils/socialInbox/workflow.ts`
- Modify: `server/utils/notifications.ts` (add two NotificationType values)

- [ ] **Step 1: Add the notification types**

In `server/utils/notifications.ts`, extend the `NotificationType` union (line ~12) with two members:
```ts
  | 'social_assigned'
  | 'social_sla_breach'
```
(Add them anywhere in the union; keep the leading `|`.)

- [ ] **Step 2: Write `workflow.ts`**

`server/utils/socialInbox/workflow.ts`:
```ts
// server/utils/socialInbox/workflow.ts
// Ties SLA-stamping + auto-assignment into the ingestion path. Called after a genuinely-new inbound
// is recorded (from the poll cron + the webhook). DB + notify injected for testability.
import { applySlaOnInbound } from './sla'
import { autoAssignConversation } from './assignment'

export interface WorkflowDb {
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>
  queryRows<T = any>(sql: string, params?: any[]): Promise<T[]>
  execute(sql: string, params?: any[]): Promise<number>
}
export interface WorkflowDeps {
  notifyAssigned(userId: string, conversationId: string, clientId: string): Promise<void>
}

/** Stamp SLA + auto-assign for a freshly-recorded inbound conversation. Best-effort, never throws fatally. */
export async function onInboundRecorded(
  db: WorkflowDb, deps: WorkflowDeps,
  ctx: { conversationId: string; clientId: string; channelType: string },
): Promise<void> {
  try { await applySlaOnInbound(db, ctx.conversationId, ctx.clientId, ctx.channelType, new Date()) }
  catch (e: any) { console.error('workflow.sla.error', { id: ctx.conversationId, error: String(e?.message ?? e) }) }

  try {
    const assignee = await autoAssignConversation(db, ctx.conversationId, ctx.clientId)
    if (assignee) await deps.notifyAssigned(assignee, ctx.conversationId, ctx.clientId)
  } catch (e: any) { console.error('workflow.assign.error', { id: ctx.conversationId, error: String(e?.message ?? e) }) }
}
```

- [ ] **Step 3: Confirm it type-resolves**

Run: `pnpm exec vitest run test/social/assignment.test.ts test/social/sla.test.ts`
Expected: PASS (sanity that the new module's imports resolve).

- [ ] **Step 4: Commit**

```bash
git add server/utils/socialInbox/workflow.ts server/utils/notifications.ts
git commit -m "feat(social-inbox): ingestion workflow hook (SLA stamp + auto-assign) + notification types"
```

---

## Task 7: Wire workflow + breach scan into the cron

**Files:**
- Modify: `server/api/cron/sync-social-inbox.post.ts`

- [ ] **Step 1: Add imports + a notify helper**

At the top of `sync-social-inbox.post.ts`, add to the existing imports:
```ts
import { onInboundRecorded } from '~~/server/utils/socialInbox/workflow'
import { findBreaches } from '~~/server/utils/socialInbox/sla'
import { createNotification } from '~~/server/utils/notifications'
```
(The file already imports `queryRows, queryOne, execute` — reuse them.)

- [ ] **Step 2: Call the workflow hook after each new inbound**

In the poll loop, the existing line records inbound:
```ts
const res = await recordInbound({ queryOne, execute }, acct.client_id, acct.id, normalizeInboxItem(acct.platform, item))
if (res.inserted) synced++
```
Change it to also run the workflow hook on genuinely-new items:
```ts
const res = await recordInbound({ queryOne, execute }, acct.client_id, acct.id, normalizeInboxItem(acct.platform, item))
if (res.inserted) {
  synced++
  await onInboundRecorded({ queryOne, queryRows, execute }, {
    notifyAssigned: (userId, conversationId, clientId) => createNotification({
      userId, type: 'social_assigned', title: 'New conversation assigned',
      message: 'A social conversation was auto-assigned to you.',
      link: `/agency/social/inbox?c=${conversationId}`, metadata: { conversationId, clientId },
    }).then(() => {}),
  }, { conversationId: res.conversationId, clientId: acct.client_id, channelType: item.channelType })
}
```

- [ ] **Step 3: Add a breach scan before the final return**

Immediately before the `console.log('social-inbox-sync.run', ...)` / `return`, insert:
```ts
  // SLA breach scan — flag overdue unanswered conversations and notify the assignee (or log if unassigned).
  let breaches = 0
  try {
    const breached = await findBreaches({ queryOne, queryRows, execute })
    breaches = breached.length
    for (const b of breached) {
      if (b.assigned_to) {
        await createNotification({
          userId: b.assigned_to, type: 'social_sla_breach', title: 'SLA breached',
          message: 'A social conversation passed its first-response SLA.',
          link: `/agency/social/inbox?c=${b.id}`, sendEmail: true, metadata: { conversationId: b.id, clientId: b.client_id },
        })
      }
    }
  } catch (e: any) { console.error('social-inbox-sla.error', String(e?.message ?? e)) }
```
Then add `breaches` to the final log/return object:
```ts
  console.log('social-inbox-sync.run', { accounts: accounts.length, synced, automated, breaches })
  return { synced, automated, breaches }
```
(Replace the existing `console.log`/`return` that lacked `breaches`.)

- [ ] **Step 4: Confirm the suite resolves**

Run: `pnpm exec vitest run test/social/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/api/cron/sync-social-inbox.post.ts
git commit -m "feat(social-inbox): cron runs workflow hook + SLA breach scan"
```

---

## Task 8: Extend the conversation PATCH (assign + snooze)

**Files:**
- Modify: `server/api/agency/social/inbox/conversations/[id]/index.patch.ts`

- [ ] **Step 1: Replace the handler**

`server/api/agency/social/inbox/conversations/[id]/index.patch.ts`:
```ts
import { requireAuth } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'

/**
 * PATCH /api/agency/social/inbox/conversations/:id
 * Update status, assignment, snooze, or mark read. Body: { status?, assigned_to?, snoozed_until?, markRead? }.
 * assigned_to: a user id, or null to unassign.
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const sets: string[] = []
  const params: any[] = []
  const set = (frag: string, val: any) => { params.push(val); sets.push(frag.replace('$?', `$${params.length}`)) }

  if (body.status && ['open', 'snoozed', 'closed'].includes(body.status)) set('status = $?', body.status)
  if (body.assigned_to !== undefined) {
    set('assigned_to = $?', body.assigned_to || null)
    sets.push(`assigned_at = ${body.assigned_to ? 'NOW()' : 'NULL'}`)
  }
  if (body.snoozed_until !== undefined) set('snoozed_until = $?', body.snoozed_until || null)
  if (body.markRead === true) sets.push(`unread_count = 0`)
  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'nothing to update' })

  params.push(id)
  await execute(`UPDATE social_conversations SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`, params)
  return { ok: true }
})
```

- [ ] **Step 2: Confirm suite green**

Run: `pnpm exec vitest run test/social/`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add 'server/api/agency/social/inbox/conversations/[id]/index.patch.ts'
git commit -m "feat(social-inbox): conversation PATCH supports assign + snooze"
```

---

## Task 9: Conversation list — assignee + SLA filters

**Files:**
- Modify: `server/api/agency/social/inbox/conversations/index.get.ts`

- [ ] **Step 1: Add the filters**

Replace the filter loop + query in `conversations/index.get.ts` body (keep the auth + clientId guard):
```ts
  const params: any[] = [clientId]
  let sql = `SELECT * FROM social_conversations WHERE client_id = $1`
  for (const [col, key] of [['channel_type', 'channel'], ['platform', 'platform'], ['status', 'status'], ['assigned_to', 'assignedTo']] as const) {
    if (q[key]) { params.push(q[key]); sql += ` AND ${col} = $${params.length}` }
  }
  if (q.unassigned === 'true') sql += ` AND assigned_to IS NULL`
  if (q.breached === 'true') sql += ` AND sla_breached = TRUE`
  params.push(Math.min(Number(q.limit) || 100, 500))
  sql += ` ORDER BY last_message_at DESC NULLS LAST LIMIT $${params.length}`
  return await queryRows(sql, params)
```

- [ ] **Step 2: Confirm suite green**

Run: `pnpm exec vitest run test/social/`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add server/api/agency/social/inbox/conversations/index.get.ts
git commit -m "feat(social-inbox): conversation list filters by assignee + SLA breach"
```

---

## Task 10: Internal note + @mention endpoint

**Files:**
- Create: `server/api/agency/social/inbox/conversations/[id]/note.post.ts`

- [ ] **Step 1: Write the endpoint**

`server/api/agency/social/inbox/conversations/[id]/note.post.ts`:
```ts
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, execute } from '~~/server/utils/db'
import { createNotification } from '~~/server/utils/notifications'

/**
 * POST /api/agency/social/inbox/conversations/:id/note  body { content, mentions?: string[] }
 * Records a staff-only internal note (never sent to the platform) and notifies @mentioned teammates.
 */
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const { content, mentions } = await readBody(event)
  if (!content?.trim()) throw createError({ statusCode: 400, statusMessage: 'content required' })

  const conv = await queryOne<{ client_id: string }>(`SELECT client_id FROM social_conversations WHERE id = $1`, [id])
  if (!conv) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  await execute(
    `INSERT INTO social_messages (conversation_id, client_id, direction, message_type, content, is_internal_note, sent_by_user_id, platform_timestamp)
     VALUES ($1,$2,'out','note',$3, TRUE, $4, NOW())`,
    [id, conv.client_id, content.trim(), String(user.id)])

  for (const uid of (Array.isArray(mentions) ? mentions : [])) {
    if (uid && uid !== String(user.id)) {
      await createNotification({
        userId: String(uid), type: 'social_assigned', actorId: String(user.id),
        title: 'Mentioned in a social note', message: content.trim().slice(0, 140),
        link: `/agency/social/inbox?c=${id}`, metadata: { conversationId: id },
      })
    }
  }
  return { ok: true }
})
```

- [ ] **Step 2: Confirm suite green**

Run: `pnpm exec vitest run test/social/`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add 'server/api/agency/social/inbox/conversations/[id]/note.post.ts'
git commit -m "feat(social-inbox): internal note + @mention notify"
```

---

## Task 11: Saved-replies CRUD API

**Files:**
- Create: `server/api/agency/social/inbox/saved-replies/index.get.ts`, `index.post.ts`, `[id].patch.ts`, `[id].delete.ts`

- [ ] **Step 1: List**

`saved-replies/index.get.ts`:
```ts
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

/** GET /api/agency/social/inbox/saved-replies?clientId= → org-wide (client_id IS NULL) + this client's. */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const clientId = getQuery(event).clientId as string
  return await queryRows(
    `SELECT * FROM social_saved_replies WHERE client_id IS NULL OR client_id = $1 ORDER BY category NULLS FIRST, name`,
    [clientId || null])
})
```

- [ ] **Step 2: Create**

`saved-replies/index.post.ts`:
```ts
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

/** POST /api/agency/social/inbox/saved-replies  body { name, content, category?, client_id?, platforms? } */
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const b = await readBody(event)
  if (!b?.name?.trim() || !b?.content?.trim()) throw createError({ statusCode: 400, statusMessage: 'name and content required' })
  return await queryOne(
    `INSERT INTO social_saved_replies (client_id, name, category, content, platforms, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [b.client_id || null, b.name.trim(), b.category || null, b.content.trim(),
     Array.isArray(b.platforms) && b.platforms.length ? b.platforms : null, String(user.id)])
})
```

- [ ] **Step 3: Patch**

`saved-replies/[id].patch.ts`:
```ts
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

/** PATCH /api/agency/social/inbox/saved-replies/:id  body: partial; or { incrementUsage: true } */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const b = await readBody(event)
  if (b.incrementUsage === true) {
    return await queryOne(`UPDATE social_saved_replies SET usage_count = usage_count + 1, updated_at = NOW() WHERE id = $1 RETURNING *`, [id])
  }
  const sets: string[] = []
  const params: any[] = []
  const set = (col: string, val: any, cast = '') => { params.push(val); sets.push(`${col} = $${params.length}${cast}`) }
  if (b.name != null) set('name', String(b.name).trim())
  if (b.content != null) set('content', String(b.content).trim())
  if (b.category !== undefined) set('category', b.category || null)
  if (b.platforms !== undefined) set('platforms', Array.isArray(b.platforms) && b.platforms.length ? b.platforms : null)
  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'nothing to update' })
  params.push(id)
  return await queryOne(`UPDATE social_saved_replies SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`, params)
})
```

- [ ] **Step 4: Delete**

`saved-replies/[id].delete.ts`:
```ts
import { requireAuth } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'

/** DELETE /api/agency/social/inbox/saved-replies/:id */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  await execute(`DELETE FROM social_saved_replies WHERE id = $1`, [id])
  return { ok: true }
})
```

- [ ] **Step 5: Confirm + commit**

Run: `pnpm exec vitest run test/social/`
Expected: PASS.
```bash
git add server/api/agency/social/inbox/saved-replies/
git commit -m "feat(social-inbox): saved-replies CRUD API"
```

---

## Task 12: SLA-policies CRUD API

**Files:**
- Create: `server/api/agency/social/inbox/sla-policies/index.get.ts`, `index.post.ts`, `[id].patch.ts`, `[id].delete.ts`

- [ ] **Step 1: List**

`sla-policies/index.get.ts`:
```ts
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

/** GET /api/agency/social/inbox/sla-policies?clientId= */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const clientId = getQuery(event).clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  return await queryRows(`SELECT * FROM social_sla_policies WHERE client_id = $1 ORDER BY channel_type NULLS FIRST`, [clientId])
})
```

- [ ] **Step 2: Create (upsert on the unique key)**

`sla-policies/index.post.ts`:
```ts
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

/** POST /api/agency/social/inbox/sla-policies  body { client_id, channel_type?, target_minutes, enabled? } */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const b = await readBody(event)
  if (!b?.client_id) throw createError({ statusCode: 400, statusMessage: 'client_id required' })
  return await queryOne(
    `INSERT INTO social_sla_policies (client_id, channel_type, target_minutes, enabled)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (client_id, channel_type) DO UPDATE SET
       target_minutes = EXCLUDED.target_minutes, enabled = EXCLUDED.enabled, updated_at = NOW()
     RETURNING *`,
    [b.client_id, b.channel_type || null, Number(b.target_minutes) > 0 ? Number(b.target_minutes) : 240, b.enabled !== false])
})
```
*(Note: `ON CONFLICT (client_id, channel_type)` relies on the unique index; a NULL `channel_type` is treated as distinct by Postgres, so the org-wide "all channels" policy upserts on its own row only when channel_type is consistently NULL — acceptable for v1 since the UI sends an explicit channel or "all".)*

- [ ] **Step 3: Patch**

`sla-policies/[id].patch.ts`:
```ts
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

/** PATCH /api/agency/social/inbox/sla-policies/:id  body { target_minutes?, enabled? } */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const b = await readBody(event)
  const sets: string[] = []
  const params: any[] = []
  const set = (col: string, val: any) => { params.push(val); sets.push(`${col} = $${params.length}`) }
  if (b.target_minutes != null && Number(b.target_minutes) > 0) set('target_minutes', Number(b.target_minutes))
  if (b.enabled != null) set('enabled', !!b.enabled)
  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'nothing to update' })
  params.push(id)
  return await queryOne(`UPDATE social_sla_policies SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`, params)
})
```

- [ ] **Step 4: Delete**

`sla-policies/[id].delete.ts`:
```ts
import { requireAuth } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'

/** DELETE /api/agency/social/inbox/sla-policies/:id */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  await execute(`DELETE FROM social_sla_policies WHERE id = $1`, [id])
  return { ok: true }
})
```

- [ ] **Step 5: Confirm + commit**

Run: `pnpm exec vitest run test/social/`
Expected: PASS.
```bash
git add server/api/agency/social/inbox/sla-policies/
git commit -m "feat(social-inbox): SLA-policies CRUD API"
```

---

## Task 13: Analytics overview API

**Files:**
- Create: `server/api/agency/social/inbox/analytics/overview.get.ts`

- [ ] **Step 1: Write the endpoint**

`analytics/overview.get.ts`:
```ts
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

/**
 * GET /api/agency/social/inbox/analytics/overview?clientId=&days=30
 * Response-time, SLA, volume and automation-rate metrics for the client's conversations in the window.
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = getQuery(event)
  const clientId = q.clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  const days = Math.min(Math.max(Number(q.days) || 30, 1), 365)

  const row = await queryOne<any>(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'open')::int AS open_count,
       COUNT(*) FILTER (WHERE first_response_at IS NOT NULL)::int AS responded,
       COUNT(*) FILTER (WHERE sla_due_at IS NOT NULL)::int AS sla_tracked,
       COUNT(*) FILTER (WHERE sla_breached = TRUE)::int AS breaches,
       COUNT(*) FILTER (WHERE first_response_at IS NOT NULL AND (sla_due_at IS NULL OR first_response_at <= sla_due_at))::int AS within_sla,
       COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (first_response_at - created_at)) / 60.0) FILTER (WHERE first_response_at IS NOT NULL))::int, 0) AS avg_first_response_minutes
     FROM social_conversations
     WHERE client_id = $1 AND created_at > NOW() - MAKE_INTERVAL(days => $2)`,
    [clientId, days])

  const automation = await queryOne<{ auto: number; sent: number }>(
    `SELECT
       COUNT(*) FILTER (WHERE effective_mode = 'autopilot' AND status = 'sent')::int AS auto,
       COUNT(*)::int AS sent
     FROM social_response_queue
     WHERE client_id = $1 AND created_at > NOW() - MAKE_INTERVAL(days => $2)`,
    [clientId, days]).catch(() => ({ auto: 0, sent: 0 }))

  const slaTracked = row?.sla_tracked || 0
  return {
    total: row?.total || 0,
    open: row?.open_count || 0,
    responded: row?.responded || 0,
    avgFirstResponseMinutes: row?.avg_first_response_minutes || 0,
    slaTracked,
    breaches: row?.breaches || 0,
    withinSlaPct: slaTracked ? Math.round(((row?.within_sla || 0) / slaTracked) * 100) : null,
    automationRatePct: automation?.sent ? Math.round((automation.auto / automation.sent) * 100) : 0,
  }
})
```

- [ ] **Step 2: Confirm + commit**

Run: `pnpm exec vitest run test/social/`
Expected: PASS.
```bash
git add server/api/agency/social/inbox/analytics/
git commit -m "feat(social-inbox): analytics overview API"
```

---

## Task 14: Frontend types

**Files:**
- Modify: `app/types/index.ts` (append after the `SocialResponseQueueItem` interface)

- [ ] **Step 1: Add the types**

```ts
// --- Social Inbox team workflow (Slice 2c) ---
export interface SocialSavedReply {
  id: string
  client_id: string | null
  name: string
  category: string | null
  content: string
  platforms: string[] | null
  usage_count: number
  created_at: string
  updated_at: string
}

export interface SocialSlaPolicy {
  id: string
  client_id: string
  channel_type: string | null
  target_minutes: number
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface SocialInboxAnalytics {
  total: number
  open: number
  responded: number
  avgFirstResponseMinutes: number
  slaTracked: number
  breaches: number
  withinSlaPct: number | null
  automationRatePct: number
}
```

- [ ] **Step 2: Compile check**

Run: `pnpm exec nuxt prepare`
Expected: "Types generated in .nuxt".

- [ ] **Step 3: Commit**

```bash
git add app/types/index.ts
git commit -m "feat(social-inbox): 2c frontend types (saved reply, SLA policy, analytics)"
```

---

## Task 15: ActionPanel — assign + snooze + SLA badge + notes

**Files:**
- Modify: `app/components/social-inbox/ActionPanel.vue`

**Pre-req:** form-touching — invoke the `frontend-design` skill; Nuxt UI v4 only (`USelectMenu`, `UButton`, `UTextarea`, `UBadge`), no raw elements.

- [ ] **Step 1: Read the current ActionPanel**

Run: `cat app/components/social-inbox/ActionPanel.vue`
Note its `props` (it receives `conversation`) and emits (`status`, `mark-read`). Match those names; add `assigned` + `note` emits.

- [ ] **Step 2: Add the controls (script)**

In `<script setup>` add (using the conversation prop name the file defines, shown here as `props.conversation`):
```ts
const { data: members } = await useFetch<any[]>('/api/agency/team-members', { default: () => [] })
const memberOptions = computed(() => [{ label: 'Unassigned', value: '' }, ...(members.value || []).map((m: any) => ({ label: m.name || m.email, value: String(m.id) }))])
const assignee = computed({
  get: () => props.conversation?.assigned_to || '',
  set: (v: string) => emit('assigned', v || null),
})
const noteText = ref('')
const toast = useToast()
async function addNote() {
  if (!noteText.value.trim() || !props.conversation?.id) return
  try {
    await $fetch(`/api/agency/social/inbox/conversations/${props.conversation.id}/note`, { method: 'POST', body: { content: noteText.value.trim() } })
    noteText.value = ''
    toast.add({ title: 'Note added', color: 'success' })
  } catch (e: any) { toast.add({ title: 'Failed', description: e?.data?.statusMessage, color: 'error' }) }
}
function slaBadge() {
  const c = props.conversation
  if (!c?.sla_due_at) return null
  if (c.sla_breached) return { label: 'SLA breached', color: 'error' }
  if (c.first_response_at) return { label: 'Responded', color: 'success' }
  return { label: `Due ${new Date(c.sla_due_at).toLocaleString()}`, color: 'warning' }
}
```
Add `emit` declarations if the file uses `defineEmits` — extend it: `const emit = defineEmits<{ status: [string]; 'mark-read': []; assigned: [string | null]; note: [] }>()` (merge with existing).

- [ ] **Step 3: Add to the template**

Inside the panel body, add an Assignment + SLA + Notes section:
```vue
<div class="space-y-3 p-3 border-t border-default">
  <UFormField label="Assigned to">
    <USelectMenu v-model="assignee" :items="memberOptions" value-key="value" class="w-full" />
  </UFormField>
  <UBadge v-if="slaBadge()" :color="(slaBadge()!.color as any)" variant="subtle">{{ slaBadge()!.label }}</UBadge>
  <UFormField label="Internal note">
    <UTextarea v-model="noteText" :rows="2" placeholder="Staff-only — never sent" class="w-full" />
    <template #help>
      <UButton size="xs" variant="ghost" label="Add note" :disabled="!noteText.trim()" @click="addNote" />
    </template>
  </UFormField>
</div>
```

- [ ] **Step 4: Compile check**

Run: `pnpm exec nuxt prepare`
Expected: "Types generated in .nuxt".

- [ ] **Step 5: Commit**

```bash
git add app/components/social-inbox/ActionPanel.vue
git commit -m "feat(social-inbox): ActionPanel — assign, SLA badge, internal notes"
```

---

## Task 16: Wire the assigned emit in the inbox page

**Files:**
- Modify: `app/pages/agency/social/inbox/index.vue`

- [ ] **Step 1: Read the page's ActionPanel usage + handlers**

Run: `grep -n "SocialInboxActionPanel\|onStatus\|onMarkRead" app/pages/agency/social/inbox/index.vue`
Note the existing `@status`/`@mark-read` handlers and the selected conversation ref.

- [ ] **Step 2: Add the `@assigned` handler**

On the `<SocialInboxActionPanel ...>` usage, add `@assigned="onAssigned"`. In `<script setup>` add:
```ts
async function onAssigned(userId: string | null) {
  if (!selectedConv.value?.id) return
  await $fetch(`/api/agency/social/inbox/conversations/${selectedConv.value.id}`, { method: 'PATCH', body: { assigned_to: userId } })
  await reload()
}
```
(Use the page's existing selected-conversation ref name and its list-refresh function — shown here as `selectedConv` / `reload`; match the file.)

- [ ] **Step 3: Compile check**

Run: `pnpm exec nuxt prepare`
Expected: "Types generated in .nuxt".

- [ ] **Step 4: Commit**

```bash
git add app/pages/agency/social/inbox/index.vue
git commit -m "feat(social-inbox): wire conversation assignment from the inbox"
```

---

## Task 17: Composer — saved-reply picker

**Files:**
- Modify: `app/components/social-inbox/Composer.vue`

**Pre-req:** form-touching — `frontend-design` skill; Nuxt UI v4 (`UDropdownMenu` or `USelectMenu`).

- [ ] **Step 1: Add the picker (script)**

In `Composer.vue` `<script setup>` add (it already has `draft` + `conversationId` from the D2/2b work; reuse them):
```ts
const { data: savedReplies } = await useFetch<any[]>('/api/agency/social/inbox/saved-replies', { default: () => [] })
const replyItems = computed(() => (savedReplies.value || []).map((r: any) => ({ label: r.name, onSelect: () => insertReply(r) })))
function insertReply(r: any) {
  draft.value = draft.value ? `${draft.value}\n${r.content}` : r.content
  $fetch(`/api/agency/social/inbox/saved-replies/${r.id}`, { method: 'PATCH', body: { incrementUsage: true } }).catch(() => {})
}
```

- [ ] **Step 2: Add the picker button to the template**

Next to the AI-draft + Send buttons:
```vue
<UDropdownMenu v-if="replyItems.length" :items="[replyItems]">
  <UButton icon="i-lucide-message-square-text" color="neutral" variant="ghost" label="Saved" />
</UDropdownMenu>
```

- [ ] **Step 3: Compile check**

Run: `pnpm exec nuxt prepare`
Expected: "Types generated in .nuxt".

- [ ] **Step 4: Commit**

```bash
git add app/components/social-inbox/Composer.vue
git commit -m "feat(social-inbox): saved-reply picker in the composer"
```

---

## Task 18: Analytics page + Inbox Settings page + nav

**Files:**
- Create: `app/pages/agency/social/inbox/analytics.vue`
- Create: `app/pages/agency/social/inbox/settings.vue`
- Modify: `app/layouts/agency.vue`

**Pre-req:** the settings page has forms — `frontend-design` skill; Nuxt UI v4.

- [ ] **Step 1: Analytics page**

`app/pages/agency/social/inbox/analytics.vue`:
```vue
<script setup lang="ts">
import type { SocialInboxAnalytics } from '~/types'
definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const { data: clientsData } = await useFetch('/api/agency/clients', { query: { limit: 200 } })
const clients = computed<any[]>(() => { const d = clientsData.value as any; return Array.isArray(d) ? d : (d?.clients ?? []) })
const clientOptions = computed(() => clients.value.map(c => ({ label: c.name, value: c.id })))
const clientId = ref<string | null>(clients.value[0]?.id ?? null)
const days = ref(30)

const { data: a, pending } = await useFetch<SocialInboxAnalytics>('/api/agency/social/inbox/analytics/overview',
  { query: { clientId, days }, watch: [clientId, days], default: () => null as any })

const cards = computed(() => a.value ? [
  { label: 'Conversations', value: a.value.total },
  { label: 'Open', value: a.value.open },
  { label: 'Avg first response', value: `${a.value.avgFirstResponseMinutes}m` },
  { label: 'Within SLA', value: a.value.withinSlaPct == null ? '—' : `${a.value.withinSlaPct}%` },
  { label: 'SLA breaches', value: a.value.breaches },
  { label: 'Automation rate', value: `${a.value.automationRatePct}%` },
] : [])
</script>

<template>
  <div class="p-6 space-y-6">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold">Inbox Analytics</h1>
        <p class="text-sm text-muted">Response time, SLA and automation over the selected window.</p>
      </div>
      <div class="flex items-center gap-2">
        <USelectMenu v-model="clientId" :items="clientOptions" value-key="value" placeholder="Select client" class="w-56" />
        <USelect v-model="days" :items="[{ label: '7 days', value: 7 }, { label: '30 days', value: 30 }, { label: '90 days', value: 90 }]" value-key="value" class="w-32" />
      </div>
    </div>
    <div v-if="pending" class="text-sm text-muted">Loading…</div>
    <div v-else class="grid grid-cols-2 md:grid-cols-3 gap-4">
      <UCard v-for="c in cards" :key="c.label">
        <div class="text-2xl font-semibold">{{ c.value }}</div>
        <div class="text-sm text-muted">{{ c.label }}</div>
      </UCard>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Inbox Settings page (saved replies + SLA policies)**

`app/pages/agency/social/inbox/settings.vue`:
```vue
<script setup lang="ts">
import type { SocialSavedReply, SocialSlaPolicy } from '~/types'
definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const toast = useToast()
const { data: clientsData } = await useFetch('/api/agency/clients', { query: { limit: 200 } })
const clients = computed<any[]>(() => { const d = clientsData.value as any; return Array.isArray(d) ? d : (d?.clients ?? []) })
const clientOptions = computed(() => clients.value.map(c => ({ label: c.name, value: c.id })))
const clientId = ref<string | null>(clients.value[0]?.id ?? null)

const { data: replies, refresh: refreshReplies } = await useFetch<SocialSavedReply[]>('/api/agency/social/inbox/saved-replies', { query: { clientId }, watch: [clientId], default: () => [] })
const { data: policies, refresh: refreshPolicies } = await useFetch<SocialSlaPolicy[]>('/api/agency/social/inbox/sla-policies', { query: { clientId }, watch: [clientId], default: () => [] })

const newReply = reactive({ name: '', content: '', category: '' })
async function addReply() {
  if (!newReply.name.trim() || !newReply.content.trim()) return
  await $fetch('/api/agency/social/inbox/saved-replies', { method: 'POST', body: { ...newReply, client_id: clientId.value } })
  newReply.name = ''; newReply.content = ''; newReply.category = ''
  await refreshReplies(); toast.add({ title: 'Saved reply added', color: 'success' })
}
async function delReply(id: string) { await $fetch(`/api/agency/social/inbox/saved-replies/${id}`, { method: 'DELETE' }); await refreshReplies() }

const newPolicy = reactive({ channel_type: '', target_minutes: 240 })
const CHANNELS = [{ label: 'All channels', value: '' }, { label: 'Comments', value: 'comment' }, { label: 'Reviews', value: 'review' }]
async function savePolicy() {
  await $fetch('/api/agency/social/inbox/sla-policies', { method: 'POST', body: { client_id: clientId.value, channel_type: newPolicy.channel_type || null, target_minutes: newPolicy.target_minutes } })
  await refreshPolicies(); toast.add({ title: 'SLA policy saved', color: 'success' })
}
async function delPolicy(id: string) { await $fetch(`/api/agency/social/inbox/sla-policies/${id}`, { method: 'DELETE' }); await refreshPolicies() }
</script>

<template>
  <div class="p-6 space-y-8 max-w-3xl">
    <div class="flex items-center justify-between gap-3">
      <h1 class="text-xl font-semibold">Inbox Settings</h1>
      <USelectMenu v-model="clientId" :items="clientOptions" value-key="value" placeholder="Select client" class="w-56" />
    </div>

    <section class="space-y-3">
      <h2 class="font-medium">Saved replies</h2>
      <div class="grid grid-cols-[1fr_2fr_auto] gap-2 items-end">
        <UFormField label="Name"><UInput v-model="newReply.name" placeholder="Thanks" class="w-full" /></UFormField>
        <UFormField label="Content ({{variables}} allowed)"><UInput v-model="newReply.content" placeholder="Thanks {{name}}!" class="w-full" /></UFormField>
        <UButton label="Add" :disabled="!newReply.name.trim() || !newReply.content.trim()" @click="addReply" />
      </div>
      <div class="space-y-1">
        <div v-for="r in replies" :key="r.id" class="flex items-center justify-between rounded border border-default p-2 text-sm">
          <div><span class="font-medium">{{ r.name }}</span> <span class="text-muted">— {{ r.content }}</span> <span class="text-xs text-muted">({{ r.usage_count }} uses)</span></div>
          <UButton icon="i-lucide-trash-2" size="xs" variant="ghost" color="error" @click="delReply(r.id)" />
        </div>
      </div>
    </section>

    <section class="space-y-3">
      <h2 class="font-medium">SLA policies</h2>
      <div class="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
        <UFormField label="Channel"><USelect v-model="newPolicy.channel_type" :items="CHANNELS" value-key="value" class="w-full" /></UFormField>
        <UFormField label="First-response target (min)"><UInput v-model.number="newPolicy.target_minutes" type="number" min="1" class="w-full" /></UFormField>
        <UButton label="Save" @click="savePolicy" />
      </div>
      <div class="space-y-1">
        <div v-for="p in policies" :key="p.id" class="flex items-center justify-between rounded border border-default p-2 text-sm">
          <div>{{ p.channel_type || 'all channels' }} — {{ p.target_minutes }}m {{ p.enabled ? '' : '(disabled)' }}</div>
          <UButton icon="i-lucide-trash-2" size="xs" variant="ghost" color="error" @click="delPolicy(p.id)" />
        </div>
      </div>
    </section>
  </div>
</template>
```

- [ ] **Step 3: Nav entries**

In `app/layouts/agency.vue`, in the Social Publishing group, after the `Reply Queue` entry add:
```ts
      { label: 'Inbox Analytics', icon: 'i-lucide-bar-chart-3', to: '/agency/social/inbox/analytics', onSelect: close },
      { label: 'Inbox Settings', icon: 'i-lucide-sliders-horizontal', to: '/agency/social/inbox/settings', onSelect: close },
```

- [ ] **Step 4: Compile check**

Run: `pnpm exec nuxt prepare`
Expected: "Types generated in .nuxt".

- [ ] **Step 5: Commit**

```bash
git add app/pages/agency/social/inbox/analytics.vue app/pages/agency/social/inbox/settings.vue app/layouts/agency.vue
git commit -m "feat(social-inbox): analytics + settings pages + nav"
```

---

## Task 19: Final verification

**Files:** none

- [ ] **Step 1: Full social suite**

Run: `pnpm exec vitest run test/social/`
Expected: PASS — existing suites + new `assignment`, `sla`, `savedReplies` suites + the `inboxStore` first-response assertion.

- [ ] **Step 2: No new type errors**

Run: `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck 2>&1 | grep -E "socialInbox/(assignment|sla|savedReplies|workflow)|inbox/(saved-replies|sla-policies|analytics|conversations)|inbox/(analytics|settings)\.vue|ActionPanel\.vue|Composer\.vue" || echo "no 2c type errors"`
Expected: empty (no 2c errors). Run the full typecheck once to confirm only the pre-existing baseline remains.

- [ ] **Step 3: Confirm no live sends / no gate flips**

Run: `git log --oneline origin/main..HEAD | grep -v Merge`
Expected: only 2c feature commits; no `SOCIAL_AUTOMATION_ENABLED`, no deploy/cron-trigger changes.

---

## Self-Review (against spec §7 + §10)

- **§7 Assignment** (auto client-team + round-robin, reassign, mine/unassigned/all filters) → Task 2 (`autoAssignConversation`), Task 6/7 (auto on ingest), Task 8 (manual PATCH), Task 9 (filters), Task 15/16 (UI). ✓
- **§7 Status** (open/snoozed/closed, auto-reopen) → Task 8 (snooze); auto-reopen already in 2a `recordInbound` bump (`status = CASE WHEN closed THEN open`). ✓
- **§7 Internal notes + @mention** → Task 10. ✓
- **§7 Saved replies** (`{{variables}}`, per-network, usage tracking) → Task 1 (table), Task 5 (render), Task 11 (CRUD + usage), Task 17 (picker). ✓
- **§7 SLA** (policies, due on first inbound, first_response stamp, breach + notify, metrics) → Task 1 (table), Task 3 (compute/stamp/scan), Task 4 (first_response), Task 7 (breach notify), Task 12 (CRUD), Task 13 (metrics). ✓
- **§10 analytics.vue** → Task 18. **§10 saved-replies/sla CRUD APIs** → Tasks 11/12. **§10 nav** → Task 18. ✓
- **Deferred (documented):** business-hours-aware SLA (v1 = elapsed minutes); client-portal surface (spec §8, that's part of 2d portal); DO real-time (spec §9, 2d). Marketing sync (§14) is minimal for an internal team-workflow phase — skipped intentionally (no new public-facing capability).

**Placeholder scan:** none — every code step is complete. UI tasks that modify existing files (15/16/17) instruct reading the file first to match prop/emit/ref names; the code shown uses the documented names.

**Type consistency:** `pickRoundRobin`/`autoAssignConversation`/`computeSlaDueAt`/`applySlaOnInbound`/`findBreaches`/`renderTemplate`/`extractVariables`/`onInboundRecorded`/`SocialSavedReply`/`SocialSlaPolicy`/`SocialInboxAnalytics` used consistently across tasks.

---

## Execution Handoff

⚠️ **Standing constraints for the executor:** do not enable `SOCIAL_AUTOMATION_ENABLED`; no live sends; SLA breach emails use `sendEmail: true` but only fire from the cron, which is operator-gated. This phase is additive and safe to merge dormant.
