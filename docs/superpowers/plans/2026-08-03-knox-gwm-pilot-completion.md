# Knox GWM Search Authority & AI Trust Pilot Completion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Knox GWM design-client pilot from the deployed XeroFlow foundations through proven Search Console ingestion, governed technical monitoring, one approved public guide, safe menu discovery, measurement, and a stakeholder-ready evidence pack.

**Architecture:** Keep Dealer Studio outside the runtime boundary. XeroFlow remains the control plane on Nuxt/Neon; bounded collection runs through the existing Cloudflare Workflow; approved guide versions are rendered to private R2 and served by a dedicated multi-tenant edge publisher; a versioned GTM Menu Agent adds only the approved navigation link. Google Business Profile remains an independently gated enhancement and never blocks the core pilot.

**Tech Stack:** Nuxt 4, Vue 3, Nuxt UI v4, Nitro, Neon Postgres, Cloudflare Pages, Workers, Workflows, Browser Rendering, R2, Queues, Vectorize, Google Search Console APIs, GA4, Google Ads, Google Business Profile APIs, Vitest.

## Global Constraints

- Never require Dealer Studio or dealership CMS credentials for the pilot.
- GTM may add one menu link; it must not create indexable pages, replace canonical tags, or inject vehicle schema.
- Every content and Google Business Profile publication requires explicit human approval of an immutable version.
- AI may assist with evidence-bound drafting but cannot invent claims, approve content, publish, or mutate Google Ads.
- All server-side URL fetching must reject credentials, localhost, private/reserved IP space, redirects outside the approved origin, and non-HTTP(S) schemes.
- Raw crawl snapshots remain private in R2; APIs expose structured facts and bounded evidence only.
- Knox owned-site retention is 90 days; the approved Lilydale competitor retention is 30 days.
- The core pilot can complete with Google Business Profile marked `Unavailable — provider access pending` when Google approval or quota is unavailable.
- Pages deploys use only `pnpm deploy:production`; standalone Workers use their repository deployment scripts.
- Before every feature commit, reread every modified file and apply the mandatory pre-commit battle-test checklist in `AGENTS.md`.
- Before every form change, read and apply the required frontend-design skill and use Nuxt UI v4 form components.

---

## Live Pilot Tracker

### Completion definition

The core pilot is complete only when every `Core` item below is checked and backed by the evidence named in its acceptance column. `GBP` items are separately gated and may close as unavailable with written provider evidence.

| Track | Requirement | Class | Status | Acceptance evidence |
| --- | --- | --- | --- | --- |
| Platform | Search Authority agency workspace, portal summary and entitlement gates deployed | Core | [x] | Production release and focused tests |
| Platform | Site Intelligence registry, Workflow contract, tenant isolation and readiness deployed | Core | [x] | Production release and authenticated service-binding smoke |
| Platform | Tenant-scoped pilot completion contract and agency readiness card implemented | Core | [x] | Task 1 tests, lint and Nuxt typecheck |
| Pilot setup | Knox canonical site and trial entitlement configured | Core | [x] | Production database row for `www.knoxgwmhaval.com.au` |
| Pilot setup | Knox owned and Lilydale competitor monitoring boundaries configured manual-only | Core | [x] | Production domain rows with 90/30-day retention |
| Collection | Browser Rendering credential passes authenticated no-job readiness | Core | [ ] | Readiness response reports `browserRenderingApi: true` |
| Collection | Knox manual crawl completes with tenant-correct stored evidence | Core | [ ] | Completed/partial run with at least one collected page and verified R2 prefix |
| Collection | Lilydale manual crawl completes after Knox observation | Core | [ ] | Completed/partial competitor run with no synthetic performance claims |
| Search evidence | Knox Search Console identity and verified property are mapped | Core | [ ] | Active connection and one active property map |
| Search evidence | Resumable 90-day baseline completes | Core | [ ] | `baseline_completed_at`, projection checks and non-stale `data_through_date` |
| Search evidence | Evidence-backed opportunity is reviewed and linked to one XeroFlow task | Core | [ ] | Opportunity lifecycle and atomic task link |
| Trust | Status, robots, canonical, sitemap, schema parity, image and soft-404 findings are persisted | Core | [ ] | Knox finding fixtures and live findings with ownership |
| Trust | Mobile lab and field Core Web Vitals are labelled separately | Core | [ ] | Provider result distinguishes lab, field and unavailable data |
| Content | Sales Manager source, claims, version and approvals are auditable | Core | [ ] | Immutable approved content version with source references |
| Publishing | `learn.knoxgwmhaval.com.au` resolves to XeroFlow and serves the approved guide | Core | [ ] | TLS-valid SSR HTML, canonical metadata, JSON-LD, real 404 and sitemap |
| Publishing | Approved publication can roll back without dashboard availability | Core | [ ] | Manifest rollback test and production proof |
| Menu | Versioned GTM Menu Agent adds exactly one desktop/mobile Buying Guides link | Core | [ ] | Browser evidence across initial load and Next.js rerender |
| Measurement | Guide view, CTA and test lead retain source/publication attribution | Core | [ ] | GA4/XeroFlow test journey without false self-referral |
| Reporting | Stakeholder summary separates facts, recommendations, unavailable data and actions | Core | [ ] | Exported monthly pilot evidence pack |
| GBP | Knox Google Business Profile account is connected and healthy | GBP | [ ] | Connected location or provider-access unavailability record |
| GBP | Supported performance metrics are ingested | GBP | [ ] | Dated provider metrics or provider-access unavailability record |
| GBP | One separately approved guide promotion publishes | GBP | [ ] | Provider post ID and audit event, or explicit deferral |
| Productisation | A second automotive client can be onboarded without schema/code changes | Follow-on | [ ] | Repeated onboarding using the same templates after Knox acceptance |

### Production evidence recorded 3 August 2026

- [x] Knox client ID is `b6d459d4-aeaa-4c78-9868-e6682a0dbc68` and is active.
- [x] `search_authority.core` is a non-expiring trial entitlement.
- [x] Search Authority site is active with canonical hostname `www.knoxgwmhaval.com.au`.
- [x] Knox and Lilydale domains are active, manual-only, search-only and AI-input disabled.
- [ ] Search Console connection count is zero.
- [ ] Search Console property-map, sync-run and evidence-row counts are zero.
- [ ] Search Authority opportunity count is zero.
- [ ] Knox has three failed crawl runs and zero collected pages; the latest failure category is `browser_run`.
- [ ] Lilydale has no crawl run.
- [ ] Site Intelligence page, change and insight counts are zero.
- [ ] `content_hostname` is null and `learn.knoxgwmhaval.com.au` does not resolve.
- [ ] Knox Google Business Profile account count is zero.

