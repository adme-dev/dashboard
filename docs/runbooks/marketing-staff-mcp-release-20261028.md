# Marketing staff MCP release record — 28 October 2026

Status: implementation prepared for review; production deployment and staff/provider acceptance remain outstanding. This record separates source, local qualification, canonical schema and live effects. The [operator runbook](marketing-staff-mcp.md) defines enrollment and the [implementation plan](../superpowers/plans/2026-10-27-marketing-staff-mcp.md) defines scope.

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
- Candidate branch: `adme-dev/Garrix-Lopena-marketing-MCP-for-the-marketing-employees`.
- Current-main comparison: `eb294e8600cc4054d1c9dd98eb46ec61c1ea9958`; fetched 27 October 2026 at 17:01 UTC, already an ancestor of the candidate.
- Final executable-source commit: `b1ebf41dd`. The build started on `bbc0c5392` plus the exact reviewed four-file patch subsequently committed as `b1ebf41dd`; the frozen hash receipt proves parity. Documentation-only release bookkeeping follows this source commit. The PR head and local release receipt record final documentation identity.
- Claude contributed planning/review before its OAuth session expired; Codex implemented and independently reviewed, and Kimi researched current host setup and measured bundle compaction. No claim is made that Claude completed later reviews after its session expired.
- Independent whole-branch review covered integrated authority/provider boundaries, frozen Task 6, subsequent corrections and final qualification. Its full report and source hashes are retained in the local artifact directory below. This is code review, not a production acceptance test.

## Local qualification

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

## Canonical schema and live state

Additive migrations 483–489 were applied by the coordinator to the canonical database and read back as committed/verified. Their exact hashes and exclusive mutation receipts are retained; do not reapply or edit them. This confirms schema only. It does not establish deployment, provider transport or customer-event delivery.

No Pages or companion Worker deployment, staff enrollment, provider credential/configuration change, post publication or fabricated enquiry was performed in this workstream. Read-only public discovery returned an MCP Bearer challenge and valid OAuth metadata; this does not prove the candidate is deployed or that a staff host can authenticate and use it.

## Remaining release and activation gates

1. Review the draft release and explicitly account for the new lint debt. Fetch main again immediately before integration/release and reconcile if it changes. Preserve the current candidate until its unmerged work is accounted for.
2. Supply actual staff-to-client assignments and individually reviewed capability grants. No assignments means no client access. Grant configuration remains absent; do not infer all clients or elevate staff to FINANCE/ADMIN. Follow the runbook for grant limits and empty-object revocation.
3. Provision the actual matching LinkedIn app secrets and verify app IDs, granted scopes and account authority. Names-only production inventory refreshed at 16:16 UTC contained 102 secrets and lacked both LinkedIn secrets and the staff grant. No secret values were collected in these reports.
4. Reconcile Pages text-binding capacity before adding settings. The observed estimate is 43 vars + 102 secrets + four generated bindings = 149. Adding both LinkedIn secrets and a staff grant gives 152. Removing two redundant public-ID bindings is only valid after private equality/runtime-pair verification; that conditional plan reaches exactly 150 with no spare slot. A scope override or TikTok credentials requires a separate capacity solution. Recount the actual generated deployment configuration immediately before release.
5. Release Pages through the guarded repository `pnpm deploy:*` workflow to `agency-dashboard`, with the corresponding agency-workflows revision-contract change and social-dispatch-cron reconciliation Worker. Record exact source/main commits, Pages deployment ID, both Worker versions, targets and matching bindings/secrets. Pages-only release with an old workflow contract is not a usable acceptance result. The standalone MCP Worker is unchanged and does not require an automatic redeploy.
6. Complete authenticated host acceptance in the intended Claude/ChatGPT accounts, then real authorized provider-account acceptance for each operation being enabled. Verify revocation, client isolation, draft/review flow and exact approved dispatch. Configuration, validation, transport receipt and provider reporting are separate evidence levels.
7. Keep TikTok readiness false until creator credentials, app audit/product/scopes, current account consent and actual permitted-account acceptance are established. Local tests of its dormant implementation do not authorize activation.

For dealer-specific GTM/conversion work, first establish the exact dealer, host, backend, existing conversion owner and consent policy. Preserve native DriveAgent server delivery and do not add overlapping browser senders or fabricate customer leads for proof.

## Evidence location

Local logs, true exit-code receipts, source snapshots, review reports, disposable PostgreSQL shutdown receipts and canonical migration records are retained under `.superpowers/sdd/2026-10-27-marketing-staff-mcp/`. This directory is intentionally local and ignored; the tracked release record carries the material conclusions without credentials or customer payloads.

Key receipts: `final-regressions.json`, `final-regression-corrections-report.md`, `final-typecheck-final.json`, `final-typecheck-final-baseline-comparison.json`, `final-lint-baseline-comparison.json`, `final-dictionary-validated.json`, `final-build-packed.json`, `final-packed-source-snapshot.json`, `production-secret-name-recheck.json` and the final independent review report.
