# Social Planner Campaign Board + AI Generation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/agency/social/publishing/planner` into an enterprise campaign-board (status lanes + campaign swimlanes) with AI brief→drafts generation, and relocate the recurring posting-slots manager to the Queue page.

**Architecture:** One dataset (`social_posts`) viewed three ways (board/calendar/queue). New first-class `social_campaigns` group posts; board lanes are *derived* from the existing post status enum (no enum change). AI generation is a pure endpoint that returns editable draft suggestions; accepting them reuses the existing post-create endpoint to write `draft` rows only. Two granular flags gate the surface; everything ships dormant.

**Tech Stack:** Nuxt 4 (Vue 3 `<script setup>`), Nuxt UI v4, Nitro server routes, Neon Postgres via `server/utils/db.ts`, Groq via `server/utils/groqClient.ts` (`generateGroqInsight`), Vitest + happy-dom.

## Global Constraints

- **Server imports** use `~~/server/utils/*` (double-tilde Nitro alias), never `~/`.
- **Auth:** reads → `requireAuth(event)`; mutations → `requireRole(event, PERMISSIONS.CREATIVE)`.
- **DB helpers:** `queryRows` / `queryOne` from `~~/server/utils/db`; `createError({ statusCode, statusMessage })` for errors.
- **Flags** are `process.env.X === 'true'` (exact string), default off. New: `SOCIAL_PLANNER_ENABLED`, `SOCIAL_PLANNER_AI_ENABLED`.
- **AI safety (HARD):** generation writes **only** `status='draft'` rows. Nothing schedules/publishes without an explicit existing human flow.
- **UI:** Nuxt UI v4 components only. Date inputs = `UPopover`+`UCalendar` (never `<UInput type="date">`). Every field wrapped in `UFormField`. Dark-mode-safe semantic colors. **Invoke the `frontend-design` skill before building any form-bearing component** (CampaignManager, AiPlanModal, SlotManager) per project rule.
- **Migrations:** additive (`IF NOT EXISTS`); auto-run on creation via `psql "$DATABASE_URL" -f <file>`.
- **Tests:** this codebase unit-tests **pure logic + composables** (`test/**`), not Vue components or Nitro HTTP handlers. So: pure utils & composables get full TDD; component/page/endpoint tasks verify via `pnpm exec nuxt typecheck` (large heap) + lint + a manual checklist. Do **not** invent a component-test harness.
- **Typecheck heap:** `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck` (silent OOM at default heap = false pass).
- **Branch:** `feat/social-planner-campaign-board` (already created). Commit per task.

---

### Task 1: Migration 200 — campaigns table + post columns

**Files:**
- Create: `server/database/migrations/200_social_campaigns.sql`

**Interfaces:**
- Produces: table `social_campaigns`; columns `social_posts.campaign_id` (UUID FK, SET NULL), `social_posts.assigned_to` (TEXT), `social_posts.due_at` (TIMESTAMPTZ).

- [ ] **Step 1: Write the migration**

```sql
-- 200_social_campaigns.sql — Planner Slice 3: first-class campaigns + post ownership. Additive.
CREATE TABLE IF NOT EXISTS social_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','planning','archived')),
  start_date DATE,
  end_date DATE,
  brief TEXT,
  goal_post_count INT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_social_campaigns_client ON social_campaigns(client_id, status);

ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS campaign_id UUID
  REFERENCES social_campaigns(id) ON DELETE SET NULL;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS assigned_to TEXT;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_social_posts_campaign
  ON social_posts(campaign_id) WHERE campaign_id IS NOT NULL;
```

- [ ] **Step 2: Run the migration**

Run:
```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/200_social_campaigns.sql
```
Expected: `CREATE TABLE` / `CREATE INDEX` / `ALTER TABLE` notices, no errors (re-runnable).

- [ ] **Step 3: Verify schema**

Run: `psql "$DATABASE_URL" -c "\d social_campaigns" -c "\d social_posts" | grep -E "campaign_id|assigned_to|due_at|social_campaigns"`
Expected: the new table and the three new `social_posts` columns are listed.

- [ ] **Step 4: Commit**

```bash
git add server/database/migrations/200_social_campaigns.sql
git commit -m "feat(social): migration 200 — social_campaigns + post ownership columns"
```

---

### Task 2: Types — campaigns, board, generation

**Files:**
- Modify: `app/types/index.ts` (append near the existing `SocialSlot` block, ~line 1283)

**Interfaces:**
- Produces: `SocialCampaignStatus`, `SocialCampaign`, `SocialCampaignWithCounts`, `SocialPlannerLane`, `SocialBoardPost`, `SocialGeneratedDraft`; adds `campaign_id`/`assigned_to`/`due_at` to `SocialPost`.

- [ ] **Step 1: Extend `SocialPost`**

In the existing `SocialPost` interface, after `queue_position: number | null` add:
```ts
  campaign_id: string | null
  assigned_to: string | null
  due_at: string | null
```

- [ ] **Step 2: Append the new types** (after the `SocialSlot` interface)

```ts
// --- Social Planner (Slice 3) ---
export type SocialCampaignStatus = 'active' | 'planning' | 'archived'

export interface SocialCampaign {
  id: string
  client_id: string
  name: string
  color: string
  status: SocialCampaignStatus
  start_date: string | null
  end_date: string | null
  brief: string | null
  goal_post_count: number | null
  metadata: Record<string, any>
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface SocialCampaignWithCounts extends SocialCampaign {
  post_count: number
  scheduled_count: number
  published_count: number
}

export type SocialPlannerLane = 'draft' | 'needs_approval' | 'scheduled' | 'published'

export interface SocialBoardPost extends SocialPost {
  lane: SocialPlannerLane
  needs_attention: boolean
  campaign: Pick<SocialCampaign, 'id' | 'name' | 'color'> | null
}

export interface SocialGeneratedDraft {
  content: string
  platforms: SocialPublishPlatform[]
  platform_overrides: Record<string, { content: string }>
  hashtags: string[]
  suggested_scheduled_at: string | null
}
```

- [ ] **Step 3: Typecheck**

Run: `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck 2>&1 | grep -iE "social(Campaign|BoardPost|PlannerLane|GeneratedDraft)" || echo "no new type errors"`
Expected: `no new type errors` (pre-existing unrelated errors are fine).

- [ ] **Step 4: Commit**

```bash
git add app/types/index.ts
git commit -m "feat(social): planner types — campaigns, board post, generated draft"
```

