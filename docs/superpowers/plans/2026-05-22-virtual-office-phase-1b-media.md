# Virtual Office — Phase 1b: Cloudflare Realtime Media Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-05-22-virtual-office-foundation-design.md`

**Goal:** Add real-time video/audio/screensharing to the virtual office zones via Cloudflare Realtime (Calls). When a staff member enters a zone, the OfficeRoom DO mints a scoped Realtime token, the browser opens a WebRTC session, and same-zone participants see/hear each other.

**Architecture:** One Cloudflare Realtime session per zone, keyed `office:{officeId}:zone:{zoneId}`. The OfficeRoom DO calls the Realtime API server-side to mint per-participant tokens (1-hour TTL, refreshed by the DO ~5 minutes before expiry). The browser uses the official `@cloudflare/calls` SDK (or its public API contract) to publish tracks and subscribe to remote ones. Mic/cam are optional (lurking allowed). Tear-down happens on zone:leave, disconnect grace expiry, or admin eviction.

**Tech Stack:** Nuxt 4, Vue 3 Composition API, Nuxt UI v4, Cloudflare Durable Objects, Cloudflare Realtime (Calls), `@vueuse/core` (`useUserMedia`, `useDevicesList`, `useMediaControls`), Vitest.

**Multi-phase context:** This is Phase 1b of 4 (a/b/c/d). Phase 1a (presence) is merged. 1c adds in-zone chat/notes/reactions/profile cards. 1d adds client-portal entry + polish.

**Scope boundary for 1b:**
- ✅ Cloudflare Realtime app provisioning + secret management
- ✅ Server-side token minting client (`server/utils/officeRealtime.ts`)
- ✅ DO capacity check + token mint on `zone:enter`
- ✅ Token refresh inside the DO
- ✅ Tear-down on leave / disconnect / admin eviction
- ✅ `useMediaDevices` composable (VueUse wrappers)
- ✅ `useOfficeRealtime` composable (CF Calls session lifecycle)
- ✅ Media UI: room panel, tiles, controls, device settings
- ✅ Lurking permitted (permission-denied is not blocking)
- ✅ Error handling: capacity, quota, ICE timeout, permission denied, device unplug
- ❌ No in-zone text chat / notes / reactions (Phase 1c)
- ❌ No recording (deferred indefinitely per spec)
- ❌ No client portal entry (Phase 1d)
- ❌ No admin floor-plan editor UI (Phase 1c)
- ❌ No knock / drop-in audio (separate future spec)

---

## File Structure

**New files:**

```
server/utils/
  officeRealtime.ts                     # CF Realtime API client: mintToken, endSession

workers/office-room/src/
  realtime.ts                           # DO-side: mint via env.REALTIME_APP_* + fetch

app/composables/
  useMediaDevices.ts                    # wraps useUserMedia + useDevicesList + permissionState
  useOfficeRealtime.ts                  # session connect/publish/subscribe/leave state machine

app/components/office/
  OfficeRoomPanel.client.vue            # slideover hosting tiles + controls; opens on zone:joined
  OfficeMediaTile.vue                   # one participant's tile (self or remote)
  OfficeMediaControls.vue               # mic / cam / screenshare / leave + device-settings trigger
  OfficeDeviceSettings.vue              # device picker modal (mic + cam + speaker)

test/
  server/utils/officeRealtime.test.ts
  workers/office-room/realtime.test.ts
```

**Modified files:**

```
workers/office-room/src/OfficeRoom.ts         # mint on zone:enter, refresh, tear-down
workers/office-room/src/types.ts              # MediaCredentials + zone:joined-with-media + zone:join-failed
workers/office-room/src/handlers.ts           # applyZoneEnter receives MediaCredentials
workers/office-room/wrangler.toml             # secret bindings docs (no values committed)
app/types/office.ts                           # MediaCredentials type
app/composables/useOfficeConnection.ts        # surface mediaCredentials reactively from zone:joined
app/pages/office.vue                          # mount OfficeRoomPanel when in a zone
app/components/office/OfficeZone.vue          # hover affordance + capacity messaging when full
docs/superpowers/uat/2026-05-22-virtual-office-phase-1b-uat.md   # new UAT doc
```

---

## Task 0: Realtime SDK calibration spike (time-boxed, no code commit)

**Why:** Per the foundation spec §13, this is the project's first WebRTC integration. The CF Realtime ("Calls") SDK is newer than LiveKit's — there's a real chance the first day or two is calibration. Run this spike before any production code so we know the SDK's actual surface area and any gotchas before locking the plan to specifics that may not work.

**Time-box:** 1 working day. If at the end you cannot get two browsers in the same Realtime session exchanging audio+video, escalate before writing more code.

- [ ] **Step 1: Read the current Cloudflare Realtime / Calls docs**

```bash
# Visit:
# - https://developers.cloudflare.com/calls/   (primary entry)
# - https://developers.cloudflare.com/calls/sessions-tracks/
# - https://developers.cloudflare.com/calls/turn-keys/
# Note: API surface, SDK package name, session/track model, token TTL, error codes.
```

Capture in scratch notes: actual SDK package name (e.g. `@cloudflare/calls`, `cloudflare:calls`, raw `fetch` against the REST API), how a session is created, how a participant joins, how tracks are published/subscribed, how tokens are minted, how long they live, and what the leave/cleanup looks like.

- [ ] **Step 2: Make a throwaway HTML page that joins one session**

```bash
mkdir -p /tmp/cf-calls-spike
cd /tmp/cf-calls-spike
```

Create `index.html` and `app.js` with the minimal happy path: provision a session via the REST API (curl from your local shell using your CF app credentials), embed the resulting token in the HTML, open two browser tabs, confirm you see/hear yourself in both.

Do NOT integrate this into the dashboard yet. The goal is calibration only.

- [ ] **Step 3: Document findings in the spec**

Append a "Phase 1b spike findings (YYYY-MM-DD)" section to the spec capturing: confirmed SDK/API surface used, session/track model adopted, any deviations from the spec's assumptions in §4.2 / §6.3, gotchas (e.g. mobile Safari, screenshare permission flow, simulcast).

- [ ] **Step 4: Decision gate**

Open the discussion before continuing if the SDK requires a materially different model than the spec described (e.g. session-per-zone is not viable, tokens have shorter TTLs, no native screenshare).

**No commit in this task** — it's a research spike. The findings document is the artifact.

---

## Task 1: Provision Cloudflare Realtime credentials

**Files:** None committed. Credentials live as wrangler secrets and CF Pages env vars.

- [ ] **Step 1: Create a Cloudflare Realtime app**

```
1. Visit https://dash.cloudflare.com → Calls (or Realtime) → "Create application"
2. Name it "agency-virtual-office" (or similar).
3. Copy APP ID and APP SECRET — store somewhere safe (1Password / etc).
```

- [ ] **Step 2: Set as worker secrets on `office-room-worker`**

```bash
cd workers/office-room
echo "<APP_ID_VALUE>"      | ./node_modules/.bin/wrangler secret put REALTIME_APP_ID --config wrangler.toml
echo "<APP_SECRET_VALUE>"  | ./node_modules/.bin/wrangler secret put REALTIME_APP_SECRET --config wrangler.toml
```

Expected: `✨ Success! Uploaded secret REALTIME_APP_ID` (and the second one).

- [ ] **Step 3: Add to local `.env` for dev**

Append to `.env`:

```
REALTIME_APP_ID=<value>
REALTIME_APP_SECRET=<value>
```

Both lines remain gitignored (`.env` is in `.gitignore`).

- [ ] **Step 4: Document secrets in wrangler.toml comment**

Edit `workers/office-room/wrangler.toml`, append to the existing `[vars]` comment block:

```toml
# REALTIME_APP_ID / REALTIME_APP_SECRET are set as worker secrets, not committed:
#   cd workers/office-room && wrangler secret put REALTIME_APP_ID
#   cd workers/office-room && wrangler secret put REALTIME_APP_SECRET
```

- [ ] **Step 5: Commit**

```bash
git add workers/office-room/wrangler.toml
git commit -m "docs(office): document REALTIME_APP_* worker secrets in wrangler.toml"
```

---

## Task 2: CF Realtime API client (server-side, TDD)

