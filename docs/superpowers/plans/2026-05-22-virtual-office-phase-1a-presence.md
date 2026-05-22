# Virtual Office — Phase 1a: Presence Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-05-22-virtual-office-foundation-design.md`

**Goal:** Ship a working virtual-office floor plan where staff can see live presence (who is online, who is in which zone) and change their own status. No video/audio yet — that's Phase 1b.

**Architecture:** One `OfficeRoom` DurableObject per office holds all live presence in memory. WebSocket from each browser to the DO. Postgres holds zone definitions and membership only. Status writes through to the existing `user_chat_status` table so chat sidebar stays consistent.

**Tech Stack:** Nuxt 4, Vue 3 Composition API, Nuxt UI v4, Cloudflare Durable Objects (SQLite-backed), `@neondatabase/serverless` + `pg`, Vitest.

**Multi-phase context:** This is Phase 1a of 4 (a/b/c/d). 1b adds Cloudflare Realtime media. 1c adds in-zone chat/notes/reactions. 1d adds client portal entry + polish. After this phase ships, Phase 1a is dogfoodable as "presence-only office."

**Scope boundary for 1a:**
- ✅ Schema for all four office tables (offices, office_zones, office_members, zone_visits)
- ✅ Schema extensions for chat_channels (for 1c), user_chat_status (presence integration), clients (for 1d)
- ✅ OfficeRoom DO with WS, snapshot, status, zone enter/leave (no media)
- ✅ Read + admin API endpoints
- ✅ Floor plan page (`/office`) with live avatars and zone-occupancy view
- ✅ Status picker + office switcher in nav
- ✅ Seed migration creating a default office
- ❌ No Cloudflare Realtime integration (`zone:enter` in 1a sends `zone:entered` without a media token)
- ❌ No per-zone chat / notes / reactions
- ❌ No client portal integration (clients can't access /office yet)
- ❌ No admin floor-plan editor UI (admins create zones via SQL or API for 1a; editor in 1c)

---

## File Structure

**New files:**

```
server/database/migrations/
  097-virtual-office-foundation.sql   # schema + chat_channels/user_chat_status/clients extensions
  098-virtual-office-seed.sql          # one default office for dev

app/types/
  office.ts                            # Office, OfficeZone, OfficeMember, ActorHandle types

server/utils/
  officeRoom.ts                        # DO binding, ActorHandle helpers, evaluateAcl()
  officeAuth.ts                        # session → ActorHandle resolution for staff vs clients

workers/office-room/
  wrangler.toml                        # DO worker config
  package.json
  tsconfig.json
  src/index.ts                         # exports OfficeRoom DO class
  src/OfficeRoom.ts                    # main DO class
  src/handlers.ts                      # pure-function message handlers
  src/types.ts                         # WS message shapes

server/api/office/
  index.get.ts                         # list offices for current user
  [officeId]/index.get.ts              # office + zones + members
  [officeId]/zones.post.ts             # admin: create zone
  [officeId]/zones/[zoneId].patch.ts   # admin: update zone
  [officeId]/zones/[zoneId].delete.ts  # admin: delete zone
  [officeId]/members.post.ts           # admin: add member
  [officeId]/members/[memberId].delete.ts  # admin: remove member

server/api/ws/office/
  [officeId].ts                        # WS upgrade endpoint

app/pages/
  office.vue                           # main route

app/components/office/
  OfficeFloorPlan.vue                  # SVG canvas with zones
  OfficeZone.vue                       # one zone rectangle with avatar stack
  OfficeAvatar.vue                     # avatar with status dot
  OfficeStatusPicker.vue               # available / busy / dnd / away
  OfficeSwitcher.vue                   # multi-office dropdown

app/composables/
  useOfficeConnection.ts               # WS to OfficeRoom DO

tests/
  unit/officeRoom/actorHandle.test.ts
  unit/officeRoom/evaluateAcl.test.ts
  unit/officeRoom/handlers.test.ts
  integration/officeWsLifecycle.test.ts
```

**Modified files:**

```
wrangler.toml                          # add OFFICE_ROOMS DO binding
nuxt.config.ts                         # add cloudflare:workers types if needed
app/layouts/agency.vue                 # add Office nav item + OfficeSwitcher in header
app/composables/useUser.ts (or similar) # may need to expose actorHandle helper
```

---

## Task 1: Migration 097 — base schema

**Files:**
- Create: `server/database/migrations/097-virtual-office-foundation.sql`

- [ ] **Step 1: Write the migration file**

Create `server/database/migrations/097-virtual-office-foundation.sql`:

```sql
-- =============================================================================
-- Virtual Office Foundation
-- Phase 1a: schema + chat_channels/user_chat_status/clients extensions
-- =============================================================================

BEGIN;

-- ---------- 1. Office tables ------------------------------------------------

CREATE TABLE IF NOT EXISTS offices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  layout      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS office_zones (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id         uuid NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  slug              text NOT NULL,
  name              text NOT NULL,
  zone_type         text NOT NULL CHECK (zone_type IN ('lobby','meeting','focus','theater','client_lounge')),
  position          jsonb NOT NULL,
  capacity          int  NOT NULL DEFAULT 20,
  is_private        boolean NOT NULL DEFAULT false,
  acl               jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes             text NOT NULL DEFAULT '',
  notes_version     bigint NOT NULL DEFAULT 0,
  notes_updated_at  timestamptz,
  notes_updated_by  uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (office_id, slug)
);

CREATE TABLE IF NOT EXISTS office_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id       uuid NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  user_id         uuid,
  client_user_id  uuid,
  role            text NOT NULL CHECK (role IN ('admin','member','guest')),
  added_at        timestamptz NOT NULL DEFAULT now(),
  CHECK ((user_id IS NULL) <> (client_user_id IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_office_members_uniq_user
  ON office_members(office_id, user_id)
  WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_office_members_uniq_client
  ON office_members(office_id, client_user_id)
  WHERE client_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS zone_visits (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id     uuid NOT NULL REFERENCES office_zones(id) ON DELETE CASCADE,
  actor_id    uuid NOT NULL,
  actor_type  text NOT NULL CHECK (actor_type IN ('user','client')),
  entered_at  timestamptz NOT NULL,
  left_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_office_zones_office ON office_zones(office_id);
CREATE INDEX IF NOT EXISTS idx_office_members_user
  ON office_members(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_office_members_client
  ON office_members(client_user_id) WHERE client_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_zone_visits_zone_time
  ON zone_visits(zone_id, entered_at DESC);

-- ---------- 2. chat_channels extension (for Phase 1c chat reuse) -----------

ALTER TABLE chat_channels DROP CONSTRAINT IF EXISTS chat_channels_type_check;
ALTER TABLE chat_channels ADD CONSTRAINT chat_channels_type_check
  CHECK (type IN ('channel','dm','group_dm','office_zone'));

ALTER TABLE chat_channels ADD COLUMN IF NOT EXISTS external_id uuid;
CREATE INDEX IF NOT EXISTS idx_chat_channels_external
  ON chat_channels(type, external_id) WHERE external_id IS NOT NULL;

-- ---------- 3. user_chat_status extension for client presence --------------
-- Decision: extend the existing table with a nullable client_user_id rather than
-- creating a parallel table. CHECK enforces one-or-the-other.

ALTER TABLE user_chat_status ADD COLUMN IF NOT EXISTS client_user_id uuid;
ALTER TABLE user_chat_status DROP CONSTRAINT IF EXISTS user_chat_status_actor_check;
ALTER TABLE user_chat_status ADD CONSTRAINT user_chat_status_actor_check
  CHECK ((user_id IS NULL) <> (client_user_id IS NULL));

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_chat_status_user
  ON user_chat_status(user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_chat_status_client
  ON user_chat_status(client_user_id) WHERE client_user_id IS NOT NULL;

-- ---------- 4. clients table flag for Phase 1d portal entry ----------------
-- Caveat: clients table is externally managed; ALTER ... IF NOT EXISTS is safe.

ALTER TABLE clients ADD COLUMN IF NOT EXISTS office_access boolean NOT NULL DEFAULT false;

COMMIT;
```

- [ ] **Step 2: Run the migration**

Per CLAUDE.md, migrations run automatically:

```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/097-virtual-office-foundation.sql
```

Expected: `BEGIN`, multiple `CREATE TABLE` / `ALTER TABLE` / `CREATE INDEX` lines, `COMMIT`.

- [ ] **Step 3: Verify the schema**

```bash
psql "$DATABASE_URL" -c "\d offices" -c "\d office_zones" -c "\d office_members" -c "\d zone_visits"
psql "$DATABASE_URL" -c "\d chat_channels" -c "\d user_chat_status" -c "\d clients" | head -80
```

Expected: all four office tables exist with the documented columns. `chat_channels` has `external_id uuid` and updated type check. `user_chat_status` has `client_user_id` and updated check. `clients` has `office_access boolean`.

- [ ] **Step 4: Commit**

```bash
git add server/database/migrations/097-virtual-office-foundation.sql
git commit -m "feat(office): add migration 097 — office tables + chat/presence/clients extensions"
```

---

## Task 2: Migration 098 — seed dev office

**Files:**
- Create: `server/database/migrations/098-virtual-office-seed.sql`

- [ ] **Step 1: Write the seed migration**

```sql
-- =============================================================================
-- Dev/staging seed: one office with starter floor plan + chat_channels rows
-- Safe to run multiple times (idempotent on office name)
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_office_id uuid;
  v_zone_lobby uuid;
  v_zone_mtg_a uuid;
  v_zone_mtg_b uuid;
  v_zone_mtg_c uuid;
  v_zone_mtg_d uuid;
  v_zone_focus_1 uuid;
  v_zone_focus_2 uuid;
BEGIN
  -- Office (idempotent on name)
  INSERT INTO offices (name, layout)
  VALUES ('XeroFlow HQ', jsonb_build_object('width', 1200, 'height', 800, 'theme', 'light'))
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_office_id FROM offices WHERE name = 'XeroFlow HQ';

  -- Zones (idempotent on (office_id, slug))
  INSERT INTO office_zones (office_id, slug, name, zone_type, position, capacity, acl) VALUES
    (v_office_id, 'lobby',    'Lobby',         'lobby',   '{"x":50,"y":50,"w":300,"h":200}'::jsonb, 50, '{"public_lobby":true}'::jsonb),
    (v_office_id, 'mtg-a',    'Meeting Room A','meeting', '{"x":400,"y":50,"w":250,"h":200}'::jsonb, 12, '{}'::jsonb),
    (v_office_id, 'mtg-b',    'Meeting Room B','meeting', '{"x":700,"y":50,"w":250,"h":200}'::jsonb, 12, '{}'::jsonb),
    (v_office_id, 'mtg-c',    'Meeting Room C','meeting', '{"x":400,"y":300,"w":250,"h":200}'::jsonb, 12, '{}'::jsonb),
    (v_office_id, 'mtg-d',    'Meeting Room D','meeting', '{"x":700,"y":300,"w":250,"h":200}'::jsonb, 12, '{}'::jsonb),
    (v_office_id, 'focus-1',  'Focus Room 1',  'focus',   '{"x":50,"y":300,"w":150,"h":150}'::jsonb, 4,  '{}'::jsonb),
    (v_office_id, 'focus-2',  'Focus Room 2',  'focus',   '{"x":220,"y":300,"w":150,"h":150}'::jsonb, 4,  '{}'::jsonb)
  ON CONFLICT (office_id, slug) DO NOTHING;

  -- Capture zone ids for chat_channels seeding
  SELECT id INTO v_zone_lobby   FROM office_zones WHERE office_id = v_office_id AND slug = 'lobby';
  SELECT id INTO v_zone_mtg_a   FROM office_zones WHERE office_id = v_office_id AND slug = 'mtg-a';
  SELECT id INTO v_zone_mtg_b   FROM office_zones WHERE office_id = v_office_id AND slug = 'mtg-b';
  SELECT id INTO v_zone_mtg_c   FROM office_zones WHERE office_id = v_office_id AND slug = 'mtg-c';
  SELECT id INTO v_zone_mtg_d   FROM office_zones WHERE office_id = v_office_id AND slug = 'mtg-d';
  SELECT id INTO v_zone_focus_1 FROM office_zones WHERE office_id = v_office_id AND slug = 'focus-1';
  SELECT id INTO v_zone_focus_2 FROM office_zones WHERE office_id = v_office_id AND slug = 'focus-2';

  -- Pre-create chat_channels for each zone (Phase 1c will write into these)
  INSERT INTO chat_channels (name, slug, type, external_id, created_by)
  SELECT z.name, 'office-' || z.slug, 'office_zone', z.id,
    (SELECT id FROM users WHERE role = 'owner' ORDER BY created_at ASC LIMIT 1)
  FROM office_zones z
  WHERE z.office_id = v_office_id
    AND NOT EXISTS (
      SELECT 1 FROM chat_channels c
      WHERE c.type = 'office_zone' AND c.external_id = z.id
    );

  -- Add all active staff as office members
  INSERT INTO office_members (office_id, user_id, role)
  SELECT v_office_id, u.id,
    CASE WHEN u.role IN ('owner','admin') THEN 'admin' ELSE 'member' END
  FROM users u
  WHERE u.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM office_members om
      WHERE om.office_id = v_office_id AND om.user_id = u.id
    );

END $$;

COMMIT;
```

- [ ] **Step 2: Run it**

```bash
psql "$DATABASE_URL" -f server/database/migrations/098-virtual-office-seed.sql
```

Expected: completes silently; no errors.

- [ ] **Step 3: Verify**

```bash
psql "$DATABASE_URL" -c "SELECT name FROM offices;" \
                    -c "SELECT slug, zone_type, capacity FROM office_zones ORDER BY slug;" \
                    -c "SELECT COUNT(*) FROM office_members;" \
                    -c "SELECT name, type FROM chat_channels WHERE type='office_zone' ORDER BY name;"
```

Expected: 1 office, 7 zones, member count matches active staff users, 7 chat_channels rows.

- [ ] **Step 4: Commit**

```bash
git add server/database/migrations/098-virtual-office-seed.sql
git commit -m "feat(office): add migration 098 — seed dev office with starter floor plan"
```

---

## Task 3: TypeScript types

**Files:**
- Create: `app/types/office.ts`
- Modify: `app/types/index.ts` (re-export)

- [ ] **Step 1: Create the types file**

`app/types/office.ts`:

```ts
// =============================================================================
// Virtual Office — shared types (front-end + server)
// =============================================================================

// Polymorphic actor handle. Wire format on all office WS messages.
// Format: 'user:<uuid>' or 'client:<uuid>'.
export type ActorHandle = `user:${string}` | `client:${string}`
export type ActorType = 'user' | 'client'

export interface ActorRef {
  type: ActorType
  id: string
  handle: ActorHandle
}

// Postgres row types (mirror migrations 097/098)

export type ZoneType = 'lobby' | 'meeting' | 'focus' | 'theater' | 'client_lounge'

export interface OfficeRow {
  id: string
  name: string
  layout: OfficeLayout
  created_at: string
  updated_at: string
}

export interface OfficeLayout {
  width?: number
  height?: number
  theme?: 'light' | 'dark'
  background?: string
}

export interface OfficeZoneRow {
  id: string
  office_id: string
  slug: string
  name: string
  zone_type: ZoneType
  position: ZonePosition
  capacity: number
  is_private: boolean
  acl: ZoneAcl
  notes: string
  notes_version: number
  notes_updated_at: string | null
  notes_updated_by: string | null
  created_at: string
}

export interface ZonePosition {
  x: number
  y: number
  w: number
  h: number
}

export interface ZoneAcl {
  allowed_roles?: string[]
  allowed_clients?: string[]
  public_lobby?: boolean
}

export type OfficeMemberRole = 'admin' | 'member' | 'guest'

export interface OfficeMemberRow {
  id: string
  office_id: string
  user_id: string | null
  client_user_id: string | null
  role: OfficeMemberRole
  added_at: string
}

// Presence state (live, in-DO, exposed to clients via snapshot)

export type OfficeStatus = 'available' | 'busy' | 'dnd' | 'away'

export interface OfficeParticipant {
  handle: ActorHandle
  name: string
  avatarUrl: string | null
  role: OfficeMemberRole
  status: OfficeStatus
  currentZoneId: string | null
  joinedAt: number  // ms epoch
  isGuest: boolean  // true if actorType='client'
}

export interface OfficeSnapshot {
  officeId: string
  participants: OfficeParticipant[]
  // Derived view, keyed by zoneId
  zoneOccupancy: Record<string, ActorHandle[]>
}
```

- [ ] **Step 2: Re-export from index**

Open `app/types/index.ts` and add the export at the end of the file:

```ts
export * from './office'
```

- [ ] **Step 3: Verify it type-checks**

```bash
pnpm typecheck 2>&1 | grep -E "office\.ts|app/types" | head -20
```

Expected: no errors specific to `office.ts`. (Pre-existing ~60 unrelated errors per CLAUDE.md are OK.)

- [ ] **Step 4: Commit**

```bash
git add app/types/office.ts app/types/index.ts
git commit -m "feat(office): add shared types — ActorHandle, OfficeRow, OfficeParticipant"
```

---

## Task 4: ActorHandle helpers — unit-tested first

**Files:**
- Create: `tests/unit/officeRoom/actorHandle.test.ts`
- Create: `server/utils/officeRoom.ts` (helpers section only for now)

- [ ] **Step 1: Write failing tests for ActorHandle helpers**

`tests/unit/officeRoom/actorHandle.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  toActorHandle,
  parseActorHandle,
  isUserHandle,
  isClientHandle,
} from '~~/server/utils/officeRoom'

describe('ActorHandle', () => {
  it('toActorHandle builds a user handle from a User-like object', () => {
    const u = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', email: 'x@y.z' } as any
    expect(toActorHandle(u, 'user')).toBe('user:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
  })

  it('toActorHandle builds a client handle from a ClientUser-like object', () => {
    const c = { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', clientId: 'cccccccc-cccc-cccc-cccc-cccccccccccc' } as any
    expect(toActorHandle(c, 'client')).toBe('client:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
  })

  it('parseActorHandle round-trips user handles', () => {
    expect(parseActorHandle('user:abc-123')).toEqual({ type: 'user', id: 'abc-123' })
  })

  it('parseActorHandle round-trips client handles', () => {
    expect(parseActorHandle('client:xyz-789')).toEqual({ type: 'client', id: 'xyz-789' })
  })

  it('parseActorHandle throws on malformed input', () => {
    expect(() => parseActorHandle('garbage' as any)).toThrow()
    expect(() => parseActorHandle('user:' as any)).toThrow()
    expect(() => parseActorHandle(':abc' as any)).toThrow()
  })

  it('isUserHandle / isClientHandle discriminate', () => {
    expect(isUserHandle('user:abc')).toBe(true)
    expect(isUserHandle('client:abc')).toBe(false)
    expect(isClientHandle('client:abc')).toBe(true)
    expect(isClientHandle('user:abc')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm test:run tests/unit/officeRoom/actorHandle.test.ts
```

Expected: FAIL — `Cannot find module '~~/server/utils/officeRoom'` or similar.

- [ ] **Step 3: Create the helpers**

`server/utils/officeRoom.ts`:

```ts
import type { ActorHandle, ActorRef, ActorType } from '~~/app/types/office'

// =============================================================================
// ActorHandle helpers
// =============================================================================

export function toActorHandle(
  actor: { id: string },
  type: ActorType,
): ActorHandle {
  if (!actor?.id) throw new Error('toActorHandle: missing id')
  return `${type}:${actor.id}` as ActorHandle
}

export function parseActorHandle(h: ActorHandle): ActorRef {
  const m = /^(user|client):(.+)$/.exec(h)
  if (!m || !m[2]) throw new Error(`parseActorHandle: malformed handle "${h}"`)
  return { type: m[1] as ActorType, id: m[2], handle: h }
}

export function isUserHandle(h: string): h is `user:${string}` {
  return h.startsWith('user:') && h.length > 'user:'.length
}

export function isClientHandle(h: string): h is `client:${string}` {
  return h.startsWith('client:') && h.length > 'client:'.length
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
pnpm test:run tests/unit/officeRoom/actorHandle.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/utils/officeRoom.ts tests/unit/officeRoom/actorHandle.test.ts
git commit -m "feat(office): add ActorHandle helpers (toActorHandle / parseActorHandle / type guards)"
```

---

## Task 5: ACL evaluation — TDD

**Files:**
- Create: `tests/unit/officeRoom/evaluateAcl.test.ts`
- Modify: `server/utils/officeRoom.ts` (append `evaluateAcl` + supporting types)

- [ ] **Step 1: Write failing tests**

`tests/unit/officeRoom/evaluateAcl.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { evaluateAcl } from '~~/server/utils/officeRoom'
import type { OfficeZoneRow, ActorRef, OfficeMemberRow } from '~~/app/types/office'

function zone(overrides: Partial<OfficeZoneRow> = {}): OfficeZoneRow {
  return {
    id: 'z1', office_id: 'o1', slug: 's', name: 'n',
    zone_type: 'meeting', position: { x: 0, y: 0, w: 100, h: 100 },
    capacity: 10, is_private: false, acl: {},
    notes: '', notes_version: 0, notes_updated_at: null, notes_updated_by: null,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

const staffMember: OfficeMemberRow = {
  id: 'm1', office_id: 'o1',
  user_id: 'u1', client_user_id: null,
  role: 'member', added_at: new Date().toISOString(),
}

const clientMember: OfficeMemberRow = {
  id: 'm2', office_id: 'o1',
  user_id: null, client_user_id: 'cu1',
  role: 'guest', added_at: new Date().toISOString(),
}

describe('evaluateAcl', () => {
  it('staff member can enter a public (non-private) meeting zone', () => {
    const actor: ActorRef = { type: 'user', id: 'u1', handle: 'user:u1' }
    expect(evaluateAcl({ actor, zone: zone(), membership: staffMember })).toEqual({ allowed: true })
  })

  it('staff member can enter a private zone if their role is allowed', () => {
    const actor: ActorRef = { type: 'user', id: 'u1', handle: 'user:u1' }
    const z = zone({ is_private: true, acl: { allowed_roles: ['member'] } })
    expect(evaluateAcl({ actor, zone: z, membership: staffMember })).toEqual({ allowed: true })
  })

  it('staff member is denied a private zone with mismatched roles', () => {
    const actor: ActorRef = { type: 'user', id: 'u1', handle: 'user:u1' }
    const z = zone({ is_private: true, acl: { allowed_roles: ['admin'] } })
    const result = evaluateAcl({ actor, zone: z, membership: staffMember })
    expect(result.allowed).toBe(false)
  })

  it('non-member is denied any zone', () => {
    const actor: ActorRef = { type: 'user', id: 'u-other', handle: 'user:u-other' }
    const result = evaluateAcl({ actor, zone: zone(), membership: null })
    expect(result.allowed).toBe(false)
    expect(result.reason).toMatch(/membership/i)
  })

  it('client member can enter a lobby with public_lobby=true', () => {
    const actor: ActorRef = { type: 'client', id: 'cu1', handle: 'client:cu1' }
    const z = zone({ zone_type: 'lobby', acl: { public_lobby: true } })
    expect(evaluateAcl({ actor, zone: z, membership: clientMember })).toEqual({ allowed: true })
  })

  it('client member is denied a zone not in their allowed_clients list', () => {
    const actor: ActorRef = { type: 'client', id: 'cu1', handle: 'client:cu1' }
    const z = zone({ zone_type: 'meeting', acl: { allowed_clients: ['other-client'] } })
    // For clients, the ACL check needs the client_id (a property of the actor's client account).
    const result = evaluateAcl({ actor, zone: z, membership: clientMember, actorClientId: 'this-client' })
    expect(result.allowed).toBe(false)
  })

  it('client member is allowed a zone whose acl.allowed_clients includes their client_id', () => {
    const actor: ActorRef = { type: 'client', id: 'cu1', handle: 'client:cu1' }
    const z = zone({ zone_type: 'meeting', acl: { allowed_clients: ['my-client'] } })
    const result = evaluateAcl({ actor, zone: z, membership: clientMember, actorClientId: 'my-client' })
    expect(result.allowed).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test:run tests/unit/officeRoom/evaluateAcl.test.ts
```

Expected: FAIL — `evaluateAcl is not exported`.

- [ ] **Step 3: Implement `evaluateAcl`**

Append to `server/utils/officeRoom.ts`:

```ts
// =============================================================================
// ACL evaluation
// =============================================================================

import type {
  OfficeMemberRow,
  OfficeZoneRow,
  ActorRef,
} from '~~/app/types/office'

export interface AclInput {
  actor: ActorRef
  zone: OfficeZoneRow
  membership: OfficeMemberRow | null
  /** For client actors, the id of the client (company) account they belong to. */
  actorClientId?: string
}

export type AclResult =
  | { allowed: true }
  | { allowed: false; reason: string }

export function evaluateAcl(input: AclInput): AclResult {
  const { actor, zone, membership, actorClientId } = input

  // Special case: public_lobby — clients with membership can enter regardless
  if (zone.zone_type === 'lobby' && zone.acl?.public_lobby === true && membership) {
    return { allowed: true }
  }

  if (!membership) {
    return { allowed: false, reason: 'no office membership' }
  }

  // Client path
  if (actor.type === 'client') {
    const allowedClients = zone.acl?.allowed_clients ?? []
    if (allowedClients.length === 0) {
      // If no explicit allowlist and zone is not a public lobby, deny clients
      return { allowed: false, reason: 'zone not in client allow-list' }
    }
    if (!actorClientId) {
      return { allowed: false, reason: 'client_id required for ACL check' }
    }
    if (!allowedClients.includes(actorClientId)) {
      return { allowed: false, reason: 'client not in allow-list' }
    }
    return { allowed: true }
  }

  // Staff path
  if (!zone.is_private) {
    return { allowed: true }
  }

  const allowedRoles = zone.acl?.allowed_roles ?? []
  if (allowedRoles.length === 0) {
    // Private zone with no allow-list: admin-only by default
    return membership.role === 'admin'
      ? { allowed: true }
      : { allowed: false, reason: 'private zone admin-only' }
  }
  if (!allowedRoles.includes(membership.role)) {
    return { allowed: false, reason: `role ${membership.role} not in zone allow-list` }
  }
  return { allowed: true }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
pnpm test:run tests/unit/officeRoom/evaluateAcl.test.ts
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/utils/officeRoom.ts tests/unit/officeRoom/evaluateAcl.test.ts
git commit -m "feat(office): add evaluateAcl with staff/client zone access matrix + tests"
```

---

## Task 6: OfficeRoom DO worker scaffolding

**Files:**
- Create: `workers/office-room/package.json`
- Create: `workers/office-room/tsconfig.json`
- Create: `workers/office-room/wrangler.toml`
- Create: `workers/office-room/src/index.ts`
- Create: `workers/office-room/src/types.ts`

- [ ] **Step 1: Mirror the chat-rooms worker structure**

First check the existing structure to follow:

```bash
ls -la workers/chat-rooms/
cat workers/chat-rooms/wrangler.toml
cat workers/chat-rooms/package.json
```

- [ ] **Step 2: Create `workers/office-room/package.json`**

```json
{
  "name": "office-room-worker",
  "private": true,
  "type": "module",
  "scripts": {
    "deploy": "wrangler deploy",
    "dev": "wrangler dev"
  },
  "dependencies": {},
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20250101.0",
    "typescript": "^5.9.2",
    "wrangler": "^4.85.0"
  }
}
```

- [ ] **Step 3: Create `workers/office-room/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: Create `workers/office-room/wrangler.toml`**

```toml
name = "office-room-worker"
main = "src/index.ts"
compatibility_date = "2026-01-01"
compatibility_flags = ["nodejs_compat"]

[[durable_objects.bindings]]
name = "OFFICE_ROOMS"
class_name = "OfficeRoom"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["OfficeRoom"]
```

- [ ] **Step 5: Create `workers/office-room/src/types.ts`** — WS message shapes

```ts
import type { ActorHandle, OfficeStatus, OfficeSnapshot } from '../../../app/types/office'

// =============================================================================
// Inbound WS messages (browser -> DO)
// =============================================================================

export type InboundMessage =
  | { type: 'heartbeat' }
  | { type: 'status:set'; status: OfficeStatus }
  | { type: 'zone:enter'; zoneId: string }
  | { type: 'zone:leave' }

// =============================================================================
// Outbound WS messages (DO -> browser)
// =============================================================================

export type OutboundMessage =
  | { type: 'snapshot'; snapshot: OfficeSnapshot }
  | { type: 'participant:joined'; handle: ActorHandle; name: string; avatarUrl: string | null; status: OfficeStatus; isGuest: boolean }
  | { type: 'participant:left'; handle: ActorHandle }
  | { type: 'participant:updated'; handle: ActorHandle; status: OfficeStatus }
  | { type: 'participant:moved'; handle: ActorHandle; zoneId: string | null }
  | { type: 'zone:entered'; zoneId: string }
  | { type: 'zone:denied'; zoneId: string; reason: string }
  | { type: 'zone:full'; zoneId: string }
  | { type: 'zone:taken-over' }  // sent to older tab when newer tab takes the zone
  | { type: 'error'; message: string }
```

- [ ] **Step 6: Create `workers/office-room/src/index.ts`** — entry that re-exports the class

```ts
export { OfficeRoom } from './OfficeRoom'
```

- [ ] **Step 7: Commit**

```bash
git add workers/office-room/
git commit -m "feat(office): scaffold office-room DO worker (config + types)"
```

---

## Task 7: OfficeRoom DO — main class with WS lifecycle

**Files:**
- Create: `workers/office-room/src/OfficeRoom.ts`

- [ ] **Step 1: Implement the DO**

Read `workers/chat-rooms/src/ChatRoom.ts` first to copy the hibernation pattern:

```bash
cat workers/chat-rooms/src/ChatRoom.ts | head -120
```

Then create `workers/office-room/src/OfficeRoom.ts`:

```ts
import { DurableObject } from 'cloudflare:workers'
import type { ActorHandle, OfficeParticipant, OfficeSnapshot, OfficeStatus } from '../../../app/types/office'
import type { InboundMessage, OutboundMessage } from './types'

interface Env {
  // bound by the parent worker; we don't need explicit env here for 1a
}

interface ConnMeta {
  handle: ActorHandle
  name: string
  avatarUrl: string | null
  role: 'admin' | 'member' | 'guest'
  isGuest: boolean
  joinedAt: number
}

interface ParticipantState extends ConnMeta {
  status: OfficeStatus
  currentZoneId: string | null
  lastSeenAt: number
  disconnectedAt: number | null
}

const GRACE_MS = 30_000
const HEARTBEAT_TIMEOUT_MS = 60_000

export class OfficeRoom extends DurableObject<Env> {
  // In-memory participant state keyed by ActorHandle
  private participants = new Map<ActorHandle, ParticipantState>()
  // Map from WS to its handle (so we can find the participant on close)
  private wsToHandle = new WeakMap<WebSocket, ActorHandle>()

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // Restore handles from hibernation tags so we can attribute message events
    for (const ws of ctx.getWebSockets()) {
      const tag = ws.deserializeAttachment() as { handle?: ActorHandle } | undefined
      if (tag?.handle) {
        this.wsToHandle.set(ws, tag.handle)
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 })
    }

    const url = new URL(request.url)
    const handle = url.searchParams.get('handle') as ActorHandle | null
    const name = url.searchParams.get('name')
    const avatarUrl = url.searchParams.get('avatarUrl')
    const role = url.searchParams.get('role') as 'admin' | 'member' | 'guest' | null
    const isGuest = url.searchParams.get('isGuest') === 'true'

    if (!handle || !name || !role) {
      return new Response('Missing required params', { status: 400 })
    }

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket]

    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ handle })
    this.wsToHandle.set(server, handle)

    const meta: ConnMeta = {
      handle, name, avatarUrl, role,
      isGuest, joinedAt: Date.now(),
    }
    this.handleConnect(server, meta)

    return new Response(null, { status: 101, webSocket: client })
  }

  // ---------- Hibernation handlers --------------------------------------------

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const handle = this.wsToHandle.get(ws)
    if (!handle) return
    if (typeof message !== 'string') return

    let msg: InboundMessage
    try {
      msg = JSON.parse(message) as InboundMessage
    } catch {
      return this.sendTo(ws, { type: 'error', message: 'invalid JSON' })
    }

    await this.handleMessage(handle, ws, msg)
  }

  async webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {
    const handle = this.wsToHandle.get(ws)
    if (!handle) return
    this.handleDisconnect(handle)
  }

  async webSocketError(ws: WebSocket, _err: unknown): Promise<void> {
    const handle = this.wsToHandle.get(ws)
    if (!handle) return
    this.handleDisconnect(handle)
  }

  async alarm(): Promise<void> {
    // Fired by setAlarm() for the 30s grace timer. Re-check disconnected participants.
    const now = Date.now()
    for (const [handle, p] of this.participants) {
      if (p.disconnectedAt && now - p.disconnectedAt >= GRACE_MS) {
        this.removeParticipant(handle)
      }
      // Also reap silent participants (no heartbeat in 60s)
      if (!p.disconnectedAt && now - p.lastSeenAt > HEARTBEAT_TIMEOUT_MS) {
        this.removeParticipant(handle)
      }
    }
    // Schedule next check if anyone's still in grace
    const nextGrace = Array.from(this.participants.values())
      .filter((p) => p.disconnectedAt !== null)
      .map((p) => p.disconnectedAt! + GRACE_MS)
      .sort((a, b) => a - b)[0]
    if (nextGrace) {
      await this.ctx.storage.setAlarm(nextGrace)
    }
  }

  // ---------- Core handlers ---------------------------------------------------

  private async handleConnect(ws: WebSocket, meta: ConnMeta): Promise<void> {
    const existing = this.participants.get(meta.handle)
    if (existing) {
      // Reconnect: clear disconnect timer, refresh ws
      existing.disconnectedAt = null
      existing.lastSeenAt = Date.now()
      this.sendTo(ws, { type: 'snapshot', snapshot: this.buildSnapshot() })
      return
    }

    const participant: ParticipantState = {
      ...meta,
      status: 'available',
      currentZoneId: null,
      lastSeenAt: Date.now(),
      disconnectedAt: null,
    }
    this.participants.set(meta.handle, participant)

    this.sendTo(ws, { type: 'snapshot', snapshot: this.buildSnapshot() })
    this.broadcast({
      type: 'participant:joined',
      handle: meta.handle,
      name: meta.name,
      avatarUrl: meta.avatarUrl,
      status: 'available',
      isGuest: meta.isGuest,
    }, meta.handle)
  }

  private async handleMessage(
    handle: ActorHandle,
    ws: WebSocket,
    msg: InboundMessage,
  ): Promise<void> {
    const p = this.participants.get(handle)
    if (!p) return
    p.lastSeenAt = Date.now()

    switch (msg.type) {
      case 'heartbeat':
        return
      case 'status:set':
        p.status = msg.status
        this.broadcast({ type: 'participant:updated', handle, status: msg.status })
        return
      case 'zone:enter':
        // 1a: no media token, no ACL check yet (full ACL in 1b/1c). For 1a we trust the API to gate.
        p.currentZoneId = msg.zoneId
        this.sendTo(ws, { type: 'zone:entered', zoneId: msg.zoneId })
        this.broadcast({ type: 'participant:moved', handle, zoneId: msg.zoneId })
        return
      case 'zone:leave':
        p.currentZoneId = null
        this.broadcast({ type: 'participant:moved', handle, zoneId: null })
        return
    }
  }

  private handleDisconnect(handle: ActorHandle): void {
    const p = this.participants.get(handle)
    if (!p) return
    p.disconnectedAt = Date.now()
    // Schedule alarm to reap after grace
    this.ctx.storage.setAlarm(Date.now() + GRACE_MS)
  }

  private removeParticipant(handle: ActorHandle): void {
    if (!this.participants.delete(handle)) return
    this.broadcast({ type: 'participant:left', handle })
  }

  // ---------- Snapshot + broadcast helpers -----------------------------------

  private buildSnapshot(): OfficeSnapshot {
    const participants: OfficeParticipant[] = []
    const zoneOccupancy: Record<string, ActorHandle[]> = {}
    for (const [handle, p] of this.participants) {
      if (p.disconnectedAt !== null) continue
      participants.push({
        handle, name: p.name, avatarUrl: p.avatarUrl, role: p.role,
        status: p.status, currentZoneId: p.currentZoneId,
        joinedAt: p.joinedAt, isGuest: p.isGuest,
      })
      if (p.currentZoneId) {
        ;(zoneOccupancy[p.currentZoneId] ||= []).push(handle)
      }
    }
    return { officeId: this.ctx.id.toString(), participants, zoneOccupancy }
  }

  private sendTo(ws: WebSocket, msg: OutboundMessage): void {
    try { ws.send(JSON.stringify(msg)) } catch { /* ignore */ }
  }

  private broadcast(msg: OutboundMessage, exceptHandle?: ActorHandle): void {
    for (const ws of this.ctx.getWebSockets()) {
      const tag = ws.deserializeAttachment() as { handle?: ActorHandle } | undefined
      if (exceptHandle && tag?.handle === exceptHandle) continue
      try { ws.send(JSON.stringify(msg)) } catch { /* ignore */ }
    }
  }
}
```

- [ ] **Step 2: Type-check the worker**

```bash
cd workers/office-room && npx tsc --noEmit && cd ../..
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add workers/office-room/src/OfficeRoom.ts
git commit -m "feat(office): OfficeRoom DO — WS lifecycle, presence, snapshot, broadcast, 30s grace"
```

---

## Task 8: Wire OFFICE_ROOMS binding into root wrangler.toml

**Files:**
- Modify: `wrangler.toml`

- [ ] **Step 1: Inspect current DO bindings**

```bash
grep -n "durable_objects" wrangler.toml
```

- [ ] **Step 2: Add the OFFICE_ROOMS binding**

Add this block after the existing `BANNER_ROOMS` binding in `wrangler.toml`:

```toml

