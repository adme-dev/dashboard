# Virtual Office — Phase 1c.1 (Audio-first + Drop-in) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the PRD's "audio-first culture + drop-in pattern" thesis — focus rooms enforce audio-only via the `audio_only_publish` CF preset (server-level gate), and a real knock signaling protocol lets one staff member request an instant audio drop-in with another in a focus room.

**Architecture:** Three layers. (a) **DB**: migration 100 sets `cf_preset_default='audio_only_publish'` for existing focus zones + an INSERT trigger for future ones. (b) **Worker**: extend the existing `OfficeRoom` Durable Object with 6 new WS message types (`knock:request`/`knock:incoming`/`knock:accept`/`knock:deny`/`knock:cancel`/`knock:result`) handled by pure functions in `handlers.ts`; in-memory ephemeral knock state map keyed by `knockId`; 30s `setTimeout`-driven timeout; knocker-only capacity-override during an active accept. (c) **Client**: `useOfficeKnocks` composable + two `UModal` components + knockable-room indicator on `OfficeZone.vue` + waiting/result toasts + `public/sounds/knock.mp3` asset.

**Tech Stack:** Nuxt 4 + Vue 3 (Composition API), Cloudflare Workers Durable Objects, `@cloudflare/realtimekit` Core SDK, Vitest, Neon Postgres (via `psql`), Nuxt UI v4 components.

**Spec:** `docs/superpowers/specs/2026-05-23-virtual-office-phase-1c-1-audio-first-dropin-design.md`

---

## File structure

**Create:**
- `server/database/migrations/100-virtual-office-audio-first-focus.sql`
- `app/composables/useOfficeKnocks.ts`
- `app/components/office/OfficeKnockConfirmModal.vue`
- `app/components/office/OfficeKnockIncomingModal.vue`
- `public/sounds/knock.mp3` (binary asset, committed)
- `test/app/composables/useOfficeKnocks.test.ts`

**Modify:**
- `app/types/office.ts` — add knock message types + `KnockResultStatus` union
- `workers/office-room/src/types.ts` — mirror server-side knock message types
- `workers/office-room/src/handlers.ts` — add `applyKnockRequest`, `applyKnockAccept`, `applyKnockDeny`, `applyKnockCancel`, `applyKnockTimeout` pure functions
- `workers/office-room/src/OfficeRoom.ts` — message dispatch + knock state map + setTimeout-based timeout + capacity override on accept + auto-mint authToken via existing `mintZoneToken`
- `app/components/office/OfficeZone.vue` — knockable indicator (ear icon) + click intercept logic
- `test/workers/office-room/handlers.test.ts` — extend with 5 new handler test groups

**Asset note:** `public/sounds/knock.mp3` should be a ~1-second polite knock sound, ~70 dB normalized. If you do not have one ready, use a placeholder from a CC0 source (e.g. freesound.org); the asset file is acceptable as a probe-quality placeholder for the first deploy and can be replaced later without changing any code.

---

## Pre-flight (Paul-driven — required before plan execution starts)

- **1c.1-01:** CF dashboard → Realtime → RealtimeKit → select application `agency-virtual-office` (App ID `365b4758-278c-4685-9738-8d02ddd91ba2`) → **Presets** tab → **Create preset** with name `audio_only_publish`, view_type `GROUP_CALL`, permissions: audio publish ALLOWED, video publish NOT_ALLOWED, screenshare publish NOT_ALLOWED. Save.

When done, paste back:
```
PRESET_CREATED=audio_only_publish
```

