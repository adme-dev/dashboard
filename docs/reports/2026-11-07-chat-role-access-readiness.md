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
| Account Services, Paid Media, Production, Finance, Bookkeeping | Version 1 drafts, existing owner eligible | Fresh exact-version preflight; independent cost approval; approved evaluation; inspect all failures before pilot |
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

Initial focused suite: 95 tests passed. Broader AI/chat run: 2,422 passed, 48 skipped. The final Finance-discovery and authority tests plus two actual disposable PostgreSQL suites passed 44 tests. Independent review found no Critical/Important findings and independently passed 42 tests. The completed typecheck before the additional preflight repair reported 1,184 diagnostics, identical to the recorded current-main baseline after checkout-path normalization, with none in this task's changed files. Lint comparison across all changed TypeScript/Vue files found no new diagnostics. Build, final preflight-repair review, full-suite and deployment receipts follow when complete.

The additional preflight repair independently passed 35 tests with no Critical/Important findings. The full test run exposed two stale God-mode inventory snapshots and two older endpoint fixtures. The observe-policy fixture now supplies the current identity/tool-discovery dependencies; the God-mode presentation fixture isolates the accounting database lookup. Their assertions and production authority remain unchanged; those fixture suites and governance evaluation endpoints passed 24 tests.

### Reviewed inventory reconciliation

Snapshot source `2203d56f3e7e2169f0425be22651342ad48f61db` reproduces the old 1,825-row digest `7c8b4cc1f6e9a31c3fe351322b08fbe2b77030927a97d2f491815cbb25f72a5a`. Current main before this repair already had 1,848 rows. The merged native-chat/role-skills work added six authenticated API routes (three lexical mutations): role-skill management/discovery and allowlisted official-documentation retrieval. Total routes are now 2,387, mutations 1,304; inline guarded mutations remain 431 and direct transaction calls 58. Role-skill writes delegate fresh ADMIN/write authority; documentation remains authenticated, bounded public retrieval. Conversation ownership and fresh specialist/client authority remain enforced.

Reviewed gate-row changes move tool flags into request-aware shared helpers, replace static specialist role checks with fresh grants, and add role-skill presentation/binding rows. This repair adds one lexical `permissionGroups` return row. The final 1,849-row digest is `83b54ea657dce54f5ab147a3538e63aa13e9829805b90fd9a9a97f0096a3930e`; class counts in existing order are 90 fresh-grant, 146 identity/tenant, 222 provider/configuration, 1,634 governance, 322 ordinary, 434 unrelated. The mechanical classifier and God-mode bypass registrations are unchanged. Lexical classifications, including `bindings` matching the provider heuristic, do not grant bypass authority.

An independent reviewer inspected all 16 added/changed route files and their delegated authority since the snapshot, recomputed these values, and passed 57 authority/documentation tests. Only expected counts/digests and explanatory comments were refreshed.

The first complete repository run passed 23,572 tests, skipped 4,384 and failed six tests in the two inventory suites and the two stale-fixture suites described above. The repaired inventory suites passed 26/26; the repaired endpoint fixtures plus evaluation endpoints passed 24/24. A final complete run is in progress. The production build passed: raw worker 25,448,505 / 25,468,928 bytes (20,423 remaining), gzip 7,340,057 / 9,750,000. Size guards were not raised.