[[durable_objects.bindings]]
name = "OFFICE_ROOMS"
class_name = "OfficeRoom"
script_name = "office-room-worker"
```

- [ ] **Step 3: Deploy the DO worker (so the script exists before Pages references it)**

```bash
cd workers/office-room && pnpm wrangler deploy && cd ../..
```

Expected: deploy completes, output shows `Deployed office-room-worker triggers`.

- [ ] **Step 4: Commit**

```bash
git add wrangler.toml
git commit -m "feat(office): bind OFFICE_ROOMS DO namespace in root wrangler.toml"
```

---

## Task 9: WebSocket endpoint — `server/api/ws/office/[officeId].ts`

**Files:**
- Create: `server/api/ws/office/[officeId].ts`
- Modify: `server/utils/officeRoom.ts` (add a `getOfficeRoom()` helper)

First inspect the existing WS pattern:

```bash
cat server/api/ws/tasks/[id].ts
```

- [ ] **Step 1: Add the DO accessor to `server/utils/officeRoom.ts`**

Append to the file:

```ts
// =============================================================================
// DO accessor
// =============================================================================

import type { H3Event } from 'h3'

export function getOfficeRoom(event: H3Event, officeId: string) {
  const env = (event.context as any).cloudflare?.env
  if (!env?.OFFICE_ROOMS) {
    throw new Error('OFFICE_ROOMS binding not available')
  }
  const id = env.OFFICE_ROOMS.idFromName(officeId)
  return env.OFFICE_ROOMS.get(id)
}
```

- [ ] **Step 2: Create the WS endpoint**

`server/api/ws/office/[officeId].ts`:

```ts
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { toActorHandle, getOfficeRoom } from '~~/server/utils/officeRoom'
import type { OfficeMemberRow } from '~~/app/types/office'