Plan execution does not require this preset to exist for Tasks 1-11 (they're DB + worker + client code). It IS required before Task 12 (UAT walkthrough) — focus rooms will mint participants with `audio_only_publish` preset starting from Task 4's first deploy, and CF will reject mints if the preset doesn't exist.

---

## Conventions used in this plan

Throughout, working directory is the worktree root:
```
/Users/paulgiurin/Documents/Projects/dashboard/.claude/worktrees/virtual-office-1b-media
```

Branch: `feat/virtual-office-1b-media` (continues PR #11; commits land alongside 1b' work).

DB password for migration 100 application is loaded from `.env` per CLAUDE.md:
```bash
export DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-)
```

---

## Task 1: Apply migration 100 — audio-first focus zones

**Files:**
- Create: `server/database/migrations/100-virtual-office-audio-first-focus.sql`

- [ ] **Step 1: Write the migration file**

Create `server/database/migrations/100-virtual-office-audio-first-focus.sql`:

```sql
-- =============================================================================
-- Phase 1c.1 — Audio-first focus zones
-- =============================================================================
-- Focus zones default to audio_only_publish preset (CF RealtimeKit). Existing
-- focus zones flipped from staff_full → audio_only_publish; future inserts
-- enforced via BEFORE INSERT trigger so the admin floor-plan editor (1c.5)
-- and any future seeding code auto-get the right default.

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

- [ ] **Step 2: Apply to production DB**

```bash
export DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/100-virtual-office-audio-first-focus.sql
```

Expected output ending with `COMMIT`. No errors.

- [ ] **Step 3: Verify state**

```bash
psql "$DATABASE_URL" -c "SELECT slug, zone_type, cf_preset_default FROM office_zones WHERE zone_type='focus' ORDER BY slug"
```

Expected: each focus zone row shows `cf_preset_default = 'audio_only_publish'`.

```bash
psql "$DATABASE_URL" -c "\d office_zones" | grep -A1 trg_office_zones
```

Expected: `Triggers: trg_office_zones_default_preset BEFORE INSERT ON office_zones FOR EACH ROW EXECUTE FUNCTION office_zones_default_preset_for_focus()`.

- [ ] **Step 4: Commit**

```bash
git add server/database/migrations/100-virtual-office-audio-first-focus.sql
git commit -m "$(cat <<'EOF'
feat(office): migration 100 — focus zones default to audio_only_publish

Existing focus zones flipped from staff_full → audio_only_publish.
BEFORE INSERT trigger enforces the default on future focus zones so
the 1c.5 admin floor-plan editor and any future seeding code auto-get
the right preset. Defense in depth at the DB layer.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: WS knock message types

**Files:**
- Modify: `app/types/office.ts`
- Modify: `workers/office-room/src/types.ts`

- [ ] **Step 1: Read current shape of `app/types/office.ts` to find where to insert**

```bash
grep -n 'export.*ZoneEnter\|zone:enter\|zone:joined\|MediaCredentials' app/types/office.ts | head -10
```

This will show the existing zone-related message types so the new knock types can sit alongside them, following the same export pattern.

- [ ] **Step 2: Add knock types to `app/types/office.ts`**

Append the following inside the existing exports block (place near the other zone-related WS message types):

```ts
// =============================================================================
// Phase 1c.1 — Knock pattern (audio-first + drop-in)
// =============================================================================

export type KnockId = string & { readonly __brand: 'KnockId' }

export type KnockResultStatus =
  | 'accepted'
  | 'denied'
  | 'timeout'
  | 'no-occupant'
  | 'busy'
  | 'not-knockable'
  | 'self-knock'

/** Client → server: knocker initiates a knock on a focus/private zone. */
export interface KnockRequestMessage {
  type: 'knock:request'
  targetZoneId: string
}

/** Server → knockee: knockee's client should open the accept/deny modal. */
export interface KnockIncomingMessage {
  type: 'knock:incoming'
  knockId: KnockId
  fromHandle: ActorHandle
  fromName: string
  zoneId: string
  /** ms remaining at message send time; client uses for countdown */
  ttlMs: number
}

/** Client → server: knockee accepts the knock. */
export interface KnockAcceptMessage {
  type: 'knock:accept'
  knockId: KnockId
}

/** Client → server: knockee denies the knock. */
export interface KnockDenyMessage {
  type: 'knock:deny'
  knockId: KnockId
}

/** Client → server: knocker cancels their pending knock before response. */
export interface KnockCancelMessage {
  type: 'knock:cancel'
  knockId: KnockId
}

/** Server → knocker: terminal result for an outbound knock. */
export interface KnockResultMessage {
  type: 'knock:result'
  knockId: KnockId
  status: KnockResultStatus
  /**
   * Present only when status === 'accepted'. Full MediaCredentials so the
   * client can call useOfficeRealtime.connect(creds) directly — same shape
   * used by zone:joined.
   */
  media?: MediaCredentials
}
```

`ActorHandle` and `MediaCredentials` are already exported from this file (used by existing presence + zone-join types) — no new import needed.

**Note — spec refinement:** the original spec §3 listed `authToken?: string` on `knock:result`. During plan self-review, this proved insufficient because `useOfficeRealtime.connect()` accepts a full `MediaCredentials` shape (matches the existing zone:enter response). The refinement carries the full credentials object instead. The worker already obtains all required fields (`meetingId`, `participantId`, `authToken`, `presetName`, `expiresAt`) from `mintZoneToken`, so no additional API calls are needed.

- [ ] **Step 3: Mirror types in `workers/office-room/src/types.ts`**

This file is the worker-side message union (used by `OutboundMessage` and `InboundMessage`). Append the same knock interfaces (matching shape) and extend the existing union types:

First, read the existing union definitions:

```bash
grep -nE 'OutboundMessage|InboundMessage|type Out|type In' workers/office-room/src/types.ts
```

Then add the knock interfaces (re-import from the shared `app/types/office`):

```ts
import type {
  KnockResultStatus,
  KnockRequestMessage,
  KnockIncomingMessage,
  KnockAcceptMessage,
  KnockDenyMessage,
  KnockCancelMessage,
  KnockResultMessage,
} from '../../../app/types/office'

// Add to the InboundMessage union:
export type InboundMessage =
  | /* existing types */
  | KnockRequestMessage
  | KnockAcceptMessage
  | KnockDenyMessage
  | KnockCancelMessage

// Add to the OutboundMessage union:
export type OutboundMessage =
  | /* existing types */
  | KnockIncomingMessage
  | KnockResultMessage
```

Replace `/* existing types */` with whatever the file already lists. Do not remove anything.

- [ ] **Step 4: Typecheck — confirm no breakage**

```bash
pnpm test:run test/workers/office-room/ 2>&1 | tail -10
```

Expected: existing 10 worker tests still pass. New types are unused so far, but the union extension must compile.

- [ ] **Step 5: Commit**

```bash
git add app/types/office.ts workers/office-room/src/types.ts
git commit -m "$(cat <<'EOF'
feat(office): knock WS message types for Phase 1c.1

Adds KnockResultStatus union + 6 message interfaces (KnockRequest,
KnockIncoming, KnockAccept, KnockDeny, KnockCancel, KnockResult).
Extends OutboundMessage / InboundMessage unions in workers/office-
room/src/types.ts. No runtime behavior yet — handlers and dispatch
land in Task 3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Pure-function knock handlers

**Files:**
- Modify: `workers/office-room/src/handlers.ts`
- Modify: `test/workers/office-room/handlers.test.ts`

Five new handler functions following the existing pattern (`applyStatusSet`, `applyZoneEnter`, `applyZoneLeave`). Each takes a state shape, mutates it, returns the outbound dispatch info.

The shared knock-state shape:

```ts
export interface KnockStateEntry {
  knockId: string
  knockerHandle: string  // ActorHandle
  knockerName: string
  knockerWsId: string
  knockeeHandle: string
  knockeeWsId: string
  zoneId: string
  startedAt: number
  expiresAt: number
}

export interface KnockState {
  // Primary index — knockId → entry
  byId: Map<string, KnockStateEntry>
  // Fast busy-check — zoneId → active knockId (only set while accept is in progress)
  acceptedByZone: Map<string, string>
}
```

- [ ] **Step 1: Write failing tests for `applyKnockRequest`**

Append to `test/workers/office-room/handlers.test.ts`:

```ts
import {
  applyKnockRequest,
  applyKnockAccept,
  applyKnockDeny,
  applyKnockCancel,
  applyKnockTimeout,
  type KnockState,
  type KnockStateEntry,
} from '../../../workers/office-room/src/handlers'

const emptyKnockState = (): KnockState => ({
  byId: new Map(),
  acceptedByZone: new Map(),
})

describe('applyKnockRequest', () => {
  const baseInput = {
    state: emptyKnockState(),
    knockId: 'k-1',
    knockerHandle: 'user:alice',
    knockerName: 'Alice',
    knockerWsId: 'ws-a',
    knockeeHandle: 'user:bob',
    knockeeWsId: 'ws-b',
    zoneId: 'zone-focus-1',
    now: 1000,
    ttlMs: 30_000,
  }

  it('inserts a new knock entry and returns knock:incoming for knockee', () => {
    const input = { ...baseInput, state: emptyKnockState() }
    const out = applyKnockRequest(input)
    expect(out.kind).toBe('ok')
    if (out.kind !== 'ok') return
    expect(input.state.byId.size).toBe(1)
    expect(input.state.byId.get('k-1')?.zoneId).toBe('zone-focus-1')
    expect(input.state.byId.get('k-1')?.expiresAt).toBe(31_000)
    expect(out.toKnockee).toEqual({
      type: 'knock:incoming',
      knockId: 'k-1',
      fromHandle: 'user:alice',
      fromName: 'Alice',
      zoneId: 'zone-focus-1',
      ttlMs: 30_000,
    })
  })

  it('rejects when a knock with same knockId already exists', () => {
    const state = emptyKnockState()
    state.byId.set('k-1', {} as KnockStateEntry)
    const out = applyKnockRequest({ ...baseInput, state })
    expect(out.kind).toBe('error')
    if (out.kind !== 'error') return
    expect(out.reason).toBe('duplicate-knock-id')
  })
})
```

- [ ] **Step 2: Run test to verify FAIL**

```bash
pnpm test:run test/workers/office-room/handlers.test.ts 2>&1 | tail -15
```

Expected: FAIL with "Cannot find module" or "applyKnockRequest is not a function".

- [ ] **Step 3: Implement `applyKnockRequest` in `handlers.ts`**

Append to `workers/office-room/src/handlers.ts`:

```ts
// =============================================================================
// Phase 1c.1 — Knock state + pure-function handlers
// =============================================================================

import type {
  KnockIncomingMessage,
  KnockResultMessage,
  KnockResultStatus,
} from '../../../app/types/office'

export interface KnockStateEntry {
  knockId: string
  knockerHandle: string
  knockerName: string
  knockerWsId: string
  knockeeHandle: string
  knockeeWsId: string
  zoneId: string
  startedAt: number
  expiresAt: number
}

export interface KnockState {
  byId: Map<string, KnockStateEntry>
  acceptedByZone: Map<string, string>
}

export type KnockHandlerResult<T> =
  | { kind: 'ok' } & T
  | { kind: 'error'; reason: string }

export interface KnockRequestInput {
  state: KnockState
  knockId: string
  knockerHandle: string
  knockerName: string
  knockerWsId: string
  knockeeHandle: string
  knockeeWsId: string
  zoneId: string
  now: number
  ttlMs: number
}

export function applyKnockRequest(
  input: KnockRequestInput,
): KnockHandlerResult<{ toKnockee: KnockIncomingMessage }> {
  if (input.state.byId.has(input.knockId)) {
    return { kind: 'error', reason: 'duplicate-knock-id' }
  }
  input.state.byId.set(input.knockId, {
    knockId: input.knockId,
    knockerHandle: input.knockerHandle,
    knockerName: input.knockerName,
    knockerWsId: input.knockerWsId,
    knockeeHandle: input.knockeeHandle,
    knockeeWsId: input.knockeeWsId,
    zoneId: input.zoneId,
    startedAt: input.now,
    expiresAt: input.now + input.ttlMs,
  })
  return {
    kind: 'ok',
    toKnockee: {
      type: 'knock:incoming',
      knockId: input.knockId as any,
      fromHandle: input.knockerHandle as any,
      fromName: input.knockerName,
      zoneId: input.zoneId,
      ttlMs: input.ttlMs,
    },
  }
}
```

- [ ] **Step 4: Run test to verify PASS**

```bash
pnpm test:run test/workers/office-room/handlers.test.ts 2>&1 | tail -15
```

Expected: existing handler tests + 2 new tests for `applyKnockRequest` pass.

- [ ] **Step 5: Write failing tests for `applyKnockAccept`**

Append to `test/workers/office-room/handlers.test.ts`:

```ts
describe('applyKnockAccept', () => {
  it('clears the entry, marks zone busy, returns dispatch info', () => {
    const state = emptyKnockState()
    state.byId.set('k-1', {
      knockId: 'k-1',
      knockerHandle: 'user:alice',
      knockerName: 'Alice',
      knockerWsId: 'ws-a',
      knockeeHandle: 'user:bob',
      knockeeWsId: 'ws-b',
      zoneId: 'zone-focus-1',
      startedAt: 1000,
      expiresAt: 31_000,
    })
    const out = applyKnockAccept({ state, knockId: 'k-1' })
    expect(out.kind).toBe('ok')
    if (out.kind !== 'ok') return
    expect(state.byId.has('k-1')).toBe(false)
    expect(state.acceptedByZone.get('zone-focus-1')).toBe('k-1')
    expect(out.knockerHandle).toBe('user:alice')
    expect(out.knockerWsId).toBe('ws-a')
    expect(out.zoneId).toBe('zone-focus-1')
  })

  it('rejects when knockId not found', () => {
    const state = emptyKnockState()
    const out = applyKnockAccept({ state, knockId: 'missing' })
    expect(out.kind).toBe('error')
  })
})
```

- [ ] **Step 6: Run test to verify FAIL, implement, then PASS**

Run `pnpm test:run test/workers/office-room/handlers.test.ts` — expect FAIL on the new accept test.

Append to `handlers.ts`:

```ts
export interface KnockAcceptInput {
  state: KnockState
  knockId: string
}

export interface KnockAcceptOk {
  knockerHandle: string
  knockerName: string
  knockerWsId: string
  knockeeHandle: string
  zoneId: string
}

export function applyKnockAccept(
  input: KnockAcceptInput,
): KnockHandlerResult<KnockAcceptOk> {
  const entry = input.state.byId.get(input.knockId)
  if (!entry) return { kind: 'error', reason: 'not-found' }
  input.state.byId.delete(input.knockId)
  input.state.acceptedByZone.set(entry.zoneId, input.knockId)
  return {
    kind: 'ok',
    knockerHandle: entry.knockerHandle,
    knockerName: entry.knockerName,
    knockerWsId: entry.knockerWsId,
    knockeeHandle: entry.knockeeHandle,
    zoneId: entry.zoneId,
  }
}
```

Re-run the test — expect PASS.

- [ ] **Step 7: Write + run + implement `applyKnockDeny`**

Test:

```ts
describe('applyKnockDeny', () => {
  it('clears the entry and returns knock:result with denied status', () => {
    const state = emptyKnockState()
    state.byId.set('k-1', {
      knockId: 'k-1', knockerHandle: 'user:alice', knockerName: 'Alice',
      knockerWsId: 'ws-a', knockeeHandle: 'user:bob', knockeeWsId: 'ws-b',
      zoneId: 'zone-focus-1', startedAt: 1000, expiresAt: 31_000,
    })
    const out = applyKnockDeny({ state, knockId: 'k-1' })
    expect(out.kind).toBe('ok')
    if (out.kind !== 'ok') return
    expect(state.byId.has('k-1')).toBe(false)
    expect(out.toKnocker).toEqual({
      type: 'knock:result',
      knockId: 'k-1',
      status: 'denied',
    })
    expect(out.knockerWsId).toBe('ws-a')
  })

  it('rejects when knockId not found', () => {
    const out = applyKnockDeny({ state: emptyKnockState(), knockId: 'missing' })
    expect(out.kind).toBe('error')
  })
})
```

Implementation:

```ts
export interface KnockDenyInput {
  state: KnockState
  knockId: string
}

export function applyKnockDeny(
  input: KnockDenyInput,
): KnockHandlerResult<{ toKnocker: KnockResultMessage; knockerWsId: string }> {
  const entry = input.state.byId.get(input.knockId)
  if (!entry) return { kind: 'error', reason: 'not-found' }
  input.state.byId.delete(input.knockId)
  return {
    kind: 'ok',
    toKnocker: {
      type: 'knock:result',
      knockId: input.knockId as any,
      status: 'denied',
    },
    knockerWsId: entry.knockerWsId,
  }
}
```

- [ ] **Step 8: Write + run + implement `applyKnockCancel`**

Test:

```ts
describe('applyKnockCancel', () => {
  it('clears the entry; no dispatch to either party', () => {
    const state = emptyKnockState()
    state.byId.set('k-1', {
      knockId: 'k-1', knockerHandle: 'user:alice', knockerName: 'Alice',
      knockerWsId: 'ws-a', knockeeHandle: 'user:bob', knockeeWsId: 'ws-b',
      zoneId: 'zone-focus-1', startedAt: 1000, expiresAt: 31_000,
    })
    const out = applyKnockCancel({ state, knockId: 'k-1', cancellerWsId: 'ws-a' })
    expect(out.kind).toBe('ok')
    if (out.kind !== 'ok') return
    expect(state.byId.has('k-1')).toBe(false)
  })

  it('rejects when cancellation does not come from the original knocker', () => {
    const state = emptyKnockState()
    state.byId.set('k-1', {
      knockId: 'k-1', knockerHandle: 'user:alice', knockerName: 'Alice',
      knockerWsId: 'ws-a', knockeeHandle: 'user:bob', knockeeWsId: 'ws-b',
      zoneId: 'zone-focus-1', startedAt: 1000, expiresAt: 31_000,
    })
    const out = applyKnockCancel({ state, knockId: 'k-1', cancellerWsId: 'ws-c' })
    expect(out.kind).toBe('error')
    if (out.kind !== 'error') return
    expect(out.reason).toBe('not-canceller')
  })
})
```

Implementation:

```ts
export interface KnockCancelInput {
  state: KnockState
  knockId: string
  cancellerWsId: string
}

export function applyKnockCancel(
  input: KnockCancelInput,
): KnockHandlerResult<Record<string, never>> {
  const entry = input.state.byId.get(input.knockId)
  if (!entry) return { kind: 'error', reason: 'not-found' }
  if (entry.knockerWsId !== input.cancellerWsId) {
    return { kind: 'error', reason: 'not-canceller' }
  }
  input.state.byId.delete(input.knockId)
  return { kind: 'ok' }
}
```

- [ ] **Step 9: Write + run + implement `applyKnockTimeout`**

Test:

```ts
describe('applyKnockTimeout', () => {
  it('clears the entry and returns knock:result with timeout status', () => {
    const state = emptyKnockState()
    state.byId.set('k-1', {
      knockId: 'k-1', knockerHandle: 'user:alice', knockerName: 'Alice',
      knockerWsId: 'ws-a', knockeeHandle: 'user:bob', knockeeWsId: 'ws-b',
      zoneId: 'zone-focus-1', startedAt: 1000, expiresAt: 31_000,
    })
    const out = applyKnockTimeout({ state, knockId: 'k-1' })
    expect(out.kind).toBe('ok')
    if (out.kind !== 'ok') return
    expect(state.byId.has('k-1')).toBe(false)
    expect(out.toKnocker.status).toBe('timeout')
    expect(out.knockerWsId).toBe('ws-a')
  })

  it('returns ok-noop when entry already gone (accept beat the timer)', () => {
    const out = applyKnockTimeout({ state: emptyKnockState(), knockId: 'missing' })
    expect(out.kind).toBe('error')
    if (out.kind !== 'error') return
    expect(out.reason).toBe('not-found')
  })
})
```

Implementation:

```ts
export interface KnockTimeoutInput {
  state: KnockState
  knockId: string
}

export function applyKnockTimeout(
  input: KnockTimeoutInput,
): KnockHandlerResult<{ toKnocker: KnockResultMessage; knockerWsId: string }> {
  const entry = input.state.byId.get(input.knockId)
  if (!entry) return { kind: 'error', reason: 'not-found' }
  input.state.byId.delete(input.knockId)
  return {
    kind: 'ok',
    toKnocker: {
      type: 'knock:result',
      knockId: input.knockId as any,
      status: 'timeout',
    },
    knockerWsId: entry.knockerWsId,
  }
}
```

- [ ] **Step 10: Run all handler tests, confirm green**

```bash
pnpm test:run test/workers/office-room/handlers.test.ts
```

Expected: all existing tests + 9 new knock tests pass (2 request, 2 accept, 2 deny, 2 cancel, 2 timeout — note Step 1 said 2 request tests but step 5 added 2 more; final count is ~10 knock tests).

- [ ] **Step 11: Commit**

```bash
git add workers/office-room/src/handlers.ts test/workers/office-room/handlers.test.ts
git commit -m "$(cat <<'EOF'
feat(office): pure-function knock handlers + 10 unit tests

Five handlers added matching existing applyStatusSet/applyZoneEnter
pattern: applyKnockRequest, applyKnockAccept, applyKnockDeny,
applyKnockCancel, applyKnockTimeout. State held in a KnockState
shape (byId map + acceptedByZone busy-index). No DO wiring yet
— that lands in Task 4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Wire knock messages into OfficeRoom Durable Object

**Files:**
- Modify: `workers/office-room/src/OfficeRoom.ts`

This task does NOT add new tests directly — it wires the pure handlers from Task 3 into the DO message dispatch loop. Verification is via the existing test suite (handlers tests already cover the state-mutation logic) + a smoke `wrangler tail` on deploy.

- [ ] **Step 1: Read the current OfficeRoom shape around the switch/case dispatch**

```bash
sed -n '300,410p' workers/office-room/src/OfficeRoom.ts
```

This will show the existing `case 'zone:enter':` and `case 'zone:leave':` blocks. The new cases go immediately after them in the same switch statement, plus knock state needs to live on the DO class.

- [ ] **Step 2: Add knock state field to the DO class**

Near the top of the `OfficeRoom` class (alongside other instance state), add:

```ts
// Phase 1c.1 — ephemeral knock state. Map<knockId, entry> + zone busy index.
// Lives in DO memory only; clears on hibernation. setTimeout-driven timeouts
// die on hibernation too which is acceptable per spec (§7 Risks).
private knockState: KnockState = { byId: new Map(), acceptedByZone: new Map() }
private knockTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map()
```

Add the type import at the top of the file:

```ts
import {
  applyKnockRequest,
  applyKnockAccept,
  applyKnockDeny,
  applyKnockCancel,
  applyKnockTimeout,
  type KnockState,
} from './handlers'
```

- [ ] **Step 3: Add `knock:request` case to the message dispatch switch**

Add to the switch block in the message handler (sibling to `case 'zone:enter':`):

```ts
case 'knock:request': {
  const now = Date.now()
  // Validate: target zone must exist + be focus/private + have an occupant
  const targetZone = this.zoneMeta?.[msg.targetZoneId]
  if (!targetZone) {
    this.sendTo(ws, { type: 'knock:result', knockId: '' as any, status: 'not-knockable' })
    break
  }
  if (targetZone.zone_type !== 'focus' && targetZone.zone_type !== 'private') {
    this.sendTo(ws, { type: 'knock:result', knockId: '' as any, status: 'not-knockable' })
    break
  }
  const occupants = Array.from(this.participants.values()).filter(p => p.currentZoneId === msg.targetZoneId)
  if (occupants.length === 0) {
    this.sendTo(ws, { type: 'knock:result', knockId: '' as any, status: 'no-occupant' })
    break
  }
  // Self-knock check
  const knockerParticipant = this.participantsByWs.get(ws)
  if (!knockerParticipant) break
  if (knockerParticipant.currentZoneId === msg.targetZoneId) {
    this.sendTo(ws, { type: 'knock:result', knockId: '' as any, status: 'self-knock' })
    break
  }
  // Busy check
  if (this.knockState.acceptedByZone.has(msg.targetZoneId)) {
    this.sendTo(ws, { type: 'knock:result', knockId: '' as any, status: 'busy' })
    break
  }
  // Find knockee WS (first occupant for v1 — focus rooms have capacity 1)
  const knockeeP = occupants[0]
  const knockeeWs = this.wsByParticipantHandle.get(knockeeP.handle)
  if (!knockeeWs) {
    this.sendTo(ws, { type: 'knock:result', knockId: '' as any, status: 'no-occupant' })
    break
  }
  // Mint knockId + apply handler
  const knockId = crypto.randomUUID()
  const result = applyKnockRequest({
    state: this.knockState,
    knockId,
    knockerHandle: knockerParticipant.handle,
    knockerName: knockerParticipant.name ?? 'Someone',
    knockerWsId: this.wsId(ws),
    knockeeHandle: knockeeP.handle,
    knockeeWsId: this.wsId(knockeeWs),
    zoneId: msg.targetZoneId,
    now,
    ttlMs: 30_000,
  })
  if (result.kind !== 'ok') break  // duplicate-knock-id is essentially impossible with UUID
  // Dispatch to knockee
  this.sendTo(knockeeWs, result.toKnockee)
  // Schedule timeout
  const timeoutHandle = setTimeout(() => this.fireKnockTimeout(knockId), 30_000)
  this.knockTimeouts.set(knockId, timeoutHandle)
  break
}
```

`this.wsId(ws)`, `this.participantsByWs`, `this.wsByParticipantHandle`, `this.zoneMeta`, `this.sendTo`, and `this.participants` are existing patterns in `OfficeRoom.ts` — verify they exist and match the names used here; rename if the actual class uses different field names.

- [ ] **Step 4: Add `knock:deny` and `knock:cancel` cases**

```ts
case 'knock:deny': {
  this.clearKnockTimeout(msg.knockId)
  const result = applyKnockDeny({ state: this.knockState, knockId: msg.knockId })
  if (result.kind !== 'ok') break
  const knockerWs = this.wsById.get(result.knockerWsId)
  if (knockerWs) this.sendTo(knockerWs, result.toKnocker)
  break
}

case 'knock:cancel': {
  this.clearKnockTimeout(msg.knockId)
  const result = applyKnockCancel({
    state: this.knockState,
    knockId: msg.knockId,
    cancellerWsId: this.wsId(ws),
  })
  // No dispatch on cancel — knocker already knows they cancelled
  break
}
```

`this.wsById` is the inverse of `this.wsByParticipantHandle` (ws-id-as-string → WebSocket); verify it exists; if not, add it alongside the other WS maps (it's needed for routing replies to specific WSes after a state-only lookup).

- [ ] **Step 5: Add `knock:accept` case + helper for capacity override**

```ts
case 'knock:accept': {
  this.clearKnockTimeout(msg.knockId)
  const result = applyKnockAccept({ state: this.knockState, knockId: msg.knockId })
  if (result.kind !== 'ok') break
  // Find the actual knockee participant + verify they're still in the target zone
  const knockeeP = this.participants.get(result.knockeeHandle)
  if (!knockeeP || knockeeP.currentZoneId !== result.zoneId) {
    // Knockee left mid-knock — tell knocker
    const knockerWs = this.wsById.get(result.knockerWsId)
    if (knockerWs) {
      this.sendTo(knockerWs, {
        type: 'knock:result', knockId: msg.knockId, status: 'no-occupant',
      })
    }
    this.knockState.acceptedByZone.delete(result.zoneId)
    break
  }
  // Mint a participant token for the knocker via the existing realtime helper
  const zoneMeta = this.zoneMeta?.[result.zoneId]
  if (!zoneMeta || !zoneMeta.cf_meeting_id) {
    // Should not happen — knockee is in the zone, so meeting must exist
    this.knockState.acceptedByZone.delete(result.zoneId)
    break
  }
  let media: MediaCredentials
  try {
    const minted = await mintZoneToken({
      env: this.env,
      meetingId: zoneMeta.cf_meeting_id,
      handle: result.knockerHandle as any,
      name: result.knockerName,
      presetName: 'audio_only_publish',
    })
    // Build the full MediaCredentials shape — same pattern as zone:enter dispatch.
    // Look at the existing zone:enter case in OfficeRoom.ts for the canonical
    // construction (token TTL constant, expiresAt arithmetic). The fields below
    // are the minimum required by app/types/office.ts MediaCredentials.
    media = {
      meetingId: zoneMeta.cf_meeting_id,
      participantId: minted.participantId,
      authToken: minted.authToken,
      presetName: 'audio_only_publish',
      expiresAt: Date.now() + TOKEN_TTL_MS,  // reuse the constant zone:enter uses
    }
  } catch (err) {
    // Surface as no-occupant-style failure to knocker so UI clears
    this.knockState.acceptedByZone.delete(result.zoneId)
    const knockerWs = this.wsById.get(result.knockerWsId)
    if (knockerWs) {
      this.sendTo(knockerWs, {
        type: 'knock:result', knockId: msg.knockId, status: 'no-occupant',
      })
    }
    break
  }
  // Send full MediaCredentials to knocker via knock:result. Client uses
  // useOfficeRealtime.connect(media) — same path as zone:enter's zone:joined.
  const knockerWs = this.wsById.get(result.knockerWsId)
  if (knockerWs) {
    this.sendTo(knockerWs, {
      type: 'knock:result',
      knockId: msg.knockId,
      status: 'accepted',
      media,
    })
  }
  // Move knocker's participant state into the zone (so floor plan updates)
  const knockerP = this.participants.get(result.knockerHandle)
  if (knockerP) {
    knockerP.currentZoneId = result.zoneId
    this.broadcast({ type: 'participant:moved', handle: knockerP.handle, zoneId: result.zoneId })
  }
  // Note: acceptedByZone stays set until the knocker leaves the zone, providing
  // capacity-override and busy-rejection for further knocks on the same zone.
  break
}
```

`mintZoneToken` is imported at the top of `OfficeRoom.ts` from `./realtime` already (used by zone:enter at line ~321). Verify the import is present.

- [ ] **Step 6: Add the timeout-fire + cleanup helpers**

Add as private methods on the `OfficeRoom` class:

```ts
private clearKnockTimeout(knockId: string): void {
  const h = this.knockTimeouts.get(knockId)
  if (h) {
    clearTimeout(h)
    this.knockTimeouts.delete(knockId)
  }
}

private fireKnockTimeout(knockId: string): void {
  this.knockTimeouts.delete(knockId)
  const result = applyKnockTimeout({ state: this.knockState, knockId })
  if (result.kind !== 'ok') return  // race: accept or deny beat us; no-op
  const knockerWs = this.wsById.get(result.knockerWsId)
  if (knockerWs) this.sendTo(knockerWs, result.toKnocker)
}
```

- [ ] **Step 7: Modify the existing `case 'zone:enter':` capacity check to allow knock-accept knocker**

Find the capacity check inside `case 'zone:enter':` (around line 334 per prior probe — `'capacity'` reason). Insert a knocker-bypass:

```ts
// Existing line (around line 334):
// if (occupantsInZone.length >= zone.capacity) {
//   this.sendTo(ws, { type: 'zone:join-failed', zoneId: msg.zoneId, reason: 'capacity', message: 'Room is full' })
//   break
// }

// REPLACE WITH:
if (occupantsInZone.length >= zone.capacity) {
  // Allow override if this participant is the active knock-accepted knocker.
  const acceptedKnockId = this.knockState.acceptedByZone.get(msg.zoneId)
  const isKnockerOverride = acceptedKnockId !== undefined
    && this.knockState.acceptedByZone.get(msg.zoneId) === acceptedKnockId
    && this.isAcceptedKnockerFor(participant.handle, msg.zoneId)
  if (!isKnockerOverride) {
    this.sendTo(ws, { type: 'zone:join-failed', zoneId: msg.zoneId, reason: 'capacity', message: 'Room is full' })
    break
  }
}
```

Add the predicate helper as a private method:

```ts
/**
 * Returns true iff `handle` is the knocker for an active accepted-knock on
 * `zoneId`. Used to bypass capacity check during knock-accept.
 *
 * Note: the byId entry was already removed in applyKnockAccept; we track
 * accepted-knockers via acceptedByZone (zoneId → knockId) and the recently-
 * accepted knocker's handle is recorded transiently in this.acceptedKnocker
 * which we set just before calling broadcast/zone-enter logic.
 */
private acceptedKnockerHandlesByZone: Map<string, string> = new Map()

private isAcceptedKnockerFor(handle: string, zoneId: string): boolean {
  return this.acceptedKnockerHandlesByZone.get(zoneId) === handle
}
```

And update Step 5's `case 'knock:accept':` block — after the mint succeeds, before the broadcast, record the handle:

```ts
// After successful mint, before the broadcast:
this.acceptedKnockerHandlesByZone.set(result.zoneId, result.knockerHandle)
```

And add cleanup when the knocker leaves the zone (extend the existing `case 'zone:leave':` or wherever participant.currentZoneId is cleared):

```ts
// In zone:leave or equivalent:
const leavingHandle = participant.handle
for (const [zoneId, knockerHandle] of this.acceptedKnockerHandlesByZone) {
  if (knockerHandle === leavingHandle) {
    this.acceptedKnockerHandlesByZone.delete(zoneId)
    this.knockState.acceptedByZone.delete(zoneId)
  }
}
```

This ensures capacity is freed when the knocker (or anyone) leaves the focus room post-accept.

- [ ] **Step 8: Add WS-disconnect cleanup**

Find the existing WS disconnect handler (where participant cleanup happens). Add knock cleanup:

```ts
// In the WS disconnect handler (alongside existing participant cleanup):
const wsIdStr = this.wsId(ws)
for (const [knockId, entry] of this.knockState.byId) {
  if (entry.knockerWsId === wsIdStr || entry.knockeeWsId === wsIdStr) {
    this.clearKnockTimeout(knockId)
    this.knockState.byId.delete(knockId)
    // If knocker disconnected, no one to notify. If knockee disconnected,
    // notify knocker (matches no-occupant semantics).
    if (entry.knockeeWsId === wsIdStr) {
      const knockerWs = this.wsById.get(entry.knockerWsId)
      if (knockerWs) {
        this.sendTo(knockerWs, {
          type: 'knock:result', knockId: knockId as any, status: 'no-occupant',
        })
      }
    }
  }
}
```

- [ ] **Step 9: Run the existing test suite to confirm nothing broke**

```bash
pnpm test:run test/workers/office-room/ test/server/utils/officeRoom/ test/server/utils/officeRealtime.test.ts
```

Expected: all existing tests pass. New behavior (knock dispatch in `OfficeRoom.ts`) isn't unit-tested directly — it's integration-tested via UAT in Task 12.

- [ ] **Step 10: Commit**

```bash
git add workers/office-room/src/OfficeRoom.ts
git commit -m "$(cat <<'EOF'
feat(office): wire knock messages into OfficeRoom DO

Six knock-related WS message cases added to the dispatch switch:
knock:request validates and stores state, sends knock:incoming.
knock:accept mints an audio_only_publish participant token via
the existing realtime.ts helper, returns authToken via knock:result.
knock:deny and knock:cancel cleanup state.
setTimeout drives the 30s timeout (DO hibernation makes the knock
expire silently which is acceptable per spec).

Capacity check in zone:enter now bypasses the limit for the active
knock-accepted knocker, freeing on leave. Knocker handle tracked in
acceptedKnockerHandlesByZone for the duration of the accepted-knock.

WS disconnect cleans up any pending knocks involving the disconnected
ws; if knockee disconnected, knocker gets no-occupant result.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `useOfficeKnocks` client composable

**Files:**
- Create: `app/composables/useOfficeKnocks.ts`
- Create: `test/app/composables/useOfficeKnocks.test.ts`

- [ ] **Step 1: Write failing tests**

Create `test/app/composables/useOfficeKnocks.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useOfficeKnocks } from '~/app/composables/useOfficeKnocks'

describe('useOfficeKnocks', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('sendKnock sets pendingKnock and calls send()', () => {
    const sent: any[] = []
    const send = (msg: any) => { sent.push(msg) }
    const k = useOfficeKnocks({ send })
    k.sendKnock('zone-1')
    expect(sent).toEqual([{ type: 'knock:request', targetZoneId: 'zone-1' }])
    expect(k.pendingKnock.value).toEqual({ targetZoneId: 'zone-1', status: 'awaiting' })
  })

  it('onIncoming sets incomingKnock', () => {
    const k = useOfficeKnocks({ send: () => {} })
    k.onIncoming({ knockId: 'k-1' as any, fromHandle: 'user:alice' as any, fromName: 'Alice', zoneId: 'zone-1', ttlMs: 30_000 })
    expect(k.incomingKnock.value).toMatchObject({ knockId: 'k-1', fromName: 'Alice' })
  })

  it('acceptKnock sends knock:accept and clears incomingKnock', () => {
    const sent: any[] = []
    const k = useOfficeKnocks({ send: (m) => { sent.push(m) } })
    k.onIncoming({ knockId: 'k-1' as any, fromHandle: 'user:alice' as any, fromName: 'Alice', zoneId: 'zone-1', ttlMs: 30_000 })
    k.acceptKnock()
    expect(sent).toEqual([{ type: 'knock:accept', knockId: 'k-1' }])
    expect(k.incomingKnock.value).toBeNull()
  })

  it('denyKnock sends knock:deny and clears incomingKnock', () => {
    const sent: any[] = []
    const k = useOfficeKnocks({ send: (m) => { sent.push(m) } })
    k.onIncoming({ knockId: 'k-1' as any, fromHandle: 'user:alice' as any, fromName: 'Alice', zoneId: 'zone-1', ttlMs: 30_000 })
    k.denyKnock()
    expect(sent).toEqual([{ type: 'knock:deny', knockId: 'k-1' }])
    expect(k.incomingKnock.value).toBeNull()
  })

  it('cancelKnock sends knock:cancel when pendingKnock has a knockId', () => {
    const sent: any[] = []
    const k = useOfficeKnocks({ send: (m) => { sent.push(m) } })
    k.sendKnock('zone-1')
    // Simulate server echoing a knockId back via result (we use it in cancel)
    k.pendingKnock.value = { ...k.pendingKnock.value!, knockId: 'k-1' as any }
    k.cancelKnock()
    expect(sent[1]).toEqual({ type: 'knock:cancel', knockId: 'k-1' })
    expect(k.pendingKnock.value).toBeNull()
  })

  it('onResult clears pendingKnock and returns the result for caller to toast', () => {
    const k = useOfficeKnocks({ send: () => {} })
    k.sendKnock('zone-1')
    const result = k.onResult({ knockId: 'k-1' as any, status: 'denied' })
    expect(k.pendingKnock.value).toBeNull()
    expect(result.status).toBe('denied')
  })
})
```

- [ ] **Step 2: Run test to verify FAIL**

```bash
pnpm test:run test/app/composables/useOfficeKnocks.test.ts
```

Expected: FAIL with "Cannot find module '~/app/composables/useOfficeKnocks'".

- [ ] **Step 3: Implement the composable**

Create `app/composables/useOfficeKnocks.ts`:

```ts
// Client-side knock state composable for Phase 1c.1.
// Owns:
//   - pendingKnock: the one outbound knock the user has sent, awaiting response
//   - incomingKnock: the one inbound knock the user has received
// Sends WS messages via the injected `send` callback (decouples from any
// specific WebSocket implementation; the office-room WS composable wires this).

import { ref, type Ref } from 'vue'
import type {
  ActorHandle,
  KnockId,
  KnockIncomingMessage,
  KnockResultMessage,
  KnockResultStatus,
  MediaCredentials,
} from '~/types/office'

interface SendFn {
  (msg:
    | { type: 'knock:request'; targetZoneId: string }
    | { type: 'knock:accept'; knockId: KnockId }
    | { type: 'knock:deny'; knockId: KnockId }
    | { type: 'knock:cancel'; knockId: KnockId }
  ): void
}

export interface PendingKnock {
  targetZoneId: string
  /** Set when knockId comes back via knock:incoming or the first server-side echo. */
  knockId?: KnockId
  status: 'awaiting'
}

export interface IncomingKnock {
  knockId: KnockId
  fromHandle: ActorHandle
  fromName: string
  zoneId: string
  ttlMs: number
  receivedAt: number
}

export interface UseOfficeKnocks {
  pendingKnock: Ref<PendingKnock | null>
  incomingKnock: Ref<IncomingKnock | null>
  sendKnock(targetZoneId: string): void
  acceptKnock(): void
  denyKnock(): void
  cancelKnock(): void
  onIncoming(msg: Omit<KnockIncomingMessage, 'type'>): void
  onResult(msg: Omit<KnockResultMessage, 'type'>): { status: KnockResultStatus; media?: MediaCredentials }
}

export function useOfficeKnocks(opts: { send: SendFn }): UseOfficeKnocks {
  const pendingKnock = ref<PendingKnock | null>(null)
  const incomingKnock = ref<IncomingKnock | null>(null)

  function sendKnock(targetZoneId: string) {
    if (pendingKnock.value) return  // only one pending knock at a time
    pendingKnock.value = { targetZoneId, status: 'awaiting' }
    opts.send({ type: 'knock:request', targetZoneId })
  }

  function acceptKnock() {
    const k = incomingKnock.value
    if (!k) return
    opts.send({ type: 'knock:accept', knockId: k.knockId })
    incomingKnock.value = null
  }

  function denyKnock() {
    const k = incomingKnock.value
    if (!k) return
    opts.send({ type: 'knock:deny', knockId: k.knockId })
    incomingKnock.value = null
  }

  function cancelKnock() {
    const k = pendingKnock.value
    if (!k?.knockId) {
      pendingKnock.value = null
      return
    }
    opts.send({ type: 'knock:cancel', knockId: k.knockId })
    pendingKnock.value = null
  }

  function onIncoming(msg: Omit<KnockIncomingMessage, 'type'>) {
    incomingKnock.value = { ...msg, receivedAt: Date.now() }
  }

  function onResult(msg: Omit<KnockResultMessage, 'type'>): { status: KnockResultStatus; media?: MediaCredentials } {
    pendingKnock.value = null
    return { status: msg.status, media: msg.media }
  }

  return {
    pendingKnock,
    incomingKnock,
    sendKnock,
    acceptKnock,
    denyKnock,
    cancelKnock,
    onIncoming,
    onResult,
  }
}
```

Note the import path uses `~/types/office` (not `~/app/types/office`) per Nuxt's auto-alias for app-side code. If the test file uses `~/app/composables/useOfficeKnocks` (per the existing test pattern from Task 7 of phase 1b'), the test file's import works because vitest's `~` is project root.

- [ ] **Step 4: Run test to verify PASS**

```bash
pnpm test:run test/app/composables/useOfficeKnocks.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/composables/useOfficeKnocks.ts test/app/composables/useOfficeKnocks.test.ts
git commit -m "$(cat <<'EOF'
feat(office): useOfficeKnocks composable + 6 unit tests

Client-side state machine for knock pattern. Owns pendingKnock
(outbound) and incomingKnock (inbound), exposes sendKnock /
acceptKnock / denyKnock / cancelKnock actions, accepts WS messages
via onIncoming / onResult. Decoupled from any specific WebSocket
implementation via a send-callback injection — the office-room
WS composable will wire this in Task 9.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `OfficeKnockConfirmModal.vue` — knocker's confirm dialog

**Files:**
- Create: `app/components/office/OfficeKnockConfirmModal.vue`

This is a presentational component. No unit test — it'll be exercised via UAT.

- [ ] **Step 1: Create the component**

```vue
<script setup lang="ts">
// Phase 1c.1 — confirm dialog shown when user clicks a knockable focus/private
// room. Emits 'confirm' (knock!) or 'cancel'. Parent (OfficeFloorPlan) wires
// to useOfficeKnocks.sendKnock(zoneId) on confirm.

interface Props {
  open: boolean
  zoneName: string
  occupantNames: string[]
}
const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'confirm'): void
}>()

function onCancel() {
  emit('update:open', false)
}

function onConfirm() {
  emit('confirm')
  emit('update:open', false)
}

const headline = computed(() => {
  if (props.occupantNames.length === 1) {
    return `Knock on ${props.occupantNames[0]}?`
  }
  return `Knock on ${props.zoneName}?`
})

const subtext = computed(() => {
  if (props.occupantNames.length === 1) {
    return `${props.occupantNames[0]} is in ${props.zoneName}. This will interrupt them — they can accept or deny.`
  }
  return `${props.occupantNames.join(', ')} are in ${props.zoneName}. They can accept or deny.`
})
</script>

<template>
  <UModal :open="open" @update:open="(v) => emit('update:open', v)">
    <template #content>
      <div class="p-6 space-y-4">
        <div class="space-y-2">
          <h3 class="text-lg font-semibold">{{ headline }}</h3>
          <p class="text-sm text-muted">{{ subtext }}</p>
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <UButton variant="ghost" @click="onCancel">Cancel</UButton>
          <UButton color="primary" @click="onConfirm">Knock</UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add app/components/office/OfficeKnockConfirmModal.vue
git commit -m "$(cat <<'EOF'
feat(office): OfficeKnockConfirmModal — knocker's confirm dialog

Nuxt UI v4 UModal with single/multi-occupant headline variants.
Parent wires the confirm event to useOfficeKnocks.sendKnock().
No internal state — fully controlled by parent via :open.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `OfficeKnockIncomingModal.vue` — knockee's accept/deny modal

**Files:**
- Create: `app/components/office/OfficeKnockIncomingModal.vue`

Includes a countdown that ticks down every second from `ttlMs / 1000`. On reaching zero, emits `deny` (treated as auto-deny, mirroring outside-click behavior). Plays `/sounds/knock.mp3` once when modal opens.

- [ ] **Step 1: Create the component**

```vue
<script setup lang="ts">
// Phase 1c.1 — incoming knock modal. Opens on knock:incoming WS message,
// plays one-shot sound, countdown ticks down, [Deny] / [Accept] actions.
// Dismissal by outside-click is treated as deny.

import { computed, ref, watch, onUnmounted } from 'vue'

interface Props {
  open: boolean
  fromName: string
  zoneName: string
  ttlMs: number
  /** ms timestamp when the knock was received (countdown source) */
  receivedAt: number
}
const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'accept'): void
  (e: 'deny'): void
}>()

