# Virtual Office — Phase 1c.0 (Populate the Office) Design Spec

**Date:** 2026-05-24
**Owner:** paul@adme.net.au
**Branch (proposed):** `feat/virtual-office-1c-0-populate` (cut from `feat/virtual-office-1b-media` after PR #11 merges, or from `main` if 1b-media lands first)
**Companion docs:**
- PRD: `docs/superpowers/prds/2026-05-23-virtual-office-functional-roadmap.md`
- Phase 1c.1 spec: `docs/superpowers/specs/2026-05-23-virtual-office-phase-1c-1-audio-first-dropin-design.md`
- Foundation spec: `docs/superpowers/specs/2026-05-22-virtual-office-foundation-design.md`

---

## 1. Why this phase exists

The deployed office page at `https://agency-dashboard-6cm.pages.dev/office` exhibits three live problems that together make the office feel empty and broken:

1. **Camera permission prompt fires on initial page load**, before the user has clicked anything.
2. **Only currently-connected staff render anywhere on the page** — there is no team roster, no offline indicator, no sense of who else exists in the office.
3. **There is no discoverable way to start a session with another person.** The user is alone, no one else is visible, and even if someone else were online the only affordance is to click into an empty room and hope they walk in.

The Phase 1c roadmap covers (1c-04..08) zone-level features — chat, notes, reactions, admin editor. None of them solve the *populated office* problem. Without solving that first, the rest of 1c is wasted: nobody will use in-zone chat in an office that always feels empty.

This phase fixes the three problems above with the smallest surface-area additions that move the product to a recognisably ro.am-like baseline.

## 2. Goals

- Logging into `/office` does not trigger a camera permission prompt.
- Every member of the office is visible on the floor plan at all times, with clear online/offline/in-meeting state.
- Clicking any avatar lets you start a conversation with that person via the existing Phase 1c.1 knock protocol.
- An ad-hoc meeting that results from a knock is itself visible on the map so others can knock into it.
- All four changes ship in a single PR ≤ ~800 LoC diff (excluding tests).

## 3. Non-goals

- **Admin members UI** — splits into its own tiny follow-up PR (see §11). The endpoints already exist; only a small admin page is missing. Out of scope here because it has no shared design surface with desks/knock-on-person.
- **Neighbourhood grouping of desks** (engineering/design/ops sections). Single generic "Desks" grid in v1; admin floor-plan editor (1c-08) gets drag-to-rearrange later.
- **Pre-join modal** ("Google Meet"-style "enable mic/cam before joining"). Defaults are good enough for an internal tool used daily by the same 20 people.
- **In-zone chat, reactions, notes** (1c-04..07). Independent vertical slices; ship after 1c.0.
- **Anything from 1d** (client portal entry) or 1e (differentiators).

## 4. Design decisions (locked during brainstorming 2026-05-24)

| # | Decision | Alternative considered | Rationale |
|---|---|---|---|
| D1 | **Spatial model:** fixed desks on the floor plan. Every member has a 1-capacity `zone_type='desk'` zone. | Sidebar roster; horizontal avatar dock. | Matches ro.am's "presence on the map" thesis (the PRD's whole positioning). Solves the discoverability problem by making everyone visible at all times. Cleanly slots into existing `office_zones` schema. |
| D2 | **Knock-on-person target semantics:** spawn a transient `zone_type='adhoc'` near the knockee's current spot, move both into it, auto-delete on empty. Render visually as a cluster at the host's desk. | In-place at the desk (breaks capacity); nearest free meeting room (artificial). | Reuses Phase 1c.1's "server-side move into target zone" machinery verbatim. Naturally supports the "see a discussion you want in on" second affordance from the ro.am page. Scales to 3+ people without special casing. |
| D3 | **Desk allocation:** auto-assigned into a single generic "Desks" grid on member-add. Admin can drag-rearrange later via the future 1c-08 admin floor-plan editor. | Admin-configured neighbourhoods; user-picks-own-desk. | Zero onboarding friction; ships in days instead of weeks. Data model (`assigned_user_id` on a `desk` zone) is identical to the neighbourhood version — no rework needed when 1c-08 lands. |
| D4 | **Camera prompt fix:** add `v-if` on `OfficeRoomPanel` *and* flip `useMediaDevices` defaults to `initialAudio: true, initialVideo: false`. | `v-if` only; pre-join modal. | The bug is "camera turned on without consent" — the fix is "don't turn on the camera by default." Matches the PRD's audio-first thesis and the 1c.1 focus-room preset choice. |

