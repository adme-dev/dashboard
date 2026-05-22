# Virtual Office Phase 1b v2 — Manual UAT Checklist

Builds on the Phase 1a UAT — assumes presence works, the office is seeded, and you can already join zones (without media). This UAT covers the **RealtimeKit media layer** added in v2.

**Branch:** `worktree-virtual-office-1b-media` (PR: `feat/virtual-office-1b-media`)
**SDK:** `@cloudflare/realtimekit` v1.4 (Core, headless)

---

## 0. Pre-flight (do this once, before UAT)

- [ ] On the `office-room-worker` Cloudflare worker:
  - [ ] `wrangler secret list --config workers/office-room/wrangler.toml` shows `CF_ACCOUNT_ID`, `CF_REALTIMEKIT_APP_ID`, `CF_REALTIMEKIT_API_TOKEN` (and `OFFICE_SYNC_SECRET` from 1a).
- [ ] On Cloudflare Pages (`agency-dashboard` project) → Production + Preview env vars:
  - [ ] `OFFICE_SYNC_SECRET` set (same value as worker, from Phase 1a)
  - [ ] No Pages-side `CF_*` secrets needed — the worker is the only caller of the CF Realtime API.
- [ ] In Cloudflare dashboard → Realtime → RealtimeKit:
  - [ ] Application `agency-virtual-office` exists; its UUID matches the `CF_REALTIMEKIT_APP_ID` secret.
  - [ ] Two presets defined: `staff_full` (can publish audio/video/screen) and `viewer_lurking` (subscribe-only).
- [ ] Migration 099 applied (`cf_meeting_id`, `cf_preset_default` columns on `office_zones`). Verify:
  ```sql
  \d office_zones
  ```
  Should show both columns. cf_preset_default defaults to `'staff_full'`.
- [ ] Branch deployed to a Pages preview environment (`pnpm deploy:preview`).
- [ ] Worker deployed (`cd workers/office-room && wrangler deploy`).

If any of the above is not set, walking the rest of the UAT will produce `zone:join-failed` toasts with reason `realtime-unavailable` or `mint-failed` and the room panel will never open.

---

## 1. Two-browser happy path — full audio + video

Open Browser A (Chrome) and Browser B (Safari or a Chrome incognito with a different staff login). Both navigate to `/office`.

- [ ] **A clicks Meeting Room A.** Browser permission prompt appears for mic + camera; **A clicks Allow**.
- [ ] OfficeRoomPanel slides up from the bottom. Header shows "Meeting Room A" + a pulsing live dot + "Connected" badge.
- [ ] A's own tile appears in the grid with their video. The "(you)" suffix is visible on the name label.
- [ ] **B clicks Meeting Room A.** B grants permissions. A second tile appears with **A's video** in B's panel within ~2 seconds.
- [ ] Simultaneously, A's panel grows a new tile showing **B's video**.
- [ ] **Audio check** — A says "test 1, test 2"; B hears it through their speakers. B says "test back"; A hears.
- [ ] **Local audio NOT echoed** — A doesn't hear their own voice through their own speakers (local tile has `muted` on the `<video>` element).
- [ ] **Mic mute** — A clicks the mic button in the controls bar. A's icon turns red. **B's tile for A** shows a small red mic-off badge in the bottom-right.
- [ ] **Mic unmute** — A clicks again. Red badge clears on B's side; A's icon goes back to soft/neutral.
- [ ] **Cam toggle** — A clicks the camera button. A's tile (on both A and B's side) shows the "no video" fallback icon. Audio still works (A says "still hear me?"; B hears).
- [ ] **Cam back on** — A clicks again. Video returns.
- [ ] **Screenshare** — A clicks the monitor button. Browser shows screen-picker dialog; A picks any window. A new tile appears in both A and B's grid showing the screenshare track. Screen button is now `primary`/`solid` color.
- [ ] **Stop screenshare** — A clicks the monitor-x button. Screenshare tile disappears from both grids.
- [ ] **Leave** — A clicks "Leave". A's panel closes; A returns to the floor plan. **B's grid loses A's tile** within ~2 seconds.