const now = ref(Date.now())
let tickHandle: ReturnType<typeof setInterval> | null = null

const secondsRemaining = computed(() => {
  const elapsed = now.value - props.receivedAt
  const remaining = Math.max(0, props.ttlMs - elapsed)
  return Math.ceil(remaining / 1000)
})

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    // One-shot sound; ignore autoplay rejection
    try { new Audio('/sounds/knock.mp3').play().catch(() => {}) } catch { /* no-op */ }
    // Start countdown tick
    if (tickHandle) clearInterval(tickHandle)
    tickHandle = setInterval(() => {
      now.value = Date.now()
      if (secondsRemaining.value <= 0) {
        // Auto-deny on timeout (server will also fire timeout via knock:result;
        // this is just for the UI to close before the server message arrives)
        if (tickHandle) { clearInterval(tickHandle); tickHandle = null }
        emit('deny')
        emit('update:open', false)
      }
    }, 250)
  } else if (tickHandle) {
    clearInterval(tickHandle)
    tickHandle = null
  }
}, { immediate: true })

onUnmounted(() => { if (tickHandle) clearInterval(tickHandle) })

function onAccept() {
  emit('accept')
  emit('update:open', false)
}
function onDeny() {
  emit('deny')
  emit('update:open', false)
}
// Outside click → update:open false → treated as deny by parent
function onOpenChange(v: boolean) {
  if (!v) emit('deny')
  emit('update:open', v)
}
</script>

