# Automotive Site Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an automotive-first, tenant-safe crawler and change-intelligence layer that connects owned-site content with XeroFlow audience outcomes and monitors approved public competitor pages without inventing competitor metrics.

**Architecture:** Extend the existing `agency-workflows` Worker to orchestrate Cloudflare Browser Run `/crawl`, then ingest bounded result batches through authenticated Nitro callbacks. Neon stores governance, current facts, changes, and insights; a private R2 bucket stores expiring raw snapshots; `JOBS_QUEUE` enriches only changed pages; a separate Vectorize index supports client-filtered semantic retrieval. The existing Website Audiences surface receives a route-backed Intelligence tab.

**Tech Stack:** Nuxt 4, Vue 3 Composition API, Nuxt UI v4, Nitro/H3, Neon Postgres through Hyperdrive, Cloudflare Browser Run REST API, Workflows, Queues, R2, Workers AI, AI Gateway, Vectorize, Zod, Vitest, happy-dom.

## Global Constraints

- Follow the approved design in `docs/superpowers/specs/2026-08-01-automotive-site-intelligence-design.md`.
- The pilot is automotive-first: five to ten clients, one owned domain and up to three competitor domains per client, maximum 200 approved pages per domain.
- First-party XeroFlow tracking is the only source of owned visitor, audience, campaign, conversion, and lead metrics.
- Never infer or display competitor traffic, audiences, conversions, demographics, reach, frequency, or spend from crawled content.
- Crawl public pages only; do not send credentials, cookies, authentication headers, or CAPTCHA/WAF bypass instructions.
- Respect `robots.txt`, crawl delay, Cloudflare Content Signals, WAF, CAPTCHA, and Turnstile outcomes.
- `ai-train` is never a crawl purpose. Competitor content reaches a model only when `ai_input_allowed=true` and the run declares `ai-input`.
- Resolve client access before every query. Every Vectorize query includes a client filter and joins results back to authorised Neon rows.
- Do not send tracking IDs, session IDs, click IDs, lead fingerprints, contact data, raw tracking events, or PII to crawl or AI boundaries.
- Use deterministic extraction and content hashes before AI; unchanged pages do not enqueue enrichment.
- Use Nuxt UI v4 for all UI. Before editing the domain form, invoke the mandatory `frontend-design` skill and follow project form conventions.
- All server imports use `~~/server/utils/`. Shared runtime types live in `app/types/site-intelligence.ts`.
- Use `apply_patch` for edits, preserve unrelated worktree changes, and stage only files owned by the current task.
- Follow TDD for every task: failing focused test, minimum implementation, green focused tests, review, atomic commit.
- Any migration created by this plan must be run automatically against the configured database before its task is committed.
- Do not deploy in Tasks 1–9. Production activation occurs only after Task 10 readiness checks and explicit user approval.

---

## File Structure

### Contracts, persistence, and policy

- Create `app/types/site-intelligence.ts` — shared public contracts and literal unions.
- Create `server/database/migrations/288_automotive_site_intelligence.sql` — registry, runs, ingest idempotency, pages, changes, insights, audit events, constraints, and indexes.
- Create `server/utils/siteIntelligence/urlPolicy.ts` — URL normalisation and fail-closed public-origin validation.
- Create `server/utils/siteIntelligence/contracts.ts` — Zod mutation, crawl, ingestion, and AI schemas.
- Create `server/utils/siteIntelligence/repository.ts` — scoped domain/run/page/change/insight persistence.
- Create `server/utils/siteIntelligence/audit.ts` — bounded audit-event writes.

### Registry and crawl orchestration

- Create `server/api/agency/site-intelligence/domains/index.get.ts`.
- Create `server/api/agency/site-intelligence/domains/index.post.ts`.
- Create `server/api/agency/site-intelligence/domains/[id].put.ts`.
- Create `server/api/agency/site-intelligence/domains/[id]/crawl.post.ts`.
- Create `server/utils/siteIntelligence/cloudflareCrawl.ts` — Browser Run REST client and response guards.
- Create `server/utils/agencyWorkflows/siteIntelligenceCrawl.ts` — Pages-side workflow start contract.
- Modify `workers/agency-workflows/src/contracts.ts` — site crawl workflow kind and payload validation.
- Modify `workers/agency-workflows/src/index.ts` — durable start, poll, pagination, callbacks, and health.
- Modify `workers/agency-workflows/wrangler.toml` — workflow binding.

### Ingestion, storage, enrichment, and retrieval

- Create `server/api/internal/workflows/site-intelligence/runs/[id]/config.get.ts`.
- Create `server/api/internal/workflows/site-intelligence/runs/[id]/ingest.post.ts`.
- Create `server/api/internal/workflows/site-intelligence/runs/[id]/complete.post.ts`.
- Create `server/utils/siteIntelligence/storage.ts` — private R2 snapshot writes/deletes.
- Create `server/utils/siteIntelligence/extractAutomotiveFacts.ts` — deterministic facts.
- Create `server/utils/siteIntelligence/diff.ts` — material-change classifier.
- Create `server/utils/siteIntelligence/enrich.ts` — schema-validated AI enrichment.
- Create `server/utils/siteIntelligence/vectorize.ts` — dedicated index upsert/search/delete.
- Modify `server/utils/queue.ts` and `server/utils/queueConsumer.ts` — `site-intelligence.enrich` job.
- Modify `wrangler.toml` — private bucket and dedicated Vectorize bindings plus fail-closed feature flags.

### Intelligence API and UI

- Create `server/utils/siteIntelligence/intelligence.ts` — deterministic offer/content/performance rules.
- Create `server/api/agency/site-intelligence/overview.get.ts`.
- Create `server/api/agency/site-intelligence/changes.get.ts`.
- Create `server/api/agency/site-intelligence/gaps.get.ts`.
- Create `server/api/agency/site-intelligence/runs/[id].get.ts`.
- Create `app/composables/useSiteIntelligence.ts` — route state and independently refreshable resources.
- Create `app/pages/agency/analytics/audiences/intelligence.vue` — page composition.
- Create focused components under `app/components/analytics/audiences/intelligence/`.
- Modify `app/pages/agency/analytics/audiences.vue` and the audience navigation component to expose the route-backed tab.

