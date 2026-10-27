# Marketing staff MCP release record — 28 October 2026

Status: implementation is merged and deployed. The complete PR CI job passed before integration; Pages and both companion Workers were released from current main. Live owner setup, QR navigation, public feature routing and natural cron transport were verified. Staff enrollment and authenticated staff/provider acceptance remain outstanding. This record separates source, local qualification, canonical schema and live effects. The [operator runbook](marketing-staff-mcp.md) defines enrollment and the [implementation plan](../superpowers/plans/2026-10-27-marketing-staff-mcp.md) defines scope.

## Delivered scope

| Task | Result | Implementation commit |
| --- | --- | --- |
| 1. Staff authority | Fresh roles, permissions, assignments, signed scopes and explicit capabilities govern discovery and calls; owner authority stays separate. | `a43c7ca2f` |
| 2. Marketing reporting | Executable client-scoped reporting across existing marketing data; no automatic financial access or all-client fallback. | `4e9d5a138` |
| 3. Social workflow | Drafts, media, immutable revisions, independent approval, client sign-off, dispatch and reconciliation. | `40f551f5f` |
| 4. Ads and tracking | Scoped Google Ads/GTM inventory and proposals, independent review, drift/idempotency/unknown-outcome controls and tracking ownership requirements. | `379878f26` |
| 5. Provider readiness | Meta/Instagram/LinkedIn publishing and grant checks; TikTok implementation stays unavailable pending external acceptance. | `c1e6a3f12` |
| 6. Setup and documentation | Individual host setup, fresh access projection, enrollment/revocation guidance, public feature pages and navigation. | `e5722ecc5` |

Integrated corrections in `d9ffda404` enforce fresh requester authority at review, the real Instagram linked-Page OAuth shape, provider grants before any reviewed fan-out, staff capability/catalog parity and signed media middleware coverage. `5def7ead3` reconciles four integrated test fixtures without relaxing production authority. `bbc0c5392` fixes new union-narrowing diagnostics and small type/hygiene issues.

Build correction `b1ebf41dd` now groups already-selected immutable SQL/SSR strings into lazily decoded blocks of at most 16 strings and 128 KiB of decoded JSON. An existing oversized singleton retains its original individual expansion. AST selection, string values, template evaluation, function names, whole-artifact profitability checks and immutable deployment budgets remain enforced.

## Source and review identity

