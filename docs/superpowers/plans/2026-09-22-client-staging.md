# Per-client application staging

## User requirement

22 September 2026: every client application needs its own staging URL before a
customer attaches a DNS domain. Implement now; Fantasy Limo is the first hosted
acceptance site. This extends the active Page Studio delivery goal and takes
priority over its remaining browser form polish. No further routine approval is
needed. Existing completed work and unrelated sessions must be preserved.

## Observed gap

- The live Fantasy account has 66 visitor pages, 8 form definitions, a current
  saved checkpoint, no approved release and no domain.
- The admin PublishingWorkspace currently derives readiness exclusively from
  production domain records and only sends environment=production.
- The shared page-studio-staging.xeroflow.io host serves a synthetic starter.
- Native resolvePageStudioDeliveryWorker correctly binds release environment to
  its configured service. The production account cannot simply request the
  shared infrastructure staging service or masquerade as the synthetic tenant.
- demo.xeroflow.io is a separate design reference. It is not a staging deployment
  of the saved Fantasy account.

## Contract and decisions

1. Platform-owned address per immutable site UUID, automatically derivable for
   every existing/new site: `preview-<32 lowercase UUID hex digits>.xeroflow.io`.
   Names and client routes may change; the address does not. Full UUID avoids
   short-ID collisions. One hostname label below the known platform zone avoids
   relying on an unprovisioned second-level wildcard certificate.
2. Allocation, DNS/TLS readiness, building, and an active snapshot are separate
   states. Do not show a working Open staging action until read-back proves the
   active deployment. A URL string alone is not a deployment.
3. Customer staging is an application deployment of the customer's saved state,
   distinct from infrastructure staging used to test XeroFlow releases. Never
   change tenant identity to use a synthetic staging account. Preserve existing
   production release/domain/CMS authority checks.
4. Snapshot the exact saved checkpoint at Update staging. Unsaved editor changes
   stay unsaved. A later draft does not silently update the preview; the admin
   shows the deployed checkpoint and whether updates are available.
5. Use platform-managed hostname provisioning, with exact account/zone/Worker
   allowlists and read-back. Never accept a visitor-supplied host, overwrite an
   existing foreign route, change customer DNS, or consume custom-domain quota.
6. Staging is noindex and no-store, with an obvious preview indicator. A preview
   build is not approval for production. Staging submissions and generated
   execution must use staging authority/data; never write live customer records
   or send real notifications via a production fallback.
7. Access, current entitlement, tenant/client/site scope, checkpoint identity and
   audit are checked on each authenticated mutation and public resolution.
   Deactivation/revocation takes effect on subsequent requests. Deterministic
   addresses are not secrets and cannot be used as authorization.

## Ordered implementation / live checklist

- [x] S1 Stable address and typed deployment-state contract (local tests).
  Test distinct UUIDs, same-site rename stability, malformed scope/host, HTTPS
  origin exactness, and no ready link for pending/unverified deployments.
- [x] S2 Durable, scoped staging reservation and snapshot lifecycle (local PostgreSQL tests).
  Reuse existing transaction/audit patterns. Test real PostgreSQL concurrency,
  restart recovery, tenant rejection, and old pointer preservation on failure.
- [x] S3 Platform hostname provisioning adapter (provider boundary tests; live attach pending).
  Read before attach; verify exact zone/service/host receipt; recover uncertain
  responses. Test conflict, partial failure, wrong provider response and retry.
- [ ] S4 Snapshot build and delivery through explicit staging bindings.
  Exact current checkpoint, all public routes/assets, no editor chrome, bounded
  build, immutable artifact hashes, noindex/no-store, scoped CMS/action policy.
  Test actual Worker/R2 delivery, invalid hosts/paths and revocation.
- [ ] S5 Agency and client admin staging panel and API.
  Show assigned address/status, Update staging and Open staging; custom-domain
  controls stay separate. Use Nuxt UI; RBAC/tenant checks; pending/error/retry UX.
  Test browser full-page navigation/mobile and failed-build recovery.
- [ ] S6 Provision a staging URL automatically with site setup; support existing
  sites on first use; package limits and no custom-domain prerequisite.
- [ ] S7 Update platform feature documentation; run section and final checks,
  review diffs, fetch current main, batch integration/release.
