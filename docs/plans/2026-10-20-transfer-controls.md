# Native customer transfer controls and Pi activation

Approved scope: complete the existing customer/operator transfer controls,
account-isolation acceptance, and scoped Pi activation. Continue within the
user's existing implementation, release and browser authorization.

## Architecture and decisions

Reuse the deployed transfer engines. Add retained consent and thin, explicit
browser actions; never expose private authority or worker envelopes. SQL request
admission may reuse exact native owner/plan checks, but every effect must retain
full transfer authority. Only native standalone accounts qualify. The four legacy
client sites are not substitutes for the native acceptance identities.

A customer requests preparation; a genuine operator reviews the exact saved
source; the customer approves that review; the same operator reserves one stored
operation. One explicit action advances one existing phase. Preparation changes
production authoring, not the currently published site or DNS. Source changes
require a fresh review before reservation. Original-session expiry after reservation
stops safely with needs-attention; never rewrite immutable intents or extend a
session. Completed transfers recover connection/retention under current ownership.

## Task 1: Retain customer request, source review, approval and reservation

Own migration 472, shared transfer-controls schemas, a private management module,
and focused PostgreSQL tests. States: requested, reviewed, approved, reserving,
reserved, revoked. Public views can additionally show expired/needs-attention.
Store original owner hash, current entitlement, pinned genuine operator hash,
review summary/digest, revision, expiry and a server-created operation UUID.
Allow only one active request per site. Request UUID is an idempotency key, never
an authorization capability. Bound all public outputs; no hashes/private keys.
Use request-row CAS and original authority around effects. Reserve can be retried
only with the retained operation identity; recover a saved intent after lost
acknowledgement without creating another. Cancellation ends before reserving.

Verification: real PostgreSQL original/foreign owner, role, plan, expiry/logout,
operator replacement, competing requests, duplicate/revision replay, changed
source, cancelled request, lost reserve response; migration preservation.

## Task 2: Private workflow transport and explicit phase actions

Add fixed private RPC for controls and thin trusted Pages wrappers. Each HTTP
route derives the current real principal from its cookie, bounds JSON and queries,
checks exact origin/no-store/rate limits and revalidates after remote work. Public
phase actions resolve retained intent privately; never accept hashes/digests or
raw provisioner payloads. Preserve current request identity on uncertain calls.
Server steps: resources, source execution, source drafts, destination catalogue,
destination execution, copy admission, copy execution, Forms history, completion.
Status reads never advance or reserve. Verify each response identity and digest.

Verification: route role/origin/body/unknown field denial, no side effects on GET,
real private Worker entrypoint/HTTP rejection, source/plan/session revalidation,
uncertain acknowledgement. Strict Worker typecheck, lint, bundle guard.

## Task 3: Customer and operator browser controls

Use Nuxt UI and the existing studio typography/semantic tokens. Customer sees
preparation request, exact reviewed website and approval, saved progress, then
production editor connection. Operator sees request queue, review/reserve,
current next step, Refresh, and explicit Resume/Verify/Complete confirmations.
Keep implementation identifiers out of customer flows. Invalidate stale responses
and confirmations across account/site changes; disallow double mutations.

Verification: component tests, keyboard/mobile/dark mode, real signed-in browser
workflow, refresh/lost response and account switch. Update relevant feature pages
with delivered capabilities only.

## Task 4: Connect native source previews to the production control plane

Hosted inspection found that genuine native test accounts exist only in the
staging database. Production has no native accounts or transfer intents. Ordinary
production signup therefore needs an isolated source-preview path before the
reviewed transfer can be exercised. Do not copy identities or change existing
shared staging callbacks.

Add trusted customer-specific selectors for native preview provisioning, CMS,
editor launch/session exchange and authenticated machine callbacks. Keep logical
source content staging and production destination content production. Select
source versus completed destination from authenticated retained state; never
accept an arbitrary service/environment from the browser. Reuse existing native
owner, plan, job, ticket and session validators on both sides of every effect.

Prepare separate native-preview coordinator, executor, content router, registry
and source-editor origin. The executor uses the production control-plane proxy.
Use an isolated provisioning registry so existing staging cron cannot claim jobs
for production accounts. Preserve the exact staging dispatch namespace contract.
Connect transfer source reads to the same isolated registry/router/checkpoints
without changing established site bindings. Existing native runtime policies stay
scoped to genuine approved sites. Apply registry migrations and preserve current
production/staging deployment settings.

Verification: default-off selectors, unknown/missing bindings, forged actor and
scope, foreign native ownership, old staging and production-destination regression,
real callbacks through the private control plane, and current-main guarded source
and deployment receipts. New accounts use ordinary email verification and setup.

## Task 4b: Retrieve the existing public verification key for trusted deployment

Add a read-only operator-authenticated endpoint that returns only the validated
public session verification PEM and configured issuer. Reuse fresh built-in
owner/admin authority; reject guests/custom mismatches and unauthenticated users.
Never read or return the private signing key, cookies, tokens or arbitrary env
values. Validate the PEM as the expected public algorithm; fail closed without
logging raw values. No-store, fixed fields and tests for malformed/private PEM.
Use it to install the same verification key in the isolated preview editor.

## Task 5: Release, hosted acceptance and scoped Pi activation

Use fresh current main, independent review, passing exact-tree CI and guarded
releases. Apply additive migrations with preserved-row evidence. Deploy management
before Pages. Renew acceptance through approved configuration/plan workflows only.
Use the two approved real mailboxes through ordinary native signup, genuine owner/operator logins,
full page/object/Forms copy, limits/uncertain recovery/final selection, and retained
live/domain readback. Exercise role/cross-site/logout/expiry denials. Only after
passing enable a site-scoped Pi canary, test a draft proposal in editor without
publishing, verify cancellation/reconnect and other sites remain denied. Record
exact source/deployment and retire merged owned branches.

## Task 5b: Required bounded destination editor activation

The paired `productionEditorEnabled` / `productionEditorOrigin` fields extend the
existing strict activation bundle without adding Pages bindings. Older five-field
bundles remain source-only; scalar-only deployments retain their prior behavior.
Only the two reviewed native workspaces within the unchanged approval window may
open or use the completed production editor. Current owner, original session,
pinned publishing plan, completed managed origin and storage/head checks remain
required. Source projection validates the original bundle before selecting source
configuration; raw duplicate production keys never bypass strict parsing.

The matching private management deployment carries the same exact bundle and
checks verified workspace scope and expiry using the database clock inside its
existing CMS authority fences. Release matching management before Pages; no new
private request fields, JWT capabilities, migrations or quota changes. Pages stays
at 150 bindings. Studio production customer flags and exact retained-scope domains
remain separately reviewed prerequisites to hosted destination acceptance.

This prepares destination editing only. Task 5 Pi remains the existing separately
scoped agency canary after native owner/isolation acceptance. Native customer Pi
continues to deny; this change enables neither Pi nor customer Forms UI.