### Progress journal

- **2026-08-03:** Reconciled the approved PRD with production. Created isolated branch `agent/knox-pilot-completion-20260803`. Installed dependencies with Node 24.18.0. Baseline Search Authority and Site Intelligence suite passed: 12 files, 86 tests.
- **2026-08-03:** Completed Task 1. Added a tenant-scoped readiness aggregator/API and reusable agency card. Five related files passed 17 tests; targeted ESLint and full Nuxt typecheck passed.
- **2026-08-03:** Completed Task 4 engineering. Migration 333 was applied to Neon. Deterministic crawl, robots, canonical, explicit sitemap evidence, soft-404, JSON-LD price-parity and image checks now reconcile into a tenant-scoped findings ledger. Four focused files passed 11 tests and targeted ESLint passed. The repository-wide typecheck currently fails in unrelated pre-existing files; the typecheck log contains no errors for this slice.
- **2026-08-03:** Completed Task 5 engineering. Migration 334 was applied to Neon. Added a public-HTTPS/owned-origin PageSpeed adapter with a 15-second hard ceiling, persistent normalized mobile evidence, tenant-scoped read/refresh APIs, explicit CrUX-field versus Lighthouse-lab presentation, and normal XeroFlow task handoff for open findings. Five focused files passed 14 tests and targeted ESLint passed. The repository-wide typecheck remains red only outside this slice.
- **2026-08-03:** Completed Task 6 engineering. Migration 335 was applied to Neon. Added consented Sales Manager source interviews, append-only versions, evidence-bound claims, submit/approve/reject transitions, self-approval prevention and append-only audit events behind tenant-scoped routes. Three focused files passed 6 tests and targeted ESLint passed; the one slice-local type error found by the global check was corrected.
- **2026-08-03:** Completed Task 7 engineering. Migrations 336–337 were applied to Neon. Added attributable portal-user decisions, an explicit version-bound disclaimer, the structured agency content library/editor/approval flow, and a tenant-scoped portal review page that exposes only proposed copy, source labels, claims and decision controls. Nine focused files passed 17 tests and targeted ESLint passed. The repository-wide typecheck reached its known unrelated diagnostic backlog with no Search Authority file visible in the reported output.
- **2026-08-03:** Completed Task 8 engineering. Added a deterministic, HTML-escaping publisher; immutable hash-verified R2 objects; manifest-only activation and rollback; tenant-scoped publish/rollback routes; and a standalone host-allowlisted Cloudflare Worker with real 404s, security headers and a fail-closed deploy wrapper. Five focused files passed 14 tests, targeted ESLint and the generated Cloudflare Worker type contract passed, and the named Wrangler deployment completed a 6.22 KiB dry-run bundle against the approved R2 binding. DNS, a human-approved Knox guide and live rollback proof remain production acceptance gates.
- **2026-08-03:** Completed Task 9 engineering. Migration 338 was applied to Neon, including an append-only site audit trigger. Added a public-ID configuration contract, tenant-scoped agency controls, a heartbeat explicitly labelled as non-proof, and a versioned Menu Agent that inserts only text links into bounded selectors, deduplicates shared responsive menus, observes rerenders for at most 30 seconds, polls the remote kill switch and removes only its own nodes. Four focused files passed 13 tests and targeted ESLint passed. Full Nuxt typecheck found one slice-local return-type error in the heartbeat endpoint; it was corrected. GTM publication and live browser proof remain production acceptance gates.

### Execution order and external gates

Implement Task 1 first. Tasks 4–11 are the XeroFlow-owned engineering lane and may continue while the operator/stakeholder actions in Tasks 2–3 are pending. Task 12 is the convergence gate: it cannot close until the core production evidence from Tasks 2–10 exists. This ordering keeps external access delays visible without allowing them to stall safe, independently testable product work.

---

## Task 1: Make pilot readiness one truthful contract

**Files:**
- Create: `server/utils/searchAuthority/pilotReadiness.ts`
- Create: `server/api/agency/search-authority/pilot-readiness.get.ts`
- Create: `app/components/search-authority/PilotReadinessCard.vue`
- Modify: `app/components/search-authority/Workspace.vue`
- Modify: `app/components/search-authority/ConnectionsWorkspace.vue`
- Test: `test/server/api/searchAuthorityPilotReadiness.test.ts`
- Test: `test/app/searchAuthorityPilotReadiness.test.ts`

**Interfaces:**
- Consumes: existing Search Authority site/property state, Site Intelligence domain/run state, social account state and runtime feature flags.
- Produces: `getSearchAuthorityPilotReadiness(clientId): Promise<PilotReadiness>` and an agency-only response containing booleans, counts, safe failure categories and operator actions without credentials.

- [x] **Step 1: Write failing readiness aggregation tests**

```ts
expect(result.coreReady).toBe(false)
expect(result.gates.searchConsole.state).toBe('blocked')
expect(result.gates.siteCollection.reasonCode).toBe('no_successful_owned_run')
expect(JSON.stringify(result)).not.toContain('access_token')
```

- [x] **Step 2: Run the focused tests and confirm the route/service are missing**

Run: `pnpm exec vitest run test/server/api/searchAuthorityPilotReadiness.test.ts test/app/searchAuthorityPilotReadiness.test.ts`

Expected: FAIL because the readiness service, endpoint and card do not exist.

- [x] **Step 3: Implement the tenant-scoped readiness service and endpoint**

```ts
export type PilotGateState = 'ready' | 'blocked' | 'unavailable' | 'not_started'

export interface PilotReadiness {
  clientId: string
  coreReady: boolean
  gates: Record<string, {
    state: PilotGateState
    reasonCode: string | null
    action: string | null
    evidenceAt: string | null
  }>
}
```

The endpoint must require Search Authority agency access, resolve only the selected client and return no token, email, raw provider payload or crawl body.

- [x] **Step 4: Add the readiness card to both agency Search Authority surfaces**

Use `UCard`, `UBadge`, `UAlert`, `UTooltip` and `UButton`. Provider or DNS actions must be copyable instructions; buttons must never imply XeroFlow can rotate a human-owned secret.

