# Handoff — Test-Suite Health + Ops Autopilot (2026-06-23)

**Why this exists:** long session; the next work (db/auth test rewrites) needs fresh context.
Two parallel workstreams are in flight. Both branches are **committed, KEPT, NOT pushed** (push
needs the `adme-dev` gh account — `Paul008` gets 403). Nothing is deployed. App is **pre-launch
(no internal users yet)** — so building/verifying is low-risk; the live-rollout caution from
earlier turns is mostly moot until launch.

Durable state also lives in memory: `test-suite-health.md` + `ops-autopilot-program.md` (auto-load).

---

## 0. Resume in 60 seconds

Two git worktrees off the repo root (`/Users/paulgiurin/Documents/Projects/dashboard`):

| Worktree | Branch | What |
|---|---|---|
| `.worktrees/test-health` | `fix/test-suite-health` (off `origin/main` d064518e) | **ACTIVE** — fixing main's red test suite |
| `.worktrees/ops-autopilot` | `feat/ops-autopilot-dept-automation` (merged current w/ main) | DONE/landable — 6 dormant slices |

Env per worktree (already set up; redo if missing): `node_modules` is **symlinked** from the repo
root; run `pnpm exec nuxi prepare` once (needed for the `~~` alias + `.nuxt/tsconfig`). `.env` lives
only in the repo root. Tests: `pnpm exec vitest run <file>`.

**Immediate next task:** continue `fix/test-suite-health` (see §1). Resume prompt:
> "Resume test-suite-health: read docs/superpowers/handoffs/2026-06-23-test-health-and-ops-autopilot-handoff.md and continue — next the 9 drift fixes, then the db.test rewrite, then auth.test last."

---

## ✅ UPDATE 2026-06-23 (later session): Workstream A is COMPLETE

The full vitest suite is **GREEN** — `4062 passed | 4 skipped | 0 failed` across 663 files
(was 129 failed at branch start). Five commits added after the handoff
(`3f351845`, `735f61c1`, `113e7547`, `11ff6291` + this doc update):

- **9 drift fixes** (`3f351845`): `getAppUrl` moved to its own `server/utils/appUrl`
  module — notifications + officeMeetingInvitePost mocked it on the *email* module
  (stale), so the real impl ran; fixed by mocking the actual module. leadsEndpointsList:
  handler now gates on `PERMISSIONS.MEDIA_BUYING` + runs a backfill `queryRows` before
  the data query.
- **db.test.ts rewrite** (`735f61c1`, +`11ff6291` lint): old suite mocked `pg.Pool` and
  imported a removed `healthCheck`; rewrote against the dual-driver (neon() HTTP path in
  tests) — query/queryRows/queryOne/queryCount/execute, transaction BEGIN/COMMIT+ROLLBACK,
  db/getDb wrappers, withRetry. 49→0.
- **auth.test.ts rewrite** (`113e7547`): old suite tested a since-removed system wholesale
  (scrypt, SHA-256 hashToken, DB `user_sessions`, per-entity `checkPermission`). Rewrote
  against the current **stateless-JWT + group-RBAC** model. 46→0.

**⚠️ Two genuine security/coverage changes surfaced during the auth rewrite (NOT test bugs —
operator decisions, documented in `auth.test.ts` header):**
  1. **No server-side session revocation.** `invalidateSession` is gone;
     `invalidateAllSessions` is a no-op stub. Stateless JWT (7-day expiry) → a leaked token
     stays valid until expiry; logout = client cookie clear only. Decide whether real
     revocation (deny-list / short expiry + refresh) is needed before launch.
  2. **`hashToken` is a passthrough stub** → magic-link tokens stored UNHASHED in
     `magic_link_tokens.token_hash`. Mitigated by 1h expiry + atomic single-use claim, but
     DB compromise exposes usable links. Cheap hardening: hash with SHA-256 before storing.

**Next (human-gated):** push `fix/test-suite-health` (needs the `adme-dev` gh account —
`Paul008` gets 403) → open its own PR → merge to main. Then Workstream B (Ops Autopilot)
per §2 / §4.

---

## 1. Workstream A — Test-suite health (ACTIVE, the priority) — see ✅ UPDATE above

**Discovery:** clean `origin/main` (d064518e) has **129 pre-existing vitest failures / 13 files** —
proven NOT caused by Ops Autopilot (identical on a clean main worktree). Means main's CI gate is RED
→ blocks any honest "production-ready" claim. Root cause: core utils refactored, their test suites
abandoned (test a removed API/driver). Fixing on `fix/test-suite-health` → own PR → main.

**Progress: 129 → 104** (4 commits `a1344fd3..350f9ec2` on the branch):
- `test/setup.ts` — expose `useRuntimeConfig`+`createError` as Nuxt auto-import **globals** (server
  utils call them bare; only `#imports` was mocked → ReferenceError). Cleared 9; greened
  briefNotifications + boardNotifications.
