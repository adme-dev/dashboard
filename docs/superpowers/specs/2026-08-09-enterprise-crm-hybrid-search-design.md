# Enterprise CRM Hybrid Search

**Date:** 2026-08-09

**Status:** Conversational design approved on 2026-08-09; awaiting written-spec review

**Primary production surface:** Agency AI CRM retrieval

**Visible search contract:** Existing agency and portal CRM search remains deterministic keyword search until a later evidence-based rollout explicitly changes it

**Infrastructure boundary:** Neon Postgres remains the source of truth. Workers AI generates embeddings. A dedicated Cloudflare Vectorize index stores CRM vectors. A dedicated Cloudflare Queue carries identifier-only indexing wake-ups.

## Goal

Build an enterprise-safe CRM retrieval domain for XeroFlow Agency that can add semantic recall without weakening authorization, tenancy, privacy, reliability, cost control, or operational evidence.

The implementation must:

- harden agency and portal CRM search authorization;
- derive organisation, client, actor, and permission scope on the server;
- preserve Postgres keyword search as the reliable default;
- use Vectorize only as a semantic candidate generator;
- reauthorize every semantic candidate against current Postgres state;
- maintain vectors through a durable, versioned, retryable indexing pipeline;
- support `off`, `shadow`, and narrowly scoped `assist` modes;
- avoid storing raw queries or unrestricted CRM text in telemetry or vector metadata;
- bound latency and Workers AI cost;
- retire the unsafe unused semantic endpoint;
- correct public claims that overstate current semantic-search coverage; and
- produce sufficient tests, telemetry, runbooks, and evaluation evidence for a later production rollout decision.

Production deployment and semantic activation are excluded until implementation verification is complete and the user explicitly approves deployment.

## Enterprise interpretation

The current application is a single-agency system with client-level isolation. Core staff and CRM tables do not yet have a first-class owning organisation or agency foreign key. Several unrelated integrations use `tenant_id` for provider-specific concepts, so reusing that name would create a false and unsafe tenancy model.

This design introduces an honest search-domain organisation boundary:

- a server-owned singleton search organisation scope represents the current installation;
- every CRM search policy, dirty-source row, provider operation, document ledger row, telemetry event, audit event, namespace, and query context carries that scope;
- every CRM retrieval also carries a mandatory `client_id`;
- no caller may submit or override the organisation scope;
- the abstraction can later map to a first-class organisation table without changing the retrieval contract; and
- the implementation does not claim the rest of the product is already multi-agency.

This is an enterprise search boundary now and a migration seam for true multi-agency tenancy later.

## Current-state findings

### Safe foundation

`server/utils/crm/search.ts` already builds parameterised Postgres full-text queries across people, companies, opportunities, activities, and CRM tasks. Every SQL arm includes `client_id` and `deleted_at IS NULL`, and migration 152 provides matching GIN indexes.

This deterministic search remains the control path and availability fallback.

### Authorization gaps

- `server/api/crm/search.get.ts` authenticates a staff user but accepts a caller-selected `client_id` without enforcing the `CLIENTS` permission, canonical active-client resolution, or record-visibility policy.
- `server/api/client-portal/crm/search.get.ts` derives the client from the portal session and is currently covered by the route-wide `04-client-crm-access.ts` middleware, but the handler itself calls only `requireClientAuth`. The handler should use the stronger CRM view guard directly so its security contract remains local and testable even if middleware ordering changes.
- Staff search does not currently apply the owner-scoped record visibility used by the CRM list routes. Several direct CRM detail and mutation routes also fetch a caller-supplied record ID without that predicate, so hardening search alone would leave a known-ID bypass of the same enterprise visibility boundary.
- The AI `search_crm` tool declares `CLIENTS`, but its downstream HTTP route must enforce the same permission independently.
- The clean production base already exempts `/api/client-portal/crm/*` from staff authentication and applies `requireClientCrmAccess` in `04-client-crm-access.ts`. This boundary must be preserved with a contract test; a broad new `/api/client-portal/*` exemption is not required by this project.

### Unsafe legacy semantic path

`server/api/agency/search/semantic.get.ts`:

- requires authentication but no client or CRM permission;
- queries the shared Vectorize index without a tenant filter;
- trusts vector metadata as result content;
- runs globally unscoped keyword SQL across tasks, briefs, and clients;
- mixes incomparable semantic and fixed keyword scores; and
- has no repository callers or focused tests.

It must be deleted. No redirect or compatibility alias will preserve its unsafe behavior.

### Shared vector and queue limitations

The existing `VECTORIZE` binding points to the shared `agency-search` index. A read-only Cloudflare inspection on 2026-08-09 found:

- 768 dimensions;
- 17 vectors; and
- no metadata indexes.

Existing task, brief, and client vectors lack a universal organisation/client/schema contract. Existing helpers can return raw metadata and swallow provider failures. The legacy `embed.*` job types have no discovered producers, depend on a request event that is not serialized through the queue bridge, and share a consumer intentionally throttled for Meta spend synchronization.

CRM search must not reuse this index or queue path.

### Distributed CRM writes

People, companies, and opportunities are mutated through ordinary agency and portal routes plus imports, bulk operations, dedupe, lead promotion, assignment, lifecycle automation, opportunity stage transitions, quote linking, line-item rollups, and dormancy jobs. Route-by-route indexing hooks would inevitably miss valid writes.

Database triggers are therefore the authoritative bounded dirty-source capture mechanism.

## Alternatives considered

### 1. Harden only the existing keyword route

This is necessary but insufficient. It fixes immediate authorization gaps but leaves natural-language assistant retrieval, indexing durability, rollout evidence, and current marketing inaccuracies unresolved.

### 2. Migrate the whole application to first-class multi-agency tenancy first

This is the cleanest eventual platform architecture, but it is too broad to make search safe now. It would require an application-wide identity, schema, authorization, and data migration before delivering any retrieval improvement.

### 3. Add semantic results directly to visible global search

This creates avoidable relevance, latency, privacy, and operational risk before quality has been measured. It is rejected.

### 4. Reuse the shared Vectorize index and `agency-jobs` queue

This would mix incompatible document schemas, preserve unscoped legacy vectors, consume scarce metadata-index capacity, and couple CRM indexing to a consumer deliberately throttled for unrelated work. It is rejected.

### 5. Enterprise search tenancy boundary with a dedicated CRM index and queue — selected

This approach hardens the current product, isolates CRM retrieval infrastructure, provides a future organisation seam, and permits evidence-driven semantic rollout without pretending the whole application has already completed a multi-agency migration.

## Architecture

```text
Authenticated agency or portal request
                │
                ▼
Server-built SearchContext
(organisation, client, actor, permissions, visibility, surface)
                │
                ▼
CRM retrieval coordinator
   ├── Postgres keyword retrieval ─────────────────────┐
   │                                                   │
   └── optional Workers AI query embedding             │
              │                                        │
              ▼                                        │
      dedicated CRM Vectorize namespace                │
              │ candidate vector IDs only              │
              ▼                                        │
      Postgres document-ledger lookup                   │
              │                                        │
              ▼                                        │
      authoritative CRM row join-back                  │
      (scope, client, permissions, visibility,          │
       deletion, type, revision rechecked)              │
              │                                        │
              └──── optional RRF in assist mode ───────┘
                                      │
                                      ▼
                              stable CRM result contract
```

Postgres is authoritative at every stage. A vector match is a hint to look up a row, never evidence that the actor may view it.

## Search context and authorization

Introduce a shared `SearchContext` resolved before either retrieval engine runs:

```ts
interface CrmSearchContext {
  organisationScopeId: string
  clientId: string
  actorType: 'staff' | 'portal'
  actorId: string
  surface: 'agency_global' | 'portal_global' | 'agency_ai'
  permissionSet: ReadonlySet<string>
  visibility: {
    ownerScoped: boolean
  }
  assistantScope?: {
    clientIds: readonly string[]
    sourceRevision: string
  }
}
```

The concrete type may use serializable arrays rather than a `Set`, but these semantics are mandatory.

### Agency resolution

1. Authenticate the staff session.
2. Require the `CLIENTS` permission through the same dynamic permission resolver used elsewhere in the product.
3. Treat the submitted client ID only as a selector.
4. Resolve the selected client from authoritative active-client records.
5. Apply the product's canonical staff-to-client access policy in one shared resolver. For visible agency search, `CLIENTS` permission currently grants access to active clients; this feature does not silently reinterpret `client_team_assignments` as a new global UI ACL.
6. Derive owner-scoped record visibility using the existing CRM query-scope rules.
7. Load the server-owned organisation search scope.
8. Return a canonical `SearchContext` or fail before keyword, Workers AI, or Vectorize calls.

An inaccessible or nonexistent client must not leak whether the record exists. Both conditions run through the same resolver and return the exact same public response: HTTP `404` with `statusMessage: 'Client not found'`. No keyword, policy, budget, Workers AI, or Vectorize call occurs after either denial. Contract tests assert the same status and response shape; operational logs may record only the actor, correlation ID, and a classified denial reason, never the requested client name or other CRM content.

The search authorization decision does not rely on the existing five-minute session/role cache. Before keyword execution, the resolver uses the fresh direct-Neon path to revalidate actor active state, current role/`CLIENTS` permission, active client, client access, owner-scope policy, and the resulting allowed client set. The semantic join-back repeats that authoritative check and rejects the entire semantic branch if it has changed. Portal resolution equivalently fresh-checks session/user active state, active client, current entitlement, and CRM view permission. Revocation therefore takes effect on the next search operation rather than inheriting a cache window.

