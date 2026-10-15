# Customer launch completion — 15 October 2026

Continues the domain launch ledger and the customer CMS status checklist. This is
an implementation checkpoint, not evidence that customer self-service is live.

## Recovered baseline

Fresh branch starts at main `6b82be128f29101324f4d3db7930ec30f45d1d7d`.
Cloudflare readback identifies this same source on production Pages deployment
`630ec0a3-4db8-4b4c-98a8-bcd635314be1`. The original Dashboard working tree is
unrelated and remains untouched. The earlier temporary domain checkout no longer
exists; its merged history remains on main.

The user supplied two test mailboxes for hosted account/form acceptance. Keep
their addresses in the private acceptance record; do not infer other recipients.
The Cloudflare browser still requires sign-in. The last verified domain-provider
failure is HTTP 403; credential repair and the retained test-hostname verification
remain outstanding.

## Publication boundary

The existing agency publication transaction is extended for invited portal
clients. It requires an active admin/manager account in the site's business,
editor membership for the exact tenant/client/site, a current original portal
session and login binding, and an active entitlement with domain capacity.
Checks run before and after publication SQL. A change during the operation rolls
back its effects. No role, allowance or membership is granted by this work.

Portal login preparation reads the retained binding after registration: repeated
login resolution gives a new in-memory issuance timestamp, while the original
binding intentionally retains its first timestamp. This avoids rejecting an
otherwise valid returning publisher. Revoked bindings remain denied.

This boundary does not accept standalone native customer identities; their
session/workspace model remains separate. Launch UI, production artifacts and
hosted acceptance remain required before enabling self-service.

Validation: both admin/manager admission tests failed before implementation;
41 real PostgreSQL portal authority cases pass after implementation, including
access withdrawal before and during a transaction. The full selected agency,
Astro, runtime route and portal preparation group passes 135 tests. Changed-file
lint passes. No new migration, deployment, customer publication or test email has
occurred at this checkpoint.

## Portal release integration

Migration 452 adds separate client publisher/updater references alongside the
existing staff references. Constraints prevent a row from carrying both kinds.
Publication and rollback audits retain the real actor kind, and idempotency cannot
be reused across staff/client actors even when UUIDs match. Historical service
audit rows remain replayable by the original agency publisher. Agency release
history displays client publisher names within the same client scope.

The additive migration was applied to the configured database on 14 October at
22:03:37 UTC. Before/after snapshots verified all sites, entitlements, retained
release fields and live pointers unchanged. The new constraints are validated.
The application has not been deployed with these changes.

The portal now has local production-only static activation and rollback handlers.
They require an authenticated same-origin JSON request, strict input, an explicit
expected live release and an idempotency key. Ownership and actor identity come
from the original authenticated session. The selected domain must belong to the
exact site and have verified ownership, DNS and HTTPS. Access/domain checks run
before artifact reads and again inside the publication transaction. Remote
artifact verification runs outside database locks. Only retained approved
production Astro artifacts are accepted; runtime and feature release activation
remain separate and fail closed here.

The combined agency/static/runtime/portal test group passed 361 cases with one
existing conditional skip. A further rollback actor-kind regression was added
during review. Full-suite and final typecheck results are recorded separately;
the existing repository typecheck is not clean. No customer release was activated
and no test email was sent. Browser readback confirms the preview signup window
is expired; Cloudflare still shows its login page.

## Remaining work (preserved)

- Customer-facing launch controls and native-customer publication integration;
  invited portal backend integration is implemented locally.
- Production compiler registration and approved artifacts for imported sites.
- Cloudflare service credential repair and isolated end-to-end DNS/TLS proof.
- Hosted form insertion, per-form/shared settings, template/media and delivery
  acceptance; viewer/membership/capability withdrawal tests.
- Native progress-card accuracy and editor/save performance.
- Current-main release and live verification, including QR Codes and all four
  existing previews. Customer production activation remains separately gated.
- Public documentation/marketing only when the corresponding customer-facing
  functionality is actually available.

## Preview acceptance window and final checks

The full serial suite passed: 2,270 test files and 16,122 tests, with 76 files and
2,144 tests skipped. The production build passed its raw/gzip Worker budgets.
Typecheck remains unsuccessful with 943 repository diagnostics; none identified
in the changed publication source. This is not a clean repository typecheck.

A new preview-only native sign-in window is restricted to the two user-supplied
mailbox hashes and expires 15 October 2026 at 10:30 UTC. Original workspace
preview/build approvals retain their expired timestamps; this does not renew
their grants, change customer roles or enable production signup. Close this
window when hosted acceptance finishes. Configuration alone does not prove
email delivery, account creation or customer publishing.

## Hosted preview readback and expired-capacity fix

