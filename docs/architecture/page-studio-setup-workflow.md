# Page Studio agency setup workflow

Agency staff open **Website builder → Client websites → Manage site → Overview → Website setup**. Supported business starters expose a retained plan with pages, modules, the original brief and unconfirmed launch details. The visual editor remains the separate signed Studio runtime.

Editing requires `PAGE_STUDIO_EDIT`; approval requires `PAGE_STUDIO_APPROVE`. Creation and decisions lock the site and compare the displayed revision. Accepted plans cannot be rewritten. Entitlement expiry, page/module limits and inactive clients block new proposals. Free-text mentions never establish confirmed rates, contact details or availability rules.

Preparation requires an accepted plan and the private `PAGE_STUDIO_PROVISIONER` binding with both `createProvisioning` and `readProvisioning`, plus explicit `PAGE_STUDIO_PROVISIONING_ENVIRONMENT` of `staging` or `production`. Missing configuration displays the service as unavailable and blocks dispatch. This release does not activate that infrastructure. Portal signup, production allocation/dispatch acceptance and operational booking integration remain separate work.

Jobs retain the original authenticated actor. Both producer preflight and the machine-authenticated `/internal/page-studio/provisioning/authorize` route reread current staff or client authority, scoped site, accepted plan and entitlements. An executor must check fresh authority before effects and retain its own lease fencing. Retries cannot change actor kind, scope, plan or accepted setup snapshot. Management receives bounded phase information, not provider resource names or raw executor errors.

Migration `415_page_studio_setup_proposals.sql` is additive and was applied successfully to the configured application database on 13 September 2026. Its review history uses a unique tenant/client/site/revision key and scoped foreign key. The isolated PostgreSQL 17 tests exercise concurrent creation, approval/revision races, revoked/custom/read-only roles and entitlement changes; all 39 pass. CI now runs these tests explicitly instead of silently skipping them without a database URL.

Current-main reconciliation restores only these setup files from the historical implementation. Newer saved-page, checkpoint, publishing, submission and QR changes remain intact. Both permission inventories account for four added API files (three mutations) and two fresh staff-role checks. No God-mode mutation bypass was added.

Local validation: 111 focused tests pass; new and changed application code passes lint; production build is 25,438,109 raw bytes, 30,819 below the unchanged limit. Full CI and guarded current-main production deployment are required before claiming this workflow is live.

## Customer plan review

The customer website portfolio links to a scoped setup page. Current client authentication and an exact site membership govern reads; only an admin/manager with editor membership and current portal-creation entitlement can submit a plan. Site and entitlement locks serialize first creation, revisions and agency decisions. Accepted plans remain immutable. Customer details do not establish confirmed facts automatically or approve/publish a site.

Progress uses the explicitly configured provisioning environment and reports only phase/time. The page retains failed draft text, blocks stale revisions after refresh and permits vertical scrolling. No new provisioner binding, account signup, payment, mail or public release is activated by this increment. Customer plan reads/revisions are being verified on current main before production rollout.

## Customer-requested preparation

An authenticated admin/manager with editor membership can explicitly start the current agency-accepted revision when the provisioner service and environment are configured. The request accepts only `expectedRevision`; customer, site scope, actor and environment are derived server-side. Fresh SQL preflight checks active client/user, membership, site, accepted snapshot and current entitlement before contacting the coordinator. Retries keep the initial customer owner and fixed revision key. The portal receives phase/time only.

The action is hidden for unapproved plans, viewers, unavailable infrastructure or existing jobs. Failed acknowledgements refresh the persisted status before another attempt. No new binding or automatic execution is enabled in this increment. The portal sidebar now constrains long client names to its width. Production enablement still requires positive two-customer provisioning and dispatch acceptance.

## Atomic customer website creation

Portal administrators and managers can use **Your websites → New website** to select a business starter or describe their website. The existing create endpoint accepts an optional source/brief; the server generates the plan itself. Within one entitlement-locked transaction it checks page/module allowance, active client and current administrator/manager role, then inserts the draft, editor membership, revision-one proposed setup and site audit event. A failed proposal insert rolls everything back. Concurrent requests cannot exceed the last available site allowance. Existing API callers without setup fields retain blank-draft behavior.

The dialog preserves failed input and asks customers to refresh the portfolio after a lost acknowledgement before retrying. The unique route prevents a second draft with the same route; a friendly original-receipt retry is not yet implemented. This is website creation for existing authenticated customers with an allowance. Account signup, billing and Cloudflare allocation remain separate gates. Management-only pages, page settings, redirects and entitlement grants use client rendering; their component names and behavior remain unchanged.

Verification: 36 focused checks and 19 real PostgreSQL checks pass, including atomic rollback, competing creation, current-role denial and page-limit denial. No new database migration or infrastructure binding is required.


## Isolated preview provisioning connection

Only `env.preview` binds `PAGE_STUDIO_PROVISIONER` to `xeroflow-provisioning-staging`, with explicit provisioning environment `staging`. Both preview database bindings remain the dedicated cache-disabled Hyperdrive `3865ea5568234fc7b0e9e3e595a30286` for Neon branch `staging/page-studio`. There is no root or production provisioner binding. The coordinator's scheduler remains independently disabled until its legacy probes and positive customer acceptance are reconciled. Connecting the private service permits accepted-revision request persistence and fresh executor authority checks; it does not establish automatic execution or production readiness.

## Booking operations through the private content router

**Websites → Bookings** provides a per-website agency queue. `PAGE_STUDIO_VIEW` permits reads and `PAGE_STUDIO_APPROVE` permits quotes and operator decisions; read-only roles cannot mutate. Every request uses the selected tenant, a fresh active-client/site/entitlement lookup and an explicit `bookings` module. The five-part service scope is derived server-side, with `businessId = clientId`, matching provisioning. The private router must resolve a currently active route on every call. Browser-supplied Worker names, binding maps, environments and tenant/client IDs are not accepted.

The command endpoint preserves the protocol's expected version and idempotency key, then verifies the returned scope, booking ID, receipt and version. The quote dialog retains its exact submitted payload across a failed acknowledgement, disables submitted fields and allows an identical retry. Closing and refreshing allows an operator to review a competing update. Each quote uses whole cents, an explicit currency and a calendar-selected expiry in the operator's displayed time zone.

Only Pages preview receives `PAGE_STUDIO_CONTENT_ROUTER = xeroflow-content-router-staging` and `PAGE_STUDIO_CONTENT_ENVIRONMENT = staging`. Production has no new router binding. Missing configuration returns a bounded unavailable response. The queue records operator decisions; it does not yet connect vehicle holds, customer confirmation or notification delivery. Those remain required roadmap outcomes, together with customer enquiry creation, public signup, production provisioning, billing, domains/email and confirmed Fantasy Limo launch facts.

Local checks: 66 focused tests pass, including four real PostgreSQL authorization tests. CI explicitly runs the database suite. Desktop/mobile Chrome checks with synthetic intercepted API responses verify scrolling, no page-width overflow, whole-cent conversion, identical quote retry and no page errors. These browser mocks do not prove live service acceptance. The initial production build remains under the unchanged raw Worker limit (25,458,821 / 25,468,928 bytes); full CI and staged integration acceptance are still required before rollout claims. No migration is required.
