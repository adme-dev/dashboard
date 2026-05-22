# Virtual Office Foundation — Design Spec

**Date:** 2026-05-22
**Status:** Draft, codebase-verified, pending user approval
**Owner:** paul@adme.net.au
**Sub-project of:** Virtual Office (ro.am-inspired collaboration platform)

**Verification pass (2026-05-22):** spec was reviewed against the live codebase. Six integration assumptions were corrected: chat table schema (§4.3.a), polymorphic actor handle convention (§4.3.b), reuse of existing `user_chat_status` presence table (§4.3.c), WebSocket endpoint path (§5.2), migration numbering 092→097 (§10), and known-limitation entries added for shared presence, externally-managed `clients` table, and greenfield WebRTC (§13).

**Phase 1a status (2026-05-22):** Implemented on branch `feat/virtual-office-1a-presence` — schema (migrations 097/098), OfficeRoom DurableObject (deployed: `office-room-worker.adme-dev.workers.dev`), Nitro WS proxy + read/admin endpoints, `useOfficeConnection` composable, ro.am-inspired floor plan UI with per-zone-type theming, status sync to chat presence. Phase 1a deviation from §4.3.c: `user_chat_status.user_id` is a PRIMARY KEY (NOT NULL) — extending it with a XOR'd `client_user_id` was structurally impossible, so the spec's alternate option (parallel `client_chat_status` table) was used instead.