<template>
  <UModal :open="open" @update:open="onOpenChange">
    <template #content>
      <div class="p-6 space-y-4">
        <div class="space-y-2">
          <div class="flex items-center justify-between gap-3">
            <h3 class="text-lg font-semibold">{{ fromName }} wants to talk</h3>
            <UIcon name="i-lucide-bell-ring" class="text-amber-500" />
          </div>
          <p class="text-sm text-muted">
            {{ fromName }} knocked. Accept to start an audio chat in {{ zoneName }}.
          </p>
        </div>
        <div class="flex items-center justify-between gap-2 pt-2">
          <span class="text-xs text-muted">Times out in {{ secondsRemaining }}s…</span>
          <div class="flex gap-2">
            <UButton variant="ghost" @click="onDeny">Deny</UButton>
            <UButton color="primary" @click="onAccept">Accept</UButton>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add app/components/office/OfficeKnockIncomingModal.vue
git commit -m "$(cat <<'EOF'
feat(office): OfficeKnockIncomingModal — knockee's accept/deny modal

Nuxt UI v4 UModal with countdown driven by setInterval (250ms tick).
Plays /sounds/knock.mp3 once on open; autoplay rejection silently
ignored. Outside-click + countdown-zero both treated as deny. Parent
wires accept/deny events to useOfficeKnocks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Add `public/sounds/knock.mp3` asset