- [x] **Step 5: Run tests, lint the new files and complete the pre-commit review**

Run: `pnpm exec vitest run test/server/api/searchAuthorityPilotReadiness.test.ts test/app/searchAuthorityPilotReadiness.test.ts`

Run: `pnpm exec eslint server/utils/searchAuthority/pilotReadiness.ts server/api/agency/search-authority/pilot-readiness.get.ts app/components/search-authority/PilotReadinessCard.vue`

- [x] **Step 6: Commit the truthful readiness contract**

```bash
git add server/utils/searchAuthority/pilotReadiness.ts server/api/agency/search-authority/pilot-readiness.get.ts app/components/search-authority/PilotReadinessCard.vue app/components/search-authority/Workspace.vue app/components/search-authority/ConnectionsWorkspace.vue test/server/api/searchAuthorityPilotReadiness.test.ts test/app/searchAuthorityPilotReadiness.test.ts
git commit -m "feat: add Knox pilot readiness contract"
```

## Task 2: Restore Browser Rendering and prove both collection lanes

**Files:**
- Modify: `docs/runbooks/site-intelligence-pilot.md`
- Modify: this tracker after each verified production action
- Test: existing readiness, workflow and ingestion suites

**Interfaces:**
- Consumes: `BROWSER_RENDERING_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, Site Intelligence readiness route and the existing manual crawl API.
- Produces: one successful Knox run and one successful Lilydale run with bounded evidence.

- [ ] **Step 1: Create a least-privilege Cloudflare token outside source control**

The XeroFlow operator creates a custom account token with `Browser Rendering - Edit`, no incompatible IP restriction, and stores it interactively:

```bash
pnpm --dir workers/agency-workflows exec wrangler secret put BROWSER_RENDERING_API_TOKEN --config wrangler.toml
```

Never paste the token into this tracker, chat, a command argument, logs or environment files.

- [ ] **Step 2: Verify authenticated Browser Rendering readiness**

Call `GET /api/agency/site-intelligence/readiness` as an owner/admin and require `browserRenderingApi: true`. A missing-URL validation response is the only accepted proof; token presence alone is insufficient.

- [ ] **Step 3: Run Knox once and inspect the terminal result**

Expected: `completed` or truthful `partial`, at least one page, source URLs under `https://www.knoxgwmhaval.com.au`, no raw body in logs/API, and R2 keys under `clients/b6d459d4-aeaa-4c78-9868-e6682a0dbc68/domains/6c4ab974-8af3-4ec3-b996-5ea8aa131aee/`.

- [ ] **Step 4: Observe Knox for 24 hours before touching the competitor lane**

Record Workflow retries, duration, Browser seconds, callback state, queue/DLQ depth, R2 prefix correctness and Neon tenant IDs. Any cross-tenant evidence or origin escape is a no-go.

- [ ] **Step 5: Run Lilydale once and verify evidence honesty**

Expected: approved public-origin evidence only; no visitor, traffic, reach, spend, conversion or demographic estimates.

- [ ] **Step 6: Re-run the existing collection regression suite**

Run: `pnpm exec vitest run test/server/api/siteIntelligenceReadiness.test.ts test/server/api/siteIntelligenceCrawl.test.ts test/server/api/siteIntelligenceIngest.test.ts test/server/utils/siteIntelligence/urlPolicy.test.ts test/workers/agencyWorkflowsSiteIntelligence.test.ts test/workers/siteIntelligenceWorkflowExecution.test.ts`

- [ ] **Step 7: Update the production-evidence section and commit only documentation changes**

```bash
git add docs/runbooks/site-intelligence-pilot.md docs/superpowers/plans/2026-08-03-knox-gwm-pilot-completion.md
git commit -m "docs: record Knox crawl activation evidence"
```

## Task 3: Connect Search Console and complete the evidence loop

**Files:**
- Modify: `docs/runbooks/search-authority-phase-1.md`
- Modify: this tracker after production verification
- Test: existing Search Authority OAuth, mapping, ingestion and opportunity suites

**Interfaces:**
- Consumes: existing least-privilege Google OAuth flow and verified Knox Search Console property.
- Produces: active property map, complete 90-day baseline, indexed-version inspections and at least one reviewed opportunity linked to a normal XeroFlow task.

- [ ] **Step 1: Connect an authorised Google identity from Search Authority Connections**

Use read-only Search Console scopes. Do not reuse an Ads token unless the credential profile proves the required Search Console scope.

- [ ] **Step 2: Map exactly one verified Knox property**

Accept `sc-domain:knoxgwmhaval.com.au` or the verified `https://www.knoxgwmhaval.com.au/` prefix only after checking its permission is not `siteUnverifiedUser`.

- [ ] **Step 3: Run the resumable baseline until complete**

Trigger the existing sync repeatedly as needed. Require all three independent projections—property, page and query/page—to record completeness checks, including legitimate zero-row dates.

- [ ] **Step 4: Verify scheduled refresh and indexed-version inspection**

Confirm `pages-cron` calls `/api/cron/search-console-sync` at `15 2 * * *`, the property lease is released, and recent runs are `succeeded` or truthfully `partial`.

- [ ] **Step 5: Review one opportunity and explicitly create/link a task**

Move one candidate through `new → under_review → accepted`, create the task through the existing dialog, and verify the atomic task link. Do not auto-create work or mutate PMax.

- [ ] **Step 6: Run the Search Authority regression suite**

Run: `pnpm exec vitest run test/server/api/searchAuthorityGoogleOAuth.test.ts test/server/api/searchAuthorityPropertyMapping.test.ts test/server/api/searchAuthoritySyncEndpoint.test.ts test/server/api/searchConsoleCron.test.ts test/server/utils/searchAuthoritySync.test.ts test/server/utils/searchAuthorityOpportunities.test.ts test/app/searchAuthorityWorkspace.test.ts`

- [ ] **Step 7: Record literal dates/counts in the tracker and commit the runbook update**

```bash
git add docs/runbooks/search-authority-phase-1.md docs/superpowers/plans/2026-08-03-knox-gwm-pilot-completion.md
git commit -m "docs: record Knox Search Console activation"
```

## Task 4: Add deterministic technical trust findings