---

### Task 3: Lane-derivation pure util (TDD)

**Files:**
- Create: `app/utils/socialPlannerLanes.ts`
- Test: `test/social/socialPlannerLanes.test.ts`

**Interfaces:**
- Consumes: `SocialPlannerLane` (Task 2).
- Produces: `deriveLane(post: LaneInput): SocialPlannerLane`, `needsAttention(post: { status: string }): boolean`, `LANES: { key: SocialPlannerLane; label: string }[]`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { deriveLane, needsAttention, LANES } from '../../app/utils/socialPlannerLanes'

const post = (over: Record<string, any> = {}) => ({
  status: 'draft', approval_requested_at: null, approved_at: null, ...over,
})

describe('deriveLane', () => {
  it('plain draft → draft', () => { expect(deriveLane(post())).toBe('draft') })
  it('approval requested, not yet approved → needs_approval', () => {
    expect(deriveLane(post({ approval_requested_at: '2026-06-24T00:00:00Z' }))).toBe('needs_approval')
  })
  it('approved post stays in scheduled lane', () => {
    expect(deriveLane(post({ status: 'approved', approval_requested_at: 'x', approved_at: 'y' }))).toBe('scheduled')
  })
  it('scheduled/publishing → scheduled', () => {
    expect(deriveLane(post({ status: 'scheduled' }))).toBe('scheduled')
    expect(deriveLane(post({ status: 'publishing' }))).toBe('scheduled')
  })
  it('published/partially_published → published', () => {
    expect(deriveLane(post({ status: 'published' }))).toBe('published')
    expect(deriveLane(post({ status: 'partially_published' }))).toBe('published')
  })
  it('failed/cancelled fall into scheduled lane (surfaced via attention)', () => {
    expect(deriveLane(post({ status: 'failed' }))).toBe('scheduled')
    expect(deriveLane(post({ status: 'cancelled' }))).toBe('scheduled')
  })
})

describe('needsAttention', () => {
  it('true for failed/cancelled, false otherwise', () => {
    expect(needsAttention({ status: 'failed' })).toBe(true)
    expect(needsAttention({ status: 'cancelled' })).toBe(true)
    expect(needsAttention({ status: 'scheduled' })).toBe(false)
  })
})

describe('LANES', () => {
  it('lists the four lanes in pipeline order', () => {
    expect(LANES.map(l => l.key)).toEqual(['draft', 'needs_approval', 'scheduled', 'published'])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run test/social/socialPlannerLanes.test.ts`
Expected: FAIL — cannot find module `socialPlannerLanes`.

- [ ] **Step 3: Implement**

```ts
import type { SocialPlannerLane } from '~/types'

/** Minimal shape the board needs to place a post in a lane. */
export interface LaneInput {
  status: string
  approval_requested_at?: string | null
  approved_at?: string | null
}

/** Derive the board lane from a post's status + approval fields. No enum change required. */
export function deriveLane(post: LaneInput): SocialPlannerLane {
  switch (post.status) {
    case 'published':
    case 'partially_published':
      return 'published'
    case 'approved':
    case 'scheduled':
    case 'publishing':
    case 'failed':     // failed/cancelled were past 'scheduled'; show there with an attention badge
    case 'cancelled':
      return 'scheduled'
    case 'draft':
    default:
      return post.approval_requested_at && !post.approved_at ? 'needs_approval' : 'draft'
  }
}

/** Posts that errored or were cancelled get a visible badge wherever they land. */
export function needsAttention(post: { status: string }): boolean {
  return post.status === 'failed' || post.status === 'cancelled'
}

export const LANES: { key: SocialPlannerLane; label: string }[] = [
  { key: 'draft', label: 'Draft' },
  { key: 'needs_approval', label: 'Needs approval' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'published', label: 'Published' },
]
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run test/social/socialPlannerLanes.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add app/utils/socialPlannerLanes.ts test/social/socialPlannerLanes.test.ts
git commit -m "feat(social): lane-derivation util for planner board"
```

---

### Task 4: AI plan pure utils — parse + schedule spread (TDD)

**Files:**
- Create: `app/utils/socialPlanGeneration.ts`
- Test: `test/social/socialPlanGeneration.test.ts`

**Interfaces:**
- Produces: `parsePlanDrafts(raw: string): RawDraft[]` where `RawDraft = { content: string; variants: Record<string, string>; hashtags: string[] }`; `spreadSchedule(count: number, fromISO: string, toISO: string): string[]`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { parsePlanDrafts, spreadSchedule } from '../../app/utils/socialPlanGeneration'

describe('parsePlanDrafts', () => {
  it('parses a clean JSON array of drafts', () => {
    const raw = JSON.stringify({ posts: [
      { content: 'Hello', variants: { instagram: 'Hello 📸' }, hashtags: ['launch'] },
    ] })
    expect(parsePlanDrafts(raw)).toEqual([
      { content: 'Hello', variants: { instagram: 'Hello 📸' }, hashtags: ['launch'] },
    ])
  })
  it('strips ```json fences before parsing', () => {
    const raw = '```json\n{"posts":[{"content":"Hi"}]}\n```'
    expect(parsePlanDrafts(raw)).toEqual([{ content: 'Hi', variants: {}, hashtags: [] }])
  })
  it('returns [] for non-JSON garbage', () => {
    expect(parsePlanDrafts('the model rambled')).toEqual([])
  })
  it('drops entries without string content', () => {
    const raw = JSON.stringify({ posts: [{ content: 'ok' }, { variants: {} }, { content: 123 }] })
    expect(parsePlanDrafts(raw)).toEqual([{ content: 'ok', variants: {}, hashtags: [] }])
  })
})

