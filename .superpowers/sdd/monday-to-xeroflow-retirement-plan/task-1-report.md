# Task 1 report — M1 production inventory manifest

## Status

COMPLETE. M1 implements a read-only, checkpointable Monday inventory for ADME account `229224`. Independent specification and quality re-reviews passed after the pinned-API GraphQL correction. It does not create or update Monday content, XeroFlow records, users, notifications, billing, or cutover state.

## Files changed

- `server/utils/mondayClient.ts` — validates board state at runtime, sends the requested state to Monday, and defines `all` as active plus archived while excluding deleted boards.
- `server/utils/mondayInventory.ts` — deterministic collector, canonical manifest schema, pagination checkpoints, resume validation, completeness verdict, checksum, redaction, object classification, structural edges, membership normalization, and readiness findings.
- `server/utils/mondayInventorySource.ts` — pinned `2025-04` read-only GraphQL adapter for account, current-user-visible workspaces, active/archived boards, board timestamps/views/team references, and active/pending/inactive users.
- `scripts/inventory-monday.ts` — explicit-output, local/private, read-only operator CLI with resume support, required `--dry-run`, exclusive evidence creation, temporary-file cleanup, and sanitized operator errors.
- `test/server/utils/mondayInventory.test.ts` — fixture-driven runtime coverage with 24 tests.
- `.superpowers/sdd/monday-to-xeroflow-retirement-plan/task-1-report.md` — this report.

## TDD evidence

Correction-round RED results under Node `24.18.0`:

- The first consolidated run failed 12 of 19 tests for the reviewed defects: runtime board states, safe `all`, the real `sub_items_board` enum, supported board metadata, workspace limitations, resume validation, bootstrap redaction, and exclusive output.
- After adding canonical-workspace and resume-integrity regressions, 16 of 23 tests failed for the expected missing behavior.
- A focused workspace query test failed until `membership_kind: all` was sent.
- A focused composite-pagination resume test failed until complete checkpoints stopped assuming every source page contains at most the collector page size.
- The final API-version correction test failed on all three strict assertions until the unsupported workspace `membership_kind` argument was removed, its visibility limitation became an explicit blocker, and board team fields used required `{ id }` selection sets.

Final inventory GREEN command:

```bash
/bin/zsh -lic 'nvm use 24.18.0 >/dev/null && pnpm vitest run test/server/utils/mondayInventory.test.ts'
```

Result: 1 file passed; 24/24 tests passed.

Relevant existing Monday client/API regression command:

```bash
/bin/zsh -lic 'nvm use 24.18.0 >/dev/null && pnpm vitest run test/server/utils/mondayClientSchema.test.ts test/server/api/mondayBoardCutoverPlan.test.ts test/server/api/mondayBoardScopedPreview.test.ts'
```

Result: 3 files passed; 20/20 tests passed.

Final whitespace validation:

```bash
git diff --check
```

Result: clean.

## Runtime coverage

- Active and archived board pagination beyond one page, including provider-side archived state selection.
- Runtime rejection of invalid board states and safe active-plus-archived semantics for `all`.
- Standard, real `sub_items_board`, legacy sub-board, custom-object, and document classifications based only on provider metadata.
- An active board whose name contains `Archived` remains active.
- Canonical workspace identity/state/kind/default-workspace fields without leaking adapter-only fields.
- Workspace, group, column/settings, permission, user/team ownership, subscriber references, board `updated_at`, board views, and form-specific view data.
- Connect-board edge extraction where pinned-API column settings expose target boards. Dependency and mirror parsing remains implemented but is not claimed as fixture-verified in M1.
- Active, pending, and inactive account users; exact and missing titles; account kind; direct and team-derived workspace membership; last activity.
- Explicit incomplete verdicts for current-user-only workspace visibility, capped nested workspace membership, unavailable Main workspace metadata, and unresolved team membership.
- Byte-identical reruns, immutable returned manifests, canonical ordering, and SHA-256 verification.
- Partial-page failure with an incomplete verdict and resumable checkpoint.
- Resume without duplicate entities plus schema, checksum, provider, account, API-version, page-size, count, and checkpoint validation that prevents skipped pages.
- Secret redaction from collection, account-bootstrap, and CLI-facing errors.
- Exclusive evidence creation that refuses an existing target and removes temporary files.

## Manifest schema summary

The immutable JSON document contains:

- `schemaVersion`, provider/API/account identity, and a fixed `observedAt`.
- Canonical `workspaces` with direct and team references, Main-workspace identity when exposed, membership completeness, source creation time, and observation time.
- `objects.standardBoards`, `subitemBoards`, `customObjects`, `documents`, and `unknown`.
- Board user/team references, groups, columns/settings, views/forms, supported source timestamps, and observation timestamps.
- `users` with exact title, explicit status/kind, team/workspace memberships, activity, and source/observation timestamps.
- structural `edges` for dependency/connect/mirror columns.
- typed `findings` for unsupported provider surfaces, current-user-only workspace visibility, truncation, unavailable Main workspace data, unresolved teams, unknown classifications, and missing/ambiguous titles.
- `completeness` with verdict, the recorded page size, counts, per-scope checkpoints, failing page, and sanitized errors.
- `checksumSha256`, computed over canonical JSON without the checksum field.

Canonical arrays are ordered by provider ID. Resume reuses the original observation time and provider-ID maps, so a repeated or resumed page cannot duplicate entities. A resume is rejected before hydration when its checksum or run identity does not match, or when its checkpoint would skip a page.

## Security and privacy decisions

- The GraphQL adapter is query-only; no mutation operation exists in the M1 path.
- The API version is pinned to `2025-04` and the account must match `229224` before collection proceeds.
- The CLI refuses to run without `--dry-run` and an explicit output path.
- Evidence is created mode `0600` through an exclusive temporary file and atomic same-filesystem hard link; an existing target is never overwritten and temporary evidence is cleaned on success or failure.
- OAuth/API tokens remain in request headers only and are not included in the manifest or normal CLI output.
- Collection, bootstrap, and top-level CLI errors use the same secret redactor; messages are truncated before persistence/output.
- Missing/blank titles become blockers; no title, role, state, or object kind is inferred from a name.
- Forms are preserved through supported board views. Unsupported automation, dashboard, standalone document, and integration surfaces are explicit findings rather than silent omissions. The later object-type unique identifier is left `null` under the pinned API and documented as a concern instead of being sent as invalid GraphQL.

## Production dry-run status

Executed read-only against ADME account `229224` with the existing server-side credential. No Monday mutation, comment, notification, email, XeroFlow record, or user-access change was made.

The first inventory exposed null workspace/provider identity entries. Fix commits `2c821e27` and `b37f56f3` added tested filtering for null workspaces and nested owner/subscriber/team identities. The immutable failed manifests were retained; the successful collection was resumed into a new output rather than overwriting evidence.

Final private manifest: `/private/tmp/adme-monday-inventory-20260807-resumed2.json`

- SHA-256: `ebf3862f912894e130e896f34eaca8d06e76a724cfbcb0263025992cab476862`
- Collection checkpoints: 4/4 complete; zero collection errors.
- 34 workspaces, 318 active board objects, 201 archived board objects, 174 account users, and 45 structural edges.
- Overall verdict: `incomplete`, correctly blocked by current-user-visible workspace scope plus 166 missing and one blank exact job title. Unsupported automations, dashboards, standalone documents, and integrations remain four typed warnings.

The documented production-safe command remains:

```bash
node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/inventory-monday.ts \
  --dry-run --output /private/tmp/adme-monday-inventory.json
```

Resume an incomplete run with a new output target:

```bash
node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/inventory-monday.ts \
  --dry-run \
  --resume /private/tmp/adme-monday-inventory.json \
  --output /private/tmp/adme-monday-inventory-resumed.json
```

## Commit

Implementation commit: `f5ca8e9f` (`feat: add Monday retirement inventory manifest`). Production-discovered null-shape fixes: `2c821e27` and `b37f56f3`. This evidence report was amended separately to record the resulting hashes and live read-only outcome.

## Concerns

- Monday API `2025-04` does not support the later `membership_kind` workspace argument, so the adapter deliberately omits it and marks the resulting current-user-visible scope incomplete. It also does not expose the later object-type unique identifier or several structural surfaces. Structural gaps are explicit findings; the unavailable identifier remains `null`. All remain pre-cutover review inputs.
- Monday documents that nested workspace owner/subscriber/team collections default to 25 and that some accounts cannot query Main workspace details. Reaching a nested cap, missing Main workspace identity, or unresolved team membership now makes the manifest incomplete rather than certifying partial data.
- Before personalised onboarding can send, 167 missing/blank exact titles need a reviewed backfill or neutral-template decision. The manifest deliberately does not infer those titles.