**Phase 1b status (2026-05-22):** Implemented on branch `feat/virtual-office-1b-media` (draft PR #11) — Cloudflare RealtimeKit media (`@cloudflare/realtimekit` v1.4 Core/headless), per-zone persistent Meeting created lazily on first `zone:enter`, two-preset model (`staff_full`/`viewer_lurking`), DO mints participant tokens against the CF account API + schedules refresh ~5min before expiry, `useOfficeRealtime` composable wraps the SDK, `OfficeRoomPanel` slideover hosts custom tiles/controls/devices (ro.am aesthetic preserved). Phase 1b deviation from §4.2 / §6.3: pivoted from raw Cloudflare Realtime SFU (assumed in original v1 plan) to RealtimeKit after research showed the higher-level SDK eliminates the hand-rolled WebRTC layer. Migration 099 adds `cf_meeting_id` + `cf_preset_default` to `office_zones`. Phase 1b known limitations (documented in UAT): token refresh causes a brief reconnect since the SDK doesn't expose hot-swap in v1.4; device-picker switching doesn't push the new track to the live session (workaround: leave + re-enter); `viewer_lurking` preset isn't yet auto-downgraded on permission-denied (UI lurks but mint still uses default preset). Phase 1c (chat/notes/reactions/profile cards/knock signaling/admin floor-plan editor) plan to be written next.

---

## 1. Purpose

Build the foundation of a ro.am-style virtual office inside the XeroFlow Agency dashboard: a persistent shared space where staff and invited client guests appear as avatars on a floor plan, click into named zones, and hold multi-party video/audio calls with screensharing.

This spec covers the **foundation only**. Future sub-projects (drop-in audio "knock", whiteboards, AI meeting transcription, async screen recording, theater/stadium, mobile native) will get their own spec docs.

## 2. Scope

### In scope (v1)

- Floor plan UI with named zones (Lobby, Meeting Rooms, Focus Rooms, Theater placeholder)
- Multi-office support per tenant from day one (office switcher in nav)
- Avatar presence on the floor plan, status states (available / busy / dnd / away)
- Click-to-enter zones with multi-party video + audio + screenshare
- Per-zone text chat (reuses existing `chat_channels` + `chat_messages` tables; see §4.3 for the reuse pattern)
- Per-zone shared markdown notes (last-write-wins, no CRDT yet)
- Floating reactions / hand-raise emoji per avatar
- Profile card popover on avatar click
- "Someone entered your zone" toast notification
- Client portal entry point: clients join from existing client portal session, ACL-scoped visibility
- Admin UI to create / move / resize / rename / ACL zones
- Audit trail of zone visits (Postgres `zone_visits`)

### Out of scope (deferred to future specs)

- Drop-in audio "knock" pattern (request a 1:1 call without scheduling)
- Whiteboard with CRDT (will use tldraw later)
- AI meeting transcription / summarisation ("Magic Minutes")
- Async screen recording ("Magicast")
- Theater / stadium mode (100+ attendee broadcast)
- Walkable map with proximity audio (Gather-style)
- Background music per zone
- Native mobile apps (v1 is web responsive only)
- Personal scheduling lobby ("ro.am Lobby" feature)
- Recording of any kind
- Push-to-talk / host controls

### Audience and scale targets

- Internal agency staff + invited client guests
- Peak 30–100 concurrent users per office
- Build budget: 5–7 weeks

## 3. Architectural decisions

**Approach A — Single Office DurableObject** holds presence for the whole office. Per-zone media is a separate Cloudflare Realtime session keyed by zone id. The DO mints scoped tokens server-side when a participant enters a zone.

Approach B (Office DO + per-zone DOs) was considered and deferred. At 30–100 concurrent the single DO is comfortably within Cloudflare's mailbox throughput, and the simpler model is easier to reason about. Per-zone DOs can be split out later when whiteboards or recording need per-zone heavy state.

**Why these choices:**

| Choice | Rationale |
|---|---|
| Cloudflare Realtime (Calls) over LiveKit / Daily / mediasoup | Stack consolidation. Signaling already lives on DOs. No second vendor. Accept thinner SDK ecosystem in exchange. |
| Floor plan with click-to-enter (not walkable, not list) | Matches ro.am's actual UX. Walkable adds 2× build cost for marginal value in a work tool. List view loses the "virtual office" identity. |
| One DO per office | Matches existing `chat-rooms` / `board-events` patterns. Same source of truth for the floor view. |
| Client guests share the same DO | ACL filtering at snapshot time. Simpler than parallel infra. Clients get a distinct avatar badge. |
| Reuse existing chat tables for in-zone chat | Saves a whole subsystem. Adds `'office_zone'` to the `chat_channels.type` enum and adds an `external_id` column for the zone link (see §4.3). |
| LWW notes, not CRDT | 2-day build vs 2-week build. Collisions rare in same-zone use. Whiteboard later gets proper CRDT via tldraw. |

## 4. Data model

### 4.1 Postgres (persistent, source of truth for definitions only)

```sql
-- Office layout — multiple offices supported from day one
-- (tenant_id intentionally omitted: app is single-tenant in v1;
--  multi-tenancy is a separate roadmap item and will add the column then.)
CREATE TABLE offices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  layout          jsonb NOT NULL DEFAULT '{}'::jsonb,  -- viewport size, background, theme
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Zones on the floor plan
CREATE TABLE office_zones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id       uuid NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  slug            text NOT NULL,
  name            text NOT NULL,
  zone_type       text NOT NULL CHECK (zone_type IN ('lobby','meeting','focus','theater','client_lounge')),
  position        jsonb NOT NULL,  -- {x,y,w,h} in floor plan coords
  capacity        int NOT NULL DEFAULT 20,
  is_private      boolean NOT NULL DEFAULT false,
  acl             jsonb NOT NULL DEFAULT '{}'::jsonb,
                  -- shape: {allowed_roles?: string[], allowed_clients?: uuid[], public_lobby?: bool}
  notes           text NOT NULL DEFAULT '',     -- shared markdown pad
  notes_version   bigint NOT NULL DEFAULT 0,    -- LWW counter
  notes_updated_at timestamptz,
  notes_updated_by uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (office_id, slug)
);

-- Membership: who has access to which office.
-- Synthetic id PK (function expressions are not allowed in Postgres PKs).
-- Uniqueness enforced via two partial unique indexes — one for staff, one for clients.
CREATE TABLE office_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id       uuid NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  user_id         uuid,
  client_user_id  uuid,
  role            text NOT NULL CHECK (role IN ('admin','member','guest')),
  added_at        timestamptz NOT NULL DEFAULT now(),
  CHECK ((user_id IS NULL) <> (client_user_id IS NULL))
);

CREATE UNIQUE INDEX idx_office_members_uniq_user
  ON office_members(office_id, user_id)
  WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX idx_office_members_uniq_client
  ON office_members(office_id, client_user_id)
  WHERE client_user_id IS NOT NULL;

-- Audit trail (async writes, never read for live presence)
CREATE TABLE zone_visits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id         uuid NOT NULL REFERENCES office_zones(id) ON DELETE CASCADE,
  actor_id        uuid NOT NULL,
  actor_type      text NOT NULL CHECK (actor_type IN ('user','client')),
  entered_at      timestamptz NOT NULL,
  left_at         timestamptz
);

CREATE INDEX idx_office_zones_office ON office_zones(office_id);
CREATE INDEX idx_office_members_user ON office_members(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_office_members_client ON office_members(client_user_id) WHERE client_user_id IS NOT NULL;
CREATE INDEX idx_zone_visits_zone_time ON zone_visits(zone_id, entered_at DESC);
```

### 4.2 DurableObject in-memory state

```ts
// OfficeRoomDO — one instance per office
interface OfficeState {
  officeId: string

  participants: Map<participantId, {
    actorId: string             // user.id or client_user.id
    actorType: 'user' | 'client'
    name: string
    avatarUrl: string | null
    status: 'available' | 'busy' | 'dnd' | 'away'
    currentZoneId: string | null
    ws: WebSocket
    joinedAt: number
    lastSeenAt: number          // heartbeat
    disconnectedAt: number | null  // null = connected; set on close, 30s grace
  }>

  // Derived view, recomputed on changes
  zoneOccupancy: Map<zoneId, Set<participantId>>
}
```

Cloudflare Realtime holds the actual media. One session per zone, keyed `office:{officeId}:zone:{zoneId}`. Tokens minted by the DO on zone-enter, scoped to that session only, 1-hour TTL, refreshed by DO.

### 4.3 Integration with existing platform tables

Three pieces of existing platform state interact with this feature. Each requires a small, additive change rather than parallel infrastructure.

**a. Chat reuse — extending `chat_channels`**

The existing `chat_channels` table (migration `018-chat.sql`) discriminates kinds via a `type` column with values `'channel' | 'dm' | 'group_dm'`. It has no `external_id` column. To reuse it for per-zone chat without forking the chat subsystem, migration `097` adds:

```sql
ALTER TABLE chat_channels DROP CONSTRAINT IF EXISTS chat_channels_type_check;
ALTER TABLE chat_channels ADD CONSTRAINT chat_channels_type_check
  CHECK (type IN ('channel','dm','group_dm','office_zone'));

ALTER TABLE chat_channels ADD COLUMN IF NOT EXISTS external_id uuid;
CREATE INDEX IF NOT EXISTS idx_chat_channels_external
  ON chat_channels(type, external_id) WHERE external_id IS NOT NULL;
```

When an office zone is created, the admin endpoint also inserts a `chat_channels` row with `type='office_zone'` and `external_id=zone.id`. `chat_messages` then writes against `channel_id` exactly as it does for normal channels — no further table changes. The OfficeRoomDO looks up the channel id by `(type='office_zone', external_id=zoneId)` on first chat message, and caches it in memory.

**b. Polymorphic actor — `ActorId` convention**

The platform has separate `User` and `ServerClientUser` types (no polymorphic base). The office feature is the first that mixes both in one presence list, so it introduces a single shared convention rather than a runtime polymorphic type:

```ts
// Wire format on all WS messages and zone_visits.actor_id is stored as plain uuid + actor_type
// In-memory and in WS payloads we use a string handle for unambiguous routing:
type ActorHandle = `user:${string}` | `client:${string}`

// Helpers (new in app/types/index.ts and re-exported from server/utils/officeRoom.ts)
function toActorHandle(actor: User | ServerClientUser): ActorHandle
function parseActorHandle(h: ActorHandle): { type: 'user' | 'client', id: string }
```

The `zone_visits.actor_id` column stays a `uuid` with `actor_type` discriminator (matches `office_members`). The string handle is purely for in-memory and on-the-wire use, where colon-delimited strings are easier to log and route than discriminated objects.

**c. Presence — extending `user_chat_status`, not duplicating it**

A presence table already exists: `user_chat_status` from migration `020-chat-enhancements.sql` with `user_id, status, custom_text, last_seen_at, updated_at` and status values `'online' | 'away' | 'dnd' | 'offline'`. The office feature does **not** add a parallel presence table. Instead:

- Office status (`available / busy / dnd / away`) maps directly to `user_chat_status.status`. The OfficeRoomDO writes through to `user_chat_status` on status change (debounced 5s) so chat status stays consistent.
- Office-specific ephemeral state (`currentZoneId`, `joinedAt`, WS connection) lives only in the DO — not in any table.
- Client portal users do not currently have a presence table. Migration `097` adds a parallel `client_user_chat_status` table mirroring the user one (or extends `user_chat_status` with a nullable `client_user_id` and CHECK constraint). Decision deferred to implementation plan; both options preserve the "one source of truth per actor type" invariant.

The DO is still the authoritative source for "who is in which zone right now" — but presence *status* (online/away/dnd) is a platform-wide concept, not office-specific, so it stays in the existing table.

## 5. Components

### 5.1 Frontend (new under `app/`)

```
app/pages/
  office.vue                          # main route, requires auth
  office-admin.vue                    # admin-only zone editor

app/components/office/
  OfficeFloorPlan.vue                 # the SVG/canvas floor view
  OfficeZone.vue                      # one zone rectangle with avatar stack
  OfficeAvatar.vue                    # avatar with status dot + guest badge
  OfficeRoomPanel.client.vue          # opens on zone click; holds call UI
  OfficeMediaTile.vue                 # one video/audio tile (self or remote)
  OfficeMediaControls.vue             # mic / cam / screenshare / leave
  OfficeStatusPicker.vue              # available / busy / dnd / away
  OfficeDeviceSettings.vue            # mic / cam picker, permission state
  OfficeZoneChat.client.vue           # per-zone text chat panel
  OfficeZoneNotes.client.vue          # shared markdown pad (LWW)
  OfficeReactionLayer.vue             # floating emoji animations
  OfficeProfileCard.vue               # popover on avatar click
  OfficeSwitcher.vue                  # multi-office dropdown in nav

app/composables/
  useOfficeConnection.ts              # WS to OfficeRoomDO, snapshot + events
  useOfficeRealtime.ts                # CF Realtime session lifecycle
  useMediaDevices.ts                  # wraps @vueuse useUserMedia / useDevicesList
  useOfficeReactions.ts               # emit + animate reactions
```

All components follow project conventions: Nuxt UI v4 only, no browser-native dialogs, dark-mode-aware semantic colors.

### 5.2 Server (new under `server/`)

```
server/api/office/
  index.get.ts                              # list offices user is a member of
  [officeId]/index.get.ts                   # office + zones + members (for floor plan)
  [officeId]/zones.post.ts                  # admin: create zone
  [officeId]/zones/[id].patch.ts            # admin: move / resize / rename / ACL
  [officeId]/zones/[id].delete.ts           # admin: remove zone (evicts users)
  [officeId]/members.post.ts                # admin: add member (staff or client)
  [officeId]/members/[memberId].delete.ts   # admin: remove member

server/api/ws/office/
  [officeId].ts                             # WS upgrade endpoint, proxies to OfficeRoomDO
                                            # (matches existing pattern in server/api/ws/tasks/[id].ts)

server/utils/
  officeRoom.ts                       # DO bindings, WS message shapes, evaluateAcl()
  officeRealtime.ts                   # CF Realtime API client (mint, kick, end session)
  officeBroadcast.ts                  # helpers for filtered fan-out

workers/office-room/                  # the DO worker (mirrors chat-rooms structure)
  index.ts
  handlers.ts                         # message handlers (pure functions for unit tests)
  acl.ts                              # ACL evaluation
  rateLimit.ts                        # per-participant rate limits
```

### 5.3 Cloudflare bindings to add

In the root `wrangler.toml` (Pages binding for the Nuxt app), following the existing pattern for `CHAT_ROOMS`, `BOARD_ROOMS`, `BANNER_ROOMS`:

```toml
[[durable_objects.bindings]]
name = "OFFICE_ROOMS"
class_name = "OfficeRoom"
script_name = "office-room-worker"
```

In a new `workers/office-room/wrangler.toml` (the DO's own worker), following the existing pattern of `workers/chat-rooms/`. Includes the migrations block for the SQLite-backed DO storage.

Secrets (set via `pnpm env:secrets:put` or Cloudflare dashboard, never committed):

```
REALTIME_APP_ID
REALTIME_APP_SECRET
```

**No Queue is needed for v1.** The Pages `wrangler.toml` constraint "no `[[queues.consumers]]` here — only producers; consumers live in separate worker `wrangler.toml` files" (per existing comment in the file) does not apply since office events stay inside DO message broadcasts.

No new database, no new auth, no new vendor besides Cloudflare Realtime (same vendor as everything else).

## 6. Data flow

### 6.1 Internal staff opens `/office`

```
1. Browser GET /office (Nuxt page)
2. SSR middleware: requireAuth() → User
3. useFetch('/api/office'): returns offices user is member of
4. Pick default office (user pref or first); useFetch('/api/office/[officeId]')
5. Server: SELECT office + zones (filtered by member role) + member list
6. Client mounts <OfficeFloorPlan/> with zones positioned per zone.position
7. useOfficeConnection() opens WSS to /api/ws/office/[officeId]
8. Nitro WS handler validates session, proxies to OfficeRoomDO via fetch()
9. DO: checks office_members; if member, accepts; sends 'snapshot'
10. Browser renders avatars from snapshot.zoneOccupancy
```

### 6.2 Client guest opens office from client portal

```
1. Client logged into /client-portal (existing client_session_token cookie)
2. Portal sidebar shows "Join Office" if client account has office_access enabled
3. Click → navigate to /office?as=client
4. Nuxt middleware: validates client cookie, allows route
5. WS open: actorType='client'
6. DO: evaluateAcl(client, office) — must be in office_members as client_user_id
7. DO sends filtered snapshot:
   - zones: only those with acl.allowed_clients ∋ client.client_id OR zone_type='lobby' AND acl.public_lobby
   - participants: all (clients see staff, staff see clients)
8. Client appears in staff's view with orange "guest" ring on avatar
```

### 6.3 User enters a zone (the load-bearing flow)

```
Browser              OfficeRoomDO                Cloudflare Realtime
  │                       │                            │
  │── WS: zone:enter ────▶│                            │
  │   { zoneId }          │                            │
  │                       │ evaluateAcl(user, zone)    │
  │                       │ if denied → 'zone:denied'  │
  │                       │ if capacity → 'zone:full'  │
  │                       │                            │
  │                       │── mintToken ──────────────▶│
  │                       │   (server-to-server)       │
  │                       │◀── { token, sessionId } ───│
  │                       │                            │
  │◀── WS: zone:joined ───│                            │
  │   { token, sessionId} │                            │
  │                       │                            │
  │                       │── broadcast ─────────────▶ (other WS clients)
  │                       │   'participant:moved'      │
  │                       │                            │
  │── WebRTC SDP ─────────┼───────────────────────────▶│
  │   (uses token)        │                            │
  │◀── media tracks ──────┼───── ◀ ────────────────────│
  │                       │                            │
  │                       │ async INSERT zone_visits   │
```

**Key invariant:** Realtime session tokens are minted server-side inside the DO and never exposed except scoped to one zone, time-limited. On leave, DO calls Realtime API to remove the participant from that session.

### 6.4 Status change, chat, reactions, notes

| Event | WS message | DO action | Persistence |
|---|---|---|---|
| Status change | `status:set { 'busy' }` | Update participant, broadcast `participant:updated` | None (ephemeral) |
| Chat message | `chat:message { zoneId, body }` | Verify user in zone, resolve `chat_channels.id` for `(type='office_zone', external_id=zoneId)` (created on zone creation; lazy-created on first message as fallback), insert into `chat_messages`, broadcast to same-zone participants | Yes (`chat_channels` + `chat_messages`) |
| Reaction | `reaction:emit { '👍', zoneId }` | Broadcast `reaction:emit` to same-zone participants | None (ephemeral) |
| Notes edit | `notes:update { zoneId, markdown, version }` | If client `version < current` → reject with `notes:rejected { current }`; else DO increments `notes_version` to `version + 1`, sets `notes_updated_at` / `notes_updated_by`, persists, broadcasts `notes:updated { markdown, version }` to same-zone participants | Yes (`office_zones.notes`, LWW) |

### 6.5 Disconnect handling

```
WS closes → DO onClose:
  ├── mark participant disconnectedAt = now()
  ├── start 30s grace timer
  ├── if reconnects within 30s → restore (no broadcast)
  └── if timer fires:
        ├── remove participant from state
        ├── broadcast 'participant:left' to office
        ├── Realtime API: remove from any active session
        └── async UPDATE zone_visits SET left_at=now()
```

30s grace prevents flicker on flaky wifi / page refresh.

### 6.6 Multi-office switcher

```
1. <OfficeSwitcher/> in nav shows offices user is a member of
2. Selects different office → close current WS, open WS to new office
3. Floor plan re-renders from new snapshot
4. If user was in a zone in old office, Realtime session closed cleanly
```

Users are present in at most one office at a time.

### 6.7 Multi-tab behaviour

- DO dedupes participants by `actorId` — second tab inherits the existing participant entry.
- Only one tab can be in a zone at a time. Newer tab wins the zone; older tab gets `zone:taken-over` and falls back to lobby view.

## 7. Error handling

| Failure | User experience | System response |
|---|---|---|
| WS to DO drops | "Reconnecting…" toast, avatar greys briefly | Exponential backoff: 1s, 2s, 5s, 10s, capped. Snapshot refetch on reconnect. 30s grace prevents premature "left". |
| Realtime token mint fails | "Couldn't join room — try again" modal | DO returns `zone:join-failed { reason }`. Participant stays in office, just not in a zone. |
| WebRTC negotiation fails | "Connection issues — checking network" banner | 5s ICE timeout, fall back to audio-only prompt, then clean kick from zone. |
| Mic/cam permission denied | Inline strikethrough mic icon, lurk-allowed | Don't block zone join. `useMediaDevices` exposes reactive `permissionState`. |
| Device unplugged mid-call | "Camera disconnected — select another" toast | Listen for `devicechange`, auto-switch if alternative exists. |
| Zone deleted while users in it | Auto-evict to lobby, toast "This room was removed" | Admin endpoint broadcasts `zone:deleted` → eviction → Realtime tear-down. |
| ACL revoked for participant | Same — evict to lobby | Admin ACL PATCH calls `DO.evaluateAcl()` for every participant. |
| Capacity exceeded | "Room is full" before join attempt | Pre-checked in DO; no token minted. |
| DO hibernation cycle | Brief reconnect | `webSocketHibernation` + `alarm()` for heartbeat. State rebuilt from alive WS connections. |
| Two tabs same user | One participant entry, one tab in zone at a time | Dedupe by `actorId`; takeover broadcast to old tab. |
| Notes version conflict | Loser's edit rejected; toast "Notes were updated by someone else" | LWW. Loser's draft preserved in localStorage. Known limitation. |
| Session expires mid-office | WS closes 4001, redirect to login | Re-validate on each reconnect. |
| Realtime quota hit | `zone:join-failed { reason: 'capacity' }` modal | Webhook to ops via existing `notifyError` util. |

### Security boundaries

- Realtime tokens never raw on client except scoped to one zone, 1-hour TTL.
- DO validates `actorId` on every message (no payload spoofing).
- ACL checks centralised in `server/utils/officeRoom.ts` `evaluateAcl()` — single function, easy to audit.
- Client guests cannot enumerate zones they lack access to — filtered server-side before snapshot.
- Rate limits per participant: chat 30/min, reactions 60/min, notes 10/min — enforced in DO.

### Non-error UX

- Empty office: "No one's here yet" empty state.
- First time without mic/cam: "Test your camera" modal before zone entry.
- Slow network on join: skeleton tiles in `OfficeRoomPanel`, never a black square.
- Joining a zone you're already in: idempotent, no-op.

## 8. Testing strategy

### Unit (Vitest)

- `evaluateAcl()` matrix: staff×public, staff×private, client×owned, client×other-client (deny), guest×lobby
- Zone ACL filter: given participant + zone list, returns correct visible subset
- Notes LWW resolver: returns correct winner, preserves loser metadata
- `OfficeRoomDO` handlers — extracted as pure functions, tested without DO runtime
- Rate limit accounting: N passes, N+1 rejects, window slides

### Integration (Vitest + Miniflare)

- WS lifecycle: connect → snapshot → enter → leave → disconnect, verify broadcasts
- Reconnect within 30s grace: no "left" event
- Reconnect after 30s grace: "left" event then fresh "joined"
- Two tabs same user: zone takeover works
- Admin deletes zone: all participants evicted, sessions torn down
- ACL revocation: participant evicted within 1s

### E2E manual (no Playwright suite for v1; documented checklist)

- Two browsers, same office, both staff: see each other, enter same zone, see/hear, screenshare visible
- Staff + client portal user: client only sees allowed zones, staff sees client with guest badge
- Mobile Safari + desktop Chrome: zone join, mic/cam permission flow
- Network throttle to 3G: reconnect logic, no zombie avatars
- Force redeploy mid-call (kill DO): clients reconnect, presence restored
- Browser refresh during call: rejoin same zone or return to lobby cleanly

### Load (before going live)

- 50 simulated participants connected to one office, heartbeats + 10 chat/min: DO mailbox latency < 200ms, no drops, memory stable
- 8 participants with video in one zone: monitor Realtime egress bytes/min for cost calibration

### Not tested in v1

- Theater mode load (>20 in one zone) — out of scope
- Recording integrity — not built
- Transcription accuracy — not built
- CRDT correctness — using LWW

## 9. Extra tools and dependencies to add

| Tool | What for | Notes |
|---|---|---|
| Cloudflare Realtime (Calls) | Media: video, audio, screenshare | Native to existing stack; signaling on DO |
| Built-in TURN via Realtime | NAT traversal for hostile networks | Included; no separate provider |
| Hand-rolled SVG / `@vue-flow/core` (TBD during impl) | Admin floor-plan editor | ~3 days build. Decision deferred to implementation plan. |
| `@vueuse/core` (already installed) | `useUserMedia`, `useDevicesList` | No new dep |
| `marked` + `dompurify` (already installed) | Render zone notes markdown safely | No new dep |

No new database, no new auth provider, no second vendor.

## 10. Migration plan

Highest existing migration is `096-inferred-mrr.sql`. The office feature uses `097` and `098`.

**`097_virtual_office_foundation.sql`** — additive, idempotent. Contains:

1. The four new tables from §4.1: `offices`, `office_zones`, `office_members`, `zone_visits` (with indexes).
2. Extension of `chat_channels` per §4.3.a:
   ```sql
   ALTER TABLE chat_channels DROP CONSTRAINT IF EXISTS chat_channels_type_check;
   ALTER TABLE chat_channels ADD CONSTRAINT chat_channels_type_check
     CHECK (type IN ('channel','dm','group_dm','office_zone'));
   ALTER TABLE chat_channels ADD COLUMN IF NOT EXISTS external_id uuid;
   CREATE INDEX IF NOT EXISTS idx_chat_channels_external
     ON chat_channels(type, external_id) WHERE external_id IS NOT NULL;
   ```
3. Presence integration per §4.3.c (option chosen at implementation time): either
   ```sql
   -- Option A: parallel table for clients
   CREATE TABLE IF NOT EXISTS client_user_chat_status ( ... );
   ```
   or
   ```sql
   -- Option B: extend user_chat_status with nullable client_user_id and a CHECK
   ALTER TABLE user_chat_status ADD COLUMN IF NOT EXISTS client_user_id uuid;
   ```
4. Gate flag on the existing `clients` table for the portal "Join Office" entry point:
   ```sql
   ALTER TABLE clients ADD COLUMN IF NOT EXISTS office_access boolean NOT NULL DEFAULT false;
   ```
   **Caveat:** the verification pass found that the `clients` table is referenced throughout the codebase but has no `CREATE TABLE` statement in `server/database/migrations/` — it was created outside the migration system. Migration `097` therefore runs an `ALTER TABLE ... IF NOT EXISTS` against an externally-managed table; this is safe (no-op if already there) but the implementation plan should verify the `clients` table actually exists in the target environment before running. If it doesn't, a `CREATE TABLE` for `clients` must precede this ALTER — and that's a separate gap that pre-dates this feature.

**`098_virtual_office_seed.sql`** — optional, dev/staging only. Creates one default office with a starter floor plan (Lobby + 4 Meeting Rooms + 2 Focus Rooms) and seeds all current staff users as members with `role='member'`. Also creates the matching `chat_channels` rows for each seeded zone so chat works out of the box.

Both migrations run automatically per the CLAUDE.md migration policy.

## 11. Future-proofing for v2

The following are explicitly designed for later extension, not built now:

- **Drop-in audio "knock":** add `knock:request` / `knock:respond` WS messages; reuses existing 1:1 Realtime session creation; needs new presence sub-state (`busy_in_call`) and notification routing
- **Whiteboard per zone:** new per-zone DO + tldraw + CRDT; zone schema gets `has_whiteboard` flag; floor plan adds whiteboard indicator
- **Magic Minutes:** Realtime recording → R2 → Workers AI Whisper → Groq summarisation → Vectorize embed; new table `meeting_recordings` keyed by zone session
- **Magicast:** separate sub-project; uses R2 storage and existing video player components; no overlap with office DO
- **Theater:** zone type `theater` already in schema; sub-mode in Realtime (broadcast pattern); UI changes only — no new infra
- **Native mobile apps:** add Capacitor wrapper; reuse same WS + Realtime SDK; deferred indefinitely
- **Background music:** new `office_zones.ambient_audio_url` field; HTML5 Audio element per zone; licensing TBD

Each of these is an additive sub-project that can ship independently. The foundation is sized to support them without rework.

## 12. Open questions resolved during brainstorming

- ✅ Audience: internal staff + client guests, 30–100 concurrent → confirmed
- ✅ Spatial UX: floor plan with click-to-enter (not walkable, not list) → confirmed
- ✅ SFU: Cloudflare Realtime (not LiveKit, Daily, mediasoup) → confirmed
- ✅ v1 scope: minimal foundation + chat + notes + reactions + profile card + multi-office switcher → confirmed
- ✅ Client visibility: same presence list as staff, ACL-scoped zones, guest badge → confirmed
- ✅ Multi-office from day one (not multi-floor) → confirmed
- ✅ Zone chat reuses existing chat tables → confirmed; integration path is `chat_channels.type='office_zone'` + new `external_id` column (see §4.3.a). The earlier draft assumed a `channel_type` + `channel_external_id` pair existed; verification against `018-chat.sql` corrected this.
- ✅ 30s disconnect grace → confirmed
- ✅ LWW for notes in v1 → confirmed

## 13. Known limitations and tradeoffs accepted

- Single DO per office — fine at 30–100 concurrent, will need sharding above ~500. Acceptable for v1.
- LWW notes can silently drop concurrent edits — rare in practice (same-zone presence makes coordination natural), documented in UI.
- No mobile native — web responsive only. iOS Safari has WebRTC quirks that may need ad-hoc fixes.
- No recording in v1 — explicit decision. Adds compliance scope (consent, retention) that isn't in v1 budget.
- Realtime SDK is newer than LiveKit's — may hit rough edges. Mitigation: stay close to CF docs, keep abstraction thin so swap is possible.
- Floor plan layout is admin-only — no per-user customisation. Acceptable for v1.
- **Presence is shared with chat**, not isolated to the office. Setting yourself to `busy` in the office also marks you `busy` in chat (and vice versa). This is intentional — users shouldn't have two contradictory statuses across the same product — but it means the office can't have a status the chat sidebar doesn't know about. Documented behaviour.
- **`clients` table is externally managed**, not defined in `server/database/migrations/`. Migration `097` adds a column to it via `IF NOT EXISTS`-guarded `ALTER`, which is safe but assumes the table already exists in the target environment. Pre-existing gap, surfaced by this work but not in scope to fix here.
- **No WebRTC precedent in the codebase.** The CLAUDE.md "Voice AI" memory line refers to a feature that has not yet been built. This is a greenfield integration with Cloudflare Realtime — expect the first 1–2 weeks of implementation to involve calibration against the actual SDK behaviour.

## 14. Out-of-scope reminders

Will not be built in v1 (each deserves its own spec when prioritised):

- Drop-in "knock" audio
- Whiteboard
- Magic Minutes (transcription)
- Magicast (async screen recording)
- Theater / stadium broadcast
- Walkable map / proximity audio
- Background music per zone
- Native mobile apps
- Recording of any kind
- Per-user floor plan customisation
- Push-to-talk / host moderator controls
- Personal scheduling ("Lobby" feature from ro.am)