describe('spreadSchedule', () => {
  it('returns evenly spaced ISO timestamps within the window', () => {
    const out = spreadSchedule(3, '2026-07-01T00:00:00.000Z', '2026-07-04T00:00:00.000Z')
    expect(out).toEqual([
      '2026-07-01T18:00:00.000Z', '2026-07-02T12:00:00.000Z', '2026-07-03T06:00:00.000Z',
    ])
  })
  it('returns [] for count <= 0', () => { expect(spreadSchedule(0, '2026-07-01T00:00:00.000Z', '2026-07-02T00:00:00.000Z')).toEqual([]) })
  it('clamps to the start when from === to', () => {
    expect(spreadSchedule(2, '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z'))
      .toEqual(['2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z'])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run test/social/socialPlanGeneration.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
export interface RawDraft {
  content: string
  variants: Record<string, string>
  hashtags: string[]
}

/** Parse the model's JSON response into clean draft rows. Tolerant of ```json fences; [] on garbage. */
export function parsePlanDrafts(raw: string): RawDraft[] {
  const cleaned = String(raw ?? '').replace(/```json/gi, '').replace(/```/g, '').trim()
  let parsed: any
  try { parsed = JSON.parse(cleaned) } catch { return [] }
  const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.posts) ? parsed.posts : []
  const out: RawDraft[] = []
  for (const p of list) {
    if (!p || typeof p.content !== 'string' || !p.content.trim()) continue
    out.push({
      content: p.content.trim(),
      variants: (p.variants && typeof p.variants === 'object') ? p.variants : {},
      hashtags: Array.isArray(p.hashtags) ? p.hashtags.filter((h: any) => typeof h === 'string') : [],
    })
  }
  return out
}

/** Evenly distribute `count` ISO timestamps across (fromISO, toISO]. Deterministic; no Date.now(). */
export function spreadSchedule(count: number, fromISO: string, toISO: string): string[] {
  if (count <= 0) return []
  const from = new Date(fromISO).getTime()
  const to = new Date(toISO).getTime()
  const span = to - from
  return Array.from({ length: count }, (_, i) =>
    new Date(from + Math.round((span * (i + 1)) / (count + 1))).toISOString(),
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run test/social/socialPlanGeneration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/utils/socialPlanGeneration.ts test/social/socialPlanGeneration.test.ts
git commit -m "feat(social): AI plan parse + schedule-spread utils"
```

---

### Task 5: Planner gate helper

**Files:**
- Create: `server/utils/socialPublishing/plannerGate.ts`

**Interfaces:**
- Produces: `isPlannerEnabled(): boolean`, `isPlannerAiEnabled(): boolean`.

- [ ] **Step 1: Implement** (mirrors `server/utils/socialInbox/automationGate.ts`)

```ts
// server/utils/socialPublishing/plannerGate.ts
// Flags for the Planner campaign board + AI generation. Both default OFF (exact string "true").
// Mirrors SOCIAL_AUTOMATION_ENABLED precedent — the surface is dormant until an operator flips it.
export function isPlannerEnabled(): boolean {
  return process.env.SOCIAL_PLANNER_ENABLED === 'true'
}
export function isPlannerAiEnabled(): boolean {
  return process.env.SOCIAL_PLANNER_AI_ENABLED === 'true'
}
```

- [ ] **Step 2: Commit**

```bash
git add server/utils/socialPublishing/plannerGate.ts
git commit -m "feat(social): planner feature-flag gate"
```

---

### Task 6: Campaigns API (CRUD)

**Files:**
- Create: `server/api/agency/social/publishing/campaigns/index.get.ts`
- Create: `server/api/agency/social/publishing/campaigns/index.post.ts`
- Create: `server/api/agency/social/publishing/campaigns/[id]/index.patch.ts`
- Create: `server/api/agency/social/publishing/campaigns/[id]/index.delete.ts`

**Interfaces:**
- Consumes: `isPlannerEnabled` (Task 5).
- Produces: REST under `/api/agency/social/publishing/campaigns`. GET returns `SocialCampaignWithCounts[]`.

- [ ] **Step 1: GET (list + derived counts)**

`campaigns/index.get.ts`:
```ts
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { isPlannerEnabled } from '~~/server/utils/socialPublishing/plannerGate'

/** GET /api/agency/social/publishing/campaigns?clientId= → SocialCampaignWithCounts[] */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  if (!isPlannerEnabled()) return []
  const clientId = getQuery(event).clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  return await queryRows(
    `SELECT c.*,
            COUNT(p.id)::int AS post_count,
            COUNT(p.id) FILTER (WHERE p.status IN ('approved','scheduled'))::int AS scheduled_count,
            COUNT(p.id) FILTER (WHERE p.status IN ('published','partially_published'))::int AS published_count
       FROM social_campaigns c
       LEFT JOIN social_posts p ON p.campaign_id = c.id
      WHERE c.client_id = $1
      GROUP BY c.id
      ORDER BY c.status, c.created_at DESC`,
    [clientId],
  )
})
```

- [ ] **Step 2: POST (create)**

`campaigns/index.post.ts`:
```ts
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'
import { isPlannerEnabled } from '~~/server/utils/socialPublishing/plannerGate'

/** POST /api/agency/social/publishing/campaigns */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CREATIVE)
  if (!isPlannerEnabled()) throw createError({ statusCode: 404, statusMessage: 'Planner not enabled' })
  const b = await readBody(event)
  if (!b.clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  if (!b.name?.trim()) throw createError({ statusCode: 400, statusMessage: 'name required' })
  return await queryOne(
    `INSERT INTO social_campaigns
       (client_id, name, color, status, start_date, end_date, brief, goal_post_count, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      b.clientId, b.name.trim(), b.color ?? '#6366f1', b.status ?? 'active',
      b.startDate ?? null, b.endDate ?? null, b.brief ?? null, b.goalPostCount ?? null, user.id,
    ],
  )
})
```

- [ ] **Step 3: PATCH (update)** — `campaigns/[id]/index.patch.ts`, dynamic SET pattern mirroring `posts/[id]/index.patch.ts`:
```ts
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'
import { isPlannerEnabled } from '~~/server/utils/socialPublishing/plannerGate'

const FIELDS: Record<string, string> = {
  name: 'name', color: 'color', status: 'status', startDate: 'start_date',
  endDate: 'end_date', brief: 'brief', goalPostCount: 'goal_post_count',
}

/** PATCH /api/agency/social/publishing/campaigns/:id */
export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.CREATIVE)
  if (!isPlannerEnabled()) throw createError({ statusCode: 404, statusMessage: 'Planner not enabled' })
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const b = await readBody(event)
  const sets: string[] = []; const params: any[] = []
  for (const [key, col] of Object.entries(FIELDS)) {
    if (!(key in b)) continue
    params.push(b[key]); sets.push(`${col} = $${params.length}`)
  }
  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'No updatable fields provided' })
  sets.push('updated_at = NOW()'); params.push(id)
  const row = await queryOne(
    `UPDATE social_campaigns SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  return row
})
```

- [ ] **Step 4: DELETE** — `campaigns/[id]/index.delete.ts` (posts detach via FK `SET NULL`):
```ts
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { execute } from '~~/server/utils/db'
import { isPlannerEnabled } from '~~/server/utils/socialPublishing/plannerGate'

/** DELETE /api/agency/social/publishing/campaigns/:id */
export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.CREATIVE)
  if (!isPlannerEnabled()) throw createError({ statusCode: 404, statusMessage: 'Planner not enabled' })
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  await execute('DELETE FROM social_campaigns WHERE id = $1', [id])
  return { ok: true }
})
```

- [ ] **Step 5: Typecheck + commit**

Run: `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck 2>&1 | grep -i "campaigns/" || echo ok`
Expected: `ok`.
```bash
git add server/api/agency/social/publishing/campaigns
git commit -m "feat(social): campaigns CRUD API (flag-gated)"
```

---

### Task 7: Board API

**Files:**
- Create: `server/api/agency/social/publishing/board.get.ts`

**Interfaces:**
- Consumes: `deriveLane`, `needsAttention` (Task 3), `isPlannerEnabled` (Task 5).
- Produces: `GET /board?clientId=&campaignId=` → `SocialBoardPost[]`.

- [ ] **Step 1: Implement**

```ts
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { isPlannerEnabled } from '~~/server/utils/socialPublishing/plannerGate'
import { deriveLane, needsAttention } from '~/utils/socialPlannerLanes'
import type { SocialBoardPost } from '~/types'