### Portal resolution

1. Authenticate the portal session.
2. Derive `clientId` only from that session.
3. Reload the owning agency client and require `is_active = true`; a session for a deactivated client fails closed.
4. Use the stronger client CRM access guard.
5. Require a currently supported CRM mode (`lightweight_crm` or `full_crm`), the `crm.core` entitlement, and the CRM view permission.
6. Ignore or reject any caller-supplied client or organisation scope.
7. Load the same server-owned organisation search scope.
8. Keep portal-visible retrieval keyword-only in this release.

Client deactivation revokes its portal sessions in the same application transaction and the search guard still rechecks active-client state on every request, covering pre-existing or concurrently stale sessions.

The existing `/api/client-portal/crm/*` staff-auth exemption and route-wide CRM access middleware remain in place. A static route-boundary test protects that pairing, while the search handler adds its own explicit `requireClientCrmAccess(event, 'view')` call for defense in depth.

The current route-wide action classifier treats generic `POST` as CRM `edit`. Because search moves from GET to a JSON POST for query privacy, the classifier adds one exact read-only exception for `POST /api/client-portal/crm/search` and still classifies every other portal CRM POST as `edit`. Tests bind the exact method/path to `view` and prove that near-match or nested mutation routes cannot inherit the exception.

### AI tool resolution

The agency AI tool may request `assist`, but it does not bypass authorization. It stops making an internal HTTP call to the public CRM search route and instead calls the shared retrieval service with the authenticated tool context.

The AI surface is deliberately narrower than visible agency search:

- non-management actors are limited to the current server-resolved assistant client assignment scope;
- the resolver re-reads current assignments rather than trusting client IDs cached in a prompt or tool argument;
- the canonical active-client set, `CLIENTS` permission, and assistant scope are intersected;
- absent or stale assistant scope fails closed for `agency_ai` retrieval, including MCP and non-chat tool callers; and
- management actors still receive an explicit server-derived assistant scope rather than an implicit all-client bypass.

Client-name resolution performs normalized exact matching first. A partial name is accepted only when it has exactly one authorized match. Zero or multiple matches return a structured non-disclosing resolution result so the assistant can ask for clarification; it must never select the first `ILIKE` row. No header or request parameter can impersonate the `agency_ai` surface.

## Dedicated Vectorize contract

Provision a new index named `agency-crm-search` with:

- 768 dimensions;
- cosine similarity;
- one namespace per organisation/client pair;
- an indexed `entityType` string property;
- an indexed `schemaVersion` string property; and
- no source text in metadata.

Use a dedicated Pages binding such as `CRM_SEARCH_VECTORIZE`. The existing `VECTORIZE` binding remains untouched for knowledge, memory, and other legacy consumers.

The provider contract is pinned to the current Cloudflare limits documentation rechecked through the official Cloudflare documentation MCP on 2026-08-09: a Vectorize index supports 20,000,000 vectors, namespace identifiers are limited to 64 bytes, and the Workers Paid namespace limit is 50,000. Production readiness requires Workers Paid, obtains the current account limits or operator-supplied lower caps, and fails closed if it cannot prove capacity. It independently forecasts namespace count and total vectors across active, candidate, retiring, sentinel, and deletion-pending inventory. No policy/backfill may be approved when either forecast reaches 80% of its proven cap. The namespace ceiling alone therefore requires a sharding decision before 40,000 client namespaces, while the vector forecast may force partitioning much earlier; the design does not claim unbounded client tenancy.

### Namespace

The namespace is a versioned SHA-256-derived base64url value over the server-owned organisation scope and canonical client ID. It must be deterministic, opaque, and no longer than Vectorize's 64-byte limit. Namespace allocation is registered transactionally in Postgres and checked for collisions before indexing is enabled.

Namespace partitioning is the primary vector retrieval boundary. Metadata filters are defense in depth and retrieval-quality controls, not substitutes for Postgres authorization.

### Vector identity

Vector IDs are deterministic base64url SHA-256 digests over organisation scope, client, schema version, entity type, and entity ID and remain within Vectorize's 64-byte ID limit. The Postgres document ledger maps vector IDs back to authoritative entity identities. The query path does not parse or trust vector metadata.

Including the schema version permits blue/green embedding migrations. The policy stores an `active_schema_version` and optional `candidate_schema_version`. Candidate documents are backfilled and provider-confirmed while the active schema continues serving. A revision-checked policy transition atomically promotes the candidate only after readiness and evaluation gates pass. Deletes fan out across every active, candidate, and retiring schema for that entity. Retiring vectors are removed only after the replacement schema is active and deletion has been confirmed.

Live-write cutover is fenced per client. Source-capture/operation processors take a shared transaction advisory lock for that client before reading schema role or issuing a provider mutation; promotion takes the exclusive form. Under that exclusive lock, promotion verifies there is no provider-pending work through the captured source high-watermark and every current source revision is confirmed in the candidate, then atomically swaps active/candidate roles. Writes waiting on the lock commit afterward as schema-neutral dirty intent and expand against the new active schema. Pending upserts for a schema that has become retiring are superseded; only deletes may target retiring schemas. A new candidate migration cannot start until every prior retiring schema is delete-confirmed.

Metadata-index creation is also asynchronous. Readiness polls `list-metadata-index` until both exact string definitions are complete, then inserts a non-CRM sentinel vector, confirms it, proves an `entityType` + `schemaVersion` filtered query can retrieve it, deletes it, and confirms absence. No CRM vector upsert or backfill may begin before that sentinel gate passes.

### Embedding schema

The first schema indexes:

- people;
- companies; and
- opportunities.

Activities and tasks remain keyword-searchable until a separate privacy and permission review approves their free-text fields.

The embedding model contract is `@cf/baai/bge-base-en-v1.5`, 768 dimensions, explicit `cls` pooling, a pinned compatible tokenizer revision, and a versioned document-builder revision. Cloudflare documents a 512-token input limit and currently prices this model at USD $0.067 per million input tokens. Model, tokenizer, pooling, field allowlist, normalization, truncation, schema version, and the recorded provider-price revision together form the operational contract. Changing any embedding component requires a new schema version and controlled blue/green reindex; changing only price creates a new cost-policy revision.

Vector metadata contains routing data only:

```ts
{
  entityType: 'person' | 'company' | 'opportunity',
  schemaVersion: 'crm-search-v1',
  sourceRevision: 4,
  confirmationTag: 'hmac-sha256:...',
  confirmationKeyVersion: 'k1'
}
```

Only `entityType` and `schemaVersion` are metadata indexes. `sourceRevision`, `confirmationTag`, and `confirmationKeyVersion` are non-indexed confirmation fields used only by `getByIds`; normal queries request no vector values and no metadata. The tag is an HMAC over organisation, client, vector ID, schema, revision, and the Postgres-held content hash using a dedicated rotatable key. A plain content hash is not placed in Vectorize metadata because short CRM fields are vulnerable to dictionary guessing.

### Approved source fields

Document builders use these exact v1 allowlists and no relationship-derived fields:

| Entity | Included source columns | Transformation |
|---|---|---|
| Person | `first_name`, `last_name`, `job_title`, `department`, `lifecycle_stage` | NFKC normalize, strip C0/C1 controls, collapse whitespace, omit null/blank fields; names max 200 characters each, other fields max 160. |
| Company | `name`, `domain`, `lifecycle_stage` | Same text normalization; name max 240, lifecycle max 160, domain lower-cased and bounded to 253 characters. |
| Opportunity | `name`, `status`, `source` | Same text normalization; name max 300, status/source max 160 each. |

The canonical document uses fixed field labels and ordering and is first capped at 1,000 Unicode code points, then encoded with the pinned tokenizer and deterministically truncated by field priority to fit the provider's 512-token limit including special tokens. No call relies on undocumented provider truncation. SQL projection-hash functions and TypeScript document builders share golden fixtures proving byte-equivalent canonical pre-tokenizer output; separate TypeScript/provider-input fixtures prove deterministic truncation and token-bound conformance.

V1 explicitly excludes relationship-derived company, person, and stage names. A later schema may add them only with client-qualified joins, dependency triggers, and tests proving that relationship changes enqueue every affected document.

The initial embedding projection also excludes:

- email addresses;
- phone numbers;
- postal addresses;
- unrestricted notes;
- activity bodies;
- credentials, tokens, or integration data;
- custom fields until individually classified; and
- any field not named in a tested allowlist.

Keyword search may continue matching existing fields such as email because that retrieval remains inside Postgres and the current authorization boundary.

## Query behavior

### Input contract

- Normalize with NFKC, strip C0/C1 controls and bidi-override controls, collapse Unicode whitespace, and trim before any classification or bounds check.
- Reject blank input.
- Accept search input only through JSON `POST` endpoints so raw queries do not enter URL histories or URL-based edge/access logs. Delete the repository's GET search handlers after all in-repository callers migrate.
- Bound the normalized query to 256 Unicode code points and result count to 1–50 with a Zod schema. The AI tool's normalized client-name selector is separately capped at 160 code points.
- Tokenize semantic-eligible queries with the schema's pinned tokenizer before provider admission; a query that would exceed the model's 512-token contract remains keyword-only.
- Run one versioned, adversarially tested privacy classifier on that exact normalized form. Email addresses, phone-like values, UUIDs, high-entropy identifiers, full-width/obfuscated variants, and mixed-script forms classified as identifiers remain keyword-only and are never sent to Workers AI.
- Do not accept mode, namespace, organisation, model, filter, or provider settings from callers.
- Parameterize every SQL query.
- Apply a per-actor rate guard plus atomic global and per-client cost reservations before semantic work.