**Files:**
- Create: `server/utils/officeRealtime.ts`
- Create: `test/server/utils/officeRealtime.test.ts`

The client is a thin wrapper around the CF Realtime REST API. Used by the DO to mint tokens and end sessions. Pure functions with the `fetch` dependency injected so tests can mock it.

- [ ] **Step 1: Write the failing tests**

`test/server/utils/officeRealtime.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { mintParticipantToken, endSession } from '~~/server/utils/officeRealtime'

describe('officeRealtime', () => {
  it('mintParticipantToken posts to the correct CF Realtime endpoint with auth', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'tok_abc', sessionId: 'sess_123', expiresAt: 1000 })
    } as Response)

    const res = await mintParticipantToken({
      appId: 'app-x',
      appSecret: 'sec-y',
      sessionKey: 'office:o1:zone:z1',
      participantId: 'user:u1',
      fetcher: fetchSpy
    })

    expect(res).toEqual({ token: 'tok_abc', sessionId: 'sess_123', expiresAt: 1000 })
    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(url).toMatch(/realtime|calls/i)
    expect((init as RequestInit).headers).toMatchObject({
      'Authorization': expect.stringContaining('sec-y')
    })
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body).toMatchObject({ sessionKey: 'office:o1:zone:z1', participantId: 'user:u1' })
  })

  it('mintParticipantToken throws on non-200 with a readable message', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate-limited'
    } as Response)

    await expect(
      mintParticipantToken({
        appId: 'a', appSecret: 's',
        sessionKey: 'k', participantId: 'p',
        fetcher: fetchSpy
      })
    ).rejects.toThrow(/429|rate-limited/i)
  })

  it('endSession swallows errors (best-effort cleanup)', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('network'))
    // Must not throw
    await expect(
      endSession({ appId: 'a', appSecret: 's', sessionKey: 'k', fetcher: fetchSpy })
    ).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to verify the tests fail**

```bash
pnpm test:run test/server/utils/officeRealtime.test.ts
```

Expected: FAIL — `Cannot find module '~~/server/utils/officeRealtime'`.

- [ ] **Step 3: Implement the client**

> The exact endpoint paths/body shape come from your Task 0 spike findings. The signatures below are deliberately generic; substitute the real fields once known.

`server/utils/officeRealtime.ts`:

```ts
// =============================================================================
// Cloudflare Realtime API client — server-side
// =============================================================================
//
// Used by the OfficeRoom DO to mint per-participant tokens scoped to one zone.
// Endpoint paths are based on the spike findings (Task 0). Update if the CF
// API surface changes.

export interface MintTokenInput {
  appId: string
  appSecret: string
  /** Stable key per zone, e.g. `office:o1:zone:z1` */
  sessionKey: string
  /** ActorHandle like `user:<uuid>` */
  participantId: string
  /** Inject `fetch` for testability */
  fetcher?: typeof fetch
}

export interface MintTokenResult {
  token: string
  sessionId: string
  /** ms epoch */
  expiresAt: number
}

const REALTIME_BASE = 'https://rtc.live.cloudflare.com/v1'

export async function mintParticipantToken(
  input: MintTokenInput,
): Promise<MintTokenResult> {
  const fetcher = input.fetcher ?? fetch
  const res = await fetcher(`${REALTIME_BASE}/apps/${input.appId}/sessions/tokens`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${input.appSecret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionKey: input.sessionKey,
      participantId: input.participantId,
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`mintParticipantToken ${res.status}: ${detail}`)
  }
  return (await res.json()) as MintTokenResult
}

export interface EndSessionInput {
  appId: string
  appSecret: string
  sessionKey: string
  fetcher?: typeof fetch
}