- `test/server/utils/cache.test.ts` — rewritten vs current sync `MemoryCache` public API (was
  testing a removed useStorage/KV impl).
- component tests (videoStudioWorkbench, mediaAssetHarness) — dropped brittle exact `h-[min(...)]`
  Tailwind assertions removed by layout refactors #144/#145/#147.
- `adspendHealth.test.ts` — aligned to the impl's actual thresholds (underspend <50%/crit <25%;
  overspend >115%/crit >130%) + current descriptions (impl is source of truth for tuning params).
- socialBudget endpoint — added missing `DEFAULT_SOCIAL_BUDGET_CONTROL_CONFIG` mock export + assert
  the GET handler's **intentional** degrade-to-defaults-when-no-org (not 400; PUT still requires org).
- emailScope — future-dated a `scheduled_at` so the cross-client 403 check isn't pre-empted by
  `schedule_time_in_past`.

**REMAINING (104):**
- **9 drift** (do first — targeted):
  - `notifications.test.ts` (4) — email-payload drift: the `sendXEmail` fns ARE called but with
    changed args. Compare `notifications.ts`'s email calls vs each test's expected payload; update.
  - `officeMeetingInvitePost.test.ts` (3) — invite mock-call-signature drift (`toHaveBeenCalledWith`).
  - `leadsEndpointsList.test.ts` (2) — `requireRole` call signature + response-shape change.
- **`db.test.ts` (49)** — REWRITE: it mocks `pg.Pool` + imports removed `healthCheck`; current
  `db.ts` is the dual-driver (`@neondatabase/serverless` `neon()` + pg). Mock the current driver and
  test the current surface (query/queryRows/queryOne/queryCount/execute/transaction).
- **`auth.test.ts` (46)** — REWRITE LAST, **security-sensitive**: tests removed fns
  `createSessionToken`/`verifySessionToken`/`invalidateSession`/`canAccessPricing`/`checkPermission`
  (NOT in source). Study the CURRENT auth/session/permission model first; confirm the removed fns'
  behaviour is covered by the new model (else coverage genuinely regressed — flag it, don't just
  delete). Don't rubber-stamp current behaviour.

**Method that's working:** fix by root-cause cluster, re-run the file to green, commit per file/batch.
Treat the IMPL as source of truth for tuning params; treat genuinely-removed behaviour as a coverage
question, not an auto-delete. Verify the **full** suite green at the end, then the branch PR is ready.

## 2. Workstream B — Ops Autopilot (DONE this session; paused, landable)

Branch `feat/ops-autopilot-dept-automation`, now **current with main** (merge `f818c4d2`; 2 trivial
additive conflicts resolved). Carries 6 reviewed, **dormant** slices: A.1 escalation spine, A.2
inbox, C1.1 pacing watchdog, C2.1 ad-reports, A.3.1 lifecycle guard, **C5 brief gatekeeper** (read
tool + write auto-gate behind `BRIEF_GATEKEEPER_ENABLED` + all-submit-path coverage). My work is
tsc-clean + all its tests pass. Migs 192/193 already on the live DB. Full detail: memory
`ops-autopilot-program.md` + the prior handoff `2026-06-23-ops-autopilot-handoff.md` (on the
ops-autopilot branch).

Key findings from this session: the Monday 34-status taxonomy was **flattened on import** (A.3 is a
forward-contract map, inert until a real status migration); **C3 deferred** (duplicative w/
pacing+anomaly, and config-hygiene data not synced).

## 3. What only the human can do (the real "ship" gates)
- **Push / merge / deploy** — push needs the `adme-dev` account; deploy from a clean full-install
  checkout (NOT a symlinked worktree — breaks prerender).
- **CF dashboard** — flip the dormant flags + register the crons when activating capabilities.
- **Meta access TIER** — confirm Advanced vs Standard for `ads_management` (scopes + budget/status
  writes already exist; Phase-E gap is mostly CODE — campaign-creation payloads don't exist yet).
- **Decisions** — the status-taxonomy migration (unblocks A.3 teeth + C6 + C7); external API apps.

## 4. Recommended order to "production, enterprise"
1. **Green the test suite** (Workstream A) — it's the CI/quality gate; nothing is honestly
   production-ready while it's red.
2. Land Ops Autopilot (PR → merge → deploy dormant) — zero behaviour change on deploy.
3. Activate capabilities gently (pre-launch, so low-risk): C5 → C1 → C2.
4. Later phases: status migration → A.3/C6/C7; campaign-config sync → C3/C4; Phase E (campaign
   deployment) when Meta/Google access is confirmed.