### Operations and public product sync

- Create `server/api/agency/site-intelligence/readiness.get.ts`.
- Create `server/api/cron/site-intelligence.post.ts` — due-domain scheduler only.
- Modify `workers/pages-cron/src/index.ts` — scheduled authenticated trigger.
- Modify `app/pages/features/index.vue` and `app/pages/features/[slug].vue` — truthful public copy.
- Create `docs/runbooks/site-intelligence-pilot.md` — provisioning, cost caps, activation, monitoring, and rollback.

---

### Task 1: Lock persistence, contracts, and public-target policy

**Files:**
- Create: `server/database/migrations/288_automotive_site_intelligence.sql`
- Create: `app/types/site-intelligence.ts`
- Create: `server/utils/siteIntelligence/contracts.ts`
- Create: `server/utils/siteIntelligence/urlPolicy.ts`
- Create: `test/server/utils/siteIntelligence/urlPolicy.test.ts`
- Create: `test/config/automotiveSiteIntelligenceMigration.test.ts`

**Interfaces:**
- Produces: `SiteIntelligenceLane`, `SiteIntelligenceDomain`, `SiteIntelligenceRunStatus`, `SiteIntelligenceChange`, `SiteIntelligenceInsight`, `normalizeSiteOrigin(input)`, and Zod schemas used by all later tasks.
- Produces tables: `site_intelligence_domains`, `site_intelligence_crawl_runs`, `site_intelligence_pages`, `site_intelligence_changes`, and `site_intelligence_insights`.

- [x] **Step 1: Write failing URL-policy and migration contract tests**

Assert the following exact policy:

```ts
expect(normalizeSiteOrigin('https://Dealer.example.com/offers')).toBe('https://dealer.example.com')
expect(() => normalizeSiteOrigin('http://127.0.0.1/admin')).toThrowError('Public HTTP(S) origin required')
expect(() => normalizeSiteOrigin('http://169.254.169.254/latest')).toThrowError('Public HTTP(S) origin required')
expect(() => normalizeSiteOrigin('https://user:pass@example.com')).toThrowError('Credentials are not allowed')
expect(() => normalizeSiteOrigin('file:///etc/passwd')).toThrowError('Public HTTP(S) origin required')
```

The migration test reads the SQL and verifies lane/status checks, unique
`(client_id, origin, lane)`, foreign keys with bounded deletion behaviour,
canonical-page uniqueness, run idempotency, timestamps, JSON object checks, and
indexes on client/domain/status/time columns.

- [x] **Step 2: Run the tests and observe missing modules/files**

Run:

```bash
pnpm vitest run test/server/utils/siteIntelligence/urlPolicy.test.ts test/config/automotiveSiteIntelligenceMigration.test.ts
```

Expected: FAIL because the migration and modules do not exist.

- [x] **Step 3: Define shared literal unions and response contracts**

Use these public unions:

```ts
export type SiteIntelligenceLane = 'owned' | 'competitor'
export type SiteIntelligenceDomainStatus = 'active' | 'paused'
export type SiteIntelligenceRunStatus = 'queued' | 'running' | 'completed' | 'partial' | 'blocked' | 'failed' | 'cancelled'
export type SiteIntelligencePageType = 'homepage' | 'model' | 'inventory' | 'offer' | 'finance' | 'service' | 'location' | 'landing_page' | 'article' | 'other'
export type SiteIntelligenceInsightType = 'offer_change' | 'offer_gap' | 'landing_mismatch' | 'high_traffic_stale_content' | 'content_gap' | 'conversion_context'
```

Define contracts for domain rows, run summaries, page facts, fact diffs, change
rows, insight rows, overview, change feed, gap response, and paginated API metadata.
Do not include raw page bodies or R2 keys in browser-facing contracts.

- [x] **Step 4: Create the additive schema**

Use UUID primary keys and `TIMESTAMPTZ`. Add CHECK constraints for lane, status,
frequency, limits (`1..200` pages, `0..5` depth, `1..365` retention days), and
ensure `crawl_purposes` cannot contain `ai-train`. Store typed facts/diffs as JSONB
objects with defaults of `'{}'::jsonb`, never unbounded arbitrary arrays.

- [x] **Step 5: Implement fail-closed URL validation**

Parse with `URL`, reject credentials/fragments/non-HTTP protocols, normalise host
and default ports, reject localhost and reserved literal IPv4/IPv6 ranges, then
resolve DNS immediately before the crawl start and reject any private/reserved
answer. Return the canonical origin only after every answer is public.

- [x] **Step 6: Run the focused tests to green**

Run the command from Step 2. Expected: PASS.

- [x] **Step 7: Apply the migration automatically**

Run:

```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/database/migrations/288_automotive_site_intelligence.sql
```

Then verify:

```bash
psql "$DATABASE_URL" -c "SELECT to_regclass('public.site_intelligence_domains'), to_regclass('public.site_intelligence_crawl_runs'), to_regclass('public.site_intelligence_pages'), to_regclass('public.site_intelligence_changes'), to_regclass('public.site_intelligence_insights')"
```

- [x] **Step 8: Commit the foundation**

```bash
git add app/types/site-intelligence.ts server/database/migrations/288_automotive_site_intelligence.sql server/utils/siteIntelligence/contracts.ts server/utils/siteIntelligence/urlPolicy.ts test/server/utils/siteIntelligence/urlPolicy.test.ts test/config/automotiveSiteIntelligenceMigration.test.ts
git commit -m "feat: define automotive site intelligence foundation"
```

### Task 2: Deliver governed domain registry management