## 2. Multi-user (3+ participants)

- [ ] Third staff account joins the same Meeting Room A.
- [ ] Both A and B see C's tile appear (3 total tiles each).
- [ ] Tile grid wraps responsively (auto-fit minmax(220px, 1fr)) — no tiles overflow.
- [ ] All three can talk in sequence; audio mixes cleanly.

## 3. Lurking via permission denied

- [ ] Open a fresh Chrome profile (no prior site permissions). Navigate to `/office`.
- [ ] Click a Meeting Room. When the browser permission prompt appears, click **Block**.
- [ ] The OfficeRoomPanel still opens.
- [ ] An amber strip appears above the controls bar reading "Mic/camera permission denied — you're lurking. Click the mic or camera button to retry."
- [ ] You **can see and hear** other participants in the room.
- [ ] Your own tile shows the no-video fallback; mic-off indicator is shown to others.
- [ ] (Stretch goal — defer if not implemented:) The participant token was minted with `viewer_lurking` preset so even if the user attempts to publish, the CF side rejects. Verify via wrangler tail logs.

## 4. Capacity guard

- [ ] Identify a Focus Room (capacity = 1 from seed). Or run:
  ```sql
  UPDATE office_zones SET capacity = 1 WHERE slug = 'focus-1';
  ```
- [ ] **Browser A** enters focus-1. Room opens fine.
- [ ] **Browser B** clicks focus-1. The floor tile is rendered with the dimmed/"Room full" state (already from Phase 1a aesthetic merge).
- [ ] If B clicks anyway (e.g., directly hitting the WS): a red toast "Couldn't join room — Room is full" appears; the panel does NOT open.

## 5. Token refresh (long-running call)

The hard part: token TTL is ~1h in production. Two ways to verify:

**Option A — wait it out**
- [ ] Two browsers in a Meeting Room. Leave both connected idle for 56 minutes.
- [ ] Watch wrangler tail for an outbound POST to `.../participants/<id>/token` (the refresh endpoint).
- [ ] Confirm a `zone:token-refreshed` message arrives on the browser WS console (DevTools → Network → WS).
- [ ] Audio/video does NOT drop — the SDK reconnects with the new token under the hood OR the composable disconnects + reconnects, briefly showing a "Connecting…" badge.

**Option B — shortened lead time (preview environment only)**
- [ ] Temporarily set `REFRESH_LEAD_MS = 30_000` and `TOKEN_TTL_MS = 60_000` in `OfficeRoom.ts`; redeploy worker.
- [ ] Enter a zone. Watch — refresh fires ~30s after entry, audio/video stays up.
- [ ] **REVERT** the values before merging.

## 6. CF API failure modes

For each, you should see a red toast and the panel never opens. Verify via `wrangler tail`:

- [ ] **Bad API token** — `wrangler secret put CF_REALTIMEKIT_API_TOKEN` then paste garbage. Restart worker. A enters a zone → toast "Couldn't join room — CF RealtimeKit 401: ...". Restore the real token after.
- [ ] **Bad APP_ID** — same pattern with `CF_REALTIMEKIT_APP_ID`. Toast: "Couldn't join room — CF RealtimeKit 404: ...". Restore.
- [ ] **Worker missing secrets entirely** — `wrangler secret delete CF_REALTIMEKIT_API_TOKEN`. A enters → toast: "Couldn't join room — Zone metadata not loaded" OR "...REALTIMEKIT not bound". Restore.

## 7. Lazy meeting creation

- [ ] In a fresh database row (cf_meeting_id is NULL), first user enters that zone. Verify:
  ```sql
  SELECT id, cf_meeting_id FROM office_zones WHERE slug = 'meeting-a';
  ```
  before: `cf_meeting_id IS NULL`
  after first entry: `cf_meeting_id` is a UUID
- [ ] Second user joins the same zone: no second `createMeeting` call (verify via wrangler tail — should see only `mintParticipantToken`, not `createMeeting`).
- [ ] Concurrent first-entry race: two users click the same fresh zone simultaneously. Both succeed; only one `cf_meeting_id` ends up in the DB (race guard `WHERE cf_meeting_id IS NULL`). The other DO state self-heals on next `loadZoneMeta` call.

