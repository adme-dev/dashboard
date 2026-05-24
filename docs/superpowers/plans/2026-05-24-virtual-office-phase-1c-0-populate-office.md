# Virtual Office — Phase 1c.0 (Populate the Office) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the office page feel populated — every team member visible on the floor plan at a desk, knock-on-person spawns an ad-hoc meeting bubble at the host's desk, and the camera permission prompt no longer fires on cold page load.

**Architecture:** Three layers. (a) **DB**: migration 101 adds `desk` + `adhoc` `office_zone_type` enum values plus `assigned_user_id` / `is_ephemeral` / `anchor_zone_id` columns. (b) **Worker**: extend existing `OfficeRoom` DO with one new WS message (`knock:request-person`) handled by a pure function in `handlers.ts`; ad-hoc zones lazily created via a sync-secret-gated internal endpoint and auto-deleted when occupancy hits 0. (c) **Client**: extend `useOfficeKnocks` with `sendPersonKnock`; render desks + ad-hoc bubbles on the floor plan; `v-if` guard on `OfficeRoomPanel` + `initialVideo: false` to fix the camera prompt bug.

**Tech Stack:** Nuxt 4 + Vue 3 (Composition API), Cloudflare Workers Durable Objects, `@cloudflare/realtimekit` Core SDK, Vitest, Neon Postgres (via `psql`), Nuxt UI v4 components.

**Spec:** `docs/superpowers/specs/2026-05-24-virtual-office-phase-1c-0-populate-office-design.md`

---

## Conventions

Working directory is the worktree root:
```
/Users/paulgiurin/Documents/Projects/dashboard/.claude/worktrees/virtual-office-1b-media
```