**Files:**
- Create: `server/utils/siteIntelligence/repository.ts`
- Create: `server/utils/siteIntelligence/audit.ts`
- Create: `server/api/agency/site-intelligence/domains/index.get.ts`
- Create: `server/api/agency/site-intelligence/domains/index.post.ts`
- Create: `server/api/agency/site-intelligence/domains/[id].put.ts`
- Create: `app/components/analytics/audiences/intelligence/DomainModal.vue`
- Create: `app/components/analytics/audiences/intelligence/DomainTable.vue`
- Test: `test/server/api/siteIntelligenceDomains.test.ts`
- Test: `test/app/siteIntelligenceDomainForm.test.ts`

**Interfaces:**
- Consumes: Task 1 contracts, `requireTrackingAudienceScope`, `requireRole`, and `queryRows/queryOne/execute`.
- Produces: tenant-scoped list/create/update APIs and an administrator-only Nuxt UI management surface.

- [x] **Step 1: Apply the available frontend design guidance**

Read the complete frontend-design `SKILL.md` named in `AGENTS.md` before editing
the form. Record the resulting hierarchy, spacing, responsive-field, and dark-mode
decisions in the test description and component comments only where necessary.
The exact legacy path named in `AGENTS.md` was unavailable in this environment;
the available `frontend-ui-engineering` guidance was applied with all project form
rules retained.

- [x] **Step 2: Write failing API and form tests**

Test that scoped users see assigned clients only, management users can read all,
non-admin mutations return `403`, duplicate client/origin/lane returns `409`, URL
policy rejection returns `400`, competitor defaults to `crawlPurposes:['search']`
and `aiInputAllowed:false`, and no response contains approval audit internals.

For the form, assert `UModal`, `UFormField`, `UInput`, `USelectMenu`, `UCheckbox`,
and `UButton` usage; no native input/select/button; no empty-string select value;
and lane changes visibly reset purpose defaults.

- [x] **Step 3: Run tests and confirm missing-boundary failures**

```bash
pnpm vitest run test/server/api/siteIntelligenceDomains.test.ts test/app/siteIntelligenceDomainForm.test.ts
```

Expected: FAIL because the repository, handlers, and components do not exist.

- [x] **Step 4: Implement repository and audit boundaries**

Expose exact functions:

```ts
listSiteIntelligenceDomains(scope, filters)
createSiteIntelligenceDomain(actor, input)
updateSiteIntelligenceDomain(actor, domainId, input)
getSiteIntelligenceDomainForActor(actor, domainId)
writeSiteIntelligenceAudit(actor, action, entityId, safeMetadata)
```

Every SQL method accepts already-resolved client scope and rechecks the row's
client on mutation. Audit metadata contains changed field names and safe scalar
values, never page content or tokens.

- [x] **Step 5: Implement thin authenticated handlers**

Validate bodies with Task 1 Zod schemas, role-gate before mutation, resolve client
access before repository calls, return `409` for the unique domain constraint, and
return stable status messages without SQL details.

- [x] **Step 6: Build the responsive domain modal and table**

Use a single-column form with `@container` and `@lg:grid-cols-2` only where fields
fit. Show the competitor-public-content boundary next to the lane field. Put
advanced crawl controls in `UAccordion`; default page limit and purposes from the
selected lane. Use `UAlert` for blocked policy, not browser dialogs.

- [x] **Step 7: Run the focused tests to green**

Run the Step 3 command. Expected: PASS.

- [x] **Step 8: Commit the governed registry slice**

```bash
git add server/utils/siteIntelligence/repository.ts server/utils/siteIntelligence/audit.ts server/api/agency/site-intelligence/domains app/components/analytics/audiences/intelligence/DomainModal.vue app/components/analytics/audiences/intelligence/DomainTable.vue test/server/api/siteIntelligenceDomains.test.ts test/app/siteIntelligenceDomainForm.test.ts
git commit -m "feat: govern monitored site domains"
```

### Task 3: Add the Browser Run client and crawl workflow contract

**Files:**
- Create: `server/utils/siteIntelligence/cloudflareCrawl.ts`
- Create: `server/utils/agencyWorkflows/siteIntelligenceCrawl.ts`
- Modify: `workers/agency-workflows/src/contracts.ts`
- Modify: `workers/agency-workflows/src/index.ts`
- Modify: `workers/agency-workflows/wrangler.toml`
- Test: `test/server/utils/siteIntelligence/cloudflareCrawl.test.ts`
- Test: `test/workers/agencyWorkflowsSiteIntelligence.test.ts`

**Interfaces:**
- Produces workflow kind `site.intelligence.crawl`, payload `{ kind, runId, domainId, clientId, trigger, requestedBy? }`, Browser Run start/poll/page/cancel helpers, and deterministic workflow instance ID `site-intel-<runId>`.

- [x] **Step 1: Write failing REST-client and workflow contract tests**

Mock `fetch` and assert the client calls only:

```text
POST https://api.cloudflare.com/client/v4/accounts/<accountId>/browser-rendering/crawl
GET  https://api.cloudflare.com/client/v4/accounts/<accountId>/browser-rendering/crawl/<jobId>
```

Assert Bearer authentication, `render:false` default, external links disabled,
bounded limit/depth, allowed formats, explicit `crawlPurposes`, cursor pagination,
10 MB-safe page limits, and redacted errors. Assert the workflow parser rejects
missing UUID-like identifiers and unsupported triggers.

- [x] **Step 2: Run tests and observe missing exports**

```bash
pnpm vitest run test/server/utils/siteIntelligence/cloudflareCrawl.test.ts test/workers/agencyWorkflowsSiteIntelligence.test.ts
```

Expected: FAIL.

- [x] **Step 3: Implement the guarded Browser Run client**

Expose:

```ts
startCloudflareCrawl(env, config): Promise<{ jobId: string }>
getCloudflareCrawlStatus(env, jobId): Promise<CrawlStatusPage>
getCloudflareCrawlRecords(env, jobId, cursor?): Promise<CrawlRecordPage>
cancelCloudflareCrawl(env, jobId): Promise<void>
```