---

## 5. Architecture overview

```
                           ┌───────────────────────────────┐
                           │  /office (Nuxt page)          │
                           │                               │
                           │  - useFetch('/api/office/X')  │ ← now returns members + desks + zones
                           │  - useOfficeConnection (WS)   │
                           │  - useOfficeKnocks            │ ← extended to support person target
                           └──────────┬────────────────────┘
                                      │ render
                                      ▼
                ┌─────────────────────────────────────────────┐
                │  OfficeFloorPlan.vue                        │
                │                                             │
                │  - renders zones (existing)                 │
                │  - renders desks as 1-capacity zones (new)  │
                │  - renders adhoc zones as bubbles (new)     │
                │  - emits `enter-zone`, `knock` (existing)   │
                │  - emits `knock-person` (new)               │
                └─────────────────────────────────────────────┘
                                      ▲ avatar click intercept
                                      │
                ┌─────────────────────────────────────────────┐
                │  OfficeAvatar.vue                           │
                │                                             │
                │  - click on a NON-self avatar bubbles a     │
                │    knock-person request up via emit         │
                └─────────────────────────────────────────────┘
                                      │ WS
                                      ▼
                ┌─────────────────────────────────────────────┐
                │  OfficeRoom DO (worker)                     │
                │                                             │
                │  - new WS message: knock:request-person     │
                │  - resolves target's current zone:          │
                │      desk      → spawn adhoc, run 1c.1 flow │
                │      knockable → run 1c.1 flow directly     │
                │      open zone → reject with hint "join     │
                │                   their room directly"      │
                │      offline   → reject "X is offline"      │
                │  - lifecycle: adhoc zones auto-deleted by   │
                │    DO when occupancy hits 0 (cleanup tick)  │
                └─────────────────────────────────────────────┘
```

## 6. Data model (migration 101)

```sql
-- 101-virtual-office-desks-and-adhoc.sql

-- Step 1: extend zone_type enum
ALTER TYPE office_zone_type ADD VALUE IF NOT EXISTS 'desk';
ALTER TYPE office_zone_type ADD VALUE IF NOT EXISTS 'adhoc';

-- Step 2: add assignment columns on office_zones
ALTER TABLE office_zones
  ADD COLUMN IF NOT EXISTS assigned_user_id UUID
    REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_ephemeral BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS anchor_zone_id UUID
    REFERENCES office_zones(id) ON DELETE CASCADE;

-- assigned_user_id: only set on desk zones; uniqueness enforced per office
-- is_ephemeral: true for adhoc zones — DO auto-deletes when occupancy=0
-- anchor_zone_id: for adhoc zones, points at the desk the bubble visually
--   sits next to. Allows the client to render the cluster correctly.

-- Step 3: uniqueness — one desk per user per office
CREATE UNIQUE INDEX IF NOT EXISTS office_zones_desk_assignment_unique
  ON office_zones (office_id, assigned_user_id)
  WHERE zone_type = 'desk' AND assigned_user_id IS NOT NULL;

-- Step 4: cleanup index for ephemeral zones (DO compaction)
CREATE INDEX IF NOT EXISTS office_zones_ephemeral_idx
  ON office_zones (office_id, is_ephemeral)
  WHERE is_ephemeral = TRUE;

-- Step 5: backfill happens lazily in app code, not in the migration.
-- On first GET of /api/office/[officeId], the endpoint checks for any
-- office member without an allocated desk and calls allocateDesk() for
-- each. Idempotent: subsequent GETs are no-ops once everyone has a desk.
-- This keeps the migration purely additive (safe to re-run) and avoids
-- coupling schema deploys to data writes.
```

**Allocation algorithm** (run server-side on member-add or backfill):

