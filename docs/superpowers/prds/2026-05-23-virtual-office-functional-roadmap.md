# Virtual Office — Functional Roadmap PRD

**Date:** 2026-05-23
**Owner:** paul@adme.net.au
**Status:** Draft — derived from R&D pass over PR #11, ro.am product audit, and Cloudflare RealtimeKit operational research.
**Companion docs:**
- Foundation spec: `docs/superpowers/specs/2026-05-22-virtual-office-foundation-design.md`
- Phase 1b plan (v2): `docs/superpowers/plans/2026-05-22-virtual-office-phase-1b-media-v2.md`
- Phase 1b UAT: `docs/superpowers/uat/2026-05-22-virtual-office-phase-1b-uat.md`

---

## 1. Vision

Build a virtual office that captures **ro.am's core opinion** — *persistent map + room-isolated audio + drop-in pattern replacing scheduled meetings* — without trying to clone every ro.am feature. Use the differentiators that suit an agency context (time-zone awareness, DND, free client access) to ship something that *feels* like ro.am for staff and is *better* than ro.am for client interactions.

## 2. Goals

1. Two staff members can join the same zone and have real audio+video within 5 seconds of clicking.
2. Drop-in interaction (knock → accept → audio in private office) feels natural.
3. Focus Rooms enforce audio-only at the server preset level (no surprise cameras).
4. Clients can be invited to specific zones via the existing client portal.
5. Operational cost is predictable and observable (CF spend alert, webhook-driven analytics).
6. UAT can be walked confidently before each phase merge.

## 3. Non-goals

- Mobile native app (browser-only acceptable for v1; PWA shell as a stretch).
- AI meeting transcription / Magic Minutes equivalent (Phase 2+).
- Async screen recording / Stories.
- Spatial / proximity audio (room-isolated only — ro.am's choice, and it's right).
- Stadium / theater mode (deferred; <5% of usage per ro.am data).
- Whiteboard inside meetings (Phase 2+).

## 4. Constraints

- Single PR per phase. UAT must be walked before merge.
- Code-review-first discipline (security + correctness review before each merge).
- ~$200/month budget ceiling for CF Realtime media costs at 20-person scale.
- Bug-fix-and-iterate cycles only after Phase 1b lands; no scope creep mid-phase.

---

## 5. Phase breakdown

### Phase 1b' — Finish & ship (PR #11)

Closes the gap between "code complete" and "production functional." Already on branch `feat/virtual-office-1b-media`.

| ID | Task | Effort | Owner | Acceptance |
|---|---|---|---|---|
| 1b'-01 | Create CF RealtimeKit application | 5 min | Paul | APP ID copied to 1Password |
| 1b'-02 | Create CF API token (Realtime Kit: Edit scope) | 5 min | Paul | Token copied to 1Password |
| 1b'-03 | Define `staff_full` preset (audio/video/screenshare publish) | 5 min | Paul | Visible in dashboard |
| 1b'-04 | Define `viewer_lurking` preset (subscribe-only) | 5 min | Paul | Visible in dashboard |
| 1b'-05 | `wrangler secret put CF_ACCOUNT_ID` | 2 min | Paul | `wrangler secret list` shows it |
| 1b'-06 | `wrangler secret put CF_REALTIMEKIT_APP_ID` | 2 min | Paul | Same |
| 1b'-07 | `wrangler secret put CF_REALTIMEKIT_API_TOKEN` | 2 min | Paul | Same |
| 1b'-08 | **Provision CF TURN key** (new finding — corporate NAT) | 10 min | Paul | TURN key UUID + API token |
| 1b'-09 | **Wire TURN credential generation into `mintZoneToken`** | 3h | Claude | Token mint also returns iceServers; browser passes to SDK.init |
| 1b'-10 | UAT walkthrough on preview deploy | 30 min | Paul | All 12 sections in UAT doc green |
| 1b'-11 | `gh pr ready 11` and merge | 5 min | Paul | Main branch updated |

**Phase 1b' exit criteria:** Two real browsers in the same zone, real audio+video, no console errors, no `zone:join-failed` toasts, working through a corporate NAT environment.

---

### Phase 1b'' — Functional rough-edge cleanup (~1 day total)

Plug the operational blind spots surfaced by the R&D pass. Branchable as `feat/virtual-office-1b-polish`.