Validate Cloudflare response envelopes with Zod. Permit terminal statuses only
from the documented allowlist. Error objects include status, request stage, and a
200-character safe summary; never include the API token or complete response body.

- [x] **Step 4: Add workflow contracts and binding configuration**

Add `SITE_INTELLIGENCE_CRAWL_WORKFLOW` to the Worker environment and
`[[workflows]] name="site-intelligence-crawl-workflow"`. Update the `/health`
response and `/workflows/start` discriminator without changing existing workflow
contracts.

- [x] **Step 5: Run focused and existing workflow regression tests**

```bash
pnpm vitest run test/server/utils/siteIntelligence/cloudflareCrawl.test.ts test/workers/agencyWorkflowsSiteIntelligence.test.ts test/server/utils/agencyWorkflows
```

Expected: PASS.

- [x] **Step 6: Commit the crawl contract slice**

```bash
git add server/utils/siteIntelligence/cloudflareCrawl.ts server/utils/agencyWorkflows/siteIntelligenceCrawl.ts workers/agency-workflows/src/contracts.ts workers/agency-workflows/src/index.ts workers/agency-workflows/wrangler.toml test/server/utils/siteIntelligence/cloudflareCrawl.test.ts test/workers/agencyWorkflowsSiteIntelligence.test.ts
git commit -m "feat: add site intelligence crawl workflow contract"
```

### Task 4: Complete manual crawl orchestration and authenticated callbacks

**Files:**
- Create: `server/api/agency/site-intelligence/domains/[id]/crawl.post.ts`
- Create: `server/api/internal/workflows/site-intelligence/runs/[id]/config.get.ts`
- Create: `server/api/internal/workflows/site-intelligence/runs/[id]/ingest.post.ts`
- Create: `server/api/internal/workflows/site-intelligence/runs/[id]/complete.post.ts`
- Modify: `workers/agency-workflows/src/index.ts`
- Modify: `server/utils/siteIntelligence/repository.ts`
- Test: `test/server/api/siteIntelligenceCrawl.test.ts`
- Test: `test/workers/siteIntelligenceWorkflowExecution.test.ts`

**Interfaces:**
- Produces: one idempotent manual-run path and workflow callback protocol. Ingest initially validates and records bounded raw results; Task 5 adds extraction/storage.

- [x] **Step 1: Write failing orchestration tests**

Assert a manual run requires an active authorised domain, feature flag, and admin
role; creates one queued run; refuses a second active run with `409`; revalidates
DNS immediately before Workflow start; and stores no secret. Internal callbacks
must reject missing/wrong `x-workflow-secret` and a client/domain/run mismatch.

Workflow tests assert: config callback → Browser Run start → durable polling with
Workflow sleeps → paginated ingestion → terminal completion. `disallowed` records
produce a blocked/partial outcome and are never retried as bypass candidates.

- [x] **Step 2: Run the orchestration tests and confirm failure**

```bash
pnpm vitest run test/server/api/siteIntelligenceCrawl.test.ts test/workers/siteIntelligenceWorkflowExecution.test.ts
```

Expected: FAIL.

- [x] **Step 3: Implement manual run creation**

In one transaction, lock the domain, check for an active run, create the immutable
run snapshot, and write an audit event. Start the workflow after commit. If start
fails, mark the run failed with category `workflow_start`; do not leave it queued.

- [x] **Step 4: Implement the durable Workflow loop**

Use `step.do` for external calls and `step.sleep('wait for crawl', '30 seconds')`
between polls. Cap polling at 240 attempts and let the Browser Run seven-day
terminal status remain authoritative. Fetch records in bounded pages and generate
an idempotency key from run ID, cursor, and record status filter.

- [x] **Step 5: Implement callback authentication and idempotency**

The config endpoint returns the immutable run settings, not the mutable domain
row. The ingest endpoint accepts at most 100 records or 5 MB and records the batch
key before processing. Replayed batches return success without duplicate writes.
The completion endpoint accepts only documented terminal status transitions.

- [x] **Step 6: Run focused tests to green**

Run the Step 2 command. Expected: PASS.

- [x] **Step 7: Commit the end-to-end crawl control path**

```bash
git add server/api/agency/site-intelligence/domains server/api/internal/workflows/site-intelligence server/utils/siteIntelligence/repository.ts workers/agency-workflows/src/index.ts test/server/api/siteIntelligenceCrawl.test.ts test/workers/siteIntelligenceWorkflowExecution.test.ts
git commit -m "feat: orchestrate governed site crawls"
```

### Task 5: Persist snapshots, deterministic facts, and material changes

**Files:**
- Create: `server/utils/siteIntelligence/storage.ts`
- Create: `server/utils/siteIntelligence/extractAutomotiveFacts.ts`
- Create: `server/utils/siteIntelligence/diff.ts`
- Modify: `server/api/internal/workflows/site-intelligence/runs/[id]/ingest.post.ts`
- Modify: `server/utils/siteIntelligence/repository.ts`
- Modify: `server/utils/queue.ts`
- Modify: `wrangler.toml`
- Test: `test/server/utils/siteIntelligence/extractAutomotiveFacts.test.ts`
- Test: `test/server/utils/siteIntelligence/diff.test.ts`
- Test: `test/server/api/siteIntelligenceIngest.test.ts`

**Interfaces:**
- Produces: `extractAutomotiveFacts(markdown, metadata)`, `diffAutomotiveFacts(previous, current)`, private R2 storage helpers, current page upsert, append-only change rows, and `site-intelligence.enrich` jobs for changed pages.

- [x] **Step 1: Write failing fixtures and ingestion tests**

Use short synthetic dealer pages covering drive-away price, weekly repayment,
comparison rate, term, expiry, model/variant, stock state, test-drive CTA, JSON-LD,
and disclaimer. Assert exact facts and null for absent values. Assert navigation,
cookie, whitespace, or timestamp-only changes are non-material; price, expiry,
availability, CTA, and offer changes are material.