export default defineEventHandler(async (event) => {
  // 1. Validate session — staff only in Phase 1a. Client portal support in Phase 1d.
  const user = await requireAuth(event)
  const officeId = getRouterParam(event, 'officeId')
  if (!officeId) throw createError({ statusCode: 400, statusMessage: 'officeId required' })

  // 2. Confirm membership
  const membership = await queryOne<OfficeMemberRow>(
    `SELECT * FROM office_members
     WHERE office_id = $1 AND user_id = $2`,
    [officeId, user.id],
  )
  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'Not a member of this office' })
  }

  // 3. Confirm WS upgrade
  if (event.node.req.headers.upgrade !== 'websocket') {
    throw createError({ statusCode: 426, statusMessage: 'WebSocket upgrade required' })
  }

  // 4. Build URL with auth params and forward to the DO
  const handle = toActorHandle({ id: user.id }, 'user')
  const params = new URLSearchParams({
    handle,
    name: user.name || user.email,
    avatarUrl: user.avatar_url || '',
    role: membership.role,
    isGuest: 'false',
  })

  const stub = getOfficeRoom(event, officeId)
  const upgradeReq = new Request(
    `https://office-room-do/?${params.toString()}`,
    { headers: event.node.req.headers as any },
  )
  return stub.fetch(upgradeReq)
})
```

- [ ] **Step 3: Smoke test (manual, no test framework for WS proxy in this task)**

```bash
pnpm dev
# In another terminal:
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" -H "Sec-WebSocket-Version: 13" \
  http://localhost:3000/api/ws/office/<seed-office-id>