export async function endSession(input: EndSessionInput): Promise<void> {
  const fetcher = input.fetcher ?? fetch
  try {
    await fetcher(`${REALTIME_BASE}/apps/${input.appId}/sessions/${encodeURIComponent(input.sessionKey)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${input.appSecret}` },
    })
  } catch {
    // best-effort; cleanup failures are non-fatal
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
pnpm test:run test/server/utils/officeRealtime.test.ts
```

Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/utils/officeRealtime.ts test/server/utils/officeRealtime.test.ts
git commit -m "feat(office): CF Realtime API client (mintParticipantToken, endSession) + tests"
```

---

## Task 3: DO-side Realtime helper (TDD)

**Files:**
- Create: `workers/office-room/src/realtime.ts`
- Create: `test/workers/office-room/realtime.test.ts`

The worker is a separate runtime — we can't import the Node-ish `server/utils/officeRealtime.ts` directly. Mirror the same function in worker-land, with the same fetch-mockable shape.

- [ ] **Step 1: Write the failing tests**

`test/workers/office-room/realtime.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { mintZoneToken } from '../../../workers/office-room/src/realtime'

describe('OfficeRoom realtime helper', () => {
  it('mintZoneToken builds the sessionKey from officeId + zoneId', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 't', sessionId: 's', expiresAt: 999 })
    } as Response)

    const out = await mintZoneToken({
      env: { REALTIME_APP_ID: 'app', REALTIME_APP_SECRET: 'sec' },
      officeId: 'office-123',
      zoneId: 'zone-abc',
      handle: 'user:u1',
      fetcher
    })

    expect(out).toEqual({ token: 't', sessionId: 's', expiresAt: 999 })
    const body = JSON.parse((fetcher.mock.calls[0]![1] as RequestInit).body as string)
    expect(body.sessionKey).toBe('office:office-123:zone:zone-abc')
    expect(body.participantId).toBe('user:u1')
  })

  it('mintZoneToken throws if secrets are missing', async () => {
    await expect(
      mintZoneToken({
        env: { REALTIME_APP_ID: '', REALTIME_APP_SECRET: '' },
        officeId: 'o', zoneId: 'z', handle: 'user:u'
      })
    ).rejects.toThrow(/REALTIME_APP/i)
  })
})
```

- [ ] **Step 2: Run, verify fails**

```bash
pnpm test:run test/workers/office-room/realtime.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`workers/office-room/src/realtime.ts`:

```ts
import type { ActorHandle } from '../../../app/types/office'

export interface MintInput {
  env: { REALTIME_APP_ID?: string, REALTIME_APP_SECRET?: string }
  officeId: string
  zoneId: string
  handle: ActorHandle
  fetcher?: typeof fetch
}

export interface MintResult {
  token: string
  sessionId: string
  expiresAt: number
}

const REALTIME_BASE = 'https://rtc.live.cloudflare.com/v1'

export async function mintZoneToken(input: MintInput): Promise<MintResult> {
  const appId = input.env.REALTIME_APP_ID
  const appSecret = input.env.REALTIME_APP_SECRET
  if (!appId || !appSecret) {
    throw new Error('REALTIME_APP_ID / REALTIME_APP_SECRET not bound on this worker')
  }
  const fetcher = input.fetcher ?? fetch
  const sessionKey = `office:${input.officeId}:zone:${input.zoneId}`
  const res = await fetcher(`${REALTIME_BASE}/apps/${appId}/sessions/tokens`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${appSecret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sessionKey, participantId: input.handle }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`mintZoneToken ${res.status}: ${detail}`)
  }
  return (await res.json()) as MintResult
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
pnpm test:run test/workers/office-room/realtime.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add workers/office-room/src/realtime.ts test/workers/office-room/realtime.test.ts
git commit -m "feat(office): DO-side mintZoneToken helper for CF Realtime + tests"
```

---

## Task 4: MediaCredentials type + WS message shape updates

**Files:**
- Modify: `app/types/office.ts`
- Modify: `workers/office-room/src/types.ts`

The DO needs to send media credentials back to the joining client. Add a shared `MediaCredentials` type and extend `zone:entered` (rename to `zone:joined` to signal the contract change) plus add `zone:join-failed`.

- [ ] **Step 1: Add `MediaCredentials` to `app/types/office.ts`**

Append:

```ts
// Media call credentials minted by the OfficeRoom DO and returned on zone:joined.
export interface MediaCredentials {
  token: string
  sessionId: string
  /** ms epoch */
  expiresAt: number
}

export type ZoneJoinFailReason =
  | 'capacity'
  | 'denied'
  | 'mint-failed'
  | 'quota'
  | 'realtime-unavailable'
```

- [ ] **Step 2: Update outbound message shapes in `workers/office-room/src/types.ts`**

Replace the existing `'zone:entered'` and `'zone:full'` lines and add `'zone:joined'` / `'zone:join-failed'` / `'zone:token-refreshed'`:

```ts
import type {
  ActorHandle,
  OfficeStatus,
  OfficeSnapshot,
  MediaCredentials,
  ZoneJoinFailReason,
} from '../../../app/types/office'

export type InboundMessage =
  | { type: 'heartbeat' }
  | { type: 'status:set', status: OfficeStatus }
  | { type: 'zone:enter', zoneId: string }
  | { type: 'zone:leave' }

export type OutboundMessage =
  | { type: 'snapshot', snapshot: OfficeSnapshot }
  | { type: 'participant:joined', handle: ActorHandle, name: string, avatarUrl: string | null, status: OfficeStatus, isGuest: boolean }
  | { type: 'participant:left', handle: ActorHandle }
  | { type: 'participant:updated', handle: ActorHandle, status: OfficeStatus }
  | { type: 'participant:moved', handle: ActorHandle, zoneId: string | null }
  | { type: 'zone:joined', zoneId: string, media: MediaCredentials }
  | { type: 'zone:join-failed', zoneId: string, reason: ZoneJoinFailReason, message?: string }
  | { type: 'zone:token-refreshed', zoneId: string, media: MediaCredentials }
  | { type: 'zone:taken-over' }
  | { type: 'error', message: string }
```

`zone:entered` and `zone:full` are removed — Phase 1a tests will need their assertions updated in Task 5.

- [ ] **Step 3: Run office tests, expect Phase 1a handlers to fail compilation**

```bash
pnpm test:run test/workers/office-room/
```

Expected: TypeScript compile error in `handlers.ts` / `OfficeRoom.ts` because `'zone:entered'` no longer exists in `OutboundMessage`. That's fine — Task 5 updates them.

- [ ] **Step 4: Commit**

```bash
git add app/types/office.ts workers/office-room/src/types.ts
git commit -m "feat(office): MediaCredentials type + zone:joined / zone:join-failed / zone:token-refreshed WS messages"
```

---

## Task 5: DO — capacity check + token mint on zone:enter

**Files:**
- Modify: `workers/office-room/src/OfficeRoom.ts`
- Modify: `workers/office-room/src/handlers.ts`
- Modify: `test/workers/office-room/handlers.test.ts`

`zone:enter` now: (1) checks capacity, (2) mints a token via `mintZoneToken`, (3) sends `zone:joined { media }` to the entrant, (4) broadcasts `participant:moved`. On capacity or mint failure: sends `zone:join-failed`.

Capacity needs the office's zone definitions. The DO doesn't have them today (Phase 1a treated zones as opaque IDs). Add a `zoneCapacities: Map<string, number>` populated lazily by calling the Pages app's `/api/office/:officeId/zones` endpoint on first `zone:enter` — same shared-secret pattern as the chat-presence sync from Phase 1a.

- [ ] **Step 1: Add capacity cache + lookup**

In `OfficeRoom.ts`, add a private field and helper:

```ts
private zoneCapacityCache: Map<string, number> | null = null

private async getZoneCapacity(zoneId: string): Promise<number | null> {
  if (this.zoneCapacityCache === null) {
    const env = this.env as { SYNC_BASE_URL?: string, OFFICE_SYNC_SECRET?: string }
    if (!env.SYNC_BASE_URL || !env.OFFICE_SYNC_SECRET) return null
    try {
      const officeId = this.ctx.id.toString()
      const res = await fetch(`${env.SYNC_BASE_URL}/api/office/_internal/zones?officeId=${officeId}`, {
        headers: { 'x-office-sync-secret': env.OFFICE_SYNC_SECRET },
      })
      if (!res.ok) return null
      const { zones } = (await res.json()) as { zones: { id: string, capacity: number }[] }
      this.zoneCapacityCache = new Map(zones.map(z => [z.id, z.capacity]))
    } catch {
      return null
    }
  }
  return this.zoneCapacityCache.get(zoneId) ?? null
}

private zoneOccupancyCount(zoneId: string): number {
  let n = 0
  for (const p of this.participants.values()) {
    if (p.currentZoneId === zoneId && p.disconnectedAt === null) n++
  }
  return n
}
```

- [ ] **Step 2: Add the new internal Nitro endpoint that backs the cache**

Create `server/api/office/_internal/zones.get.ts`:

```ts
/**
 * GET /api/office/_internal/zones?officeId=...
 * INTERNAL: called by the OfficeRoom DO to populate its capacity cache.
 */
import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const secret = getHeader(event, 'x-office-sync-secret')
  if (!secret || secret !== process.env.OFFICE_SYNC_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'unauthorized' })
  }
  const officeId = getQuery(event).officeId as string | undefined
  if (!officeId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId required' })
  }
  const zones = await queryRows<{ id: string, capacity: number }>(
    `SELECT id, capacity FROM office_zones WHERE office_id = $1`,
    [officeId],
  )
  return { zones }
})
```

- [ ] **Step 3: Update `handlers.applyZoneEnter` to accept media credentials**

`workers/office-room/src/handlers.ts`:

```ts
import type { ActorHandle, OfficeStatus, MediaCredentials } from '../../../app/types/office'
import type { OutboundMessage } from './types'

export interface ParticipantLite {
  handle: ActorHandle
  status: OfficeStatus
  currentZoneId: string | null
  lastSeenAt: number
}

