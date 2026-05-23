# Virtual Office — Phase 1c.1 (Audio-first + Drop-in) Design

**Date:** 2026-05-23
**Owner:** paul@adme.net.au
**Status:** Approved (brainstorming complete, awaiting user review of written spec).
**Branch:** `feat/virtual-office-1b-media` (continues PR #11; 1b' still unmerged pending two-browser UAT — 1c.1 commits will bundle into the same PR per user decision to defer 1b' merge).
**Parent PRD:** `docs/superpowers/prds/2026-05-23-virtual-office-functional-roadmap.md`
**Companion docs:**
- Foundation spec: `docs/superpowers/specs/2026-05-22-virtual-office-foundation-design.md`
- Phase 1b' spec: `docs/superpowers/specs/2026-05-23-virtual-office-phase-1b-prime-design.md`
- Phase 1b plan (v2): `docs/superpowers/plans/2026-05-22-virtual-office-phase-1b-media-v2.md`

---

## 1. Goal

Deliver the PRD's "audio-first culture + drop-in pattern" thesis: focus rooms enforce audio-only at the server preset level (no surprise cameras), and a real knock signaling protocol lets one staff member request an instant audio conversation with another currently in a focus room. Auto-pull semantics on accept — the knocker joins the knockee's focus room immediately, capacity briefly auto-expands for the 1:1, conversation lives in the original focus zone.

## 2. Scope

### In scope

| Area | What ships |
|---|---|
| CF resources | One new RealtimeKit preset (`audio_only_publish`) defined on the existing app. |
| Database | Migration 100: existing focus zones updated to `cf_preset_default = 'audio_only_publish'`; INSERT trigger enforces same default on future focus zones. |
| Worker | New WS message family (5 types) handled by existing `OfficeRoom` Durable Object; in-memory knock state; 30s timeout via DO alarm; capacity-override-on-accept; auto-mint participant token with `audio_only_publish` preset on accept. |
| Client | `useOfficeKnocks` composable, two modals (`OfficeKnockConfirmModal`, `OfficeKnockIncomingModal`), knockable-room indicator on `OfficeZone.vue`, waiting/result toasts, sound effect asset. |
| Tests | Worker DO knock state lifecycle, capacity-override, timeout, busy rejection, server validation (zone_type focus/private only); client composable state machine. |
| Verification | Manual UAT walkthrough (knock happy path, decline, timeout, busy, edge cases). |

### Out of scope (deferred to next phases or never)

| Item | Phase |
|---|---|
| All-members-visible on floor plan (G1) | 1c.2 |
| Profile cards on avatar click | 1c.2 |
| Avatar-click-as-knock-initiator | 1c.2 |
| In-zone chat channels | 1c.3 |
| Floating reactions in-zone | 1c.3 |
| 3D chat overlay | 1c.3 |
| Shared notes per zone (Tiptap + optimistic concurrency) | 1c.4 |
| Admin floor-plan editor | 1c.5 |
| Guest preset, magic-link entry, lobby zone for client portal | 1d |
| DND-suppresses-knocks | 1e-02 |
| Quiet hours auto-deny | 1e-03 |
| Browser Notification API for backgrounded tabs | 1e polish |
| Per-staff branded scheduling links + embed widget for agency website (the "Ro.am-style Lobby") | **1f (new)** — see §11 |
| Magic Minutes / transcription, PWA, background blur, integration badges, whiteboard | 2 |
| Persistent missed-knock badges or knock history view | Not planned |
| Multi-channel knock notification (Slack/email/push) | Not planned |
| Knock cooldown / rate limit | Not planned (revisit if abused) |
| Transfer-this-knock-to-Meeting-Room-A flow | Not planned |
| Video upgrade during accepted knock | Not planned (audio-only is the design point) |

Explicit PRD non-goals (not in any phase): mobile native app, async screen recording, spatial audio, stadium/theater mode.

## 3. Architecture & WS protocol

Single Durable Object. Knock messages flow through the existing `OfficeRoom` DO (the same one that handles `zone:enter`/`presence:*`). No new DO, no new worker. Knock state is in-memory only — when the office isolate sleeps, pending knocks die. This matches the timeout decision (knocker gets a toast at 30s; no persistence needed).

### WS message family

| Direction | Type | Payload | Purpose |
|---|---|---|---|
| Client → DO | `knock:request` | `{ targetZoneId }` | Knocker initiates. DO validates zone is focus/private, has an occupant, and the knocker isn't already in it. |
| DO → knockee | `knock:incoming` | `{ knockId, fromHandle, fromName, zoneId }` | Knockee's client opens the accept/deny modal + plays sound. |
| Knockee → DO | `knock:accept` | `{ knockId }` | DO mints a participant token for the knocker with `audio_only_publish` preset, broadcasts the knocker into the zone. |
| Knockee → DO | `knock:deny` | `{ knockId }` | DO sends `knock:result { status: 'denied' }` to knocker, drops state. |
| Knocker → DO | `knock:cancel` | `{ knockId }` | Knocker withdraws before response. DO clears state, sends nothing further. |
| DO → knocker | `knock:result` | `{ knockId, status: 'accepted' \| 'denied' \| 'timeout' \| 'no-occupant' \| 'busy' \| 'not-knockable' \| 'self-knock', authToken? }` | Knocker's client closes the waiting indicator; if `accepted`, auto-joins the zone using the included `authToken`. |

### Server-side state

```ts
// In-memory inside the OfficeRoom DO
type KnockState = {
  knockId: string
  knockerWsId: string
  knockerHandle: ActorHandle
  knockerName: string
  knockeeWsId: string
  knockeeHandle: ActorHandle
  zoneId: string
  startedAt: number
  timeoutAlarmAt: number  // wall-clock for DO alarm
}

// Map<knockId, KnockState>
// + Map<zoneId, knockId> for fast busy-check
// + Map<wsId, Set<knockId>> for cleanup on disconnect
```

Cleared on accept, deny, timeout, cancel, knocker WS disconnect, or knockee WS disconnect.

### Auto-pull mechanics on accept

1. DO calls `mintZoneToken({ env, meetingId, handle: knocker, name, presetName: 'audio_only_publish' })` (same path 1b' uses).
2. DO broadcasts `presence:zone-change` so the floor plan updates for all observers in the office.
3. DO replies to knocker with `knock:result { status: 'accepted', authToken }`.
4. Knocker's client receives → reuses the existing `useOfficeRealtime.connect()` flow to attach `authToken` to RealtimeKit. Audio connection completes within ~2s.

### Capacity handling

Focus rooms have `capacity = 1` per seed. Knock-accept implicitly bumps effective capacity to 2 for the duration of the accepted knock. The DB `capacity` column is **not** mutated. Implementation: the DO's existing capacity check (during `zone:enter` validation) is augmented to skip the check when the joining participant matches a known knock-accept-in-progress. Once the knocker is in OR the knock state is cleared (either party leaves), normal `capacity = 1` governs new entries.

### Server-rejected knock reasons

The DO replies `knock:result { status: <reason> }` and does not notify the would-be knockee for these:
- `no-occupant` — zone is empty (nobody to knock)
- `busy` — zone already has an active accepted knock in progress
- `not-knockable` — zone isn't focus/private
- `self-knock` — knocker is already in the target zone

## 4. Audio-first defaults

### New CF RealtimeKit preset

`audio_only_publish` defined on the existing `agency-virtual-office` application via the CF dashboard (Paul-driven, same pattern as `staff_full` and `viewer_lurking`):

| Permission | Setting |
|---|---|
| Audio publish | ALLOWED |
| Video publish | NOT_ALLOWED |
| Screenshare publish | NOT_ALLOWED |
| Audio/video/screenshare subscribe | ALLOWED (default) |

### Migration 100

`server/database/migrations/100-virtual-office-audio-first-focus.sql`:

```sql
BEGIN;

UPDATE office_zones
   SET cf_preset_default = 'audio_only_publish'
 WHERE zone_type = 'focus'
   AND cf_preset_default = 'staff_full';

CREATE OR REPLACE FUNCTION office_zones_default_preset_for_focus()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.zone_type = 'focus' AND (NEW.cf_preset_default IS NULL OR NEW.cf_preset_default = 'staff_full') THEN
    NEW.cf_preset_default := 'audio_only_publish';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_office_zones_default_preset ON office_zones;
CREATE TRIGGER trg_office_zones_default_preset
  BEFORE INSERT ON office_zones
  FOR EACH ROW
  EXECUTE FUNCTION office_zones_default_preset_for_focus();

COMMIT;
```

Why the trigger: Phase 1c.5 will introduce a floor-plan editor where admins can create new focus zones. We want those zones to auto-get `audio_only_publish` without requiring the editor UI to know about this rule. Defense in depth at the DB layer.

### Downstream code effect

Zero changes needed to `mintZoneToken` / `OfficeRoom.ts` for the audio-first default. The worker already reads `cf_preset_default` from `zoneMeta` (set up by migration 099) and passes it as `preset_name`. Once migration 100 lands, focus zones automatically mint participants with `audio_only_publish`.

Knock-accept overrides the zone default explicitly — the knocker is minted with `audio_only_publish` regardless of `zoneMeta.cf_preset_default`, because the knocker's experience should be audio-only even if the knock somehow targets a non-focus zone (though `not-knockable` rejection should prevent this in practice).

## 5. UI surfaces

All on the `/office` page. Nuxt UI v4 components throughout per CLAUDE.md.

**1. Knockable-room indicator** on `app/components/office/OfficeZone.vue`:
Focus/private rooms with occupants get a small `i-lucide-ear-icon` in the bottom-right corner. Cursor changes to a knock-hand cursor on hover. The existing "Room full" dimmed state is replaced for these specific cases with this knockable affordance.

**2. Knock confirm dialog** — `app/components/office/OfficeKnockConfirmModal.vue` (new):
Triggered when the user clicks a knockable room. `UModal` opens with name(s) of occupant(s) and `[Cancel] [Knock]` actions. Knock action emits `knock:request` and opens the waiting toast.

**3. Knock incoming modal** — `app/components/office/OfficeKnockIncomingModal.vue` (new):
Opens on `knock:incoming` WS message, plays one-shot sound, shows knocker name, countdown ("Times out in 28s…"), `[Deny] [Accept]` actions. Dismissible by clicking outside = treated as deny. Auto-closes on timeout, accept, or deny.

**4. Knocker's waiting indicator** — `useToast()`:
Non-blocking toast at bottom-right: "Knocking on Bob… [Cancel] 28s". Persistent until: knocker cancels (sends `knock:cancel`), receives `knock:result`, or 30s elapses. Result toast variants:
- `accepted` → dismissed; knocker auto-joins zone via `useOfficeRealtime.connect(authToken)`
- `denied` → red toast "Bob declined" (3s dismiss)
- `timeout` → amber toast "No response — try Slack instead" (5s dismiss)
- `busy` / `no-occupant` / `not-knockable` / `self-knock` → red toast with reason (3s dismiss)

**5. Sound effect:**
- File: `public/sounds/knock.mp3` (~1 sec, polite knock, ~70 dB normalized) — committed to repo.
- Played client-side via `new Audio('/sounds/knock.mp3').play()` inside `knock:incoming` handler.
- Autoplay rejection caught and silently ignored; modal still shows.

**State management** — `app/composables/useOfficeKnocks.ts` (new):
- `pendingKnock` (knock the user has sent, awaiting response — only one allowed)
- `incomingKnock` (knock the user has received, awaiting their response — only one allowed)
- `sendKnock(zoneId)`, `acceptKnock()`, `denyKnock()`, `cancelKnock()` actions
- Wires into the existing WS connection from `useOfficeWebSocket` or equivalent

**Click intercept logic** in `OfficeZone.vue`:
- If `zone.zone_type IN ('focus','private')` AND `zone.occupants.length > 0`:
  - If user is currently in a zone elsewhere → show toast "Leave your current room first to knock on someone else" (do NOT send any WS message — client-side gate only)
  - Otherwise → open knock confirm modal instead of attempting `zone:enter`
- Else → normal `zone:enter`

## 6. Task split & sequencing

| ID | Task | Owner | Effort |
|---|---|---|---|
| 1c.1-01 | Create `audio_only_publish` preset in CF dashboard | Paul | 3 min |
| 1c.1-02 | Migration 100 (focus zones default to audio-only + trigger) | Claude | 30 min |
| 1c.1-03 | WS protocol types in `app/types/office.ts` + worker | Claude | 30 min |
| 1c.1-04 | Worker DO knock state + handlers + 30s timeout alarm + reason codes | Claude | 3h |
| 1c.1-05 | Auto-mint participant token on accept + broadcast `presence:zone-change` | Claude | 1h |
| 1c.1-06 | `useOfficeKnocks` composable (client state + WS wiring) | Claude | 1h |
| 1c.1-07 | `OfficeKnockConfirmModal.vue` + `OfficeKnockIncomingModal.vue` | Claude | 2h |
| 1c.1-08 | Knockable-room indicator on `OfficeZone.vue` (ear icon, click intercept) | Claude | 1h |
| 1c.1-09 | Knock waiting + result toasts via `useToast()` | Claude | 30 min |
| 1c.1-10 | `public/sounds/knock.mp3` + audio playback in incoming modal | Claude | 15 min |
| 1c.1-11 | Tests — DO knock state lifecycle, capacity-override, timeout, busy, validation; client composable state machine | Claude | 2h |
| 1c.1-12 | UAT walkthrough (knock happy path, decline, timeout, busy, edge cases) | Paul | 30 min |
| 1c.1-13 | Deploy (worker + Pages production) + smoke verify with two browsers | Claude + Paul | 15 min |

**Total Claude time:** ~11 hours of code + tests.
**Total Paul time:** ~35 minutes (preset creation + UAT).
**Wall-clock:** ~1.5 days kickoff to ready-to-merge.

**Sequencing:** 1c.1-01 (Paul, dashboard) is independent and can happen anytime. 1c.1-02 (migration) applies to prod DB immediately per CLAUDE.md, low risk because the `cf_preset_default` column already exists from migration 099. 1c.1-03 → 1c.1-11 in TDD order. 1c.1-12 (UAT) gates 1c.1-13 (deploy + smoke).

**Branch:** Continue on `feat/virtual-office-1b-media`. PR #11 accumulates 1b' + 1c.1 commits. When the user does the deferred 1b' two-browser UAT + merges, both phases ship together.

## 7. Risks & rollback

| Risk | Likelihood | Mitigation |
|---|---|---|
| Knock spam | Low | Trust 20-person social norms. Revisit rate-limit in 1e if abused. |
| Simultaneous knocks on same focus room | Medium | Server rejects 2nd with `busy`. Per-zone lock in DO matches existing pattern at `OfficeRoom.ts:72`. |
| Race between knock-accept and knockee leaving | Medium | DO re-verifies knockee WS-connected on accept. If disconnected, knocker gets `no-occupant`. |
| DO isolate sleeps mid-knock | Low | Knock state intentionally ephemeral. Timeout alarm wakes the DO; pending knock either resolves on wake or times out cleanly. |
| Sound autoplay blocked | Medium | `.play()` Promise rejection caught + silently ignored. Modal still shows. |
| Capacity-override leak | Low | Implicit override (no state mutation). Knocker-only skip in capacity check; cleared when knock state clears. |
| Migration 100 trigger interferes with admin editor (1c.5) | Low | Trigger only sets default when value is unset or matches pre-migration default. Admin editor can override explicitly. |
| Knock UI conflicts with existing zone:enter | Medium | Click intercept fires knock dialog only when user is not in any zone. If already in a zone, normal leave-then-enter flow runs and surfaces `not-knockable` as a toast. |

### Rollback

Phase 1c.1 degrades gracefully — if any knock path misbehaves, Phase 1b' media + Phase 1a presence remain functional.

1. **Soft rollback (~5 min):** Hide the knockable-room indicator (`v-if="false"` on the ear icon block in `OfficeZone.vue`), redeploy. Knock paths become unreachable from UI; server code stays. No DB changes.
2. **Migration rollback:** `UPDATE office_zones SET cf_preset_default = 'staff_full' WHERE zone_type = 'focus' AND cf_preset_default = 'audio_only_publish'; DROP TRIGGER trg_office_zones_default_preset ON office_zones;`
3. **Preset rollback:** Delete `audio_only_publish` in CF dashboard; worker falls back to whatever `cf_preset_default` says (after migration rollback, `staff_full`).
4. **Hard rollback:** `gh pr revert <merge-commit>` — note this reverts 1b' too since both phases are in PR #11. If clean per-phase rollback matters, merge 1b' first and start 1c.1 on a fresh branch.

## 8. Security review checkpoint

Before commit (per repo pre-commit quality rules), re-read changes and confirm:
- `knock:request` validates the knocker has WS auth (existing pattern — `event.context.user` must be set).
- `knock:request` validates the target zone is in the same office as the knocker (no cross-office knocks).
- `knock:accept` validates the accepter's WS is the actual occupant of the target zone (no third-party accepts).
- `knock:cancel` validates the cancellation comes from the original knocker's WS (no third-party cancels).
- Knocker-only capacity-override is keyed on the knocker's `ActorHandle` AND the active `knockId` AND the zone's lock — no path where an unrelated user benefits from the override.
- No new server endpoints added (no new RBAC surface).
- Sound asset file is served from `public/` (static, no auth) — acceptable because it's a 1-sec generic knock sound.

## 9. Decisions made during brainstorm

- **2026-05-23:** Auto-pull semantics on accept (knocker joins knockee's zone), not invite-back to a fresh ephemeral zone. Reason: matches ro.am pattern, cleanest drop-in feel.
- **2026-05-23:** 30s timeout with toast to knocker, no persistent missed-knock badges. Reason: low-friction "got a minute?" use case the PRD describes; missed-knock persistence is Slack territory.
- **2026-05-23:** In-app modal only for knock incoming notifications; no browser Notification API or Slack/email/push for 1c.1. Reason: scope creep; the user must be on `/office` to be knockable, otherwise the knock times out.
- **2026-05-23:** Knock initiated by clicking the *room* (focus/private with occupants), not the *avatar*. Reason: avatar-click interactions are 1c.2 (profile cards). Defer the alternative knock initiation path.
- **2026-05-23:** Migration 100 uses a BEFORE INSERT trigger to enforce focus-zone defaults. Reason: defense in depth for 1c.5 admin editor and any future seeding code.
- **2026-05-23:** Capacity override is implicit (knocker-only skip in capacity check), not a DB column mutation. Reason: simpler reasoning, no leak risk.
- **2026-05-23:** Knock-accept overrides `zoneMeta.cf_preset_default` explicitly with `audio_only_publish`. Reason: knocker's experience should be audio-only regardless of zone preset, belt-and-suspenders.
- **2026-05-23:** No knock cooldown / rate limit. Reason: 20-person agency, social norms sufficient.
- **2026-05-23:** No transfer-to-Meeting-Room-A flow during accepted knock. Reason: explicit design — if you want video, leave focus and go to a Meeting Room.

## 10. Open items (not blockers)

- **Two-browser UAT for Phase 1b' still pending.** User deferred until a second test account is set up. 1c.1 commits will bundle into PR #11 with 1b'; merge of the combined PR is gated on both phases passing UAT.
- **Capacity-override-on-accept eviction:** if the knocker stays in the focus room after the knockee leaves, the in-memory knock state is cleared and a new third party would be rejected with `Room is full` per normal capacity=1. Verify in UAT that this works cleanly (knockee leaves → knocker remains alone in focus room → third party tries to knock → server replies with whichever-status-is-correct, probably `not-knockable` because the room is no longer "occupied by someone else").

## 11. Roadmap addendum — Phase 1f added today

User requested an EMBED feature mid-brainstorm (screenshot showed the ro.am Lobby embed widget with Calendar/Button/Both modes, theme/accent customization, snippet generator). This corresponds to **G3 (Ro.am-style Lobby scheduling)** from the gap analysis in the parent PRD's recent discussion.

**Phase 1f — Lobby scheduling + embed widget** (newly added, deferred until after 1c/1d/1e):
- Per-staff branded scheduling links (e.g. `agency.com/lobby/paul`)
- Custom intake forms
- Embed snippet for the agency's website (paste into any page)
- Theme / accent customization (dark mode, accent colors)
- Round-robin routing across teams
- "Calendar / Button / Both" widget modes
- Calendar integration for staff availability windows
- Estimated effort: 5-7 days

Sequencing rationale: EMBED *uses* the audio-first focus rooms (1c.1), the guest preset (1d), and timezone overlays (1e). Building EMBED before those means re-touching the booking flow when each lands. PRD will need a §5.6 added for Phase 1f when we get there.

## 12. Success metrics (carry-over from PRD §8)

- Staff knock-to-drop-in usage > 5x/day/staff (vs 0 today; baseline = "got a minute?" Slack count).
- Focus rooms used as audio-only spaces (zero camera publishes observed in CF spend audit for focus zones).
- Average knock-to-conversation time < 5 seconds (knock + accept + audio connect).
- Zero `Room is full` toasts when knock-accept is in progress (capacity-override works).