**Files:**
- Create: `server/database/migrations/333_search_authority_trust_findings.sql`
- Create: `server/utils/searchAuthority/trustChecks.ts`
- Create: `server/utils/searchAuthority/trustRepository.ts`
- Modify: `server/utils/siteIntelligence/storage.ts`
- Modify: `server/utils/siteIntelligence/repository.ts`
- Test: `test/config/searchAuthorityTrustMigration.test.ts`
- Test: `test/server/utils/searchAuthorityTrustChecks.test.ts`
- Test: `test/server/utils/searchAuthorityTrustRepository.test.ts`
- Test: `test/server/api/siteIntelligenceIngest.test.ts`

**Interfaces:**
- Consumes: completed Site Intelligence page facts/metadata and live source URLs.
- Produces: `evaluateSearchAuthorityTrust(input): SearchAuthorityTrustFindingCandidate[]` and deduplicated findings with `owner: 'xeroflow' | 'dealer_origin' | 'external_provider'`.

- [x] **Step 1: Recheck the highest migration number before editing**

Run: `git ls-tree -r --name-only origin/main server/database/migrations | tail -20`

If `333` is occupied, rename the migration and its test to the next free numeric prefix before writing either file.

- [x] **Step 2: Write failing schema and pure-rule tests**

```ts
expect(findings).toContainEqual(expect.objectContaining({
  checkKey: 'vehicle.price.visible_parity',
  severity: 'high',
  owner: 'dealer_origin'
}))
expect(findings).toContainEqual(expect.objectContaining({ checkKey: 'canonical.cross_origin' }))
```

Cover HTTP status, robots directives, canonical absence/cross-origin, sitemap discovery, soft-404 heuristics, JSON-LD parsing, Vehicle/Product visible-value parity, image URL/alt/naming fundamentals and unchanged-finding dedupe.

- [x] **Step 3: Create the additive finding schema**

The table stores client/domain/page/run IDs, deterministic fingerprint, check key, severity, owner, status, bounded evidence, first/last seen timestamps, recurrence count, task link and resolution metadata. Add a unique active fingerprint per domain and prohibit raw HTML/body storage.

- [x] **Step 4: Implement pure deterministic checks**

```ts
export interface TrustFindingCandidate {
  checkKey: string
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical'
  owner: 'xeroflow' | 'dealer_origin' | 'external_provider'
  title: string
  summary: string
  evidence: Record<string, string | number | boolean | null>
}
```

Unknown or unavailable evidence must create an `unavailable` observation or no finding; it must never be converted to a healthy result.

- [x] **Step 5: Persist findings after page ingestion**

Upsert active findings by deterministic fingerprint, increment recurrence for repeated failures, resolve only after a successful observation proves recovery, and never resolve findings when collection failed.

- [x] **Step 6: Apply the migration automatically and run tests**

Load `DATABASE_URL` from `.env` without printing it, apply the exact migration with `psql -v ON_ERROR_STOP=1`, then run:

`pnpm exec vitest run test/config/searchAuthorityTrustMigration.test.ts test/server/utils/searchAuthorityTrustChecks.test.ts test/server/utils/searchAuthorityTrustRepository.test.ts test/server/api/siteIntelligenceIngest.test.ts`

- [x] **Step 7: Commit the deterministic trust engine**

```bash
git add server/database/migrations/333_search_authority_trust_findings.sql server/utils/searchAuthority/trustChecks.ts server/utils/searchAuthority/trustRepository.ts server/utils/siteIntelligence/storage.ts server/utils/siteIntelligence/repository.ts test/config/searchAuthorityTrustMigration.test.ts test/server/utils/searchAuthorityTrustChecks.test.ts test/server/utils/searchAuthorityTrustRepository.test.ts test/server/api/siteIntelligenceIngest.test.ts docs/superpowers/plans/2026-08-03-knox-gwm-pilot-completion.md
git commit -m "feat: add deterministic search trust findings"
```

## Task 5: Add performance evidence and the trust-monitor workspace

**Files:**
- Create: `server/database/migrations/334_search_authority_performance_evidence.sql`
- Create: `server/utils/searchAuthority/performanceEvidence.ts`
- Create: `server/api/agency/search-authority/trust/findings.get.ts`
- Create: `server/api/agency/search-authority/trust/refresh.post.ts`
- Create: `server/api/agency/search-authority/trust/findings/[id]/task-link.post.ts`
- Create: `app/components/search-authority/TrustFindingsTable.vue`
- Create: `app/components/search-authority/TrustPerformanceCard.vue`
- Modify: `app/components/search-authority/Workspace.vue`
- Modify: `app/types/index.ts`
- Modify: `app/pages/features/[slug].vue`
- Modify: `nuxt.config.ts`
- Test: `test/config/searchAuthorityPerformanceMigration.test.ts`
- Test: `test/server/utils/searchAuthorityPerformanceEvidence.test.ts`
- Test: `test/server/api/searchAuthorityTrustFindings.test.ts`
- Test: `test/app/searchAuthorityTrustWorkspace.test.ts`

**Interfaces:**
- Consumes: trust findings, optional PageSpeed/CrUX provider evidence and existing task handoff.
- Produces: bounded refresh and read APIs that label `lab`, `field` and `unavailable` evidence explicitly.

- [x] **Step 1: Write failing performance parsing and API access tests**

```ts
expect(normalizePerformanceEvidence(input).lcp.kind).toBe('field')
expect(normalizePerformanceEvidence({} as never).status).toBe('unavailable')
```

- [x] **Step 2: Implement a provider adapter with strict timeouts and URL policy**

Inspect only allowlisted owned URLs, cap the number per run, store provider timestamp and raw-status metadata, and redact API keys/errors. A missing provider key or insufficient CrUX sample is `unavailable`, not zero or passing.

- [x] **Step 3: Add tenant-scoped findings/read-refresh endpoints**

The refresh route requires an admin/operator and explicit client ID. It must reject competitor URLs for performance collection unless separately approved.

- [x] **Step 4: Build the trust UI**

Show severity, check, page, ownership, evidence time, recurrence and action. Reuse the normal task dialog; do not create a parallel work-management system.

- [x] **Step 5: Run tests and commit**

Run: `pnpm exec vitest run test/server/utils/searchAuthorityPerformanceEvidence.test.ts test/server/api/searchAuthorityTrustFindings.test.ts test/app/searchAuthorityTrustWorkspace.test.ts`

