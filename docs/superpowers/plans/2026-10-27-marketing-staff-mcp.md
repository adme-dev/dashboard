# Marketing staff MCP implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Execute the assigned task, not other workers' files.

**Goal:** Deliver governed marketing work from individual Claude/ChatGPT accounts using the existing XeroFlow MCP.
**Architecture:** Keep the owner coordinator intact. Ordinary staff receive fresh authority, assigned-client scope and explicitly granted marketing capabilities; shared services execute scoped reads and reviewed provider workflows without impersonating an owner.
**Tech Stack:** Nuxt 4, TypeScript, Nitro, Neon Postgres, Cloudflare Worker MCP, Vitest, Nuxt UI v4.
**Spec:** `docs/superpowers/specs/2026-10-27-marketing-staff-mcp-design.md`.

## Global constraints

- The user approved execution on 27 October: "Spin up Claude, Codex, and Kimi to help and get this done." Continue through tasks without another plan approval.
- Preserve existing owner God mode; admin is not owner authority.
- Staff use assigned clients, fresh resolved permissions, signed OAuth scopes and explicit marketing grants. Never grant FINANCE/ADMIN merely to allow marketing reporting.
- No permission or assignment failure may fall back to all clients. Filter at the data boundary before aggregation, pagination or provider credential access.
- Staff draft; a separate owner/admin approves exact live publishing, campaign changes and tracking operations. Preserve required client approvals too.
- Existing tracking ownership/consent/native-DriveAgent rules apply before dealer-specific configuration. No fabricated customer events.
- Ordinary scope enforcement must cover every mutation. New flags cannot switch authorization off.
- Runtime config reads request Cloudflare bindings first, local process environment second.
- All UI uses Nuxt UI and bounded scrolling. Invoke frontend-design before editing form fields.
- Review, test and commit only owned files; coordinator owns shared git staging/commits unless explicitly delegated. No concurrent git mutations.
- No deployment/provider mutation by workers. Prepare and verify changes; coordinator owns release and live acceptance.

## Review focus

1. Existing direct paths outside the six-tool pilot, especially lead summaries and client profitability, cannot evade the new staff catalog boundary.
2. Revocation and custom read-only policies take effect despite cached role/assignment helpers.
3. Missing write consent, changed draft revisions, self-approval and retries cannot cause provider effects.
4. Instagram requires authorized media/account targets; TikTok's disabled readiness is not cosmetic.
5. Tool discovery, connection preview and calls must agree without trusting a browser-provided scope or role.

## Task 1: Ordinary staff authority, runtime policy and guarded catalog

**Files:** create `server/utils/ai/mcp/staffAuthority.ts`, `server/utils/ai/mcp/runtimeConfig.ts`, `server/utils/ai/mcp/marketingPolicy.ts`; modify `server/api/internal/mcp/{tools,call}.post.ts`, `server/api/agency/ai/mcp/my-tools.get.ts`, `server/utils/ai/mcp/project.ts`, `server/utils/ai/toolContext.ts`; add focused tests under `test/ai/` and `test/server/api/`.

**Interfaces:** `resolveMcpStaffContext(event, userId, scopes): Promise<ToolContext>` populates current `permissionGroups`, `assistantReadOnly`, `assistantScope`, plus `marketingCapabilities?: ('reporting' | 'social_draft' | 'ads_plan' | 'tracking_plan')[]`. `resolveMcpRuntimeConfig(event)` supplies suite flags/master switch/origin using binding precedence. `marketingPolicy` exports the allowed tool names and predicates shared by preview/list/call. Discuss interface changes with coordinator before changing names.

**Ruling:** first enrollment uses an operator-owned `MCP_MARKETING_STAFF_GRANTS` JSON binding mapping user UUID to capability array; no grants are hardcoded or enabled in checked-in production config. Invalid configuration fails closed. This provides individually revocable grants without modifying existing base roles or granting financial access. A later admin UI may store equivalent grants durably; do not introduce a second policy interpretation.

- [x] Write failing tests for fresh custom-role resolution, inactive actors, zero assignments, malformed/unknown grants, read-only policies, binding precedence and stale-catalog direct calls.
- [x] Implement authority using uncached database resolution; do not reuse the fail-open role resolver cache for authorization. Retain explicit MANAGEMENT/ADMIN all-client scope, while marketing grants never create either group.
- [x] Restrict non-management staff discovery AND invocation to registered, reviewed tools. Existing unsafe direct tools and unsupported families are denied until their handlers satisfy the scope contract. Preserve permitted management paths and owner behavior, but enforce OAuth write scope for ordinary users independent of the legacy opt-out flag.
- [x] Use a single projection policy in my-tools and actual tools/list. Preview states its assumed scopes, not an assertion about an unseen OAuth grant. Owner preview must retain existing owner policy.
- [x] Run focused tests plus existing request-claim, scope, registry and owner regressions; read changed files and report exact evidence.