**Files:**
- Create: `public/sounds/knock.mp3`

- [ ] **Step 1: Confirm `public/sounds/` directory exists or create it**

```bash
mkdir -p public/sounds
ls -la public/sounds/
```

- [ ] **Step 2: Source a ~1-second knock sound**

Use a CC0 source (e.g. freesound.org) or generate a placeholder. For the first deploy, any short polite knock sound is acceptable — quality can be improved later without code change. A simple way to source one:

```bash
# Option A: download from a CC0 source (replace URL with actual)
curl -sL 'https://example.cc0-source/knock.mp3' -o public/sounds/knock.mp3

# Option B: if you have a local file
cp ~/Downloads/knock.mp3 public/sounds/knock.mp3

# Option C: generate with ffmpeg (requires ffmpeg installed)
ffmpeg -f lavfi -i 'sine=frequency=200:duration=0.08' \
       -f lavfi -i 'sine=frequency=200:duration=0.08' \
       -filter_complex '[0][1]concat=n=2:v=0:a=1' \
       -t 1.0 -af 'afade=t=in:st=0:d=0.02,afade=t=out:st=0.95:d=0.05' \
       public/sounds/knock.mp3
```

- [ ] **Step 3: Verify the file is reasonable size**

```bash
ls -lh public/sounds/knock.mp3
file public/sounds/knock.mp3
```

