# Signed-in client booking intake — 14 September 2026

This selectively recovers the missing customer-business booking API from historical PR519 against current Dashboard main. It uses the active private content router introduced by PR546. It does not restore old static bindings or infer a tenant from the latest global organisation.

## Contract

- `GET /api/portal/page-studio/bookings?siteId=<uuid>&status=<optional>&limit=<1..100>` lists the selected client's website bookings. Default limit is 50. This bounded first-page contract does not promise pagination.
- `POST /api/portal/page-studio/bookings?siteId=<uuid>` accepts `requestKey` (UUID), `customer` (`name`, `email`, `phone`), `pickup`, `dropoff`, `travelAt` (ISO timestamp including timezone), `durationMinutes`, `passengers`, and `occasion`.
- The browser creates one request key before sending and retains the exact immutable payload for retries. The server derives `portal-<lowercase requestKey>` as the booking ID; a new key intentionally creates a separate enquiry. Caller-supplied IDs, scope, timestamps, quote, vehicle or workflow state are rejected.
- New records start as unassigned enquiries. Creation records no vehicle reservation, operator approval, payment or customer notification.

Both endpoints require a signed-in client-business user. Fresh primary-database reads join that selected client, active client user, exact site membership, active client and matching effective booking entitlement. Site scope supplies tenant, client, business, site and environment. Viewer/editor memberships permit listing for admin, manager or viewer portal roles. Creation additionally requires both an admin/manager portal role and editor membership; role changes are checked again in the database.

The API returns booking content and aggregate version, excluding provider routing scope and command receipts. Errors are bounded and responses use `private, no-store`. This is not an anonymous website-visitor endpoint.

## Retry guarantee

The deterministic booking ID gives a request key one lookup target within its scope. Before creating, the server reads that target and compares every immutable enquiry field. Matching retries return the original timestamps and current operator-managed status/quote/vehicle without changing them. A reused key with changed fields returns `BOOKING_REQUEST_CONFLICT` (409).

Concurrent inserts or lost acknowledgements only succeed after a fresh scoped read verifies the same booking ID and immutable fields. An absent row, wrong scope, wrong ID or malformed receipt never becomes an acknowledged success. The existing primary-reading Cloudflare router and D1 unique insert remain the storage authority; no runtime change is included.

## Evidence and remaining work

Local verification: 90 focused tests passed across operator/portal helpers, portal endpoint authentication and error projection, and both route/gate inventory guards; 16 additional checks passed against real disposable PostgreSQL across the existing and new booking authority suites. PostgreSQL cases cover selected client/user, all membership axes, inactive client/user, effective dates, downgraded roles and foreign entitlements. Unit cases exercise concurrent creation, lost acknowledgement, immutable-field conflicts, foreign-scope responses and preservation of operator decisions. Targeted implementation/test ESLint passes. The pre-existing gate-inventory test retains its eight baseline lint violations; only its measured counts/digest changed.

The dedicated portal PostgreSQL suite joins the existing booking DB CI step. Production bundle size and full integration remain CI/release gates.

Pending: pagination, live authenticated staging acceptance with fresh isolated fixtures, explicit production router binding and release verification. Anonymous visitor intake, availability reservation, notifications, customer confirmation and billing remain separate roadmap outcomes. No live writes, merge or deployment accompanied this API recovery.

## Portal workspace implementation

The portal website card now links to `/portal/page-studio/bookings?siteId=<uuid>`. The list response includes `canCreate`, derived from the same fresh client-user role, exact site membership and entitlement check used for authorization. A manager with viewer membership, or a user whose role was downgraded, sees the list without a creation action. The server still repeats write authorization on every POST.

The enquiry slideover uses Nuxt UI fields, a calendar and an explicit browser-timezone pickup time. Required-field validation prevents invalid submission. While the workspace stays mounted, each website retains its draft and frozen submitted intent; closing/reopening resumes the same request. An immutable-payload conflict offers an explicit separate-enquiry action, which starts a new key. Drafts are not persisted across a browser reload or leaving this workspace. Saving an enquiry does not reserve a vehicle or confirm a trip.

Local UI evidence: 76 focused tests passed including 12 real PostgreSQL capability tests; both route/gate inventory guards passed. Chrome at 1440×900 and 393×650 verified the visible site link, vertical page scrolling, mobile slideover scrolling, no page horizontal overflow, unchanged retry payload after close/resume, explicit new key after 409 and viewer action hiding. No page errors were recorded. Endpoints were intercepted with synthetic data, so this is not live staging acceptance. Screenshots were visually reviewed.

The application-wide Vue typecheck remains blocked by existing repository errors. One new calendar draft typing error was corrected; an isolated strict TypeScript check of the exact initializer passed. No full application typecheck pass is claimed.
