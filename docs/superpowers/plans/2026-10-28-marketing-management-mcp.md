# Marketing Management MCP Implementation Plan

> **For agentic workers:** Use the existing Orca supervised run for implementation and independent review. Follow test-driven development for behavior changes; root owns integration and release.

**Goal:** Give Garrix and Hannah full marketing-management access to supported XeroFlow operations across all active clients, through the application and MCP.

**Architecture:** Introduce a dedicated `MARKETING_MANAGEMENT` permission that grants the active marketing portfolio and independent marketing review without granting general MANAGEMENT/ADMIN/FINANCE. Expose explicitly reviewed department tools through the existing staff projection and call boundary, reusing scoped domain services and existing durable review/execution contracts. Activate supported suites with a compact configuration binding so Pages capacity remains within its existing limit.

**Tech Stack:** Existing Nuxt/Nitro, TypeScript, Zod, PostgreSQL, Vitest, Cloudflare Pages and MCP Worker.

**Spec:** `docs/plans/2026-10-28-marketing-department-mcp-research.md`, supplemented by the owner's 28 October instruction: continue implementation for both employees with full marketing management responsibilities.

## Global constraints

- Both selected staff may manage all active clients; newly active clients must be covered without maintaining per-client support rows or crossing the 100-assignment ceiling.
- Preserve owner authority, signed MCP write consent, fresh revocation checks, inactive-client denial, independent approval, exact revision binding and unknown-outcome reconciliation.
- No general ADMIN/MANAGEMENT/FINANCE access or arbitrary endpoint/SQL tool. No copied owner credentials. No payroll or agency accounting exposure.
- Use existing domain records, approval services and queues. Do not implement parallel campaign, lead, inventory or publishing systems.
- Implement every supported operation honestly; provider product/credential absence must remain an explicit blocker, never a fabricated success.
- Root alone integrates shared MCP policy/registry/call wiring and performs canonical mutations, configuration, enrollment, merge or deployment. Workers own named files only and do not commit concurrently.
- Tracking changes preserve the exact-host/native conversion-owner guard. No customer enquiries or external posts are created merely to prove deployment.
- Current source is `b87589958`; research commit `704f671f7` is included. Re-fetch main before integration and release; preserve existing QR/navigation and immutable deployment budgets.

## Review focus

- Marketing portfolio authority must not accidentally enter the general management MCP catalog or expose financial fields.
- A stale host tool list, revoked role/grant, inactive client or changed revision must fail before provider I/O.
- Stored reporting may not silently synchronise providers or convert absent data to successful zero metrics.
- Bulk resource IDs must all match current client/account/board scope; no partial cross-client updates.
- Enabling compact configuration must preserve legacy flag precedence, false values and production/preview separation.

## Task 1 — marketing authority and application access

**Files:** `server/utils/permissions.ts`, `server/utils/marketingManagement.ts` (new), `server/utils/ai/mcp/staffAuthority.ts`, `server/utils/ai/marketing/{readScope,reviewAuthority}.ts`, `server/utils/{clientScoping,client-access}.ts`, admin role list readback, permission labels and focused tests. Root integrates `marketingPolicy.ts`/`toolContext.ts` changes.

**Interfaces:** `hasMarketingManagementPermission(groups)` is a pure explicit-group predicate; `isMarketingManagementContext(ctx)` requires fresh authority and that permission. Marketing all-active access remains distinct from `isMcpManagementStaff`. Existing `requireIndependentMarketingReviewer` accepts the new dedicated group while preserving self-review, writable and active-client checks.

- [x] Write and observe failing tests for marketing-only group, 101+ clients, active/inactive/revoked access, finance isolation and peer/self review.
- [x] Implement shared authority and application scope; refresh administrative role-list reads.
- [x] Run focused authority, reporting and review regressions; independent review before completion.

## Task 2 — department reporting tools

**Files:** new `server/utils/ai/marketing/departmentReads.ts`, new `server/utils/ai/mcp/departmentReadTools.ts`, `test/ai/marketingDepartmentReads.test.ts` and SQL/service contract fixtures.

**Interfaces:** export `departmentReadTools: AiTool<unknown>[]`. Every handler resolves fresh marketing authority and scopes SQL before aggregation. Root registers these through the department suite.

