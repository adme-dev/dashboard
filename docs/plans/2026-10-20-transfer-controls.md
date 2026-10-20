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

## Task 4: Release, hosted acceptance and scoped Pi activation

Use fresh current main, independent review, passing exact-tree CI and guarded
releases. Apply additive migrations with preserved-row evidence. Deploy management
before Pages. Renew acceptance through approved configuration/plan workflows only.
Use the two previously verified native accounts, genuine owner/operator logins,
full page/object/Forms copy, limits/uncertain recovery/final selection, and retained
live/domain readback. Exercise role/cross-site/logout/expiry denials. Only after
passing enable a site-scoped Pi canary, test a draft proposal in editor without
publishing, verify cancellation/reconnect and other sites remain denied. Record
exact source/deployment and retire merged owned branches.