Ingestion tests assert client-prefixed R2 keys, content hashing, insert/change/
unchanged behaviour, no raw body in Neon change rows, and exactly one enrichment
job per new material hash.

- [x] **Step 2: Run tests and observe missing implementation**

```bash
pnpm vitest run test/server/utils/siteIntelligence/extractAutomotiveFacts.test.ts test/server/utils/siteIntelligence/diff.test.ts test/server/api/siteIntelligenceIngest.test.ts
```

Expected: FAIL.

- [x] **Step 3: Implement deterministic extraction and canonicalisation**

Normalise whitespace and URLs, prefer JSON-LD/metadata over visible-copy regexes,
retain short evidence excerpts, and version the extractor as
`automotive-deterministic-v1`. Monetary and finance fields include raw display
text plus parsed values; ambiguous parses remain null.

- [x] **Step 4: Implement material diffing**

Return:

```ts
interface AutomotiveFactDiff {
  material: boolean
  changedFields: string[]
  before: Record<string, string | number | boolean | null>
  after: Record<string, string | number | boolean | null>
  evidence: Array<{ field: string, excerpt: string }>
}
```

Exclude raw bodies. Sort field names and evidence deterministically so replays
produce identical results.

- [x] **Step 5: Add private R2 and atomic page ingestion**

Create `SITE_INTELLIGENCE_BUCKET` binding. Write the object before committing its
Neon key. In a transaction, lock current page by domain/canonical URL, compare the
hash/facts, upsert current state, append a change only when material, and record
the batch item. If DB commit fails after R2 write, record the orphan key for the
daily cleanup path rather than exposing it.

- [x] **Step 6: Enqueue changed-page jobs**

Add this exact queue type:

```ts
type: 'site-intelligence.enrich'
payload: { clientId: string, domainId: string, pageId: string, changeId: string | null, contentHash: string }
```

Enqueue after the database commit. Processing will recheck the page hash, making
duplicate queue delivery harmless.

- [x] **Step 7: Run focused tests to green**

Run the Step 2 command. Expected: PASS.

- [x] **Step 8: Commit the deterministic ingestion slice**

```bash
git add server/utils/siteIntelligence/storage.ts server/utils/siteIntelligence/extractAutomotiveFacts.ts server/utils/siteIntelligence/diff.ts server/api/internal/workflows/site-intelligence/runs server/utils/siteIntelligence/repository.ts server/utils/queue.ts wrangler.toml test/server/utils/siteIntelligence test/server/api/siteIntelligenceIngest.test.ts
git commit -m "feat: extract and diff automotive site facts"
```

### Task 6: Enrich permitted changes and index tenant-scoped knowledge

**Files:**
- Create: `server/utils/siteIntelligence/enrich.ts`
- Create: `server/utils/siteIntelligence/vectorize.ts`
- Modify: `server/utils/queueConsumer.ts`
- Modify: `server/utils/ai/modelAssignments.ts`
- Modify: `server/utils/ai/modelRegistry.ts`
- Modify: `wrangler.toml`
- Test: `test/server/utils/siteIntelligence/enrich.test.ts`
- Test: `test/server/utils/siteIntelligence/vectorize.test.ts`
- Test: `test/server/utils/siteIntelligence/queueConsumer.test.ts`

**Interfaces:**
- Produces: enrichment feature key `site_intelligence_enrichment`, schema-validated page/change interpretation, dedicated `SITE_INTELLIGENCE_VECTORIZE` operations, and idempotent queue processing.

- [x] **Step 1: Write failing permission, safety, and tenant tests**

Assert no model call when AI flag is off, domain AI permission is false, the run
did not declare `ai-input`, content hash is stale, or no relevant deterministic
facts exist. Assert model input excludes forbidden keys matching
`/anon|session|click|fingerprint|email|phone|lead|eventPayload/i`.

Vector tests require filter `{ clientId }`, reject empty client IDs, store lane,
domain ID, and page type metadata, and join search matches back through authorised
Neon page IDs before returning excerpts.

- [x] **Step 2: Run tests and observe missing implementation**

```bash
pnpm vitest run test/server/utils/siteIntelligence/enrich.test.ts test/server/utils/siteIntelligence/vectorize.test.ts test/server/utils/siteIntelligence/queueConsumer.test.ts
```

Expected: FAIL.

- [x] **Step 3: Register the model feature and strict output schema**

The model returns only:

```ts
{
  pageType: SiteIntelligencePageType
  summary: string
  offerSummary: string | null
  themes: string[]
  confidence: number
  evidenceFields: string[]
}
```

Clamp summary lengths, theme counts, and confidence. Treat invalid output as an
enrichment failure that leaves deterministic facts available.

- [x] **Step 4: Implement permission-gated enrichment**

Load the current page/domain/run by identifiers, verify hash and permission, read
the private R2 object, construct an allowlisted prompt, call the existing
AI-Gateway-routed model assignment, validate output, and persist only the current
hash's enrichment. Record cost/latency metadata without storing prompts containing
page copy.

- [x] **Step 5: Implement the dedicated Vectorize boundary**

Use Workers AI `@cf/baai/bge-base-en-v1.5` at 768 dimensions. Upsert only after
enrichment or deterministic facts are current. Metadata includes `clientId`,
`lane`, `domainId`, and `pageType`. Deletion removes the vector before clearing the
Neon vector ID.

- [x] **Step 6: Add idempotent queue dispatch**

Extend `processJob` with `site-intelligence.enrich`. Re-read the current hash before
work; return success for superseded/disabled jobs. Throw transient provider/storage
errors for Queue retry and persist terminal validation/policy failures without
retry loops.

- [x] **Step 7: Run focused and adjacent AI tests**

```bash
pnpm vitest run test/server/utils/siteIntelligence/enrich.test.ts test/server/utils/siteIntelligence/vectorize.test.ts test/server/utils/siteIntelligence/queueConsumer.test.ts test/server/utils/aiModelRegistry.test.ts
```

Expected: PASS.

