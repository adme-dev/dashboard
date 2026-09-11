# Booking site integration — 9 September 2026

Status: deployed to preview; private Worker staging checks pass. Authenticated
Dashboard-to-Worker booking acceptance and production rollout remain open.

## Dashboard boundary

Agency queue, driver sheet, operator commands, portal history and portal enquiry
creation now require an explicit website UUID. The server queries the current
site and its matching tenant/client entitlement on every operation. Portal reads
require a viewer/editor membership; enquiry creation requires editor membership.
Agency commands require `PAGE_STUDIO_APPROVE`; agency reads require
`PAGE_STUDIO_VIEW`. Agency tenant selection is checked against the server-owned
Xero organization connection, matching the existing business-content boundary.
A future multi-agency membership model remains separate work.

Access also requires an active/draft site, an effective active/trial entitlement,
and `plan_metadata.allowedModules` containing `bookings`. Missing module metadata
fails closed. The caller cannot provide a business ID, environment, operator
identity, quote, vehicle assignment or initial status in an enquiry.

The selected private RPC binding receives full tenant/client/business/site/
environment scope. Every returned booking is schema-checked and scope-checked.
There is no fallback to the former global `PAGE_STUDIO_BOOKINGS` binding. Errors
omit upstream details; responses carry `Cache-Control: private, no-store`.

Enquiries translate Dashboard `bookingId` to the Worker's canonical `id` and
remove `requestKey` from the booking payload. Commands remove the transport-only
`bookingId` before the strict Worker command parser. Operator response decoding
uses the `{ aggregate, event }` RPC envelope.

## UI behavior

Each booking surface has a paginated website selector. History/queue/driver-sheet
responses identify their site, so switching selection hides prior-site rows
immediately. Open operator dialogs close when the website changes. Commands send
the site associated with the selected booking. The Nuxt UI table action slot is
corrected from `actions-data` to `actions-cell`.

The portal keeps the enquiry request ID during retries, prevents concurrent
submits, resets its Turnstile widget after attempts, and navigates back to the
submitted website. The endpoint refuses submissions if server Turnstile
verification is unconfigured or fails.

## Required configuration

These are private Cloudflare runtime bindings, not public Nuxt configuration.
For each environment, configure:

- `PAGE_STUDIO_BOOKING_ENVIRONMENT`: `preview`, `staging` or `production`.
- `PAGE_STUDIO_BOOKING_BINDINGS`: JSON array with one unambiguous entry per site:

```json
[
  {
    "scope": {
      "tenantId": "actual-tenant",
      "clientId": "actual-client",
      "businessId": "actual-business",
      "siteId": "11111111-1111-4111-8111-111111111111",
      "environment": "staging"
    },
    "bindingName": "BOOKING_SITE_ONE",
    "entrypoint": "ScopedBookingsEntrypoint"
  }
]
```

`BOOKING_SITE_ONE` must be a real Cloudflare service binding to the Business
Content Worker's named **ScopedBookingsEntrypoint**, with exactly the same
`AUTHORIZED_SCOPE` and the intended isolated `CONTENT_DB`. JSON metadata alone
does not create or verify a service binding. Never bind this integration to the
legacy default entrypoint. The example IDs above are illustrative, not deployable
client configuration. Configure the actual site membership, booking entitlement,
and Turnstile widget/secret before testing customer submissions.

## Verification and remaining work

- Focused adapter/API tests: 44 passing across six files, using real adapter code
  and mocked authentication, database results and RPC services.
- Mounted booking-queue tests: three passing; reproduced the missing actions
  before fixing the slot, exercised site-switch row/dialog clearing and verified
  the site's command query.
- Page Studio regression: 252 passing; one database integration test skipped.
- Scoped ESLint passes. These checks do not prove remote PostgreSQL/D1 identity,
  Cloudflare bindings, browser presentation or a deployed end-to-end journey.

BOOK-07 remains open until two actual authenticated client sessions exercise the
staged Dashboard-to-Worker boundary. Foundation commit `c86a033` adds the operator-only terminal `rejected` status,
with full build/typecheck/lint and 2,484 tests passing. Deploy that protocol
version or later before enabling the Dashboard action.
Remote deployment must then verify quote/approval/hold/email orchestration;
`ScopedBookingsEntrypoint` currently dispatches booking state events, and does
not by itself complete the hold/email workflow.

Remaining UX/operational work: date/time picker with timezone policy instead of
raw timestamp entry; fleet/availability selection; complete queue/dispatch
pagination (currently bounded results); enquiry retry recovery after an accepted
write whose response was lost; role-aware operator controls; real-browser
acceptance; live Turnstile and verified service configuration. Capture these in
BOOK-03/BOOK-05/BOOK-06 rather than treating the local tests as launch signoff.