```bash
git add server/database/migrations/334_search_authority_performance_evidence.sql server/utils/searchAuthority/performanceEvidence.ts server/api/agency/search-authority/trust/findings.get.ts server/api/agency/search-authority/trust/refresh.post.ts 'server/api/agency/search-authority/trust/findings/[id]/task-link.post.ts' app/components/search-authority/TrustFindingsTable.vue app/components/search-authority/TrustPerformanceCard.vue app/components/search-authority/Workspace.vue app/types/index.ts 'app/pages/features/[slug].vue' nuxt.config.ts test/config/searchAuthorityPerformanceMigration.test.ts test/server/utils/searchAuthorityPerformanceEvidence.test.ts test/server/api/searchAuthorityTrustFindings.test.ts test/app/searchAuthorityTrustWorkspace.test.ts docs/superpowers/plans/2026-08-03-knox-gwm-pilot-completion.md
git commit -m "feat: expose technical trust monitoring"
```

## Task 6: Add the governed interview-to-approval content workflow

**Files:**
- Create: `server/database/migrations/335_search_authority_content_workflow.sql`
- Create: `server/utils/searchAuthority/contentContracts.ts`
- Create: `server/utils/searchAuthority/contentRepository.ts`
- Create: `server/api/agency/search-authority/content/index.get.ts`
- Create: `server/api/agency/search-authority/content/index.post.ts`
- Create: `server/api/agency/search-authority/content/[id].get.ts`
- Create: `server/api/agency/search-authority/content/[id]/versions.post.ts`
- Create: `server/api/agency/search-authority/content/[id]/submit.post.ts`
- Create: `server/api/agency/search-authority/content/[id]/approve.post.ts`
- Create: `server/api/agency/search-authority/content/[id]/reject.post.ts`
- Test: `test/config/searchAuthorityContentMigration.test.ts`
- Test: `test/server/utils/searchAuthorityContentRepository.test.ts`
- Test: `test/server/api/searchAuthorityContentWorkflow.test.ts`

**Interfaces:**
- Produces: source interviews, immutable content versions, claim evidence, approval decisions and append-only audit events.
- Consumes: Search Authority site, authenticated agency users and optional accepted opportunity/task IDs.

- [x] **Step 1: Recheck and reserve migration numbers**

Rebase on current `origin/main` before reserving the two migration filenames. Renumber both content and trust migrations if another branch has occupied them.

- [x] **Step 2: Write failing lifecycle and immutability tests**

Cover `draft → in_review → approved → published`, self-approval policy, rejected versions, editing after approval creating a new version, claim/source requirements and cross-tenant rejection.

- [x] **Step 3: Create the additive content schema**

Use separate tables for assets, source interviews, immutable versions, version claims, approval decisions, publications and audit events. A publication always references one approved version and an approved version body is never updated.

- [x] **Step 4: Implement strict contracts and repository transactions**

```ts
export interface ContentClaimInput {
  claim: string
  sourceType: 'sales_interview' | 'manufacturer' | 'provider_evidence'
  sourceReference: string
  expiresAt: string | null
}
```

Reject blank sources, unsupported schema types, unapproved vehicle specifications and duplicate live slugs.

- [x] **Step 5: Implement thin authenticated routes**

Every mutation records actor, timestamp and source version. AI-generated draft metadata is optional and must record model/provider plus source IDs; it never changes lifecycle state.

- [x] **Step 6: Apply the migration, run tests and commit**

Run: `pnpm exec vitest run test/config/searchAuthorityContentMigration.test.ts test/server/utils/searchAuthorityContentRepository.test.ts test/server/api/searchAuthorityContentWorkflow.test.ts`

```bash
git add server/database/migrations/335_search_authority_content_workflow.sql server/utils/searchAuthority/contentContracts.ts server/utils/searchAuthority/contentRepository.ts server/api/agency/search-authority/content/index.get.ts server/api/agency/search-authority/content/index.post.ts server/api/agency/search-authority/content/[id].get.ts server/api/agency/search-authority/content/[id]/versions.post.ts server/api/agency/search-authority/content/[id]/submit.post.ts server/api/agency/search-authority/content/[id]/approve.post.ts server/api/agency/search-authority/content/[id]/reject.post.ts test/config/searchAuthorityContentMigration.test.ts test/server/utils/searchAuthorityContentRepository.test.ts test/server/api/searchAuthorityContentWorkflow.test.ts docs/superpowers/plans/2026-08-03-knox-gwm-pilot-completion.md
git commit -m "feat: add governed search content workflow"
```

## Task 7: Build the content workspace and client approval surface

**Files:**
- Create: `server/database/migrations/336_search_authority_portal_approval_actor.sql`
- Create: `server/database/migrations/337_search_authority_content_disclaimer.sql`
- Create: `server/api/portal/search-authority/content/[id].get.ts`
- Create: `server/api/portal/search-authority/content/[id]/decision.post.ts`
- Create: `app/components/search-authority/ContentLibrary.vue`
- Create: `app/components/search-authority/ContentEditorSlideover.vue`
- Create: `app/components/search-authority/ContentApprovalPanel.vue`
- Create: `app/pages/portal/search-authority/content/[id].vue`
- Modify: `app/components/search-authority/Workspace.vue`
- Modify: `app/components/search-authority/PortalSummary.vue`
- Test: `test/app/searchAuthorityContentWorkspace.test.ts`
- Test: `test/app/portalSearchAuthorityContentApproval.test.ts`

**Interfaces:**
- Consumes: Task 6 content APIs.
- Produces: one operator workflow for interview capture, claim review, version submission and explicit approval; one restricted portal approval view.

- [x] **Step 1: Read the mandatory frontend-design skill before modifying forms**

Apply its hierarchy, spacing and form-composition guidance together with `UFormField`, `UInput`, `UTextarea`, `USelectMenu`, `UModal`, `USlideover` and responsive container grids.

- [x] **Step 2: Write failing UI contract tests**

Test that every field has a `UFormField`, an approved version is read-only, a changed draft creates a new version, and publish remains unavailable until approval succeeds.

- [x] **Step 3: Implement the agency workflow**

Keep the pilot editor intentionally structured: customer question, interview transcript/notes, title, summary, Markdown body, claim list, disclaimers and schema preview. Do not build a new general-purpose WYSIWYG editor.

- [x] **Step 4: Implement the portal review surface**

Expose only the proposed version, source labels, claims, disclaimer and approve/reject controls. Hide internal scores, raw queries, provider IDs and credentials.

- [x] **Step 5: Run tests, lint and commit**

