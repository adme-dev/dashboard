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

Migration `402_page_studio_control_plane.sql` creates the twelve additive control-plane tables for entitlements, sites, memberships, checkpoints, versions, reviews, builds, releases, release pointers, audit events, domains, and assets.

Important invariants include:

- tenant route uniqueness;
- composite tenant/client/site foreign keys;
- entitlement capacity locked during site creation;
- approvals bound by foreign key to the exact version digest;
- immutable review and audit rows;
- exact normalized-hostname release pointers;
- system-role Page Studio group backfill without viewer access.

The migration was applied successfully to the configured Neon `neondb` on 2026-08-30. Read-only verification returned 12 Page Studio tables and 26 Page Studio system-role assignments.

### APIs and workflow

Implemented routes:

- `GET /api/agency/page-studio/sites`
- `POST /api/agency/page-studio/sites`
- `POST /api/agency/page-studio/sites/:siteId/versions/:versionId/reviews`
- `GET /api/portal/page-studio/sites`
- `POST /api/portal/page-studio/sites`
- `POST /api/portal/page-studio/sites/:siteId/versions/:versionId/submissions`
- `POST /internal/page-studio/checkpoints`
- `GET /internal/page-studio/checkpoints/latest`
- `POST /internal/page-studio/versions`
- `POST /internal/page-studio/audit-events`

Implemented behavior:

- agency view/edit/approval checks use exact Page Studio groups;
- site creation, membership creation, capacity enforcement, and audit insertion share one transaction;
- portal viewers cannot create or submit;
- portal site access is membership- and authenticated-client-scoped;
- only the current draft can enter review;
- only the current submitted version can be approved, rejected, or returned to draft;
- reviews record the locked digest and append audit evidence atomically.

### Internal machine boundary

The implemented internal routes require an exact `Authorization: Bearer` credential backed by `PAGE_STUDIO_CONTROL_SECRET`. The value is read from the Cloudflare runtime binding, with `process.env` used for local development. Missing or oversized server configuration fails with 503; missing/malformed credentials fail with 401; incorrect or oversized credentials fail with 403. Both sides are capped at 256 UTF-8 bytes and compared as fixed-length SHA-256 digests with `timingSafeEqual`.

`x-xeroflow-service: page-studio` remains diagnostic metadata only and never authenticates a request. The implemented, not-yet-deployed service-binding-only control Worker injects the bearer credential when forwarding to Dashboard Pages; Page Studio browser code never receives it.

Checkpoint registration validates the exact tenant/client/site R2 key, treats an exact replay as success without moving a newer pointer backward, returns 409 for conflicting immutable content, and advances `current_checkpoint_id` only after insertion. Version registration requires the same-scope durable checkpoint and exact digest, returns the original row for an exact idempotency replay, creates every new version as a fresh draft, and atomically advances `current_version_id`. Checkpoint and version mutations append safe audit metadata in the same transaction. Typed audit ingestion rejects arbitrary fields and stores no caller-controlled metadata.

### Service-binding gateway

`workers/page-studio-control` implements the service-only gateway expected by Page Studio's `CONTROL_PLANE` bindings. It has no `workers.dev` hostname or public route, accepts only `GET`/`POST` requests under `/internal/page-studio/`, strips caller authorization, cookies, forwarding headers, and non-allowlisted headers, then injects `PAGE_STUDIO_CONTROL_SECRET` for the Dashboard hop. The Dashboard origin is restricted to the reviewed production or preview Pages hostname, redirects are rejected to prevent credential forwarding, upstream bodies remain streamed, and response headers are projected through an allowlist.

The Wrangler configuration declares separate production and staging origins, the required encrypted secret, generated binding types, current compatibility settings, and logs/traces. Five gateway tests, strict Worker typecheck, and the staging Wrangler dry run pass. The staging bundle is 4.41 KiB uploaded and 1.56 KiB gzip. The Worker has not been provisioned or deployed; its secret must be installed interactively only after the matching Dashboard Pages preview is live.

## Verification evidence

- Clean `origin/main` baseline established before implementation.
- 86 targeted foundation tests passed, including a real PostgreSQL migration applied twice.
- 14 targeted version-workflow tests passed.
- Changed Page Studio server/test files pass ESLint.
- Nuxt typecheck still fails on the repository's existing unrelated error inventory; a filtered run produced no diagnostics for Page Studio paths after the permission indexing fix.
- Regression coverage proves a Page Studio-only custom role cannot inherit legacy `ADMIN` authority.
- 28 machine-auth, transaction, error-contract, and internal-route tests pass for the new control boundary.
- The disposable PostgreSQL test applies migration 402 twice and passes real checkpoint create/replay, latest-pointer, version create/replay, and typed audit create/replay flows; the temporary container was removed after the run.

## Remaining release gates

- [ ] Complete the machine-authenticated internal build, release, lead, analytics, host-resolution, and preview-authorization APIs. Checkpoint, latest-pointer, version registration, and audit ingestion are implemented.
- [ ] Implement ES256 editor-session issuance, minimal capabilities, nonce revocation, and secure preview-cookie exchange.
- [ ] Implement site detail/update and version-history APIs.
- [ ] Implement atomic activation and rollback transactions with optimistic pointer checks and append-only release audit.
- [ ] Implement domain, DNS verification, asset, lead-routing, and analytics control endpoints.
- [ ] Build agency and portal Nuxt UI v4 entry points and run browser accessibility/responsive checks.
- [ ] Update public feature, navigation, and pricing surfaces when the UI is ready for release.
- [ ] Provision and deploy the implemented Cloudflare service-binding control Worker, then provision R2 buckets, the container application, Worker secrets, routes, and staging hostnames.
- [ ] Verify Cloudflare for SaaS custom-hostname entitlement before enabling customer domains.
- [ ] Run staging security, rollback, capacity, form, analytics, and custom-host smoke gates.
- [ ] Run `pnpm deploy:check`, deploy through the guarded scripts only, and verify production health before enabling users.

## Deployment safety

The database migration is additive; no existing tables or rows were removed. No Cloudflare Page Studio production resources or hostname mappings have been created from the Dashboard branch yet, and no production traffic has been changed. Dashboard deployment must use `pnpm deploy:preview` or `pnpm deploy:production`; direct Wrangler Pages deployment is prohibited by the repository guardrail.
