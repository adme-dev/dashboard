# Neon Lakebase Search Pilot

**Date:** 2026-08-08

**Status:** Approved for implementation planning on 2026-08-08

**Implementation plan:** [2026-08-08-neon-lakebase-search-pilot.md](../plans/2026-08-08-neon-lakebase-search-pilot.md)

**Primary pilot surface:** CRM search (`/api/crm/search` and the CRM global search component)

**Infrastructure boundary:** Neon remains the relational system of record. Cloudflare Pages, Hyperdrive, Workers AI, AI Gateway, R2, and Vectorize remain in place.

## Goal

Determine whether Neon Lakebase Search improves the relevance, latency, tenancy safety, and operational simplicity of XeroFlow's relational search without replacing Cloudflare Vectorize or changing production search before evidence supports it.

The first implementation is a guarded CRM pilot in a separate non-production Neon project. It compares Lakebase BM25 with the existing Postgres GIN/`ts_rank` implementation, returns existing results by default, and creates the evidence needed to decide whether to proceed to Postgres-native hybrid search.

## Current state

XeroFlow currently has two materially different search paths:

1. `server/utils/crm/search.ts` builds a parameterised, client-scoped union across people, companies, opportunities, activities, and CRM tasks. Migration 152 supplies matching GIN indexes and the endpoint returns a stable `CrmSearchHit` contract.
2. `server/api/agency/search/semantic.get.ts` combines Cloudflare Vectorize with broad `ILIKE` queries across tasks, briefs, and clients. That endpoint has a wider authorization and data-modelling problem and is not an appropriate first Lakebase target.

The Graphify project map confirms that Cloudflare Vectorize is already shared by AI memory, knowledge, financial context, tasks, briefs, clients, and recommendations. Replacing it would create broad regression and re-indexing risk. This pilot therefore treats Vectorize as an existing production dependency, not a migration source.

## Research constraints

Current Neon documentation establishes the following requirements:

- Lakebase Search requires Postgres 16 or later.
- `lakebase_vector` and `lakebase_text` must be present in `shared_preload_libraries`; changing the preload list may require a compute restart.
- BM25 uses a `lakebase_bm25` index over `tsvector`. Its score is negative, so more relevant results sort ascending.
- BM25 corpus statistics are established when the index is built and refreshed by `VACUUM`; a large bulk load should be followed by a manual vacuum.
- `lakebase_vector` retains pgvector-compatible vector types and distance operators and adds the `lakebase_ann` index method.
- Hybrid fusion is application SQL, not a built-in function. Neon's documented example uses Reciprocal Rank Fusion (RRF).
- Session-level Lakebase tuning must execute in the same transaction as the query when a serverless or pooled connection may change sessions.

Primary references:

- [Lakebase Search overview](https://neon.com/docs/ai/lakebase-search)
- [Lakebase Search quickstart](https://neon.com/docs/ai/lakebase-search-get-started)
- [lakebase_vector reference](https://neon.com/docs/extensions/lakebase-vector)
- [lakebase_text reference](https://neon.com/docs/extensions/lakebase-text)
- [CommSync implementation case study](https://neon.com/blog/commsync-runs-text-vector-and-hybrid-search-on-postgres-with-lakebase-search)

## Alternatives considered

### 1. CRM BM25 shadow pilot in a separate Neon project, then qualified hybrid expansion — selected

Add a search projection in a dedicated non-production Neon project, compare Lakebase BM25 with the current client-scoped CRM query, and keep the current results authoritative until explicit acceptance gates pass. If BM25 succeeds, add 768-dimensional embeddings and RRF in a second slice.

This produces useful evidence quickly, preserves the existing API contract, and does not require duplicating all Cloudflare Vectorize content on day one.

### 2. Build complete Postgres hybrid search immediately

Create a durable projection, embed every CRM entity, build BM25 and ANN indexes, and switch the endpoint to RRF in one release.

This would test the complete article pattern sooner, but it combines extension enablement, projection consistency, embedding generation, ranking, and product rollout. A failure would be difficult to attribute and rollback would be broader.

### 3. Replace Cloudflare Vectorize platform-wide

Move knowledge, memory, crawled content, and all operational embeddings into Neon.

This is rejected. XeroFlow's current Vectorize index is integrated with Cloudflare execution, metadata filtering, R2-backed knowledge, and multiple AI retrieval paths. The article does not establish that a wholesale replacement would improve those workloads.

## Scope

### Included in the first implementation plan

- Capability and safety preflight for a dedicated non-production Neon project.
- Project-level Lakebase enablement instructions and guarded automation.
- A pilot-only CRM search projection populated from synthetic fixtures and, only when separately approved, a de-identified source export.
- Lakebase BM25 query generation with mandatory `client_id` filtering.
- Existing GIN search retained as the control and automatic fallback.
- A deterministic, PII-free relevance fixture set.
- Benchmark reporting for relevance, latency, failure rate, and result overlap.
- A feature-mode contract that defaults to `off` and cannot activate production by accident.
- Documentation of evidence and a go/no-go decision for the hybrid slice.

### Deferred until BM25 passes

- A `vector(768)` column using the existing Workers AI `bge-base-en-v1.5` embedding dimension.
- Cloudflare AI Gateway/Workers AI embedding generation for the pilot projection.
- `lakebase_ann` cosine indexing.
- Weighted RRF combining BM25 and semantic ranks.
- User-facing command-palette integration.
- Durable write-through or change-data-capture maintenance of the projection.

### Explicitly excluded

- Removing or reconfiguring Cloudflare Vectorize.
- Migrating AI memory, knowledge articles, financial embeddings, Site Intelligence, or R2 content.
- Changing `/api/agency/search/semantic` during the pilot.
- Enabling Lakebase preloads or extensions on the production Neon project.
- Applying a production database migration.
- Deploying or changing Cloudflare Pages configuration.
- Storing raw user search queries in telemetry.

## Pilot data model

The pilot uses a dedicated schema in a separate non-production Neon project, not a branch of the production project and not a normal production migration:

```sql
CREATE SCHEMA IF NOT EXISTS lakebase_pilot;

CREATE TABLE lakebase_pilot.crm_search_documents (
  client_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  body TEXT NOT NULL,
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', title || ' ' || COALESCE(subtitle, '') || ' ' || body)
  ) STORED,
  source_updated_at TIMESTAMPTZ,
  content_hash TEXT NOT NULL,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, entity_type, entity_id)
);
```

The projection creates one uniform searchable document per source entity. It allows a single BM25 corpus and stable ranking across entity types while keeping tenancy in the primary key and every query predicate.

The setup script populates the table before creating the BM25 index because Lakebase derives corpus statistics at index-build time. The setup finishes with `VACUUM ANALYZE`.

No trigger or application write-through is added in the first slice. The projection is a reproducible experiment rebuilt from synthetic fixtures or an approved de-identified export. Production consistency is designed only after the pilot passes.

## Safety model

Lakebase preload libraries are Neon project settings, not branch-local settings. A copy-on-write branch inside the production project is therefore not an acceptable first-pilot isolation boundary.

All control-plane and database mutation commands require `LAKEBASE_PILOT_PROJECT_ID`, `LAKEBASE_PILOT_ENDPOINT_ID`, and `LAKEBASE_PILOT_DATABASE_URL`. Control-plane automation additionally requires either an authenticated Neon CLI session or a scoped `NEON_API_KEY`; credentials are never logged. Commands must refuse to run when:

- any required variable is missing;
- the pilot project ID matches `NEON_PRODUCTION_PROJECT_ID`;
- `LAKEBASE_PILOT_DATABASE_URL` exactly matches `DATABASE_URL`;
- an explicit `LAKEBASE_PILOT_CONFIRM_NON_PRODUCTION_PROJECT=1` acknowledgement is absent; or
- a caller attempts a production or non-pilot search mode.

The control-plane enablement command first verifies the project and endpoint identities through the Neon API, preserves the existing preload list, enables only the two Lakebase libraries, and restarts only the pilot endpoint when required. It never targets the production project or endpoint.

The database setup command additionally refuses to run when Postgres is earlier than version 16, the two Lakebase preload libraries are not active, or the database does not expose both extensions as available.

The preflight command is read-only. It reports server version, redacted project and endpoint identities, preload status, extension availability, installed status, row counts, and whether the pilot schema already exists. It never prints credentials or a full connection string.

The default application mode is `off`:

| Mode | Behaviour |
|---|---|
| `off` | Existing CRM GIN search only. |
| `shadow` | Return existing results; run BM25 best-effort and record aggregate comparison metrics. |
| `bm25` | Return BM25 results; automatically fall back to existing GIN search on unavailability or query failure. Pilot project only. |
| `hybrid` | Reserved and rejected by configuration until the second slice is implemented and approved. |

Raw query text is never written to logs or metrics. A one-way query fingerprint may correlate the two result sets within an evaluation run. Result identifiers in reports are fixture IDs or one-way hashes.

## Query contract

The Lakebase query must preserve the current `CrmSearchHit` response shape:

```ts
interface CrmSearchHit {
  type: 'person' | 'company' | 'opportunity' | 'activity' | 'task'
  id: string
  title: string
  subtitle: string | null
  rank: number
}
```

Every SQL arm must be parameterised and must constrain `client_id` inside the indexed candidate query. Filtering after retrieval is forbidden. Soft-deleted source records are excluded when the projection is built.

BM25's negative raw score is converted to an internal monotonic relevance value before returning it as `rank`, so the public contract continues to sort higher relevance first. The conversion is tested but consumers must not treat rank magnitudes from the two engines as directly comparable.

## Data flow

```text
Dedicated non-production Neon project
        │
        ├── existing CRM tables ──► reproducible projection build
        │                                  │
        │                                  ▼
        │                       lakebase_pilot.crm_search_documents
        │                                  │
        ├── legacy GIN query ───────────────┼──► comparison harness
        │                                  │
        └── Lakebase BM25 query ────────────┘            │
                                                        ▼
                                            JSON/Markdown evidence report

Production request path remains unchanged while mode = off.
```

## Evaluation

### Dataset

Create a checked-in fixture containing synthetic CRM records and expected relevance judgements. It covers:

- exact names, email fragments, domains, and opportunity titles;
- multi-word queries and quoted phrases;
- abbreviations and punctuation;
- terms shared by multiple entity types;
- no-result and stop-word-heavy queries;
- two clients with deliberately overlapping text to prove isolation; and
- soft-deleted records that must never appear.

A second optional evaluation may run against an approved de-identified export imported into the pilot project. The export is never committed, and its output contains aggregate metrics only.

### Metrics

- Precision@5 and Recall@10 against the fixture judgements.
- Mean Reciprocal Rank.
- p50, p95, and maximum warm latency.
- first-query latency after compute wake.
- failure and fallback counts.
- overlap and ordering differences versus the legacy result set.
- cross-client leakage count, which must remain zero.

### BM25 acceptance gates

The BM25 slice may advance only when:

- cross-client and soft-delete leakage are both zero;
- all fallback and missing-extension tests pass;
- Precision@5 is no worse than the legacy baseline;
- Mean Reciprocal Rank improves by at least 10% on the agreed fixture, or p95 latency improves by at least 30% without a relevance regression;
- warm p95 is within the endpoint's agreed interactive-search budget;
- cold-start behaviour is documented and acceptable; and
- index build, vacuum, pilot-project branching, branch restore, and branch deletion have been exercised.

These are project gates, not claims inferred from CommSync's results.

### Hybrid acceptance gates

The hybrid slice requires a separately reviewed plan. At minimum it must demonstrate:

- the same zero-leakage boundary;
- a stable embedding model and dimension contract;
- idempotent content-hash-based embedding updates;
- RRF quality better than both BM25-only and semantic-only baselines;
- bounded AI Gateway embedding cost; and
- no regression to Cloudflare Vectorize-backed features.

## Failure handling and rollback

- Extension or preload unavailable: preflight fails with remediation; application mode remains `off`.
- BM25 query failure in `shadow`: log a redacted counter and return legacy results.
- BM25 query failure in `bm25`: return legacy results and emit an operational warning.
- Projection drift during the pilot: rebuild the projection; do not patch individual rows.
- Relevance gate fails: archive the report, delete the isolated pilot project after evidence retention, and retain the current architecture.
- Operational risk appears: set mode to `off`; no database rollback is required for production because the pilot schema never reaches production.

## Testing strategy

- Pure unit tests for mode parsing, score normalization, query construction, client scoping, and result mapping.
- SQL contract tests that verify every candidate query includes `client_id` before ranking and contains no raw interpolation.
- Capability-probe tests for PG version, preloads, extension availability, redaction, and production-URL refusal.
- Integration tests on the isolated Neon project for setup, populate, index, query, vacuum, fallback, and teardown.
- Fixture evaluation for both legacy and BM25 engines.
- Existing CRM search and AI Vectorize suites as regression gates.
- `git diff --check`, targeted lint, typecheck review, and the repository's pre-commit deep-dive review before any implementation commit.

## Delivery slices

### Slice 0 — Capability proof

- Add read-only preflight and redacted reporting.
- Confirm PG16+, preload availability, extension availability, and non-production project identity.
- Record evidence without mutating the database.

### Slice 1 — BM25 experiment

- Add pilot-project-only setup/teardown SQL and guarded runners.
- Build the CRM projection and BM25 index.
- Add the Lakebase repository/query builder and deterministic fixture evaluation.
- Run legacy-versus-BM25 benchmarks and publish the report.
- Make the go/no-go decision.

### Slice 2 — Hybrid experiment, only after approval

- Add the embedding column and model-version contract.
- Route embedding calls through the existing Cloudflare AI Gateway/Workers AI policy.
- Build `lakebase_ann`, semantic-only retrieval, and weighted RRF.
- Re-run the full relevance, isolation, latency, and cost evaluation.

### Slice 3 — Production design, only after both experiments pass

- Decide projection maintenance, backfill, observability, and production migration strategy.
- Harden agency-side client authorization before expanding beyond CRM.
- Add a controlled production shadow rollout and public documentation updates.

## Documentation boundary

The pilot does not update public feature pages because it creates no customer-visible production capability. If a later production slice ships, update:

- `app/pages/features/index.vue`;
- `app/pages/features/[slug].vue`;
- `app/pages/platform/ai.vue`;
- `app/pages/resources/integrations.vue`; and
- `app/pages/resources/ai-automation.vue`.

Those pages must describe the hybrid Neon/Cloudflare architecture accurately rather than implying that Vectorize was removed.

## Completion definition

The pilot is complete when the isolated-project capability proof and BM25 evaluation have reproducible reports, all safety and leakage tests pass, the result is reviewed against the acceptance gates, and a documented decision either authorizes the hybrid slice or closes the experiment without production change.