Expected: <50 KB, file shows as `MPEG ADTS, layer III`.

- [ ] **Step 4: Smoke-test playback in browser (manual)**

After deploy in Task 11, the dev or preview build should serve `https://<host>/sounds/knock.mp3` with content-type `audio/mpeg`. No verification step needed at commit time.

- [ ] **Step 5: Commit**

```bash
git add public/sounds/knock.mp3
git commit -m "$(cat <<'EOF'
feat(office): add knock.mp3 sound asset for incoming knock modal

Short polite knock (~1s), CC0/generated. Played once when
OfficeKnockIncomingModal opens. Replaceable without code change.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Wire useOfficeKnocks + modals + toasts into OfficeFloorPlan

**Files:**
- Modify: `app/components/office/OfficeFloorPlan.vue` (or wherever the room panel mounts — confirm via grep)

This task connects all the client-side pieces:
1. Mount the two modals
2. Instantiate `useOfficeKnocks` with the WS send function
3. Wire `knock:incoming` and `knock:result` WS messages to the composable
4. On `knock:result.accepted`, call `useOfficeRealtime.connect(authToken)` to auto-join
5. Toast for waiting + result states

- [ ] **Step 1: Find the parent component that owns the WS connection + room panel**

```bash
grep -rln 'useOfficeConnection\|useOfficeRealtime\|OfficeFloorPlan\|OfficeRoomPanel' app/pages/office.vue app/components/office/ 2>/dev/null | head -10
```

The parent is most likely `app/pages/office/index.vue` or `app/components/office/OfficeFloorPlan.vue`. Pick the one that holds the WS connection.

- [ ] **Step 2: Add the wiring**

Inside the parent component's `<script setup>`, add:

```ts
import { useOfficeKnocks } from '~/composables/useOfficeKnocks'
import OfficeKnockConfirmModal from '~/components/office/OfficeKnockConfirmModal.vue'
import OfficeKnockIncomingModal from '~/components/office/OfficeKnockIncomingModal.vue'

