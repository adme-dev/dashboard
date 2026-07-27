# Handoff — Measurement destination validation: PR #311 open, live-verified, two onboarding gaps remain

Date: 2026-07-27. Continues from `docs/superpowers/handoffs/2026-07-27-phase-c-complete-items-3-4-shipped.md`.

## Where things stand

**PR #311 is OPEN and mergeable**: https://github.com/adme-dev/dashboard/pull/311

- Branch `worktree-measurement-destination-validation`, 18 commits, base `origin/main` @ `9c8fa54a` (main has not moved).
- Worktree on disk: `.claude/worktrees/measurement-destination-validation`.
- Full suite: **20 failed files / 39 failed tests — the documented pre-existing baseline, unchanged** — with 6812 passing (6753 at branch start, +59).
- No database migration in this branch. None was needed.

The end-to-end chain has been **verified live against production Postgres**, not merely reviewed. See "Live verification" below.

## What the branch fixes

`healthService.recordValidation` is the only code that can set
`conversion_destinations.health_status = 'ready'`. It was built with tests in
`662a1c10` and **never wired to anything** — no route, cron, or worker.

That closed the whole pipeline: `activationRepository.ts:281` blocks with
`destination_not_ready` unless every destination is ready → nothing sets
`enabled` / `environment = 'live'` → `outbox.ts:162-166` never opens. So **no
client could be onboarded to conversion delivery on any platform**, and Phase
C's conversion-value passing and GA4 micro-conversions were inert.

