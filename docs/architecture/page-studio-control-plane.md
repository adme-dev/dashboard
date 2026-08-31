# Page Studio control plane

## Status

In progress as of 2026-08-31. The database, authenticated workflow foundation, read-only agency/client workspaces, and staged build/release control transactions are implemented. The separate editor/build/delivery runtime remains staging-only, no customer Page Studio hostname receives production traffic, and the complete website builder is not yet production-ready.

Dashboard release commit: `0a7c8a1b9`

Staged build/release control branch: `feature/page-studio-control-plane` through `d6f28cb13`.

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
- `POST /api/agency/page-studio/sites/:siteId/versions/:versionId/builds`
- `POST /api/agency/page-studio/sites/:siteId/releases/activate`
- `POST /api/agency/page-studio/sites/:siteId/releases/rollback`
- `GET /api/portal/page-studio/sites`
- `POST /api/portal/page-studio/sites`
- `POST /api/portal/page-studio/sites/:siteId/editor-sessions`
- `POST /api/portal/page-studio/sites/:siteId/versions/:versionId/submissions`
- `POST /internal/page-studio/checkpoints`
- `GET /internal/page-studio/checkpoints/latest`
- `POST /internal/page-studio/versions`
- `POST /internal/page-studio/audit-events`
- `POST /internal/page-studio/delivery/previews/authorize`
- `GET /internal/page-studio/builds/:buildId`
- `GET /internal/page-studio/releases/:releaseId`
- `POST /internal/page-studio/releases/activate`
- `POST /internal/page-studio/releases/rollback`

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
- build requests require `PAGE_STUDIO_PUBLISH`, derive tenant/client/site scope server-side, call the private Build Worker with the exact latest approval and digest, and recheck that approval under lock before recording a succeeded build;
- build paths, manifest keys, validation keys, and digests must match their deterministic scope; failures store only a bounded generic summary and never persist worker/customer error content;
- activation and rollback derive scope server-side and call the private Delivery Worker, which verifies the complete R2 artifact before the authoritative pointer transaction;
- activation serializes hostname claims, compares `expectedActiveReleaseId`, rechecks the exact-digest approval and succeeded build, creates one immutable release, advances the pointer, updates state, and audits before commit;
- rollback targets an existing same-scope/environment/hostname release backed by a succeeded build, creates no build or release, advances only the pointer/site reference, and audits before commit;
- exact retries return their original immutable result, while changed idempotency payloads and stale pointers return stable 409 errors.

### Agency and client workspaces

Page Studio is a first-class `Websites` workspace in the agency sidebar for users with the exact `PAGE_STUDIO_VIEW` permission. The agency page lists every site available to that tenant through the agency-scoped API. The client portal probes the portal-scoped site list and only adds Page Studio navigation when the signed-in user has at least one assigned site; the page then uses the same membership- and client-scoped API for its content.

Both surfaces share a Nuxt UI v4 site workspace with explicit loading, error, empty, status, refresh, and pagination states. The first UI slice is deliberately read-only while the editor and publishing rollout is still staged. It does not expose agency provisioning, domain, or release controls to portal users, and it does not add links to unfinished editor routes. The public feature catalogue, feature detail page, and marketing mega menu describe the capability and its staged governance model.

### Isolated staging database

Dashboard preview is connected to the schema-only Neon branch `staging/page-studio` (`br-long-mountain-a4f73v10`) through the dedicated, cache-disabled Hyperdrive configuration `xeroflow-page-studio-control-staging-db` (`3865ea5568234fc7b0e9e3e595a30286`). Both `HYPERDRIVE` and `HYPERDRIVE_FRESH` point to that one isolated staging resource; neither preview binding aliases the two production Hyperdrive IDs, and preview does not receive production `DATABASE_URL`.

The Neon branch initially returned without its expected table definitions. A schema-only restore populated the broader table set but was interrupted before every unrelated constraint completed, so the 13 Page Studio tables were explicitly dropped and recreated with migrations 402/403. A final read-only comparison proved those 13 tables have the same constraint and index counts as production, while `page_studio_sites` and `team_members` both remain empty. This is sufficient for the current machine-path smoke tests, but it is not treated as a fully seeded preview application database; authenticated workspace UAT still requires synthetic tenant, client, and user fixtures. A staging role credential exposed during diagnostic parsing was immediately rotated, the old credential invalidated, and Hyperdrive updated with the replacement without printing it.

### Internal machine boundary

The implemented internal routes require an exact `Authorization: Bearer` credential backed by `PAGE_STUDIO_CONTROL_SECRET`. The value is read from the Cloudflare runtime binding, with `process.env` used for local development. Missing or oversized server configuration fails with 503; missing/malformed credentials fail with 401; incorrect or oversized credentials fail with 403. Both sides are capped at 256 UTF-8 bytes and compared as fixed-length SHA-256 digests with `timingSafeEqual`.