- Repository: `adme-dev/dashboard`.
- Integrated feature branch: `adme-dev/Garrix-Lopena-marketing-MCP-for-the-marketing-employees`, through [PR 723](https://github.com/adme-dev/dashboard/pull/723).
- Qualified PR head: `c584829e269a1416fb60a0511cbccbaf3243f489`. Merged/deployed source: `5e3f5b5472bf6827d094bae2bae029aa4e6f5820`; its source tree is identical to the qualified head. Fresh origin/main checks matched this merge before and after the production build.
- Pre-merge current-main comparison: `eb294e8600cc4054d1c9dd98eb46ec61c1ea9958`; fetched 27 October 2026 at 20:33 UTC, already an ancestor of the candidate.
- Original qualified executable-source commit: `b1ebf41dd`. The original build started on `bbc0c5392` plus the exact reviewed four-file patch subsequently committed as `b1ebf41dd`. Resumed cleanup and deterministic CI test correction are committed as `ee3f5b797` and `e8e07af65`; the new build and source-review receipts are described below. Documentation-only release bookkeeping follows these source commits.
- Claude contributed planning/review before its OAuth session expired; Codex implemented and independently reviewed, and Kimi researched current host setup and measured bundle compaction. No claim is made that Claude completed later reviews after its session expired.
- Independent whole-branch review covered integrated authority/provider boundaries, frozen Task 6, subsequent corrections and final qualification. Its full report and source hashes are retained in the local artifact directory below. This is code review, not a production acceptance test.

## Original local qualification (historical)

| Check | Result and limit |
| --- | --- |
| Combined regressions | 106 selected test files qualified across the initial run and targeted correction reruns. Initially 102 files passed and four failed; all four corrected suites then passed 136 tests with no skips. Do not describe the initial run as green. |
| Database boundaries | Tests used disposable private-socket PostgreSQL fixtures, including actual migrations, locking, concurrency, revision and unknown-outcome cases. Fixtures were stopped after use. |
| Final type fixes | 90 tests in nine files plus 125 tests in four overlapping suites passed. These are targeted reruns, not additive unique totals. |
| Compaction and runtime | 54 tests in nine files passed, including real workerd after minification/filename rewriting, block boundaries, exact SQL/SSR data, lazy cache and unchanged raw/gzip guard behavior. |
| Full typecheck | Exits 2: 951 diagnostics versus 952 on the freshly prepared current-main baseline using the same Node 24.18.0/dependencies. Normalized comparison shows zero added and one removed diagnostic. The repository is not typecheck-clean. |
| Full lint | Exits 1. Initial candidate: 72,805 problems; main baseline: 65,052. Normalized comparison: 7,891 added and 138 removed diagnostics, predominantly style and 525 explicit-any findings. Later targeted corrections were not a fresh full lint run. This is real new quality debt, not merely pre-existing failures, and prevents an unconditional clean-quality claim. |
| Production build | Final `pnpm build` exits 0: raw 25,299,060 / 25,468,928 bytes (169,868 spare), gzip 7,193,462 / 9,750,000 bytes. The first build compiled but failed the raw guard by 207,279 bytes; that failure is retained. |
| Deployment safeguards | 21 tests in three files and `pnpm deploy:check` passed for immutable target `agency-dashboard`. |
| Companion Workers | Agency workflows typecheck and actual Wrangler dry-run passed; isolated social-dispatch-cron dry-run passed. No upload occurred. |
| Existing navigation | QR authorization/menu regression passed in the combined suite; feature entries/navigation were reviewed. This is not a live browser acceptance claim. |

Raw build budget remains 25,468,928 bytes; gzip budget remains 9,750,000 bytes. Do not increase budgets or suppress lint/type failures to label the release clean.

## Resumed qualification

The 20:33 UTC fresh-main check still found `eb294e8600cc4054d1c9dd98eb46ec61c1ea9958` included in the candidate. The earlier qualification table records the original evidence; the following results qualify the subsequent source.

Bounded lint cleanup removed 7,368 introduced diagnostics across 136 branch-owned files. A fresh same-config comparison over 241 changed JS/TS/Vue paths found 7,905 introduced diagnostics before cleanup and 537 after it. The remaining 526 explicit-any findings comprise 127 production-source and 399 fixture findings; nine formatting findings and one unused import point at unchanged baseline-owned lines, and one control-regex finding is the retained security guard. No rules, ignores, security checks or test assertions were suppressed. This is a changed-path comparison, not a fresh whole-repository lint pass. The added recovery-test correction introduces no net lint diagnostics. The later four-file full-suite correction also adds no lint diagnostics against its immediate parent; the final analytics fixture passes ESLint.

PR CI run `40547051260` failed one of 316 Page Studio expired-transfer recovery tests. The failing fixture and authority files were identical to current main. The fixture starts a one-second entitlement expiry before multi-step setup; a diagnostic-only 1,100 ms setup delay reproduced the same permission rejection. The production authority correctly rejects expired admission. The correction installs a clock only in the disposable test schema, pins it during real admission, then advances it to prove both current-plan and immutable retained-authority expiry. It also verifies unchanged retained intent/digest and a fresh original operator. Production authority is unchanged. The corrected test passes both normally and under the same delay; all four CI-step suites pass **316 tests with no skips**. A final formatting-only cleanup has exact AST parity and a passing final-byte targeted rerun. The original remote run's later steps did not execute. The final remote run below subsequently passed every step.

The first repository-wide resumed run found four failing files: two capability-parity cases exceeded the default timeout under parallel load; analytics fixtures omitted fresh authority context and leaked queued responses; a social fixture mocked only part of the permissions module; and the connector page omitted its existing browser-GTM independence explanation. The bounded correction splits the same parity matrix into twelve independently timed cases, supplies real fresh-authority fixtures and assigned-client assertions, uses the complete permissions module, and restores the explanation and tracking-manager link. No backend behavior, timeout, assertion or skip was relaxed. All six affected suites pass 60 tests; the final quote-only analytics cleanup passes its four tests and ESLint. The first broad failure receipt is retained.

| Resumed check | Result |
| --- | --- |
| Independent review | All 136 complete cleanup files mechanically read/parsed and compared directly with HEAD, plus manual review of every semantic exception, relevant control flow and template change; the recovery correction was read and reviewed separately. No open Critical or Important finding. Full manual rereview of every unchanged line is not claimed. |
| Combined regressions | Initial rerun: 104 of 106 files passed, 1,381 tests passed, one gate-fingerprint failure and 39 Task4 tests blocked by the coordinator runner's temporary-directory prefix. The existing safety guard was retained; corrected runner passed all 39, and reviewed gate correction passed all eight tests. The 106-file selection is qualified across these runs, not a single green run. |
| Gate inventory | Exactly one permission-group presentation row moved to its own line. All 1,657 rows retain their classifications/counts; the reviewed fingerprint is updated without weakening an assertion or gate. |
| Typecheck | 951 diagnostics versus the same-main baseline's 952; zero added and one removed. Exit remains 2. |
| Production build | `SEARCH_AUTHORITY_ENABLED=true pnpm build` passes with raw **25,300,276 / 25,468,928 bytes** (168,652 spare) and gzip **7,193,764 / 9,750,000 bytes**. The corrected build completed in 244 seconds; `resume-full-corrected-source.json` binds its four-file source patch to the subsequent commit. |
| Named release gates | Social publishing passes 930 tests in 132 files; deployment safeguards pass 21 tests in three files. These overlap the full suite and are not additive unique totals. |
| Deployment and artifact boundaries | `pnpm deploy:check` passes. Email-renderer artifact isolation passes after producing the required private Worker dry-run artifact; the initial local check correctly failed when that artifact was absent. No upload occurred. |
| Repository-wide tests | CRM search endpoint and governance/browser suites pass 70 tests. The corrected parallel suite passes **19,626 tests across 2,506 files**, with **3,915 tests / 109 files skipped** under their existing optional/database gates; duration 112 seconds. No new skips were added. The final remote CI run subsequently confirmed these totals. |

The first full run had 2,502 passing files, four failing files, 19,583 passing tests and seven failing tests (plus a collection error); the corrected full run above is a fresh single green run. The higher case count includes the expanded parity cases and the social suite that previously could not collect.

Resumed receipts use `final-resume-*`; independent review is `resume-lint-independent-report.md` with reviewed file hashes. All disposable PostgreSQL fixtures were stopped after their runs. No prior failing receipt was overwritten.

## Remote acceptance and production release

[GitHub Actions run 40579457760](https://github.com/adme-dev/dashboard/actions/runs/40579457760), job `122455309336`, passed all 37 CI-job steps on the qualified PR head before merge. The full parallel suite passed **19,626 tests in 2,506 files**, with the existing **3,915 tests / 109 files skipped**. Serial CRM/governance checks passed 70 tests, named social checks passed 930, and deployment guards passed 21; these overlap other selections and are not additive unique totals. Every sequential Page Studio database stage passed, including the corrected expiry fixture. Optional release/deploy jobs were skipped by the PR workflow; deployment evidence comes from the explicit guarded release below.

The remote production build passed at raw **25,300,140 / 25,468,928 bytes** and gzip **7,193,659 / 9,750,000 bytes**. The deployed build passed at raw **25,300,253 / 25,468,928 bytes** and gzip **7,193,734 / 9,750,000 bytes**. Lint/type limitations above remain; green CI is not a claim of a clean whole-repository lint or typecheck.

All timestamps below are UTC on 27 October 2026 (28 October AEDT). All three releases used source `5e3f5b5472bf6827d094bae2bae029aa4e6f5820`.

| Target | Release and readback |
| --- | --- |
| `agency-workflows` | `pnpm deploy:workflows` succeeded at 21:33. Deployment `cf316cb6-b746-493f-b7f6-2654df4c07ee`; version `e85122ca-b00a-4479-a253-aeaae860be8f` at 100%. All six workflow bindings and the existing app URL were retained. |
| Pages `agency-dashboard`, production/main | `pnpm deploy:check` passed, then `SEARCH_AUTHORITY_ENABLED=true pnpm deploy:production` succeeded at 21:46. Deployment `c1c09443-5dc4-4f52-ae51-ed3bb39fb016`, [deployment URL](https://c1c09443.agency-dashboard-6cm.pages.dev). Guarded source/main checks and provider readback agree; provider list abbreviates the source to `5e3f5b5`. |
| `social-dispatch-cron` | Explicit-config Wrangler release succeeded at 21:47. Deployment `ff67c7a1-554e-42bc-82af-941f18b794a6`; version `e037be18-43d5-400f-a21e-25a2f16e4e27` at 100%. Existing two-minute schedule, app URL and secret were retained. |

Workflow-first order preserved the legacy no-revision request shape and instance identity while deploying support for the new immutable revision contract. The cron release used `pnpm exec wrangler deploy --config workers/social-dispatch-cron/wrangler.toml` after an explicit-config dry-run: the generic wrapper otherwise followed an ancestor generated Pages configuration. No Pages target guard was bypassed or changed. The standalone MCP Worker source is unchanged and was not redeployed.

### Live observations and limits

- At 21:36, after the workflow Worker update and before the Pages release, the authenticated production readiness GET returned `ready` over the service binding with all six workflow bindings configured. A final post-Pages repeat could not be read because macOS Accessibility stopped exposing Safari windows, despite its permission status reporting granted. Its failure is retained; final combined Pages-to-workflow readiness is not claimed from that repeat.
- At 21:49, the authenticated owner connector page on `app.xeroflow.io` showed the new assigned-work setup, access preview, refresh control, **Owner God mode is active**, and 169 tools. This verifies the deployed owner UI, not an employee OAuth grant or an external assistant session.
- At 21:52, the authenticated QR Codes page loaded at the release-check URL. No QR code was created, edited or scanned.
- The public feature page on `xeroflow.io` and the exact deployment URL returned 200 with the new feature/setup content. The app hostname intentionally redirects marketing paths to `/auth/login/`; the initial check incorrectly expected marketing content there and is retained as a coordinator assertion failure.
- Anonymous tool-preview access returned 401, and the MCP endpoint returned 401 with a Bearer challenge. This verifies the observed anonymous boundary, not authenticated staff isolation.
- A naturally scheduled run of the new cron version at approximately 21:50 completed with outcome `ok`, returning HTTP 200 from publishing, replenishment and reconciliation endpoints. No manual cron request, workflow, post, enquiry or provider action was triggered. This is scheduler-to-endpoint transport evidence, not evidence of provider publication or customer-event delivery.

The previous Pages deployment was `eb493158-0d78-4f9c-9102-89f20ae5a770` at source `c910df968ac1bef181f9aa99c14008ed2897edac`, which lacked this staff implementation. Testing the owner MCP before the new release therefore did not establish that staff functionality was live.

## Canonical schema and configuration

Additive migrations 483–489 were applied by the coordinator to the canonical database and read back as committed/verified. Their exact hashes and exclusive mutation receipts are retained; do not reapply or edit them. This confirms schema only, independently of provider delivery.

No staff enrollment or provider credential/flag change was made. Names-only production inventory refreshed at approximately 21:13 UTC contained 102 secrets and lacked the staff grant, both LinkedIn client secrets and the Google Ads MCP read/write flags. No secret values were collected in these reports. The build's search-authority flag matched the existing production configuration and CI; CRM provider APIs remain dormant.

## Remaining activation gates

1. Supply actual staff-to-client assignments and individually reviewed capability grants. No assignments means no client access. Grant configuration remains absent; do not infer all clients or elevate staff to FINANCE/ADMIN. Follow the runbook for grant limits and empty-object revocation.
2. Provision the actual matching LinkedIn app secrets and verify app IDs, granted scopes and account authority.
3. Reconcile Pages text-binding capacity before adding settings. The observed estimate is 43 production vars + 102 secrets + four generated bindings = 149. Production vars replace root vars; do not union both sets. Adding both LinkedIn secrets and a staff grant gives 152. Removing two redundant public-ID bindings is only valid after private equality/runtime-pair verification; that conditional plan reaches exactly 150 with no spare slot. Google Ads MCP read/write suite activation, a scope override or TikTok credentials requires a separate capacity solution. A staff grant alone does not enable disabled suites. Recount the actual generated configuration before changing bindings.
4. Repeat the authenticated production workflow-readiness GET when the browser session can be observed again, then complete authenticated host acceptance in the intended staff Claude/ChatGPT accounts. Verify revocation, client isolation, draft/review flow and exact approved dispatch against real authorized provider accounts for each enabled operation. Configuration, validation, transport receipt and provider reporting are separate evidence levels.
5. Keep TikTok readiness false until creator credentials, app audit/product/scopes, current account consent and actual permitted-account acceptance are established. Local tests of its dormant implementation do not authorize activation.

All 55 supervised workers are settled and released. Retire the integrated feature and release-record branches after documentation integration. Retain this workspace's ignored evidence for the pending activation checks; it must not become a stale future release base. Start any further source work from freshly fetched main.

For dealer-specific GTM/conversion work, first establish the exact dealer, host, backend, existing conversion owner and consent policy. Preserve native DriveAgent server delivery and do not add overlapping browser senders or fabricate customer leads for proof.

## Evidence location

Local logs, true exit-code receipts, source snapshots, review reports, disposable PostgreSQL shutdown receipts and canonical migration records are retained under `.superpowers/sdd/2026-10-27-marketing-staff-mcp/`. This directory is intentionally local and ignored; the tracked release record carries the material conclusions without credentials or customer payloads.

Key receipts: `final-regressions.json`, `final-regression-corrections-report.md`, `final-typecheck-final.json`, `final-typecheck-final-baseline-comparison.json`, `final-lint-baseline-comparison.json`, `final-dictionary-validated.json`, `final-build-packed.json`, `final-packed-source-snapshot.json`, `production-secret-name-recheck.json` and the final independent review report.

Release receipts: `resume-remote-ci-accepted.json`, `resume-remote-ci-summary.log`, `final-release-agency-workflows.json`, `final-release-pages-guard.json`, `final-release-pages-production.json`, `final-release-pages-readback.json`, `final-release-social-dispatch-cron.json`, `release-workflows-deployments.json`, `release-cron-deployments.json`, `release-workflows-browser-readiness.json`, `release-final-workflow-readiness.json`, `release-connectors-browser.json`, `release-qr-browser.json`, `release-public-http-checks.json`, `release-public-host-routing.json` and `release-social-cron-natural-receipt.json`.
