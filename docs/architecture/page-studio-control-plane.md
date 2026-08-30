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

Implemented behavior:

- agency view/edit/approval checks use exact Page Studio groups;
- site creation, membership creation, capacity enforcement, and audit insertion share one transaction;
- portal viewers cannot create or submit;
- portal site access is membership- and authenticated-client-scoped;
- only the current draft can enter review;
- only the current submitted version can be approved, rejected, or returned to draft;
- reviews record the locked digest and append audit evidence atomically.

## Verification evidence

- Clean `origin/main` baseline established before implementation.
- 86 targeted foundation tests passed, including a real PostgreSQL migration applied twice.
- 14 targeted version-workflow tests passed.
- Changed Page Studio server/test files pass ESLint.
- Nuxt typecheck still fails on the repository's existing unrelated error inventory; a filtered run produced no diagnostics for Page Studio paths after the permission indexing fix.
- Regression coverage proves a Page Studio-only custom role cannot inherit legacy `ADMIN` authority.

## Remaining release gates

- [ ] Implement machine-authenticated internal checkpoint, version, audit, build, release, lead, analytics, host-resolution, and preview-authorization APIs.
- [ ] Implement checkpoint idempotency and current-version registration called by the Page Studio control client.
- [ ] Implement ES256 editor-session issuance, minimal capabilities, nonce revocation, and secure preview-cookie exchange.
- [ ] Implement site detail/update and version-history APIs.
- [ ] Implement atomic activation and rollback transactions with optimistic pointer checks and append-only release audit.
- [ ] Implement domain, DNS verification, asset, lead-routing, and analytics control endpoints.
- [ ] Build agency and portal Nuxt UI v4 entry points and run browser accessibility/responsive checks.
- [ ] Update public feature, navigation, and pricing surfaces when the UI is ready for release.
- [ ] Provision the Cloudflare service-binding control Worker, R2 buckets, container application, Worker secrets, routes, and staging hostnames.
- [ ] Verify Cloudflare for SaaS custom-hostname entitlement before enabling customer domains.
- [ ] Run staging security, rollback, capacity, form, analytics, and custom-host smoke gates.
- [ ] Run `pnpm deploy:check`, deploy through the guarded scripts only, and verify production health before enabling users.

## Deployment safety

The database migration is additive; no existing tables or rows were removed. No Cloudflare Page Studio production resources or hostname mappings have been created from the Dashboard branch yet, and no production traffic has been changed. Dashboard deployment must use `pnpm deploy:preview` or `pnpm deploy:production`; direct Wrangler Pages deployment is prohibited by the repository guardrail.