Task 1 does not claim the six reads execute yet: Task 2 delivers that before pilot activation.

## Task 2: Executable, client-scoped marketing reads

**Files:** marketing read services/helpers under `server/utils/ai/marketing/`; existing tool files `campaignBreakdown`, `adBreakdown`, `adCreativeText`, `searchTerms`, `adspend`, `social`, `leads`, `clients`; shared API read services as needed. Do not edit Task 1 routes or policy without coordinator handoff.
**Consumes:** Task 1 trusted `ToolContext` authority/scope. **Produces:** normal tool handlers that work for ordinary MCP staff without owner HTTP delegation and preserve owner/browser semantics.

- [x] Inspect each real query and write regression tests that reach its production adapter rather than only stubbing the entire handler.
- [x] Refactor selected route-backed reads into reusable services with trusted actor scope. Use the same services from browser and tool handlers where compatible. Do not loosen owner delegation or forward manufactured sessions.
- [x] Scope client-name resolution, media/campaign IDs, aggregates, comparison windows, lead attribution, freshness/sync data, assets and pagination before limits. Unknown or unassigned IDs produce no provider access or metadata leakage.
- [x] Close direct lead-summary and client-overview leaks; marketing reporting cannot return profitability. Preserve supported financial reads only under their separate current authorization.
- [x] Avoid provider refresh side effects from read-only staff requests; require an explicit governed mutation capability where refreshing writes persisted diagnostics.
- [x] Verify assigned A/unassigned B/zero-assignment, custom-role and read-only staff plus owner regressions. Review a combined actual route-to-service path before marking pilot usable.

## Task 3: Reviewed social workflows

**Files:** new governed MCP social suite and services; existing publishing draft/request/approve/publish/dispatch boundaries; targeted tests. Exact storage reuse and file list will be recorded in a subordinate plan after source inspection.
**Consumes:** Tasks 1–2 authority and scope. **Produces:** scoped account/post discovery, media-capable drafts, submission and status, and revision-bound independent approval using existing social provider services.

- [ ] Produce exact subordinate plan for existing storage, immutable revisions, metadata compatibility, dispatch and client approval.
- [ ] Add tests before implementation for account/media cross-client denial, draft-only creation, Instagram media, edited approvals, self-review, revoked users, missing scope and duplicate dispatch.
- [ ] Implement staff tools that never publish directly; owner/admin browser review authorizes the exact content and targets without granting God mode. Existing client sign-off remains required.
- [ ] Exercise real service/SQL boundaries and scheduler enforcement with mocked provider dispatch; update UI and docs with accurate platform readiness.

## Task 4: Google Ads and GTM workflows

**Files:** existing `mcp/googleAds*`, `mcp/gtm*`, associated control-plane/store/installer services and review endpoints.

- [ ] Produce subordinate plan separating scoped read inventory, local proposals, provider draft creation and reviewed apply/publish/rollback.
- [ ] Add current assignment checks before credentials and on plan/status/replay; whitelist staff planning operations rather than expose all owner tools.
- [ ] Preserve provider drift/version checks, durable idempotency, cost limits and unknown-outcome holds. Staff cannot self-confirm campaign changes.
- [ ] GTM requires explicit ownership evidence and allowed template operations; retain native DriveAgent conversion routing. A provider workspace creation is itself reviewed.
- [ ] Prove no effects on invalid scope/revision/approval and exact authorized dispatch/read-back. Leave unrelated financial, automation and destructive suites governed separately.

## Task 5: Remaining providers and capability readiness

- [ ] Audit and implement missing Meta/LinkedIn/TikTok operations through existing providers, separating paid ads, organic publishing, reporting and inbox.
- [ ] Finish TikTok refresh/processing/receipt handling and tests; do not flip readiness until actual app review and live-account acceptance are satisfied.
- [ ] Publish per-operation readiness and actionable unavailable reasons. No generic "all platforms supported" claim from UI registration or mocks.

## Task 6: Staff setup, public documentation and release evidence

**Files:** `app/pages/agency/ai/connectors.vue`, admin enrollment surface if required, `docs/mcp-server-guide.md`, staff runbook, relevant feature pages/nav.

- [ ] Correct host setup from current official documentation, provide staff-relevant examples, explain separate provider OAuth and grant/readiness status.
- [ ] Verify bounded scroll, Nuxt UI, custom-role presentation and preview parity. Public pages distinguish delivered workflows from unavailable provider actions.
- [ ] Run combined regression suite, lint/type/build checks appropriate to changed code and repository deploy guards. Fresh independent whole-branch review, then fix material findings.
- [ ] Fetch current main, reconcile, record exact source and prepare reviewable release. Deployment/live-account proof remains distinct from local tests and may require available provider grants.
- [ ] Keep the execution ledger current with every completed task, commit, review, blocker and remaining acceptance. Never report completion of the full request for a read-only pilot.