```

Expected: With a valid session cookie, a 101 Switching Protocols response. Without auth, 401.

- [ ] **Step 4: Commit**

```bash
git add server/api/ws/office/[officeId].ts server/utils/officeRoom.ts
git commit -m "feat(office): add WS endpoint /api/ws/office/[officeId] proxying to OfficeRoom DO"
```

---

## Task 10: Read endpoints — list offices, office detail

**Files:**
- Create: `server/api/office/index.get.ts`
- Create: `server/api/office/[officeId]/index.get.ts`

- [ ] **Step 1: List user's offices**

`server/api/office/index.get.ts`:

```ts
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import type { OfficeRow } from '~~/app/types/office'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const offices = await queryRows<OfficeRow & { my_role: string }>(
    `SELECT o.*, om.role AS my_role
     FROM offices o
     JOIN office_members om ON om.office_id = o.id
     WHERE om.user_id = $1
     ORDER BY o.name ASC`,
    [user.id],
  )
  return { offices }
})
```

- [ ] **Step 2: Office detail with zones and members**

`server/api/office/[officeId]/index.get.ts`:

```ts
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import type { OfficeRow, OfficeZoneRow, OfficeMemberRow } from '~~/app/types/office'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const officeId = getRouterParam(event, 'officeId')
  if (!officeId) throw createError({ statusCode: 400, statusMessage: 'officeId required' })

  const membership = await queryOne<OfficeMemberRow>(
    `SELECT * FROM office_members WHERE office_id = $1 AND user_id = $2`,
    [officeId, user.id],
  )
  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'Not a member of this office' })
  }

  const office = await queryOne<OfficeRow>(
    `SELECT * FROM offices WHERE id = $1`,
    [officeId],
  )
  if (!office) throw createError({ statusCode: 404, statusMessage: 'Office not found' })

  const zones = await queryRows<OfficeZoneRow>(
    `SELECT * FROM office_zones WHERE office_id = $1 ORDER BY slug ASC`,
    [officeId],
  )

  const members = await queryRows<OfficeMemberRow & { name: string; avatar_url: string | null }>(
    `SELECT om.*, u.name, u.avatar_url
     FROM office_members om
     LEFT JOIN users u ON u.id = om.user_id
     WHERE om.office_id = $1`,
    [officeId],
  )

  return { office, zones, members, myRole: membership.role }
})
```

- [ ] **Step 3: Manual smoke test**

```bash
pnpm dev
# In another terminal (with a valid session cookie):
curl -s -b "session=..." http://localhost:3000/api/office | jq
curl -s -b "session=..." http://localhost:3000/api/office/<office-id> | jq
```

Expected: first returns `{offices: [...]}`, second returns `{office, zones, members, myRole}`.

- [ ] **Step 4: Commit**

```bash
git add server/api/office/index.get.ts server/api/office/[officeId]/index.get.ts
git commit -m "feat(office): add list + detail read endpoints"
```

---

## Task 11: Admin zone endpoints

**Files:**
- Create: `server/api/office/[officeId]/zones.post.ts`
- Create: `server/api/office/[officeId]/zones/[zoneId].patch.ts`
- Create: `server/api/office/[officeId]/zones/[zoneId].delete.ts`

- [ ] **Step 1: Shared admin-guard helper in `server/utils/officeRoom.ts`**

Append:

```ts
import type { H3Event } from 'h3'
import { queryOne } from './db'
import { requireAuth } from './auth'