```
function allocateDesk(officeId, userId) {
  // Find the next free (col, row) in a grid starting at y = (max zone bottom + 40)
  // Grid: 8 columns wide, desk size 80x60 with 16px gaps, rows extend downward.
  // INSERT INTO office_zones (office_id, name, zone_type, capacity, x, y,
  //                           width, height, assigned_user_id, cf_preset_default)
  // VALUES ($1, $userName + "'s desk", 'desk', 1, $col*96, $row*76 + offset,
  //         80, 60, $userId, NULL);  -- no media preset; desks don't run meetings
}
```

**No new tables** — desks and adhoc rooms are just additional rows in `office_zones`.

## 7. Server changes (worker DO + Nitro)

### 7.1 New WS message: `knock:request-person`

Client → DO:
```ts
{ type: 'knock:request-person', targetHandle: ActorHandle, knockId: string }
```

DO resolution logic (added to `workers/office-room/src/handlers.ts`):

```
applyKnockRequestPerson(state, msg, knockerHandle) {
  const targetZone = state.zoneByOccupant.get(msg.targetHandle)

  if (!targetZone) {
    return { type: 'knock:result', knockId, status: 'offline' }
  }

  switch (targetZone.zone_type) {
    case 'desk':
      // Spawn an adhoc anchored at this desk, move both in.
      // Reuse the existing 1c.1 knock flow with targetZoneId = newAdhocId
      const adhocId = createAdhocZone(state, anchorZoneId: targetZone.id)
      return delegateToZoneKnock(state, knockerHandle, targetZoneHandle,
                                  adhocId, knockId)

    case 'focus':
    case 'private':
      // Existing 1c.1 path — knock the zone they're in
      return delegateToZoneKnock(state, knockerHandle, targetHandle,
                                  targetZone.id, knockId)

    case 'meeting':
    case 'lobby':
      // Open zones — no knock needed, just join them.
      // Tell the client to enter directly.
      return { type: 'knock:result', knockId, status: 'open-room',
               targetZoneId: targetZone.id }

    case 'adhoc':
      // They're in someone else's adhoc — knock that adhoc room itself.
      return delegateToZoneKnock(state, knockerHandle, targetHandle,
                                  targetZone.id, knockId)
  }
}
```