### Mode resolution

Modes are ordered:

```text
off < shadow < assist
```

The effective mode is the most restrictive of:

- the authoritative global control;
- the global maximum mode;
- the per-client policy;
- the requesting surface; and
- infrastructure and secret readiness.

Unknown, malformed, or missing configuration resolves to `off`.

Policy changes use a constrained state machine rather than arbitrary mode writes:

```text
off -> indexing -> shadow -> assist
 ^        |          |         |
 └────────┴──────────┴─────────┘  emergency or operator downgrade
 any state -> teardown_pending -> off only after confirmed provider deletion
```

`assist` is legal only for the `agency_ai` surface and only after an approved evaluation run is attached. Administrative transitions require `ADMIN`, a reason, expected policy revision, environment, deployed Git SHA, evidence-bundle hash, and server timestamp. The database rejects skipped promotion states, stale revisions, missing evidence, and surface ceilings. Every transition is append-only audited. Policy downgrade and a global-control transition to `halted` remain one-step operations.

`teardown_pending` denies all queries/upserts and permits only schema-complete deletion work. Reactivating a client requires completed teardown, a new `off` policy revision, and a fresh index; old vectors are never reused.

Surface ceilings are fixed in code:

| Surface | Maximum semantic mode |
|---|---|
| `portal_global` | `off` — portal queries are never embedded or sent to Workers AI in this release. |
| `agency_global` | `shadow` — visible results remain keyword-only. |
| `agency_ai` | `assist` — only after assistant-scope authorization and rollout gates. |

| Mode | Behavior |
|---|---|
| `off` | Postgres keyword retrieval only; no query embedding or Vectorize call. |
| `shadow` | Return exactly the keyword result list; optionally sample semantic retrieval after response and record privacy-safe comparison evidence. |
| `assist` | Agency AI CRM retrieval may combine authorized keyword and semantic candidates with deterministic Reciprocal Rank Fusion. Visible agency global search and all portal search still return keyword ranking. |

The global control stops query embeddings and indexing wake-ups while continuing to update the bounded durable dirty set. The query coordinator fresh-reads global control/effective policy immediately before both the Workers AI embedding and the later Vectorize query; if state becomes more restrictive between them, it settles/releases reservations and returns keyword results. Publishers and processors likewise fresh-read immediately before every Vectorize upsert/delete call. Each provider work unit is admitted in a transaction that locks the global-control row and stamps its control revision into the usage reservation or provider operation before the external call. A halt/delete-only transition locks and increments that same row, so no later admission can use the prior revision. A transition cannot cancel a work unit already admitted or sent; those bounded admissions remain visible until settled, any disallowed completion is ignored/settled, and operational evidence distinguishes transition request time from drain completion. Claimed operations return to a resumable state rather than being acknowledged as complete. A separate indexing-readiness flag allows resources to be prepared and backfilled while query mode remains `off`.

Sampled shadow work is capped at 10% of otherwise eligible agency-global queries and registered with the Cloudflare request's `waitUntil` lifecycle so it cannot delay the visible keyword response. Workers AI and Vectorize bindings are captured synchronously before the response; background code does not reach back into expired request context. The normalized query exists only in request memory and is never placed on a queue or persisted.

### Keyword retrieval

The existing query builder is extended to consume the canonical context and enforce:

- organisation/client selection through authoritative context;
- soft-delete exclusion;
- canonical staff or portal client access; and
- current owner-scoped record visibility.

The response contract remains compatible with `CrmSearchHit`.

Owner visibility becomes a shared CRM authorization boundary rather than a search-only filter. Slice 1 first produces a checked inventory of every agency CRM route/service that can reveal, aggregate, export, relate, or mutate people, companies, opportunities, activities, tasks, or their children. One server-side record-access resolver is then applied to search; canonical list/detail/mutation routes; bulk and dedupe; import/export; documents, communications, relationships, and line items; meeting actions, quotes, and lead-promotion paths; and any other indirect surface in that inventory. Child records inherit authorization from their current client-qualified parent/target, aggregates and exports filter before projection, and dedupe emits a pair only when both records are visible. A bulk request containing any hidden/missing target fails atomically with the same non-disclosing not-found response before every mutation; it never partially mutates or reveals which item failed. The resolver consumes the fresh authoritative client/context plus the current record relationship. Mutations may add stricter permission checks but may not weaken this read boundary. Portal authorization remains governed by its separate portal CRM access decision. Inventory/negative tests exercise direct IDs and indirect surfaces so an actor cannot bypass owner scope by skipping search.

Visibility predicates are entity-specific:

- people, companies, and opportunities use their current `owner_id`/`assigned_to` rule when the client is owner-scoped;
- activities inherit visibility from their client-qualified person/company/opportunity target and are excluded when that target is missing or hidden;
- tasks are visible in owner mode only when assigned to or created by the actor, or when their client-qualified target is visible; and
- portal retrieval uses the portal CRM access decision and client boundary, not staff owner predicates.

Every keyword ordering ends with stable `type ASC, id ASC` tie-breakers after relevance and title so repeated `off`/`shadow` calls are deterministic.

### Semantic candidate retrieval

1. Atomically reserve semantic usage against both global and client budgets.
2. Generate the query embedding with the schema's exact model and pooling.
3. Query only the canonical organisation/client namespace.
4. Filter by `schemaVersion = policy.active_schema_version` and allowed entity types; candidate and retiring schemas are never queried.
5. Request vector IDs and scores only.
6. Use semantic `topK = 30` by default with a hard server-side maximum of 50, below the current no-values/no-metadata provider limit of 100.
7. Apply the schema-versioned application abstention threshold before fusion; V1 starts at cosine score `0.75`, and changing it requires the frozen development/holdout evaluation protocol.
8. Discard below-threshold, malformed, or duplicate candidates.
9. Resolve vector IDs through the Postgres document ledger under the same organisation, client, active schema, canonical namespace, and vector ID, requiring `confirmation_state = 'indexed'` and no tombstone.
10. Fresh-revalidate actor/session active state, current `CLIENTS`/portal-view authority, active client, and canonical client access through direct Neon, then reload current CRM rows with deletion, type, revision, assignment, and visibility predicates.
11. Populate titles and subtitles only from those current rows.

Vectorize does not expose a binding-level score-threshold option, so the application must enforce this cutoff. Semantic-only hits are allowed only above it. If no candidate survives, `assist` returns the authorized keyword list unchanged. A policy cannot enter `assist` unless holdout no-result tests prove the selected threshold meets the false-positive gate.

Any candidate that fails scope or authorization checks is dropped and emits a redacted security event. It is never returned and never replaced with vector metadata.

Semantic-path failures are classified but share one public rule: after an authorized keyword result has been obtained, policy-store, budget-store, Workers AI, Vectorize, document-ledger, semantic join-back, validation, deadline, or RRF failure discards the entire semantic branch and returns the authorized keyword result. An initial keyword/Postgres failure fails the whole request. A later Postgres failure confined to document-ledger resolution or semantic join-back discards only the semantic branch and never falls back to vector content. Late provider results are ignored and are not retried inline.

The default semantic deadline is 500 ms and the hard configurable maximum is 750 ms, measured from immediately before global/client budget reservation until authorized fusion completes. The Workers AI binding offers no guaranteed cancellation contract, so timeout means caller abandonment, not provider termination. A provider call that completes after abandonment is discarded, conservatively charged, recorded as a late billed completion, and never retried inline. Its settlement-only continuation is registered through the repository's `asyncBackground`/Cloudflare `waitUntil` lifecycle; after invocation it retains correlation and accounting data but no raw query. Shadow sampling has a bounded concurrency ceiling so a slow provider cannot create an unbounded tail of background work. Provider completion, caller abandonment, late completion, and end-to-end assist latency are distinct metrics. A provider invocation is not counted as a successful semantic result merely because the keyword response succeeded.

### Rank fusion

`assist` uses deterministic weighted Reciprocal Rank Fusion rather than comparing raw Postgres and cosine scores. V1 obtains an authorized keyword pool of at most 50 and a semantic pool of at most 30. It applies source-specific authorization and filtering before fusion, deduplicates each pool by `(entityType, entityId)` while retaining that source's best one-based rank, fuses the complete surviving pools, sorts the fused list, and only then applies the caller's validated final limit of 1–50. V1 starts with `k = 60`, keyword weight `1.0`, and semantic weight `0.7`; absent-list contribution is zero. Ties resolve by keyword rank, semantic rank, entity type, then entity ID, with an absent rank sorting after every present rank. Constants, pool depths, rank base, and deduplication behavior are versioned; any change requires the frozen development/holdout evaluation protocol. Keyword-only and semantic-only ranks remain available for evaluation, not public interpretation.

## Durable indexing

### Database model

Use three additive, transactional migration phases rather than one trigger-heavy file:

1. **Expand:** create control, policy, bounded source-dirty, per-schema operation, ledger, usage, telemetry, evaluation, dead-letter, teardown, and audit structures plus pure helper functions; add source revision columns, but install no source triggers.
2. **Validate/backfill:** seed and verify the fixed installation scope/global control, initialize source revisions, validate constraints and projection fixtures, and prove all required objects exist.
3. **Activate capture:** acquire a migration advisory lock, set finite `lock_timeout`/`statement_timeout`, install triggers last inside one transaction, verify exact trigger definitions, then commit.

A failure rolls back its phase. Core CRM writes never encounter triggers that reference partially created search objects.

#### `crm_search_organisation_scopes`

A server-owned scope registry. The current installation has one active primary scope. Future organisation migration can add one scope per organisation.