Guarded preview deployment `51dbd832-48ed-410a-8445-5aa01efe03f9` serves source
`c5a61cc0acdc667979adbc92e8d44150492a8ab9` at the stable preview alias. Cloudflare
readback confirms production remains `630ec0a3-4db8-4b4c-98a8-bcd635314be1` from
main `6b82be128`. Migration 452 is also applied to the isolated staging branch;
all four constraints validated and retained release/pointer digests unchanged.
All four existing customer previews return HTTP 200 with no-store responses.

The hosted native dashboard exposed a 403 when optional CMS availability reused
expired preview authority. Availability now independently rechecks the current
native login and workspace owner before returning false. CMS setup reads and
mutations still require the full unexpired preview authority. Real PostgreSQL
regressions reproduce both expired capacity and no-preview failures before the
fix, and cover four native access withdrawals. The targeted group passes 31
tests; independent source review found no blocking issues. This follow-up is
not yet included in the preview deployment above.

A normal sign-in email was requested for the first supplied mailbox through the
UI. Inbox delivery and completion of the link remain unverified. The original
two native preview policies and entitlements are expired and have not been
extended or replaced. Fresh hosted CMS/editor acceptance therefore still needs
a supported, reviewed test-site lifecycle; changing the signup window does not
authorize an expired site.

## Customer launch-status summary

The invited customer website workspace now has a read-only launch summary above
its domain controls. It separates saved visitor pages, current-version approval,
and recorded production publications. A retained publication pointer is not
presented as proof that DNS, HTTPS or the public website is reachable. Storage
failure reports approval as unknown; a failed refresh hides retained success.

The new portal HTTP endpoint accepts only the selected site ID and derives the
actor/client from authenticated portal access. The management Worker resolves
the tenant from current exact site membership. Checkpoint queries include client
scope, and access is checked again before returning the result. The initial
read does not hold authority row locks over object storage; the final read does.
Mutation authority retains locking regardless of the new read option. No publish,
role, quota, domain or account mutation is performed by this summary.

Deployment requires the matching management Worker first, then the dashboard.
It remains in preview verification until signed-in browser acceptance succeeds;
this does not complete customer publishing or the provider credential repair.

Validation: 103 focused inspection, HTTP, UI, domain and workspace tests passed,
plus 62 disposable PostgreSQL domain tests. The latter includes a real separate
connection withdrawing membership between the unlocked initial read and final
authority check. Withdrawal completes without waiting for the inspection, and
the final check denies access. Management Worker strict typecheck and dry build
passed. Independent review findings were corrected before commit.

## Customer approved-build review attribution

Candidate preparation now preserves invited customer identity in build-completion
and preview-registration audits, release/pointer client foreign keys and signed
review grants. Staff attribution remains unchanged. Repeated registration returns
the retained preview without rewriting its original creator.

Preview-only customer grants recheck the original portal login, active business,
admin/manager role, exact editor membership, active entitlement and positive
domain capacity on every read. Ordinary editor grants retain edit-only authority;
a real PostgreSQL regression confirms they still work without publishing capacity.
This supports the future portal candidate endpoint; it does not yet expose that
endpoint, add launch controls, support standalone native identities or activate
any customer website.

Validation: the new tests first reproduced eight failures (incorrect audit role,
staff-only foreign key and incorrectly labelled grants). Attribution fixes then
left two demonstrated revocation failures for withdrawn role/domain capacity.
The completed candidate PostgreSQL suite passes 83 tests; the session-authority
PostgreSQL suite passes 74 tests, and the adjacent delivery/session/HTTP/portal
regression group passes 98 tests. Changed-file lint and independent review pass.
All database testing uses a disposable localhost instance. No migration change
or production mutation is part of this slice. Hosted acceptance remains pending.

## Invited customer candidate HTTP adapter

The portal now has a production-only `versions/:versionId/candidate` POST. It
requires the original customer login, same-origin JSON, bounded observed bytes,
strict path/body/query/header values and a fresh scoped publisher check before
compiler configuration or artifacts are inspected. The server selects tenant,
client, compiler and review hostname. It can prepare only an already approved
static version. It cannot activate a hostname or request a runtime release.

Every reservation/completion/registration/session transaction uses the same
publisher and static-delivery wrapper. Static mode is checked before and after
SQL under the site lock, including after remote work. Review caught the initial
preflight-only race; regressions now simulate a runtime switch during build,
preview registration and session issue. No preview credential is returned.

The real-H3 boundary and adjacent agency/portal/inventory group pass 65 tests.
Request limits are exercised without a Content-Length header. Independent
follow-up review found no remaining blockers. The route inventory is now 2,251
files / 1,224 mutation files; the new route registers no God-mode bypass. This
adapter is not yet a customer-facing launch control or a native-customer adapter.

Next UI integration should use current portal domain `canManage`/site readiness,
exact approved checkpoint/version/digest and the existing credential-safe preview
opener. Retained responses must be discarded on site/source changes or failed
refreshes. Native-customer identities still require their own session adapter.