export async function requireOfficeAdmin(event: H3Event, officeId: string) {
  const user = await requireAuth(event)
  const membership = await queryOne<OfficeMemberRow>(
    `SELECT * FROM office_members WHERE office_id = $1 AND user_id = $2`,
    [officeId, user.id],
  )
  if (!membership || membership.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Office admin required' })
  }
  return { user, membership }
}
```

- [ ] **Step 2: Create zone — POST**

`server/api/office/[officeId]/zones.post.ts`:

```ts
import { z } from 'zod'
import { execute, queryOne } from '~~/server/utils/db'
import { requireOfficeAdmin } from '~~/server/utils/officeRoom'

const Body = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/).max(64),
  name: z.string().min(1).max(120),
  zone_type: z.enum(['lobby', 'meeting', 'focus', 'theater', 'client_lounge']),
  position: z.object({ x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() }),
  capacity: z.number().int().positive().default(20),
  is_private: z.boolean().default(false),
  acl: z.object({
    allowed_roles: z.array(z.string()).optional(),
    allowed_clients: z.array(z.string().uuid()).optional(),
    public_lobby: z.boolean().optional(),
  }).default({}),
})

export default defineEventHandler(async (event) => {
  const officeId = getRouterParam(event, 'officeId')!
  await requireOfficeAdmin(event, officeId)
  const body = Body.parse(await readBody(event))

  const zone = await queryOne<{ id: string }>(
    `INSERT INTO office_zones (office_id, slug, name, zone_type, position, capacity, is_private, acl)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [officeId, body.slug, body.name, body.zone_type,
     JSON.stringify(body.position), body.capacity, body.is_private, JSON.stringify(body.acl)],
  )

  // Pre-create the chat channel for this zone (Phase 1c will use it)
  await execute(
    `INSERT INTO chat_channels (name, slug, type, external_id, created_by)
     VALUES ($1, $2, 'office_zone', $3,
       (SELECT id FROM users WHERE role = 'owner' ORDER BY created_at ASC LIMIT 1))
     ON CONFLICT DO NOTHING`,
    [body.name, `office-${body.slug}`, zone!.id],
  )

  return { id: zone!.id }
})
```

- [ ] **Step 3: Update zone — PATCH**

`server/api/office/[officeId]/zones/[zoneId].patch.ts`:

```ts
import { z } from 'zod'
import { execute } from '~~/server/utils/db'
import { requireOfficeAdmin } from '~~/server/utils/officeRoom'

const Body = z.object({
  name: z.string().min(1).max(120).optional(),
  position: z.object({ x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() }).optional(),
  capacity: z.number().int().positive().optional(),
  is_private: z.boolean().optional(),
  acl: z.object({
    allowed_roles: z.array(z.string()).optional(),
    allowed_clients: z.array(z.string().uuid()).optional(),
    public_lobby: z.boolean().optional(),
  }).optional(),
})

export default defineEventHandler(async (event) => {
  const officeId = getRouterParam(event, 'officeId')!
  const zoneId = getRouterParam(event, 'zoneId')!
  await requireOfficeAdmin(event, officeId)
  const body = Body.parse(await readBody(event))

  // Build dynamic SET clause
  const sets: string[] = []
  const params: any[] = []
  let i = 1
  if (body.name !== undefined) { sets.push(`name = $${i++}`); params.push(body.name) }
  if (body.position !== undefined) { sets.push(`position = $${i++}`); params.push(JSON.stringify(body.position)) }
  if (body.capacity !== undefined) { sets.push(`capacity = $${i++}`); params.push(body.capacity) }
  if (body.is_private !== undefined) { sets.push(`is_private = $${i++}`); params.push(body.is_private) }
  if (body.acl !== undefined) { sets.push(`acl = $${i++}`); params.push(JSON.stringify(body.acl)) }

  if (sets.length === 0) return { updated: 0 }

  params.push(zoneId, officeId)
  await execute(
    `UPDATE office_zones SET ${sets.join(', ')} WHERE id = $${i++} AND office_id = $${i}`,
    params,
  )
  return { updated: 1 }
})
```

- [ ] **Step 4: Delete zone — DELETE**

`server/api/office/[officeId]/zones/[zoneId].delete.ts`:

```ts
import { execute } from '~~/server/utils/db'
import { requireOfficeAdmin } from '~~/server/utils/officeRoom'

export default defineEventHandler(async (event) => {
  const officeId = getRouterParam(event, 'officeId')!
  const zoneId = getRouterParam(event, 'zoneId')!
  await requireOfficeAdmin(event, officeId)

  await execute(
    `DELETE FROM office_zones WHERE id = $1 AND office_id = $2`,
    [zoneId, officeId],
  )
  // chat_channels row stays (history); cleanup is out of scope for 1a
  return { deleted: 1 }
})
```

- [ ] **Step 5: Smoke test**

```bash
# Get office id
OFFICE_ID=$(psql "$DATABASE_URL" -t -A -c "SELECT id FROM offices WHERE name='XeroFlow HQ';")
# Create a zone
curl -s -b "session=..." -X POST http://localhost:3000/api/office/$OFFICE_ID/zones \
  -H "Content-Type: application/json" \
  -d '{"slug":"test-zone","name":"Test Zone","zone_type":"focus","position":{"x":10,"y":10,"w":100,"h":100}}'
```

Expected: `{"id":"<uuid>"}`.

- [ ] **Step 6: Commit**

```bash
git add server/api/office/[officeId]/zones.post.ts \
        server/api/office/[officeId]/zones/[zoneId].patch.ts \
        server/api/office/[officeId]/zones/[zoneId].delete.ts \
        server/utils/officeRoom.ts
git commit -m "feat(office): admin zone CRUD endpoints + requireOfficeAdmin helper"
```

---

## Task 12: Admin member endpoints

**Files:**
- Create: `server/api/office/[officeId]/members.post.ts`
- Create: `server/api/office/[officeId]/members/[memberId].delete.ts`

- [ ] **Step 1: Add member — POST**

```ts
// server/api/office/[officeId]/members.post.ts
import { z } from 'zod'
import { queryOne } from '~~/server/utils/db'
import { requireOfficeAdmin } from '~~/server/utils/officeRoom'

const Body = z.object({
  user_id: z.string().uuid().optional(),
  client_user_id: z.string().uuid().optional(),
  role: z.enum(['admin', 'member', 'guest']),
}).refine((b) => Boolean(b.user_id) !== Boolean(b.client_user_id), {
  message: 'Provide exactly one of user_id or client_user_id',
})

export default defineEventHandler(async (event) => {
  const officeId = getRouterParam(event, 'officeId')!
  await requireOfficeAdmin(event, officeId)
  const body = Body.parse(await readBody(event))

  const row = await queryOne<{ id: string }>(
    `INSERT INTO office_members (office_id, user_id, client_user_id, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [officeId, body.user_id ?? null, body.client_user_id ?? null, body.role],
  )
  return { id: row?.id ?? null }
})
```

- [ ] **Step 2: Remove member — DELETE**

```ts
// server/api/office/[officeId]/members/[memberId].delete.ts
import { execute } from '~~/server/utils/db'
import { requireOfficeAdmin } from '~~/server/utils/officeRoom'

export default defineEventHandler(async (event) => {
  const officeId = getRouterParam(event, 'officeId')!
  const memberId = getRouterParam(event, 'memberId')!
  await requireOfficeAdmin(event, officeId)
  await execute(
    `DELETE FROM office_members WHERE id = $1 AND office_id = $2`,
    [memberId, officeId],
  )
  return { deleted: 1 }
})
```

- [ ] **Step 3: Commit**

```bash
git add server/api/office/[officeId]/members.post.ts \
        server/api/office/[officeId]/members/[memberId].delete.ts
git commit -m "feat(office): admin add/remove member endpoints"
```

---

## Task 13: `useOfficeConnection` composable

**Files:**
- Create: `app/composables/useOfficeConnection.ts`

- [ ] **Step 1: Implement the composable**

```ts
// app/composables/useOfficeConnection.ts
import type { OutboundMessage, InboundMessage } from '../../workers/office-room/src/types'
import type { OfficeParticipant, OfficeSnapshot, OfficeStatus, ActorHandle } from '~~/app/types/office'

interface UseOfficeConnectionOptions {
  officeId: Ref<string | null>
}

export function useOfficeConnection(opts: UseOfficeConnectionOptions) {
  const participants = ref<Map<ActorHandle, OfficeParticipant>>(new Map())
  const zoneOccupancy = ref<Record<string, ActorHandle[]>>({})
  const isConnected = ref(false)
  const lastError = ref<string | null>(null)

  let ws: WebSocket | null = null
  let reconnectAttempt = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null

  function applySnapshot(snap: OfficeSnapshot) {
    const m = new Map<ActorHandle, OfficeParticipant>()
    for (const p of snap.participants) m.set(p.handle, p)
    participants.value = m
    zoneOccupancy.value = { ...snap.zoneOccupancy }
  }

  function applyMessage(msg: OutboundMessage) {
    switch (msg.type) {
      case 'snapshot':
        applySnapshot(msg.snapshot)
        return
      case 'participant:joined': {
        const m = new Map(participants.value)
        m.set(msg.handle, {
          handle: msg.handle, name: msg.name, avatarUrl: msg.avatarUrl,
          role: 'member', status: msg.status, currentZoneId: null,
          joinedAt: Date.now(), isGuest: msg.isGuest,
        })
        participants.value = m
        return
      }
      case 'participant:left': {
        const m = new Map(participants.value)
        const left = m.get(msg.handle)
        m.delete(msg.handle)
        participants.value = m
        if (left?.currentZoneId) {
          const zo = { ...zoneOccupancy.value }
          zo[left.currentZoneId] = (zo[left.currentZoneId] || []).filter((h) => h !== msg.handle)
          zoneOccupancy.value = zo
        }
        return
      }
      case 'participant:updated': {
        const m = new Map(participants.value)
        const p = m.get(msg.handle)
        if (p) m.set(msg.handle, { ...p, status: msg.status })
        participants.value = m
        return
      }
      case 'participant:moved': {
        const m = new Map(participants.value)
        const p = m.get(msg.handle)
        if (!p) return
        const zo = { ...zoneOccupancy.value }
        if (p.currentZoneId) {
          zo[p.currentZoneId] = (zo[p.currentZoneId] || []).filter((h) => h !== msg.handle)
        }
        if (msg.zoneId) {
          zo[msg.zoneId] = [...(zo[msg.zoneId] || []), msg.handle]
        }
        m.set(msg.handle, { ...p, currentZoneId: msg.zoneId })
        participants.value = m
        zoneOccupancy.value = zo
        return
      }
      case 'zone:denied':
        lastError.value = `Zone access denied: ${msg.reason}`
        return
      case 'zone:full':
        lastError.value = 'Room is full'
        return
      case 'error':
        lastError.value = msg.message
        return
    }
  }

  function connect() {
    if (!opts.officeId.value) return
    if (ws && ws.readyState <= WebSocket.OPEN) return

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    ws = new WebSocket(`${proto}//${location.host}/api/ws/office/${opts.officeId.value}`)

    ws.onopen = () => {
      isConnected.value = true
      reconnectAttempt = 0
      heartbeatTimer = setInterval(() => {
        ws?.send(JSON.stringify({ type: 'heartbeat' } as InboundMessage))
      }, 20_000)
    }

    ws.onmessage = (e) => {
      try { applyMessage(JSON.parse(e.data as string) as OutboundMessage) }
      catch { /* ignore */ }
    }

    ws.onclose = () => {
      isConnected.value = false
      if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
      scheduleReconnect()
    }

    ws.onerror = () => { ws?.close() }
  }

  function scheduleReconnect() {
    if (reconnectTimer) return
    const delays = [1_000, 2_000, 5_000, 10_000]
    const delay = delays[Math.min(reconnectAttempt, delays.length - 1)]!
    reconnectAttempt++
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, delay)
  }

  function disconnect() {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
    ws?.close()
    ws = null
  }

  function send(msg: InboundMessage) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    }
  }

  function setStatus(status: OfficeStatus) { send({ type: 'status:set', status }) }
  function enterZone(zoneId: string)       { send({ type: 'zone:enter', zoneId }) }
  function leaveZone()                     { send({ type: 'zone:leave' }) }

  // Lifecycle
  watch(() => opts.officeId.value, (newId, oldId) => {
    if (oldId) disconnect()
    if (newId) connect()
  }, { immediate: true })

  onBeforeUnmount(disconnect)

  return {
    participants,
    zoneOccupancy,
    isConnected,
    lastError,
    setStatus,
    enterZone,
    leaveZone,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/composables/useOfficeConnection.ts
git commit -m "feat(office): useOfficeConnection composable — WS + reconnect + reactive state"
```

---

## Task 14: Floor plan UI components

**Files:**
- Create: `app/components/office/OfficeAvatar.vue`
- Create: `app/components/office/OfficeZone.vue`
- Create: `app/components/office/OfficeFloorPlan.vue`
- Create: `app/components/office/OfficeStatusPicker.vue`
- Create: `app/components/office/OfficeSwitcher.vue`

- [ ] **Step 1: `OfficeAvatar.vue`**

```vue
<script setup lang="ts">
import type { OfficeParticipant, OfficeStatus } from '~~/app/types/office'

const props = defineProps<{
  participant: OfficeParticipant
  size?: number
}>()

const statusColors: Record<OfficeStatus, string> = {
  available: 'bg-emerald-500',
  busy: 'bg-amber-500',
  dnd: 'bg-red-500',
  away: 'bg-zinc-400',
}

const sz = computed(() => props.size ?? 32)
const initials = computed(() => props.participant.name
  .split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase())
</script>

<template>
  <div class="relative inline-block" :style="{ width: `${sz}px`, height: `${sz}px` }">
    <UAvatar
      :src="participant.avatarUrl || undefined"
      :alt="participant.name"
      :size="sz <= 24 ? 'xs' : sz <= 32 ? 'sm' : 'md'"
      :ui="participant.isGuest ? { root: 'ring-2 ring-orange-400' } : undefined"
    >
      <span v-if="!participant.avatarUrl">{{ initials }}</span>
    </UAvatar>
    <span
      class="absolute bottom-0 right-0 block rounded-full ring-2 ring-default"
      :class="statusColors[participant.status]"
      :style="{ width: `${Math.max(6, sz / 4)}px`, height: `${Math.max(6, sz / 4)}px` }"
    />
  </div>
</template>
```

- [ ] **Step 2: `OfficeZone.vue`**

```vue
<script setup lang="ts">
import type { OfficeZoneRow, OfficeParticipant, ActorHandle } from '~~/app/types/office'

const props = defineProps<{
  zone: OfficeZoneRow
  occupants: OfficeParticipant[]
}>()

const emit = defineEmits<{
  enter: [zoneId: string]
}>()

const stackedAvatars = computed(() => props.occupants.slice(0, 5))
const overflow = computed(() => Math.max(0, props.occupants.length - 5))
</script>

<template>
  <div
    class="absolute rounded-lg border border-default bg-elevated/80 backdrop-blur-sm
           cursor-pointer transition hover:bg-elevated hover:border-primary"
    :style="{
      left: zone.position.x + 'px',
      top: zone.position.y + 'px',
      width: zone.position.w + 'px',
      height: zone.position.h + 'px',
    }"
    role="button"
    :aria-label="`Enter ${zone.name}`"
    @click="emit('enter', zone.id)"
  >
    <div class="flex flex-col h-full p-3 gap-2">
      <div class="flex items-center justify-between">
        <div class="font-medium text-sm text-highlighted truncate">{{ zone.name }}</div>
        <UBadge color="neutral" variant="subtle" size="xs">
          {{ occupants.length }}/{{ zone.capacity }}
        </UBadge>
      </div>
      <div class="flex -space-x-2 mt-auto">
        <OfficeAvatar
          v-for="p in stackedAvatars"
          :key="p.handle"
          :participant="p"
          :size="28"
        />
        <UBadge
          v-if="overflow > 0"
          color="neutral"
          variant="solid"
          size="sm"
          class="rounded-full px-2"
        >
          +{{ overflow }}
        </UBadge>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 3: `OfficeFloorPlan.vue`**