`x-xeroflow-service: page-studio` remains diagnostic metadata only and never authenticates a request. The service-binding-only control Worker injects the bearer credential when forwarding to Dashboard Pages; Page Studio browser code never receives it.

Checkpoint registration validates the exact tenant/client/site R2 key, treats an exact replay as success without moving a newer pointer backward, returns 409 for conflicting immutable content, and advances `current_checkpoint_id` only after insertion. Version registration requires the same-scope durable checkpoint and exact digest, returns the original row for an exact idempotency replay, creates every new version as a fresh draft, and atomically advances `current_version_id`. Checkpoint and version mutations append safe audit metadata in the same transaction. Typed audit ingestion rejects arbitrary fields and stores no caller-controlled metadata.

### Service-binding gateway

`workers/page-studio-control` implements the service-only gateway expected by Page Studio's `CONTROL_PLANE` bindings. It has no `workers.dev` hostname or public route, accepts only `GET`/`POST` requests under `/internal/page-studio/`, strips caller authorization, cookies, forwarding headers, and non-allowlisted headers, then injects `PAGE_STUDIO_CONTROL_SECRET` for the Dashboard hop. The raw user preview credential is forwarded in `x-xeroflow-preview-token` only for the exact `POST /internal/page-studio/delivery/previews/authorize` route, so it cannot overwrite machine authentication or bleed into another endpoint. The Dashboard origin is restricted to the reviewed production or preview Pages hostname, redirects are rejected to prevent credential forwarding, upstream bodies remain streamed, and response headers are projected through an allowlist.

The Wrangler configuration declares separate production and staging origins, the required encrypted secret, generated binding types, current compatibility settings, and logs/traces. Six gateway tests, strict Worker typecheck, and the staging Wrangler dry run pass. The deployed bundle is 4.97 KiB uploaded and 1.69 KiB gzip.

On 2026-08-31, Dashboard commits `528f82fa2`, `f069a76bd`, and `299fdf47d` were deployed through the guarded `pnpm deploy:preview` path to immutable Pages deployment `2d7f1661.agency-dashboard-6cm.pages.dev` and the stable `preview.agency-dashboard-6cm.pages.dev` alias. The root and public Page Studio feature page return 200, while the machine-authenticated host resolver returns 401 when called directly without its control credential. The worker-size guard passes at 24,991,283 raw bytes with 477,645 bytes remaining. The machine secret, exact issuer, private signing key, and public verification key are present as encrypted preview bindings. The matching public verification key is installed in the private staging Sandbox, and all plaintext temporary key files were removed. The private Build, Sandbox/container, control gateway, and Delivery Workers are deployed with no public targets.

On 2026-08-31, the Page Studio Dashboard release was fast-forwarded to `main` and deployed through the guarded `pnpm deploy:production` path as Cloudflare Pages deployment `5170d2cb-dc27-4ee6-8839-c14fbf52efb0` (`5170d2cb.agency-dashboard-6cm.pages.dev`). The stable production alias, root page, and public Page Studio feature page return 200; the agency Page Studio API returns 401 without authentication. Migrations 402 and 403 were reapplied to production with `ON_ERROR_STOP` and completed idempotently. This deployment exposes the governed Dashboard control-plane surfaces only; it does not provision or enable standalone production Page Studio Workers or customer website traffic.

The first database-backed remote smoke exposed a runtime integration fault: `server/utils/db.ts` resolved Cloudflare bindings through Nitro `useEvent()`, but Nitro async request context was disabled. The caught exception caused a fallback to the intentionally absent preview `DATABASE_URL`, producing a generic 500 and downstream 503. Sanitized server diagnostics identified the exact failure, a regression test reproduced the missing configuration, and `nitro.experimental.asyncContext` was enabled. A direct Hyperdrive probe then confirmed the isolated database and Page Studio tables were reachable. The final Delivery → control → Dashboard smoke now returns control health 200, unknown public host 404 `PUBLIC_HOST_NOT_FOUND`, missing checkpoint 404 `CHECKPOINT_NOT_FOUND`, and unknown Delivery site 404 instead of 503.

The staged Dashboard branch declares preview-only `PAGE_STUDIO_BUILD` and `PAGE_STUDIO_DELIVERY` service bindings to `xeroflow-page-studio-build-staging` and `xeroflow-page-studio-delivery-staging`. `PAGE_STUDIO_RELEASE_ENVIRONMENT=staging` prevents that binding from accepting a production release action. No matching production bindings are declared; production therefore fails closed until standalone production Workers, domain readiness, and customer-routing acceptance are complete.