The first repository typecheck reports 943 diagnostics, including the existing
preview-permission literal widening in delivery.ts. That changed helper now has
an explicit closed permission type. Delivery/runtime/candidate follow-up tests
pass 39 cases. The follow-up repository typecheck completed with 939 diagnostics, none in the
candidate adapter or delivery helper. The repository typecheck is not clean.
This is not hosted acceptance.


## Invited customer approved-preview controls

The customer launch summary now offers preparation/opening only when current
management authority, static delivery, known unsealed saved content, current
approval, active access and a selectable production compiler are all present.
The management service returns capability from its final authority read; missing
compiler/signing/hostname/checkpoint-storage configuration is unavailable rather than an actionable
button that always fails.

The UI pins site/version/checkpoint/digest, refreshes before dispatch and after
completion, rejects mismatched build/release identities and retains credentials
only in component memory. Synchronous invalidation discards a response even when
access disappears and returns during the request. Retries reuse the preparation
key, concurrent clicks do not dispatch twice, and opening is a separate user
click through the existing POST-only preview opener. Expired credentials are
discarded. No hostname activation is part of these controls.

108 focused HTTP, inspection, capability and UI checks pass (including 22 UI
cases); changed-source lint and management strict typecheck pass. Independent
review found no blockers. The newest repository typecheck also completed with
939 diagnostics and none in changed source. CI 38653369464 for earlier source21a691e16 completed
successfully; this result does not validate the later endpoint/UI commits.
Authenticated browser acceptance remains pending: the native mailbox tab is
still at Check your inbox with its old expired link, and Cloudflare remains at
its terms-bearing sign-in page. Neither action was repeated or bypassed.
The production compiler registry and native-customer adapter remain separate
unfinished work. Existing preview and production deployments remain unchanged.


## Native customer publication authority prerequisite

The native-session adapter derives the exact site/business/workspace and actor
from a verified login token. A SQL-only publication boundary retains that original
session hash and account/identity throughout an operation, checks current access
before and after its callback, and refuses concurrent authority changes rather
than waiting on stale state. Owner/manager membership is required. The native
business owner must match the site, without a legacy agency binding.

Publication additionally requires an active, non-preview entitlement with positive
site/domain capacity and the JSON boolean `publishingEnabled: true`. This is an
explicit trusted plan capability; missing metadata, a string value, cancelled or
expired plans and the immutable `customer_preview_v1` plan are denied. The adapter
never writes entitlements or upgrades existing preview accounts. The next plan
management integration must assign this capability through an authorized audited
flow rather than modifying test receipts.

This is an internal prerequisite, not a customer-facing launch feature. Native
actor attribution in release/pointer persistence, HTTP and coordinator adapters,
exact artifact/domain checks and customer controls remain required. No new route,
production grant, migration or deployment is introduced. Marketing pages remain
unchanged until the native feature is usable. The original invited portal and
agency authority contracts are unchanged.


Validation: 51 new PostgreSQL cases first failed with the missing adapter and then
passed. The combined native signup/workspace/form/publication and invited portal
group passed 192 tests. An additional natural session-expiry rollback regression
brings the native publication suite to 52 passing cases. Changed-source lint and
independent review pass. Server TypeScript reports 295 repository diagnostics,
none in the new adapter; this is not a clean repository typecheck. CI now includes
the new PostgreSQL suite. All fixture users, plans and effects were confined to a
disposable localhost database; no real customer's entitlement was changed.


## Native publisher release attribution

Static activation and rollback now retain a separate native identity foreign key
and `customer` audit role. Idempotent retries require the original actor kind as
well as actor ID; a matching UUID from a portal or staff account cannot replay a
native customer's request. Pointer updates clear attribution for the previous
actor kind, including a later staff runtime activation or rollback. Existing
staff and invited portal behavior remains covered by the regression suite.

Migration 453 adds two nullable identity references and two exclusivity checks.
It was applied to the configured database and the isolated staging branch on
15 October at 00:18 UTC. Transactional before/after digests verified sites,
entitlements, retained releases and live pointers unchanged. All four added
constraints are validated. Initial verification attempts rolled back before
commit: the preservation query incorrectly assumed a pointer `id` column, then
its constraint-name filter missed PostgreSQL's truncated generated FK name.
The corrected checks use the composite pointer key and referenced table.

The real PostgreSQL release/Astro/runtime/feature group passes 259 cases with one
existing conditional skip; a further staff runtime takeover regression passes in
the 15-case runtime suite. Adjacent publishing/HTTP checks pass 46 cases.
Independent review and changed-source lint pass. Server typecheck still reports
295 repository diagnostics, none in changed source. No customer HTTP publication
route is enabled by this increment, and no customer website was activated.
Native candidate/build/session adapters and launch controls remain outstanding.