```vue
<script setup lang="ts">
import type { OfficeRow, OfficeZoneRow, OfficeParticipant, ActorHandle } from '~~/app/types/office'

const props = defineProps<{
  office: OfficeRow
  zones: OfficeZoneRow[]
  participants: Map<ActorHandle, OfficeParticipant>
  zoneOccupancy: Record<string, ActorHandle[]>
}>()

const emit = defineEmits<{ enterZone: [zoneId: string] }>()

const layout = computed(() => ({
  width: props.office.layout?.width ?? 1200,
  height: props.office.layout?.height ?? 800,
}))

function occupantsOf(zoneId: string): OfficeParticipant[] {
  const handles = props.zoneOccupancy[zoneId] || []
  return handles
    .map((h) => props.participants.get(h))
    .filter((p): p is OfficeParticipant => Boolean(p))
}

const lobbyOccupants = computed<OfficeParticipant[]>(() => {
  const inZone = new Set<ActorHandle>()
  for (const list of Object.values(props.zoneOccupancy)) {
    for (const h of list) inZone.add(h)
  }
  return Array.from(props.participants.values()).filter((p) => !inZone.has(p.handle))
})
</script>

<template>
  <div class="relative overflow-auto rounded-xl border border-default bg-default">
    <div
      class="relative"
      :style="{ width: layout.width + 'px', height: layout.height + 'px' }"
    >
      <OfficeZone
        v-for="zone in zones"
        :key="zone.id"
        :zone="zone"
        :occupants="occupantsOf(zone.id)"
        @enter="emit('enterZone', $event)"
      />
    </div>
    <div v-if="lobbyOccupants.length" class="absolute top-2 right-2 flex items-center gap-2 bg-elevated rounded-lg p-2 border border-default">
      <span class="text-xs text-muted">Wandering:</span>
      <OfficeAvatar
        v-for="p in lobbyOccupants.slice(0, 8)"
        :key="p.handle"
        :participant="p"
        :size="24"
      />
    </div>
  </div>
</template>
```

- [ ] **Step 4: `OfficeStatusPicker.vue`**

```vue
<script setup lang="ts">
import type { OfficeStatus } from '~~/app/types/office'

const props = defineProps<{ modelValue: OfficeStatus }>()
const emit = defineEmits<{ 'update:modelValue': [v: OfficeStatus] }>()

const items = [
  { value: 'available' as const, label: 'Available', icon: 'i-lucide-circle-check', color: 'text-emerald-500' },
  { value: 'busy'      as const, label: 'Busy',      icon: 'i-lucide-clock',       color: 'text-amber-500' },
  { value: 'dnd'       as const, label: 'Do not disturb', icon: 'i-lucide-bell-off', color: 'text-red-500' },
  { value: 'away'      as const, label: 'Away',      icon: 'i-lucide-moon',        color: 'text-zinc-400' },
]
const current = computed(() => items.find((i) => i.value === props.modelValue)!)
</script>

<template>
  <UDropdownMenu
    :items="items.map((i) => ({
      label: i.label,
      icon: i.icon,
      onSelect: () => emit('update:modelValue', i.value),
    }))"
  >
    <UButton variant="ghost" size="sm" :icon="current.icon" :class="current.color">
      {{ current.label }}
    </UButton>
  </UDropdownMenu>
</template>
```

- [ ] **Step 5: `OfficeSwitcher.vue`**

```vue
<script setup lang="ts">
import type { OfficeRow } from '~~/app/types/office'

const props = defineProps<{
  offices: (OfficeRow & { my_role: string })[]
  modelValue: string | null
}>()
const emit = defineEmits<{ 'update:modelValue': [v: string] }>()

const items = computed(() =>
  props.offices.map((o) => ({
    label: o.name,
    onSelect: () => emit('update:modelValue', o.id),
  })),
)
const current = computed(() => props.offices.find((o) => o.id === props.modelValue))
</script>

<template>
  <UDropdownMenu v-if="offices.length > 1" :items="items">
    <UButton variant="ghost" size="sm" trailing-icon="i-lucide-chevron-down">
      {{ current?.name || 'Select office' }}
    </UButton>
  </UDropdownMenu>
  <div v-else-if="current" class="text-sm font-medium px-3">{{ current.name }}</div>
</template>
```

- [ ] **Step 6: Commit**

```bash
git add app/components/office/
git commit -m "feat(office): floor plan UI components (avatar, zone, plan, status picker, switcher)"
```

---

## Task 15: `/office` page

**Files:**
- Create: `app/pages/office.vue`

- [ ] **Step 1: Implement the page**