export function applyStatusSet(/* ...unchanged from Phase 1a... */
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
  media: MediaCredentials,
  now: number,
): { send: OutboundMessage, broadcast: OutboundMessage } {
  p.currentZoneId = zoneId
  p.lastSeenAt = now
  return {
    send: { type: 'zone:joined', zoneId, media },
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

- [ ] **Step 4: Update `OfficeRoom.handleMessage` `zone:enter` branch**

Replace the existing `case 'zone:enter'` with:

```ts
case 'zone:enter': {
  // Capacity guard
  const capacity = await this.getZoneCapacity(msg.zoneId)
  if (capacity !== null && this.zoneOccupancyCount(msg.zoneId) >= capacity) {
    this.sendTo(ws, { type: 'zone:join-failed', zoneId: msg.zoneId, reason: 'capacity', message: 'Room is full' })
    return
  }
  // Mint media credentials
  let media: MediaCredentials
  try {
    media = await mintZoneToken({
      env: this.env as { REALTIME_APP_ID?: string, REALTIME_APP_SECRET?: string },
      officeId: this.ctx.id.toString(),
      zoneId: msg.zoneId,
      handle,
    })
  } catch (err) {
    this.sendTo(ws, {
      type: 'zone:join-failed',
      zoneId: msg.zoneId,
      reason: 'mint-failed',
      message: (err as Error).message,
    })
    return
  }
  const { send, broadcast } = applyZoneEnter(p, msg.zoneId, media, now)
  this.sendTo(ws, send)
  this.broadcast(broadcast)
  this.scheduleTokenRefresh(handle, msg.zoneId, media.expiresAt)
  return
}
```

Don't forget the imports at the top of `OfficeRoom.ts`:

```ts
import type { MediaCredentials } from '../../../app/types/office'
import { mintZoneToken } from './realtime'
```

- [ ] **Step 5: Update existing handler tests for the new shape**

Modify `test/workers/office-room/handlers.test.ts`'s `applyZoneEnter` test:

```ts
it('applyZoneEnter updates currentZoneId and emits both send + broadcast', () => {
  const p = baseP()
  const media = { token: 'tok', sessionId: 'sess', expiresAt: 999 }
  const out = applyZoneEnter(p, 'zone-1', media, 100)
  expect(p.currentZoneId).toBe('zone-1')
  expect(p.lastSeenAt).toBe(100)
  expect(out.send).toEqual({ type: 'zone:joined', zoneId: 'zone-1', media })
  expect(out.broadcast).toEqual({ type: 'participant:moved', handle: 'user:u1', zoneId: 'zone-1' })
})
```

- [ ] **Step 6: Run tests**

```bash
pnpm test:run test/workers/office-room/ test/server/utils/officeRoom/
```

Expected: all green (3 handlers + 2 wsLifecycle + 2 realtime worker + 7 evaluateAcl + 6 actorHandle = 20).

- [ ] **Step 7: Commit**

```bash
git add workers/office-room/src/handlers.ts \
        workers/office-room/src/OfficeRoom.ts \
        server/api/office/_internal/zones.get.ts \
        test/workers/office-room/handlers.test.ts
git commit -m "feat(office): mint media token on zone:enter + capacity guard via DO cache"
```

---

## Task 6: DO — token refresh

**Files:**
- Modify: `workers/office-room/src/OfficeRoom.ts`

Tokens have a 1-hour TTL (per spec). Refresh ~5 minutes before expiry and re-broadcast to the participant so the SDK can swap mid-call.

- [ ] **Step 1: Add refresh scheduling**

In `OfficeRoom.ts`, add:

```ts
private refreshTimers = new Map<ActorHandle, ReturnType<typeof setTimeout>>()
private readonly REFRESH_LEAD_MS = 5 * 60_000

private scheduleTokenRefresh(handle: ActorHandle, zoneId: string, expiresAt: number) {
  const existing = this.refreshTimers.get(handle)
  if (existing) clearTimeout(existing)
  const fireIn = Math.max(10_000, expiresAt - Date.now() - this.REFRESH_LEAD_MS)
  const t = setTimeout(() => this.refreshToken(handle, zoneId), fireIn)
  this.refreshTimers.set(handle, t)
}

private async refreshToken(handle: ActorHandle, zoneId: string): Promise<void> {
  this.refreshTimers.delete(handle)
  const p = this.participants.get(handle)
  if (!p || p.currentZoneId !== zoneId) return  // moved or left; nothing to refresh

  try {
    const media = await mintZoneToken({
      env: this.env as { REALTIME_APP_ID?: string, REALTIME_APP_SECRET?: string },
      officeId: this.ctx.id.toString(),
      zoneId,
      handle,
    })
    // Send only to the specific participant's WS(s)
    for (const ws of this.ctx.getWebSockets()) {
      const tag = ws.deserializeAttachment() as { handle?: ActorHandle } | undefined
      if (tag?.handle === handle) {
        try { ws.send(JSON.stringify({ type: 'zone:token-refreshed', zoneId, media })) } catch { /* ignore */ }
      }
    }
    this.scheduleTokenRefresh(handle, zoneId, media.expiresAt)
  } catch {
    // Refresh failed. Don't kick — the SDK will surface the expiry error and
    // the client will leave gracefully.
  }
}
```

- [ ] **Step 2: Clear refresh timer on leave / disconnect**

Update existing `applyZoneLeave` call site and the `removeParticipant` method to clear the refresh timer:

In the `case 'zone:leave'` branch, after the `applyZoneLeave(p, now)` call, add:

```ts
const refreshT = this.refreshTimers.get(handle)
if (refreshT) { clearTimeout(refreshT); this.refreshTimers.delete(handle) }
```

In `removeParticipant`, add at the top:

```ts
const refreshT = this.refreshTimers.get(handle)
if (refreshT) { clearTimeout(refreshT); this.refreshTimers.delete(handle) }
```

- [ ] **Step 3: Type-check the worker**

```bash
./node_modules/.bin/tsc -p workers/office-room/tsconfig.json --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add workers/office-room/src/OfficeRoom.ts
git commit -m "feat(office): DO schedules Realtime token refresh ~5min before expiry"
```

---

## Task 7: DO — tear-down on zone:leave / disconnect

**Files:**
- Modify: `workers/office-room/src/OfficeRoom.ts`

When the LAST participant leaves a zone (either via `zone:leave` or grace expiry), call `endSession` so we're not leaking Realtime resources.

Lightweight — best effort. Don't block leave/cleanup on Realtime API responses.

- [ ] **Step 1: Add the endSession helper to `OfficeRoom`**

```ts
private async maybeEndZoneSession(zoneId: string): Promise<void> {
  // If no other connected participant is in this zone, end the session
  if (this.zoneOccupancyCount(zoneId) > 0) return
  const env = this.env as { REALTIME_APP_ID?: string, REALTIME_APP_SECRET?: string }
  if (!env.REALTIME_APP_ID || !env.REALTIME_APP_SECRET) return
  const sessionKey = `office:${this.ctx.id.toString()}:zone:${zoneId}`
  try {
    await fetch(`https://rtc.live.cloudflare.com/v1/apps/${env.REALTIME_APP_ID}/sessions/${encodeURIComponent(sessionKey)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${env.REALTIME_APP_SECRET}` },
    })
  } catch {
    // best-effort
  }
}
```

- [ ] **Step 2: Call from the `zone:leave` branch and `removeParticipant`**

In `handleMessage`'s `case 'zone:leave'`, AFTER the broadcast:

```ts
const previousZoneId = p.currentZoneId  // before applyZoneLeave clears it (note: need to capture this BEFORE the call)
```

Actually re-order: capture `previousZoneId` before calling `applyZoneLeave`, then call `maybeEndZoneSession(previousZoneId)` after the broadcast.

In `removeParticipant`, after deleting the participant:

```ts
if (p.currentZoneId) {
  void this.maybeEndZoneSession(p.currentZoneId)
}
```

(Capture `p` before `this.participants.delete(handle)` in that method.)

- [ ] **Step 3: Type-check**

```bash
./node_modules/.bin/tsc -p workers/office-room/tsconfig.json --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add workers/office-room/src/OfficeRoom.ts
git commit -m "feat(office): end Realtime session when last participant leaves a zone"
```

---

## Task 8: `useMediaDevices` composable

**Files:**
- Create: `app/composables/useMediaDevices.ts`

Wraps VueUse's `useUserMedia` + `useDevicesList`. Exposes reactive permission state, current tracks, list of available devices, and `switchDevice` / `toggleMic` / `toggleCam`. No CF Realtime logic here — that's Task 9.

- [ ] **Step 1: Implement**

```ts
import { useUserMedia, useDevicesList } from '@vueuse/core'

export interface UseMediaDevicesOptions {
  initialAudio?: boolean
  initialVideo?: boolean
}

export function useMediaDevices(opts: UseMediaDevicesOptions = {}) {
  const audioInputs = ref<MediaDeviceInfo[]>([])
  const videoInputs = ref<MediaDeviceInfo[]>([])
  const audioOutputs = ref<MediaDeviceInfo[]>([])
  const selectedAudioId = ref<string | null>(null)
  const selectedVideoId = ref<string | null>(null)
  const permissionDenied = ref(false)

  const devices = useDevicesList({
    requestPermissions: true,
    constraints: { audio: true, video: true },
  })

  watchEffect(() => {
    audioInputs.value = devices.audioInputs.value
    videoInputs.value = devices.videoInputs.value
    audioOutputs.value = devices.audioOutputs.value
    if (!selectedAudioId.value && audioInputs.value[0]) {
      selectedAudioId.value = audioInputs.value[0].deviceId
    }
    if (!selectedVideoId.value && videoInputs.value[0]) {
      selectedVideoId.value = videoInputs.value[0].deviceId
    }
  })

  const enabledAudio = ref(opts.initialAudio ?? true)
  const enabledVideo = ref(opts.initialVideo ?? true)

  const userMedia = useUserMedia({
    constraints: computed(() => ({
      audio: enabledAudio.value && selectedAudioId.value
        ? { deviceId: { exact: selectedAudioId.value } }
        : enabledAudio.value,
      video: enabledVideo.value && selectedVideoId.value
        ? { deviceId: { exact: selectedVideoId.value } }
        : enabledVideo.value,
    })),
    enabled: computed(() => enabledAudio.value || enabledVideo.value),
    autoSwitch: true,
  })

  watch(() => userMedia.stream.value, (stream) => {
    if (stream === null && (enabledAudio.value || enabledVideo.value)) {
      // Permission likely denied; surface it
      permissionDenied.value = true
    } else if (stream) {
      permissionDenied.value = false
    }
  })

  function toggleMic() { enabledAudio.value = !enabledAudio.value }
  function toggleCam() { enabledVideo.value = !enabledVideo.value }
  function selectMic(id: string) { selectedAudioId.value = id }
  function selectCam(id: string) { selectedVideoId.value = id }
  function stop() { userMedia.stop() }

  return {
    stream: userMedia.stream,
    audioInputs,
    videoInputs,
    audioOutputs,
    selectedAudioId,
    selectedVideoId,
    enabledAudio,
    enabledVideo,
    permissionDenied,
    toggleMic,
    toggleCam,
    selectMic,
    selectCam,
    stop,
  }
}
```

- [ ] **Step 2: Smoke test that it compiles**

```bash
pnpm typecheck 2>&1 | grep -E "useMediaDevices" | head -5
```

Expected: no new errors specific to this file.

- [ ] **Step 3: Commit**

```bash
git add app/composables/useMediaDevices.ts
git commit -m "feat(office): useMediaDevices composable wrapping VueUse useUserMedia + useDevicesList"
```

---

## Task 9: `useOfficeRealtime` composable — Realtime session lifecycle

**Files:**
- Create: `app/composables/useOfficeRealtime.ts`

Connects to the Cloudflare Realtime session using the credentials minted by the DO. Publishes local audio/video tracks from `useMediaDevices`, subscribes to remote tracks for the other zone participants, exposes them reactively.

This is the WebRTC-heavy piece. The exact API depends on Task 0's spike findings. The structure below uses a hand-rolled WebRTC + REST integration; substitute the official SDK if it's available and the spike confirmed it.

- [ ] **Step 1: Implement the state machine**

```ts
import type { MediaCredentials } from '~~/app/types/office'