| ID | Task | Effort | Acceptance |
|---|---|---|---|
| 1b''-01 | Catch SDK error 0011/0012 in `useOfficeRealtime`; auto-retry with backoff + toast | 2h | Network drop during call → recovers in <10s without user action |
| 1b''-02 | Register webhook endpoint at `POST /api/office/_internal/realtime-webhook` | 3h | CF dashboard webhook configured; meeting.ended events update DB |
| 1b''-03 | iOS Safari screenshare graceful pre-check | 30 min | iOS users see "screensharing isn't supported on this browser" toast instead of SDK error |
| 1b''-04 | Empirically measure RealtimeKit token TTL | 30 min | TOKEN_TTL_MS in OfficeRoom.ts matches CF reality; finding noted in spec |
| 1b''-05 | Wire `viewer_lurking` preset on permission-denied | 1h | When `useMediaDevices.permissionDenied = true`, client sends `preferredPreset: 'viewer_lurking'` on `zone:enter`; server enforces |
| 1b''-06 | Add 15-min TTL to `zoneMeta` cache in DO | 1h | Admin SQL edits propagate within 15 min |
| 1b''-07 | CF spend alerts at $50 and $200/month | 10 min | Configured in CF billing |
| 1b''-08 | Subscribe to CF Realtime status page | 5 min | Email/Slack alert on Realtime SFU incidents |

**Phase 1b'' exit criteria:** All Phase 1b known-limitations in the UAT doc either resolved or downgraded to "known-but-acceptable."

---

### Phase 1c — Audio-first culture + drop-in pattern (~5 days)

The single biggest ro.am-feel gain. The Focus-Room-no-camera + knock-to-drop-in interaction is what makes the office feel alive.

| ID | Task | Effort | Acceptance |
|---|---|---|---|
| 1c-01 | Add `audio_only_publish` preset in CF dashboard | 5 min | (Paul) |
| 1c-02 | Migration 100: `office_zones.cf_preset_default = 'audio_only_publish'` for `zone_type='focus'` | 1h | New focus rooms default to audio-only |
| 1c-03 | Real `knock:request` / `knock:accept` / `knock:deny` WS message family | 1 day | Knocking on a focus/private room sends WS to occupant; occupant gets a modal with accept/deny; sound plays |
| 1c-04 | In-zone chat — wire pre-existing `chat_channels` rows per zone to the existing chat UI | 1 day | When in a zone, chat sidebar shows that zone's channel |
| 1c-05 | Profile cards on avatar click | 4h | Click avatar → popover with name, role, status, working hours |
| 1c-06 | Shared notes per zone (DB schema already exists) | 1 day | Tiptap editor wired to `office_zones.notes` with `notes_version` optimistic concurrency |
| 1c-07 | Floating reactions in-zone (emoji float-up over the floor plan) | 4h | RealtimeKit chat or our WS — broadcast emoji, animate over tiles |
| 1c-08 | Admin floor-plan editor UI | 2 days | Drag/resize zones; rename; change zone_type; assign cf_preset_default; save back to office_zones |

**Phase 1c exit criteria:** Staff use the office *instead of* opening Slack for "got a minute?" type asks.

---

### Phase 1d — Client portal entry (~3 days)

Agencies live on client interactions. ro.am ships free guests; we need parity here.

| ID | Task | Effort | Acceptance |
|---|---|---|---|
| 1d-01 | Surface `agency_clients.office_access` flag in admin UI per client | 4h | Toggle to grant/revoke office access |
| 1d-02 | Client-side magic-link entry: `/office/guest/<token>` | 1 day | Client clicks email link, lands in lobby of the correct office |
| 1d-03 | Lobby zone enforces "guest" preset (mic only until invited to a meeting) | 4h | New preset `guest_lobby`; staff click "invite to room" to escalate |
| 1d-04 | Distinct guest avatar styling (badge, ring color) | 2h | Visible at a glance who's a client |
| 1d-05 | Client-chat-status parallel table mirror — already exists per Phase 1a | done | Verify continues to work |
| 1d-06 | UAT: client journey end-to-end | 30 min | Client receives invite → joins lobby → staff escalates → conversation |

**Phase 1d exit criteria:** A real client can be invited and join a real conversation without a staff member having to walk them through anything.

---

### Phase 1e — Differentiators we own (~2 days, optional)

Things ro.am doesn't ship — agency context advantages.

| ID | Task | Effort | Acceptance |
|---|---|---|---|
| 1e-01 | Time-zone overlay on avatars | 1 day | Hover an avatar → shows local time + "11pm — likely sleeping" indicator |
| 1e-02 | DND status suppresses incoming knocks | 4h | DND users can't be knocked; the knock sender sees "Currently in focus — try Slack instead" |
| 1e-03 | Quiet hours (org-wide) | 2h | Configurable hours where everyone is auto-DND |
| 1e-04 | Working-hours-aware floor plan dimming | 4h | Avatars outside working hours render at 30% opacity with a moon icon |

