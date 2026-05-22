# Virtual Office — Phase 1b' (Finish & Ship) Design

**Date:** 2026-05-23
**Owner:** paul@adme.net.au
**Status:** Approved (brainstorming complete, awaiting user review of written spec).
**Branch:** `feat/virtual-office-1b-media` (continues PR #11 — open, draft, 26 commits, mergeable).
**Parent PRD:** `docs/superpowers/prds/2026-05-23-virtual-office-functional-roadmap.md`
**Companion docs:**
- Foundation spec: `docs/superpowers/specs/2026-05-22-virtual-office-foundation-design.md`
- Phase 1b plan (v2): `docs/superpowers/plans/2026-05-22-virtual-office-phase-1b-media-v2.md`
- Phase 1b UAT: `docs/superpowers/uat/2026-05-22-virtual-office-phase-1b-uat.md`

---

## 1. Goal

Close the gap between "code complete on PR #11" and "two real browsers can hold a real audio+video conversation through `office-room-worker` in production." Ship PR #11 with the smallest set of changes that satisfies the PRD Phase 1b' exit criteria. No 1b'' polish work bleeds into this phase.

## 2. Deviations from the PRD

Two material findings during R&D pass, both reducing scope:

**PRD 1b'-08 (Provision CF TURN key) → DELETED.**
Cloudflare RealtimeKit Core SDK handles TURN/STUN/ICE automatically via the participant `authToken`. There is no separate TURN key to provision and no `iceServers` to inject into `RealtimeKitClient.init()`. The "new finding — corporate NAT" framing in the PRD is incorrect for the RealtimeKit Core path (it would have applied to bare CF Realtime SFU, which was rejected on 2026-05-22 per PRD decision log).

**PRD 1b'-09 (Wire TURN credential generation into mintZoneToken, 3h Claude) → REDUCED to ~20 min.**
Replaced by exposing a single `forceRelay` boolean config option in `useOfficeRealtime`. The SDK's `defaults.forceRelay: true` advanced option prefers TURN over STUN — sufficient for any future hostile-NAT case.

Additionally, **secrets location corrected.** The 3 `CF_REALTIMEKIT_*` secrets belong on the `office-room-worker` (which is the only caller of the CF Realtime API), not on the `agency-dashboard` Pages project. Pages requires no new env vars for 1b'.

## 3. Scope

### In scope

| Area | What ships |
|---|---|
| CF resources | One RealtimeKit application; two presets (`staff_full`, `viewer_lurking`); three worker secrets on `office-room-worker`. |
| Code | One config knob (`forceRelay`, default off) in `useOfficeRealtime`, exposed via `runtimeConfig.public.officeForceRelay`. |
| Deploy | Pages preview deploy of the worktree branch; worker redeploy with new secrets. |
| Verification | Existing 28-test suite green; full 12-section manual UAT walked by Paul. |
| Merge | PR #11 marked ready, merged to `main` after UAT pass. |

### Out of scope (deferred to next phases)

| Item | Phase |
|---|---|
| Auto-retry on SDK errors 0011/0012 | 1b'' |
| RealtimeKit webhook handler (`meeting.ended` → DB) | 1b'' |
| iOS Safari screenshare graceful pre-check | 1b'' |
| Empirical token TTL measurement | 1b'' |
| `viewer_lurking` preset on permission-denied at zone:enter | 1b'' |
| 15-min TTL on `zoneMeta` cache in the DO | 1b'' |
| CF spend alerts ($50, $200) | 1b'' |
| CF Realtime status-page subscription | 1b'' |
| Third preset (`audio_only_publish`) for focus rooms | 1c |
| Real `knock:request` / `knock:accept` / `knock:deny` WS messages | 1c |
| In-zone chat, shared notes, profile cards, floating reactions | 1c |
| Admin floor-plan editor UI | 1c |
| Admin `DELETE participants/<id>` for stuck slot recovery (OQ-05) | 1c |
| Guest preset, lobby zone, magic-link entry, client portal flag UI | 1d |
| Time-zone overlays, DND-suppresses-knocks, quiet hours, hours dimming | 1e |
| Magic Minutes / transcription, PWA, background blur, integration badges, whiteboard | 2 |

Explicit PRD non-goals (not in any phase): mobile native app, async screen recording, spatial audio, stadium/theater mode.

## 4. Architecture / topology

**One RealtimeKit application** serves both production and preview deployments. For 20-person internal scale, per-environment apps double setup cost for no real isolation benefit while traffic is this low. Revisit if Phase 1d introduces external/client traffic.

**Two presets, both defined on that single app:**

| Preset | Publish | Subscribe |
|---|---|---|
| `staff_full` | audio + video + screenshare | everyone in zone |
| `viewer_lurking` | nothing (subscribe-only) | everyone in zone |

Preset names are referenced as plain strings in `workers/office-room/src/realtime.ts:131` (`preset_name: input.presetName`), so the exact strings above are load-bearing — must match what is created in the RealtimeKit app.

**Three worker secrets** on `office-room-worker` (Durable Object that hosts `OfficeRoom`, which is the only code path that calls the CF Realtime API):

| Secret | Value source |
|---|---|
| `CF_ACCOUNT_ID` | `a5b299b3ad15c1b5b895dc66f9357b17` (known; same account as R2). |
| `CF_REALTIMEKIT_APP_ID` | Output of dashboard step 1b'-01 (Paul pastes). |
| `CF_REALTIMEKIT_API_TOKEN` | Output of dashboard step 1b'-02 (Paul pastes); CF API token with Realtime Kit:Edit scope on the app. |

Pages requires no new env vars for the initial 1b' deploy (default `forceRelay: false` reads as undefined → coerces false). `OFFICE_SYNC_SECRET` is already set on both sides from Phase 1a. If `forceRelay` needs to be enabled in production later, that is a one-line `NUXT_PUBLIC_OFFICE_FORCE_RELAY=true` addition to Pages env — operational, not part of the 1b' design.

## 5. Code change

Single edit, in `app/composables/useOfficeRealtime.ts` at line 143:

```ts
// before
const client = await SDK.init({ authToken: creds.authToken })

// after
const client = await SDK.init({
  authToken: creds.authToken,
  defaults: { forceRelay: useRuntimeConfig().public.officeForceRelay === true },
})
```

Surface `officeForceRelay` in `nuxt.config.ts` `runtimeConfig.public` (boolean, default `false`). Flip without redeploying by setting `NUXT_PUBLIC_OFFICE_FORCE_RELAY=true` on Pages.

**Why this shape:**
- Runtime config (not build-time env) — flippable without rebuild.
- Public — read in the browser composable.
- Default off — most users on home/office WiFi where standard ICE works; relay-only adds latency and bandwidth.
- The exact CF init-options key (`defaults.forceRelay`) is verified at execution against `@cloudflare/realtimekit` types before commit. If the SDK puts the option at a different path, the code adjusts; no spec change.

## 6. Task split & sequencing

| # | Task | Owner | Effort |
|---|---|---|---|
| 1b'-01 | Create RealtimeKit application `agency-virtual-office` in CF dashboard → copy App ID | Paul | 5 min |
| 1b'-02 | Create CF API token with Realtime Kit:Edit scope on that app → paste token to me once | Paul | 5 min |
| 1b'-03 | Define `staff_full` preset via CF API | Claude | 5 min |
| 1b'-04 | Define `viewer_lurking` preset via CF API | Claude | 5 min |
| 1b'-05 | Set `CF_ACCOUNT_ID` on `office-room-worker` via `PUT /accounts/{id}/workers/scripts/office-room-worker/secrets` | Claude | 1 min |
| 1b'-06 | Set `CF_REALTIMEKIT_APP_ID` (same endpoint) | Claude | 1 min |
| 1b'-07 | Set `CF_REALTIMEKIT_API_TOKEN` (same endpoint) | Claude | 1 min |
| 1b'-09 | Expose `forceRelay` option in `useOfficeRealtime`; runtime config | Claude | 20 min |
| 1b'-10 | Deploy Pages preview + redeploy `office-room-worker` | Claude | 10 min |
| 1b'-11 | Run existing 28-test suite green | Claude | 5 min |
| 1b'-12 | UAT walkthrough on preview deploy (UAT doc, 12 sections) | Paul | ~50-60 min |
| 1b'-13 | `gh pr ready 11`, merge to `main`, monitor first 30 min in prod | Paul | 10 min |

**Sequencing:** 1b'-01 + 1b'-02 (Paul, ~10 min) → paste values to Claude → 1b'-03 through 1b'-11 (Claude, single batched session, ~30 min) → 1b'-12 (Paul UAT) → 1b'-13 (merge).

**Note on numbering:** PRD §5 numbered the final two tasks `1b'-10` (UAT) and `1b'-11` (merge). This spec splits deploy + test runs as `1b'-10` and `1b'-11`, pushing UAT to `1b'-12` and merge to `1b'-13`. PRD readers cross-referencing should treat the spec's IDs as canonical for execution; PRD IDs are preserved where they appear in §2 deviations.

The PRD also estimated UAT at 30 min. That undercount comes from counting only the happy path; the full 12-section UAT doc has ~60 checkboxes and realistically takes 50-60 min. This spec uses the realistic estimate.

Wall-clock from Paul handing me the App ID + API token to "ready for UAT": ~30 min. Full phase wall-clock with UAT: ~1.5-2 hours.

**Secret handoff:** Paul pastes the App ID (non-secret) and API token (secret) in chat once. Token flows: paste → bash env var → curl body → CF Workers Secret API → discard. Never committed, never echoed, never logged.

## 7. Verification

UAT is the source of truth: `docs/superpowers/uat/2026-05-22-virtual-office-phase-1b-uat.md` — 12 sections, ~60 checkboxes.

**What Claude does before handoff to Paul:**
1. Provision presets, set worker secrets, redeploy worker, deploy Pages preview (`NODE_OPTIONS='--max-old-space-size=8192' pnpm deploy:preview`), confirm clean boot via `wrangler tail --config workers/office-room/wrangler.toml`.
2. Run `pnpm test:run test/workers/office-room/ test/server/utils/officeRoom/ test/server/utils/officeRealtime.test.ts` — must report green (28 tests).
3. Curl-check `/office` on the preview URL for a 200 + correct shell.
4. Hand off with: preview URL, summary of provisioned resources, list of deviations from PRD (none expected beyond those in §2 above).

**What Paul walks (UAT sections):**

| Section | Effort | Notes |
|---|---|---|
| 1. Two-browser happy path | ~10 min | Hard requirement. |
| 2-4. Multi-user, lurking, capacity | ~10 min | Hard requirements. |
| 5. Token refresh | accept Option A (56-min wait) ONLY if Paul has idle time; otherwise **defer** to "monitor first week of production." Option B (shortening TTL) requires temp code + revert, violates no-scope-creep rule. |
| 6-8. Failure modes, lazy creation, network resilience | ~15 min | Hard requirements. |
| 9. Browser compat | Chrome + Safari macOS hard required; Safari iOS + Firefox nice-to-have. iOS screenshare is documented no-op. |
| 10-12. Regression checks (Phase 1a) | ~10 min | Hard requirements. |

**Hard merge blockers:**
- Any Section 1 step fails (core media doesn't work).
- Any browser console errors during a 5-min idle (silent leak).
- Phase 1a regression in Section 12 (broke presence).
- CF spend exceeds $5 for the UAT walk itself (cost-model concern; reopens spec).

**Accepted limitations** (already documented in UAT, not blockers):
- Token refresh causes ~1-second media gap (SDK doesn't expose hot-swap yet).
- Device picker doesn't push new track to RealtimeKit session — workaround: leave + re-enter zone.
- iOS Safari screenshare is no-op (browser limitation, not crash).

## 8. Risks & rollback

| Risk | Likelihood | Mitigation |
|---|---|---|
| CF token lacks Workers Scripts:Edit scope | Medium | Probe with secret-list read before write. If denied, Paul runs `wrangler secret put` for 3 secrets (~90s total). |
| `forceRelay` lives at different key than `defaults.forceRelay` in SDK init options | Low-Medium | Read `@cloudflare/realtimekit` type defs before committing. Wrong path → typecheck fails locally, no production impact. |
| Preset names case-different in dashboard vs `mintZoneToken` string | Low | Create via API (Claude controls exact string); verify by minting a test token before UAT handoff. |
| Worker hot-reloads after `secrets put` but running DO keeps stale env | Medium | Force `wrangler deploy` of `office-room-worker` after secrets land. DO state survives; only worker bundle reloads. |
| Pages preview build OOMs (known issue) | Medium | `NODE_OPTIONS='--max-old-space-size=8192'` per CLAUDE.md. |
| API token value leaks into committed files or log lines | Low | Never written to a file, never echoed in shell output, never committed. |

**Rollback path if production breaks after merge:**

Phase 1b' degrades gracefully when `CF_REALTIMEKIT_*` secrets are missing — the DO replies `zone:join-failed` with reason `realtime-unavailable`; floor plan (Phase 1a) keeps working; no users locked out.

1. **Soft rollback (~5 min):** delete the 3 worker secrets via API → office reverts to "presence only" mode → users see a toast but nothing else breaks. Investigate underlying issue.
2. **Hard rollback (~15 min):** `gh pr revert <merge-commit-sha>`, push, redeploy. Phase 1a state intact.
3. **Nuclear (only if a downstream phase has built on broken 1b'):** as above + delete the RealtimeKit app in dashboard. Loses any meeting history we had — accepted because production traffic was zero anyway.

## 9. Security review checkpoint

Before commit (per repo pre-commit quality rules), re-read changes and confirm:
- API token value never appears in committed files, error messages, or log lines.
- `forceRelay` config doesn't introduce a path where a malicious value could affect server behavior (it's client-side only).
- `useRuntimeConfig().public.officeForceRelay` read is type-narrowed so a string `"false"` env can't accidentally evaluate truthy.
- No new server endpoints added (no new RBAC surface).

## 10. Decisions made during brainstorm

- **2026-05-23:** 1b'-08 deleted, 1b'-09 collapsed to single `forceRelay` config option. Reason: CF docs confirm RealtimeKit Core SDK handles TURN automatically; PRD's "new finding" framing was incorrect.
- **2026-05-23:** Secrets live on `office-room-worker`, not on Pages. Reason: worker is the only caller of the CF Realtime API per `workers/office-room/wrangler.toml` and `realtime.ts`.
- **2026-05-23:** Single RealtimeKit app for production + preview. Reason: 20-person internal scale; per-env split is premature.
- **2026-05-23:** Claude drives 1b'-03 through 1b'-11 via CF API using token from `/Users/paulgiurin/Documents/Projects/promotion-knoxgwmhaval/.env`. Paul retains 1b'-01, 1b'-02 (dashboard-only operations), 1b'-12 (UAT), 1b'-13 (merge).
- **2026-05-23:** UAT Section 5 Option B (TTL shortening with revert) explicitly forbidden — violates no-scope-creep rule. Token-refresh verification deferred to "monitor first week of production" if Paul lacks idle time for Option A.
- **2026-05-23:** Phase 1b' production-bar = PRD exit criteria only. Observability/webhook/retry items stay in 1b''.

## 11. Open items (not blockers)

- **Pages env still has stale `CF_API_TOKEN` and `CF_ACCOUNT_ID`** unreferenced in current worktree code. Likely leftover from earlier exploratory setup. Harmless but worth noting; can be cleaned up in 1b'' if desired.
- **`OFFICE_SYNC_SECRET` drift between Pages and worker (PRD OQ-06):** not in 1b' scope. To verify post-merge, compare `wrangler secret list` against Pages env or rotate both to a fresh value.

## 12. Success metrics (carry-over from PRD §8)

- Two browsers join the same zone, real audio+video works, no console errors during 5-min idle.
- Time-to-functional (click zone tile → media flowing) < 5 seconds.
- UAT walk completes within 60 minutes for Paul.
- Zero `zone:join-failed` toasts during UAT happy path.