Run: `pnpm exec vitest run test/app/searchAuthorityContentWorkspace.test.ts test/app/portalSearchAuthorityContentApproval.test.ts`

```bash
git add app/components/search-authority/ContentLibrary.vue app/components/search-authority/ContentEditorSlideover.vue app/components/search-authority/ContentApprovalPanel.vue app/components/search-authority/Workspace.vue app/components/search-authority/PortalSummary.vue app/pages/portal/search-authority/content/[id].vue test/app/searchAuthorityContentWorkspace.test.ts test/app/portalSearchAuthorityContentApproval.test.ts
git commit -m "feat: add search content approval workspace"
```

## Task 8: Add the immutable edge publisher

**Files:**
- Create: `server/utils/searchAuthority/publicationRenderer.ts`
- Create: `server/utils/searchAuthority/publicationStore.ts`
- Create: `server/api/agency/search-authority/content/[id]/publish.post.ts`
- Create: `server/api/agency/search-authority/content/[id]/rollback.post.ts`
- Create: `workers/search-authority-publisher/package.json`
- Create: `workers/search-authority-publisher/tsconfig.json`
- Create: `workers/search-authority-publisher/wrangler.jsonc`
- Create: `workers/search-authority-publisher/worker-configuration.d.ts`
- Create: `workers/search-authority-publisher/src/index.ts`
- Create: `shared/searchAuthorityPublication.ts`
- Create: `scripts/deploy-search-authority-publisher.mjs`
- Modify: `package.json`
- Modify: `wrangler.toml`
- Modify: `app/components/search-authority/ContentLibrary.vue`
- Modify: `app/components/search-authority/ContentApprovalPanel.vue`
- Test: `test/server/utils/searchAuthorityPublicationRenderer.test.ts`
- Test: `test/server/api/searchAuthorityPublishing.test.ts`
- Test: `test/workers/searchAuthorityPublisher.test.ts`
- Test: `test/config/searchAuthorityPublisherDeploy.test.ts`
- Test: `test/app/searchAuthorityContentWorkspace.test.ts`

**Interfaces:**
- Consumes: approved immutable content version and `search_authority_sites.content_hostname`.
- Produces: versioned HTML/asset objects plus an atomic host manifest consumed by the edge Worker.

- [x] **Step 1: Write failing renderer, publication and Worker tests**

Require escaped/sanitized Markdown, SSR-visible primary content, canonical/title/description/Open Graph, `Article` or `FAQPage` JSON-LD only when visible content supports it, XML sitemap, robots, security headers and real 404 responses.

- [x] **Step 2: Implement deterministic rendering**

```ts
export interface RenderedPublication {
  html: string
  contentType: 'text/html; charset=utf-8'
  etag: string
  canonicalUrl: string
}
```

The renderer must not fetch arbitrary URLs or execute source HTML. Images must resolve from approved assets or allowlisted HTTPS origins and include meaningful alt text.

- [x] **Step 3: Store immutable versions and atomically update the manifest**

Write versioned content first, verify its hash, then update the small host manifest. Rollback changes only the manifest pointer and creates a new audit event; never overwrite an approved version object.

- [x] **Step 4: Implement the edge Worker**

Resolve the request host through an allowlisted manifest, serve `/`, `/guides/<slug>`, `/sitemap.xml`, `/robots.txt` and health paths, cache only published objects and return a real 404 for unknown hosts/slugs. The Worker exposes no dashboard or database API.

- [x] **Step 5: Add a fail-closed deployment wrapper**

The script must verify the immutable Worker name `search-authority-publisher`, run tests/build first and refuse a different target.

- [x] **Step 6: Run tests, dry-run deploy and commit**

Run: `pnpm exec vitest run test/server/utils/searchAuthorityPublicationRenderer.test.ts test/server/api/searchAuthorityPublishing.test.ts test/workers/searchAuthorityPublisher.test.ts`

Run: `pnpm deploy:search-authority-publisher:dry-run`

```bash
git add server/utils/searchAuthority/publicationRenderer.ts server/utils/searchAuthority/publicationStore.ts server/api/agency/search-authority/content/[id]/publish.post.ts server/api/agency/search-authority/content/[id]/rollback.post.ts shared/searchAuthorityPublication.ts workers/search-authority-publisher/package.json workers/search-authority-publisher/tsconfig.json workers/search-authority-publisher/wrangler.jsonc workers/search-authority-publisher/worker-configuration.d.ts workers/search-authority-publisher/src/index.ts scripts/deploy-search-authority-publisher.mjs package.json wrangler.toml app/components/search-authority/ContentLibrary.vue app/components/search-authority/ContentApprovalPanel.vue test/server/utils/searchAuthorityPublicationRenderer.test.ts test/server/api/searchAuthorityPublishing.test.ts test/workers/searchAuthorityPublisher.test.ts test/config/searchAuthorityPublisherDeploy.test.ts test/app/searchAuthorityContentWorkspace.test.ts docs/superpowers/plans/2026-08-03-knox-gwm-pilot-completion.md
git commit -m "feat: add search authority edge publisher"
```

## Task 9: Add the bounded GTM Menu Agent

**Files:**
- Create: `server/database/migrations/338_search_authority_menu_agent.sql`
- Create: `public/search-authority/menu-agent.v1.js`
- Create: `server/utils/searchAuthority/menuAgent.ts`
- Create: `server/api/agency/search-authority/menu/config.get.ts`
- Create: `server/api/agency/search-authority/menu/config.put.ts`
- Create: `server/api/public/search-authority/menu/[publicId].get.ts`
- Create: `server/api/public/search-authority/menu/[publicId]/observed.post.ts`
- Create: `app/components/search-authority/MenuAgentCard.vue`
- Modify: `app/components/search-authority/Workspace.vue`
- Test: `test/public/searchAuthorityMenuAgent.test.ts`
- Test: `test/server/api/searchAuthorityMenuConfig.test.ts`
- Test: `test/app/searchAuthorityMenuAgentCard.test.ts`

**Interfaces:**
- Consumes: allowlisted canonical/content hostnames and approved desktop/mobile selectors.
- Produces: a versioned, idempotent DOM agent that inserts exactly one accessible `<a>` and a kill-switchable configuration.

- [x] **Step 1: Write failing DOM safety tests in happy-dom**

Cover initial insertion, duplicate loads, missing selectors, desktop/mobile menus, Next.js rerender, client navigation, disabled configuration, malicious labels/URLs and removal on kill switch.