The expand migration seeds one fixed, server-owned installation scope ID once and prevents its identity from being changed or deleted while dependent search rows exist. Trigger execution performs no external I/O and stamps that compile-time migration constant without querying optional policy state. If the registry invariant is later corrupted, readiness disables search, but source capture and core CRM writes remain deterministic.

#### `crm_search_global_control`

A singleton, revisioned authoritative control row with `halted`, `delete_only`, or `enabled` state. `halted` blocks semantic queries and all new provider admissions while bounded pre-revision admissions settle; `delete_only` blocks queries/upserts but permits audited teardown deletions; `enabled` permits work still allowed by client policy and budgets. Operator transitions require `ADMIN`, expected revision, reason, and audit evidence. Provider-call guards read it through the repository's fresh direct-Neon query path, not Hyperdrive/cache. Environment configuration may only make the database state more restrictive.

#### `crm_search_policies`

One row per organisation/client containing:

- lifecycle state and effective mode;
- indexing enabled state;
- shadow sample rate;
- active, candidate, and retiring schema versions;
- daily query and indexing budgets, defaulting to zero;
- semantic deadline;
- policy revision;
- approved evaluation-run reference;
- deployed environment and Git SHA;
- evidence-bundle hash;
- transition reason; and
- updater and timestamps.

Defaults are disabled and `off`.

#### `crm_search_evaluation_runs`

Immutable evaluation evidence keyed by dataset version/SHA, sealed-judgement SHA, query-level evidence-bundle SHA, implementation Git SHA, clean-built Pages/Worker artifact digests, preview deployment IDs, schema version, model/pooling/rank/threshold contract, environment, load protocol, provider/rate-card revision, recomputed metric bundle, runner, and creation time. Passing status is written only by a server function that recomputes every gate from immutable evidence; callers cannot submit a pass flag or aggregate-only bundle.

Separate append-only approval and revocation tables mirror the repository's governed AI evaluation pattern. Approval requires an unexpired run, reason, evidence hash, `ADMIN`, and a second person distinct from the runner and planned policy updater. Implementation, fixture, judgement, domain-reviewer, adjudicator, runner, and approver identities are recorded; implementers/fixture authors cannot access the sealed labels, judgement authors cannot approve their own evidence, and no implementation author can be the sole approver. Approvals expire after 14 days, can be revoked independently, and cannot be updated/deleted/truncated by application or operator roles during their retention window. Policy transition revalidates the run, approval, non-revocation, exact deployed SHA/artifact/schema/threshold, sealed provenance, and actor separation inside the same transaction.

#### `crm_search_source_dirty`

The trigger-owned, schema-neutral durable latest-intent set contains one row per organisation/client/entity and:

- organisation scope;
- client;
- entity type and ID;
- latest source revision;
- action (`upsert` or `delete`);
- latest global event sequence;
- claim lease and attempt count;
- next-attempt timestamp;
- redacted error class; and
- creation/update timestamps.

Each source mutation transaction upserts this row only when its revision/event sequence is newer. This bounds disabled-mode backlog to the number of dirty entities rather than the number of writes. The table has no entity/client foreign key or cascade, so delete intent survives source removal. Expansion compares the latest intent with current policy and ledger state and creates the required schema-specific operations. Successful expansion clears the dirty row only with a revision/event-sequence CAS, so a concurrent newer source write cannot be lost.

#### `crm_search_operations`

One durable row per schema-specific provider intent containing source identity/revision, schema, desired action, vector ID/namespace, approved-projection content hash, keyed confirmation tag/version, transport/processing/provider/confirmation attempt counters, provider mutation ID, lease token/generation, state, redacted error class, and timestamps.

States are explicit:

```text
pending_transport -> queued -> processing -> provider_pending -> confirmed
        |               |          |                |
        └──────── retryable ────────┴────────────────┘
                                      └── terminal_dead_letter
```

Only one provider mutation may be in flight for an organisation/client/entity/schema. A partial unique constraint allows at most one replaceable pre-admission intent and, while a provider mutation is pending confirmation, at most one coalesced successor containing only the latest revision/action. The processor acquires that ledger lease, rechecks the latest source revision/action and current schema role through fresh Postgres immediately before the provider call, and supersedes stale work. It retains the lease through asynchronous provider confirmation. Ledger completion uses lease-token/generation CAS. A delete cannot be confirmed until every earlier accepted mutation for that entity/schema is confirmed or superseded under the same serialized lease, preventing an older delayed upsert from resurrecting a deleted vector.

#### `crm_search_documents`

The authoritative no-content ledger mapping organisation/client/entity identity and schema version to vector ID, namespace, source revision, content hash, provider mutation ID, confirmation state, tombstone state, provider high-watermark, lease generation, confirmation key version, and timestamps. Its key includes schema version so active and candidate embeddings can coexist.

It stores no raw searchable document and no vector values. Like the dirty set and operations, it has no cascading source/client foreign key. A client teardown preserves this ledger until delete confirmation succeeds for every live or retiring schema; a separate retention job then removes expired tombstone evidence.

#### `crm_search_usage_daily`

Atomic UTC-day reservations and charged usage for query embeddings and document indexing at both global and per-client scopes. The transaction locks and reserves both rows together, and rejects work if either cap would be exceeded. It records provider calls, conservative input units, queried/stored vector dimensions, ceiling-rounded micro-USD charges, completion class, and immutable provider-rate-card revision.

The BGE binding response does not report token usage, so every possible Workers AI invocation reserves and permanently charges the model's full 512-input-token maximum; it is never settled downward from an unprovable token estimate. Vectorize accounting follows the pinned provider formula exactly: query and inserted-vector usage reserve vector-count multiplied by 768 dimensions, `topK` is not a billing multiplier, and stored-vector cost is forecast/reconciled from schema-aware inventory using a conservative billing-period high-watermark until the invoice basis is proven. The rate card records included allowances and separate queried/inserted-dimension and stored-dimension prices rather than pretending each upsert has a flat operation price. Every provider call, including a retry or late discarded response, charges once. Cache hits and provider-free idempotent no-ops are not charged, and a reservation is released only when evidence proves no provider call was sent. Expired or revoked rate cards fail closed. Global/client daily policies and every backfill/evaluation plan also cap maximum provider calls, query/insert dimensions, stored-dimension inventory, and total charged micro-USD. Defaults are zero.

Budget-store failure disables semantic work for that request but never blocks keyword search or the underlying CRM mutation. This deliberately differs from the existing generic fail-open rate limiter because an unavailable cost boundary must not create unbounded AI spend.

#### `crm_search_events`

Privacy-safe retrieval telemetry containing mode, surface, sampled state, keyed query digest, coarse length bucket, bounded result-rank evidence, latency components, fallback reason, and redacted status. Raw query text and source text are forbidden.

The query digest is HMAC-SHA-256 over key version, organisation scope, client ID, and normalized query. Digest keys are dedicated to search analytics, never reused for queue authentication, rotated with an overlap window, and referenced only by key version. Detailed events expire after 30 days; daily aggregates expire after 180 days. Security and policy audit evidence is retained for two years unless the product's approved enterprise retention policy requires a stricter period. Detailed search events are accessible only to `ADMIN`/security operators and never through portal APIs.

#### `crm_search_audit_log`

Append-only operator evidence for policy changes, backfills, reconciliation, cross-scope candidate rejection, manual retries, and dead-letter handling.

#### `crm_search_change_approvals` and revocations

Append-only approvals for `resource_provision`, `production_migration`, `production_deploy`, `client_indexing`, `client_shadow`, and `client_assist`. Each binds environment, implementation SHA, clean-built artifact-manifest digest, Pages/Worker bundle digests where applicable, manifest/evidence hashes, exact client scope or global scope, cost ceiling, approver/reason, issue/expiry time, and expected control/policy revision. Revocation is a separate immutable row. Guarded scripts and policy transactions require an unexpired, unrevoked matching approval and never infer authority from an earlier approval type. Pre-migration resource approval is captured as an immutable CI/release artifact and imported with its original timestamp/hash after the approval table exists.

#### `crm_search_dead_letters`

Operator-visible terminal queue state containing only operation identity, attempts, first/last failure time, redacted error class, resolution state, resolver, reason, and audit linkage. A dedicated DLQ consumer persists or updates this row. An `ADMIN`-protected health API and operations UI expose bounded backlog age, dead-letter counts, and safe retry/resolve actions; raw provider errors and source text are never displayed.

Rows distinguish Cloudflare transport/processing DLQ failures from Postgres-owned provider-confirmation dead letters. They are not interchangeable.

#### `crm_search_client_teardowns`

Durable teardown snapshots keyed by organisation/client, with policy revision, namespace, every ledger and provider-pending schema/vector identity, requested reason/actor, provider deletion state, retention deadline, and completion timestamp. A transition of `agency_clients.is_active` from true to false atomically disables policy and creates/refreshes this snapshot. A hard client delete has a BEFORE trigger that persists the independent teardown snapshot before CRM cascades run. Search policies, dirty rows, operations, ledgers, and teardown snapshots use non-cascading identity values rather than a cascading client foreign key. Once teardown exists, it is the independent authorization for delete publication, processing, confirmation, and retry; those paths require current global `enabled`/`delete_only` state but do not require the ordinary client row or policy to survive. The agency route reports `teardown_pending` until every vector is delete-confirmed; source and client rows may disappear, but search evidence cannot cascade.

### Retention and erasure lifecycle

Every retained table has `retention_expires_at` and optional approved legal-hold linkage where applicable. Defaults are explicit:

| Data | Default retention |
|---|---|
| Detailed search events | 30 days; purge immediately on approved client erasure. |
| Daily non-query aggregates | 180 days. |
| Global/client usage and rate-card evidence | 400 days. |
| Confirmed provider operations | 90 days. |
| Resolved dead letters | 180 days after resolution. |
| Active document ledger | Life of the source entity/client policy. |
| Confirmed tombstone/teardown ledger | 90 days after all provider deletion is confirmed. |
| Evaluation runs/approvals, policy/security audit | 2 years, unless a stricter approved enterprise schedule applies. |

Append-only means immutable for application and ordinary operator roles during the declared retention window, not immortal storage. Time-partitioned governance/event tables are expired only by a narrowly granted `SECURITY DEFINER` retention function after it proves `retention_expires_at`, absence of legal hold, and the expected partition/high-watermark hash. The function writes a chained deletion attestation containing table/partition, time range, row count, prior hash, deletion-manifest hash, executor, and timestamp to a separately protected retention-audit partition before deletion/drop. That attestation follows the approved enterprise compliance schedule and is itself removed only by the same two-person, legal-hold-aware expiry procedure; no generic `DELETE`/`TRUNCATE` grant exists.

A daily bounded purge job invokes only that function, records scanned/deleted counts and high-watermarks, supports resumable batches, honors append-only legal holds, and alerts if it fails for 24 hours. Tests cover ordinary-role mutation denial, privileged expiry, chained attestations, expiry, aggregation-before-purge, hold/release, HMAC-key rotation, retry recovery, and client erasure. Retired HMAC key material remains available only until the last referenced event expires, then is destroyed through the secret-rotation runbook.

Client erasure immediately marks that client `teardown_pending`, disables its queries/upserts, and prioritizes namespace/vector deletes whenever global control is `enabled` or `delete_only`. Normal deletion target is 15 minutes; 1 hour triggers an operator warning, 4 hours pages the on-call owner, and 24 hours creates a privacy/security incident with provider escalation. Completion requires Postgres ledger evidence plus Vectorize absence confirmation for every schema. Provider outage cannot be reported as erasure success.

### Source revisions and triggers

Add a monotonic `search_revision` to people, companies, and opportunities. It is trigger-owned: application-supplied values are ignored/rejected, and the trigger derives the next value from `OLD` so bulk/import callers cannot reset or skip ordering.

Database triggers:

- increment the revision on relevant insert/update operations;
- upsert schema-neutral latest intent after insert or relevant update;
- when `client_id` changes, atomically emit an OLD-client delete intent and a NEW-client upsert intent with the same new source revision but distinct global event sequences, preserving the old vector identity/namespace from durable state;
- upsert schema-neutral delete intent for soft delete and physical delete;
- create a durable client-teardown snapshot when an agency client is deactivated or hard-deleted; and
- execute in the same transaction as the source mutation.

Source triggers never need a client policy or schema assignment, so missing/off policies cannot block CRM writes. The expander converts the latest source intent into one operation per schema that should contain the entity: active/candidate schemas for upsert and every active/candidate/retiring ledger schema for delete. Candidate backfill creates versioned operations directly.

The expander/processor computes the schema-specific approved-projection digest through versioned per-entity SQL functions that mirror the tested TypeScript document builders, without persisting projection text. Trigger capture itself remains schema-neutral.

Revision and deletion ordering is exact:

- an insert emits revision 1;
- each relevant update, including the first soft delete, emits the incremented revision;
- a physical delete emits `OLD.search_revision + 1` using the deleted row's organisation/client/entity identity;
- a soft delete followed by a later physical delete therefore produces two distinct ordered source transitions, even if the bounded dirty set coalesces them to the latest desired absence; and
- expansion/processing compare source revision first and `event_sequence` second, while the per-entity/schema provider lease serializes accepted mutations so an old upsert cannot overwrite a newer delete tombstone.

Non-searchable updates should not create unnecessary embedding work. Trigger conditions or the projection hash must allow a later worker to mark unchanged content as a successful no-op.

This trigger-backed approach covers route, import, bulk, dedupe, lead-promotion, assignment, lifecycle, stage, line-item, and cron writes without relying on every caller to remember an indexing hook.

### Queue publication

Postgres dirty rows, operations, and ledger state are durable; Cloudflare Queue messages are identifier-only wake-ups.

A bounded publisher:

1. fresh-reads and locks global control plus the current client policy, or the independent teardown snapshot for a deleted client;
2. while `halted`/off, leaves schema-neutral dirty intent coalesced and unexpanded; in `delete_only`, expands only teardown/delete intent;
3. expands eligible dirty rows to current schema-specific operations with revision/event-sequence CAS;
4. enforces one replaceable latest pre-admission operation per organisation/client/entity/schema and at most one serialized provider-pending operation plus one coalesced successor, so repair/expansion cannot multiply non-publishable work;
5. claims eligible operations with a lease and `FOR UPDATE SKIP LOCKED`;
6. publishes operation IDs to `CRM_SEARCH_INDEX_QUEUE` only when that action is permitted (`enabled` for upsert; `enabled` or `delete_only` for delete);
7. marks successful publication; and
8. releases or reschedules claims after publication failure or policy disablement.

A cron-authenticated repair endpoint republishes pending or expired claims. Eventual indexing does not depend on the mutation request remaining alive.

### Dedicated consumer

Create a standalone queue consumer Worker because Pages cannot host a queue consumer. It forwards a signed identifier-only request to a dedicated internal Pages endpoint.

The service request includes an operation ID, server correlation ID, timestamp, signature key version, protocol version, and HMAC over the canonical method, path, timestamp, operation ID, correlation ID, protocol version, and body digest using a dedicated service secret. The endpoint validates constant-time signature equality and freshness before parsing identity or loading the complete operation from Postgres. Keys rotate with a bounded overlap window. Replays are safe because processing is revision/hash idempotent and repeated signed operation IDs do not create another provider reservation.

The consumer uses a push-based Cloudflare Queue with explicit `max_batch_size`, `max_batch_timeout`, `max_retries`, `retry_delay`, `max_concurrency`, and `dead_letter_queue` settings. The queue and DLQ use the paid-plan 14-day retention maximum documented by Cloudflare; if the account plan cannot support it, readiness fails rather than silently accepting shorter recovery. Messages are individually handled: signed endpoint outcomes `complete`, `accepted_provider_pending`, or `superseded` are `ack()`ed; typed transient transport/pre-accept failures call `retry()`; malformed or exhausted delivery reaches the Cloudflare DLQ. The dedicated DLQ consumer records transport/processing terminal state in Postgres. Once a provider mutation has been durably accepted and the message acknowledged, Postgres reconciliation—not Cloudflare retries—owns confirmation attempts and any terminal confirmation dead letter.

The signed envelope has an explicit integer protocol version. Pages advertises current and N-1 accepted versions plus its deployed SHA; the Worker health endpoint advertises emitted version and Worker SHA. Deployment updates Pages first to accept N/N-1, then the Worker to emit N, and removes N-1 only in a later release after queue age proves no older messages remain. An incompatible Pages rollback first pauses the consumer, verifies or redeploys an N-1-compatible Worker, then resumes. Health/readiness fails on protocol or SHA evidence mismatch.

### Worker processing

For an upsert operation:

1. claim the exact schema-specific operation and acquire its entity/schema provider lease;
2. fresh-load current global control, schema role, dirty high-watermark, and CRM row immediately before each provider call, using current client policy for upserts or the independent teardown snapshot for deletion after a client/policy row disappears;
3. treat a missing/deleted row as a vector deletion;
4. discard superseded revisions;
5. build and validate the allowlisted document;
6. skip provider work when the document ledger already has the same schema/revision/hash;
7. atomically reserve global and client indexing budget;
8. create the embedding;
9. upsert the vector in the canonical namespace and persist the returned provider mutation ID with state `provider_pending`;
10. acknowledge the queue message only after that durable pending state commits; and
11. let reconciliation retain the provider lease and confirm the exact vector with `getByIds`, matching vector ID, canonical namespace, schema, revision, and keyed confirmation tag before atomically marking the ledger/operation `indexed`, advancing the high-watermark, releasing the lease, and emitting redacted evidence.

For each schema-specific delete operation, delete its one known vector under the same serialized provider lease, persist the returned mutation ID as `provider_pending`, and acknowledge the queue message only after that durable state commits. Reconciliation confirms absence with `getByIds` before advancing the deletion high-watermark, marking it `deleted`, and releasing the lease. A delayed vector delete cannot disclose data because query join-back rejects a missing/deleted Postgres row immediately, but teardown itself remains pending until provider absence is confirmed.

Cloudflare Vectorize upserts and deletes are asynchronous. Returning a mutation ID means the mutation was accepted, not query-visible. The processing request does not poll inside a queue delivery. Reconciliation owns confirmation with bounded exponential delay, discards returned vector values without logging them, and never labels a document indexed or deleted before exact-ID confirmation succeeds. A pending mutation that exceeds the confirmation window may be resubmitted idempotently under retry and budget limits; terminal exhaustion becomes a durable dead letter.

Provider helpers used by this pipeline must return typed success/failure results or throw typed errors. They must not swallow failures and then mark the database as successfully indexed.

### Reconciliation

A bounded reconciliation job compares current source revisions and approved projection hashes with the per-schema document ledger. It confirms `provider_pending` mutations through exact-ID reads, creates missing work, repairs stale work, fans out deletion across live schemas, and identifies orphaned ledger/vector records without reading source text into logs.