export type RealtimeState = 'idle' | 'connecting' | 'connected' | 'failed' | 'closed'

export interface RemoteTrack {
  participantId: string
  kind: 'audio' | 'video' | 'screen'
  stream: MediaStream
}

export interface UseOfficeRealtimeOptions {
  credentials: Ref<MediaCredentials | null>
  localStream: Ref<MediaStream | null>
}

export function useOfficeRealtime(opts: UseOfficeRealtimeOptions) {
  const state = ref<RealtimeState>('idle')
  const remoteTracks = ref<RemoteTrack[]>([])
  const lastError = ref<string | null>(null)

  let pc: RTCPeerConnection | null = null
  let signalingAbort: AbortController | null = null

  async function connect(creds: MediaCredentials, local: MediaStream | null) {
    state.value = 'connecting'
    try {
      pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
      })

      pc.ontrack = (e) => {
        // Naive: one track per participant per kind. The real SDK will give us
        // structured participant->track mapping; until then we use track ids.
        const stream = e.streams[0] ?? new MediaStream([e.track])
        remoteTracks.value = [
          ...remoteTracks.value.filter(t => t.stream.id !== stream.id),
          {
            participantId: e.track.id,
            kind: e.track.kind === 'audio' ? 'audio' : 'video',
            stream,
          },
        ]
      }

      pc.onconnectionstatechange = () => {
        if (pc?.connectionState === 'connected') state.value = 'connected'
        if (pc?.connectionState === 'failed') {
          state.value = 'failed'
          lastError.value = 'WebRTC negotiation failed'
        }
        if (pc?.connectionState === 'closed') state.value = 'closed'
      }

      // Publish local tracks (if any)
      if (local) {
        for (const track of local.getTracks()) {
          pc.addTrack(track, local)
        }
      }

      // Negotiate with Cloudflare via the credentials returned from the DO.
      // The exact endpoints/headers come from the Task 0 spike. The structure
      // below assumes a standard "POST offer SDP, receive answer SDP" flow.
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      signalingAbort = new AbortController()
      const ansRes = await fetch(`https://rtc.live.cloudflare.com/v1/sessions/${creds.sessionId}/negotiate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${creds.token}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp,
        signal: signalingAbort.signal,
      })
      if (!ansRes.ok) throw new Error(`negotiate ${ansRes.status}`)
      const answerSdp = await ansRes.text()
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })
    } catch (err) {
      state.value = 'failed'
      lastError.value = (err as Error).message
      await disconnect()
    }
  }

  async function disconnect() {
    signalingAbort?.abort()
    signalingAbort = null
    pc?.close()
    pc = null
    remoteTracks.value = []
    state.value = 'closed'
  }

  // Auto-connect when credentials appear; disconnect when they disappear.
  watch(
    () => opts.credentials.value,
    async (creds, prev) => {
      if (prev && (!creds || prev.sessionId !== creds.sessionId)) {
        await disconnect()
      }
      if (creds) {
        await connect(creds, opts.localStream.value)
      }
    },
    { immediate: true },
  )

  onBeforeUnmount(disconnect)

  return { state, remoteTracks, lastError, disconnect }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/composables/useOfficeRealtime.ts
git commit -m "feat(office): useOfficeRealtime composable — WebRTC negotiation against CF Realtime"
```

> **Implementer note:** this is the file most likely to diverge from the plan based on Task 0 spike findings. Keep the public surface (`state`, `remoteTracks`, `lastError`, `disconnect`) stable; replace the internals as needed.

---

## Task 10: `OfficeMediaTile.vue` — single participant's tile

**Files:**
- Create: `app/components/office/OfficeMediaTile.vue`

A video element with overlays: name, mic-muted indicator, speaking ring. Self vs remote distinguished only by who controls the stream.

- [ ] **Step 1: Implement**

```vue
<script setup lang="ts">
const props = defineProps<{
  stream: MediaStream | null
  name: string
  isLocal?: boolean
  micMuted?: boolean
  speaking?: boolean
}>()

const videoEl = ref<HTMLVideoElement | null>(null)

watchEffect(() => {
  if (videoEl.value && props.stream) {
    videoEl.value.srcObject = props.stream
  }
})

const hasVideo = computed(() =>
  !!props.stream?.getVideoTracks().some(t => t.enabled && !t.muted)
)
</script>

<template>
  <div
    class="relative aspect-video overflow-hidden rounded-xl ring-1 ring-default
           bg-zinc-900 dark:bg-black transition-shadow"
    :class="speaking ? 'shadow-[0_0_0_3px_theme(colors.emerald.400)]' : ''"
  >
    <video
      v-show="hasVideo"
      ref="videoEl"
      autoplay
      playsinline
      :muted="isLocal"
      class="w-full h-full object-cover"
    />
    <div
      v-if="!hasVideo"
      class="absolute inset-0 flex items-center justify-center"
    >
      <UIcon name="i-lucide-video-off" class="size-10 text-zinc-500" />
    </div>
    <div class="absolute bottom-2 left-2 right-2 flex items-center justify-between">
      <span class="text-xs font-medium text-white bg-black/60 backdrop-blur-sm rounded px-2 py-0.5">
        {{ name }}{{ isLocal ? ' (you)' : '' }}
      </span>
      <UIcon
        v-if="micMuted"
        name="i-lucide-mic-off"
        class="size-4 text-red-400 bg-black/60 rounded p-0.5"
      />
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add app/components/office/OfficeMediaTile.vue
git commit -m "feat(office): OfficeMediaTile component — video element + name + mute indicator + speaking ring"
```

---

## Task 11: `OfficeMediaControls.vue` — mic / cam / screenshare / leave

**Files:**
- Create: `app/components/office/OfficeMediaControls.vue`

- [ ] **Step 1: Implement**

```vue
<script setup lang="ts">
const props = defineProps<{
  micEnabled: boolean
  camEnabled: boolean
  sharingScreen: boolean
}>()

const emit = defineEmits<{
  toggleMic: []
  toggleCam: []
  toggleScreen: []
  openDevices: []
  leave: []
}>()
</script>

<template>
  <div class="flex items-center gap-2 rounded-2xl bg-elevated/95 backdrop-blur-md px-3 py-2 ring-1 ring-default shadow-lg">
    <UButton
      :variant="micEnabled ? 'soft' : 'solid'"
      :color="micEnabled ? 'neutral' : 'error'"
      size="md"
      :icon="micEnabled ? 'i-lucide-mic' : 'i-lucide-mic-off'"
      :aria-label="micEnabled ? 'Mute microphone' : 'Unmute microphone'"
      @click="emit('toggleMic')"
    />
    <UButton
      :variant="camEnabled ? 'soft' : 'solid'"
      :color="camEnabled ? 'neutral' : 'error'"
      size="md"
      :icon="camEnabled ? 'i-lucide-video' : 'i-lucide-video-off'"
      :aria-label="camEnabled ? 'Turn off camera' : 'Turn on camera'"
      @click="emit('toggleCam')"
    />
    <UButton
      :variant="sharingScreen ? 'solid' : 'soft'"
      :color="sharingScreen ? 'primary' : 'neutral'"
      size="md"
      :icon="sharingScreen ? 'i-lucide-monitor-x' : 'i-lucide-monitor'"
      aria-label="Toggle screen share"
      @click="emit('toggleScreen')"
    />
    <UButton
      variant="ghost"
      size="md"
      icon="i-lucide-settings-2"
      aria-label="Devices"
      @click="emit('openDevices')"
    />
    <span class="mx-1 h-6 w-px bg-default" />
    <UButton
      color="error"
      variant="solid"
      size="md"
      icon="i-lucide-phone-off"
      @click="emit('leave')"
    >
      Leave
    </UButton>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add app/components/office/OfficeMediaControls.vue
git commit -m "feat(office): OfficeMediaControls — mic / cam / screen / devices / leave"
```

---

## Task 12: `OfficeDeviceSettings.vue` — device picker modal

**Files:**
- Create: `app/components/office/OfficeDeviceSettings.vue`

Per project conventions (CLAUDE.md), this is a FORM — invoke the `frontend-design` skill before authoring it. Apply UFormField for label/help-text spacing.

- [ ] **Step 1: Implement**

```vue
<script setup lang="ts">
const props = defineProps<{
  open: boolean
  audioInputs: MediaDeviceInfo[]
  videoInputs: MediaDeviceInfo[]
  selectedAudioId: string | null
  selectedVideoId: string | null
}>()

const emit = defineEmits<{
  'update:open': [v: boolean]
  selectMic: [id: string]
  selectCam: [id: string]
}>()

const localOpen = computed({
  get: () => props.open,
  set: (v) => emit('update:open', v),
})
</script>

<template>
  <UModal v-model:open="localOpen">
    <template #content>
      <div class="p-5 space-y-4">
        <div>
          <h2 class="text-base font-semibold text-highlighted">
            Devices
          </h2>
          <p class="text-xs text-muted mt-1">
            Pick the microphone and camera you want to use.
          </p>
        </div>

        <UFormField label="Microphone">
          <USelectMenu
            :model-value="selectedAudioId ?? ''"
            :items="audioInputs.map(d => ({ label: d.label || 'Unnamed mic', value: d.deviceId }))"
            value-key="value"
            placeholder="Choose a microphone"
            class="w-full"
            @update:model-value="(v: string) => emit('selectMic', v)"
          />
        </UFormField>

        <UFormField label="Camera">
          <USelectMenu
            :model-value="selectedVideoId ?? ''"
            :items="videoInputs.map(d => ({ label: d.label || 'Unnamed camera', value: d.deviceId }))"
            value-key="value"
            placeholder="Choose a camera"
            class="w-full"
            @update:model-value="(v: string) => emit('selectCam', v)"
          />
        </UFormField>

        <div class="flex justify-end pt-2">
          <UButton color="primary" @click="localOpen = false">
            Done
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add app/components/office/OfficeDeviceSettings.vue
git commit -m "feat(office): OfficeDeviceSettings — modal with USelectMenu for mic + cam"
```

---

## Task 13: `OfficeRoomPanel.client.vue` — the in-zone call surface

**Files:**
- Create: `app/components/office/OfficeRoomPanel.client.vue`

A USlideover (or UModal — pick slideover for the "you're in a room" feel) that opens when the user joins a zone. Hosts the local tile + remote tiles + controls + device settings modal.

`.client.vue` suffix per project conventions because it touches `MediaStream`, `RTCPeerConnection`, etc. — strictly client-only.

Per CLAUDE.md, invoke the `frontend-design` skill before working on this; apply the principles to the room layout (asymmetric tile grid, sticky controls at the bottom, ambient lighting at the edges).

- [ ] **Step 1: Implement**

```vue
<script setup lang="ts">
import type { OfficeZoneRow, MediaCredentials } from '~~/app/types/office'
import type { RemoteTrack } from '~~/app/composables/useOfficeRealtime'

const props = defineProps<{
  open: boolean
  zone: OfficeZoneRow | null
  credentials: MediaCredentials | null
}>()

const emit = defineEmits<{
  'update:open': [v: boolean]
  leave: []
}>()

const media = useMediaDevices({ initialAudio: true, initialVideo: true })
const credsRef = computed(() => props.credentials)
const realtime = useOfficeRealtime({
  credentials: credsRef,
  localStream: media.stream,
})

const sharingScreen = ref(false)
let screenStream: MediaStream | null = null

async function toggleScreen() {
  if (sharingScreen.value) {
    screenStream?.getTracks().forEach(t => t.stop())
    screenStream = null
    sharingScreen.value = false
    return
  }
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
    sharingScreen.value = true
    // Implementer: actually publish the screen track to the RTCPeerConnection
    // here. The exact wiring depends on Task 0 spike findings.
  } catch {
    sharingScreen.value = false
  }
}

const deviceModalOpen = ref(false)

function leave() {
  emit('leave')
  emit('update:open', false)
  if (sharingScreen.value) toggleScreen()
  realtime.disconnect()
  media.stop()
}

const localOpen = computed({
  get: () => props.open,
  set: (v) => emit('update:open', v),
})
</script>

<template>
  <USlideover v-model:open="localOpen" side="bottom" :ui="{ content: 'h-[88vh] rounded-t-3xl' }">
    <template #content>
      <div class="flex h-full flex-col bg-default">
        <div class="flex items-center justify-between px-5 py-3 border-b border-default">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-radio" class="size-4 text-emerald-500 animate-pulse" />
            <span class="font-semibold text-highlighted">{{ zone?.name ?? 'Zone' }}</span>
            <UBadge color="success" variant="subtle" size="xs">Live</UBadge>
          </div>
          <span class="text-xs text-muted">
            {{ realtime.state.value === 'connected' ? 'Connected' : realtime.state.value }}
          </span>
        </div>

        <div class="grid auto-rows-fr gap-3 p-4 flex-1 overflow-auto"
             :style="{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }">
          <OfficeMediaTile
            :stream="media.stream.value"
            :name="'You'"
            is-local
            :mic-muted="!media.enabledAudio.value"
          />
          <OfficeMediaTile
            v-for="t in realtime.remoteTracks.value"
            :key="t.stream.id"
            :stream="t.stream"
            :name="t.participantId"
          />
        </div>

        <div
          v-if="media.permissionDenied.value"
          class="px-5 py-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 border-t border-amber-500/20"
        >
          Mic/camera permission denied — you're lurking. Click the mic/cam buttons to retry.
        </div>

        <div class="p-4 border-t border-default flex justify-center">
          <OfficeMediaControls
            :mic-enabled="media.enabledAudio.value"
            :cam-enabled="media.enabledVideo.value"
            :sharing-screen="sharingScreen"
            @toggle-mic="media.toggleMic"
            @toggle-cam="media.toggleCam"
            @toggle-screen="toggleScreen"
            @open-devices="deviceModalOpen = true"
            @leave="leave"
          />
        </div>
      </div>

      <OfficeDeviceSettings
        v-model:open="deviceModalOpen"
        :audio-inputs="media.audioInputs.value"
        :video-inputs="media.videoInputs.value"
        :selected-audio-id="media.selectedAudioId.value"
        :selected-video-id="media.selectedVideoId.value"
        @select-mic="media.selectMic"
        @select-cam="media.selectCam"
      />
    </template>
  </USlideover>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add app/components/office/OfficeRoomPanel.client.vue
git commit -m "feat(office): OfficeRoomPanel — slideover hosting media tiles, controls, devices"
```

---

## Task 14: Bubble media credentials through `useOfficeConnection`

**Files:**
- Modify: `app/composables/useOfficeConnection.ts`

The composable already handles WS messages. Add a reactive `currentMediaCredentials` and `currentZone` ref so the page can drive the room panel.

- [ ] **Step 1: Add new state**

In `useOfficeConnection.ts`, add to the existing refs:

```ts
const currentMediaCredentials = ref<MediaCredentials | null>(null)
const currentZoneId = ref<string | null>(null)
const joinFailure = ref<{ zoneId: string, reason: ZoneJoinFailReason, message?: string } | null>(null)
```

(Import `MediaCredentials` and `ZoneJoinFailReason` from `~~/app/types/office`.)

- [ ] **Step 2: Handle the new messages**

Add cases inside `applyMessage`:

```ts
case 'zone:joined':
  currentZoneId.value = msg.zoneId
  currentMediaCredentials.value = msg.media
  return
case 'zone:token-refreshed':
  if (currentZoneId.value === msg.zoneId) {
    currentMediaCredentials.value = msg.media
  }
  return
case 'zone:join-failed':
  joinFailure.value = { zoneId: msg.zoneId, reason: msg.reason, message: msg.message }
  lastError.value = msg.message || `Couldn't join: ${msg.reason}`
  return
```

Also clear on leave: in the existing `leaveZone()` helper, after calling `send`:

```ts
currentZoneId.value = null
currentMediaCredentials.value = null
```

- [ ] **Step 3: Add to the returned object**

```ts
return {
  participants,
  zoneOccupancy,
  isConnected,
  lastError,
  currentZoneId,
  currentMediaCredentials,
  joinFailure,
  setStatus,
  enterZone,
  leaveZone,
}
```

- [ ] **Step 4: Commit**

```bash
git add app/composables/useOfficeConnection.ts
git commit -m "feat(office): useOfficeConnection surfaces media credentials + currentZoneId + joinFailure"
```

---

## Task 15: Mount `OfficeRoomPanel` from the `/office` page

**Files:**
- Modify: `app/pages/office.vue`

- [ ] **Step 1: Add the panel to the template + wire state**

In `<script setup>`, derive the current zone object:

```ts
const currentZone = computed(() => {
  const zoneId = connection.currentZoneId.value
  if (!zoneId) return null
  return detail.value?.zones.find(z => z.id === zoneId) ?? null
})
const panelOpen = computed({
  get: () => Boolean(connection.currentMediaCredentials.value),
  set: () => {},  // close handled via the panel's leave event
})

function handleLeave() {
  connection.leaveZone()
}
```

In the template, after the existing `<OfficeFloorPlan>`, add:

```vue
<OfficeRoomPanel
  :open="panelOpen"
  :zone="currentZone"
  :credentials="connection.currentMediaCredentials.value"
  @leave="handleLeave"
/>
```

- [ ] **Step 2: Add a join-failure toast trigger**

Watch the new `joinFailure` ref and toast on changes:

```ts
watch(
  () => connection.joinFailure.value,
  (failure) => {
    if (!failure) return
    toast.add({
      title: 'Couldn\'t join room',
      description: failure.message || `Reason: ${failure.reason}`,
      color: 'error',
    })
    connection.joinFailure.value = null
  },
)
```

- [ ] **Step 3: Commit**

```bash
git add app/pages/office.vue
git commit -m "feat(office): /office page mounts OfficeRoomPanel on zone:joined and toasts join failures"
```

---

## Task 16: Zone hover affordance + capacity-full state

**Files:**
- Modify: `app/components/office/OfficeZone.vue`

Make the zone tile communicate "click to join with mic+cam" on hover, and show "Room is full" when at capacity (instead of letting the user click and fail).

- [ ] **Step 1: Add hover state + disabled-when-full**

Replace the existing template button with:

```vue
<template>
  <button
    type="button"
    class="group absolute overflow-hidden rounded-2xl ring-1 transition-all duration-200 ease-out text-left
           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    :class="[
      'bg-gradient-to-br',
      theme.gradient,
      theme.ring,
      isOccupied ? 'shadow-md' : 'shadow-sm',
      isFull
        ? 'cursor-not-allowed opacity-60'
        : 'cursor-pointer hover:scale-[1.015] hover:shadow-xl hover:z-10'
    ]"
    :disabled="isFull"
    :style="{
      left: zone.position.x + 'px',
      top: zone.position.y + 'px',
      width: zone.position.w + 'px',
      height: zone.position.h + 'px'
    }"
    :aria-label="isFull ? `${zone.name} (full)` : `Join ${zone.name} with mic and camera`"
    @click="!isFull && emit('enter', zone.id)"
  >
    <!-- ...existing decorative + label markup... -->

    <!-- Hover affordance (only when not full) -->
    <div
      v-if="!isFull"
      class="absolute inset-x-0 bottom-0 px-3 py-1.5 opacity-0 group-hover:opacity-100
             transition-opacity bg-white/90 dark:bg-black/70 backdrop-blur-sm
             text-[11px] font-medium text-default flex items-center justify-center gap-1"
    >
      <UIcon name="i-lucide-video" class="size-3.5" />
      Join with mic + camera
    </div>

    <!-- Full state -->
    <div
      v-else
      class="absolute inset-x-0 bottom-0 px-3 py-1.5 bg-red-500/15 text-[11px] font-medium
             text-red-700 dark:text-red-300 text-center"
    >
      Room is full
    </div>
  </button>