/** GET /api/agency/social/publishing/board?clientId=&campaignId= → SocialBoardPost[] */
export default defineEventHandler(async (event): Promise<SocialBoardPost[]> => {
  await requireAuth(event)
  if (!isPlannerEnabled()) return []
  const q = getQuery(event)
  const clientId = q.clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })

  const params: any[] = [clientId]
  let where = 'p.client_id = $1'
  if (q.campaignId) { params.push(q.campaignId); where += ` AND p.campaign_id = $${params.length}` }

  const rows = await queryRows<any>(
    `SELECT p.*, c.id AS c_id, c.name AS c_name, c.color AS c_color
       FROM social_posts p
       LEFT JOIN social_campaigns c ON c.id = p.campaign_id
      WHERE ${where}
      ORDER BY COALESCE(p.scheduled_at, p.created_at) ASC`,
    params,
  )
  return rows.map((r): SocialBoardPost => ({
    ...r,
    lane: deriveLane(r),
    needs_attention: needsAttention(r),
    campaign: r.c_id ? { id: r.c_id, name: r.c_name, color: r.c_color } : null,
  }))
})
```
> Note: importing `~/utils/socialPlannerLanes` from a server route is fine — it's a pure framework-free module (no Nuxt/`~/utils` runtime deps). Verify resolution in Step 2; if Nitro can't resolve `~/`, copy the two tiny functions into `server/utils/socialPublishing/lanes.ts` and import from there.

- [ ] **Step 2: Typecheck + smoke**

Run: `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck 2>&1 | grep -i "board.get" || echo ok`
Expected: `ok`. If an import-resolution error appears for `~/utils/socialPlannerLanes`, apply the fallback in the note.

- [ ] **Step 3: Commit**

```bash
git add server/api/agency/social/publishing/board.get.ts server/utils/socialPublishing/lanes.ts 2>/dev/null
git commit -m "feat(social): board API — posts with derived lane + campaign summary"
```

---

### Task 8: Extend post create + patch for campaign + ownership

**Files:**
- Modify: `server/api/agency/social/publishing/posts/index.post.ts`
- Modify: `server/api/agency/social/publishing/posts/[id]/index.patch.ts`

**Interfaces:**
- Produces: `posts.post` accepts `campaignId`; `posts.patch` accepts `campaignId`, `assignedTo`, `dueAt`.

- [ ] **Step 1: Add `campaign_id` to the create INSERT**

In `posts/index.post.ts`, add `campaign_id` to the column list and `$16` to VALUES, with `b.campaignId ?? null` appended to the params array (after `metadata`). Update the `VALUES (...)` to include `$16`.

```ts
  const row = await queryOne(
    `INSERT INTO social_posts (
       client_id, created_by, content, media_urls, link_url, hashtags, first_comment,
       platforms, account_ids, platform_overrides, tags, scheduled_at, timezone, status, metadata,
       campaign_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING *`,
    [
      b.clientId, user.id, b.content ?? '', b.mediaUrls ?? null, b.linkUrl ?? null,
      b.hashtags ?? null, b.firstComment ?? null, b.platforms ?? [], b.accountIds ?? null,
      JSON.stringify(b.platformOverrides ?? {}), b.tags ?? null, b.scheduledAt ?? null,
      b.timezone ?? 'Australia/Sydney', b.status ?? 'draft', JSON.stringify(b.metadata ?? {}),
      b.campaignId ?? null,
    ],
  )
```

- [ ] **Step 2: Add three keys to the patch `FIELDS` map**

In `posts/[id]/index.patch.ts`, add to the `FIELDS` object:
```ts
  campaignId: { col: 'campaign_id' },
  assignedTo: { col: 'assigned_to' },
  dueAt: { col: 'due_at' },
```

- [ ] **Step 3: Typecheck + commit**

Run: `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck 2>&1 | grep -iE "posts/index|posts/\[id\]" || echo ok`
Expected: `ok`.
```bash
git add server/api/agency/social/publishing/posts/index.post.ts "server/api/agency/social/publishing/posts/[id]/index.patch.ts"
git commit -m "feat(social): post create/patch accept campaign + ownership fields"
```

---

### Task 9: Extend nav-counts with campaigns

**Files:**
- Modify: `server/api/agency/social/publishing/nav-counts.get.ts`

**Interfaces:**
- Produces: nav-counts response gains a `campaigns: number` field.

- [ ] **Step 1: Read the file**, then add a campaigns count guarded by the flag.

Add `import { isPlannerEnabled } from '~~/server/utils/socialPublishing/plannerGate'`. After the existing counts are computed, add:
```ts
  const campaigns = isPlannerEnabled()
    ? Number((await queryOne<{ n: string }>(
        'SELECT COUNT(*)::int AS n FROM social_campaigns WHERE client_id = $1', [clientId]))?.n ?? 0)
    : 0