The three destinations live in production were made ready by **hand-run SQL** —
`last_validated_at` and `last_success_at` are microsecond-identical
(`recordValidation`'s UPDATE signature) despite no code path existing.

Nine tasks, each individually reviewed:

1. `shared/utils/measurementPlatform.ts` — one source of truth for the platform
   union, capability definitions, and test coverage (was ~9 hand-maintained copies).
2. Actor type carried through to the audit trail.
3. GA4 debug-validation provider (`/debug/mp/collect`).
4. GA4 provider test mode (incl. fixing `expectedPlatform`, which rejected every
   GA4 test as `not_found`).
5. **The core fix** — provider tests record validation evidence.
6. Operator attestation service + route for browser-tag capabilities.
7. GA4 support in the destination editor.
8. GA4 + validation feedback in the provider-test UI.
9. Attestation control + readiness breakdown in the panel.

## Live verification — and the Critical bug it caught

Running the chain against the real database **failed immediately** on something
all eight reviews and 6810 passing tests had missed:

```
measurement_config_audit_actor_type_check
```

The column's CHECK permits only `team_member | client_user | system | import` —
the vocabulary `MeasurementActorSchema` already declares. The attestation path
passed `'user'`, which exists nowhere else in the codebase. **Every operator
attestation died at the database.** Since browser-tag capabilities can only be
attested, no Meta or Google destination could reach `ready`. The feature did not
work end to end.

Fixed in `81cd32c9` with `'team_member'` — already permitted, semantically right
for agency staff, no migration. `'system'` still marks provider-produced
evidence, so the machine-vs-human distinction survives. Added regression tests
that assert the schema now *rejects* an out-of-vocabulary actor type.

**The lesson worth carrying:** every test in this subsystem mocks Postgres, so
CHECK constraints, triggers, and FKs are invisible to them. A green suite here
does not mean the code works against the database.

After the fix, verified live:

| Step | Result |
|---|---|
| Destination created | `not_configured`, disabled, `test` env |
| Activation readiness **before** | `destination_not_ready` + `capability_not_ready` |
| Attestation | → `healthStatus: ready` |
| `health_status` | **`ready`** |
| Activation readiness **after** | both blockers **gone**; only `live_approval_missing` / `privacy_approval_missing` remain (the intended human gates) |
| Audit row | `actor_type: team_member` |

## What still needs doing, in priority order

### 1. Merge PR #311

Nothing blocks it. Note **CI auto-deploys `main` to production**, so merging ships this.

### 2. Two gaps stand between this and usable onboarding

Both are **pre-existing**, neither is introduced by this branch, and either one
alone prevents an operator from onboarding a client end to end.

**(a) No UI anywhere sets `credential_ref`.** Zero occurrences of `credentialRef`
in all of `app/`. Meta (`providerTestService.ts:~320`) and GA4 (`~345`) both
hard-fail `*_credential_ref_required` → `permanent_failure` → health `blocked`.
**Only Google Data Manager** (OAuth refresh token) can reach `ready` through the
UI alone. The PATCH endpoint accepts the field but has no frontend caller.
→ *Anyone testing Meta or GA4 first will wrongly conclude this branch failed.*

**(b) No runtime path creates a `client_measurement_profile`.** Migration 256
backfilled one per client existing at that moment
(`INSERT ... SELECT ... FROM agency_clients ON CONFLICT DO NOTHING`) and nothing
since — no trigger, no service method, no endpoint. Live consequence:
**South Morang Motor Group** (`1548b4d1-1857-46da-8f6a-38ca6c46f808`, created
2026-07-23, six days after 256 landed) has no profile and cannot get one through
the product. Every client onboarded from now on is affected.

Suggested fix for (b): create the profile on demand in `profileService.get`, or
add a trigger on `agency_clients`. Mirror what migration 256 does —
`vertical` from `COALESCE(NULLIF(TRIM(industry), ''), 'general')`.

### 3. Add one live-DB smoke test for this subsystem

This is the direct lesson of the Critical bug. Everything here mocks Postgres.
One test that exercises `recordValidation` against a real (or Neon-branch)
database would have caught it. Treat as a genuine follow-up, not a nicety.

A working harness already exists to crib from:
`/private/tmp/claude-501/.../scratchpad/verify-chain.ts` (see "Practical notes"
for how it was run) — it creates a scratch client, seeds a profile, creates a
destination, attests, and asserts the readiness blockers change.

### 4. `expectedConfigVersion` is checked against two diverging columns

`healthRepository.ts:78` checks against the **profile's** `config_version`;
`:92` against the **destination's**. Creating destination #2 bumps the profile
and strands #1, which can then never be re-validated — the test path 409s at the
destination check, attestation 409s at the profile check, and the operator is
told "refresh before testing", which does nothing. Multi-destination clients
only. Workaround: patch + validate each destination in order.

### 5. No re-validation mechanism

Attested evidence never expires, and provider tests **structurally cannot run
against a live destination** (`providerTestRepository.reserve` requires the
profile *and* destination both disabled and `environment = 'test'`). So a live
destination's health is effectively frozen at activation. Pre-existing;
documented in the design's Out of Scope.

### 6. Scratch data left in production

Cleanup is partially blocked: `measurement_config_audit` is append-only
(trigger `trg_measurement_config_audit_append_only`, **no exemption**) and
`agency_clients` cascades into it, so these rows cannot be deleted without
disabling a production safety control. That was not done unilaterally.

- Removed: all scratch `conversion_destinations` and capabilities.
- Remaining: **2 inactive clients named `ZZ_SCRATCH_measurement_verify_*`**,
  2 dormant profiles, 3 audit rows. All inert — disabled, `test` environment,
  cannot deliver.
- To remove: briefly `ALTER TABLE measurement_config_audit DISABLE TRIGGER
  trg_measurement_config_audit_append_only`, delete the clients, re-enable.
  Operator decision.

### 7. Deferred minors (final review triaged every one as SHIP)

- `healthRepository.test.ts` audit assertion — **already tightened** to positional in `81cd32c9`.
- Weak non-2xx assert in the GA4 provider test (`outcome !== 'accepted'`).
- `record_failed` branch: now logs, but remains untested.
- `no_covered_capabilities` is unreachable (defensible defensive coding).
- No test exercises a *mixed* capability array in attestation (implementation is
  correct — it `.filter()`s the whole array).
- GA4 credential dropdown shows the connection UUID twice (no better identifier exists).
- Terse `UFormField` label "Force" in `ClientMeasurementPanel.vue`.
- The destination editor's other fields still use hand-rolled `<label><span>`
  rather than `UFormField`, which CLAUDE.md mandates. Deliberately out of scope.
- Four hand-copied platform unions remain: `healthRepository.ts:17`,
  `portalHealth.ts:92`, `workers/measurement-delivery/src/repository.ts:23`,
  `delivery.ts:25`. All currently correct for `ga4`; they would go stale on a
  5th platform. The two worker copies probably cannot import `~~/shared`.

## Practical notes

- **Run the live verification script** (adapt paths):
  ```bash
  cd .claude/worktrees/measurement-destination-validation
  export DATABASE_URL=$(grep '^DATABASE_URL=' /path/to/repo/.env | cut -d= -f2-)
  pnpm exec tsx --tsconfig .nuxt/tsconfig.server.json <script>.ts
  ```
  The `--tsconfig .nuxt/tsconfig.server.json` flag is required for the `~~/` alias.
- **`DATABASE_URL` in `.env` points at PRODUCTION.** Any script run this way writes
  to real data. Destinations are created disabled and in `test` environment, so they
  cannot deliver — but audit rows are permanent.
- **Dev server in a worktree needs** `CHOKIDAR_USEPOLLING=true pnpm dev` or it dies EMFILE.
- **Never pipe `pnpm vitest run` to `tail`** when you need the exit code — the pipe masks it.
- Pushing to `adme-dev/dashboard` requires the `adme-dev` gh account (Paul008 gets 403).
- Design: `docs/superpowers/specs/2026-07-27-measurement-destination-validation-design.md`
- Plan: `docs/superpowers/plans/2026-07-27-measurement-destination-validation.md`
- Per-task history, deferred minors, and controller errors:
  `.superpowers/sdd/2026-07-27-measurement-destination-validation/progress.md`
  (gitignored scratch — read it before deleting the worktree).

## Recommended next session

Merge #311, then fix the two onboarding gaps (2a and 2b) as one piece of work —
they are the difference between a feature that exists and one an operator can
actually use. Add the live-DB smoke test (3) alongside them, since both fixes
touch exactly the paths that need it.

If instead you want to validate before investing further: onboard one real
client on **Google Data Manager** (the only platform that works end to end
today) and confirm activation succeeds.