The target is operational convergence within 15 minutes under normal provider availability, acknowledging that Vectorize writes become query-visible asynchronously.

## Privacy, security, and abuse controls

### Trust boundaries

- external HTTP query input;
- staff and portal sessions;
- client/record authorization;
- Postgres-to-queue publication;
- queue-to-internal-service authentication;
- Workers AI model invocation;
- Vectorize candidate storage and retrieval; and
- AI assistant output.

### Required controls

- Validate all boundary input with Zod.
- Derive all security scope server-side.
- Require permissions before any billable or retrieval work.
- Parameterize SQL.
- Treat vectors, metadata, model results, and assistant output as untrusted.
- A normalized raw query may exist transiently only inside the authenticated agency/portal request, retrieval coordinator, privacy classifier and keyed-digest computation, parameterized Postgres keyword call, primary agency AI request/tool input, and eligible Workers AI embedding invocation. It must never be persisted, placed in telemetry or logs, copied into auxiliary prompts or queue payloads, or echoed in CRM tool results. Unrestricted notes and other clients' data are excluded from every prompt and provider payload.
- Use current Postgres authorization, not prompt instructions, as the final boundary.
- Bound query length, result count, rate, semantic deadline, daily usage, queue attempts, and reconciliation batch size.
- Use generic client-facing errors and classified redacted operational errors.
- Preserve a durable audit trail for security-relevant operator actions.

Before any production semantic processing, the vendor register and privacy documentation record Workers AI and Vectorize as subprocessors for the approved CRM fields. The production-readiness evidence includes the applicable Cloudflare DPA/subscription terms, the BGE model license, residency requirements, deletion behavior, and customer notice/contract basis. Cloudflare's current Workers AI documentation says customer content is not exposed to other customers or used to train/improve models without explicit consent, but that documentation does not replace the organisation's legal and security approval. If required processing location or contractual controls cannot be proven, semantic policy remains `off`.

### Failure behavior

| Failure | Behavior |
|---|---|
| Authentication or authorization fails | Reject before keyword, AI, or vector work. |
| Caller submits scope controls | Reject or ignore them; session-derived context wins. |
| Vector candidate is foreign, deleted, stale, malformed, or unauthorized | Drop, record redacted security evidence, never expose metadata. |
| Workers AI or Vectorize is missing, late, or fails | Return keyword results in shadow/assist; record a bounded fallback reason. |
| Initial keyword/authorization Postgres work fails | Fail the request; never return semantic-only data. |
| Semantic-ledger/join-back Postgres work fails after keyword succeeds | Discard the semantic branch and return the already-authorized keyword result. |
| Queue message repeats | Revision/hash idempotency makes it a no-op. |
| Indexing provider fails | Persist retryable state; bounded retry, then DLQ. |
| Budget is exhausted | Skip semantic work and preserve keyword availability. |
| Global control is `halted` | Stop semantic queries, queue publication, and new provider admissions; settle/ignore bounded pre-revision admissions, return claims to resumable state, and keep bounded dirty capture. |
| Global control is `delete_only` | Stop semantic queries/upserts but permit audited teardown deletes and confirmation. |

## Telemetry and operational questions

Instrumentation exists to answer:

1. Is CRM search degraded, and which dependency is responsible?
2. Is an individual client's semantic index current?
3. Are retry age, backlog, or DLQ rows increasing?
4. Did a cross-scope or invalid candidate occur?
5. Is semantic usage approaching a client or global budget?

Signals use stable event names and bounded dimensions such as mode, surface, entity type, provider, status class, and fallback class. User IDs, client IDs, query digests, request IDs, raw URLs, and error messages must not become metric labels. High-cardinality values belong only in access-controlled structured events when necessary.

Every external request receives a server-generated correlation ID. Caller-supplied IDs are ignored unless they arrive through an authenticated internal signature that binds the ID, operation identity, and timestamp. That ID is propagated across Postgres, queue, internal HTTP, Workers AI, and Vectorize operations. Logs use allowlisted fields rather than serializing request bodies or provider errors.

Initial actionable operational thresholds are documented in the runbook and tuned from shadow evidence. User-facing keyword error rate and queue age are alert candidates; ordinary self-healing retries are dashboard signals, not pages.

## Evaluation

### Dataset

Create and freeze a synthetic, PII-free CRM corpus plus at least 180 checked-in development queries/judgements spanning at least three clients with deliberately overlapping vocabulary. Before ranking constants or the semantic threshold are selected, preregister the candidate configurations and selection rule. The 360-query holdout and its labels are stored as a sealed, access-controlled artifact whose SHA and stratum manifest are checked in but whose contents are unavailable to implementers; only the governed runner may unseal them after candidate selection is frozen. At least two CRM domain reviewers who did not implement the ranking independently judge the holdout, and documented adjudication resolves disagreements before the seal/hash is finalized. Every evaluation records corpus, development, sealed-holdout, judgement, preregistration, and adjudication SHAs. The holdout has at least 80 queries per test client, 60 each targeting people/companies/opportunities, 120 natural-language queries, 60 exact-name/identifier queries, 60 no-result queries, and 60 deliberately cross-client-overlap queries; queries may belong to multiple declared strata. A promotion run is invalid when any minimum, seal, preregistration, reviewer-separation, or provenance check is unmet. Judgements cover:

- exact person and company names;
- opportunity titles;
- natural-language intent;
- abbreviations, punctuation, and multi-word queries;
- multiple relevant entities and entity types;
- no-result queries;
- client overlap designed to detect leakage;
- owner-scoped records;
- soft-deleted records; and
- malformed/stale vector candidates.

No-result queries are a first-class stratum. Their false-positive rate is measured independently so semantic recall cannot improve by returning plausible but unsupported records.

Production shadow telemetry never stores raw query text. Any curated real-query evaluation requires a separately approved, de-identified process.

### Metrics

- Recall@10;
- Mean Reciprocal Rank;
- nDCG@10;
- result overlap and ordering change versus keyword;
- p50/p95 semantic and total retrieval latency;
- timeout and fallback rate;
- query and indexing usage/cost estimates;
- index lag and reconciliation age; and
- cross-client/unauthorized leakage count.

### Assist promotion gates

Production `assist` remains disabled until:

- cross-client, unauthorized, and deleted-record leakage are all zero;
- `off` and `shadow` return exactly the keyword results;
- exact-name and identifier nDCG@10 and Mean Reciprocal Rank do not regress from keyword-only retrieval;
- natural-language nDCG@10 improves by at least 10% over keyword-only retrieval, while Mean Reciprocal Rank does not regress;
- no entity-type or client stratum regresses by more than 5% on nDCG@10 or Mean Reciprocal Rank;
- no-result false-positive rate is no worse than keyword-only retrieval;
- paired holdout bootstrap analysis reports a 95% confidence interval whose lower bound is above zero for natural-language nDCG@10 improvement, in addition to the 10% point-improvement gate;
- under cold, warm, and concurrent load at `max(10, 2 × observed p95 production search concurrency)`, semantic added-latency p95 is at or below 500 ms, end-to-end assist p95 is at or below keyword-baseline p95 plus 500 ms, caller-abandonment/fallback is at or below 5%, and late billed provider completion is at or below 1%; provider abandonment is never labelled cancellation;
- configured query and indexing budgets are never exceeded under concurrent reservation tests;
- namespace and live/candidate/retiring vector-capacity forecasts remain below independently proven headroom limits;
- backfill and reconciliation converge without stale or orphaned records;
- shadow evidence covers at least three separately approved clients, 200 unbiased sampled eligible queries per client (600 total), and seven consecutive days, where eligibility means every authorized, non-identifier, policy-enabled agency-global query before sampling and excludes only documented privacy guards or provider-disabled periods;
- telemetry has been inspected for raw-query/source-text leakage; and
- the rollout decision is explicitly approved.

The initial implementation builds the harness and records evidence; it does not manufacture a passing result or activate assist without data.

## Testing strategy

### Unit and contract tests

- search-context authorization and fail-closed defaults;
- namespace and vector-ID derivation;
- document field allowlists and normalization;
- query/mode/policy parsing;
- NFKC/obfuscated-identifier privacy classification and post-normalization bounds;
- semantic abstention threshold and no-result behavior;
- deterministic RRF and tie-breaking;
- provider result validation;
- candidate deduplication and ordering;
- privacy-safe telemetry projection;
- usage reservation and caps; and
- typed error classification.

### Endpoint tests

- agency authentication, `CLIENTS`, canonical active-client access, and record visibility;
- fresh direct-Neon actor/session, permission, active-client, entitlement, and owner-policy revocation checks rather than the five-minute auth/role cache;
- identical `404 Client not found` behavior for nonexistent and inaccessible clients, with denial before keyword/policy/budget/AI/vector calls;
- checked agency CRM endpoint inventory plus direct and indirect owner-scope denial across canonical routes, bulk/dedupe/import/export, child resources, meetings, quotes, and lead promotion;
- all-or-nothing non-disclosing bulk denial, dual-visible dedupe pairs, parent-inherited child authorization, and filtered aggregates/exports;
- portal session scope, full-CRM entitlement, and CRM view permission;
- active-client recheck, deactivation session revocation, and deactivated-client denial;
- exact portal search POST classified as `view` while every near-match/mutation POST remains `edit`;
- the existing `/api/client-portal/crm/*` staff-auth exemption plus route-wide CRM access middleware contract;
- caller scope-injection attempts;
- JSON-POST-only search contracts, with both former GET handlers absent;
- the unsafe `/api/agency/search/semantic` route absent with no compatibility alias;
- unknown configuration and missing bindings;
- keyword fallback and Postgres-failure behavior; and
- AI tool client non-disclosure and assist-surface restriction.