```
and include `campaigns` in the returned object. (Match the file's existing variable names / return shape — read it first.)

- [ ] **Step 2: Typecheck + commit**

Run: `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck 2>&1 | grep -i "nav-counts" || echo ok`
Expected: `ok`.
```bash
git add server/api/agency/social/publishing/nav-counts.get.ts
git commit -m "feat(social): nav-counts includes campaigns badge"
```

---

### Task 10: AI generate-plan endpoint

**Files:**
- Create: `server/api/agency/social/publishing/ai/generate-plan.post.ts`

**Interfaces:**
- Consumes: `isPlannerAiEnabled` (Task 5), `parsePlanDrafts` + `spreadSchedule` (Task 4), `generateGroqInsight` (`~~/server/utils/groqClient`).
- Produces: `POST /ai/generate-plan` → `{ posts: SocialGeneratedDraft[] }`. Persists nothing.

- [ ] **Step 1: Implement** (mirrors `ai/generate-caption.post.ts`; JSON output like the `analyzeExpenseAnomalies` pattern in `groqClient.ts`)

```ts
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { generateGroqInsight } from '~~/server/utils/groqClient'
import { isPlannerAiEnabled } from '~~/server/utils/socialPublishing/plannerGate'
import { parsePlanDrafts, spreadSchedule } from '~/utils/socialPlanGeneration'
import type { SocialGeneratedDraft, SocialPublishPlatform } from '~/types'

/**
 * POST /api/agency/social/publishing/ai/generate-plan
 * Body: { clientId, campaignId?, brief, count, dateFrom, dateTo, tone?, platforms[] }
 * → { posts: SocialGeneratedDraft[] }. PURE generation — writes nothing.
 */
export default defineEventHandler(async (event): Promise<{ posts: SocialGeneratedDraft[] }> => {
  await requireRole(event, PERMISSIONS.CREATIVE)
  if (!isPlannerAiEnabled()) throw createError({ statusCode: 404, statusMessage: 'Planner AI not enabled' })
  const b = await readBody(event)
  const brief = String(b?.brief ?? '').trim()
  if (!brief) throw createError({ statusCode: 400, statusMessage: 'brief required' })
  const count = Math.min(Math.max(Number(b?.count ?? 5), 1), 14)
  const tone = String(b?.tone ?? 'friendly')
  const platforms = (Array.isArray(b?.platforms) && b.platforms.length ? b.platforms : ['facebook']) as SocialPublishPlatform[]

  const prompt = [
    `Create a ${count}-post social media content plan for a digital marketing agency client.`,
    `Brief / theme: ${brief}`,
    `Tone: ${tone}. Target platforms: ${platforms.join(', ')}.`,
    'For EACH post provide a default "content" plus per-platform "variants" tailored to each platform (Instagram = visual/emoji/hashtags, LinkedIn = professional, etc.), and 2-5 "hashtags".',
    'Return ONLY valid JSON of the exact shape:',
    '{"posts":[{"content":"...","variants":{"instagram":"...","linkedin":"..."},"hashtags":["..."]}]}',
  ].join('\n')

  let raw = ''
  try {
    raw = await generateGroqInsight(prompt, {
      temperature: 0.8, maxTokens: 2000,
      systemPrompt: 'You are an expert social media strategist. Output ONLY valid JSON matching the requested shape — no prose, no code fences.',
    })
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'AI generation failed — please retry' })
  }

  const drafts = parsePlanDrafts(raw)
  const times = spreadSchedule(drafts.length, String(b?.dateFrom ?? new Date().toISOString()), String(b?.dateTo ?? b?.dateFrom ?? new Date().toISOString()))
  const posts: SocialGeneratedDraft[] = drafts.map((d, i) => {
    const overrides: Record<string, { content: string }> = {}
    for (const pl of platforms) if (d.variants[pl]) overrides[pl] = { content: d.variants[pl] }
    return {
      content: d.content, platforms, platform_overrides: overrides,
      hashtags: d.hashtags, suggested_scheduled_at: times[i] ?? null,
    }
  })
  return { posts }
})
```
> `new Date().toISOString()` is allowed in **server** routes (the Date ban is a Workflow-script restriction, not a Nitro one). The pure util `spreadSchedule` takes ISO strings so it stays deterministic and testable.

- [ ] **Step 2: Typecheck + commit**

Run: `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck 2>&1 | grep -i "generate-plan" || echo ok`
Expected: `ok`.
```bash
git add server/api/agency/social/publishing/ai/generate-plan.post.ts
git commit -m "feat(social): AI generate-plan endpoint (flag-gated, draft-only)"
```

---

### Task 11: `useSocialPlanner` composable (+ test)

**Files:**
- Create: `app/composables/useSocialPlanner.ts`
- Test: `test/composables/useSocialPlanner.test.ts`

**Interfaces:**
- Consumes: `SocialCampaign`, `SocialCampaignWithCounts`, `SocialBoardPost`, `SocialGeneratedDraft`, `SocialPost` (Task 2).
- Produces: `useSocialPlanner()` → `{ listCampaigns, createCampaign, updateCampaign, deleteCampaign, getBoard, updatePost, generatePlan, acceptDraft }`.

- [ ] **Step 1: Implement** (thin `$fetch` client, mirrors `useSocialPublishing.ts`)

```ts
import type {
  SocialCampaign, SocialCampaignWithCounts, SocialBoardPost, SocialGeneratedDraft, SocialPost,
} from '~/types'

