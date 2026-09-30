# Native customer managed CMS page saves

This RND-22 increment connects the native customer checkpoint endpoint to the
existing managed CMS graph coordinator. It applies only to an **already managed**
customer staging preview. It does not expose customer browser routes, adopt a CMS,
change collection schemas or records, grant AI/source access, or publish a site.

## Native authority and transaction ordering

The CMS principal has source `customer-session`; its only mutation is
`customer-checkpoint`. It retains the original native login, immutable child
session, workspace owner membership, business ownership, staff-approved preview
policy and exact entitlement. It is never converted into an agency or portal
identity. Every graph snapshot, replay and final commit rechecks native authority.
The customer branch preserves account/identity/session → workspace/owner →
site/entitlement → child lock ordering and a three-second lock timeout. A final
wall-clock recheck rejects expiration during work and rolls back its changes.

Scope must match all native tenant/business/site/environment fields. Both the
configured content environment and signed preview authority must be staging.
Other CMS mutations and customer use of legacy authority projection are denied.
Feature/AI acceptance, history restore and CMS adoption explicitly reject the
customer principal. Existing agency/client behavior remains on its existing path.

## Immutable storage and atomic visibility

The private customer checkpoint endpoint first discovers managed status under
native authority, then releases the transaction. The graph coordinator performs
its bounded, digest-verified checkpoint, component/action artifact and scoped
CMS storage reads outside SQL locks. The Studio typed-storage adapter from PR112
verifies document content and ETag before making this request; the Dashboard
independently verifies the graph against immutable scoped bytes.

The final transaction compares the accepted application/checkpoint snapshot,
retains all component/action/schema selections, checks the page allowance, and
commits the checkpoint, application, both current pointers, operation receipt
and audit together. Stale saves conflict rather than overwrite. Exact retries
recheck native authority and return the existing receipt without duplicating the
application. Remote read failures, changed authority or any SQL failure leave
both accepted pointers unchanged. Generic metadata commits still reject managed
site bypass, including a site that becomes managed after initial discovery.

Audit actor role is `customer`; checkpoint metadata retains customer session,
workspace and user IDs. Original-login hashes remain internal operation identity,
not a browser response or publication grant. Customer saves intentionally omit
legacy staging provenance and create no version submission or publication job.

## Private configuration and rollout

Existing customer-session machine authentication, distinct JWT verification,
staging enablement and exact origin configuration remain mandatory. Only these
server-owned fields are forwarded to the CMS coordinator:

- `PAGE_STUDIO_CONTENT_ENVIRONMENT=staging`
- `PAGE_STUDIO_CHECKPOINTS`
- `PAGE_STUDIO_CONTENT_ROUTER`
- `PAGE_STUDIO_CMS_OBJECT_TRANSPORT` (when placed-fetch is required)

Request bodies cannot choose bindings, environment, login credentials or storage
targets. Missing/foreign configuration fails closed. No new migration is needed.
The new PostgreSQL suite runs in disposable local schemas and is added to CI's
existing customer-workspace database gate.

## Acceptance and remaining work

Local focused verification covers 17 new customer PostgreSQL cases, 20 existing
customer session cases and the existing CMS graph/authority/HTTP suites (90 cases
total). It includes real graph validation with a retained component artifact,
atomic rollback, concurrent saves, immutable replay, logout during storage,
expiry before commit, scope/author/environment mismatches and rejected unrelated
operations. HTTP tests also verify the four server-only bindings. Focused lint
passes; server TypeScript matches the exact pre-existing 289-diagnostic baseline.
Production build passed with the unchanged artifact guard: 25,418,365 raw bytes
against 25,468,928 (50,563 remaining), and 6,936,486 gzip bytes against 9,750,000.
The broad run also exposed an existing Astro quota test using a local month
boundary while admission uses UTC. Its fixture now uses explicit UTC and covers
UTC/Melbourne sessions; production quota behavior is unchanged. Run tests after
Nuxt build completes, since build regenerates the `.nuxt` TypeScript files. CMS
suites share a disposable `studio_cms_activation_*` database name to satisfy the
strictest local-database guard. The final full run passed 15,907 tests across
2,199 files, with 993 environment-dependent skips. The filesystem-wide CRM route
scan ran separately (54 passed) to avoid its concurrent fixture scan collision.
Independent review found no Critical, Important or Minor defects and separately
passed the 17 new native cases. Remote CI receipts are retained in the PR and PRD.

Customer CMS adoption, browser/Sandbox session lifecycle and launch/return,
hosted customer database/bucket/runtime isolation, and live save/reload/QR
navigation acceptance remain required. Storage in these tests is a scoped fake;
real PostgreSQL transactions do not prove hosted Cloudflare resources. No Ready
state, marketing claim, production deployment or public enablement is introduced.

The follow-on [customer CMS adoption adapter](page-studio-customer-cms-adoption.md)
adds a separate `workspace:create` setup path against verified managed storage.
Checkpoint-only authority still cannot run adoption or unrelated CMS mutations.