### Candidate authorization tests

Inject valid, foreign-client, deleted, missing, wrong-type, duplicate, malformed, and stale-revision candidates. Prove that only current Postgres-authorized rows survive, response content comes only from Postgres, and authorized semantic order is preserved before fusion.

### Database, dirty-source, and operation tests

- migration contract and constraints in the repository's disposable Postgres schema harness and, where credentials permit, an isolated Neon branch;
- expand/validate/activate transaction boundaries, advisory lock, timeouts, and triggers-last rollback;
- insert, relevant update, soft delete, and physical delete trigger behavior;
- `client_id` move emits OLD-namespace deletion plus NEW-namespace upsert and confirms the former vector absent;
- source transaction rollback produces no committed dirty row;
- alternate mutation paths are covered by triggers;
- duplicate/superseded revisions and schema-neutral dirty-row CAS/coalescing;
- serialized provider lease/CAS under deliberately reordered upsert/delete completions;
- claim leasing and `SKIP LOCKED`;
- queue publication failure and stale-claim recovery;
- halted/off dirty coalescing and the one-pending-plus-one-successor operation bound under repeated writes/repair;
- delete tombstones without entity foreign keys;
- soft-delete then physical-delete ordering;
- client teardown without tombstone cascade;
- client deactivation and hard-delete teardown snapshot/confirmation;
- hard-delete teardown publication/retry after both ordinary client and policy rows are absent;
- multi-schema blue/green promotion and delete fan-out;
- live-write cutover fencing and retiring-schema suppression;
- asynchronous metadata-index readiness plus filtered sentinel gate;
- asynchronous mutation acceptance versus exact-ID confirmation; and
- reconciliation of pending, missing, stale, and orphaned ledger records.

### Worker tests

- signed service authentication and timestamp freshness;
- identifier-only payload enforcement;
- authoritative operation reload;
- model/pooling/schema contract;
- strict provider failure handling;
- retry and DLQ state transitions;
- individual Queue `ack()`/`retry()` mapping and separate confirmation dead letters;
- global-control fresh-read before every provider call;
- query-control flips between embedding and Vectorize query;
- missing/deleted-row vector deletion;
- idempotent hash/revision no-op; and
- N/N-1 protocol/deployment/rollback compatibility;
- retention, legal hold, purge recovery, and confirmed provider erasure; and
- no sensitive data in logs or errors.

### Repository gates

- focused Vitest suites for each slice;
- every touched/security/migration/provider-contract suite passing with no waiver, plus the full Vitest suite under Node 24.18.0;
- automatic migration execution against the guarded isolated Neon branch during implementation, with target identity recorded and postconditions inspected; shared/production application requires its separate recorded approval;
- migration postconditions inspected directly;
- typecheck results compared with an exact diagnostic baseline captured from base SHA `f46d1e7793ba558e374c380e47d610a65d42756a`, with no new diagnostics in touched files;
- exact same-machine/base-worktree reproduction for any unrelated pre-existing full-suite failure; any new failure blocks completion;
- production build under Node 24.18.0 passing unconditionally;
- `pnpm deploy:check` only, with no production deploy;
- clean-detached-checkout artifact build, content-addressed Pages/Worker bundle manifest, and dirty/HEAD/rebuild rejection tests;
- complete Preview binding inventory proving every mutable Cloudflare/database/integration target is preview-only or disabled;
- dedicated consumer `tsc`, generated binding/type validation, Wrangler configuration validation, and `wrangler deploy --dry-run`/bundle inspection through a repository-owned immutable-target check;
- real-provider end-to-end verification through actual `off`/`indexing`/`shadow`/`assist`/downgrade/delete-only runtime paths in a non-production Cloudflare environment, including asynchronous Vectorize confirmation and queue retry/DLQ behavior;
- `git diff --check`;
- re-read every changed file and apply the repository pre-commit checklist;
- adversarial code, security, and requirement-completion reviews; and
- a final requirement-by-requirement evidence audit.

## Public and product documentation

Because current marketing copy overstates semantic coverage and automatic indexing, implementation must update:

- `app/pages/features/index.vue`;
- `app/pages/features/[slug].vue`;
- `app/components/MarketingNav.vue`;
- `app/pages/platform/ai.vue`;
- `app/pages/resources/ai-automation.vue`;
- `app/pages/resources/integrations.vue`;
- `app/pages/resources/index.vue`;
- `app/pages/landing.vue`;
- `app/pages/index.vue`;
- `app/pages/ai-training.vue`;
- `app/pages/creativity.vue`;
- `app/pages/privacy.vue`;
- any additional repository surface found by the final claim inventory; and
- environment and deployment documentation.

Copy must state that:

- CRM keyword search is the visible default;
- enterprise hybrid retrieval is controlled and off by default;
- semantic assistance is initially limited to approved agency-assistant contexts;
- portal and visible global-search ranking remain deterministic; and
- indexing is durable and eventually consistent when enabled, not universally automatic across every platform entity.

The implementation must not market an unprovisioned resource or an unapproved rollout as active.

A checked claim-to-capability manifest is keyed by route/component, rendered text or SEO field, entity set, user surface, maximum mode, and rollout state. It contains exact negative assertions for every current present-tense claim—including working hybrid ranking/better recall, an automatically current composite index, instant natural-language retrieval, and universal continuous indexing—so adding a disclaimer elsewhere cannot mask a surviving false claim. Source and rendered-page tests enforce the manifest. Browser verification covers desktop/mobile layout, default dark mode and light mode contrast, navigation, and SEO title/description rendering for every changed public route.

## Relationship to the Lakebase pilot

The 2026-08-08 Neon Lakebase Search pilot remains a separate experimental design. This production-hardening project does not enable Lakebase extensions, migrate the shared Vectorize workload, or treat the pilot as evidence that production hybrid relevance has passed.

The dedicated Cloudflare CRM index supplies the enterprise-safe semantic candidate path required by the current production stack. Any later Lakebase production decision must preserve the same `SearchContext`, Postgres authorization join-back, rollout, privacy, and evaluation contracts.

## Delivery slices

### Slice 1 — Authorization and unsafe-path retirement

- Add canonical agency and portal search-context resolution.
- Apply staff permissions, canonical active-client access, record visibility, and explicit portal CRM access.
- Inventory every direct and indirect agency CRM exposure/mutation path, then make owner visibility a shared record-authorization resolver across search, canonical CRUD, bulk/dedupe/import/export, child resources, meetings, quotes, lead promotion, and any other discovered surface; close direct-ID and relationship bypasses before semantic work begins.
- Preserve and test the existing portal middleware boundary.
- Keep keyword behavior stable.
- Delete the unused unsafe semantic endpoint.
- Add endpoint and negative authorization tests.

### Slice 2 — Search-domain migration and trigger contract

- Add organisation scope, global control, policy, dirty-source, provider-operation, document ledger, usage, telemetry, teardown, and audit schema.
- Add source revisions and trigger-backed bounded dirty capture.
- Add schema-aware tombstones, policy-transition constraints, evaluation evidence, and global/client usage reservations.
- Run and verify the forward-only additive migration, recording target identity and postconditions.

### Slice 3 — Deterministic search primitives

- Add pure namespace, vector identity, document builder, mode, usage, RRF, and telemetry primitives.
- Add golden fixtures shared by SQL projection hashes and TypeScript document builders.
- Add provider adapters with typed failure, async mutation, and confirmation contracts.

### Slice 4 — Dedicated indexing transport

- Add dedicated queue and Vectorize bindings with default-off configuration.
- Add dirty expansion, operation publisher, and repair endpoint.
- Add signed standalone queue/DLQ consumer.
- Add immutable-target worker validation/deploy wrapper, dry-run gates, and external-resource manifest.

### Slice 5 — Versioned indexing processor

- Add strict operation processor, Workers AI embedding, Vectorize upsert/delete, `provider_pending` confirmation, and per-schema serialized ledger transitions.
- Add deletion fan-out, client teardown, bounded backfill, and reconciliation.
- Add worker, failure-path, kill-switch, budget, and DLQ operations tests.

### Slice 6 — Hybrid retrieval and AI assist

- Add semantic candidate retrieval with namespace and metadata filters.
- Add Postgres document-ledger resolution and authoritative row join-back.
- Add deadline, budget, fallback, shadow comparison, and deterministic RRF.
- Restrict assisted ranking to the agency AI CRM tool.
- Preserve visible agency and portal keyword results.

### Slice 7 — Evaluation, operations, and truthful documentation

- Add the synthetic relevance and adversarial isolation harness.
- Add privacy-safe telemetry and operational queries.
- Add the protected search-health/policy operations surface; invoke the mandatory frontend-design skill before implementing its forms.
- Add backfill/reconciliation and rollout runbooks.
- Correct public marketing and environment documentation.
- Run full review, verification, build, and deploy-readiness gates.

Each slice receives focused tests and an atomic commit after the repository deep-review checklist passes. Database migrations are forward-only; rollback disables behavior and leaves additive schema in place. Every external Cloudflare resource and manual action is recorded in a versioned manifest so code rollback never pretends to delete provider state automatically.

## Infrastructure and rollout runbook contract

Implementation verification and production rollout are separate gates.

### Pre-production implementation verification