- [x] **Step 8: Commit enrichment and retrieval**

```bash
git add server/utils/siteIntelligence/enrich.ts server/utils/siteIntelligence/vectorize.ts server/utils/queueConsumer.ts server/utils/ai/modelAssignments.ts server/utils/ai/modelRegistry.ts wrangler.toml test/server/utils/siteIntelligence test/server/utils/aiModelRegistry.test.ts
git commit -m "feat: enrich site intelligence safely"
```

### Task 7: Generate evidence-backed owned and competitor insights

**Files:**
- Create: `server/utils/siteIntelligence/intelligence.ts`
- Create: `server/api/agency/site-intelligence/overview.get.ts`
- Create: `server/api/agency/site-intelligence/changes.get.ts`
- Create: `server/api/agency/site-intelligence/gaps.get.ts`
- Create: `server/api/agency/site-intelligence/runs/[id].get.ts`
- Modify: `server/utils/siteIntelligence/repository.ts`
- Test: `test/server/utils/siteIntelligence/intelligence.test.ts`
- Test: `test/server/api/siteIntelligenceReadApi.test.ts`

**Interfaces:**
- Consumes: current page facts, material changes, existing audience repository aggregates, and authorised client scope.
- Produces: overview, change feed, run diagnostics, and conservative offer/content/performance gap responses.

- [x] **Step 1: Write failing deterministic insight tests**

Cover all six design rules. Exact-model comparisons outrank category comparisons;
expired offers do not count as current; missing facts produce `insufficient_data`;
competitor facts never produce competitor performance fields. Each emitted insight
must contain at least one supporting page/change ID, evidence URL, observed time,
rule version, and confidence.

- [x] **Step 2: Write failing access and response-contract tests**

Assert management/scoped visibility, inaccessible-client rejection, stable
pagination, bounded ranges, lane filters, change-type filters, no R2 keys/raw text,
and no competitor keys matching `/visitor|audience|conversion|reach|spend/i`.

- [x] **Step 3: Run tests and observe missing services/routes**

```bash
pnpm vitest run test/server/utils/siteIntelligence/intelligence.test.ts test/server/api/siteIntelligenceReadApi.test.ts
```

Expected: FAIL.

- [x] **Step 4: Implement pure candidate rules**

Expose:

```ts
deriveSiteIntelligenceInsights(input): SiteIntelligenceInsight[]
compareAutomotiveOffers(ownedFacts, competitorFacts): OfferGapResult[]
joinOwnedAudienceContext(pageUrls, audienceBreakdowns): OwnedPageContext[]
```

Version rules as `automotive-intelligence-v1`. Use exact canonical URLs and model
facts to join owned pages to the existing page breakdown; never join anonymous
visitor rows.

- [x] **Step 5: Implement scoped repository reads and thin APIs**

Resolve access before SQL, use allowlisted sort/filter mappings, cap change pages
at 100 rows and gaps at 50, and generate agency totals only from accessible client
IDs. Overview endpoint remains useful if AI enrichment is disabled.

- [x] **Step 6: Run focused tests to green**

Run the Step 3 command. Expected: PASS.

- [x] **Step 7: Commit the intelligence API slice**

```bash
git add server/utils/siteIntelligence/intelligence.ts server/utils/siteIntelligence/repository.ts server/api/agency/site-intelligence/overview.get.ts server/api/agency/site-intelligence/changes.get.ts server/api/agency/site-intelligence/gaps.get.ts server/api/agency/site-intelligence/runs test/server/utils/siteIntelligence/intelligence.test.ts test/server/api/siteIntelligenceReadApi.test.ts
git commit -m "feat: expose automotive site intelligence"
```

### Task 8: Build the Audience Intelligence action surface

**Files:**
- Create: `app/composables/useSiteIntelligence.ts`
- Create: `app/pages/agency/analytics/audiences/intelligence.vue`
- Create: `app/components/analytics/audiences/intelligence/CoverageSummary.vue`
- Create: `app/components/analytics/audiences/intelligence/InsightFeed.vue`
- Create: `app/components/analytics/audiences/intelligence/OfferGapTable.vue`
- Create: `app/components/analytics/audiences/intelligence/ChangeFeed.vue`
- Create: `app/components/analytics/audiences/intelligence/RunDiagnostics.vue`
- Move: `app/pages/agency/analytics/audiences.vue` to `app/pages/agency/analytics/audiences/index.vue` so the sibling intelligence route renders independently
- Modify: the existing audience section navigation component selected during implementation
- Test: `test/app/siteIntelligencePage.test.ts`
- Test: `test/app/siteIntelligenceNavigation.test.ts`

**Interfaces:**
- Produces: route-backed `/agency/analytics/audiences/intelligence`, shareable client/date/lane filters, independent panel state, and direct evidence/diagnostic actions.

- [x] **Step 1: Re-read the frontend-design guidance before UI work**

Apply the same signal-led evidence hierarchy as the parent Audience Intelligence
design. The expressive device is a paired owned/competitor evidence rail; avoid a
gradient hero, decorative AI treatment, and an interchangeable card wall.
The project-referenced frontend-design path was unavailable in this environment,
so the installed frontend-ui-engineering guidance was applied as the supported
equivalent before form and page implementation.

- [x] **Step 2: Write failing page and navigation tests**

Assert route-backed tabs, query preservation, independent loading/empty/error
states, partial-data warning, no-data distinction, confidence and source labels,
before/after evidence, external source links, blocked-state language, admin-only
domain controls, and no competitor performance copy.

- [x] **Step 3: Run tests and observe missing UI**

```bash
pnpm vitest run test/app/siteIntelligencePage.test.ts test/app/siteIntelligenceNavigation.test.ts
```

Expected: FAIL.

- [x] **Step 4: Implement route state and progressive fetching**

`useSiteIntelligence` synchronises `clientId`, `from`, `to`, `lane`, and filter
query values. Fetch overview first, then changes and gaps independently. Abort
superseded requests and retain previous successful data during a lightweight
refresh.