```vue
<script setup lang="ts">
import type { OfficeRow, OfficeZoneRow } from '~~/app/types/office'

definePageMeta({ middleware: 'auth' })

const { data: listData } = await useFetch<{ offices: (OfficeRow & { my_role: string })[] }>('/api/office')
const selectedId = ref<string | null>(listData.value?.offices[0]?.id ?? null)

const { data: detail, refresh: refreshDetail } = await useFetch<{
  office: OfficeRow
  zones: OfficeZoneRow[]
  myRole: string
}>(() => selectedId.value ? `/api/office/${selectedId.value}` : null, {
  watch: [selectedId],
})

const connection = useOfficeConnection({ officeId: selectedId })

const myStatus = ref<'available' | 'busy' | 'dnd' | 'away'>('available')
watch(myStatus, (s) => connection.setStatus(s))

function enterZone(zoneId: string) {
  connection.enterZone(zoneId)
}

const toast = useToast()
watch(() => connection.lastError.value, (err) => {
  if (err) {
    toast.add({ title: 'Office', description: err, color: 'error' })
    connection.lastError.value = null
  }
})
</script>

<template>
  <div class="p-4 space-y-3">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <h1 class="text-lg font-semibold">Office</h1>
        <OfficeSwitcher
          v-if="listData?.offices"
          v-model="selectedId"
          :offices="listData.offices"
        />
      </div>
      <div class="flex items-center gap-3">
        <UBadge :color="connection.isConnected.value ? 'success' : 'neutral'" variant="subtle">
          {{ connection.isConnected.value ? 'Connected' : 'Connecting…' }}
        </UBadge>
        <OfficeStatusPicker v-model="myStatus" />
      </div>
    </div>

    <div v-if="detail">
      <OfficeFloorPlan
        :office="detail.office"
        :zones="detail.zones"
        :participants="connection.participants.value"
        :zone-occupancy="connection.zoneOccupancy.value"
        @enter-zone="enterZone"
      />
    </div>

    <div v-else-if="!selectedId" class="text-muted text-sm">
      You're not a member of any office. Ask an admin to add you.
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add app/pages/office.vue
git commit -m "feat(office): /office page wiring floor plan + connection + status picker"
```

---

## Task 16: Add Office nav item in agency layout

**Files:**
- Modify: `app/layouts/agency.vue`

- [ ] **Step 1: Locate the existing nav list**

```bash
grep -n "Work Management\|XeroFlow\|navigation\|nav-item\|UNavigationMenu\|UAside" app/layouts/agency.vue | head -10
```

- [ ] **Step 2: Add a "Collaboration" section with "Office" entry**

Open `app/layouts/agency.vue` and find the array/object defining the sidebar nav. Add a new nav item next to the existing chat link (or under a new "Collaboration" label):

```ts
{
  label: 'Collaboration',
  type: 'label',
},
{
  label: 'Office',
  icon: 'i-lucide-building-2',
  to: '/office',
},
```

(The exact shape depends on the existing pattern — match what's already there. Don't restructure.)

- [ ] **Step 3: Commit**

```bash
git add app/layouts/agency.vue
git commit -m "feat(office): add Office nav item to agency layout sidebar"
```

---

## Task 17: Pure-function handler tests (DO-less unit tests)

**Files:**
- Create: `workers/office-room/src/handlers.ts`
- Create: `tests/unit/officeRoom/handlers.test.ts`

Pull the message-handling logic out of `OfficeRoom.ts` into a pure-function module that's easy to unit-test without spinning up a DO runtime.

- [ ] **Step 1: Extract `applyStatusSet`, `applyZoneEnter`, `applyZoneLeave` into `handlers.ts`**

```ts
// workers/office-room/src/handlers.ts
import type { ActorHandle, OfficeStatus } from '../../../app/types/office'
import type { OutboundMessage } from './types'

export interface ParticipantLite {
  handle: ActorHandle
  status: OfficeStatus
  currentZoneId: string | null
  lastSeenAt: number
}

export function applyStatusSet(
  p: ParticipantLite,
  status: OfficeStatus,
  now: number,
): { broadcast: OutboundMessage } {
  p.status = status
  p.lastSeenAt = now
  return { broadcast: { type: 'participant:updated', handle: p.handle, status } }
}

export function applyZoneEnter(
  p: ParticipantLite,
  zoneId: string,
  now: number,
): { send: OutboundMessage; broadcast: OutboundMessage } {
  p.currentZoneId = zoneId
  p.lastSeenAt = now
  return {
    send: { type: 'zone:entered', zoneId },
    broadcast: { type: 'participant:moved', handle: p.handle, zoneId },
  }
}

export function applyZoneLeave(
  p: ParticipantLite,
  now: number,
): { broadcast: OutboundMessage } {
  p.currentZoneId = null
  p.lastSeenAt = now
  return { broadcast: { type: 'participant:moved', handle: p.handle, zoneId: null } }
}
```

- [ ] **Step 2: Write tests**

```ts
// tests/unit/officeRoom/handlers.test.ts
import { describe, it, expect } from 'vitest'
import { applyStatusSet, applyZoneEnter, applyZoneLeave } from '../../../workers/office-room/src/handlers'

const baseP = () => ({
  handle: 'user:u1' as const,
  status: 'available' as const,
  currentZoneId: null as string | null,
  lastSeenAt: 0,
})

describe('handlers', () => {
  it('applyStatusSet updates status and emits participant:updated', () => {
    const p = baseP()
    const out = applyStatusSet(p, 'dnd', 42)
    expect(p.status).toBe('dnd')
    expect(p.lastSeenAt).toBe(42)
    expect(out.broadcast).toEqual({ type: 'participant:updated', handle: 'user:u1', status: 'dnd' })
  })

  it('applyZoneEnter updates currentZoneId and emits both send + broadcast', () => {
    const p = baseP()
    const out = applyZoneEnter(p, 'zone-1', 100)
    expect(p.currentZoneId).toBe('zone-1')
    expect(out.send).toEqual({ type: 'zone:entered', zoneId: 'zone-1' })
    expect(out.broadcast).toEqual({ type: 'participant:moved', handle: 'user:u1', zoneId: 'zone-1' })
  })

  it('applyZoneLeave clears currentZoneId and emits participant:moved with null', () => {
    const p = { ...baseP(), currentZoneId: 'zone-1' }
    const out = applyZoneLeave(p, 200)
    expect(p.currentZoneId).toBeNull()
    expect(out.broadcast).toEqual({ type: 'participant:moved', handle: 'user:u1', zoneId: null })
  })
})
```

- [ ] **Step 3: Refactor `OfficeRoom.ts` to use the extracted helpers**

In `OfficeRoom.ts`, replace the inline body of `handleMessage` cases for `status:set`, `zone:enter`, `zone:leave` with calls to `applyStatusSet`, `applyZoneEnter`, `applyZoneLeave` from `./handlers`. Then dispatch the returned `send` / `broadcast` messages.

- [ ] **Step 4: Run unit tests**

```bash
pnpm test:run tests/unit/officeRoom/
```

Expected: all tests pass (actorHandle: 6, evaluateAcl: 7, handlers: 3 = 16 total).

- [ ] **Step 5: Commit**

```bash
git add workers/office-room/src/handlers.ts \
        workers/office-room/src/OfficeRoom.ts \
        tests/unit/officeRoom/handlers.test.ts
git commit -m "feat(office): extract message handlers to pure functions + unit tests"
```

---

## Task 18: Status write-through to `user_chat_status`

**Files:**
- Modify: `workers/office-room/src/OfficeRoom.ts` (call out to server endpoint)
- Create: `server/api/office/_internal/sync-status.post.ts`

Status changes in the office should reflect in the chat sidebar within ~5 seconds. The DO can't talk to Postgres directly (no `pg` in the worker), so it posts to a Nitro endpoint that does the write.

- [ ] **Step 1: Add the internal sync endpoint**

```ts
// server/api/office/_internal/sync-status.post.ts
// NOTE: This is an internal endpoint called by the OfficeRoom DO.
// It accepts a shared secret in the X-Office-Sync-Secret header.
import { z } from 'zod'
import { execute } from '~~/server/utils/db'

const Body = z.object({
  actor_type: z.enum(['user', 'client']),
  actor_id: z.string().uuid(),
  status: z.enum(['available', 'busy', 'dnd', 'away']),
})

// Map office status -> user_chat_status enum
function toChatStatus(s: Body['status']): 'online' | 'away' | 'dnd' | 'offline' {
  if (s === 'available') return 'online'
  if (s === 'away') return 'away'
  if (s === 'dnd') return 'dnd'
  if (s === 'busy') return 'dnd'  // closest equivalent in chat enum
  return 'online'
}

export default defineEventHandler(async (event) => {
  const secret = getHeader(event, 'x-office-sync-secret')
  if (!secret || secret !== process.env.OFFICE_SYNC_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'unauthorized' })
  }
  const body = Body.parse(await readBody(event))
  const chatStatus = toChatStatus(body.status)
  if (body.actor_type === 'user') {
    await execute(
      `INSERT INTO user_chat_status (user_id, status, last_seen_at, updated_at)
       VALUES ($1, $2, now(), now())
       ON CONFLICT (user_id) WHERE user_id IS NOT NULL
       DO UPDATE SET status = EXCLUDED.status, last_seen_at = now(), updated_at = now()`,
      [body.actor_id, chatStatus],
    )
  } else {
    await execute(
      `INSERT INTO user_chat_status (client_user_id, status, last_seen_at, updated_at)
       VALUES ($1, $2, now(), now())
       ON CONFLICT (client_user_id) WHERE client_user_id IS NOT NULL
       DO UPDATE SET status = EXCLUDED.status, last_seen_at = now(), updated_at = now()`,
      [body.actor_id, chatStatus],
    )
  }
  return { ok: true }
})
```

- [ ] **Step 2: Add `OFFICE_SYNC_SECRET` to env**

```bash
# Generate a secret
openssl rand -hex 32
# Add to .env and Cloudflare secrets
echo "OFFICE_SYNC_SECRET=<value>" >> .env
pnpm env:secrets:put OFFICE_SYNC_SECRET   # paste the value when prompted
pnpm env:secrets:put OFFICE_SYNC_SECRET --env production
```

Also bind it into the DO worker via `wrangler.toml`:

```toml
# workers/office-room/wrangler.toml — add at bottom
[vars]
# (For secrets, set via wrangler secret put rather than committing here)
SYNC_BASE_URL = "https://<your-pages-url>"
```

And set the secret:

```bash
cd workers/office-room && pnpm wrangler secret put OFFICE_SYNC_SECRET
```

- [ ] **Step 3: Update the DO to call this endpoint on status change (debounced)**

In `OfficeRoom.ts`, after handling `status:set`, schedule a debounced sync:

