# Virtual Office — Phase 1b v2: Cloudflare RealtimeKit Pivot

> **Supersedes** `2026-05-22-virtual-office-phase-1b-media.md` (v1).
> v1 hand-rolled WebRTC against the raw CF Realtime SFU REST API. v2 uses the higher-level **RealtimeKit** SDK (`@cloudflare/realtimekit`, headless Core). Tasks from v1 that don't change are referenced; only deltas are specified here.

**Spec:** `docs/superpowers/specs/2026-05-22-virtual-office-foundation-design.md`

**Goal:** Add real-time video/audio/screensharing to office zones via Cloudflare RealtimeKit. When a staff member enters a zone, the OfficeRoom DO ensures a per-zone RealtimeKit `Meeting` exists, mints a participant token (preset-scoped), and the browser joins via the Core SDK. Same-zone participants see/hear each other through standard `MediaStreamTrack` bindings to our existing tile components.

## Architecture (v2)

- **One RealtimeKit `Meeting` per office zone**, created lazily on first `zone:enter` and persisted via `office_zones.cf_meeting_id`.
- **Participant tokens** minted server-side per `zone:enter`, scoped to one of two **Presets**:
  - `staff_full` — default; can publish audio/video/screen
  - `viewer_lurking` — fallback when client signals permission-denied at the join handshake; subscribe-only
- **Token TTL** ~1h (undocumented exact; we treat as 1h). DO schedules refresh ~5min before expiry against `POST .../participants/<id>/token`.
- **Client uses `@cloudflare/realtimekit` Core SDK in headless mode** — we render tiles ourselves with the existing ro.am cinematic dark aesthetic via `OfficeMediaTile`. The SDK gives us `meeting.self.{audio,video}Track`, `meeting.participants.joined: Map<peerId, participant>`, and `meeting.self.enable{Audio,Video,ScreenShare}()`.
- **No raw WebRTC code** in the dashboard — the SDK owns ICE/SDP/transport.

## Secrets / env

Set on the worker (via `wrangler secret put`) AND on Pages prod + preview AND in `.env` for dev:

```
CF_ACCOUNT_ID=<account id>
CF_REALTIMEKIT_APP_ID=<application uuid>
CF_REALTIMEKIT_API_TOKEN=<account-level API token, realtime_kit:edit scope>
```

> v1's `REALTIME_APP_ID` / `REALTIME_APP_SECRET` are **NOT used** in v2 — they were SFU-layer credentials. If they were already set, leave them or remove; nothing reads them.

## Files (v2 delta)

### New
```
server/database/migrations/099-virtual-office-realtimekit.sql
server/utils/officeRealtime.ts                  # REWRITE — RealtimeKit-shaped API client
test/server/utils/officeRealtime.test.ts        # REWRITE — RealtimeKit-shaped tests
workers/office-room/src/realtime.ts             # REWRITE — RealtimeKit-shaped helper
test/workers/office-room/realtime.test.ts       # REWRITE
server/api/office/_internal/zones.get.ts        # adds cf_meeting_id to response
server/api/office/_internal/meeting.post.ts     # NEW — DO calls this to persist meeting_id after creation
app/composables/useMediaDevices.ts              # unchanged from v1
app/composables/useOfficeRealtime.ts            # NEW — wraps RealtimeKitClient, much simpler
app/components/office/OfficeRoomPanel.client.vue
app/components/office/OfficeMediaTile.vue       # unchanged from v1
app/components/office/OfficeMediaControls.vue   # unchanged from v1
app/components/office/OfficeDeviceSettings.vue  # unchanged from v1
docs/superpowers/uat/2026-05-22-virtual-office-phase-1b-uat.md  # write v2 of UAT
```