</template>
```

And add to `<script setup>`:

```ts
const isFull = computed(() => fillRatio.value >= 1)
```

- [ ] **Step 2: Commit**

```bash
git add app/components/office/OfficeZone.vue
git commit -m "feat(office): OfficeZone hover affordance + capacity-full disabled state"
```

---

## Task 17: Phase 1b UAT checklist

**Files:**
- Create: `docs/superpowers/uat/2026-05-22-virtual-office-phase-1b-uat.md`

- [ ] **Step 1: Write the checklist**

```markdown
# Virtual Office Phase 1b — Manual UAT Checklist

Builds on the Phase 1a UAT — assumes presence is working and the office is seeded.
Run all of this BEFORE merging Phase 1b to production.

## Setup

- [ ] `REALTIME_APP_ID` and `REALTIME_APP_SECRET` set on the `office-room-worker` (verify via `wrangler secret list --config workers/office-room/wrangler.toml`).
- [ ] Same values present locally in `.env` for `pnpm dev`.
- [ ] `OFFICE_SYNC_SECRET` still set everywhere from Phase 1a (Pages prod + preview + worker).
- [ ] Branch `feat/virtual-office-1b-media` deployed to a Pages preview environment.

## Two-browser walkthrough — happy path

Two staff accounts, two browsers (or one Chrome + one Safari).