### Final local checks

The full Dashboard test run passed 13,119 tests and skipped 31, with five browser
assertions failing because the sandbox blocked Chrome and two Worker suites
unable to bind local ports. The four affected suites plus the final booking
queue regression were rerun outside the sandbox: five files / 28 tests passed.
No assertions were weakened or skipped to obtain that result.

`pnpm typecheck` completes with 926 diagnostics in untouched files and **zero
in this increment's modified/new files** after correcting typed table columns
and click handlers. This is not a clean repository-wide typecheck. Scoped ESLint
and `pnpm deploy:check` pass; the immutable Pages target is `agency-dashboard`.
The initial direct `nuxt typecheck` attempt exhausted the default heap; the
repository's `pnpm typecheck` script supplies the required 16 GB ceiling.

The full test run exercised the preceding compiled Worker bundle; it is not
proof that this increment has been built or deployed. Fresh build/deployment and
staging booking acceptance remain required.

### Guarded preview attempt

The fresh `pnpm deploy:preview` build of `1e4b66194` passed the unchanged size
guard: raw 25,055,940 bytes (412,988 bytes remaining); gzip 6,581,775 bytes.
Wrangler then failed uploading assets at 252/921 with `EPIPE` and
`UND_ERR_CONNECT_TIMEOUT`. Remote preview readback still identifies
`54e83ed7-44ae-47f2-b4d6-765f0ef6e9c3`, source `1384a3e`. No new preview or
production deployment was created. RELEASE-01 remains open. Logs are
`/private/tmp/page-studio-booking-preview-deploy.log` and
`/private/tmp/page-studio-booking-preview-wrangler.log`.

Foundation GitHub Linux CI exposed an undeclared `zod` dependency in the Business
Content Worker's existing Cloudflare email event adapter. Local dependency
resolution had masked it. That manifest/lockfile repair is being verified in the
foundation worktree; the earlier local green result is not a green remote CI
claim.

Dashboard CI `34256840416` passed for `1e4b66194`. Duplicate CI `34256846349`
failed only on 30-second timeouts in the desktop/mobile governance scroll tests
(`test/app/aiGovernanceControlPlane.test.ts`). Those cases pass locally and in
the other CI run; the exact stalled browser operation is not yet identified.
The ledger retains this intermittent failure for investigation. Neither run
executed a deployment job.

### Manual GitHub preview upload path

The CI workflow now offers `release_action=preview` on manual dispatch. It waits
for the existing build/full-suite/social/target-guard CI job, checks out the exact
workflow SHA, and runs `pnpm deploy:check` followed by `pnpm deploy:preview` on a
GitHub runner. The preview job has a separate `preview_deploy` environment and a
serialized preview deployment group. The target remains `agency-dashboard` /
`preview`; production still uses its existing signed release path.

Only Cloudflare secret **names** were inspected: repository-level
`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` exist. Their validity/permissions
must be proved by the deployment, not inferred from their presence. No secret
values were read or changed. The origin smoke checks the preview alias; exact
Cloudflare deployment/source readback remains required after the job succeeds.

Dispatch the reviewed source branch with:

```sh
gh workflow run ci.yml --repo adme-dev/dashboard \
  --ref feature/page-studio-business-admin -f release_action=preview
```

Validation: YAML parses; four deployment/workflow contract suites pass 34 tests,
including a new regression requiring manual dispatch, CI dependency, exact-SHA
checkout and the fixed preview command. No build or assertion is skipped to
publish the preview. This path is implemented to investigate the local upload
transport issue; no successful remote upload is claimed until verified.

### Verified preview deployment and private staging services

Run `34279199633` completed CI and preview deployment successfully at
`0d4ee392200d0fa55e5f39d4c3ba640f17035bb6`. Cloudflare readback confirms preview
deployment `5d72b6f7-0acb-4a00-a474-71ed1fec259b`, source `0d4ee39`:
https://5d72b6f7.agency-dashboard-6cm.pages.dev . The booking page's Nuxt shell,
JavaScript and stylesheet return 200. Both anonymous booking APIs return 401.
This verifies upload and basic access denial; it does not verify a signed-in
booking journey. Production remains `60f2171`.

The GitHub build passed the unchanged artifact guard at 25,055,958 raw bytes
(412,970 remaining) and 6,581,773 gzip bytes (3,168,227 remaining).