### Modified
```
workers/office-room/src/OfficeRoom.ts           # lazy meeting create + mint + refresh + (no tear-down needed; RealtimeKit auto-ends sessions)
workers/office-room/src/types.ts                # MediaCredentials shape includes realtimeAuthToken + meetingId
workers/office-room/src/handlers.ts             # applyZoneEnter receives MediaCredentials (same as v1)
workers/office-room/wrangler.toml               # document CF_* secrets
app/types/office.ts                             # MediaCredentials shape v2
app/composables/useOfficeConnection.ts          # same as v1
app/pages/office.vue                            # same as v1
app/components/office/OfficeZone.vue            # same as v1
```

---

## Task 0v2: User-side CF dashboard provisioning (out-of-band)

You handle this. I scaffold in parallel against mocked fetch. See conversation for the checklist.

- [ ] CF API token with `realtime_kit:edit` scope created
- [ ] RealtimeKit application created, APP ID copied
- [ ] Two presets defined: `staff_full`, `viewer_lurking`
- [ ] `.env` populated with `CF_ACCOUNT_ID`, `CF_REALTIMEKIT_APP_ID`, `CF_REALTIMEKIT_API_TOKEN`

---

## Task 1v2: DB migration — `cf_meeting_id` + default preset on `office_zones`

**File:** `server/database/migrations/099-virtual-office-realtimekit.sql`

- [ ] **Step 1: Write migration**

```sql
-- ============================================================================
-- Virtual Office Phase 1b v2 — RealtimeKit meeting persistence
-- ============================================================================

BEGIN;

ALTER TABLE office_zones
  ADD COLUMN IF NOT EXISTS cf_meeting_id text NULL,
  ADD COLUMN IF NOT EXISTS cf_preset_default text NOT NULL DEFAULT 'staff_full';

CREATE INDEX IF NOT EXISTS idx_office_zones_cf_meeting_id
  ON office_zones (cf_meeting_id)
  WHERE cf_meeting_id IS NOT NULL;

COMMENT ON COLUMN office_zones.cf_meeting_id IS
  'Cloudflare RealtimeKit meeting UUID. Created lazily by the OfficeRoom DO on first zone:enter.';
COMMENT ON COLUMN office_zones.cf_preset_default IS
  'Default RealtimeKit preset name for participants entering this zone (e.g. staff_full).';

COMMIT;
```

- [ ] **Step 2: Run migration**

```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/099-virtual-office-realtimekit.sql
```

- [ ] **Step 3: Commit**

```bash
git add server/database/migrations/099-virtual-office-realtimekit.sql
git commit -m "feat(office): db migration — cf_meeting_id + cf_preset_default on office_zones"
```

---

## Task 2v2: REWRITE `server/utils/officeRealtime.ts` for RealtimeKit (TDD)

**Files:**
- Rewrite: `server/utils/officeRealtime.ts`
- Rewrite: `test/server/utils/officeRealtime.test.ts`

Replaces the v1 SFU-shaped client. New signature mints participant tokens against the RealtimeKit REST API, takes preset name, supports refresh and meeting creation.

### Public surface

```ts
export interface CFAuth {
  accountId: string
  appId: string
  apiToken: string
  fetcher?: typeof fetch
}

export interface CreateMeetingInput extends CFAuth {
  title?: string
}
export interface CreateMeetingResult {
  meetingId: string
}

export interface MintTokenInput extends CFAuth {
  meetingId: string
  name: string                  // display name
  presetName: string            // 'staff_full' | 'viewer_lurking'
  customParticipantId: string   // our ActorHandle like 'user:<uuid>'
}
export interface MintTokenResult {
  participantId: string         // CF-side participant id
  authToken: string             // the value passed to RealtimeKitClient.init
}

export interface RefreshTokenInput extends CFAuth {
  meetingId: string
  participantId: string         // CF-side id (NOT our handle)
}

export async function createMeeting(input: CreateMeetingInput): Promise<CreateMeetingResult>
export async function mintParticipantToken(input: MintTokenInput): Promise<MintTokenResult>
export async function refreshParticipantToken(input: RefreshTokenInput): Promise<MintTokenResult>
```

### Endpoints