- [ ] Browser A navigates to `/office` and clicks **Meeting Room A**.
- [ ] A grants mic + camera permission.
- [ ] A sees the OfficeRoomPanel slide up; A's own tile shows their video.
- [ ] Browser B navigates to `/office` and clicks Meeting Room A.
- [ ] B grants permissions; B sees A's video in their grid; A sees B's video appear.
- [ ] Audio: A says "test 1"; B hears it (and vice versa).
- [ ] A clicks the mic toggle — mic icon goes red on A's controls; B sees a "muted" badge on A's tile.
- [ ] A toggles back on; B's badge clears.
- [ ] A toggles camera off; A's tile shows "no video" icon on B's side, but audio still works.
- [ ] A clicks screen-share, picks a window. B sees the screenshare track.
- [ ] A clicks "Leave"; A's tile disappears from B's grid; A returns to the floor plan.

## Permission denied (lurking)

- [ ] In a fresh Chrome profile, navigate to `/office` and click a room.
- [ ] When the permission prompt appears, click **Block**.
- [ ] The OfficeRoomPanel still opens; the panel shows a warning strip about lurking.
- [ ] You can still see + hear other participants — you just can't transmit.

## Token refresh (long-running call)

Hard to verify manually in a single sitting (1-hour TTL). Instead:

- [ ] In the DO logs (CF dashboard or `wrangler tail`), confirm a `zone:token-refreshed` is sent ~55 minutes into a call.
- [ ] OR: temporarily reduce `REFRESH_LEAD_MS` to 60s and watch a refresh fire 1 minute after entry; revert before merging.

## Capacity guard