export function useSocialPlanner() {
  const base = '/api/agency/social/publishing'

  const listCampaigns = (clientId: string) =>
    $fetch<SocialCampaignWithCounts[]>(`${base}/campaigns`, { query: { clientId } })
  const createCampaign = (body: Record<string, any>) =>
    $fetch<SocialCampaign>(`${base}/campaigns`, { method: 'POST', body })
  const updateCampaign = (id: string, body: Record<string, any>) =>
    $fetch<SocialCampaign>(`${base}/campaigns/${id}`, { method: 'PATCH', body })
  const deleteCampaign = (id: string) =>
    $fetch<{ ok: true }>(`${base}/campaigns/${id}`, { method: 'DELETE' })

  const getBoard = (clientId: string, campaignId?: string) =>
    $fetch<SocialBoardPost[]>(`${base}/board`, { query: { clientId, ...(campaignId ? { campaignId } : {}) } })
  const updatePost = (id: string, body: Record<string, any>) =>
    $fetch<SocialPost>(`${base}/posts/${id}`, { method: 'PATCH', body })

  const generatePlan = (body: Record<string, any>) =>
    $fetch<{ posts: SocialGeneratedDraft[] }>(`${base}/ai/generate-plan`, { method: 'POST', body })
  const acceptDraft = (body: Record<string, any>) =>
    $fetch<SocialPost>(`${base}/posts`, { method: 'POST', body })

  return { listCampaigns, createCampaign, updateCampaign, deleteCampaign, getBoard, updatePost, generatePlan, acceptDraft }
}
```

- [ ] **Step 2: Write the test** (mirrors `test/composables/useSocialPublishingClient.test.ts` style — mock `$fetch`)

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useSocialPlanner } from '../../app/composables/useSocialPlanner'

const fetchMock = vi.fn()
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('$fetch', fetchMock) })

describe('useSocialPlanner', () => {
  it('getBoard passes clientId + campaignId as query', async () => {
    fetchMock.mockResolvedValue([])
    await useSocialPlanner().getBoard('client-1', 'camp-9')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/agency/social/publishing/board',
      { query: { clientId: 'client-1', campaignId: 'camp-9' } })
  })
  it('getBoard omits campaignId when not given', async () => {
    fetchMock.mockResolvedValue([])
    await useSocialPlanner().getBoard('client-1')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/agency/social/publishing/board', { query: { clientId: 'client-1' } })
  })
  it('acceptDraft POSTs to /posts', async () => {
    fetchMock.mockResolvedValue({ id: 'p1' })
    await useSocialPlanner().acceptDraft({ clientId: 'c1', content: 'hi', status: 'draft' })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/agency/social/publishing/posts',
      { method: 'POST', body: { clientId: 'c1', content: 'hi', status: 'draft' } })
  })
})
```

- [ ] **Step 3: Run the test**

Run: `pnpm exec vitest run test/composables/useSocialPlanner.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/composables/useSocialPlanner.ts test/composables/useSocialPlanner.test.ts
git commit -m "feat(social): useSocialPlanner API composable"
```

---

### Task 12: Extract `SocialSlotManager` + wire onto Queue

**Files:**
- Create: `app/components/social-publishing/SocialSlotManager.vue`
- Modify: `app/pages/agency/social/publishing/queue.vue`

**Interfaces:**
- Produces: `<SocialSlotManager :client-id="..." />` (auto-imported as `SocialPublishingSocialSlotManager` → use `<SocialSlotManager>` if the folder prefix resolves; confirm the auto-import name and use it). Self-contained: loads/creates/toggles/deletes slots via `useSocialPublishing()`.

**Note:** Invoke the `frontend-design` skill before building this form component (project rule).

- [ ] **Step 1: Build the component** — lift the slots logic + markup verbatim from the **current** `planner.vue` (the `DOW`/`TIMES`/`PLATFORMS` consts, `form`, `load`, `addSlot`, `toggleSlot`, `confirmDelete`, the add-slot card, the slot list, and the delete `UModal`). Accept `clientId` as a prop instead of reading the composable, and wrap the body in a collapsible `UCard`/`UCollapsible` titled "Posting slots". Keep all UFormField/USelectMenu usage and the delete-confirmation modal exactly as they are today.

- [ ] **Step 2: Add it to Queue** — in `queue.vue`, inside `SocialPublishingShell` above the queue list, render `<SocialSlotManager :client-id="clientId" />` (the page already has `const { clientId } = useSocialPublishingClient()`). Wrap it so it only renders when `clientId` is set.

- [ ] **Step 3: Verify** — `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck 2>&1 | grep -iE "SlotManager|queue.vue" || echo ok` → `ok`. Manual: `pnpm dev`, open `/agency/social/publishing/queue`, confirm slots CRUD works there (add, toggle, delete) and the queue list still works.

- [ ] **Step 4: Commit**

```bash
git add app/components/social-publishing/SocialSlotManager.vue app/pages/agency/social/publishing/queue.vue
git commit -m "feat(social): extract SocialSlotManager, relocate slots to Queue"
```

---

### Task 13: `SocialCampaignManager` component

**Files:**
- Create: `app/components/social-publishing/SocialCampaignManager.vue`

**Interfaces:**
- Consumes: `useSocialPlanner()`, `SocialCampaignWithCounts`.
- Produces: `<SocialCampaignManager :client-id v-model:open @changed />` — a `USlideover` listing campaigns with create/edit/delete. Emits `changed` after any mutation so the board reloads.

**Note:** Invoke the `frontend-design` skill before building (form component).

- [ ] **Step 1: Build** — `USlideover` (`v-model:open`). Body:
  - List of campaigns: each row shows a color swatch, name, status `UBadge`, and `post_count` (e.g. "12 posts · goal 20"), with edit + delete (`UModal` confirm) actions.
  - "New campaign" toggles an inline form (or a nested section) with `UFormField`s: **name** (`UInput`), **color** (`UInput type=color` is disallowed → use a small fixed swatch `USelectMenu` of ~8 hex presets **plus** a free `UInput` for custom hex, indigo `#6366f1` default), **status** (`USelectMenu`: active/planning/archived), **start/end date** (`UPopover`+`UCalendar`, `@internationalized/date` like `TaskCreateDialog.vue`), **brief** (`UTextarea :rows="4"`), **goal post count** (`UInput type=number`).
  - Submit calls `createCampaign`/`updateCampaign`; delete calls `deleteCampaign`; each success → `toast` + `emit('changed')`.
- [ ] **Step 2: Verify** — typecheck `ok`; manual: open the slideover from the planner header (wired in Task 17), create/edit/delete a campaign, watch counts update.
- [ ] **Step 3: Commit**

```bash
git add app/components/social-publishing/SocialCampaignManager.vue
git commit -m "feat(social): campaign manager slideover"
```

---

### Task 14: `SocialPlannerCard` component

**Files:**
- Create: `app/components/social-publishing/SocialPlannerCard.vue`

**Interfaces:**
- Consumes: `SocialBoardPost`.
- Produces: `<SocialPlannerCard :post @open @dragstart>` — presentational. Emits `open` (→ Compose) on click; native `draggable` for lane DnD.

- [ ] **Step 1: Build** — a bordered card (match `queue.vue` row styling) showing: truncated `post.content` (or "(no copy)"), network `UBadge`s from `post.platforms`, a **campaign color chip** (`post.campaign?.color` dot + name) when present, an assignee `UAvatar` when `assigned_to`, the scheduled/due date (`post.scheduled_at`/`post.due_at`, formatted with date-fns), and an `UBadge color="error"` "Needs attention" when `post.needs_attention`. Whole card `draggable="true"`; `@click` emits `open`. Keep it dumb — no fetching.
- [ ] **Step 2: Verify** — typecheck `ok`.
- [ ] **Step 3: Commit**