- [ ] S8 Host Fantasy's current saved site, verify home + internal page + assets
  + no live side effects, and return the actual working URL. Verify a second
  independent client and rejected cross-client accesses before completion.

## Source checked

Cloudflare Worker Custom Domains create managed DNS and certificates for the
exact hostname; no customer DNS ownership workflow is needed for our own zone:
https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
Attach/read-back API:
https://developers.cloudflare.com/api/resources/workers/subresources/domains/

## Current work preservation

### Implementation checkpoint, 22 September (not deployed)

- Native implementation: `shared/pageStudio/staging.ts`, migration 428,
  `workers/page-studio-management/src/staging*.ts`, private RPCs in `index.ts`,
  agency/portal staging GET/POST endpoints and shared `StagingWorkspace.client.vue`.
  Agency PublishingWorkspace embeds the panel; portal site cards link to a new
  staging page. A read-only role cannot update. Hostnames and actor identities
  cannot be supplied through the request body.
- Coordinator uses a two-minute token-fenced lease. Fresh permissions and exact
  checkpoint identity are rechecked before activation. Expired attempts become
  retryable; completed retry receipts never rewind a newer active snapshot.
- Studio implementation: `services/build-worker/src/staging-{build,delivery,worker,
  storage,images}.ts` and `wrangler.client-staging.jsonc`. New customer-preview
  Worker is separate from shared infrastructure staging. It has checkpoint and
  artifact buckets plus a private management binding, no action/database/email
  execution binding. HTTP accepts GET/HEAD only.
- Rendering excludes editor bootstrap data and private routes; navigation/motion
  runtime remains, forms runtime is excluded. Staging visibly marks a saved draft
  and disables submissions. This is currently a **read-only website preview**;
  interactive staging CMS/action execution is still part of the broader goal.
- Saved images use the existing site-scoped `preview-assets/<sha256>.<extension>`
  R2 objects. Snapshot manifests pin their hashes; build and delivery verify file
  signatures and actual bytes. This avoids copying every photo for each snapshot.
  Generated content is bounded to10MiB; media to512 files/128MiB total/10MiB each,
  with four concurrent reads. These defensive bounds do not replace plan quotas.
- Read-only live Fantasy lookup found checkpoint
  `checkpoint_a0a9ec85-4d8b-4fa8-9892-aa3d0377cd4b`, digest
  `7d3f6a9295ba5e32e5576afd0fe03ed6bea8d2a4bf069082dbbc235bc4270570`.
  The 402,116-byte checkpoint has 75 total pages, 8 forms and many local images.
  Source pointer/checkpoint stored only in owned `/private/tmp` verification files.
  At that read-only checkpoint, no production content, hostname, release or database migration had changed; migration 428 was applied later as recorded below.

### Latest evidence and remaining gates

- Native final staging section: **216 passed** in eight suites
  (`/private/tmp/root-client-staging-native-final-section.log`), including generated-feature
  build allowance enforcement before Worker execution, identical retry reuse,
  transaction rollback and competing staging/release admissions for the last slot.
- Shared UTC-month admission is implemented by migration 428 and used by ordinary
  release builds, generated feature builds and staging requests. Rejected quota
  requests return 429 with a package allowance message. Migration428 was applied to the configured production database on
  22 September at 09:20:16UTC; Fantasy's checkpoint was unchanged and all new
  tables were empty. Receipt is recorded below. Historic build records are counted toward allowance.
- Native staging HTTP/UI/deployment checks: 45 passed before adding exact zone and
  account drift cases. Management Worker typecheck passed. Customer-stage Worker
  typecheck and lint passed. Both Worker deployment dry-runs passed.
- Studio full build-worker suite: **85 passed**, including 16 deployment guard
  cases, real Worker RPC/R2 staging delivery, scoped images, revocation and
  restart with retained object storage. Combined log:
  `/private/tmp/root-client-staging-worker-suite-final.log`.
- Actual Fantasy checkpoint test-render: **66 public routes, 105 images**, verified
  from the scoped production checkpoint bucket; 15,451,074 image bytes and
  2,947,113 generated bytes. 106 read-only requests, 29.9seconds, zero remote writes.
  Evidence: `/private/tmp/root-fantasy-staging-render-evidence.json`.