Branch: `feat/virtual-office-1b-media` (continues PR #11; commits land alongside 1b'/1c.1 work). Per the spec, this phase can also be cut as its own branch after PR #11 merges — both paths are fine.

DB connection loaded from `.env` per CLAUDE.md:
```bash
export DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-)
```

Test runner is `pnpm test` (vitest). Use `--run` for single-shot runs in CI-style. Single-file: `pnpm test -- <path>`.

Frontend `~/` resolves to `app/`; Nitro server code uses `~~/` for `server/` and the project root. Worker code (`workers/office-room/`) has its own `tsconfig`.

---

## Task 1: Fix camera-on-cold-load (smallest possible patch)

**Why first:** this is a live UX bug on the deployed pages-dev URL. It's a two-line fix with no dependencies; ship it first so even if the rest of the phase slips, the bug is gone.

**Files:**
- Modify: `app/components/office/OfficeRoomPanel.client.vue:26`
- Modify: `app/pages/office.vue:235-240`

- [ ] **Step 1: Manual reproduction baseline**

Run `pnpm dev`, open `http://localhost:3000/office` in a fresh browser profile, observe the browser permission prompt fire on page load. Confirm the bug exists before fixing.

- [ ] **Step 2: Flip `initialVideo` default in OfficeRoomPanel**

In `app/components/office/OfficeRoomPanel.client.vue`, locate line 26:

```ts
} = useMediaDevices({ initialAudio: true, initialVideo: true })
```

Change to:

```ts
} = useMediaDevices({ initialAudio: true, initialVideo: false })
```

- [ ] **Step 3: Add `v-if` guard on OfficeRoomPanel mount in office.vue**

In `app/pages/office.vue`, locate the `<OfficeRoomPanel>` block (around line 235-240):

```vue
<OfficeRoomPanel
  v-model:open="roomPanelOpen"
  :zone="currentZone"
  :credentials="connection.currentMediaCredentials.value"
  @leave="handleRoomLeave"
/>
```

Add `v-if="roomPanelOpen"`:

```vue
<OfficeRoomPanel
  v-if="roomPanelOpen"
  v-model:open="roomPanelOpen"
  :zone="currentZone"
  :credentials="connection.currentMediaCredentials.value"
  @leave="handleRoomLeave"
/>
```

- [ ] **Step 4: Manual verification**

Restart `pnpm dev`, hard-reload `/office` in a fresh browser profile. Expected:
- **No permission prompt on page load.**
- Click into the Lobby zone → mic permission prompt fires (camera does NOT, because `initialVideo: false`).
- Click the camera button in the room controls → camera permission prompt fires.

- [ ] **Step 5: Commit**

```bash
git add app/components/office/OfficeRoomPanel.client.vue app/pages/office.vue
git commit -m "fix(office): no camera/mic prompt on cold page load

OfficeRoomPanel was mounted unconditionally on /office, and its
useMediaDevices() call fires getUserMedia() on mount to enumerate
device labels. Guard the mount with v-if=roomPanelOpen so the
prompt only fires once the user actually enters a zone.

Also flip initialVideo to false so the camera stays off by default
even after zone entry — users opt in via the camera button. Matches
the audio-first thesis in the Phase 1c PRD."
```

---

## Task 2: Apply migration 101 — desks and ad-hoc zones

**Files:**
- Create: `server/database/migrations/101-virtual-office-desks-and-adhoc.sql`

- [ ] **Step 1: Write the migration file**

Create `server/database/migrations/101-virtual-office-desks-and-adhoc.sql`:

```sql
-- =============================================================================
-- Phase 1c.0 — Desks and ad-hoc zones
-- =============================================================================
-- Adds two new zone_types ('desk' and 'adhoc') plus the columns needed to
-- back-reference desks to users and to mark ad-hoc rooms as ephemeral.
-- Backfill of desks for existing members is done lazily in app code on the
-- next GET /api/office/[id] — this migration is purely additive and safe
-- to re-run.
-- =============================================================================

-- 1. Extend zone_type enum (idempotent)
ALTER TYPE office_zone_type ADD VALUE IF NOT EXISTS 'desk';
ALTER TYPE office_zone_type ADD VALUE IF NOT EXISTS 'adhoc';

-- 2. Add columns to office_zones
ALTER TABLE office_zones
  ADD COLUMN IF NOT EXISTS assigned_user_id UUID
    REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_ephemeral BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS anchor_zone_id UUID
    REFERENCES office_zones(id) ON DELETE CASCADE;

-- 3. Uniqueness: one desk per user per office
CREATE UNIQUE INDEX IF NOT EXISTS office_zones_desk_assignment_unique
  ON office_zones (office_id, assigned_user_id)
  WHERE zone_type = 'desk' AND assigned_user_id IS NOT NULL;

-- 4. Index for ephemeral-zone cleanup sweep
CREATE INDEX IF NOT EXISTS office_zones_ephemeral_idx
  ON office_zones (office_id, is_ephemeral)
  WHERE is_ephemeral = TRUE;
```

- [ ] **Step 2: Apply the migration**

```bash
export DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/101-virtual-office-desks-and-adhoc.sql
```

Expected output: `ALTER TYPE` x2, `ALTER TABLE`, `CREATE INDEX` x2 — all succeed. (`ALTER TYPE ... ADD VALUE IF NOT EXISTS` may print `NOTICE` if the value already exists; that is fine.)

- [ ] **Step 3: Verify schema**

```bash
psql "$DATABASE_URL" -c "\d office_zones"
psql "$DATABASE_URL" -c "SELECT unnest(enum_range(NULL::office_zone_type))"
```

Expected: `office_zones` shows the three new columns; enum shows `lobby`, `meeting`, `focus`, `private`, `desk`, `adhoc` (or the project's existing set plus the two new values).

- [ ] **Step 4: Commit**

```bash
git add server/database/migrations/101-virtual-office-desks-and-adhoc.sql
git commit -m "feat(office): migration 101 — desks and ad-hoc zones"
```

---

## Task 3: Extend shared types in `app/types/office.ts`

**Files:**
- Modify: `app/types/office.ts`

- [ ] **Step 1: Read the current file**

Locate `app/types/office.ts` and identify the `ZoneType` union, the knock message types added in Phase 1c.1, and any existing `OfficeMember` type. Confirm the file structure before editing.

- [ ] **Step 2: Extend `ZoneType` union**

Find the current `ZoneType` declaration (likely a string union) and add `'desk'` and `'adhoc'`:

```ts
export type ZoneType = 'lobby' | 'meeting' | 'focus' | 'private' | 'desk' | 'adhoc'
```

(Match whatever existing values the file already defines — only add the two new ones.)

- [ ] **Step 3: Extend `OfficeZoneRow` interface**

Add three optional fields matching migration 101:

```ts
export interface OfficeZoneRow {
  // ... existing fields
  assigned_user_id: string | null
  is_ephemeral: boolean
  anchor_zone_id: string | null
}
```

- [ ] **Step 4: Add `OfficeMember` type**

If not already present, add:

```ts
export interface OfficeMember {
  userId: string
  name: string
  avatarUrl: string | null
  role: string
  deskZoneId: string | null
  lastSeenAt: string | null
}
```

- [ ] **Step 5: Extend knock message types**

Find the existing `InboundMessage` / `OutboundMessage` union from Phase 1c.1 and add the person-knock variants. New inbound (client → server):

```ts
| { type: 'knock:request-person'; knockId: string; targetHandle: ActorHandle }
```

Extend the existing `KnockResultStatus` union with two new values:

```ts
export type KnockResultStatus =
  | 'accepted' | 'denied' | 'timeout' | 'busy'
  | 'no-occupant' | 'not-knockable' | 'self-knock'
  | 'offline' | 'open-room'  // ← new
```

For `open-room`, the `knock:result` outbound message needs a `targetZoneId` field (the zone to walk into). It is already present per the 1c.1 spec for `accepted`; add a comment clarifying it is also set for `open-room`.

- [ ] **Step 6: Type-check**

```bash
pnpm exec nuxi typecheck 2>&1 | head -40
```

Expected: pre-existing ~60 errors per CLAUDE.md, but no NEW errors mentioning `office.ts`.

- [ ] **Step 7: Commit**

```bash
git add app/types/office.ts
git commit -m "feat(office): extend types for desks, ad-hoc zones, knock-on-person"
```

---

## Task 4: Mirror knock-person types in worker

**Files:**
- Modify: `workers/office-room/src/types.ts`

- [ ] **Step 1: Mirror the inbound knock-person message**

In `workers/office-room/src/types.ts`, find the `InboundMessage` union and add:

```ts
| { type: 'knock:request-person'; knockId: string; targetHandle: ActorHandle }
```

- [ ] **Step 2: Extend `KnockResultStatus` worker-side**

Add `'offline'` and `'open-room'` to the worker's `KnockResultStatus` union (must match the client-side type exactly).

- [ ] **Step 3: Type-check the worker**

```bash
pnpm exec tsc --noEmit -p workers/office-room/tsconfig.json
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add workers/office-room/src/types.ts
git commit -m "feat(office): mirror knock-person types in OfficeRoom worker"
```

---

## Task 5: `allocateDesk` utility — write test first

**Files:**
- Create: `test/server/utils/office/allocateDesk.test.ts`
- Create: `server/utils/office/allocateDesk.ts`

- [ ] **Step 1: Write the failing test**

Create `test/server/utils/office/allocateDesk.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computeNextDeskPosition } from '~~/server/utils/office/allocateDesk'

describe('computeNextDeskPosition', () => {
  it('returns (0,0) origin offset when there are no existing desks', () => {
    const pos = computeNextDeskPosition({
      existingDesks: [],
      gridOriginY: 600,
      cellWidth: 96,
      cellHeight: 76,
      colsPerRow: 8,
    })
    expect(pos).toEqual({ x: 0, y: 600 })
  })

  it('places the second desk one cell to the right', () => {
    const pos = computeNextDeskPosition({
      existingDesks: [{ x: 0, y: 600 }],
      gridOriginY: 600,
      cellWidth: 96,
      cellHeight: 76,
      colsPerRow: 8,
    })
    expect(pos).toEqual({ x: 96, y: 600 })
  })

  it('wraps to the next row after filling 8 columns', () => {
    const existingDesks = Array.from({ length: 8 }, (_, i) => ({
      x: i * 96,
      y: 600,
    }))
    const pos = computeNextDeskPosition({
      existingDesks,
      gridOriginY: 600,
      cellWidth: 96,
      cellHeight: 76,
      colsPerRow: 8,
    })
    expect(pos).toEqual({ x: 0, y: 676 })
  })

  it('reuses the lowest free slot when desks are sparse', () => {
    // Slot (1, 0) is free; should be picked before extending to slot (0, 1)
    const existingDesks = [
      { x: 0, y: 600 },   // (col 0, row 0)
      { x: 192, y: 600 }, // (col 2, row 0)
    ]
    const pos = computeNextDeskPosition({
      existingDesks,
      gridOriginY: 600,
      cellWidth: 96,
      cellHeight: 76,
      colsPerRow: 8,
    })
    expect(pos).toEqual({ x: 96, y: 600 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- test/server/utils/office/allocateDesk.test.ts --run
```

Expected: FAIL with "Failed to resolve import '~~/server/utils/office/allocateDesk'".

- [ ] **Step 3: Implement the minimal allocator function**

Create `server/utils/office/allocateDesk.ts`:

```ts
import { execute, queryOne, queryRows } from '~~/server/utils/db'
import type { OfficeZoneRow } from '~~/app/types/office'

export interface DeskGridConfig {
  cellWidth: number
  cellHeight: number
  colsPerRow: number
  gridOriginY: number
}

export const DEFAULT_DESK_GRID: DeskGridConfig = {
  cellWidth: 96,
  cellHeight: 76,
  colsPerRow: 8,
  gridOriginY: 600, // safely below the existing seeded zones (migration 098)
}

export interface ComputeNextArgs extends DeskGridConfig {
  existingDesks: Array<{ x: number; y: number }>
}

/**
 * Pure: find the lowest free slot in the desk grid.
 * "Lowest" means smallest (row, then col). Reuses gaps.
 */
export function computeNextDeskPosition(args: ComputeNextArgs): { x: number; y: number } {
  const taken = new Set<string>()
  for (const d of args.existingDesks) {
    const col = Math.round((d.x) / args.cellWidth)
    const row = Math.round((d.y - args.gridOriginY) / args.cellHeight)
    taken.add(`${col},${row}`)
  }

  let row = 0
  while (true) {
    for (let col = 0; col < args.colsPerRow; col++) {
      if (!taken.has(`${col},${row}`)) {
        return {
          x: col * args.cellWidth,
          y: args.gridOriginY + row * args.cellHeight,
        }
      }
    }
    row++
  }
}

/**
 * Allocate a desk for `userId` in `officeId`. Idempotent — returns the
 * existing desk if one is already assigned. Throws if the user is not a
 * member of the office.
 */
export async function allocateDesk(
  officeId: string,
  userId: string,
  grid: DeskGridConfig = DEFAULT_DESK_GRID,
): Promise<OfficeZoneRow> {
  // Idempotent: existing desk?
  const existing = await queryOne<OfficeZoneRow>(
    `SELECT * FROM office_zones
       WHERE office_id = $1 AND zone_type = 'desk' AND assigned_user_id = $2`,
    [officeId, userId],
  )
  if (existing) return existing

  // Look up the user's display name for the desk label
  const user = await queryOne<{ name: string }>(
    `SELECT name FROM users WHERE id = $1`,
    [userId],
  )
  const label = user?.name ? `${user.name}'s desk` : 'Desk'

  // Compute next free slot from existing desks in this office
  const existingDesks = await queryRows<{ x: number; y: number }>(
    `SELECT x, y FROM office_zones
       WHERE office_id = $1 AND zone_type = 'desk'`,
    [officeId],
  )
  const pos = computeNextDeskPosition({ existingDesks, ...grid })

  const created = await queryOne<OfficeZoneRow>(
    `INSERT INTO office_zones
       (office_id, name, zone_type, capacity, x, y, width, height,
        assigned_user_id, cf_preset_default)
     VALUES ($1, $2, 'desk', 1, $3, $4, 80, 60, $5, NULL)
     RETURNING *`,
    [officeId, label, pos.x, pos.y, userId],
  )
  if (!created) throw new Error('allocateDesk: insert returned no row')
  return created
}
```

- [ ] **Step 4: Run test to verify pure function passes**

```bash
pnpm test -- test/server/utils/office/allocateDesk.test.ts --run
```

Expected: all 4 tests PASS. (`allocateDesk` itself is not unit-tested here — it touches the DB; integration covers it in Task 7.)

- [ ] **Step 5: Commit**

```bash
git add server/utils/office/allocateDesk.ts test/server/utils/office/allocateDesk.test.ts
git commit -m "feat(office): desk allocator + 4 unit tests for grid math"
```

---

## Task 6: Wire `allocateDesk` into `members.post.ts`

**Files:**
- Modify: `server/api/office/[officeId]/members.post.ts`

- [ ] **Step 1: Read the current endpoint**

Open `server/api/office/[officeId]/members.post.ts`. Identify the spot where the member INSERT completes successfully.

- [ ] **Step 2: Call `allocateDesk` after successful insert**

After the member is inserted, before returning, add:

```ts
import { allocateDesk } from '~~/server/utils/office/allocateDesk'

// ... (existing code)
// After successful members insert, with `userId` and `officeId` in scope:
try {
  await allocateDesk(officeId, userId)
} catch (err) {
  // Desk allocation failure is non-fatal — the member IS added. The desk
  // will be created on the next GET /api/office/[id] via lazy backfill.
  console.error('[office] allocateDesk failed for member add', { officeId, userId, err })
}
```

- [ ] **Step 3: Smoke test — add a member, check desk row**

Run `pnpm dev` and either via the existing admin UI/API or via direct `curl` with a valid auth cookie, add a test member to your dev office. Then:

```bash
export DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-)
psql "$DATABASE_URL" -c "SELECT id, name, zone_type, x, y, assigned_user_id
                          FROM office_zones
                          WHERE zone_type = 'desk' ORDER BY y, x"