const toast = useToast()

// Assumes existing WS connection composable exposes a `send` function and
// some way to subscribe to incoming messages.
const wsConnection = useOfficeConnection()

const knocks = useOfficeKnocks({ send: wsConnection.send })

// Subscribe to incoming WS messages — exact pattern depends on the
// existing useOfficeConnection's API. Common shape: an onMessage callback.
wsConnection.onMessage((msg) => {
  if (msg.type === 'knock:incoming') {
    knocks.onIncoming(msg)
  } else if (msg.type === 'knock:result') {
    const result = knocks.onResult(msg)
    if (result.status === 'accepted' && result.media) {
      // Auto-join the zone — `media` is the full MediaCredentials shape,
      // same as what zone:enter's zone:joined response carries. The
      // useOfficeRealtime composable exposes connect(creds: MediaCredentials)
      // (see app/composables/useOfficeRealtime.ts:119).
      useOfficeRealtime().connect(result.media)
    } else if (result.status === 'denied') {
      toast.add({ title: 'Knock declined', description: 'They declined the knock.', color: 'error' })
    } else if (result.status === 'timeout') {
      toast.add({ title: 'No response', description: 'No response — try Slack instead.', color: 'warning' })
    } else if (result.status === 'busy') {
      toast.add({ title: 'Room busy', description: 'Someone else is already knocking. Try again in a sec.', color: 'error' })
    } else if (result.status === 'no-occupant') {
      toast.add({ title: 'Room empty', description: 'No one is in that room.', color: 'error' })
    } else if (result.status === 'not-knockable') {
      toast.add({ title: 'Not knockable', description: 'That room cannot be knocked.', color: 'error' })
    } else if (result.status === 'self-knock') {
      toast.add({ title: 'Already there', description: "You're already in that room.", color: 'info' })
    }
  }
})

// State for confirm modal (driven by OfficeZone click intercept — Task 10)
const confirmOpen = ref(false)
const confirmZone = ref<{ zoneId: string; zoneName: string; occupantNames: string[] } | null>(null)
function onKnockableClick(args: { zoneId: string; zoneName: string; occupantNames: string[] }) {
  confirmZone.value = args
  confirmOpen.value = true
}
function onConfirmKnock() {
  if (!confirmZone.value) return
  knocks.sendKnock(confirmZone.value.zoneId)
  toast.add({
    title: `Knocking on ${confirmZone.value.occupantNames.join(', ')}…`,
    description: 'Waiting for response (30s)',
    color: 'info',
  })
}

// Currently in a zone? Used by OfficeZone click intercept (Task 10) to decide
// whether to open the knock modal or fall through to a "leave first" toast.
const currentZoneId = computed(() => useOfficeRealtime().currentZoneId.value)
```

In the template, mount both modals:

```vue
<OfficeKnockConfirmModal
  v-model:open="confirmOpen"
  :zone-name="confirmZone?.zoneName ?? ''"
  :occupant-names="confirmZone?.occupantNames ?? []"
  @confirm="onConfirmKnock"
/>

<OfficeKnockIncomingModal
  v-if="knocks.incomingKnock.value"
  :open="!!knocks.incomingKnock.value"
  :from-name="knocks.incomingKnock.value.fromName"
  :zone-name="(zones.find(z => z.id === knocks.incomingKnock.value!.zoneId)?.name) ?? 'Focus Room'"
  :ttl-ms="knocks.incomingKnock.value.ttlMs"
  :received-at="knocks.incomingKnock.value.receivedAt"
  @update:open="(v) => { if (!v) knocks.incomingKnock.value = null }"
  @accept="knocks.acceptKnock()"
  @deny="knocks.denyKnock()"
/>
```

The exact `useOfficeConnection().send` and `.onMessage()` shapes need to be verified against the existing composable; if the existing API is different, adapt the integration code accordingly without changing the public behavior of `useOfficeKnocks`.

- [ ] **Step 3: Run existing tests to confirm no regression**

```bash
pnpm test:run test/workers/office-room/ test/server/utils/officeRoom/ test/server/utils/officeRealtime.test.ts test/app/composables/officeForceRelay.test.ts test/app/composables/useOfficeKnocks.test.ts
```

Expected: all previously-passing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add app/components/office/ app/pages/office  # adjust paths as needed
git commit -m "$(cat <<'EOF'
feat(office): wire useOfficeKnocks + 2 modals + toasts into floor plan

Mounts OfficeKnockConfirmModal + OfficeKnockIncomingModal in the
parent component. Subscribes to knock:incoming / knock:result WS
messages, forwards to useOfficeKnocks. On accepted result, calls
useOfficeRealtime.connect with the returned authToken to auto-join
the knockee's zone. Toasts for all non-accepted result statuses
(denied / timeout / busy / no-occupant / not-knockable / self-knock).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: `OfficeZone.vue` — knockable indicator + click intercept

**Files:**
- Modify: `app/components/office/OfficeZone.vue`

- [ ] **Step 1: Read the current click handler shape**

```bash
sed -n '60,90p' app/components/office/OfficeZone.vue
```

Identify the existing `@click="!isFull && emit('enter', zone.id)"` line and the props the component receives.

- [ ] **Step 2: Add the knockable computed + click intercept**

Inside the `<script setup>` of `OfficeZone.vue`, add:

```ts
const isKnockable = computed(() =>
  ['focus', 'private'].includes(props.zone.zone_type) &&
  props.occupants.length > 0
)

// `currentUserInAZone` is supplied by the parent (OfficeFloorPlan/floor-plan
// composable). Convention: prop name is `currentUserZoneId: string | null`.
const occupantNames = computed(() => props.occupants.map(o => o.name ?? 'someone'))

function onZoneClick() {
  if (isKnockable.value) {
    // Knock path
    if (props.currentUserZoneId) {
      // Already in a zone → can't knock; surface a toast
      emit('toast', {
        title: 'Already in a room',
        description: 'Leave your current room first to knock on someone else.',
        color: 'warning',
      })
      return
    }
    emit('knock', {
      zoneId: props.zone.id,
      zoneName: props.zone.name,
      occupantNames: occupantNames.value,
    })
    return
  }
  // Normal enter path
  if (!isFull.value) emit('enter', props.zone.id)
}
```

Update the `defineProps` (or `Props` interface) to add `currentUserZoneId?: string | null` and the `defineEmits` to add `'knock'` and `'toast'` events.

In the template, change the click binding:

```vue
<div
  class="zone-card"
  :class="{ 'cursor-knock': isKnockable }"
  @click="onZoneClick"
>
  <!-- ... existing zone content ... -->

  <!-- Knockable indicator: small ear icon in bottom-right -->
  <div
    v-if="isKnockable"
    class="absolute bottom-2 right-2 text-amber-400/80"
    aria-label="Knockable room — click to knock"
  >
    <UIcon name="i-lucide-ear" class="size-4" />
  </div>
</div>
```

Add the `.cursor-knock` style (or use Tailwind's `cursor-help` as a stand-in if you don't want a custom cursor):

```vue
<style scoped>
.cursor-knock { cursor: help; }
</style>
```

- [ ] **Step 3: Wire the parent component to forward the knock event**

In the parent (where `<OfficeZone>` is used — likely `OfficeFloorPlan.vue`), bind:

```vue
<OfficeZone
  v-for="zone in zones"
  :key="zone.id"
  :zone="zone"
  :occupants="occupantsForZone(zone.id)"
  :current-user-zone-id="currentZoneId"
  @enter="onEnterZone"
  @knock="onKnockableClick"
  @toast="(t) => toast.add(t)"