Foundation `6ba824d` passes Linux and Windows CI (`34280451448`). Two private
staging Business Content Workers are now deployed with separate D1 databases
and all 16 migrations. The remote test proves content persistence/concurrent
write rejection, all five scope fields, customer-role denial, same-ID booking
isolation, rejection and replay. Direct D1 readback confirms one transition
event only in site A and no email queued. Resource IDs, repeatable commands and
limitations are in foundation `docs/research/2026-09-09-business-content-staging.md`.

These are synthetic service-level fixtures. The authenticated staging preparation
below now adds portal memberships/entitlements. BOOK-07 remains open until the
Dashboard preview is connected and authenticated service acceptance is completed.

### Authenticated staging identities and connection configuration

Verified the live Pages API's preview `HYPERDRIVE` and `HYPERDRIVE_FRESH` bindings
both use `3865ea5568234fc7b0e9e3e595a30286`. Hyperdrive's origin matches Neon's
`staging/page-studio` branch `br-long-mountain-a4f73v10`, project
`square-tooth-23821574`, database `neondb`:
`ep-raspy-water-a4v6q356.us-east-1.aws.neon.tech`. Wrangler's experimental config
download omits Hyperdrive, so the Pages API readback is necessary.

Executed `scripts/fixtures/page-studio-booking-staging.sql` on that exact branch.
It refuses a database containing anything other than the known initial synthetic
client/staff fixture, creates two additional clients/sites/entitlements and three
portal users, and gives each editor access to its own site plus one read-only
viewer for site A. No provider account, password, mail request or billing charge
is created. This seed intentionally refuses a second run; inspect existing
fixtures rather than overwriting them.

On preview `5d72b6f7`, all three identities passed real magic-link verification,
authenticated identity readback, consumed-link replay denial (401), foreign-site
booking denial (404), and logout/session revocation (401). Their own-site reads
reach the explicit missing-binding response (503). The test inserts ten-minute
hashed magic links directly into the isolated database; it proves verification
and sessions, not email delivery or the complete signup flow. The initial
headerless request returned 403; requests carrying same-origin browser headers
passed without modifying application controls. Independent Neon readback confirms
one consumed link/login per user and zero remaining sessions.

Evidence: `/private/tmp/page-studio-staging-auth-evidence.json` and
`/private/tmp/page-studio-live-config-status/safe-readback.json`. Local token files
are excluded from the repository and tokens have been consumed.

The reviewed preview configuration now maps those two site scopes to their
dedicated content Workers and `ScopedBookingsEntrypoint` service bindings.
Production and root bindings remain unchanged. Six focused config/API/adapter
suites pass 55 tests; scoped ESLint and `pnpm deploy:check` pass. The new connection
configuration still needs preview deployment and authenticated content/booking
read/write verification. Operator authentication, Turnstile intake, vehicle holds,
email orchestration and the customer launch remain separate open gates.

### Preview CI repair and browser acceptance follow-up

Preview run `34285354290` at `c7b949761` failed its full suite; deployment was
skipped. It exposed two stale config checks: the isolation test allowed only the
previous two services, and the asset test's handwritten TOML subset parser could
not read the new multiline JSON strings. Both failures reproduced locally. The
isolation check now asserts the exact six staging service/entrypoint objects;
the asset check uses the existing `smol-toml` dependency and retains every
production binding assertion. Production configuration is unchanged.

All 67 focused tests pass. The full local suite passed 13,122 tests, with five
browser assertions failing and two Worker suites unable to run because of Chrome
and localhost sandbox restrictions. The four affected suites pass outside the
sandbox (see `/private/tmp/page-studio-release-config-runtime-tests.log`). Scoped
ESLint and `pnpm deploy:check` pass. CI's separate 15-second CRM caller-scan timeout
did not reproduce in the focused or full local run; its assertions, source roots
and timeout remain unchanged. Track recurrence rather than claiming a timing fix.
No new application build is needed for these test-only changes; the failed CI's
application build passed, and the next release must still run its complete gates.

A real authenticated Kimi browser session on the existing preview displayed only
synthetic client A's assigned site. The site card has Manage content, Setup status
and Submissions links but no booking entry point; add discoverable site-scoped
booking navigation and verify it in the browser before closing BOOK-07. Browser
sign-in used a directly seeded synthetic magic link, not email delivery. Cleanup
verified `/api/portal/auth/me` 200 for the exact synthetic editor, logout 200,
then auth/me 401, and closed the sole test tab. No test browser session remains.