- [x] **Step 5: Implement evidence-led panels**

Use Nuxt UI `UAlert`, `UBadge`, `UTable`, `UAccordion`, `UTooltip`, `UButton`, and
`USlideover`. Every insight shows deterministic/AI origin, confidence, evidence
count, observed time, and source link. Run diagnostics explain disallowed/blocked
states without offering circumvention.

- [x] **Step 6: Integrate governed domain management**

Open `DomainModal` and run diagnostics only for authorised roles. Manual Crawl is
a `UButton` that opens a confirmation `UModal`; never use `confirm()`. Refresh the
specific domain/run after mutation rather than reloading the page.

- [x] **Step 7: Run UI tests to green**

Run the Step 3 command. Expected: PASS.

- [x] **Step 8: Commit the user-facing slice**

```bash
git add app/composables/useSiteIntelligence.ts app/pages/agency/analytics/audiences/index.vue app/pages/agency/analytics/audiences/intelligence.vue app/components/analytics/audiences/intelligence test/app/siteIntelligencePage.test.ts test/app/siteIntelligenceNavigation.test.ts
git commit -m "feat: add automotive site intelligence dashboard"
```

### Task 9: Add scheduling, readiness, public copy, and the pilot runbook

**Files:**
- Create: `server/api/agency/site-intelligence/readiness.get.ts`
- Create: `server/api/cron/site-intelligence.post.ts`
- Create: `server/utils/siteIntelligence/crawlRunner.ts`
- Create: `server/utils/siteIntelligence/scheduler.ts`
- Modify: `server/api/agency/site-intelligence/domains/[id]/crawl.post.ts`
- Modify: `server/utils/agencyWorkflows/client.ts`
- Modify: `server/utils/siteIntelligence/audit.ts`
- Modify: `workers/agency-workflows/src/index.ts`
- Modify: `workers/agency-workflows/wrangler.toml`
- Modify: `workers/pages-cron/src/index.ts`
- Modify: `wrangler.toml`
- Modify: `app/pages/features/index.vue`
- Modify: `app/pages/features/[slug].vue`
- Create: `docs/runbooks/site-intelligence-pilot.md`
- Test: `test/server/api/siteIntelligenceReadiness.test.ts`
- Test: `test/server/api/siteIntelligenceCron.test.ts`
- Test: `test/server/utils/siteIntelligence/scheduler.test.ts`
- Test: `test/app/siteIntelligenceFeaturePage.test.ts`

**Interfaces:**
- Produces: due-domain scheduling, fail-closed readiness diagnostics, truthful marketing copy, and an explicit activation/rollback procedure.

- [x] **Step 1: Write failing cron, readiness, and feature-copy tests**

Readiness must report booleans for feature flag, workflow service, Browser API
configuration, R2, Queue, AI flag, and Vectorize without returning IDs or secrets.
Cron must select only active due domains, cap starts per invocation at 20, skip an
active run, and advance `next_run_at` deterministically. Public copy must say
“public competitor changes” and must not claim traffic estimation or automatic ad
activation.

- [x] **Step 2: Run tests and confirm failure**

```bash
pnpm vitest run test/server/api/siteIntelligenceReadiness.test.ts test/server/api/siteIntelligenceCron.test.ts test/app/siteIntelligenceFeaturePage.test.ts
```

Expected: FAIL.

- [x] **Step 3: Implement fail-closed readiness and due-domain scheduling**

Require existing admin analytics access for readiness and `x-cron-secret` for the
cron route. Select due rows with `FOR UPDATE SKIP LOCKED`, create runs using the
same service as manual crawling, and record per-domain success/failure without
failing the whole batch.

- [x] **Step 4: Wire the pages-cron trigger**

Add an hourly call to `/api/cron/site-intelligence`; the route itself determines
which domains are due. Keep `SITE_INTELLIGENCE_ENABLED=false` as the default in
production until the pilot runbook readiness gate passes.

- [x] **Step 5: Update public feature pages**

Add the capability beneath Analytics & Reporting and extend the existing Website
Audience Intelligence detail entry with four sections: owned context, public
competitor changes, evidence-backed gaps, and controlled AI interpretation. Do not
add a top-level mega-menu item unless the current menu enumerates analytics
subfeatures.

- [x] **Step 6: Write the exact pilot runbook**

Include creation of the private R2 bucket and lifecycle rules, the separate
Vectorize index and metadata indexes, Browser Rendering API token permission,
Worker secrets, `wrangler`/Pages binding verification, AI Gateway daily spend cap,
manual owned-domain smoke, manual competitor-domain smoke, 24-hour observation,
scheduled-crawl activation, pause switches, queue/DLQ monitoring, tenant deletion,
and rollback. All deployment commands must use repository scripts; never direct
`wrangler pages deploy` for the Pages app.

- [x] **Step 7: Run focused tests to green**

Run the Step 2 command. Expected: PASS.

- [x] **Step 8: Commit operational readiness**

```bash
git add server/api/agency/site-intelligence/readiness.get.ts server/api/cron/site-intelligence.post.ts server/api/agency/site-intelligence/domains/[id]/crawl.post.ts server/utils/siteIntelligence/crawlRunner.ts server/utils/siteIntelligence/scheduler.ts server/utils/siteIntelligence/audit.ts server/utils/agencyWorkflows/client.ts workers/agency-workflows/src/index.ts workers/agency-workflows/wrangler.toml workers/pages-cron/src/index.ts wrangler.toml app/pages/features/index.vue 'app/pages/features/[slug].vue' docs/runbooks/site-intelligence-pilot.md test/server/api/siteIntelligenceReadiness.test.ts test/server/api/siteIntelligenceCron.test.ts test/server/utils/siteIntelligence/scheduler.test.ts test/server/utils/agencyWorkflowsClient.test.ts test/workers/agencyWorkflowsSiteIntelligence.test.ts test/app/siteIntelligenceFeaturePage.test.ts
git commit -m "docs: prepare site intelligence pilot"
```

