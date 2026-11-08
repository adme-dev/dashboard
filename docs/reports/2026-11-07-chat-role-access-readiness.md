# Dashboard chat role access and employee rollout

Inspected source: `62776b77a` (fresh origin/main, PR #895). Authenticated live checks on 7 November 2026 against `https://app.xeroflow.io`; no employee was impersonated. This report separates code validation from evaluated employee rollout.

## Permission repairs

Native assistant context used static system-role defaults and cached database reads while workflow shortcuts used fresh explicit grants. Regression tests reproduced stale Finance/Management visibility, retained company-wide client scope after revocation, ignored system-role read-only settings, and missing-role fallback. The context now reuses the shared exact-role grant loader with uncached identity/scope/preferences/catalog reads. A concurrent system/custom-role reassignment fails closed. My Assistant discovery also excludes Finance tools without the explicit grant, matching execution. No grants or assignments were changed.

The existing organisational-department policy for literal owner/admin identities remains separate from explicit client-scope grants. Owner runtime authority is not evidence of ordinary employee coverage.

Live preflight also exposed a model identity mismatch: Model Ops returns `groq/openai/gpt-oss-120b`, while evaluation assignment resolution uses `openai/gpt-oss-120b`. The orchestrator now resolves the requested provider-scoped catalog entry before comparing assignments and freezes its canonical model ID. Different models, cross-provider IDs and unknown aliases remain rejected. The regression failed before this repair; all 35 orchestrator tests then passed. No evaluation or approval boundary was removed.

## Live rollout state

Authenticated `/api/admin/ai/governance/rollout`, `/readiness`, `/catalog` and `/evaluations` returned 200. The current session is an owner; My Assistant reports legacy runtime mode and owner authority. Those observations do not prove employee sessions.

- 20 active non-owner accounts; zero covered by evaluated active packs.
- 17 accounts have no organisational department; two lack an evaluated release; one lacks a mapped pack.
- Pilot and enforcement both blocked; 30 blockers in total.
- 12 planned packs: five seeded drafts, seven blocked, four missing departments, zero released.
- Before this audit's preflights, five completed historical evaluations failed and four remained queued. The latest inspected failure is from 4 August, not current acceptance evidence. Preserve all failed evidence.

| Pack or cohort | Current state | Required next action |
| --- | --- | --- |
| Account Services, Paid Media, Production, Finance, Bookkeeping | Version 1 drafts, existing owner eligible | Exact-version preflights prepared below; independent cost approval; approved evaluation; inspect all failures before pilot |
| Marketing | No nominated owner | Choose a current eligible department member as capability owner |
| Creative | No nominated owner | Choose a current eligible department member as capability owner |
| Operations | No eligible owner or candidates | Confirm membership and nominate its accountable capability owner |
| Leadership, Sales, HR, Engineering & IT | Organisational department missing | Confirm intended organisation mapping before creating departments or seeding packs |
| 17 unassigned accounts | No organisational department | Confirm real staff/service/test-account status and intended department; do not infer assignment from display names |

## Completion gates

1. Complete the named department/member/owner mapping with the administrator; retain current Finance grants.
2. Review exact preflight model-call and cost ceilings with a second authorised operator.
3. Run the approved evaluations in the documented environment, preserving failed results. Passing unit tests do not substitute for model evaluation.
4. Enrol the named pilot cohort only after the matching versions pass. Verify each real employee session, client-scope denial and immediate revocation.
5. Collect the existing independent privacy/security approval and representative pilot evidence before wider enforcement.

The applicable procedure is [AI assistant rollout](../runbooks/ai-assistant-rollout.md). A development session cannot supply a second human approver or fabricate employee acceptance. No paid evaluation, membership change, runtime activation or provider mutation was performed during this audit.

## Concrete preflight decision packet

Five exact-version preflights returned HTTP 201 on 7 November against `app.xeroflow.io`, using the current assigned model's canonical ID. Each remains `requires_cost_approval`: 25 maximum model calls and 48,000 micro-USD (US$0.048) estimated upper bound. Combined maximum: 125 calls and US$0.24. No model calls were made. Frozen per-case limits are 8,000 input tokens, 1,200 output tokens and 20 seconds; each plan has a 505-second wall limit. The US$0.04 per-case pack policy is a separate upper policy limit, not the smaller rate-derived approval ceiling.

Exact release/version IDs, request budgets, run IDs, plan digests and rate-card IDs are in [the preflight packet](2026-11-07-chat-role-access-preflights.json). Rate cards are valid for seven days; re-preflight if expired or model/material changes. Existing failed evidence remains intact. These production-host simulation plans do not authorize the separate preview pilot or employee enrollment.

| Pack | New evaluation run | Status |
| --- | --- | --- |
| Account management | `50627df9-9f9e-44fc-8ef7-4f48d9d5c638` | Cost approval pending |
| Production | `933c2107-d390-448a-85f1-41a9f0dbb9c6` | Cost approval pending |
| Paid media | `9823acd1-08a2-44cc-a078-c7235ae426f3` | Cost approval pending |
| Finance | `01ab32a6-07ea-46cb-95b4-329258c675f3` | Cost approval pending |
| Bookkeeping | `024dd3fc-ea3d-4097-9c32-b5a14ea845a0` | Cost approval pending |

Outstanding administrator decisions: nominate Marketing and Creative owners from current eligible members Garrix Lopena or Hannah Lavina; establish an eligible Operations member and nominate its owner; confirm the 17 unassigned accounts and missing department mappings; identify the second authorized cost operator, environment/rollback owner and independent privacy/security approver. The earlier question remains unanswered. Do not select owners or staff assignments by inference.

## Verification

Initial focused suite: 95 tests passed. Broader AI/chat run: 2,422 passed, 48 skipped. The final Finance-discovery and authority tests plus two actual disposable PostgreSQL suites passed 44 tests. Independent review found no Critical/Important findings and independently passed 42 tests. Both completed typechecks, including the final preflight repair, reported 1,184 diagnostics, identical to the recorded current-main baseline after checkout-path normalization, with no new diagnostics. Lint comparison across all changed TypeScript/Vue files found no new diagnostics.

The additional preflight repair independently passed 35 tests with no Critical/Important findings. The full test run exposed two stale God-mode inventory snapshots and two older endpoint fixtures. The observe-policy fixture now supplies the current identity/tool-discovery dependencies; the God-mode presentation fixture isolates the accounting database lookup. Their assertions and production authority remain unchanged; those fixture suites and governance evaluation endpoints passed 24 tests.

### Reviewed inventory reconciliation

Snapshot source `2203d56f3e7e2169f0425be22651342ad48f61db` reproduces the old 1,825-row digest `7c8b4cc1f6e9a31c3fe351322b08fbe2b77030927a97d2f491815cbb25f72a5a`. Current main before this repair already had 1,848 rows. The merged native-chat/role-skills work added six authenticated API routes (three lexical mutations): role-skill management/discovery and allowlisted official-documentation retrieval. Total routes are now 2,387, mutations 1,304; inline guarded mutations remain 431 and direct transaction calls 58. Role-skill writes delegate fresh ADMIN/write authority; documentation remains authenticated, bounded public retrieval. Conversation ownership and fresh specialist/client authority remain enforced.

Reviewed gate-row changes move tool flags into request-aware shared helpers, replace static specialist role checks with fresh grants, and add role-skill presentation/binding rows. This repair adds one lexical `permissionGroups` return row. The final 1,849-row digest is `83b54ea657dce54f5ab147a3538e63aa13e9829805b90fd9a9a97f0096a3930e`; class counts in existing order are 90 fresh-grant, 146 identity/tenant, 222 provider/configuration, 1,634 governance, 322 ordinary, 434 unrelated. The mechanical classifier and God-mode bypass registrations are unchanged. Lexical classifications, including `bindings` matching the provider heuristic, do not grant bypass authority.

An independent reviewer inspected all 16 added/changed route files and their delegated authority since the snapshot, recomputed these values, and passed 57 authority/documentation tests. Only expected counts/digests and explanatory comments were refreshed.

Rollout diagnostic repair: `server/api/admin/ai/mcp/status.get.ts` read per-suite flags, the master switch, write-scope opt-in, Worker origin and secret presence directly from `process.env`, so the live owner page reported every suite false while tools/list, tools/call and my-tools served the configured compact `MCP_SUITE_CONFIG` suites through request bindings. It now uses the shared `resolveMcpRuntimeConfig(event)` (binding first, compact config honoured, explicit false or non-string legacy bindings fail closed); secret health mirrors each consumer reader as presence only. Admin/owner auth and the immutable audit read are unchanged; raw secrets and staff-grant JSON are never returned. Its fourteen direct reads leave the lexical gate inventory (eight governance, three provider, three configuration rows); the file keeps its `requireRole` and two role rows and no bypass is registered. The inventory is now 1,835 rows, digest `dacc53f1d09901dfd85b5d084958545f259af3f06e4f9af7a9132b5b50a7d264`, class counts 90, 146, 219, 1,626, 322, 431. Focused tests: `test/server/api/mcpAdminStatus.test.ts` (compact config, explicit-false binding precedence, local fallback, no secret/grant disclosure, per-reader presence semantics); a mutation that drops request bindings fails the two binding cases.

CI note: the `FigFlow email design validation / Email design typecheck` job runs the full `nuxt typecheck` and has failed on every run since it was added on 2026-11-04, including the comparison workflow's own main-baseline job; the main `ci.yml` only typechecks Workers. For this PR (run `42368241004`, head `17b7b1879`) the 1,184 diagnostics equal the pre-PR baseline job (run `42350087437`, head `2203d56f3`) after de-duplication (1,160 unique each); the only textual difference is line drift inside `app/pages/agency/ai/chat.vue`, a file identical between main and this branch, caused by main commits #892–#894. No diagnostic touches a changed file or an importer of one. The job failure is pre-existing repository type debt, not a regression, and the gate was not weakened.

The first complete repository run passed 23,572 tests, skipped 4,384 and failed six tests in the two inventory suites and the two stale-fixture suites described above. The repaired inventory suites passed 26/26; the repaired endpoint fixtures plus evaluation endpoints passed 24/24. The final complete run passed **23,583 tests**, skipped 4,379 and failed none (2,917 passing files, 145 skipped). Five artifact-dependent tests also ran after the build completed. These same six original failures were independently confirmed in current-main CI run `42363347239`; none was hidden or excluded. The production build passed: raw worker 25,448,505 / 25,468,928 bytes (20,423 remaining), gzip 7,340,057 / 9,750,000. Size guards were not raised.


## Code release decision

Implementation commit: `104f62da09c4d5530cd239e0d29cddcefee00cc1`; [PR #896](https://github.com/adme-dev/dashboard/pull/896) contains the repair and evidence. The source and target guard passed for `agency-dashboard / main`, and the branch includes freshly fetched main `62776b77a337d82b5084c839cfd17c9c72847773`. The source repair is locally verified and independently reviewed; merge/deployment still require the PR checks and a fresh source guard. No deployment or live acceptance of the new code is claimed by this report. Keep QR Codes, Ad Spend, My Assistant and role workflows in the post-deployment checks.

Employee activation is a separate blocked decision: use the exact preflight packet for independent cost approval, retain failed historical results, and resolve ownership/membership and preview/security evidence before any rollout. A read-back confirmed all five new runs are queued with zero executed cases and zero cost. Suite and prompt/toolset digests are included in the packet. The account-by-account access review is retained outside source control in the owned local task evidence directory; no assignments were inferred.

Orca workspace pinning remains unfulfilled: the CLI has no supported pin option and Computer Use denied access to Orca. That denial was not bypassed. The active workspace remains available for this unfinished rollout.