1. Keep production resources and production deployments untouched.
2. Resolve the `.env` Neon project/branch/endpoint identity without printing credentials. A fail-closed guard rejects the production/default/shared branch for implementation testing and creates an isolated Neon branch named `crm-search-e2e-<12-char-git-sha>` using Neon's explicit schema-only branch option, never the default data-bearing copy-on-write mode. It records project/source/branch/endpoint IDs and TTL, proves all scoped source tables contain zero rows before seeding, and then loads only synthetic fixtures. If schema-only creation or the empty-data proof is unavailable, provider E2E remains blocked rather than cloning production data. The migrations are applied and inspected there automatically. Applying them to any shared/production database is a separate production approval.
3. Use an immutable non-production manifest bound to the same Cloudflare account and Pages project required by the repository guard, but only the `preview` branch/environment and distinct resources: Vectorize index `agency-crm-search-preview`, queue `agency-crm-search-index-preview`, DLQ `agency-crm-search-index-preview-dlq`, and Worker `agency-crm-search-consumer-preview`. The manifest records account/resource IDs, Pages preview origin, Neon project/branch/endpoint IDs, protocol version, and secret key versions; the guard rejects equality with any production identifier.
4. Inventory every Pages binding and variable—not only the new CRM bindings—including all KV, R2, Queue producers, Vectorize indexes, Hyperdrive/direct database endpoints, D1, service bindings, secrets, and stateful integration targets. Every mutable binding must resolve to an explicit preview-only resource or be absent/disabled; no non-inheritable binding may silently fall back to top-level production state. Workers AI may use the account provider only under the zero/default preview budgets in the manifest. The preview guard compares the complete deployed binding inventory against this allowlist and blocks on any unknown, production-equal, or inherited mutable target.
5. Validate Pages configuration with `pnpm deploy:check` and the complete Preview binding guard. Validate the standalone consumer with its repository-owned immutable preview worker/config target check, `tsc`, `wrangler types`, Wrangler configuration validation, and dry-run bundle inspection.
6. From a clean detached checkout at the exact implementation SHA, build Pages and Worker once, compute content-addressed bundle digests plus dependency/lock/config hashes, and write a signed artifact manifest. Any dirty file, HEAD mismatch, rebuild, or post-build byte change invalidates it. Preview and production deploy wrappers must deploy these frozen bytes; the current `--commit-dirty=true` behavior is never accepted as release evidence.
7. Provision/reconcile the preview index, metadata indexes, queue, and DLQ from the manifest, poll asynchronous metadata-index readiness, and pass the filtered sentinel gate before any CRM fixture upsert.
8. Deploy only the guarded Pages preview branch and preview consumer from the frozen manifest, bound to the isolated Neon branch and preview secrets/resources. Record Cloudflare deployment IDs and verify runtime health reports the exact Git SHA, bundle digests, protocol, and binding-manifest digest.
9. In this isolated synthetic environment, exercise the actual runtime transitions and surfaces: `off` keyword behavior; `indexing`/backfill; agency-global `shadow`; agency-AI `assist`; portal keyword-only ceiling; downgrade to `halted`/off; delete-only teardown; and reset. The real endpoints/tool path—not only lower-level adapters—must cover authorization, budgets, deadlines/fallback, RRF, Workers AI, Vectorize asynchronous confirmation, queue retry/DLQ, reconciliation, and evaluation. No production mode or resource changes.
10. Purge all preview namespaces/messages/secrets created for the run, confirm the preview index is empty (or delete an ephemeral index), delete the isolated Neon branch, and verify every mutable preview resource returned to its recorded baseline.
11. Export only the redacted evidence bundle tied to dataset/preregistration SHAs, implementation SHA, artifact/binding-manifest digests, deployment IDs, and cleanup proof.

If a real non-production provider test cannot be run, implementation remains explicitly incomplete; mocked tests alone cannot satisfy the enterprise completion claim.

### Production rollout — separate explicit approvals

No dormant-code approval implicitly authorizes CRM data export. Each approval is independently recorded, expires, is revocable, and binds exact implementation SHA, clean artifact/bundle digests where applicable, environment, actor/reason, evidence, binding/resource manifest revision, client set where applicable, and maximum cost:

1. **Resource provisioning approval:** create `agency-crm-search`, wait for exact metadata indexes plus sentinel readiness, create queue/DLQ, configure scoped secrets/bindings/budgets, and verify everything remains `halted`/`off`.
2. **Production database migration approval:** run the three guarded migration phases against the identified production branch, inspect postconditions and write/load impact, while product policy stays `off`.
3. **Dormant code deployment approval:** approve the already-built clean artifact manifest and exact Pages/Worker bundle digests, then deploy those frozen bytes through the guarded `pnpm deploy:production` release path and immutable consumer wrapper without rebuilding. Both expose matching SHA/digest/protocol health; any dirty tree, HEAD mismatch, artifact change, or binding-manifest drift blocks deployment. Global control remains `halted` and all clients remain `off`.
4. **Per-client indexing/backfill approval:** name exact clients and budget, enter `enabled` + `indexing`, backfill, provider-confirm, and reconcile; no live queries are embedded.
5. **Per-client shadow-processing approval:** name exact clients, sample ceiling, retention/legal evidence, and budget before normalized live queries may reach Workers AI/Vectorize; visible ranking remains keyword-only.
6. **Per-client assist approval:** require the unexpired, unrevoked two-person evaluation approval and seven-day shadow evidence before selected `agency_ai` clients enter `assist`.

### Rollback and incident cleanup

- Functional rollback switches global control to `halted`, pauses the consumer through the guarded command, verifies no provider admission uses the new control revision, accounts for every bounded pre-revision admission until it settles or its lease expires, leaves keyword search available, and relies on the one-row-per-entity dirty set to bound backlog growth.
- Privacy/security cleanup switches to `delete_only`, rotates service/analytics/confirmation secrets, runs authenticated per-client or full-index teardown, and confirms every namespace/vector absent before it can report purge success. Query/upsert code remains disabled throughout.
- `halted` never claims teardown complete; an operator must deliberately enter audited `delete_only` or wait for provider recovery.
- Runbook capacity thresholds warn at 60% of dirty/operation budget, page at 80%, and fail new indexing approvals at 90%. Coalescing and reconciliation preserve the latest desired state.
- Resume is a forward-fix sequence: verify database/provider/protocol health, drain deletes first, reconcile dirty high-watermarks, redeploy compatible components if needed, then explicitly return to `enabled`; no automatic semantic reactivation occurs.
- Additive tables/revisions safely remain. The rollback drill proves queue pause/resume, N/N-1 protocol compatibility, delete-only teardown, secret rotation, bounded backlog, and keyword availability.

## Primary technical references

- Cloudflare Vectorize namespaces: https://developers.cloudflare.com/vectorize/best-practices/insert-vectors/#namespaces
- Cloudflare Vectorize metadata filtering: https://developers.cloudflare.com/vectorize/reference/metadata-filtering/
- Cloudflare Vectorize client API: https://developers.cloudflare.com/vectorize/reference/client-api/
- Cloudflare Vectorize limits: https://developers.cloudflare.com/vectorize/platform/limits/
- Cloudflare Vectorize pricing: https://developers.cloudflare.com/workers/platform/pricing/#vectorize
- Cloudflare Queues Wrangler configuration: https://developers.cloudflare.com/workers/wrangler/configuration/#queues
- Cloudflare Queues retries: https://developers.cloudflare.com/queues/configuration/batching-retries/
- Cloudflare Queues dead-letter queues: https://developers.cloudflare.com/queues/configuration/dead-letter-queues/
- Cloudflare Queues retention announcement and command: https://developers.cloudflare.com/changelog/post/2025-02-14-customize-queue-retention-period/
- Workers AI BGE model contract: https://developers.cloudflare.com/workers-ai/models/bge-base-en-v1.5/
- Workers AI data usage: https://developers.cloudflare.com/workers-ai/platform/data-usage/
- Neon schema-only branch behavior: https://neon.com/docs/changelog/2025-01-31
- Neon CLI `--schema-only` support: https://neon.com/docs/changelog/2025-02-07

Implementation must recheck these current official references before using provider-specific syntax or changing infrastructure.

## Completion definition

### Implementation verified

The implementation is verified only when evidence proves all of the following:

- agency and portal search authorization is server-owned and tested;
- record/client/organisation isolation fails closed;
- visible keyword behavior remains stable in `off` and `shadow`;
- semantic candidates are namespace-filtered and reauthorized in Postgres;
- no response trusts vector metadata;
- the dedicated index and queue contracts exist in code and runbooks;
- trigger-backed durable indexing covers every relevant CRM mutation path;
- revisions, provider-pending confirmation, retries, reconciliation, multi-schema deletion, client teardown, and DLQ behavior are tested;
- rollout, global halt/delete-only controls, budgets, deadlines, telemetry, and audit controls work;
- raw queries and unrestricted source text are absent from telemetry, queue payloads, vector metadata, and logs;
- the unsafe legacy endpoint is gone;
- public claims accurately describe the gated capability;
- every focused/security/migration/provider-contract gate and production build passes, and the full suite has no regression from exact same-machine base-SHA evidence;
- the branch has undergone adversarial code/security review;
- a real non-production provider E2E and frozen-dataset evaluation are attached to the implementation Git SHA; and
- no production resource provisioning, database migration, deployment, client indexing, shadow processing, or assist activation has occurred without its matching explicit approval.

### Production rollout complete

Production rollout is a later, separately approved outcome. It is complete only after the applicable staged approvals, guarded Pages and worker deployment, resource-manifest reconciliation, selected-client indexing and shadow evidence, rollback verification, and—only under the distinct assist approval—an audited transition of selected `agency_ai` clients to `assist`. Shipping code with every policy `off` does not by itself claim semantic search is active.