- [x] **Step 2: Implement strict menu configuration**

```ts
export interface MenuAgentConfig {
  enabled: boolean
  label: string
  href: string
  desktopSelector: string
  mobileSelector: string
  insertion: 'append' | 'before-last'
}
```

Allow only `https://<configured-content-host>/` links, plain-text labels and bounded selectors. Store actor/time changes in Search Authority audit events.

- [x] **Step 3: Implement the versioned agent**

Use a single namespaced marker, a bounded `MutationObserver`, idempotent reconciliation and a maximum retry window. Do not alter unrelated menu nodes, override site styles globally, inject schema, fetch credentials or prevent navigation.

- [x] **Step 4: Add setup and health UI**

Show the exact GTM bootstrap snippet, enabled state, last successful observation and kill switch. Do not place the secretless snippet in a field that implies it is a credential.

- [x] **Step 5: Run tests, lint and commit**

Run: `pnpm exec vitest run test/public/searchAuthorityMenuAgent.test.ts test/server/api/searchAuthorityMenuConfig.test.ts test/app/searchAuthorityMenuAgentCard.test.ts`

```bash
git add server/database/migrations/338_search_authority_menu_agent.sql public/search-authority/menu-agent.v1.js server/utils/searchAuthority/menuAgent.ts server/api/agency/search-authority/menu/config.get.ts server/api/agency/search-authority/menu/config.put.ts server/api/public/search-authority/menu/[publicId].get.ts server/api/public/search-authority/menu/[publicId]/observed.post.ts app/components/search-authority/MenuAgentCard.vue app/components/search-authority/Workspace.vue test/public/searchAuthorityMenuAgent.test.ts test/server/api/searchAuthorityMenuConfig.test.ts test/app/searchAuthorityMenuAgentCard.test.ts test/config/searchAuthorityMenuMigration.test.ts docs/superpowers/plans/2026-08-03-knox-gwm-pilot-completion.md
git commit -m "feat: add bounded search authority menu agent"
```

## Task 10: Add measurement and reviewed PMax handoff

**Files:**
- Create: `server/utils/searchAuthority/measurement.ts`
- Create: `server/api/agency/search-authority/reporting/overview.get.ts`
- Create: `app/components/search-authority/OutcomeReporting.vue`
- Modify: `server/utils/searchAuthority/opportunities.ts`
- Modify: `app/components/search-authority/Workspace.vue`
- Modify: `app/components/search-authority/PortalSummary.vue`
- Test: `test/server/utils/searchAuthorityMeasurement.test.ts`
- Test: `test/server/api/searchAuthorityReporting.test.ts`
- Test: `test/app/searchAuthorityOutcomeReporting.test.ts`

**Interfaces:**
- Consumes: Search Console evidence, publication versions, tracking events, GA4 landing-page evidence, leads and existing task/brief associations.
- Produces: fact-labelled journey summaries and a reviewed PMax brief suggestion; never a Google Ads mutation.

- [ ] **Step 1: Write failing attribution and honesty tests**

Test direct publication attribution, assisted attribution, unknown lead linkage, date-window boundaries, absent GA4 data, unavailable GBP data and duplicate event suppression.

- [ ] **Step 2: Implement evidence joins without identity invention**

Join by explicit publication/page/campaign/task IDs and consented lead attribution. Do not infer a person from anonymous Search Console queries or competitor evidence.

- [ ] **Step 3: Add reviewed PMax suggestion output**

Produce a copyable task/brief payload containing source query/page evidence, intended asset group, hypothesis and reviewer. Do not claim conventional keyword Quality Score improvement and do not call the Ads mutation API.

- [ ] **Step 4: Build agency and portal reporting**

Agency view shows evidence and limitations; portal view shows measured visibility, approved actions, engagement and confirmed outcomes without raw queries or internal weights.

- [ ] **Step 5: Run tests and commit**

Run: `pnpm exec vitest run test/server/utils/searchAuthorityMeasurement.test.ts test/server/api/searchAuthorityReporting.test.ts test/app/searchAuthorityOutcomeReporting.test.ts test/app/portalSearchAuthority.test.ts`

```bash
git add server/utils/searchAuthority/measurement.ts server/utils/searchAuthority/opportunities.ts server/api/agency/search-authority/reporting/overview.get.ts app/components/search-authority/OutcomeReporting.vue app/components/search-authority/Workspace.vue app/components/search-authority/PortalSummary.vue test/server/utils/searchAuthorityMeasurement.test.ts test/server/api/searchAuthorityReporting.test.ts test/app/searchAuthorityOutcomeReporting.test.ts
git commit -m "feat: connect search authority outcomes"
```

## Task 11: Activate optional Google Business Profile evidence and promotion

**Files:**
- Create: `server/utils/social-providers/google-business-performance.ts`
- Create: `server/api/agency/search-authority/google-business/performance.get.ts`
- Create: `server/api/cron/google-business-performance.post.ts`
- Modify: `workers/pages-cron/src/index.ts`
- Modify: `workers/pages-cron/wrangler.toml`
- Modify: `app/components/search-authority/Workspace.vue`
- Test: `test/social/googleBusinessPerformance.test.ts`
- Test: `test/server/api/googleBusinessPerformanceCron.test.ts`

**Interfaces:**
- Consumes: existing `social_accounts` Google Business connection and approved publication URL.
- Produces: supported dated location metrics and a separately approved promotion through the existing social publishing provider.

- [ ] **Step 1: Confirm Google production approval and quota before enabling**

If unavailable, record the provider status and keep `GOOGLE_BUSINESS_PUBLISHING_ENABLED=false`. This closes the GBP track as explicitly unavailable without blocking the core pilot.

- [ ] **Step 2: Write failing provider, normalization and cron tests**

Only documented provider metrics may be stored. Missing dates/metrics remain unavailable and are not backfilled as zero.

- [ ] **Step 3: Implement least-privilege performance ingestion**

Refresh tokens through the existing Google credential flow, scope by client/location, store metric name/date/value plus provider freshness, and redact tokens/provider bodies from errors.

- [ ] **Step 4: Add the scheduled refresh only after connection health is proven**

Use a dedicated daily offset in `pages-cron`; the endpoint must no-op safely while the global flag is false.

- [ ] **Step 5: Publish one separately approved guide promotion**