### Task 10: Battle-test the pilot and prepare activation

**Files:**
- Review every file changed by Tasks 1–9.
- Modify only files requiring an evidence-backed correction.

**Interfaces:**
- Produces: a locally verified, fail-closed pilot and explicit go/no-go evidence. No production activation occurs without user approval.

- [ ] **Step 1: Run the complete focused suite**

```bash
pnpm vitest run \
  test/config/automotiveSiteIntelligenceMigration.test.ts \
  test/server/utils/siteIntelligence \
  test/server/api/siteIntelligenceDomains.test.ts \
  test/server/api/siteIntelligenceCrawl.test.ts \
  test/server/api/siteIntelligenceIngest.test.ts \
  test/server/api/siteIntelligenceReadApi.test.ts \
  test/server/api/siteIntelligenceReadiness.test.ts \
  test/server/api/siteIntelligenceCron.test.ts \
  test/workers/agencyWorkflowsSiteIntelligence.test.ts \
  test/workers/siteIntelligenceWorkflowExecution.test.ts \
  test/app/siteIntelligenceDomainForm.test.ts \
  test/app/siteIntelligencePage.test.ts \
  test/app/siteIntelligenceNavigation.test.ts \
  test/app/siteIntelligenceFeaturePage.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run adjacent regressions**

```bash
pnpm vitest run \
  test/server/utils/tracking/audience-analytics.test.ts \
  test/server/utils/tracking/audience-access.test.ts \
  test/server/utils/tracking/audience-repository.test.ts \
  test/server/api/trackingAudienceAnalytics.test.ts \
  test/server/utils/aiModelRegistry.test.ts \
  test/public/track-tag.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run static and production verification**

```bash
pnpm run typecheck
pnpm run build
pnpm deploy:check
```

Expected: no new type errors in touched files, production build completes with the
repository heap configuration, and immutable Pages target check passes. Do not run
a deploy command.

- [ ] **Step 4: Perform the mandatory pre-commit deep review**

Re-read every modified file end-to-end. Verify server aliases, fixed SQL mappings,
scope-before-query, URL/SSRF policy, no secret/body logging, no empty select values,
reactive lane/purpose form behaviour, no duplicated UI, 6-character hex handling,
dark-mode semantics, R2 privacy, Queue idempotency, Content Signal handling, and
no competitor metric claims. Run `git diff --check` and inspect the exact staged
diff before any correction commit.

- [ ] **Step 5: Perform local browser validation**

Start the app with `pnpm dev -- --host 127.0.0.1 --port 3001`. Validate desktop and
mobile, light and dark modes, page scrolling, filter persistence, independent
loading failures, domain form keyboard operation, manual-run confirmation,
blocked-state copy, before/after evidence, source links, and no horizontal page
lock. Stop the server cleanly.

- [ ] **Step 6: Run a controlled non-production crawl smoke**

With a preview environment and test client, crawl one authorised owned domain and
one approved public competitor domain at `limit:10`, `depth:1`, `render:false`.
Verify Browser Run status, callback idempotency, private R2 objects, deterministic
facts, exactly-once material change rows, Queue retry safety, AI permission gate,
Vectorize tenant filtering, and UI evidence. Delete pilot records through the
tenant deletion path and confirm R2/vector cleanup.

- [ ] **Step 7: Commit only verified corrections**

```bash
git add app/components/analytics/audiences/intelligence app/pages/agency/analytics/audiences app/composables/useSiteIntelligence.ts server/api/agency/site-intelligence server/api/internal/workflows/site-intelligence server/api/cron/site-intelligence.post.ts server/utils/siteIntelligence server/utils/agencyWorkflows/siteIntelligenceCrawl.ts server/utils/queue.ts server/utils/queueConsumer.ts workers/agency-workflows workers/pages-cron wrangler.toml test docs/runbooks/site-intelligence-pilot.md
git commit -m "fix: harden automotive site intelligence pilot"
```

If no correction is needed, do not create an empty commit.

- [ ] **Step 8: Produce the activation handoff**

Report commit IDs, migration result, focused and adjacent test results, type/build
result, preview crawl evidence, current Cloudflare bindings, remaining worktree
changes, cost-cap configuration, and whether both feature flags remain false.
Request explicit approval before running `pnpm deploy:production` or enabling the
scheduled trigger.

---

## Checkpoints

### Checkpoint A — after Tasks 1–2

- [ ] Schema is additive and applied.
- [ ] Domain registry is tenant-safe and administrator-governed.
- [ ] URL policy rejects private/reserved/credential-bearing targets.
- [ ] Competitor defaults are public-only, search-only, and AI-off.

### Checkpoint B — after Tasks 3–5

- [ ] One approved domain completes Browser Run start, poll, pagination, ingestion, and terminal status.
- [ ] Replayed callbacks and Queue messages are idempotent.
- [ ] Raw content stays private in R2; Neon contains structured facts and short evidence only.
- [ ] Blocked/disallowed pages are surfaced and never bypassed.

### Checkpoint C — after Tasks 6–8

- [ ] AI and Vectorize remain tenant-scoped and fail closed.
- [ ] Owned audience context joins by page, not visitor identity.
- [ ] Competitor insights contain no fabricated performance metrics.
- [ ] Media buyers can act from evidence and diagnostics on a scrollable responsive page.

### Checkpoint D — after Tasks 9–10

- [ ] Scheduling is dormant until explicit activation.
- [ ] Readiness, cost caps, logging, retention, and rollback are documented and verified.
- [ ] Focused tests, adjacent regressions, build, browser review, and preview crawl pass.
- [ ] Production deployment and scheduled activation have separate explicit approval.

## Execution order

Tasks 1–5 are sequential because they establish the persistence and crawl data
path. After Task 5, Task 6 enrichment and the deterministic portion of Task 7 can
be implemented independently if their shared contracts are frozen. Task 8 depends
on Task 7 response contracts. Task 9 depends on the run service from Task 4. Task
10 is always last.