The subsequent local Cloudflare OAuth status read returned 401, so `60f2171`
remains the last verified production source, not a fresh readback. GitHub's
separate deployment credentials still need verification in the next deployment.
Foundation CI `34285497095` passed Linux but Windows hit two 10-second Git fixture
setup timeouts. Only the completed failed Windows job was rerun to investigate
transience; do not describe that retry as passing until it completes.

### Site-scoped booking navigation

Website cards now show a Bookings link when the current entitlement includes
bookings. The link carries that card's site ID to the audience's booking screen.
The action row wraps below its governance label so narrow cards can accommodate
all links. Marketing feature copy is synchronized. The site list LEFT JOINs its
matching entitlement by ID, tenant and client, preserving non-booking sites in
the list while returning a `bookingEnabled` display flag. Portal display also
requires a viewer/editor membership. The API and list share the same entitlement
predicate: active/draft site, active/trial entitlement, current effective window,
and a valid string-array module grant containing bookings. The flag grants no
authority; actual booking requests still recheck fresh scope and permissions.

The new server regression failed before implementation. Five focused suites now
pass 49 tests, including mounted portal/agency links, exact site query, reactive
removal, invalid grants and inactive entitlements. Full local tests run outside
the sandbox pass 13,146 tests with 27 existing skips (2,015 files passed, six
skipped). Typecheck retains 926 existing diagnostics, zero in modified/new files;
scoped lint and the deployment target check pass. A read-only query on the
isolated Neon staging branch confirms all three synthetic memberships produce
eligible rows under the new scoped entitlement join. Logs use the prefix
`/private/tmp/page-studio-booking-navigation-`.

The fresh application build passes the unchanged artifact guard: raw 25,057,951
bytes (410,977 remaining), gzip 6,582,277 bytes. Navigation is not yet deployed or
verified in a real browser. The preceding preview release `34286857822` now
passes CI and deployment at `cf40b4a24`; Cloudflare independently confirms preview
`32b39722-0e22-4702-9147-78fa9538c0e2` and all six intended service bindings,
including both named booking entrypoints. The isolated Hyperdrive IDs remain
unchanged. Keep BOOK-07 open for connected acceptance and browser navigation.

Wrangler has now refreshed the existing Cloudflare login successfully. A fresh
production list confirms `1a61474f` / `60f2171`; the prior OAuth 401 is resolved.

### Deployed content acceptance exposed a router collision

On preview `32b39722`, all three synthetic identities authenticated successfully
and client A's scoped booking list returned 200 with the expected scope and
no-store headers. Its content request then followed an unexpected 302 to staff
`/auth/login`, ultimately receiving HTML rather than JSON. A separate diagnostic
confirmed the redirect; no content write was reached. All three smoke sessions
and the separate diagnostic session were logged out and their subsequent
identity requests returned 401. No mail was sent. Evidence:
`/private/tmp/page-studio-connected-staging-evidence-attempt1.json`,
`/private/tmp/page-studio-content-response-diagnostic.json`, and
`/private/tmp/page-studio-content-anonymous-headers.txt`.

The installed H3/radix router reproduces the cause: sibling dynamic directories
`[id]` and `[siteId]` under the same portal site prefix cause the later branch
(content, forms and editor session routes) to fall through to the Nuxt renderer.
Five setup/provision handlers now live under the existing `[siteId]` directory
and read the canonical parameter. Public URLs are unchanged. No authentication
check was removed. Updated handler tests assert the requested parameter name;
a filesystem-derived test registers all twelve actual site routes with the
installed H3 router and checks dispatch and extracted site IDs against a renderer
fallback. Ten cases failed before the move; the routing/endpoint set passes all
25 checks after it.

Full tests pass 13,157 checks with 27 existing skips, except the frozen security
gate inventory fingerprint needed its path update. Independent recomputation
normalizing only the three moved role-gate paths reproduces the exact previous
digest; counts, gate text and classifications are unchanged. The reviewed new
digest is pinned. All 33 focused routing/endpoint/inventory tests pass after that
review. The fresh build and deployment guard pass: raw 25,057,991 bytes
(410,937 remaining), gzip 6,582,178 bytes. Inspection of the emitted artifact
confirms all twelve portal site API routes use the canonical parameter, including
both content methods. Scoped lint passes. Evidence:
`/private/tmp/page-studio-route-gate-inventory-review.json` and
`/private/tmp/page-studio-portal-route-*.log`. Deployed connected content acceptance
must be repeated with fresh links after publishing this repair.

Follow-up retained for provisioning review: the existing provision POST checks
client ownership and manager/admin role but lacks the explicit site-membership
join present on provision GET. Reconcile that with the required site-scoped
provisioning authority before enabling live self-service resource creation.