Create the draft through the existing social composer, require the normal approval path, publish to the connected Knox location and record the provider post ID.

- [ ] **Step 6: Run tests and commit**

Run: `pnpm exec vitest run test/social/googleBusinessPerformance.test.ts test/server/api/googleBusinessPerformanceCron.test.ts test/social/googleBusinessPublishing.test.ts`

```bash
git add server/utils/social-providers/google-business-performance.ts server/api/agency/search-authority/google-business/performance.get.ts server/api/cron/google-business-performance.post.ts workers/pages-cron/src/index.ts workers/pages-cron/wrangler.toml app/components/search-authority/Workspace.vue test/social/googleBusinessPerformance.test.ts test/server/api/googleBusinessPerformanceCron.test.ts
git commit -m "feat: add Google Business search evidence"
```

## Task 12: Publish the first Knox guide and complete production acceptance

**Files:**
- Modify: `docs/runbooks/search-authority-phase-1.md`
- Modify: `docs/runbooks/site-intelligence-pilot.md`
- Create: `docs/runbooks/search-authority-publishing.md`
- Create: `docs/evidence/knox-gwm-pilot-acceptance.md`
- Modify: `app/pages/features/index.vue`
- Modify: `app/pages/features/[slug].vue`
- Modify: `app/components/MarketingNav.vue` when the product category needs the new publishing entry
- Modify: this tracker

**Interfaces:**
- Consumes: completed Tasks 1–11 and human-approved Knox content/DNS/GTM actions.
- Produces: live guide, safe menu link, measured test journey, rollback proof and stakeholder evidence pack.

- [ ] **Step 1: Complete the mandatory deep review and focused regression suites**

Run the Search Authority, Site Intelligence, content, publisher, Menu Agent, measurement and GBP tests. Reread every modified file, check Nitro aliases, SSRF, USelectMenu values, form reactivity, dark mode and CSS construction.

- [ ] **Step 2: Run static and production builds**

Run: `pnpm run typecheck`

Accept only known pre-existing diagnostics; no changed Knox/Search Authority/Site Intelligence file may appear.

Run: `pnpm deploy:check`

Expected: `agency-dashboard / main`.

Run: `pnpm run build`

- [ ] **Step 3: Obtain independent code review and resolve every Critical/Important finding**

Review security/tenancy, immutable approvals, public-host routing, cache invalidation, XSS, SSRF, secret handling, menu DOM containment and attribution honesty.

- [ ] **Step 4: Merge through a PR and deploy guarded targets**

Deploy Pages only through the production script and deploy standalone Workers through their named wrappers. Verify GitHub checks and fetch job logs rather than relying only on the green badge.

- [ ] **Step 5: Configure the Knox content hostname**

The authorised DNS operator creates the bounded hostname record issued by the publisher onboarding flow. Verify CAA/certificate compatibility, TLS, host mapping and rollback before public release.

- [ ] **Step 6: Publish the first human-approved guide**

The initial guide must use a real Sales Manager source, verified claims, approved disclaimers and an immutable version. Candidate topics are Cannon Alpha towing capability, Haval H6 Hybrid ownership, Jolion comparison or Knox finance; search/sales evidence selects the final topic.

- [ ] **Step 7: Activate and battle-test the Menu Agent**

Use authorised GTM access. Confirm exactly one desktop/mobile link after initial load, navigation and rerender; confirm disabling the config removes the link without affecting the main site.

- [ ] **Step 8: Verify the end-to-end measurement journey**

Test discovery/visit, CTA, test lead, source/publication attribution and no false cross-subdomain self-referral. Mark unavailable metrics explicitly.

- [ ] **Step 9: Prove rollback**

Roll the public manifest back to the prior approved version, verify the previous HTML remains available, then restore the current approved version through the audited workflow.

- [ ] **Step 10: Complete the evidence pack and close the core tracker**

`docs/evidence/knox-gwm-pilot-acceptance.md` must record URLs, dates, version IDs, run IDs, screenshots, metric windows, provider limitations, rollback proof, unresolved origin-owned findings and the next monthly content question. Never include secrets, raw search queries or customer personal information.

- [ ] **Step 11: Update public feature pages and commit final documentation**

```bash
git add docs/runbooks/search-authority-phase-1.md docs/runbooks/site-intelligence-pilot.md docs/runbooks/search-authority-publishing.md docs/evidence/knox-gwm-pilot-acceptance.md docs/superpowers/plans/2026-08-03-knox-gwm-pilot-completion.md app/pages/features/index.vue app/pages/features/[slug].vue app/components/MarketingNav.vue
git commit -m "docs: complete Knox search authority pilot"
```

---

## External Action Register

| Action | Owner | Blocks | Safe handling |
| --- | --- | --- | --- |
| Rotate Browser Rendering token | XeroFlow Cloudflare owner | Owned/competitor crawl proof | Enter only through interactive Wrangler or Cloudflare dashboard |
| Configure `PAGESPEED_API_KEY` | XeroFlow Google Cloud owner | Mobile lab/field evidence refresh | Restrict the key to the PageSpeed Insights API and store it only as a Pages secret |
| Authorise Search Console read access | Knox/ADME Google property owner | Search baseline and opportunities | Use XeroFlow OAuth; no token sharing |
| Approve Sales Manager source and claims | Knox Sales Manager/brand approver | First guide | Approval occurs against immutable version |
| Create `learn` DNS record and validate certificate | Knox authorised DNS administrator | Public publisher | Use only the issued hostname target; no whole-site proxy |
| Publish GTM Menu Agent bootstrap | Knox/ADME authorised GTM publisher | Main-menu discovery | One versioned script; kill switch remains in XeroFlow |
| Confirm GA4 cross-domain settings and test property | ADME measurement owner | Attribution acceptance | Use test events and exclude false self-referrals |
| Confirm Google Business API approval/quota | Google project owner | GBP-only track | Leave global flag off until proven |

## Stop Conditions

Pause the affected track immediately for cross-tenant data, unexpected origin traversal, raw-content/secret exposure, an unauthorised publication, invalid approval lineage, arbitrary DOM mutation, a provider write outside the selected account/location, or attribution that presents inferred data as measured fact.

## Final Pilot Exit Statement

Use `Core pilot complete` only when every Core row in the Live Pilot Tracker is checked with evidence. If Google Business remains unavailable, state `Core pilot complete; GBP provider activation deferred` and include the dated provider-access evidence.