- [x] Write failing tests for portfolio pagination/completeness, budget health, lead-quality aggregates, SEO/content, inbox/email reporting, creative inventory and team work coverage.
- [x] Implement bounded stored-data read services with timestamps, coverage, compatible metrics and no financial/customer payload leakage.
- [x] Verify zero/unmapped/stale/ambiguous/unauthorised cases and no provider writes or refreshes.

## Task 3 — configuration and activation capacity

**Files:** `server/utils/ai/mcp/runtimeConfig.ts`, runtime config tests, `wrangler.toml`, deployment configuration tests/runbook.

**Interfaces:** optional `MCP_SUITE_CONFIG` JSON supplies known boolean suite flags only when individual legacy bindings are absent. Present malformed/false legacy values retain fail-closed precedence. Unknown/malformed compact configuration grants nothing through that source.

- [x] Write failing tests for legacy precedence, invalid JSON/types/keys, disabled financial/destructive/automation defaults and list/call parity.
- [x] Replace redundant production generation/video/banner bindings with compact equivalent values plus intended supported writes/feeds/Google Ads read/plan activation; leave preview disabled and billing/destructive automation defaults unchanged.
- [x] Verify effective binding count and exact semantic preservation; root deploys only after integrated review.

## Task 4 — complete operations and marketing review

**Files:** new department operations/review tool modules and shared services, existing scoped budget/feed/task/creative/content services, relevant browser routes and tests. File ownership will be assigned by operation family before dispatch.

**Interfaces:** export explicit tool arrays and execution functions consumed by one department suite; mutations require signed write scope, fresh `MARKETING_MANAGEMENT` plus `department_management` grant, client/resource checks, durable idempotency and existing approval semantics.

- [x] Implement and test budget allocations/plans and supported campaign setup through retained plan/review services.
- [x] Implement and test feed setup/preview/health/change operations, correcting Dealer Feeds application gating without broad admin elevation.
- [x] Implement and test marketing task/brief/content/creative operations using existing domain ownership, entitlements and revision contracts.
- [x] Expose independent marketing review/status/execute operations through MCP for supported Ads/GTM/social workflows; preserve exact revision checks and no self-review.
- [x] Audit full spec matrix and complete remaining supported marketing reads/actions; explicitly document genuinely unsupported provider/product operations.

## Task 5 — integration, documentation and qualification

**Files:** root-owned `server/utils/ai/mcp/{marketingPolicy,registry,scope}.ts`, `server/utils/ai/toolContext.ts`, `server/api/internal/mcp/call.post.ts`, department suite assembler, staff preview/readiness and relevant public feature/setup pages.

- [x] Add `department_management` to the operator grant contract without granting groups by configuration alone.
- [x] Integrate explicit department tools with discovery/call parity; unknown or unauthorised calls fail closed.
- [ ] Run combined boundary tests and required repository checks; compare existing diagnostics; independent complete diff review and corrections.
- [x] Update operator/public documentation to match implemented behavior and record remaining provider acceptance gates.

## Task 6 — enrollment and current-main release

- [x] Re-read both identities, role membership and production configuration; prepare exact dedicated role/groups/grants and rollback data without credentials in logs.
- [ ] Enroll both using supported authenticated application routes, retaining existing identities and support assignments; independent canonical readback.
- [ ] Integrate onto fresh main, run `pnpm deploy:check`, build/release only to `agency-dashboard`; record source and deployment identity.
- [ ] Verify live fresh marketing role/access projection, existing owner/QR behavior, enabled suite readiness and relevant read-only application routes.
- [ ] Staff use their own Claude/ChatGPT OAuth login for host acceptance. Do not mint or impersonate staff sessions; report any remaining externally dependent verification separately.

## Execution and decisions

The owner has authorised the researched scope and implementation; no repeat design/permission question is needed. Both receive the marketing-management function; no HR title or employee performance profile is changed. Kimi completed an independent review after the owner explicitly requested renewed use, and is now implementing bounded review corrections alongside Claude and Codex. Keep explicit file ownership. Each task records red/green evidence, source files, reviewer result and unresolved gates in `.superpowers/sdd/2026-10-28-marketing-management-mcp/progress.md`.