Base: `https://api.cloudflare.com/client/v4/accounts/<accountId>/realtime/kit/<appId>`

- `POST /meetings` body `{ title? }` → `{ success: true, data: { id, title, created_at, ... } }`
- `POST /meetings/<meetingId>/participants` body `{ name, preset_name, custom_participant_id }` → `{ success: true, data: { id, token, created_at, custom_participant_id, preset_name, updated_at } }`
- `POST /meetings/<meetingId>/participants/<participantId>/token` → `{ success: true, data: { token } }`

All require `Authorization: Bearer <apiToken>` + `Content-Type: application/json`.

### Tests (write first, expect red)

`test/server/utils/officeRealtime.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import {
  createMeeting,
  mintParticipantToken,
  refreshParticipantToken,
} from '~~/server/utils/officeRealtime'

const baseAuth = { accountId: 'acc1', appId: 'app1', apiToken: 'tok1' }

describe('officeRealtime — RealtimeKit', () => {
  it('createMeeting POSTs to .../meetings and returns meetingId', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { id: 'meet-1', title: 'Zone' } })
    } as Response)
    const out = await createMeeting({ ...baseAuth, title: 'Zone', fetcher })
    expect(out).toEqual({ meetingId: 'meet-1' })
    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acc1/realtime/kit/app1/meetings')
    expect((init as RequestInit).method).toBe('POST')
    expect((init as RequestInit).headers).toMatchObject({
      'Authorization': 'Bearer tok1',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ title: 'Zone' })
  })

  it('mintParticipantToken POSTs participant body and returns authToken', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { id: 'p-1', token: 'rtkt_xyz', custom_participant_id: 'user:u1', preset_name: 'staff_full' }
      })
    } as Response)
    const out = await mintParticipantToken({
      ...baseAuth,
      meetingId: 'meet-1',
      name: 'Paul',
      presetName: 'staff_full',
      customParticipantId: 'user:u1',
      fetcher,
    })
    expect(out).toEqual({ participantId: 'p-1', authToken: 'rtkt_xyz' })
    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acc1/realtime/kit/app1/meetings/meet-1/participants')
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      name: 'Paul',
      preset_name: 'staff_full',
      custom_participant_id: 'user:u1',
    })
  })

  it('refreshParticipantToken POSTs to the token sub-endpoint', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { token: 'rtkt_refreshed' } })
    } as Response)
    const out = await refreshParticipantToken({
      ...baseAuth,
      meetingId: 'meet-1',
      participantId: 'p-1',
      fetcher,
    })
    expect(out).toMatchObject({ authToken: 'rtkt_refreshed' })
    const [url] = fetcher.mock.calls[0]!
    expect(url).toBe(
      'https://api.cloudflare.com/client/v4/accounts/acc1/realtime/kit/app1/meetings/meet-1/participants/p-1/token'
    )
  })

  it('mintParticipantToken throws on non-200 with status + body', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false, status: 403, text: async () => 'forbidden'
    } as Response)
    await expect(
      mintParticipantToken({
        ...baseAuth, meetingId: 'm', name: 'n', presetName: 'p', customParticipantId: 'c', fetcher
      })
    ).rejects.toThrow(/403|forbidden/i)
  })

  it('throws when CF returns success:false', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: false, errors: [{ message: 'bad preset' }] })
    } as Response)
    await expect(
      createMeeting({ ...baseAuth, fetcher })
    ).rejects.toThrow(/bad preset|success.*false/i)
  })
})
```

### Implementation sketch

```ts
const cfBase = (a: CFAuth) =>
  `https://api.cloudflare.com/client/v4/accounts/${a.accountId}/realtime/kit/${a.appId}`

