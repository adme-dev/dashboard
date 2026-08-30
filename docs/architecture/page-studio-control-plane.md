# Page Studio control plane

## Status

In progress as of 2026-08-30. The database and first authenticated workflow slices are deployed to the configured Neon database, but Page Studio traffic has not been switched on and the feature is not production-ready.

Implementation branch: `feature/page-studio-control-plane`

## Decision

The Agency Dashboard remains the authority for Page Studio tenants, clients, subscriptions, permissions, sites, versions, reviews, releases, domains, and audit history. Page Studio services do not receive Neon credentials and cannot grant access, approve content, or change production traffic directly.

Page Studio permissions are explicit groups:

- `PAGE_STUDIO_VIEW`
- `PAGE_STUDIO_EDIT`
- `PAGE_STUDIO_APPROVE`
- `PAGE_STUDIO_PUBLISH`
- `PAGE_STUDIO_DOMAINS`
- `PAGE_STUDIO_SUBSCRIPTIONS`

These groups intentionally do not have entries in the legacy `PERMISSIONS` role-array object. Several legacy arrays are identical, and `hasRole()` reverse-maps those arrays. Adding `PAGE_STUDIO_DOMAINS: ['owner', 'admin']` there would let a custom role holding only that group pass unrelated legacy `ADMIN` gates. Page Studio routes instead use `requireAgencyPageStudioAccess()` and check the exact resolved group.

Portal routes never accept tenant or client identifiers as authority. They derive the client from `requireClientAuth()` and resolve tenant/site scope through the authenticated site membership.

## Implemented

### Database

Migration `402_page_studio_control_plane.sql` creates the twelve additive control-plane tables for entitlements, sites, memberships, checkpoints, versions, reviews, builds, releases, release pointers, audit events, domains, and assets. Migration `403_page_studio_sessions.sql` adds the short-lived editor-session nonce ledger without storing bearer tokens or signing keys.

Important invariants include:

- tenant route uniqueness;
- composite tenant/client/site foreign keys;
- entitlement capacity locked during site creation;
- approvals bound by foreign key to the exact version digest;
- immutable review and audit rows;
- exact normalized-hostname release pointers;
- system-role Page Studio group backfill without viewer access.

Both migrations were applied successfully to the configured Neon `neondb` on 2026-08-30. Migration 403 was applied twice to prove idempotency; the new session table was empty before launch. Read-only verification returned the expected Page Studio tables and 26 Page Studio system-role assignments.

### APIs and workflow

Implemented routes:

- `GET /api/agency/page-studio/sites`
- `POST /api/agency/page-studio/sites`
- `POST /api/agency/page-studio/sites/:siteId/editor-sessions`
- `POST /api/agency/page-studio/sites/:siteId/versions/:versionId/reviews`
- `GET /api/portal/page-studio/sites`
- `POST /api/portal/page-studio/sites`
- `POST /api/portal/page-studio/sites/:siteId/editor-sessions`
- `POST /api/portal/page-studio/sites/:siteId/versions/:versionId/submissions`
- `POST /internal/page-studio/checkpoints`
- `GET /internal/page-studio/checkpoints/latest`
- `POST /internal/page-studio/versions`
- `POST /internal/page-studio/audit-events`
- `POST /internal/page-studio/delivery/previews/authorize`

Implemented behavior:

- agency view/edit/approval checks use exact Page Studio groups;
- site creation, membership creation, capacity enforcement, and audit insertion share one transaction;
- portal viewers cannot create or submit;
- portal site access is membership- and authenticated-client-scoped;
- editor-session responses are private/no-store and use the exact `XEROFLOW-PAGE-STUDIO-SESSION` ES256 contract with a maximum 15-minute lifetime;
- agency sessions require `PAGE_STUDIO_EDIT` and may receive `source:edit`; client sessions derive tenant scope from the exact authenticated client/site/editor membership and never receive `source:edit` in the first release;
- session issuance locks the site and entitlement, rechecks site state plus the entitlement status/effective window, records only scoped claims and revocation state, and appends `session.issued` audit evidence atomically;
- preview authorization verifies the exact ES256 session contract, requires `workspace:preview`, matches every scoped claim against the unrevoked nonce ledger, rechecks the current site and entitlement, and resolves only the exact active preview hostname and succeeded immutable build;
- only the current draft can enter review;
- only the current submitted version can be approved, rejected, or returned to draft;
- reviews record the locked digest and append audit evidence atomically.

### Internal machine boundary

The implemented internal routes require an exact `Authorization: Bearer` credential backed by `PAGE_STUDIO_CONTROL_SECRET`. The value is read from the Cloudflare runtime binding, with `process.env` used for local development. Missing or oversized server configuration fails with 503; missing/malformed credentials fail with 401; incorrect or oversized credentials fail with 403. Both sides are capped at 256 UTF-8 bytes and compared as fixed-length SHA-256 digests with `timingSafeEqual`.

`x-xeroflow-service: page-studio` remains diagnostic metadata only and never authenticates a request. The service-binding-only control Worker injects the bearer credential when forwarding to Dashboard Pages; Page Studio browser code never receives it.

Checkpoint registration validates the exact tenant/client/site R2 key, treats an exact replay as success without moving a newer pointer backward, returns 409 for conflicting immutable content, and advances `current_checkpoint_id` only after insertion. Version registration requires the same-scope durable checkpoint and exact digest, returns the original row for an exact idempotency replay, creates every new version as a fresh draft, and atomically advances `current_version_id`. Checkpoint and version mutations append safe audit metadata in the same transaction. Typed audit ingestion rejects arbitrary fields and stores no caller-controlled metadata.

### Service-binding gateway