```

Expected: a new row with `zone_type='desk'` and `assigned_user_id` matching the user you added.

- [ ] **Step 4: Commit**

```bash
git add server/api/office/[officeId]/members.post.ts
git commit -m "feat(office): allocate a desk when a member is added to an office"
```

---

## Task 7: Extend GET endpoint — members list + lazy backfill

**Files:**
- Modify: `server/api/office/[officeId]/index.get.ts`

- [ ] **Step 1: Read the current endpoint**

Open `server/api/office/[officeId]/index.get.ts`. Note the current response shape: `{ office, zones, myRole }`.

- [ ] **Step 2: Add the members query + lazy backfill**

After loading `zones`, add:

```ts
import { allocateDesk } from '~~/server/utils/office/allocateDesk'
import type { OfficeMember } from '~~/app/types/office'

// ... (existing code; after `zones` is fetched)

const members = await queryRows<{
  userId: string
  name: string
  avatarUrl: string | null
  role: string
  deskZoneId: string | null
  lastSeenAt: string | null
}>(
  `SELECT
      u.id AS "userId",
      u.name,
      u.avatar_url AS "avatarUrl",
      om.role,
      dz.id AS "deskZoneId",
      ucs.last_seen_at AS "lastSeenAt"
    FROM office_members om
    JOIN users u ON u.id = om.user_id
    LEFT JOIN office_zones dz
      ON dz.office_id = om.office_id
     AND dz.zone_type = 'desk'
     AND dz.assigned_user_id = u.id
    LEFT JOIN user_chat_status ucs ON ucs.user_id = u.id
    WHERE om.office_id = $1`,
  [officeId],
)

// Lazy backfill: any member without a desk gets one allocated right now.
// Idempotent and fast — the lookup is indexed and the insert is O(1).
const missing = members.filter(m => !m.deskZoneId)
if (missing.length > 0) {
  for (const m of missing) {
    try {
      const desk = await allocateDesk(officeId, m.userId)
      m.deskZoneId = desk.id
      // Also push the new desk into the zones list so the client sees it
      // without a second round trip.
      zones.push(desk)
    } catch (err) {
      console.error('[office] lazy desk backfill failed', { officeId, userId: m.userId, err })
    }
  }
}

return { office, zones, myRole, members }
```

- [ ] **Step 3: Smoke test the response**

With `pnpm dev` running and an authenticated session, hit:

```bash
curl -sS -b "your-auth-cookie" http://localhost:3000/api/office/<officeId> | jq '.members | length, .members[0]'
```

Expected: a number > 0 and a sample member row with `deskZoneId` populated for at least one member.

- [ ] **Step 4: Verify lazy backfill ran for any prior member without a desk**

```bash
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM office_members om
                          WHERE NOT EXISTS (
                            SELECT 1 FROM office_zones dz
                            WHERE dz.office_id = om.office_id
                              AND dz.zone_type = 'desk'
                              AND dz.assigned_user_id = om.user_id
                          )"