**Result statuses** (extends 1c.1's `KnockResultStatus` union):
- existing: `accepted`, `denied`, `timeout`, `busy`, `no-occupant`, `not-knockable`, `self-knock`
- new: `offline`, `open-room`

### 7.2 Adhoc zone lifecycle

**Creation** (synchronous, inside the DO):
1. `INSERT INTO office_zones` via internal HTTP to Pages (existing `_internal/zones` pattern, extended with a POST endpoint), OR — preferred — direct via DO's own DB binding if one exists. *Verify during planning which path the foundation uses.*
2. Cache the new zone in `state.zoneMeta` map.
3. Position: `x = anchor_desk.x`, `y = anchor_desk.y - 80` (just above the desk). Width 120, height 80. Capacity 8 (server enforces — 9th joiner gets `not-knockable`/`busy`; client UI surfaces the knockable indicator once occupancy ≥ 2).
4. Name: blank — adhoc rooms render as bubbles, no label.
5. `cf_preset_default = 'staff_full'` (same as meeting rooms — audio + video on entry).

**Deletion** (on DO `participant:left` event):
1. After participant leaves, if `zone.is_ephemeral && occupancyOf(zoneId) === 0`:
2. `DELETE FROM office_zones WHERE id = $1 AND is_ephemeral = true`
3. Remove from `state.zoneMeta`
4. Broadcast `zone:deleted` to all participants so floor plan re-renders without the bubble.

**Crash safety:** if the DO restarts mid-meeting, the adhoc zone row outlives the restart (good — meeting continues). If everyone disconnects without a graceful leave, the next `participant:left` for any participant in that zone triggers the same check; if all participants are already gone, a periodic cleanup tick (existing 30s alarm) sweeps any `is_ephemeral=true` zone with occupancy 0 in `state.zoneMeta`.

### 7.3 New Nitro endpoint: `POST /api/office/[officeId]/desks/allocate`

Internal — called from `members.post.ts` after successful member-add to allocate a desk. Body: `{ userId }`. Returns the new zone row. Idempotent: if the user already has a desk in this office, returns the existing one.

Also called from the backfill script in the same deploy (allocates desks for all existing members).

### 7.4 Extended `/api/office/[officeId]/index.get.ts`

Currently returns `{ office, zones, myRole }`. Extend to also return:
```ts
members: Array<{
  userId: string
  name: string
  avatarUrl: string | null
  role: string  // existing office_member.role
  deskZoneId: string | null  // null if desk not yet allocated (race window)
  lastSeenAt: string | null  // for offline rendering
}>
```

`lastSeenAt` comes from `user_chat_status` (already populated by 1a's status write-through). Used by the floor plan to show "Active 2h ago" tooltips on offline avatars.

## 8. Client changes

### 8.1 `app/pages/office.vue`

- Accept `members` from the detail fetch; pass into `OfficeFloorPlan`.
- Wire a new `@knock-person` emit from the floor plan → calls `knocks.sendPersonKnock(targetHandle)` (new method on `useOfficeKnocks`).
- Handle new result statuses:
  - `offline` → toast "X is offline — try Slack"
  - `open-room` → directly call `connection.enterZone(targetZoneId)` (silently walk in)
- **Add `v-if="roomPanelOpen"` to `<OfficeRoomPanel>`** (the camera-prompt fix).

### 8.2 `app/components/office/OfficeFloorPlan.vue`

- Render desk zones with `OfficeAvatar` placed in the desk's `(x, y)`.
- If `assigned_user_id` matches an offline member (member exists, no live participant), render the avatar dimmed (opacity 0.4, no green ring, "Active Xh ago" tooltip).
- If a desk has both an assigned offline avatar *and* a live participant who's wandered into it (shouldn't happen, but defensive): live participant wins, offline placeholder hidden.
- Render adhoc zones as soft circular bubbles anchored above their `anchor_zone_id`. Show occupant avatars overlapping (max 4 visible + "+N" badge). Click → knock (reusing 1c.1 zone-knock flow, since adhocs are knockable).
- Remove "Around" sidebar — its function is now subsumed by the floor itself. (Edge case: a live participant who has no allocated desk yet — narrow race window between member-add and the next page load that runs lazy backfill — renders in a small "Unassigned" rail at the top of the map. Capped at 5 visible + "+N" badge. Should be empty in steady state.)

### 8.3 `app/components/office/OfficeAvatar.vue`

- Add `@click` emit that bubbles up `{ handle, name, currentZoneType }`.
- Click on self → no-op.
- Click on others → emit `knock-person` (handled by floor plan, then page).
- Add a small "Knock" tooltip on hover for non-self avatars.
- Offline avatars: click still allowed, but the page-level handler short-circuits with the "offline" toast immediately (no round trip).

### 8.4 `app/composables/useOfficeKnocks.ts`

Add `sendPersonKnock(targetHandle: ActorHandle): void`. Mirrors `sendKnock(zoneId)` shape — generates knockId, sends `knock:request-person`, sets `pendingKnock`. Same waiting toast, same result handling.

The `onResult` handler is extended for the two new statuses but otherwise unchanged.

### 8.5 `app/components/office/OfficeRoomPanel.client.vue`

Two-line change:
```diff
- } = useMediaDevices({ initialAudio: true, initialVideo: true })
+ } = useMediaDevices({ initialAudio: true, initialVideo: false })
```

Combined with the `v-if` on the parent (§8.1), this fixes the camera prompt bug. No other changes to this file.

## 9. Error handling

- **Desk allocation failure on member-add** (e.g. DB transient): log + return success on member-add (the user IS added; their desk shows up on the next office page load via backfill on first GET). Don't fail the whole add.
- **Adhoc zone creation race** (two knocks land on the same DO tick targeting the same desk): the second one sees `state.zoneMeta` already has an adhoc anchored to that desk and joins it. Knock-on-person becomes idempotent per anchor desk for ~30s.
- **Adhoc cleanup race** (last participant leaves; DO restart between the leave event and the DELETE): periodic 30s alarm sweeps. Worst case: a phantom empty adhoc lives for 30s before disappearing.
- **Knocking an offline member**: server returns `offline` status before any work; client toasts immediately. No knock state to clean up.
- **Knocking someone in an open zone (meeting/lobby)**: server returns `open-room` status with the zone ID; client treats it as "just enter the room" — no knock modal, no waiting toast. Subtle but correct: there's no privacy to respect, you can just walk in.

## 10. Testing strategy

**Unit (vitest, follow 1c.1 conventions):**
- `applyKnockRequestPerson` handler — 7 cases (desk, focus, meeting, lobby, adhoc, offline, self).
- Adhoc cleanup — `participantLeft` triggers DELETE when occupancy hits 0, no-op otherwise.
- Desk allocation — generates the right `(x, y)` for the next free slot; idempotent on re-call.
- `useOfficeKnocks.sendPersonKnock` — generates correct WS payload.

**Integration:**
- `members.post.ts` + desk allocation: add a member → assert a `desk` row exists with `assigned_user_id`.
- DO smoke: two browsers, A knocks B (at desk), B accepts, both end up in an adhoc whose `anchor_zone_id` is B's desk.

**UAT walkthrough doc:** `docs/superpowers/uat/2026-05-24-virtual-office-phase-1c-0-uat.md` covers:
1. Cold load → no camera prompt
2. Camera prompt only after entering a Meeting Room
3. Camera button defaults to OFF, mic ON
4. All team members visible on map (online + offline)
5. Click offline avatar → "offline" toast
6. Click online avatar at their desk → knock confirm modal → knockee gets incoming → accept → both in adhoc bubble at host's desk
7. Third user knocks the visible adhoc bubble → joins
8. Last person leaves adhoc → bubble disappears from map

## 11. Out-of-scope follow-ups (separate PRs)

- **Admin Members UI** — `app/pages/agency/office/admin.vue` with a `UTable` of office members + `UButton "Add"` opening a `USelectMenu` of agency staff. Calls existing `POST /api/office/[id]/members`. ~3-4h. No dependency on this phase; can ship in parallel.
- **Phase 1c-04..08** — proceeds as the PRD specifies, on top of 1c.0.
- **Neighbourhood grouping of desks** — folded into 1c-08 admin floor-plan editor.

## 12. Open questions / risks

| # | Question | Resolution path |
|---|---|---|
| OQ-1 | Can the DO write to Postgres directly (for adhoc INSERT/DELETE), or must it go through an internal Pages endpoint? | Verify during planning. Foundation spec mentions `_internal` endpoints — likely the answer is "internal endpoint." If so, add `POST /api/office/_internal/zones` and `DELETE /api/office/_internal/zones/[id]` mirroring the auth pattern of existing `_internal/sync-status`. |
| OQ-2 | Does an adhoc zone need a separate CF RealtimeKit meeting, or can two presets share the parent office's pool? | RealtimeKit meetings are 1:1 with `office_zones.id` per the 1b' contract. Adhocs follow the same rule — each gets its own meeting. Lazy-mint on first `zone:enter` (existing pattern). Disposal: when the zone is deleted, the meeting should be closed too — verify if CF auto-cleans or we need an API call. |
| OQ-3 | Should adhoc zones have a configurable TTL (auto-end after 60 min even if occupied)? | Defer. ro.am doesn't, and the empty-cleanup handles abandonment. Revisit if we see meetings ghost-stuck. |
| OQ-4 | How does the "wandering dock" at the top render if there are many wandering users? | Should not happen in steady state — every member has a desk. The dock is for the brief window between "user just added" and "backfill ran." Cap at 5 visible + "+N" badge. |
| OQ-5 | What happens to a user's desk if they're removed from the office? | Migration's `ON DELETE SET NULL` on `assigned_user_id` keeps the row but unassigns. Allocation algorithm reuses it for the next member-add. Alternative: DELETE the desk. Pick during planning — leans toward keeping (preserves spatial stability for everyone else). |
| OQ-6 | Phase 1c.1 already shipped a knockable-zone affordance on `OfficeZone.vue`. Do adhoc zones get the same indicator? | Yes — render the existing ear-icon indicator on adhocs with ≥1 occupant. Reuses the same component. |

## 13. Success criteria

- Loading `/office` triggers zero browser permission prompts.
- A new agency staff member added to the office shows up at a desk within the next page load with no manual setup.
- One user can knock another user from cold (no prior coordination) in ≤2 clicks (click avatar, click "Knock").
- The resulting meeting is visible to other office members on the map within 1s of the knockee accepting.
- The map feels populated even when only 1 person is online — every team member's desk is occupied (live or dimmed).
