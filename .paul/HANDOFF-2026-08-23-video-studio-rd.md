# Handoff — Video Studio R&D, God-mode coverage, render parity (2026-08-23)

**State:** all work merged to `main` and deployed to production. Live commit: `ae8891e8` (PR #444). No open PRs from this work. Nothing half-applied.

## What shipped (4 PRs, all squash-merged + deployed)

| PR | Commit | Contents |
|---|---|---|
| #441 | `9c2c8516` | Owner saves unblocked (God-mode families for studio editing routes); single-screen editor layout + docked resizable timeline; save-error UX + leave guard; rename + client picker; keyboard shortcuts; library filters popover, prompt-based asset titles, empty-lane adds; same-origin media proxy (fixes black preview + false "missing audio"); overlay iframe transparency + render-scale parity; precise Start/Duration/End; snap guide; ⌘-wheel zoom; resizable columns; safe version restore; missing-clip Select/Remove; render progress (migration 398 + worker reporting); 14 more studio write routes registered on the generic external ledger; guard test; Banner Studio coordinator migrated onto the generic one; Video Studio marketing pages |
| #442 | `7f52029e` | "Render may already be running" UX for ambiguous failures; reserved ids for save-asset / voiceover / source-asset routes |
| #443 | `daaeb6c5` | Same ambiguous-failure UX for AI generation + upload |
| #444 | `ae8891e8` | Overlay placement (anchor / size / inset) applied inside banner HTML → render and preview agree by construction |

## Verified on production as Paul (owner, God mode)
- `PUT /timeline` → 200 · `POST /render-video` → 202 · ledger rows `succeeded/result_captured`, `result_reference` = reserved job id · render completed with reels/square/youtube variants.
- Upload / Generate use the identical coordinator + guard test; not fired from the owner account (Generate is billed).

## Root causes worth remembering (also in memory)
- **Owners are always in God mode**; every unregistered write route 503s "God mode mutation coordination required" for owners only. Registry: `server/utils/audio/godModeMutations.ts` (transaction-bound), `server/utils/audio/godModeExternalMutations.ts` + `server/utils/video/godModeStudioMutations.ts` (external ledger), generic coordinator `server/utils/godMode/externalLedgerCoordinator.ts`. Guard: `test/server/utils/godModeStudioMutations.test.ts` scans the studio frontend for write calls.
- **Presigned R2 URLs have no CORS** → canvas/WebAudio loads fail silently. Proxy: `GET /api/agency/audio/projects/:id/media?key=` (Range-aware, key must be in the timeline).
- **Dark-mode `srcdoc` iframes paint an opaque backdrop** unless `color-scheme` matches.
- Inventory ratchets (`godModeIsolationInventory`, `godModeGateInventory`) were bumped deliberately for new route files.

## Not done (and why)
1. **audio-jobs Worker redeploy** — carries per-format render progress ("Rendering square_1x1 · 2 of 3"). `cd workers/audio-jobs && pnpm deploy` rebuilds the render container; **Docker is not installed** on this Mac. Renders work without it; only the progress line is missing.
2. **Merge `main` into `release/send-scan-foundation`** — Paul's working tree has 326 uncommitted files; not touched.
3. **God-mode family boilerplate consolidation** — all families already share the coordinators; remaining duplication is per-family boilerplate with bespoke tests. No behaviour change; low value.
4. **Flaky CI test** `test/public/searchAuthorityMenuAgent.test.ts` — unhandled `document is not defined` after teardown; fails ~1 in 2 runs with all files green. Re-run is safe; real fix = await/cancel the script's deferred DOM work. Not fixed.

## Environment notes
- Deploy worktree: `~/.claude/worktrees/prod-deploy` (detached on `origin/main`, **own** patched `node_modules`, full suite 12,007 pass / 0 fail). Use it for future `pnpm deploy:production`.
- Dev worktree: `~/.claude/worktrees/video-studio-rd` — can be deleted.
- Main checkout `node_modules` predates `patches/@nuxt__ui@4.9.0.patch` (patch only exists on `main`), hence one local-only test failure there.
- Port 3000 dev server was restarted once this session after a cache wipe through a symlinked `node_modules` (my doing; fixed by per-package symlinks).
- Migration 398 (`media_render_jobs.progress`) is applied to the DB.

## Suggested next steps
1. Install Docker → deploy `workers/audio-jobs` → confirm progress line appears on a render.
2. Fire one Generate from the owner account to close the last unverified owner path (costs ~$1.50).
3. Fix the `searchAuthorityMenuAgent` flake (small, contained).