```

Expected: `0` after the GET ran for every office.

- [ ] **Step 5: Commit**

```bash
git add server/api/office/[officeId]/index.get.ts
git commit -m "feat(office): GET /api/office/[id] returns members + lazy-backfills desks"
```

---

## Task 8: Internal endpoints for ad-hoc zone create/delete

**Why these exist:** the OfficeRoom DO cannot speak Postgres directly. The 1b'/1c.1 work added `_internal/*` endpoints gated by `OFFICE_SYNC_SECRET` for DO ↔ Pages calls. Adhoc CRUD follows the same pattern.

**Files:**
- Create: `server/api/office/_internal/zones/create.post.ts`
- Create: `server/api/office/_internal/zones/[id].delete.ts`

- [ ] **Step 1: Read an existing `_internal` endpoint for the auth pattern**

```bash
cat server/api/office/_internal/sync-status.post.ts
```

Identify the auth helper (likely `isAuthorizedSyncRequest` from `~~/server/utils/office/sync` or similar — confirmed in commit `bd7eeb7`).

- [ ] **Step 2: Write the create endpoint**

Create `server/api/office/_internal/zones/create.post.ts`:

```ts
import { isAuthorizedSyncRequest } from '~~/server/utils/office/sync'
import { queryOne } from '~~/server/utils/db'
import type { OfficeZoneRow } from '~~/app/types/office'
import { z } from 'zod'

const Body = z.object({
  officeId: z.string().uuid(),
  anchorZoneId: z.string().uuid(),
  zoneType: z.literal('adhoc'),
  cfPresetDefault: z.string().default('staff_full'),
  capacity: z.number().int().min(2).max(16).default(8),
})

export default defineEventHandler(async (event) => {
  if (!isAuthorizedSyncRequest(event)) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const body = Body.parse(await readBody(event))

  // Look up anchor desk position to place the adhoc just above it
  const anchor = await queryOne<{ x: number; y: number; office_id: string }>(
    `SELECT x, y, office_id FROM office_zones WHERE id = $1`,
    [body.anchorZoneId],
  )
  if (!anchor || anchor.office_id !== body.officeId) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid anchor zone' })
  }

  const adhoc = await queryOne<OfficeZoneRow>(
    `INSERT INTO office_zones
       (office_id, name, zone_type, capacity, x, y, width, height,
        is_ephemeral, anchor_zone_id, cf_preset_default)
     VALUES ($1, '', 'adhoc', $2, $3, $4, 120, 80, TRUE, $5, $6)
     RETURNING *`,
    [body.officeId, body.capacity, anchor.x, anchor.y - 80,
     body.anchorZoneId, body.cfPresetDefault],
  )
  if (!adhoc) throw createError({ statusCode: 500, statusMessage: 'Insert failed' })
  return { zone: adhoc }
})
```

- [ ] **Step 3: Write the delete endpoint**

Create `server/api/office/_internal/zones/[id].delete.ts`:

```ts
import { isAuthorizedSyncRequest } from '~~/server/utils/office/sync'
import { execute } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  if (!isAuthorizedSyncRequest(event)) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  // Only ever delete ephemeral zones via this endpoint — refuse to nuke
  // a regular desk or meeting room even if the DO asks.
  const res = await execute(
    `DELETE FROM office_zones WHERE id = $1 AND is_ephemeral = TRUE`,
    [id],
  )
  return { deleted: res.rowCount ?? 0 }
})
```

- [ ] **Step 4: Smoke test with curl + sync secret**

```bash
SECRET=$(grep '^OFFICE_SYNC_SECRET=' .env | cut -d= -f2-)
# Replace OFFICE_ID + ANCHOR_ID with real UUIDs from your dev office
curl -sS -X POST http://localhost:3000/api/office/_internal/zones/create \
  -H "x-office-sync: $SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"officeId":"<office-uuid>","anchorZoneId":"<desk-uuid>","zoneType":"adhoc"}'
```

Expected: JSON `{ zone: { id, zone_type: 'adhoc', is_ephemeral: true, anchor_zone_id: ... } }`.

Then delete it:

```bash
curl -sS -X DELETE http://localhost:3000/api/office/_internal/zones/<adhoc-id> \
  -H "x-office-sync: $SECRET"
```

Expected: `{ "deleted": 1 }`.

- [ ] **Step 5: Commit**

```bash
git add server/api/office/_internal/zones/create.post.ts \
        server/api/office/_internal/zones/[id].delete.ts
git commit -m "feat(office): internal endpoints for ad-hoc zone create/delete"
```

---

## Task 9: `applyKnockRequestPerson` pure handler — TDD

**Files:**
- Modify: `workers/office-room/src/handlers.ts`
- Modify: `test/workers/office-room/handlers.test.ts`

- [ ] **Step 1: Write the failing tests**

In `test/workers/office-room/handlers.test.ts`, add a new `describe` block:

```ts
import { applyKnockRequestPerson } from '~~/workers/office-room/src/handlers'
import type { KnockState, ParticipantState } from '~~/workers/office-room/src/types'

describe('applyKnockRequestPerson', () => {
  function makeState(opts: {
    zoneByOccupant?: Record<string, { id: string; zone_type: string }>
    knocks?: KnockState
  }) {
    return {
      participants: new Map<string, ParticipantState>(),
      zoneByOccupant: new Map(Object.entries(opts.zoneByOccupant ?? {})),
      knocks: opts.knocks ?? new Map(),
      // ... whatever other state shape handlers.test.ts already uses
    } as any
  }

  it('returns offline when target is not in zoneByOccupant', () => {
    const state = makeState({})
    const result = applyKnockRequestPerson(state, {
      type: 'knock:request-person',
      knockId: 'k1',
      targetHandle: 'user:abc',
    }, 'user:knocker')
    expect(result.kind).toBe('result')
    expect(result.result.status).toBe('offline')
  })

  it('returns self-knock when knocker == target', () => {
    const state = makeState({
      'user:me': { id: 'desk-1', zone_type: 'desk' },
    })
    const result = applyKnockRequestPerson(state, {
      type: 'knock:request-person',
      knockId: 'k1',
      targetHandle: 'user:me',
    }, 'user:me')
    expect(result.result.status).toBe('self-knock')
  })

  it('returns open-room when target is in a meeting zone', () => {
    const state = makeState({
      'user:target': { id: 'meeting-1', zone_type: 'meeting' },
    })
    const result = applyKnockRequestPerson(state, {
      type: 'knock:request-person',
      knockId: 'k1',
      targetHandle: 'user:target',
    }, 'user:knocker')
    expect(result.result.status).toBe('open-room')
    expect(result.result.targetZoneId).toBe('meeting-1')
  })

  it('returns open-room when target is in the lobby', () => {
    const state = makeState({
      'user:target': { id: 'lobby-1', zone_type: 'lobby' },
    })
    const result = applyKnockRequestPerson(state, {
      type: 'knock:request-person',
      knockId: 'k1',
      targetHandle: 'user:target',
    }, 'user:knocker')
    expect(result.result.status).toBe('open-room')
  })

  it('emits adhoc-create directive when target is at a desk', () => {
    const state = makeState({
      'user:target': { id: 'desk-1', zone_type: 'desk' },
    })
    const result = applyKnockRequestPerson(state, {
      type: 'knock:request-person',
      knockId: 'k1',
      targetHandle: 'user:target',
    }, 'user:knocker')
    expect(result.kind).toBe('adhoc-create')
    expect(result.anchorZoneId).toBe('desk-1')
    expect(result.targetHandle).toBe('user:target')
  })

  it('delegates to zone-knock when target is in a focus room', () => {
    const state = makeState({
      'user:target': { id: 'focus-1', zone_type: 'focus' },
    })
    const result = applyKnockRequestPerson(state, {
      type: 'knock:request-person',
      knockId: 'k1',
      targetHandle: 'user:target',
    }, 'user:knocker')
    expect(result.kind).toBe('delegate-zone-knock')
    expect(result.targetZoneId).toBe('focus-1')
  })

  it('delegates to zone-knock when target is in an adhoc room', () => {
    const state = makeState({
      'user:target': { id: 'adhoc-1', zone_type: 'adhoc' },
    })
    const result = applyKnockRequestPerson(state, {
      type: 'knock:request-person',
      knockId: 'k1',
      targetHandle: 'user:target',
    }, 'user:knocker')
    expect(result.kind).toBe('delegate-zone-knock')
    expect(result.targetZoneId).toBe('adhoc-1')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- test/workers/office-room/handlers.test.ts --run
```

Expected: 7 new tests FAIL with "applyKnockRequestPerson is not a function".

- [ ] **Step 3: Implement `applyKnockRequestPerson` pure function**

In `workers/office-room/src/handlers.ts`, add:

```ts
import type { ActorHandle, ZoneType } from './types'

export type KnockPersonResult =
  | {
      kind: 'result'
      result: { type: 'knock:result'; knockId: string; status: KnockResultStatus; targetZoneId?: string }
    }
  | {
      kind: 'adhoc-create'
      knockId: string
      knockerHandle: ActorHandle
      targetHandle: ActorHandle
      anchorZoneId: string
    }
  | {
      kind: 'delegate-zone-knock'
      knockId: string
      knockerHandle: ActorHandle
      targetHandle: ActorHandle
      targetZoneId: string
    }

export function applyKnockRequestPerson(
  state: {
    zoneByOccupant: Map<ActorHandle, { id: string; zone_type: ZoneType }>
  },
  msg: { type: 'knock:request-person'; knockId: string; targetHandle: ActorHandle },
  knockerHandle: ActorHandle,
): KnockPersonResult {
  if (msg.targetHandle === knockerHandle) {
    return { kind: 'result', result: { type: 'knock:result', knockId: msg.knockId, status: 'self-knock' } }
  }

  const targetZone = state.zoneByOccupant.get(msg.targetHandle)
  if (!targetZone) {
    return { kind: 'result', result: { type: 'knock:result', knockId: msg.knockId, status: 'offline' } }
  }

  switch (targetZone.zone_type) {
    case 'lobby':
    case 'meeting':
      return {
        kind: 'result',
        result: {
          type: 'knock:result',
          knockId: msg.knockId,
          status: 'open-room',
          targetZoneId: targetZone.id,
        },
      }

    case 'desk':
      return {
        kind: 'adhoc-create',
        knockId: msg.knockId,
        knockerHandle,
        targetHandle: msg.targetHandle,
        anchorZoneId: targetZone.id,
      }

    case 'focus':
    case 'private':
    case 'adhoc':
      return {
        kind: 'delegate-zone-knock',
        knockId: msg.knockId,
        knockerHandle,
        targetHandle: msg.targetHandle,
        targetZoneId: targetZone.id,
      }

    default:
      // Unknown zone type — treat as not-knockable to avoid silent UI hang
      return { kind: 'result', result: { type: 'knock:result', knockId: msg.knockId, status: 'not-knockable' } }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- test/workers/office-room/handlers.test.ts --run
```

Expected: all 7 new tests PASS. Existing Phase 1c.1 handler tests still pass.

- [ ] **Step 5: Commit**

```bash
git add workers/office-room/src/handlers.ts test/workers/office-room/handlers.test.ts
git commit -m "feat(office): applyKnockRequestPerson pure handler + 7 unit tests"
```

---

## Task 10: Wire knock-person dispatch + ad-hoc cleanup in OfficeRoom DO

**Files:**
- Modify: `workers/office-room/src/OfficeRoom.ts`

- [ ] **Step 1: Add dispatch case for `knock:request-person`**

Find the message-dispatch switch in `OfficeRoom.ts` (Phase 1c.1 added cases for `knock:request`, `knock:accept`, etc). Add:

```ts
case 'knock:request-person': {
  const result = applyKnockRequestPerson(
    { zoneByOccupant: this.zoneByOccupant },
    msg,
    knockerHandle,
  )

  if (result.kind === 'result') {
    this.sendToParticipant(knockerHandle, result.result)
    return
  }

  if (result.kind === 'delegate-zone-knock') {
    // Re-enter the existing zone-knock flow as if the user had sent
    // knock:request directly for that zone.
    return this.handleKnockRequest({
      type: 'knock:request',
      knockId: result.knockId,
      zoneId: result.targetZoneId,
    }, knockerHandle)
  }

  if (result.kind === 'adhoc-create') {
    // Lazy-create the ad-hoc zone via the internal endpoint, then
    // re-enter the zone-knock flow against the new zone id.
    const adhoc = await this.createAdhocZone(result.anchorZoneId)
    return this.handleKnockRequest({
      type: 'knock:request',
      knockId: result.knockId,
      zoneId: adhoc.id,
    }, knockerHandle)
  }
  break
}
```

- [ ] **Step 2: Add `createAdhocZone` helper to the DO**

```ts
private async createAdhocZone(anchorZoneId: string): Promise<{ id: string }> {
  const res = await fetch(`${this.env.PAGES_ORIGIN}/api/office/_internal/zones/create`, {
    method: 'POST',
    headers: {
      'x-office-sync': this.env.OFFICE_SYNC_SECRET,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      officeId: this.officeId,
      anchorZoneId,
      zoneType: 'adhoc',
    }),
  })
  if (!res.ok) {
    throw new Error(`createAdhocZone failed: ${res.status} ${await res.text()}`)
  }
  const { zone } = await res.json() as { zone: { id: string; [k: string]: unknown } }

  // Cache in zoneMeta so subsequent lookups don't re-fetch from Pages
  this.zoneMeta.set(zone.id, zone as any)

  // Broadcast zone:created so clients render the new bubble
  this.broadcast({ type: 'zone:created', zone })

  return zone
}
```

- [ ] **Step 3: Add ad-hoc cleanup in `participant:left` handler**

Locate the existing `participant:left` flow (where occupancy decrements). After the decrement, add:

```ts
// Ad-hoc auto-cleanup: if this was the last person in an ephemeral zone,
// delete the zone (the meeting itself can be left to CF's auto-cleanup,
// or explicitly torn down — see OQ-2 in spec).
const leftZoneId = previousZoneId
if (leftZoneId) {
  const meta = this.zoneMeta.get(leftZoneId)
  if (meta?.is_ephemeral) {
    const occupants = this.zoneOccupancy.get(leftZoneId)
    if (!occupants || occupants.size === 0) {
      await this.deleteAdhocZone(leftZoneId)
    }
  }
}
```

And the helper:

```ts
private async deleteAdhocZone(zoneId: string): Promise<void> {
  const res = await fetch(`${this.env.PAGES_ORIGIN}/api/office/_internal/zones/${zoneId}`, {
    method: 'DELETE',
    headers: { 'x-office-sync': this.env.OFFICE_SYNC_SECRET },
  })
  if (!res.ok) {
    console.error('[office-room] deleteAdhocZone failed', zoneId, res.status)
    return
  }
  this.zoneMeta.delete(zoneId)
  this.zoneOccupancy.delete(zoneId)
  this.broadcast({ type: 'zone:deleted', zoneId })
}
```

- [ ] **Step 4: Add 30s alarm fallback sweep**

In the existing 30s alarm handler (the one used by 1a for participant grace timeouts), append:

```ts
// Adhoc fallback sweep: any ephemeral zone with 0 occupants in our cache
for (const [zoneId, meta] of this.zoneMeta) {
  if (meta.is_ephemeral) {
    const occupants = this.zoneOccupancy.get(zoneId)
    if (!occupants || occupants.size === 0) {
      await this.deleteAdhocZone(zoneId)
    }
  }
}
```

- [ ] **Step 5: Ensure `PAGES_ORIGIN` env is present**

If not already, add `PAGES_ORIGIN` to the worker's `wrangler.toml` env config (it points at the deployed Pages URL — already used by Phase 1c.1 if `_internal/*` is called from the DO; verify and reuse the same env var).

- [ ] **Step 6: Type-check the worker**

```bash
pnpm exec tsc --noEmit -p workers/office-room/tsconfig.json
```

Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
git add workers/office-room/src/OfficeRoom.ts
git commit -m "feat(office): wire knock-person dispatch + ad-hoc lifecycle in OfficeRoom DO"
```

---

## Task 11: `useOfficeKnocks.sendPersonKnock` — TDD

**Files:**
- Modify: `app/composables/useOfficeKnocks.ts`
- Modify: `test/app/composables/useOfficeKnocks.test.ts`

- [ ] **Step 1: Write the failing test**

In `test/app/composables/useOfficeKnocks.test.ts`, add:

```ts
describe('sendPersonKnock', () => {
  it('emits knock:request-person with a fresh knockId', () => {
    const sent: any[] = []
    const knocks = useOfficeKnocks({ send: (m) => sent.push(m) })

    knocks.sendPersonKnock('user:target')

    expect(sent).toHaveLength(1)
    expect(sent[0].type).toBe('knock:request-person')
    expect(sent[0].targetHandle).toBe('user:target')
    expect(sent[0].knockId).toMatch(/^k_[a-z0-9]+$/i)
    expect(knocks.pendingKnock.value?.knockId).toBe(sent[0].knockId)
  })

  it('cancelKnock works for a person knock', () => {
    const sent: any[] = []
    const knocks = useOfficeKnocks({ send: (m) => sent.push(m) })

    knocks.sendPersonKnock('user:target')
    sent.length = 0
    knocks.cancelKnock()

    expect(sent[0].type).toBe('knock:cancel')
    expect(knocks.pendingKnock.value).toBeNull()
  })
})

describe('onResult — new statuses from 1c.0', () => {
  it('clears pending and returns offline status', () => {
    const knocks = useOfficeKnocks({ send: () => {} })
    knocks.sendPersonKnock('user:target')
    const pendingId = knocks.pendingKnock.value!.knockId

    const res = knocks.onResult({ knockId: pendingId, status: 'offline' })

    expect(res.status).toBe('offline')
    expect(knocks.pendingKnock.value).toBeNull()
  })

  it('returns open-room with targetZoneId', () => {
    const knocks = useOfficeKnocks({ send: () => {} })
    knocks.sendPersonKnock('user:target')
    const pendingId = knocks.pendingKnock.value!.knockId

    const res = knocks.onResult({
      knockId: pendingId,
      status: 'open-room',
      targetZoneId: 'meeting-1',
    } as any)

    expect(res.status).toBe('open-room')
    expect(res.targetZoneId).toBe('meeting-1')
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

```bash
pnpm test -- test/app/composables/useOfficeKnocks.test.ts --run
```

Expected: 4 new tests FAIL on `sendPersonKnock is not a function` and unhandled statuses.

- [ ] **Step 3: Add `sendPersonKnock` to the composable**

In `app/composables/useOfficeKnocks.ts`, add (mirroring `sendKnock(zoneId)`):

```ts
function sendPersonKnock(targetHandle: ActorHandle): void {
  if (pendingKnock.value) return // existing single-knock-at-a-time guard from 1c.1
  const knockId = generateKnockId() // existing helper
  pendingKnock.value = { knockId, targetHandle, kind: 'person' }
  send({ type: 'knock:request-person', knockId, targetHandle })
}
```

- [ ] **Step 4: Extend `onResult` for the two new statuses**

In `onResult`, the existing `status === 'accepted'` / `'denied'` etc cases handle pending cleanup. Add explicit cases for the new statuses (they also clear pending and return a typed result so the page-level handler can toast/navigate appropriately):

```ts
case 'offline':
case 'open-room':
  pendingKnock.value = null
  return { status: msg.status, targetZoneId: msg.targetZoneId, media: null }
```

(Match the exact shape of the existing returned object.)

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm test -- test/app/composables/useOfficeKnocks.test.ts --run
```

Expected: all tests (existing 1c.1 + 4 new) PASS.

- [ ] **Step 6: Commit**

```bash
git add app/composables/useOfficeKnocks.ts test/app/composables/useOfficeKnocks.test.ts
git commit -m "feat(office): useOfficeKnocks.sendPersonKnock + offline/open-room result handling"
```

---

## Task 12: `OfficeAvatar` — emit `click` for non-self avatars

**Files:**
- Modify: `app/components/office/OfficeAvatar.vue`

- [ ] **Step 1: Add a click handler + emit**

In `app/components/office/OfficeAvatar.vue`, in the script setup section:

```ts
const props = defineProps<{
  participant: OfficeParticipant
  size?: number
  showLabel?: boolean
  isSelf?: boolean   // new — supplied by parent
  isOffline?: boolean // new — for dimmed render
}>()

const emit = defineEmits<{
  click: [participant: OfficeParticipant]
}>()

function onClick() {
  if (props.isSelf) return
  emit('click', props.participant)
}
```

- [ ] **Step 2: Wire the click to the avatar root + style as clickable**

In the template, wrap the avatar root with `@click="onClick"` and add hover styling for non-self avatars:

```vue
<div
  @click="onClick"
  :class="[
    'group inline-flex flex-col items-center',
    !isSelf && 'cursor-pointer hover:scale-110 transition-transform',
    isOffline && 'opacity-40',
  ]"
>
  <!-- existing avatar render -->
</div>
```

Add a small `UTooltip` (or title attr) wrapping it for non-self with text `"Knock {{ participant.name }}"`.

- [ ] **Step 3: Type-check + visual sanity**

```bash
pnpm exec nuxi typecheck 2>&1 | grep -i "officeavatar" || echo "no avatar errors"
```

Visually: hover an avatar in dev — cursor changes, scale animates on hover.

- [ ] **Step 4: Commit**

```bash
git add app/components/office/OfficeAvatar.vue
git commit -m "feat(office): avatar click emits for non-self; isOffline dim variant"
```

---

## Task 13: `OfficeFloorPlan` — render desks, ad-hoc bubbles, Unassigned rail

**Files:**
- Modify: `app/components/office/OfficeFloorPlan.vue`

- [ ] **Step 1: Accept `members` prop**

Add to the `defineProps`:

```ts
const props = defineProps<{
  office: OfficeRow
  zones: OfficeZoneRow[]
  members: OfficeMember[]   // new
  participants: Map<ActorHandle, OfficeParticipant>
  zoneOccupancy: Record<string, ActorHandle[]>
  currentUserZoneId?: string | null
}>()

const emit = defineEmits<{
  enterZone: [zoneId: string]
  knock: [args: { zoneId: string; zoneName: string; occupantNames: string[] }]
  knockPerson: [participant: OfficeParticipant]
}>()
```

- [ ] **Step 2: Compute desk-occupancy view model**

Add a computed `deskZones` and `nonDeskZones`, and an `unassignedParticipants` list:

```ts
const deskZones = computed(() => props.zones.filter(z => z.zone_type === 'desk'))
const adhocZones = computed(() => props.zones.filter(z => z.zone_type === 'adhoc'))
const roomZones = computed(() => props.zones.filter(
  z => z.zone_type !== 'desk' && z.zone_type !== 'adhoc'
))

// Phase 1a added parseActorHandle / toActorHandle in app/types/office.ts.
// Use it instead of inventing a participant.userId field.
import { parseActorHandle, toActorHandle } from '~~/app/types/office'

function userIdOfParticipant(p: OfficeParticipant): string | null {
  const parsed = parseActorHandle(p.handle)
  return parsed.kind === 'user' ? parsed.id : null
}

function avatarForDesk(deskZoneId: string) {
  const member = props.members.find(m => m.deskZoneId === deskZoneId)
  if (!member) return null
  // Live participant for this user takes precedence (they may have wandered)
  for (const p of props.participants.values()) {
    if (userIdOfParticipant(p) === member.userId) {
      return { participant: p, isOffline: false }
    }
  }
  // Render the dimmed offline placeholder using member metadata
  return {
    participant: {
      handle: toActorHandle({ kind: 'user', id: member.userId }),
      name: member.name,
      avatarUrl: member.avatarUrl,
      // lastSeenAt is metadata, not part of OfficeParticipant; pass via a
      // sibling prop on OfficeAvatar if you want to show "Active 2h ago"
    } as OfficeParticipant,
    isOffline: true,
  }
}

const unassignedParticipants = computed(() => {
  // Live participants whose user has no desk and isn't in a zone
  const inZone = new Set<ActorHandle>()
  for (const list of Object.values(props.zoneOccupancy)) {
    for (const h of list) inZone.add(h)
  }
  const haveDeskUserIds = new Set(
    props.members.filter(m => m.deskZoneId).map(m => m.userId)
  )
  return Array.from(props.participants.values())
    .filter(p => !inZone.has(p.handle))
    .filter(p => {
      const uid = userIdOfParticipant(p)
      return uid === null || !haveDeskUserIds.has(uid)
    })
})
```

- [ ] **Step 3: Render desks**

Inside the floor surface, after the existing zone loop, add:

```vue
<!-- Desks: 1-capacity zones with an assigned user -->
<div
  v-for="desk in deskZones"
  :key="desk.id"
  class="absolute"
  :style="{ left: desk.x + 'px', top: desk.y + 'px', width: desk.width + 'px', height: desk.height + 'px' }"
>
  <OfficeAvatar
    v-if="avatarForDesk(desk.id)"
    :participant="avatarForDesk(desk.id)!.participant"
    :is-offline="avatarForDesk(desk.id)!.isOffline"
    :is-self="isSelfHandle(avatarForDesk(desk.id)!.participant.handle)"
    :size="38"
    show-label
    @click="emit('knockPerson', $event)"
  />
</div>
```

`isSelfHandle()` is a small local helper — get the current user via whichever auth composable `app/pages/office.vue` already uses for `OfficeStatusPicker` (grep for `requireAuth`/`useAuth`/`useState('user')` patterns in the project) and build its handle once via `toActorHandle({ kind: 'user', id })`. Compare against the incoming handle.

- [ ] **Step 4: Render ad-hoc bubbles**

```vue
<!-- Ad-hoc rooms — soft bubble anchored above the host's desk -->
<div
  v-for="adhoc in adhocZones"
  :key="adhoc.id"
  class="absolute rounded-full backdrop-blur-md bg-white/[0.08] ring-1 ring-emerald-400/30
         shadow-[0_0_20px_rgba(52,211,153,0.25)] flex items-center justify-center gap-1
         cursor-pointer hover:bg-white/[0.12] transition"
  :style="{ left: adhoc.x + 'px', top: adhoc.y + 'px', width: adhoc.width + 'px', height: adhoc.height + 'px' }"
  @click="onAdhocClick(adhoc)"
>
  <OfficeAvatar
    v-for="p in occupantsOf(adhoc.id).slice(0, 4)"
    :key="p.handle"
    :participant="p"
    :size="28"
  />
  <span
    v-if="occupantsOf(adhoc.id).length > 4"
    class="text-[10px] text-white/60 px-1"
  >
    +{{ occupantsOf(adhoc.id).length - 4 }}
  </span>
</div>
```

And the click handler:

```ts
function onAdhocClick(adhoc: OfficeZoneRow) {
  // If the user is already in this zone, no-op (they're in the meeting)
  if (props.currentUserZoneId === adhoc.id) return

  // Adhocs are always knockable when occupied (≥1) — emit the same
  // `knock` event the parent handles for focus/private rooms
  const occupants = occupantsOf(adhoc.id)
  emit('knock', {
    zoneId: adhoc.id,
    zoneName: 'Discussion',
    occupantNames: occupants.map(o => o.name),
  })
}
```

- [ ] **Step 5: Remove the old "Around" sidebar; add the "Unassigned" rail**

Delete the existing `<div v-if="lobbyOccupants.length">…Around…</div>` block. Replace with:

```vue
<!-- Unassigned: live participants who don't yet have a desk -->
<div
  v-if="unassignedParticipants.length"
  class="absolute top-4 left-1/2 -translate-x-1/2 max-w-[420px] backdrop-blur-xl
         bg-white/[0.04] ring-1 ring-white/[0.08] rounded-xl px-3 py-2 shadow-2xl"
>
  <div class="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40 mb-1.5">
    Unassigned · {{ unassignedParticipants.length }}
  </div>
  <div class="flex flex-wrap gap-2">
    <OfficeAvatar
      v-for="p in unassignedParticipants.slice(0, 5)"
      :key="p.handle"
      :participant="p"
      :size="30"
      show-label
      @click="emit('knockPerson', $event)"
    />
    <div
      v-if="unassignedParticipants.length > 5"
      class="text-xs text-white/40 self-center pl-1"
    >
      +{{ unassignedParticipants.length - 5 }}
    </div>
  </div>
</div>
```

- [ ] **Step 6: Keep the existing room-zone render**

Make sure the existing `<OfficeZone v-for="zone in zones">` loop now iterates `roomZones` instead of `zones`. Desks and adhocs render via the new blocks above; rooms keep their existing path.

- [ ] **Step 7: Manual visual check**

`pnpm dev` → `/office` → expected: every team member visible at a desk (online bright, offline dimmed); empty floor still feels populated.

- [ ] **Step 8: Commit**

```bash
git add app/components/office/OfficeFloorPlan.vue
git commit -m "feat(office): floor plan renders desks, ad-hoc bubbles, Unassigned rail"
```

---

## Task 14: `OfficeZone` — render variants for desk + adhoc

**Note:** Task 13 renders desks and adhocs directly in the floor plan (not via `OfficeZone`), so OfficeZone may not need changes for the rendering path. The only change needed: if any existing code in `OfficeZone.vue` assumes all zones are rooms, gate that code out for `zone_type === 'desk' || zone_type === 'adhoc'`.

**Files:**
- Modify: `app/components/office/OfficeZone.vue`

- [ ] **Step 1: Read the current file**

Open `app/components/office/OfficeZone.vue`. If it renders unconditionally (e.g., always shows the room label + occupant grid), wrap the relevant template blocks with `v-if="!isDeskOrAdhoc"`.

- [ ] **Step 2: Add an early return for desk/adhoc**

```ts
const isDeskOrAdhoc = computed(() =>
  props.zone.zone_type === 'desk' || props.zone.zone_type === 'adhoc'
)
```

Template:

```vue
<template>
  <!-- Desks and adhocs render via OfficeFloorPlan directly; nothing to draw here. -->
  <template v-if="isDeskOrAdhoc"></template>

  <!-- Existing room render path -->
  <div v-else>...</div>
</template>
```

- [ ] **Step 3: Verify no regressions on room rendering**

Visual: open `/office`, click a Meeting Room — still works as before.

- [ ] **Step 4: Commit**

```bash
git add app/components/office/OfficeZone.vue
git commit -m "feat(office): OfficeZone no-op for desk/adhoc; floor plan renders them"
```

---

## Task 15: `office.vue` — wire knock-person + new result statuses

**Files:**
- Modify: `app/pages/office.vue`

- [ ] **Step 1: Pass `members` to the floor plan + handle `@knock-person`**

Extend the GET-detail fetch typing to include `members`. Pass it through and handle the new emit:

```vue
<OfficeFloorPlan
  :office="detail.office"
  :zones="detail.zones"
  :members="detail.members"
  :participants="connection.participants.value"
  :zone-occupancy="connection.zoneOccupancy.value"
  :current-user-zone-id="connection.currentZoneId.value"
  @enter-zone="enterZone"
  @knock="onKnockableClick"
  @knock-person="onKnockPersonClick"
/>
```

- [ ] **Step 2: Add the `onKnockPersonClick` handler**

```ts
function onKnockPersonClick(participant: OfficeParticipant) {
  // Same waiting-toast pattern as zone-knock — surface immediate feedback,
  // then let onResult drive the final state.
  knocks.sendPersonKnock(participant.handle)
  const waitingToast = toast.add({
    title: `Knocking on ${participant.name}…`,
    description: 'Waiting for response (30s)',
    color: 'info',
    duration: 30_000,
    actions: [{ label: 'Cancel', onClick: () => knocks.cancelKnock() }],
  })
  const stopWatcher = watch(
    () => knocks.pendingKnock.value,
    (v) => {
      if (!v) {
        toast.remove(waitingToast.id)
        stopWatcher()
      }
    },
  )
}
```

- [ ] **Step 3: Extend the `knock:result` handler for the two new statuses**

Find the existing `else if (result.status === '...')` chain in the `onMessage` callback. Add:

```ts
} else if (result.status === 'offline') {
  toast.add({
    title: 'Offline',
    description: 'They\'re not in the office right now — try Slack.',
    color: 'warning'
  })
} else if (result.status === 'open-room') {
  // They're in an open room — silently walk in
  if (result.targetZoneId) {
    connection.enterZone(result.targetZoneId)
  }
}
```

- [ ] **Step 4: Confirm the `v-if` from Task 1 is still in place**

The `<OfficeRoomPanel v-if="roomPanelOpen" ...>` from Task 1 must remain. If a merge has stripped it, re-add.

- [ ] **Step 5: Type-check + visual smoke**

```bash
pnpm exec nuxi typecheck 2>&1 | grep -i "office.vue" || echo "no errors"
```

- [ ] **Step 6: Commit**

```bash
git add app/pages/office.vue
git commit -m "feat(office): wire knock-person + offline/open-room handling on /office"
```

---

## Task 16: UAT walkthrough document

**Files:**
- Create: `docs/superpowers/uat/2026-05-24-virtual-office-phase-1c-0-uat.md`

- [ ] **Step 1: Write the UAT doc**

Create `docs/superpowers/uat/2026-05-24-virtual-office-phase-1c-0-uat.md`:

```markdown
# Virtual Office — Phase 1c.0 UAT

**Date:** 2026-05-24
**Tester:** paul@adme.net.au
**Build under test:** preview deploy of branch `feat/virtual-office-1b-media` (or whichever branch carries Phase 1c.0)

Walk every section. Mark each as ✅ / ❌ / ⚠️ (with a note).

## 1. Cold-load camera prompt — must NOT fire

- [ ] Open `/office` in a fresh browser profile (or after clearing site permissions in dev tools).
- [ ] Observe: NO mic / camera permission prompt appears on initial page load.
- [ ] Console: no `NotAllowedError` or `getUserMedia` lines emitted before user interaction.

## 2. Mic prompt only on zone-enter; camera prompt only on click

- [ ] Click into the Lobby.
- [ ] Observe: mic permission prompt appears (because `initialAudio: true`). Grant it.
- [ ] Camera is OFF by default in the room controls.
- [ ] Click the camera toggle button.
- [ ] Observe: camera permission prompt appears now. Grant it. Camera turns on.

## 3. All team members visible on the floor plan

- [ ] Look at the floor plan — every member of the office is visible at a desk, even offline ones.
- [ ] Offline members render with dimmed avatars (low opacity, no green ring).
- [ ] Online members render bright.
- [ ] If a member is in a meeting room, their avatar is inside that room — their desk is empty until they leave.

## 4. Click an offline avatar → friendly toast

- [ ] Click any offline (dimmed) avatar.
- [ ] Toast: "Offline — they're not in the office right now — try Slack."
- [ ] No knock modal opens.

## 5. Knock-on-person → ad-hoc bubble forms

Two-browser scenario. A = host (you), B = a second authenticated session.
- [ ] B opens `/office` from a second browser, leaves their avatar at their desk.
- [ ] A clicks B's avatar.
- [ ] Toast: "Knocking on [B]… Waiting for response (30s)". A's screen shows the waiting toast with a Cancel button.
- [ ] B's screen: incoming knock modal — "[A] wants to talk to you" + sound.
- [ ] B clicks Accept.
- [ ] Both A and B now in an ad-hoc bubble visible at B's desk on the floor plan. The room panel opens for both with audio (no auto-video).

## 6. Third user knocks the ad-hoc

- [ ] A third browser session C opens `/office`.
- [ ] C sees the ad-hoc bubble at B's desk with A's and B's avatars in it.
- [ ] C clicks the bubble. Confirm modal appears ("Knock on [A, B]?").
- [ ] C confirms. A and B see an incoming knock from C; one of them accepts.
- [ ] C joins the bubble. Now 3 avatars in the bubble.

## 7. Last person leaves → bubble disappears

- [ ] All occupants leave the ad-hoc (close the room panel).
- [ ] Within ~1s (or up to 30s in the alarm-fallback path), the bubble disappears from the floor plan for all observers.

## 8. New member added → desk appears on next page load

- [ ] Via the admin API or the upcoming admin UI, add a new staff member to the office.
- [ ] Reload `/office`.
- [ ] The new member's desk appears in the desks grid with their name. They render offline (dimmed) until they connect.

## Notes

(Capture anything weird, screenshots welcome.)
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/uat/2026-05-24-virtual-office-phase-1c-0-uat.md
git commit -m "docs(office): Phase 1c.0 UAT walkthrough"
```

---

## Final verification

- [ ] Run the full test suite:
  ```bash
  pnpm test --run
  ```
  Expected: all Phase 1a + 1b' + 1c.1 + 1c.0 tests pass; no regressions.

- [ ] Run typecheck:
  ```bash
  pnpm exec nuxi typecheck 2>&1 | wc -l
  ```
  Expected: same line count as the baseline before this phase (no NEW errors).

- [ ] Deploy to preview and walk the UAT doc above.

- [ ] When UAT is green: push, then either merge into the existing PR #11 or open a new PR `Phase 1c.0 — populate the office` per the project's branching policy.

---

## Out-of-scope follow-up PRs (see spec §11)

1. **Admin Members UI** — own PR. New page `app/pages/agency/office/admin.vue` calling existing `POST /api/office/[id]/members`. Roughly 3-4h. Independent of this phase.
2. **Phase 1c-04..08** — proceed per the PRD on top of 1c.0.