```bash
git add app/components/social-publishing/SocialPlannerCard.vue
git commit -m "feat(social): planner board card"
```

---

### Task 15: `SocialPlannerBoard` component

**Files:**
- Create: `app/components/social-publishing/SocialPlannerBoard.vue`

**Interfaces:**
- Consumes: `useSocialPlanner()`, `LANES`/`SocialPlannerLane` (Task 3), `SocialBoardPost`, `SocialCampaignWithCounts`, `SocialPlannerCard`.
- Produces: `<SocialPlannerBoard :client-id :reload-key />` — owns board fetch, lane columns, the "Group by campaign" toggle, campaign filter, and drag-to-lane mutations. Watches `clientId` + `reloadKey` (bumped by parent after campaign/AI changes).

- [ ] **Step 1: Build the data + interactions**
  - State: `posts = ref<SocialBoardPost[]>([])`, `campaigns = ref<SocialCampaignWithCounts[]>([])`, `loading`, `groupByCampaign = ref(false)`, `filterCampaignId = ref<string|null>(null)`, drag state (`dragId`).
  - `load()`: `Promise.all([getBoard(clientId, filterCampaignId ?? undefined), listCampaigns(clientId)])`. `watch([() => props.clientId, () => props.reloadKey, filterCampaignId], load, { immediate: true })`.
  - `postsByLane(lane)`: `posts.filter(p => p.lane === lane)`; when `groupByCampaign`, group those by `campaign?.id` into swimlanes (one "No campaign" group last).
  - **Drag-to-lane:** on card `dragstart` set `dragId`; each lane column is a drop target; on drop, map the target lane → a mutation:
    - `draft` → `updatePost(id,{ status:'draft' })`
    - `needs_approval` → `$fetch('/api/agency/social/publishing/posts/'+id+'/request-approval',{method:'POST'})`
    - `scheduled` → if no `scheduled_at`, open the card in Compose instead (can't schedule without a time) — toast "Set a time in Compose"; else `updatePost(id,{ status:'scheduled' })`
    - `published` lane is **not** a drop target (publishing is an explicit action) — reject drop with a toast.
    Optimistically move the card; reload on success; rollback + error toast on failure (mirror `queue.vue` persist pattern).
  - `openPost(p)`: `navigateTo({ path: '/agency/social/publishing/compose', query: { edit: p.id } })`.
- [ ] **Step 2: Build the layout**
  - Toolbar: `USwitch` "Group by campaign" + a campaign filter `USelectMenu` (items from `campaigns`, sentinel `'all'` → null, never empty-string value).
  - Default view: 4 lane columns (`LANES`) in a horizontal scroll/grid; each column header = label + count; body = `SocialPlannerCard` list; column is the drop zone.
  - Grouped view: same lanes, but within each lane, render campaign **swimlane** subgroups with a rollup header (color dot + name + `n / goal_post_count`).
  - Loading / empty states per lane (`text-muted`), full-width, `h-full overflow-x-auto` (PRD: nothing overflows the page; horizontal scroll inside the board only).
- [ ] **Step 3: Verify** — typecheck `ok`; manual after Task 17: drag a card across lanes (persists), toggle grouping, filter by campaign, click a card → Compose opens with `?edit=`.
- [ ] **Step 4: Commit**

```bash
git add app/components/social-publishing/SocialPlannerBoard.vue
git commit -m "feat(social): planner board — lanes, swimlanes, drag-to-lane"
```

---

### Task 16: `SocialAiPlanModal` component

**Files:**
- Create: `app/components/social-publishing/SocialAiPlanModal.vue`

**Interfaces:**
- Consumes: `useSocialPlanner()` (`generatePlan`, `acceptDraft`), `SocialGeneratedDraft`, `SocialCampaignWithCounts`.
- Produces: `<SocialAiPlanModal :client-id :campaigns v-model:open @created />` — the generate→review→accept flow. Emits `created` (count) after drafts are written.

**Note:** Invoke the `frontend-design` skill before building (form component).

- [ ] **Step 1: Build inputs** — `UModal` with form: **campaign** (`USelectMenu` from `campaigns`, optional; selecting one prefills `brief` from its `brief`), **brief** (`UTextarea :rows="4"`, required), **count** (`UInput type=number`, 1–14, default 5), **date range** (two `UPopover`+`UCalendar` fields From/To), **tone** (`USelectMenu`: Professional/Friendly/Bold/Playful, default Friendly), **platforms** (`USelectMenu multiple`, value-key platform). "Generate" button → `generatePlan({ clientId, campaignId, brief, count, dateFrom, dateTo, tone, platforms })`, sets `loading`.
- [ ] **Step 2: Build review grid** — after generation, show the returned `posts` as editable cards: each shows the default `content` in an editable `UTextarea`, a per-platform variants accordion (`UAccordion`, editable), `hashtags` as `UBadge`s, suggested date (read-only), and **Regenerate** (re-calls `generatePlan` with count=1, replaces that card) + **Discard** (removes the card). Nothing persisted yet.
- [ ] **Step 3: Build accept** — "Add N drafts" iterates the review cards and for each calls `acceptDraft({ clientId, campaignId, content, platforms, platformOverrides, hashtags, scheduledAt: suggested_scheduled_at, status: 'draft' })`. On completion → `toast` "Added N drafts", `emit('created', n)`, close. **Never** sets status to anything but `draft`.
- [ ] **Step 4: Verify** — typecheck `ok`; manual (requires `SOCIAL_PLANNER_AI_ENABLED=true` locally): generate, edit a card, regenerate one, accept → drafts appear in the board Draft lane.
- [ ] **Step 5: Commit**

```bash
git add app/components/social-publishing/SocialAiPlanModal.vue
git commit -m "feat(social): AI plan generate→review→accept modal"
```

---

### Task 17: Rewrite `planner.vue` to host the board

**Files:**
- Modify (rewrite): `app/pages/agency/social/publishing/planner.vue`

**Interfaces:**
- Consumes: `SocialPlannerBoard`, `SocialCampaignManager`, `SocialAiPlanModal`, `useSocialPublishingClient`, runtime flag.

- [ ] **Step 1: Expose the flags to the client** — confirm/extend `nuxt.config.ts` `runtimeConfig.public` (or an existing flags endpoint) so the page can read whether the board + AI are on. Pattern: add `socialPlannerEnabled: process.env.SOCIAL_PLANNER_ENABLED === 'true'` and `socialPlannerAiEnabled: ...` under `runtimeConfig.public`. (Read `nuxt.config.ts` first; follow the existing public-flag convention if one exists.)

- [ ] **Step 2: Rewrite the page**

```vue
<script setup lang="ts">
import { useSocialPublishingClient } from '~/composables/useSocialPublishingClient'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const { clientId } = useSocialPublishingClient()
const cfg = useRuntimeConfig().public as any
const enabled = computed(() => !!cfg.socialPlannerEnabled)
const aiEnabled = computed(() => !!cfg.socialPlannerAiEnabled)

const reloadKey = ref(0)
const showCampaigns = ref(false)
const showAi = ref(false)
function bumpReload() { reloadKey.value++ }
</script>

<template>
  <SocialPublishingShell
    title="Planner"
    subtitle="Plan campaigns and let AI draft a week of content. Drafts flow to Compose, Queue, and the Calendar."
  >
    <template #actions>
      <template v-if="enabled">
        <UButton icon="i-lucide-folder-kanban" variant="subtle" :disabled="!clientId" @click="showCampaigns = true">Campaigns</UButton>
        <UButton v-if="aiEnabled" icon="i-lucide-sparkles" :disabled="!clientId" @click="showAi = true">Generate plan</UButton>
      </template>
    </template>

    <div v-if="!enabled" class="rounded-lg border border-default p-10 text-center text-muted">
      <UIcon name="i-lucide-folder-kanban" class="size-8 mx-auto mb-2 opacity-50" />
      Planner v2 is coming soon. Posting slots now live on the <ULink to="/agency/social/publishing/queue">Queue</ULink> page.
    </div>
    <div v-else-if="!clientId" class="rounded-lg border border-default p-10 text-center text-muted">Select a client to start planning.</div>
    <SocialPlannerBoard v-else :client-id="clientId" :reload-key="reloadKey" />

    <SocialCampaignManager v-if="enabled && clientId" v-model:open="showCampaigns" :client-id="clientId" @changed="bumpReload" />
    <SocialAiPlanModal v-if="enabled && aiEnabled && clientId" v-model:open="showAi" :client-id="clientId" @created="bumpReload" />
  </SocialPublishingShell>
</template>
```
> If component auto-import names need the folder prefix (e.g. `SocialPublishingSocialPlannerBoard`), use the resolved names — verify with `pnpm dev` and the Nuxt devtools/component list.

- [ ] **Step 3: Verify** — typecheck `ok`; manual with `SOCIAL_PLANNER_ENABLED=true` (and `false`): flag-off shows the placeholder + Queue link; flag-on shows the board, Campaigns slideover, and (with AI flag) Generate plan.

- [ ] **Step 4: Commit**

```bash
git add app/pages/agency/social/publishing/planner.vue nuxt.config.ts
git commit -m "feat(social): planner page hosts campaign board + AI gen (flag-gated)"
```

---

### Task 18: Marketing / front-facing sync

**Files:**
- Modify: `app/pages/features/index.vue`
- Modify: `app/pages/features/[slug].vue`
- Modify: `app/components/MarketingNav.vue`

**Interfaces:** none (content only).

- [ ] **Step 1:** Add a "Campaign Planner & AI Content Calendar" feature to `features/index.vue` under the social/publishing category, and a detailed entry (3–4 sections) in `features/[slug].vue` covering: campaign board, status pipeline, AI brief→calendar generation, and integration with Compose/Queue/Calendar. Follow the existing entry shape; honor the dark-mode hex+`dark:` rule in CLAUDE.md.
- [ ] **Step 2:** If the social publishing area has a mega-menu group in `MarketingNav.vue`, add the planner; otherwise leave nav as-is.
- [ ] **Step 3: Verify + commit** — typecheck `ok`; manual: feature pages render in light + dark.

```bash
git add app/pages/features/index.vue "app/pages/features/[slug].vue" app/components/MarketingNav.vue
git commit -m "docs(marketing): list campaign planner + AI content calendar"
```

---

### Task 19: Full verification + final review

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `pnpm exec vitest run test/social/socialPlannerLanes.test.ts test/social/socialPlanGeneration.test.ts test/composables/useSocialPlanner.test.ts`
Expected: all PASS.

- [ ] **Step 2: Full typecheck**

Run: `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck 2>&1 | tail -20`
Expected: no **new** errors beyond the documented ~60 pre-existing `index.d.ts` ones.

- [ ] **Step 3: Manual battle-test (per CLAUDE.md pre-commit rules)** — with `SOCIAL_PLANNER_ENABLED=true SOCIAL_PLANNER_AI_ENABLED=true pnpm dev`:
  - Planner full-width + scrolls; flag-off shows placeholder.
  - Create a campaign → board filter + swimlane rollup reflect it.
  - Drag a card across lanes → persists; refresh confirms.
  - "Generate plan" → review grid → edit → accept → drafts land in Draft lane as `status='draft'` (verify in DB: `SELECT status, campaign_id FROM social_posts ORDER BY created_at DESC LIMIT 5`).
  - Slots live on Queue and still drive "fill from drafts".
  - Check `~/` vs `~~/` import aliases on every new server file; USelectMenu values never empty-string; date inputs use UPopover+UCalendar.

- [ ] **Step 4: Final commit (if any review fixes)**

```bash
git add -A && git commit -m "chore(social): planner slice review fixes" || echo "nothing to fix"
```

---

## Self-review notes (author)

- **Spec coverage:** campaigns table (T1), lanes derived no-enum (T3), board+swimlane+DnD (T15), AI gen draft-only behind review (T4/T10/T16), slots→Queue (T12), two flags (T5/T6/T7/T10/T17), reuse Compose/posts endpoints (T8/T16), marketing sync (T18), tests (T3/T4/T11/T19). All spec §3–§11 sections map to a task.
- **Deferred (not in plan, by design):** content-pillars→cadence, best-time, bulk CSV, analytics depth — named in spec §12.
- **Type consistency:** `SocialBoardPost.lane` (T2) ← `deriveLane` (T3) ← board API (T7) ← composable `getBoard` (T11) ← board component (T15). `acceptDraft`→`posts/index.post.ts` accepts `campaignId` (T8). Consistent.