- Fixed production account and active xeroflow.io zone were verified read-only.
  Management configuration now binds only the customer-preview Worker and exact
  zone/account. Deployment guards reject cross-environment bindings. Customer
  staging deploy requires clean exact current main and the reviewed Wrangler
  version that preserves API-managed custom domains when routes is empty.
- Live management secret-name lookup returned an empty list. Provisioning token
  must be configured during release. Cloudflare's signed-in browser is available;
  no new token, secret, domain or live content has been created in this section.
- Required before release: final checks and pre-commit review, admin browser
  verification, current-main integration, scoped provisioning
  secret setup, deployment and hosted Fantasy plus second-client verification.
- Current URL is a derived address only; no staging reservation is active. DNS lookup still fails; never present it as live
  until hosted HTTP/TLS and the saved site's pages/assets have been verified.

Studio worktree contains an uncommitted browser action-form section. 274 of 275
site-kit tests passed; the only full site-kit failure is the expected CSS snapshot
change. Focused 43 runtime tests passed after fixing the loader test harness.
A new real-Chromium suite is written but not run, formatting findings remain,
and full build/type/test/lint gates have NOT been run for this section. Do not
commit or claim it complete. Saved implementation belongs to this goal and must
not be reverted while staging is implemented.

### Release packaging checkpoint

- Migration428 applied with SHA256
  `60823ff8e6b3265624bd15031a4f765a02f3b6963a823fb605f09fb3c10d1f3d`.
  Receipt: `/private/tmp/root-client-staging-migration-receipt.json`.
  No staging address, deployment or build admission was created by the migration.
- Full native build first exposed the shared generated `.mjs` verifier being
  externalized by Nitro prerender. `nuxt.config.ts` now explicitly bundles
  `shared/pageStudio/generated/`; 169 public routes and final Nitro build pass.
- The earlier build2 immutable size guard **failed**: 26,110,888 raw bytes against 25,468,928
  (641,960 over); gzip 6,781,224 against 9,750,000. Do not deploy or weaken the guard.
  Evidence: `/private/tmp/root-client-staging-native-build2.log`.
- Investigation only: native and Studio both currently use Zod 4.4.3. A local
  prototype of the graph verifier measures 422,187 bytes self-contained versus
  85,553 with Zod externalized. No generator or provenance contract was changed;
  that alone would not remove the whole 641,960-byte overage. Prefer a reviewed
  service extraction or measured reuse of dependencies with meaningful tests.
- Both remote branches were freshly fetched this continuation: native 0 behind/
  21 ahead and Studio 0 behind/15 ahead before new local save points. No push or
  deployment was performed. Existing browser action-form work remains preserved.

### Verifier packaging follow-up (22 September)

- Native local save points: `e287d9ab5` (shared staging/release admission),
  `3270b6a25` (private staging management/provider/activation),
  `f4c779c6e` (native verifier packaging). Studio source import fix: `c954e37`. Studio staging
  save points: `20c8a0b` and `1a7227f`. No pushes or deployments.
- Changed only Zod import declarations in the 28 protocol source files feeding
  the self-contained verifier. Generated artifact remains import-free; licences,
  schemas, declared interfaces and golden fixtures are preserved. The checked
  deterministic generator records the new source and artifact hashes.
- Generated source is now 315,687 bytes; with minification and function names
  preserved it is 168,244 (previously 437,601). Native regression threshold 190,000
  failed on the previous bundle and passes on the regenerated artifact.
- Protocol 555 tests/typecheck/87-file lint and native 43 verifier/integration
  tests pass. Native ESLint passes. Logs: `/private/tmp/root-verifier-*`.
- Full build3 still fails the immutable final size gate: raw 25,839,587 /
  25,468,928 (**370,659 over**), gzip 6,732,450 /9,750,000. All 169 routes
  prerender. Artifact reduced 271,301 bytes; this is partial packaging progress.
  `/private/tmp/root-client-staging-native-build3.log` is the current evidence.
- Measurement-only investigation of compressing static SSR literals could save
  roughly 343KB at a 1 KB minimum (before runtime acceptance). No static markup
  compactor was added; by itself this would still leave a size gap. Keep the
  current release guard, and resolve the rest before hosting Fantasy.
- Browser action forms remain uncommitted and preserved. Overall AI builder,
  interactive staging CMS/action isolation, fresh-human rollback and final hosted
  acceptance are not complete. Fantasy DNS still does not resolve.
