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

These are synthetic service-level fixtures. They are not yet bound into this
Dashboard preview or attached to real portal memberships/entitlements. BOOK-07
remains open until that authenticated two-site acceptance is completed.