`workers/page-studio-control` implements the service-only gateway expected by Page Studio's `CONTROL_PLANE` bindings. It has no `workers.dev` hostname or public route, accepts only `GET`/`POST` requests under `/internal/page-studio/`, strips caller authorization, cookies, forwarding headers, and non-allowlisted headers, then injects `PAGE_STUDIO_CONTROL_SECRET` for the Dashboard hop. The raw user preview credential is forwarded in `x-xeroflow-preview-token` only for the exact `POST /internal/page-studio/delivery/previews/authorize` route, so it cannot overwrite machine authentication or bleed into another endpoint. The Dashboard origin is restricted to the reviewed production or preview Pages hostname, redirects are rejected to prevent credential forwarding, upstream bodies remain streamed, and response headers are projected through an allowlist.

The Wrangler configuration declares separate production and staging origins, the required encrypted secret, generated binding types, current compatibility settings, and logs/traces. Six gateway tests, strict Worker typecheck, and the staging Wrangler dry run pass. The deployed bundle is 4.97 KiB uploaded and 1.69 KiB gzip.

On 2026-08-30, Dashboard commit `28660b028` was deployed through the guarded `pnpm deploy:preview` path to immutable Pages deployment `86c25d60.agency-dashboard-6cm.pages.dev` and the stable `preview.agency-dashboard-6cm.pages.dev` alias. Both roots returned 200; the preview-authorizer and both editor-session routes returned the expected unauthenticated 401 instead of a server error. The worker-size guard passed at 24,972,676 raw bytes with 496,252 bytes remaining. The machine secret, exact issuer, private signing key, and public verification key are present as encrypted preview bindings. The matching public verification key is installed in the private staging Sandbox, and all plaintext temporary key files were removed. The private Sandbox/container, control gateway version `0c851bc4-b1b6-4ff4-bd02-215d7c28e6f8`, and Delivery version `656037c8-c26d-4a27-86fd-b68f8186eada` are deployed with no public targets. A temporary remote-binding harness proved that Delivery returns 401 without a preview credential and that an invalid credential crosses Delivery → control gateway → Dashboard and fails safely as 404. Unknown public-host lookup currently fails closed as 503 because the Dashboard host-resolution endpoint remains unimplemented.

## Verification evidence

- Clean `origin/main` baseline established before implementation.
- 86 targeted foundation tests passed, including a real PostgreSQL migration applied twice.
- 14 targeted version-workflow tests passed.
- Changed Page Studio server/test files pass ESLint.
- Nuxt typecheck still fails on the repository's existing unrelated error inventory; a filtered run produced no diagnostics for Page Studio paths after the permission indexing fix.
- Regression coverage proves a Page Studio-only custom role cannot inherit legacy `ADMIN` authority.
- 28 machine-auth, transaction, error-contract, and internal-route tests pass for the new control boundary.
- The disposable PostgreSQL test applies migration 402 twice and passes real checkpoint create/replay, latest-pointer, version create/replay, and typed audit create/replay flows; the temporary container was removed after the run.
- Ten focused session and issuer-endpoint tests prove ES256 interoperability with the Page Studio verifier contract, lifetime enforcement, malformed signed-claim projection, agency/client capability separation, effective-entitlement and membership denial, no token persistence, authenticated endpoint scope, UUID validation, and private/no-store responses.
- The full focused Page Studio gate passes 75 tests with one disposable-PostgreSQL harness test environment-skipped; the complete Page Studio lint scope is clean. Full Nuxt typecheck still exits on the repository's existing unrelated error inventory and reports no Page Studio diagnostics.
- `pnpm audit --prod --audit-level high` reports 17 existing high-severity transitive advisories in Zero, Nuxt/tooling, and Cloudflare Think dependency chains. None involve the newly added direct `jose` dependency; remediation and reachability review remain a separate production-risk gate.

## Remaining release gates

- [ ] Complete the machine-authenticated internal build, release, lead, analytics, and public host-resolution APIs. Checkpoint, latest-pointer, version registration, audit ingestion, and preview authorization are implemented.
- [ ] Complete editor-session rollout. ES256 issuance, minimal role/entitlement capabilities, encrypted key installation, the Dashboard nonce ledger, preview revocation checks, and private/no-store responses are implemented; explicit revocation mutations and secure preview-cookie exchange remain.
- [ ] Implement site detail/update and version-history APIs.
- [ ] Implement atomic activation and rollback transactions with optimistic pointer checks and append-only release audit.
- [ ] Implement domain, DNS verification, asset, lead-routing, and analytics control endpoints.
- [ ] Build agency and portal Nuxt UI v4 entry points and run browser accessibility/responsive checks.
- [ ] Update public feature, navigation, and pricing surfaces when the UI is ready for release.
- [x] Provision and deploy the service-binding-only staging control Worker with the matching Dashboard Pages preview secret and no public target.
- [ ] Complete staging provisioning. Isolated R2 buckets, the private Build Worker, asymmetric session keys, and the private Sandbox/container application are live; Delivery, Web, routes, and staging hostnames remain.
- [ ] Verify Cloudflare for SaaS custom-hostname entitlement before enabling customer domains.
- [ ] Run staging security, rollback, capacity, form, analytics, and custom-host smoke gates.
- [ ] Run `pnpm deploy:check`, deploy through the guarded scripts only, and verify production health before enabling users.

## Deployment safety

The database migration is additive; no existing tables or rows were removed. No Cloudflare Page Studio production resources or hostname mappings have been created from the Dashboard branch yet, and no production traffic has been changed. Dashboard deployment must use `pnpm deploy:preview` or `pnpm deploy:production`; direct Wrangler Pages deployment is prohibited by the repository guardrail.