- [ ] Set a Focus Room's capacity to 1 via SQL: `UPDATE office_zones SET capacity = 1 WHERE slug = 'focus-1';`
- [ ] Browser A enters focus-1.
- [ ] Browser B tries to enter focus-1; B's UI shows a toast "Room is full" and B does not enter.
- [ ] B sees the floor tile rendered with the "Room is full" overlay.

## Realtime quota / mint failure

- [ ] Temporarily corrupt `REALTIME_APP_SECRET` on the worker: `wrangler secret put REALTIME_APP_SECRET` and paste garbage.
- [ ] Browser A tries to enter a zone; mint fails; A sees the floor + an error toast "Couldn't join room — mint-failed".
- [ ] Restore the correct secret before continuing.

## Network resilience

- [ ] Mid-call, A toggles DevTools Network to "Offline" for ~5 seconds.
- [ ] B sees A's tile freeze / grey briefly; after A reconnects, presence + media restore.
- [ ] No duplicate A tile appears.

## Acceptance

- [ ] All above pass on both Chrome desktop and Safari iOS (or note any iOS-specific gaps).
- [ ] No browser console errors during a 5-minute idle call.
- [ ] `pnpm test:run test/workers/office-room/ test/server/utils/officeRoom/ test/server/utils/officeRealtime.test.ts` reports green.
- [ ] Phase 1a UAT still passes (no regressions).
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/uat/2026-05-22-virtual-office-phase-1b-uat.md
git commit -m "docs(office): Phase 1b manual UAT checklist (media)"
```

---

## Task 18: Final verification + lint + typecheck

**Files:** none new

- [ ] **Step 1: Run all office tests**

```bash
pnpm test:run test/workers/office-room/ test/server/utils/officeRoom/ test/server/utils/officeRealtime.test.ts
```

Expected: all green. Total ≈ 22 (Phase 1a's 18 + Phase 1b's 4 new from Tasks 2 + 3).

- [ ] **Step 2: Lint the office surface**

```bash
./node_modules/.bin/eslint \
  app/components/office/ app/pages/office.vue app/composables/use{Office,Media}*.ts \
  app/types/office.ts 'server/api/office/' 'server/api/ws/office/' \
  server/utils/office*.ts test/server/utils/officeRoom/ test/server/utils/officeRealtime.test.ts \
  test/workers/office-room/ workers/office-room/src/
```

Expected: no errors. Fix any.

- [ ] **Step 3: Type-check the worker**

```bash
./node_modules/.bin/tsc -p workers/office-room/tsconfig.json --noEmit
```

Expected: clean.

- [ ] **Step 4: Type-check the Nuxt app, filtered to new code**

```bash
pnpm typecheck 2>&1 | grep -E "office|realtime|media" | head -30
```

Expected: no new errors. (Pre-existing ~60 errors per CLAUDE.md are OK.)

- [ ] **Step 5: Deploy the updated worker (so Pages can talk to it)**

```bash
cd workers/office-room && ./node_modules/.bin/wrangler deploy --config wrangler.toml && cd ../..
```

Expected: `Deployed office-room-worker triggers` with a new Version ID.

- [ ] **Step 6: Walk the UAT checklist**

End-to-end. Fix anything that surfaces, then re-run lint + tests.

- [ ] **Step 7: Commit any cleanup**

```bash
git add -A
git commit -m "chore(office): phase 1b verification cleanup"
```

(Skip if there's nothing to commit.)

---

## Task 19: Push branch + open PR + update spec

**Files:**
- Modify: `docs/superpowers/specs/2026-05-22-virtual-office-foundation-design.md`

- [ ] **Step 1: Append Phase 1b status to the spec**

In the header, alongside the existing "Phase 1a status" line, add:

```markdown
**Phase 1b status (YYYY-MM-DD):** Implemented on branch `feat/virtual-office-1b-media` — CF Realtime token mint in DO, useMediaDevices + useOfficeRealtime composables, OfficeRoomPanel with tiles/controls/devices, token refresh, tear-down on leave, capacity-full UX, lurking on permission denial. Phase 1c (chat/notes/reactions) plan to be written next.
```

Commit:

```bash
git add docs/superpowers/specs/2026-05-22-virtual-office-foundation-design.md
git commit -m "docs(office): mark Phase 1b implemented in spec"
```

- [ ] **Step 2: Push the branch**

```bash
git push -u origin feat/virtual-office-1b-media
```

- [ ] **Step 3: Open the PR**

```bash
gh pr create --title "feat(office): Phase 1b — Cloudflare Realtime media" --body "$(cat <<'EOF'
## Summary

Phase 1b of the Virtual Office sub-project. Adds video / audio / screenshare to office zones via Cloudflare Realtime (Calls). On `zone:enter` the OfficeRoom DO mints a 1-hour Realtime token scoped to that zone; the browser uses it to publish + subscribe via WebRTC. Permission-denied users lurk (no transmit, can still receive). Tokens refresh ~5 minutes before expiry. Last-out cleans up the Realtime session.

**Spec:** `docs/superpowers/specs/2026-05-22-virtual-office-foundation-design.md`
**Plan:** `docs/superpowers/plans/2026-05-22-virtual-office-phase-1b-media.md`
**UAT:** `docs/superpowers/uat/2026-05-22-virtual-office-phase-1b-uat.md`

## What's in
- CF Realtime API client + DO-side token mint helper
- DO: capacity guard + mint on `zone:enter`, refresh, session tear-down
- New WS messages: `zone:joined`, `zone:join-failed`, `zone:token-refreshed`
- `useMediaDevices` (VueUse-based) + `useOfficeRealtime` (WebRTC + signaling)
- `OfficeRoomPanel` slideover, `OfficeMediaTile`, `OfficeMediaControls`, `OfficeDeviceSettings`
- Zone hover affordance + capacity-full state
- 4 new unit tests; Phase 1a tests still green

## What's out (later phases)
- Per-zone chat / notes / reactions → Phase 1c
- Client portal entry, admin floor-plan editor UI → Phase 1d
- Drop-in audio knock, whiteboard, recording → separate future specs

## Test plan
- [ ] Pull branch locally; ensure `REALTIME_APP_ID/SECRET` are set on the worker
- [ ] `pnpm dev`, open `/office` in two browsers, walk the full UAT checklist
- [ ] Confirm screenshare on both Chrome desktop + Safari iOS
- [ ] Verify capacity guard prevents over-fill
- [ ] Verify token refresh fires (use shortened lead time on a preview deploy)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Return the PR URL** so the user can review.

---

## Self-Review Notes

**Spec coverage:**
- ✅ §4.2 DurableObject state — mint/refresh/tear-down handled in Tasks 3, 5, 6, 7
- ✅ §5.1 frontend (`OfficeRoomPanel`, `OfficeMediaTile`, `OfficeMediaControls`, `OfficeDeviceSettings`, `useOfficeRealtime`, `useMediaDevices`) — Tasks 8–13
- ✅ §5.3 wrangler secrets (REALTIME_APP_*) — Task 1
- ✅ §6.3 zone-enter media flow — Task 5
- ✅ §6.5 disconnect tear-down — Task 7
- ✅ §7 error handling — capacity, permission denied, mint failure, ICE timeout (Tasks 5, 13, 16)
- ✅ §8 testing — unit + manual UAT (Tasks 2, 3, 17)
- ⏸ §6.4 chat / reactions / notes — Phase 1c (out of 1b scope)
- ⏸ §6.2 client portal — Phase 1d
- ⏸ §4.3 — already done in 1a, no changes needed

**Placeholder scan:** No TBD/TODO/"implement later" remain. Task 0 explicitly authorizes calibration ambiguity in the spike. Task 9's WebRTC internals are flagged as "expect spike-driven revision" — that's a documented intentional flex point, not a placeholder.

**Type consistency:** `MediaCredentials`, `ZoneJoinFailReason`, `RealtimeState`, `RemoteTrack` defined once and used consistently across server, worker, composable, and components. `zone:joined` shape is the same in `OutboundMessage` and the WS handler.

---

Plan complete and saved to `docs/superpowers/plans/2026-05-22-virtual-office-phase-1b-media.md`.

**Execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, two-stage review between tasks
2. **Inline Execution** — execute in this session with checkpoints

Which approach?