/>
```

`onKnockableClick` is the handler from Task 9.

- [ ] **Step 4: Run existing tests**

```bash
pnpm test:run test/workers/office-room/ test/server/utils/officeRoom/ test/server/utils/officeRealtime.test.ts test/app/composables/
```

Expected: all green. No new tests added in this task — UI behavior verified via UAT.

- [ ] **Step 5: Commit**

```bash
git add app/components/office/OfficeZone.vue app/components/office/OfficeFloorPlan.vue
git commit -m "$(cat <<'EOF'
feat(office): knockable-room indicator + click intercept on OfficeZone

Focus/private rooms with occupants show a small ear icon and route
clicks through onZoneClick. If the user is already in a zone, surface
a toast 'leave your current room first' (no WS sent). Otherwise emit
'knock' event with zone + occupant info; parent opens the confirm
modal (wired in Task 9). Empty knockable rooms fall through to
normal zone:enter.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Deploy worker + Pages production

**Files:** none — deploy operation.

Same deploy pattern used at the end of Phase 1b'.

- [ ] **Step 1: Confirm clean tree on correct branch**

```bash
git status --short
git rev-parse --abbrev-ref HEAD
git log --oneline -10
```

Expected: clean, on `feat/virtual-office-1b-media`, last commit is Task 10's.

- [ ] **Step 2: Deploy office-room-worker**

```bash
wrangler deploy --config workers/office-room/wrangler.toml
```

Expected: "Uploaded office-room-worker" + a new Version ID. Bindings unchanged.

- [ ] **Step 3: Deploy Pages production**

```bash
NODE_OPTIONS='--max-old-space-size=8192' pnpm deploy:production
```

Expected: build succeeds, deploys to a commit-specific URL + `https://agency-dashboard-6cm.pages.dev` alias.

- [ ] **Step 4: Smoke-check `/office` on production**

```bash
/usr/bin/curl -sI -L --max-redirs 3 'https://agency-dashboard-6cm.pages.dev/office' | grep -iE '^(HTTP|location|server)'
```

Expected: `HTTP/2 200` with auth-gate redirect (matches Phase 1b' deploy behavior).

- [ ] **Step 5: Optional — confirm migration 100 took effect**

```bash
export DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-)
psql "$DATABASE_URL" -c "SELECT slug, zone_type, cf_preset_default FROM office_zones WHERE zone_type='focus'"
```

Expected: each focus zone shows `cf_preset_default = 'audio_only_publish'`.

No commit (deploy is an artifact).

---

## Task 12: Manual UAT walkthrough

**Files:** none — manual testing on production.

Paul-driven. The 1c.1 UAT does not have a pre-written doc (1b's UAT doc covers the media layer only). The acceptance checklist below is the formal UAT for 1c.1.

- [ ] **Step 1: Pre-flight checks (~3 min)**
  - In the CF dashboard → Realtime → RealtimeKit → `agency-virtual-office` → Presets, confirm `audio_only_publish` exists (Paul created in pre-flight 1c.1-01).
  - On the production URL `https://agency-dashboard-6cm.pages.dev/office`, log in with two different staff accounts (Browser A + Browser B).
  - Confirm both can see the floor plan and the AROUND tray shows both names (or both are visible in some way that lets you initiate a knock between them).

- [ ] **Step 2: Happy path — knock + accept (~3 min)**
  - **Browser B** clicks Focus Room 1 (empty). B enters the room. The browser shows the OfficeRoomPanel with B's audio-only tile (no video, even if B has a camera — the `audio_only_publish` preset enforces this).
  - **Browser A** sees B's avatar inside Focus Room 1 on the floor plan, with a small ear icon in the bottom-right corner of the room tile.
  - **Browser A** clicks Focus Room 1. The `OfficeKnockConfirmModal` opens with text "Knock on {B's name}?" + Cancel/Knock buttons.
  - **Browser A** clicks Knock. Modal closes. A waiting toast appears at the bottom-right of A's screen.
  - **Browser B** sees the `OfficeKnockIncomingModal` open with text "{A's name} wants to talk" + a one-shot knock sound + countdown "Times out in 28s…".
  - **Browser B** clicks Accept. Modal closes.
  - **Browser A** sees the waiting toast dismiss and the OfficeRoomPanel slide up showing both A's and B's audio-only tiles in Focus Room 1.
  - **Browser A** says "Test"; **Browser B** hears it. **Browser B** says "Got it"; **Browser A** hears it. Audio works both ways.
  - Floor plan in both browsers shows both A and B in Focus Room 1 (capacity briefly bumped to 2).
  - **A or B** clicks Leave. The leaver returns to the around tray; the remaining occupant stays in the room. Capacity returns to 1.

- [ ] **Step 3: Deny path (~1 min)**
  - **A** knocks **B** again.
  - **B** clicks Deny. **A**'s waiting toast becomes red with text "Knock declined" and auto-dismisses in 3s. **A** stays outside the room.

- [ ] **Step 4: Timeout path (~1 min)**
  - **A** knocks **B**.
  - **B** does NOT respond.
  - After 30s, **A**'s waiting toast turns amber with text "No response — try Slack instead" and auto-dismisses in 5s. **B**'s modal auto-closes (server fires `knock:result` to A AND closes the modal on B's side).

- [ ] **Step 5: Cancel path (~1 min)**
  - **A** knocks **B**.
  - Before B responds, **A** clicks Cancel on the waiting toast. Toast dismisses immediately. **B**'s modal stays open until B explicitly responds (the spec didn't require cancel to retract the modal — TODO: confirm with a UAT note if this feels wrong; if it does, add a small follow-up to close the modal on cancel as well).

- [ ] **Step 6: Edge cases (~3 min)**
  - **Self-knock:** A enters Focus Room 1 (empty); now A is in the room. A clicks Focus Room 1 again — should fall through (no-op, since the room shows `0/1` rather than knockable). Or if A clicks via a different path, expect `self-knock` toast.
  - **Busy:** A knocks B; before B responds, open a third browser C and try to knock B. C sees a `busy` toast ("Someone else is already knocking. Try again in a sec.").
  - **Empty room:** B is NOT in any focus room. A clicks Focus Room 1 (empty). Falls through to normal `zone:enter` (no knock).
  - **Already-in-a-zone:** A is in Meeting Room A. A sees B in Focus Room 1. A clicks Focus Room 1. Should see a toast "Leave your current room first" — no WS sent.
  - **Knockee leaves mid-knock:** A knocks B. Before B responds, B navigates away or closes the browser. A sees a `no-occupant` toast.

- [ ] **Step 7: Server-side audit (~2 min)**
  - `wrangler tail --config workers/office-room/wrangler.toml` while running the happy path again.
  - Expect log lines for: `knock:request received`, `knock:incoming sent`, `knock:accept received`, `mintZoneToken(audio_only_publish)`, `knock:result accepted sent`.
  - No errors. No 401s. No `realtime-unavailable` reasons.

- [ ] **Step 8: Hand off result**
  - If all steps pass: report "1c.1 UAT green". Proceed to deferred 1b' two-browser UAT (if not already done) + PR #11 merge.
  - If any step fails: capture specific failure (which step, what was seen) and report back for diagnosis.

---

## Task 13: Final code review of full Phase 1c.1 diff

This is a single subagent dispatch covering all commits from Task 1 through Task 10 (skipping Tasks 11-12 since they're deploy + UAT).

Use the same code-reviewer template pattern from Phase 1b' Task 23. The reviewer should:
- Verify each handler in `handlers.ts` matches the spec §3 server-rejected reason codes
- Verify migration 100 SQL matches spec §4 verbatim
- Verify `useOfficeKnocks` state machine handles all the cases per spec §5
- Verify `OfficeZone.vue` click intercept logic per spec §5 (including the "already in zone" case)
- Verify no scope creep into 1c.2/1c.3/1c.4/1c.5/1d/1e/1f items per spec §2

Output format same as the 1b' final review: Strengths / Critical / Important / Minor / Recommendations / Assessment.

---

## Self-review log

(Filled in after writing — not for the executor's eye.)

- **Spec coverage:** Tasks 1-10 cover spec §3 (architecture & WS protocol), §4 (audio-first defaults), §5 (UI surfaces), §6 (task split — implemented as Tasks 1-12 instead of 1c.1-01 through 1c.1-13). Pre-flight 1c.1-01 (Paul dashboard preset) documented but not a plan task. Tasks 11-12 cover §6 deploy + UAT.
- **Placeholders:** None detected on final pass. Code blocks in every code step. Bash commands with expected output.
- **Type consistency:** `KnockState`, `KnockStateEntry`, `KnockHandlerResult<T>` defined in Task 3 are used in Task 4 wiring. `useOfficeKnocks` signature in Task 5 is consumed in Task 9. `OfficeZone` props/emits added in Task 10 are consumed by Task 9's parent wiring.
- **Notable adaptation:** Task 4 references `this.wsId(ws)`, `this.participantsByWs`, etc. — these are inferred from the existing pattern. The implementer must verify these match the actual class internals and adapt if names differ.
- **Sound asset (Task 8):** Pragmatic CC0/generated source acceptable; quality can be replaced later without code change. Marked as low-priority polish.
- **Out-of-scope adherence:** No tasks pull in 1c.2 (all-members-visible, profile cards, avatar-click-as-knock), 1c.3 (in-zone chat / reactions), 1c.4 (notes), 1c.5 (admin editor), 1d (guest), 1e (DND/quiet-hours), or 1f (Lobby) per spec §2.