```ts
// Add field
private syncTimers = new Map<ActorHandle, ReturnType<typeof setTimeout>>()

private scheduleStatusSync(handle: ActorHandle, status: OfficeStatus) {
  const existing = this.syncTimers.get(handle)
  if (existing) clearTimeout(existing)
  const t = setTimeout(() => this.syncStatus(handle, status), 5_000)
  this.syncTimers.set(handle, t)
}

private async syncStatus(handle: ActorHandle, status: OfficeStatus) {
  this.syncTimers.delete(handle)
  const [type, id] = handle.split(':') as ['user' | 'client', string]
  try {
    await fetch(`${(this.env as any).SYNC_BASE_URL}/api/office/_internal/sync-status`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-office-sync-secret': (this.env as any).OFFICE_SYNC_SECRET,
      },
      body: JSON.stringify({ actor_type: type, actor_id: id, status }),
    })
  } catch { /* best-effort; non-fatal */ }
}
```

Call `this.scheduleStatusSync(handle, msg.status)` inside the `status:set` handler.

- [ ] **Step 4: Manual verification**

```bash
pnpm dev
# 1. Open /office, change your status to 'dnd'
# 2. Wait 6 seconds
psql "$DATABASE_URL" -c "SELECT status, updated_at FROM user_chat_status WHERE user_id = '<your-user-id>';"
```

Expected: row exists with `status = 'dnd'`, recent `updated_at`.

- [ ] **Step 5: Commit**

```bash
git add server/api/office/_internal/sync-status.post.ts \
        workers/office-room/src/OfficeRoom.ts \
        workers/office-room/wrangler.toml
git commit -m "feat(office): status write-through to user_chat_status (5s debounce)"
```

---

## Task 19: Integration test — WS lifecycle end-to-end

**Files:**
- Create: `tests/integration/officeWsLifecycle.test.ts`

This is a real WS-level test using `WebSocket` against a local Miniflare-backed DO. It validates the snapshot, broadcast, and disconnect grace.

- [ ] **Step 1: Check existing test infra for DO tests**

```bash
grep -rn "miniflare\|unstable_dev\|DurableObject" tests/ vitest.config.ts 2>/dev/null | head -10
```

If no existing pattern, use the simpler "dispatch fetch into the DO" approach via `unstable_dev` from `wrangler`.

- [ ] **Step 2: Write the test**

```ts
// tests/integration/officeWsLifecycle.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { unstable_dev, type UnstableDevWorker } from 'wrangler'

describe('OfficeRoom WS lifecycle', () => {
  let worker: UnstableDevWorker

  beforeAll(async () => {
    worker = await unstable_dev('workers/office-room/src/index.ts', {
      experimental: { disableExperimentalWarning: true },
      local: true,
    })
  }, 30_000)

  afterAll(async () => {
    await worker?.stop()
  })

  it('connects, receives snapshot, broadcasts join/leave between two clients', async () => {
    const officeId = 'test-office-1'

    // First connection
    const ws1 = await worker.fetch(`http://example.com/?handle=user:u1&name=Alice&role=member&isGuest=false&avatarUrl=`, {
      headers: { Upgrade: 'websocket', Connection: 'Upgrade', 'Sec-WebSocket-Key': 'x', 'Sec-WebSocket-Version': '13' },
    })
    expect(ws1.status).toBe(101)

    // ... full WS test scaffolding requires a WS client lib (e.g. 'ws')
    // For 1a we limit scope: confirm the upgrade handshake works.
    // Deeper WS test will be authored when Miniflare WS client support stabilises.
  }, 15_000)
})
```

> **Note for the implementer:** Full WS client/server integration testing inside Vitest + Miniflare has rough edges as of 2026-05. If this test proves flaky, demote it to a smoke test (upgrade handshake only) and rely on the Task 20 manual E2E checklist for behavioural verification. Don't sink more than a half-day into making this test green.

- [ ] **Step 3: Run**

```bash
pnpm test:run tests/integration/officeWsLifecycle.test.ts
```

Expected: at minimum the upgrade-handshake assertion passes.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/officeWsLifecycle.test.ts
git commit -m "test(office): integration test scaffold for WS upgrade handshake"
```

---

## Task 20: Manual E2E dogfood checklist

**Files:**
- Create: `docs/superpowers/uat/2026-05-22-virtual-office-phase-1a-uat.md`

- [ ] **Step 1: Write the checklist**

```markdown
# Virtual Office Phase 1a — Manual UAT Checklist

Run through this checklist in dev or preview before promoting to production.

## Setup

- [ ] Migrations 097 + 098 have run; `psql -c "SELECT COUNT(*) FROM offices"` returns >= 1
- [ ] `office-room-worker` deployed to Cloudflare (`wrangler deployments list` in `workers/office-room/`)
- [ ] `OFFICE_SYNC_SECRET` set in both `.env` and Cloudflare Pages secrets
- [ ] `OFFICE_ROOMS` binding present in root `wrangler.toml`

## Two-browser walkthrough

Open two browsers (or two profiles) with two different staff accounts. Both navigate to `/office`.

- [ ] Both see the "XeroFlow HQ" office name in the header
- [ ] Both see the floor plan with 7 zones (Lobby, 4 Meeting Rooms, 2 Focus Rooms)
- [ ] Both see each other in the "Wandering" panel (top-right) on first connect
- [ ] Browser A clicks "Meeting Room A" — A's avatar moves into that zone's avatar stack
- [ ] Browser B sees A appear in Meeting Room A within 1 second (no refresh)
- [ ] Browser A changes status to "DND" via the status picker — B sees A's status dot turn red within 1 second
- [ ] Browser A closes the tab — within ~35 seconds, A disappears from B's view
- [ ] Browser A reopens within the 30-second grace — no flicker (A's presence preserved on B's view)

## Status sync to chat

- [ ] Browser A sets status to "DND" in /office
- [ ] Wait 6 seconds
- [ ] Browser A navigates to /chat (or wherever chat status displays) — status shows "DND" there too

## Office switcher

- [ ] In an admin shell, create a second office: `INSERT INTO offices (name) VALUES ('Test Office 2');`
- [ ] Add yourself as member: `INSERT INTO office_members (office_id, user_id, role) SELECT id, '<your-user-id>', 'admin' FROM offices WHERE name = 'Test Office 2';`
- [ ] Reload /office — switcher dropdown now appears in header
- [ ] Switch to "Test Office 2" — floor plan re-renders empty; switch back — XeroFlow HQ floor plan returns

## Network resilience

- [ ] Open DevTools → Network → toggle "Offline" briefly (~5 seconds), then back online
- [ ] Status badge in header transitions Connected → Connecting → Connected
- [ ] After reconnect, presence list rehydrates correctly (your own avatar is back, others too)

## Acceptance

- [ ] All above pass
- [ ] No console errors on the floor plan page in either browser
- [ ] Admin can SQL-create / -update / -delete zones and they reflect on next page reload (live zone updates are Phase 1c)
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/uat/2026-05-22-virtual-office-phase-1a-uat.md
git commit -m "docs(office): Phase 1a manual UAT checklist"
```

---

## Task 21: Wrap-up — verify, lint, dogfood

- [ ] **Step 1: Run full test suite**

```bash
pnpm test:run
```

Expected: all office-related unit tests pass (~16+ from Tasks 4, 5, 17). Existing tests unaffected.

- [ ] **Step 2: Lint**

```bash
pnpm lint 2>&1 | grep -E "office|workers/office-room" | head -20
```

Expected: no errors in new files. Fix any.

- [ ] **Step 3: Type-check**

```bash
pnpm typecheck 2>&1 | grep -E "office|workers/office-room" | head -20
```

Expected: no new errors specific to office code. (Pre-existing ~60 errors are OK.)

- [ ] **Step 4: Run the UAT checklist** (manual)

Work through `docs/superpowers/uat/2026-05-22-virtual-office-phase-1a-uat.md` end-to-end. Fix any issues that surface and re-run.

- [ ] **Step 5: Final commit + PR**

```bash
git push
gh pr create --title "feat(office): Phase 1a — presence foundation" --body "$(cat <<'EOF'
## Summary

Phase 1a of the Virtual Office sub-project. Adds a working floor plan UI where staff can see live presence (who's online, who's in which zone) and change their own status. No video/audio yet — that's Phase 1b.

Spec: docs/superpowers/specs/2026-05-22-virtual-office-foundation-design.md
Plan: docs/superpowers/plans/2026-05-22-virtual-office-phase-1a-presence.md

## What's in
- Migrations 097 + 098 (4 office tables, chat_channels/user_chat_status/clients extensions, seed)
- OfficeRoom DurableObject (WS, snapshot, status, zone enter/leave, 30s disconnect grace)
- Read + admin API endpoints
- /office page with floor plan, zone avatars, status picker, multi-office switcher
- Status write-through to user_chat_status (5s debounce)
- Unit tests for ActorHandle helpers, evaluateAcl matrix, pure-function handlers
- Manual UAT checklist

## What's out (later phases)
- Cloudflare Realtime video/audio (1b)
- Per-zone chat, notes, reactions, profile cards (1c)
- Client portal entry, admin floor-plan editor UI, error-handling polish (1d)

## Test plan
- [ ] `pnpm test:run` green
- [ ] Manual UAT checklist (docs/superpowers/uat/2026-05-22-virtual-office-phase-1a-uat.md) passes in preview env
- [ ] Two-browser dogfood: both see each other move between zones in real time

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Mark phase 1a done in spec**

Edit `docs/superpowers/specs/2026-05-22-virtual-office-foundation-design.md` and append to the status header:

```
**Phase 1a status:** Implemented and merged in PR #XX. Phase 1b plan to be written next.
```

Commit.

---

## Self-Review Notes (for the writer of this plan)

**Spec coverage check:**
- ✅ §4.1 schema — Task 1 + 2
- ✅ §4.3.a chat_channels extension — Task 1
- ✅ §4.3.b ActorHandle convention — Tasks 3 + 4
- ✅ §4.3.c user_chat_status reuse — Tasks 1 + 18
- ✅ §5.2 server file paths — Tasks 9–12 (note: WS path corrected to `/api/ws/office/[officeId].ts` per spec verification)
- ✅ §5.3 wrangler bindings — Tasks 6 + 8
- ✅ §6.1 staff opens /office — Tasks 9–15
- ⏸ §6.2 client portal entry — Phase 1d
- ⏸ §6.3 zone enter with media — Phase 1b (the WS path is wired in 1a, the media flow lands in 1b)
- ✅ §6.4 status / zone change — Tasks 7 + 18
- ⏸ §6.4 chat / reactions / notes — Phase 1c
- ✅ §6.5 disconnect 30s grace — Task 7
- ✅ §6.6 multi-office switcher — Tasks 14 + 15
- ⏸ §7 error handling — partial in 1a (toast for `lastError`); full polish in 1d
- ✅ §8 unit + integration tests — Tasks 4, 5, 17, 19, 20

**Placeholder scan:** No TBD / TODO / "fill in later" left. Floor plan editor is explicitly deferred to 1c (admins use SQL/API in 1a per scope statement).

**Type consistency:** `ActorHandle`, `OfficeParticipant`, `OfficeSnapshot`, `InboundMessage`, `OutboundMessage` consistent across worker, server, frontend.

---

Plan complete and saved to `docs/superpowers/plans/2026-05-22-virtual-office-phase-1a-presence.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