On 2026-08-31, the staged build/release branch was deployed through the guarded `pnpm deploy:preview` path as immutable Pages deployment `4f093441.agency-dashboard-6cm.pages.dev`, with the stable `preview.agency-dashboard-6cm.pages.dev` alias. The immutable root and public Page Studio feature page return 200. Direct anonymous requests to both an agency release-catalog endpoint and an internal build endpoint return 401, confirming that the new publication surfaces are not publicly accessible. This preview contains the staging-only Build and Delivery service bindings; production remains unbound and unchanged.

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
- The expanded focused Page Studio gate passes 99 tests with one disposable-PostgreSQL harness test environment-skipped; the complete Page Studio lint scope is clean. Full Nuxt typecheck still exits on the repository's existing unrelated error inventory and reports no Page Studio diagnostics.
- The agency/client navigation and shared workspace source contract passes five tests, including permission/membership visibility, scoped API usage, explicit UI states, Nuxt UI-only controls, and marketing-surface synchronization.
- Preview binding tests prove the Page Studio staging Hyperdrive ID is explicit, cache-disabled, and distinct from both production Hyperdrive configurations. The schema-only Neon branch contains no production site or team-member rows.
- Browser verification confirms the public Page Studio feature page has the expected content hierarchy in desktop and mobile layouts with no console warnings or errors. Authenticated agency and portal workspace UAT remains gated on synthetic staging identities.
- The pre-production full repository gate passed 1,931 test files with six skipped and 12,354 tests with 27 skipped. The guarded production build passed the Worker-size check at 24,991,289 raw bytes with 477,639 bytes remaining.
- `pnpm audit --prod --audit-level high` reports 17 existing high-severity transitive advisories in Zero, Nuxt/tooling, and Cloudflare Think dependency chains. None involve the newly added direct `jose` dependency; remediation and reachability review remain a separate production-risk gate.
- 34 focused build, catalog, activation, rollback, binding, route, stable-error, and replay tests pass for the staged publication chain. Targeted ESLint and `pnpm deploy:check` pass. Full Nuxt typecheck still exits on the existing unrelated inventory and reports no Page Studio diagnostics.
- The complete repository test gate passed 1,935 files and 12,384 tests after the publication changes. One unrelated MCP project test exceeded its five-second timeout under the full-load run, then passed all 27 assertions in 3.02 seconds when retried in isolation.

## Remaining release gates

- [ ] Complete the machine-authenticated lead and analytics APIs. Checkpoint, latest-pointer, version registration, audit ingestion, preview authorization, build/release lookup, activation, rollback, and public host resolution are implemented.
- [ ] Complete editor-session rollout. ES256 issuance, minimal role/entitlement capabilities, encrypted key installation, the Dashboard nonce ledger, preview revocation checks, and private/no-store responses are implemented; explicit revocation mutations and secure preview-cookie exchange remain.
- [ ] Implement site detail/update and version-history APIs.
- [ ] Design and implement the multi-page website model: page hierarchy, stable routes, page metadata/SEO, draft/review state, navigation visibility, and whole-site atomic publishing.
- [ ] Design and implement reusable site-wide headers and footers with shared branding/content plus explicit per-page visibility overrides.
- [ ] Design and implement responsive website navigation, including desktop menus, accessible mobile navigation, nested-page behavior, active states, keyboard/focus handling, and preview coverage at supported breakpoints.
- [x] Implement atomic activation and rollback transactions with optimistic pointer checks and append-only release audit.
- [ ] Implement domain, DNS verification, asset, lead-routing, and analytics control endpoints.
- [x] Build the first agency and portal Nuxt UI v4 entry points with permission- and membership-scoped navigation.
- [ ] Run authenticated browser accessibility and responsive checks for both new workspaces.
- [x] Update the public feature catalogue, detail page, and marketing navigation for Page Studio. Pricing remains unchanged until the subscription packaging is finalized.
- [x] Provision and deploy the service-binding-only staging control Worker with the matching Dashboard Pages preview secret and no public target.
- [ ] Complete staging provisioning. Isolated R2 buckets, private Build/Sandbox/control/Delivery Workers, asymmetric session keys, preview service-binding configuration, and the guarded Dashboard preview deployment are live; the synthetic fixture, Web routes, DNS/TLS, and staging host acceptance remain.
- [ ] Verify Cloudflare for SaaS custom-hostname entitlement before enabling customer domains.
- [ ] Run staging security, rollback, capacity, form, analytics, and custom-host smoke gates.
- [x] Run `pnpm deploy:check`, deploy the Dashboard control-plane surfaces through the guarded production script, and verify public production health.
- [ ] Provision and verify the standalone production Page Studio runtime before enabling editor, publishing, or customer hostname traffic.

## Deployment safety

The database migration is additive; no existing tables or rows were removed. The Dashboard control-plane surfaces are deployed to production, but no standalone Cloudflare Page Studio production Workers or customer hostname mappings have been created and no customer website traffic has been switched. Dashboard deployment must use `pnpm deploy:preview` or `pnpm deploy:production`; direct Wrangler Pages deployment is prohibited by the repository guardrail.