async function cfPost<T>(a: CFAuth, path: string, body: unknown): Promise<T> {
  const fetcher = a.fetcher ?? fetch
  const res = await fetcher(`${cfBase(a)}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${a.apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`CF RealtimeKit ${res.status}: ${detail}`)
  }
  const json = await res.json() as { success: boolean, data?: T, errors?: { message: string }[] }
  if (!json.success) {
    const msg = json.errors?.map(e => e.message).join('; ') ?? 'success:false'
    throw new Error(`CF RealtimeKit error: ${msg}`)
  }
  return json.data as T
}

export async function createMeeting(input: CreateMeetingInput): Promise<CreateMeetingResult> {
  const data = await cfPost<{ id: string }>(input, '/meetings', { title: input.title })
  return { meetingId: data.id }
}

export async function mintParticipantToken(input: MintTokenInput): Promise<MintTokenResult> {
  const data = await cfPost<{ id: string, token: string }>(
    input,
    `/meetings/${input.meetingId}/participants`,
    {
      name: input.name,
      preset_name: input.presetName,
      custom_participant_id: input.customParticipantId,
    },
  )
  return { participantId: data.id, authToken: data.token }
}

export async function refreshParticipantToken(input: RefreshTokenInput): Promise<MintTokenResult> {
  const data = await cfPost<{ token: string }>(
    input,
    `/meetings/${input.meetingId}/participants/${input.participantId}/token`,
    {},
  )
  return { participantId: input.participantId, authToken: data.token }
}
```

- [ ] Run tests, verify red → green.
- [ ] Commit: `feat(office): rewrite officeRealtime client for RealtimeKit (TDD)`

---

## Task 3v2: REWRITE `workers/office-room/src/realtime.ts`

Mirror of `server/utils/officeRealtime.ts` adapted for the worker runtime. Same three functions (`createMeeting`, `mintZoneToken`, `refreshZoneToken`), read CF auth from `env.CF_*`.

```ts
import type { ActorHandle } from '../../../app/types/office'

interface Env {
  CF_ACCOUNT_ID?: string
  CF_REALTIMEKIT_APP_ID?: string
  CF_REALTIMEKIT_API_TOKEN?: string
}

function assertEnv(env: Env): { accountId: string, appId: string, apiToken: string } {
  if (!env.CF_ACCOUNT_ID || !env.CF_REALTIMEKIT_APP_ID || !env.CF_REALTIMEKIT_API_TOKEN) {
    throw new Error('CF_ACCOUNT_ID / CF_REALTIMEKIT_APP_ID / CF_REALTIMEKIT_API_TOKEN not bound')
  }
  return {
    accountId: env.CF_ACCOUNT_ID,
    appId: env.CF_REALTIMEKIT_APP_ID,
    apiToken: env.CF_REALTIMEKIT_API_TOKEN,
  }
}

// (cfPost helper duplicated here — worker runtime can't import server/utils/)

export async function createZoneMeeting(env: Env, zoneName: string, fetcher?: typeof fetch) { ... }
export async function mintZoneToken(opts: {
  env: Env
  meetingId: string
  handle: ActorHandle
  name: string
  presetName: string
  fetcher?: typeof fetch
}) { ... }
export async function refreshZoneToken(opts: {
  env: Env
  meetingId: string
  participantId: string
  fetcher?: typeof fetch
}) { ... }
```

Tests at `test/workers/office-room/realtime.test.ts` mirror the server tests (mocked fetch, same endpoint assertions, env-validation test).

- [ ] Write tests → run red → implement → run green
- [ ] Commit: `feat(office): rewrite DO-side realtime helper for RealtimeKit (TDD)`

---

## Task 4v2: Types + WS message shape

**Files:**
- `app/types/office.ts` — append:

```ts
export type ZonePresetName = 'staff_full' | 'viewer_lurking'

export interface MediaCredentials {
  /** Pass to RealtimeKitClient.init({ authToken }) on the browser */
  authToken: string
  /** Persistent meeting id for this zone (rarely needed client-side but useful for logs) */
  meetingId: string
  /** CF-side participant id (used for token refresh) */
  participantId: string
  presetName: ZonePresetName
  /** ms epoch — best-effort estimate; we refresh proactively before this */
  expiresAt: number
}

export type ZoneJoinFailReason =
  | 'capacity'
  | 'denied'
  | 'meeting-create-failed'
  | 'mint-failed'
  | 'quota'
  | 'realtime-unavailable'
```

- `workers/office-room/src/types.ts` — replace `zone:entered` / `zone:full` with `zone:joined` / `zone:join-failed` / `zone:token-refreshed`. Inbound `zone:enter` gains an optional `preferredPreset` field so the client can request lurking-mode at join time:

```ts
export type InboundMessage =
  | { type: 'heartbeat' }
  | { type: 'status:set', status: OfficeStatus }
  | { type: 'zone:enter', zoneId: string, preferredPreset?: ZonePresetName }
  | { type: 'zone:leave' }

export type OutboundMessage =
  | { type: 'snapshot', snapshot: OfficeSnapshot }
  | { type: 'participant:joined', ... }              // unchanged from 1a
  | { type: 'participant:left', handle: ActorHandle }
  | { type: 'participant:updated', ... }
  | { type: 'participant:moved', ... }
  | { type: 'zone:joined', zoneId: string, media: MediaCredentials }
  | { type: 'zone:join-failed', zoneId: string, reason: ZoneJoinFailReason, message?: string }
  | { type: 'zone:token-refreshed', zoneId: string, media: MediaCredentials }
  | { type: 'zone:taken-over' }
  | { type: 'error', message: string }
```

- [ ] Commit: `feat(office): MediaCredentials v2 (RealtimeKit) + zone:joined message family`

> Note: Phase 1a's `OfficeRoom.ts` will fail to compile because `zone:entered` no longer exists in `OutboundMessage`. That's expected — Task 5v2 fixes it.

---

## Task 5v2: DO — lazy meeting creation + capacity guard + mint on `zone:enter`

**Files:** `workers/office-room/src/OfficeRoom.ts`, `handlers.ts`, `server/api/office/_internal/zones.get.ts`, `server/api/office/_internal/meeting.post.ts`

The DO already proxies `/api/office/_internal/zones?officeId=...` to populate a capacity cache (added in v1 Task 5). Extend the response to include `cf_meeting_id` and `cf_preset_default`.

When `zone:enter` arrives:
1. **Capacity check** — same as v1.
2. **Ensure meeting exists** — if `cf_meeting_id` is null for that zone, call `createZoneMeeting`, then `POST /api/office/_internal/meeting` with `{ zoneId, meetingId }` to persist; update local cache.
3. **Mint participant token** — call `mintZoneToken` with preset = `preferredPreset ?? cf_preset_default ?? 'staff_full'`. (Server enforces preset; we don't trust client-specified lurking unless we agree to.)
4. **Reply `zone:joined`** with the new `MediaCredentials`.
5. **Schedule refresh** ~55min out.

On any error: `zone:join-failed` with appropriate reason.

`server/api/office/_internal/zones.get.ts`:

```ts
const zones = await queryRows<{
  id: string, capacity: number, cf_meeting_id: string | null, cf_preset_default: string
}>(
  `SELECT id, capacity, cf_meeting_id, cf_preset_default
   FROM office_zones WHERE office_id = $1`,
  [officeId],
)
return { zones }
```

`server/api/office/_internal/meeting.post.ts` (NEW):

```ts
/**
 * POST /api/office/_internal/meeting
 * INTERNAL: called by OfficeRoom DO to persist a cf_meeting_id after creation.
 * Body: { zoneId: string, meetingId: string }
 */
import { execute } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const secret = getHeader(event, 'x-office-sync-secret')
  if (!secret || secret !== process.env.OFFICE_SYNC_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'unauthorized' })
  }
  const { zoneId, meetingId } = await readBody(event) as { zoneId?: string, meetingId?: string }
  if (!zoneId || !meetingId) {
    throw createError({ statusCode: 400, statusMessage: 'zoneId and meetingId required' })
  }
  await execute(
    `UPDATE office_zones SET cf_meeting_id = $1 WHERE id = $2 AND cf_meeting_id IS NULL`,
    [meetingId, zoneId],
  )
  return { ok: true }
})
```

> Race-safety: the `WHERE cf_meeting_id IS NULL` clause ensures concurrent meeting creations (rare) don't clobber each other; first writer wins, others silently no-op. The DO must re-fetch the zone after creating to learn the canonical meeting_id if its own creation got beaten.

- [ ] Update existing handler tests in `test/workers/office-room/handlers.test.ts` for the new `applyZoneEnter` shape (now takes `MediaCredentials` from v2).
- [ ] Commit: `feat(office): DO lazy-creates RealtimeKit meeting on first zone:enter + mints participant token`

---

## Task 6v2: Token refresh

Identical to v1 Task 6 except:
- Call `refreshZoneToken({ env, meetingId, participantId })` instead of v1's `mintZoneToken({ env, officeId, zoneId, handle })`
- The `participantId` is the CF-side id stored on the DO participant record (add field on Phase 1a's `ParticipantLite`).

- [ ] Commit: `feat(office): DO schedules RealtimeKit token refresh ~5min before expiry`

---

## Task 7v2: Tear-down — SKIPPED (RealtimeKit auto-ends sessions)

v1 had explicit `endSession` calls when the last participant left a zone. RealtimeKit auto-ends sessions when the last participant leaves; idle Meetings cost nothing. **No tear-down needed.**

If we ever need to delete the meeting entirely (e.g., zone is being deleted), that's a separate admin-only path — out of scope for 1b.

---

## Task 8v2: `useMediaDevices` composable

**Same as v1 Task 8.** Wraps VueUse `useUserMedia` + `useDevicesList`. Still needed because Core SDK doesn't enumerate devices. Optional addition: a `previewStream()` helper that calls `RealtimeKitClient.initMedia({ video: true, audio: true })` for a pre-join setup screen, but that's nice-to-have — not blocking.

---

## Task 9v2: `useOfficeRealtime` composable — RealtimeKit Core SDK

**Replaces** v1 Task 9's hand-rolled WebRTC. Much smaller — the SDK owns transport.

```ts
import { ref, shallowRef, watch, onBeforeUnmount, type Ref } from 'vue'
import type { MediaCredentials } from '~~/app/types/office'

// Lazy-load to keep the SDK out of SSR / initial bundle for the office page only
let RealtimeKitClient: typeof import('@cloudflare/realtimekit').default | null = null
async function loadSDK() {
  if (RealtimeKitClient) return RealtimeKitClient
  const mod = await import('@cloudflare/realtimekit')
  RealtimeKitClient = mod.default ?? (mod as any).RealtimeKitClient
  return RealtimeKitClient!
}

export type RealtimeState = 'idle' | 'connecting' | 'connected' | 'failed' | 'closed'

export interface RemoteParticipant {
  peerId: string
  name: string
  audioTrack: MediaStreamTrack | null
  videoTrack: MediaStreamTrack | null
  isScreenSharing: boolean
  micMuted: boolean
}

export function useOfficeRealtime(opts: {
  credentials: Ref<MediaCredentials | null>
}) {
  const state = ref<RealtimeState>('idle')
  const lastError = ref<string | null>(null)
  const meeting = shallowRef<any>(null)
  const localAudioTrack = ref<MediaStreamTrack | null>(null)
  const localVideoTrack = ref<MediaStreamTrack | null>(null)
  const participants = ref<RemoteParticipant[]>([])

  async function connect(creds: MediaCredentials) {
    state.value = 'connecting'
    try {
      const SDK = await loadSDK()
      const m = await SDK.init({ authToken: creds.authToken })
      meeting.value = m

      // Subscribe to self media changes
      m.self.on('videoUpdate', () => { localVideoTrack.value = m.self.videoTrack })
      m.self.on('audioUpdate', () => { localAudioTrack.value = m.self.audioTrack })

      // Subscribe to participant changes
      const refresh = () => {
        participants.value = Array.from(m.participants.joined.values()).map((p: any) => ({
          peerId: p.id,
          name: p.name ?? 'Participant',
          audioTrack: p.audioTrack ?? null,
          videoTrack: p.videoTrack ?? null,
          isScreenSharing: p.screenShareEnabled ?? false,
          micMuted: !p.audioEnabled,
        }))
      }
      m.participants.joined.on('participantJoined', refresh)
      m.participants.joined.on('participantLeft', refresh)
      m.participants.joined.on('videoUpdate', refresh)
      m.participants.joined.on('audioUpdate', refresh)
      m.participants.joined.on('screenShareUpdate', refresh)

      await m.join()
      refresh()
      state.value = 'connected'
    } catch (err) {
      state.value = 'failed'
      lastError.value = (err as Error).message
    }
  }

  async function disconnect() {
    if (meeting.value) {
      try { await meeting.value.leaveRoom() } catch { /* ignore */ }
      meeting.value = null
    }
    participants.value = []
    localAudioTrack.value = null
    localVideoTrack.value = null
    state.value = 'closed'
  }

  async function toggleMic() { await meeting.value?.self[meeting.value.self.audioEnabled ? 'disableAudio' : 'enableAudio']() }
  async function toggleCam() { await meeting.value?.self[meeting.value.self.videoEnabled ? 'disableVideo' : 'enableVideo']() }
  async function toggleScreen() { await meeting.value?.self[meeting.value.self.screenShareEnabled ? 'disableScreenShare' : 'enableScreenShare']() }

  watch(
    () => opts.credentials.value,
    async (creds, prev) => {
      if (prev && (!creds || prev.authToken !== creds.authToken)) {
        // New token via refresh — pass to SDK if it supports hot-swap; else reconnect.
        // RealtimeKit's auth refresh API: meeting.connection.refreshAuthToken(newToken) per docs.
        if (creds && meeting.value?.connection?.refreshAuthToken) {
          try { await meeting.value.connection.refreshAuthToken(creds.authToken); return } catch { /* fall through to reconnect */ }
        }
        await disconnect()
      }
      if (creds) await connect(creds)
    },
    { immediate: true },
  )

  onBeforeUnmount(disconnect)

  return {
    state,
    lastError,
    localAudioTrack,
    localVideoTrack,
    participants,
    toggleMic, toggleCam, toggleScreen,
    disconnect,
  }
}
```

> Implementer note: the SDK's exact event names (`videoUpdate`, `participantJoined`, etc.) may differ slightly from the above based on the published `@cloudflare/realtimekit` v1.4 API. The implementer should verify against `node_modules/@cloudflare/realtimekit/dist/*.d.ts` after `pnpm add` and adjust.

- [ ] Commit: `feat(office): useOfficeRealtime — RealtimeKit Core SDK wrapper (replaces hand-rolled WebRTC)`

---

## Task 10v2 / 11v2 / 12v2: `OfficeMediaTile`, `OfficeMediaControls`, `OfficeDeviceSettings`

**Unchanged from v1.** Tile binds `MediaStreamTrack` (now from `meeting.self.videoTrack` / `participant.videoTrack` directly — no `srcObject` change needed, but the implementer should test with a `new MediaStream([track])` wrapper if `srcObject = track` doesn't work directly in their browser target).

Tile needs a small adjustment to accept `videoTrack: MediaStreamTrack | null` instead of `stream: MediaStream | null`:

```ts
const props = defineProps<{
  videoTrack: MediaStreamTrack | null
  name: string
  isLocal?: boolean
  micMuted?: boolean
  speaking?: boolean
}>()

watchEffect(() => {
  if (videoEl.value) {
    videoEl.value.srcObject = props.videoTrack ? new MediaStream([props.videoTrack]) : null
  }
})
```

Controls + DeviceSettings unchanged.

---

## Task 13v2: `OfficeRoomPanel.client.vue` — RealtimeKit wiring

Same shell as v1; data sources change:

```ts
const realtime = useOfficeRealtime({ credentials: computed(() => props.credentials) })

// In template:
<OfficeMediaTile :video-track="realtime.localVideoTrack.value" :name="'You'" is-local
                 :mic-muted="!media.enabledAudio.value" />
<OfficeMediaTile v-for="p in realtime.participants.value" :key="p.peerId"
                 :video-track="p.videoTrack" :name="p.name" :mic-muted="p.micMuted" />
```

- [ ] Commit: `feat(office): OfficeRoomPanel binds RealtimeKit local + remote tracks`

---

## Tasks 14v2–19v2

Same as v1 Tasks 14–19 with minor wording adjustments:
- **Task 14:** `useOfficeConnection` already updated in Task 4v2 (new message types). No further work.
- **Task 15:** Mount `OfficeRoomPanel` in `/office` page — identical to v1.
- **Task 16:** Zone hover affordance + capacity-full — identical to v1.
- **Task 17:** UAT — rewrite per `docs/superpowers/uat/2026-05-22-virtual-office-phase-1b-uat.md`. Update test names: instead of "WebRTC negotiation succeeds," say "RealtimeKit meeting joined." Add lurking-via-preset scenario.
- **Task 18:** Final verification — lint, typecheck, run all tests, deploy worker.
- **Task 19:** Push branch, open PR, append "Phase 1b v2 status" line to spec.

---

## What you (Paul) do, what I (Claude) do

| Step | Who | When |
|---|---|---|
| CF dashboard provisioning (Task 0v2) | Paul | Now, in parallel |
| `.env` populated with CF_* vars | Paul | After provisioning |
| Hand off "all four set" confirmation | Paul | Single line back to me |
| DB migration (Task 1v2) | Claude | Now (no CF dependency) |
| Rewrite officeRealtime.ts + tests (Task 2v2) | Claude | Now (mocked fetch) |
| Rewrite DO realtime.ts + tests (Task 3v2) | Claude | Now (mocked fetch) |
| Types (Task 4v2) | Claude | Now |
| useMediaDevices (Task 8v2) | Claude | Now (no CF dependency) |
| `pnpm add @cloudflare/realtimekit` | Claude | Now |
| DO wiring (Task 5v2/6v2) | Claude | After Tasks 2v2/3v2/4v2 land |
| useOfficeRealtime (Task 9v2) | Claude | After SDK installed |
| UI components (Tasks 10v2/11v2/12v2) | Claude | Anytime |
| OfficeRoomPanel + mount (Tasks 13v2/15v2) | Claude | After 9v2 |
| Final verification + deploy + UAT + PR (Tasks 17v2–19v2) | Both | Paul runs UAT; Claude does the rest |

---

## Self-review (vs v1 self-review section)

**Coverage maintained:**
- ✅ Spec §4.2 DurableObject state — Tasks 3v2, 5v2, 6v2
- ✅ Spec §5.1 frontend — Tasks 8v2, 9v2, 10v2–13v2
- ✅ Spec §5.3 secrets (now CF_*) — Task 0v2
- ✅ Spec §6.3 zone-enter media flow — Task 5v2
- ✅ Spec §6.5 disconnect tear-down — auto via SDK (Task 7v2 skipped, documented)
- ✅ Spec §7 error handling — capacity, mint failure, meeting-create failure, denied (preset-based lurking)
- ✅ Spec §8 testing — TDD on Tasks 2v2/3v2; UAT script in Task 17v2

**Risk additions vs v1:**
- New dependency on `@cloudflare/realtimekit` (1.4.0, ~25 days old) — pin version, watch for breaking changes
- SDK event API names not perfectly verified — implementer adjusts based on TypeScript declarations after install
- Pricing: $0.002/min/participant once GA. With 7 zones × small headcount this is negligible (~$1-2/day even at full utilization) but worth tracking.