## 8. Network resilience

- [ ] A and B in a call. DevTools → Network → Offline for 5 seconds on A's browser.
- [ ] B sees A's video/audio freeze (last frame held).
- [ ] After A reconnects: presence restores (A's avatar returns to the zone on the floor plan), media restores within ~5 sec.
- [ ] No duplicate A tile in B's grid.
- [ ] No console errors on either browser.

## 9. Browser compatibility

- [ ] **Chrome desktop (latest)** — all 1-8 above pass.
- [ ] **Safari macOS (latest)** — all above pass. Watch for any audio-routing quirks (Safari sometimes routes media to the wrong output device).
- [ ] **Safari iOS (latest)** — happy path 1 + lurking 3 pass. Screenshare may not be supported on iOS Safari — document if it fails gracefully (button click → no-op + console warning, NOT a crash).
- [ ] **Firefox desktop** — happy path 1 passes.

## 10. Multi-tab from one user (regression check, 1a behaviour)

- [ ] User A opens `/office` in two tabs of the same browser. Joins Meeting Room A in tab 1.
- [ ] **Both tabs** show A in Meeting Room A on the floor plan (presence broadcasts to all of A's tabs).
- [ ] **Only tab 1** has the open OfficeRoomPanel — tab 2 does NOT auto-open the panel because tab 2 didn't send `zone:enter` and so didn't receive `zone:joined`.
- [ ] A leaves the room in tab 1 → both tabs reflect the floor-plan return.
- [ ] (Optional, deferred:) Joining the same zone in tab 2 while tab 1 is also in — does the CF SDK accept two participant tokens for the same `customParticipantId`? Document the observed behaviour.

## 11. Performance smoke test

- [ ] In Chrome DevTools, watch network during a 2-person call. RTC inbound traffic should be ≤ 500 KB/s steady-state at default quality.
- [ ] Memory grows ~50 MB for the SDK + tracks. Close panel → memory mostly reclaimed (within ~5 seconds).
- [ ] No console errors over a 5-minute idle call.

## 12. Regression — Phase 1a presence still works

- [ ] Status picker (Available/Busy/DND/Away) still updates across tabs and propagates to chat sidebar status.
- [ ] 30-second disconnect grace still survives a closed tab.
- [ ] Office switcher (if multiple offices) still works.
- [ ] "Around" tray for unzoned people still renders.

---

## Acceptance criteria

All checkboxes ticked AND:

- `pnpm test:run test/workers/office-room/ test/server/utils/officeRoom/ test/server/utils/officeRealtime.test.ts` reports green (currently 28 tests).
- No new browser console errors during 5-minute idle.
- `wrangler tail --config workers/office-room/wrangler.toml` shows expected token-refresh cycle if long-running tested.
- Phase 1a UAT still passes (no regression).

---

## Known limitations (not blockers, documented)

- **Token refresh disconnect-reconnect**: The current `useOfficeRealtime` composable disconnects and reconnects when the auth token changes. The SDK may expose a hot-swap method (`connection.refreshAuthToken`) in a future minor — until verified in the .d.ts, we accept the brief reconnect. ~1-second media gap is acceptable.
- **Device picker (`OfficeDeviceSettings`)**: selecting a different mic/camera updates the `useMediaDevices` getUserMedia stream, but doesn't yet push the new track to the RealtimeKit session. Workaround: leave and re-enter the zone after switching. Followup ticket: bind `setDevice(device)` on `client.self` (the SDK exposes this) to the modal's selectMic/selectCam events.
- **Screenshare on iOS Safari**: not supported by browser. Button click is a no-op. Not a blocker for desktop UAT.

---

## What's NOT in this UAT (later phases)

- Per-zone text chat / notes / reactions → Phase 1c
- Client portal entry → Phase 1d
- Drop-in audio "knock to peek" → separate spec
- Recording / transcription → deferred indefinitely per spec