**Phase 1e exit criteria:** Two distributed agencies could use this and feel it was made for them (vs ro.am, made for hybrid-office cultures).

---

### Phase 2 — Stretch (long tail, deferred)

| Item | Note |
|---|---|
| Magic Minutes equivalent (transcription) | ~1 week. Workers AI Whisper + Groq summarization. Big build but ro.am users will ask. |
| Mobile PWA | ~2 weeks. WebRTC works on mobile Safari (audio-only acceptable). Lock-screen widget impossible without native. |
| Background blur / virtual backgrounds | RealtimeKit ships this; ~half day to wire. |
| Integration badges (Spotify / Figma / GitHub on avatars) | ~1-2 days each. OAuth per integration. |
| Whiteboard in meeting rooms | ~3-4 days. Excalidraw embed. |
| Async screen recording (Magicast-equiv) | Skip per spec. |
| Theater / all-hands room | Skip per spec. |
| Native desktop app (Electron) | Skip. |

---

## 6. Open questions / risks

| # | Question | Owner | Resolution path |
|---|---|---|---|
| OQ-01 | How does RealtimeKit GA pricing translate to our scale? | Paul + Claude | Bake billing alerts; revisit when CF announces GA |
| OQ-02 | Krisp noise cancellation: marketing-only or hidden enablement? | Paul | Open CF support ticket referencing issue #113 |
| OQ-03 | Token TTL not documented | Claude | 1b''-04 measures it empirically |
| OQ-04 | Origin allowlist / CORS on the RealtimeKit app | Paul | Check dashboard; lock to production domain if option exists |
| OQ-05 | How do we handle a stuck participant slot (CF error 0100–0900)? | Claude | Implement `DELETE .../participants/<id>` admin path in Phase 1c |
| OQ-06 | Is the `OFFICE_SYNC_SECRET` on Pages identical to the one on the worker? | Paul | Quick verify: `wrangler secret list` value comparison (or rotate both to the same fresh value) |

---

## 7. Decision log (decisions made during R&D)

- **2026-05-22:** Pivoted from raw Cloudflare Realtime SFU to RealtimeKit Core SDK in headless mode. Rationale: SDK abstracts WebRTC negotiation we didn't want to hand-roll; preserves ro.am-cinematic UI by NOT using their UI Kit components.
- **2026-05-22:** Per-zone persistent CF Meeting, lazy-created on first `zone:enter`. Alternative: pre-create on office creation. Chose lazy for self-healing on new zones.
- **2026-05-22:** Two-preset model (`staff_full` + `viewer_lurking`). Alternative: more presets. Chose minimum for v1, can add `audio_only_publish` in Phase 1c.
- **2026-05-22:** Token refresh via DO alarm (not setTimeout). Hibernation-safe.
- **2026-05-23:** Room-isolated audio (not proximity). Matches ro.am opinion; simpler UX.
- **2026-05-23:** No Magic Minutes equivalent in v1. Acknowledge it as table-stakes for "feel like ro.am" but explicitly defer.

---

## 8. Success metrics

- **Phase 1b':** 2 browsers join, audio+video works, no errors. Time-to-functional <5s.
- **Phase 1b'':** Network drop recovery <10s. Zero silent failures.
- **Phase 1c:** Staff knock-to-drop-in usage > 5x/day/staff (vs 0 today; baseline = "got a minute?" Slack count).
- **Phase 1d:** Client invite → first conversation in <2 minutes for a non-technical client.
- **Phase 1e:** Distributed staff (different time zones) report fewer "missed each other" Slack messages.

---

## 9. Operational runbook (what Paul will need to do per phase)

| Phase | Pre-deploy actions |
|---|---|
| 1b' | RealtimeKit app + 2 presets + 3 worker secrets + TURN key |
| 1b'' | None — all code-side |
| 1c | 3rd preset (`audio_only_publish`) + migration 100 |
| 1d | 4th preset (`guest_lobby`) — actually might be same as viewer_lurking; verify |
| 1e | None |

---

## 10. Next action

Per Claude's offer in the R&D report: **start with 1b'-09 (TURN integration)** in parallel with Paul provisioning 1b'-01..08. That clears the only structural blocker to a successful UAT walk.
