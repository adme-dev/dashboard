# Page Studio Astro runtime delivery

Status 27 September 2026: customer completion implemented and locally verified; hosted rollout evidence is recorded below as each deployment passes.

## Save, preview, staging and production

Save retains the private checkpoint. It does not build or publish a runtime site. An authenticated draft preview renders that checkpoint through the same Astro components used for published pages. Publication requires the exact saved version and latest approval, then atomically changes an immutable release pointer. Rollback changes that pointer and preserves newer private edits. Migration 434 fixes the previous site-metadata trigger which could overwrite those edits.

Production infrastructure can publish a shared staging release backed by its own database and R2 bucket. Its hostname must match the site's ready `page_studio_staging_sites` allocation. A production release requires an owned domain with active DNS, hostname and certificate verification. Staging infrastructure cannot publish production releases. The synthetic staging canary is an explicit configured scope/hostname and requires the site's synthetic flag. All publishers serialize hostname claims across environments.

Runtime staging and draft previews omit analytics and canonical production URLs and reject form POSTs. Production forms load a bounded public projection from the exact retained release through a private renderer binding, then reuse consent, origin, field validation, throttling and idempotency checks. Native intake verifies the active production pointer independently of later staging updates. Generated custom action code remains separately gated.

## Deployment identities and routes

Renderer Worker names derive from server code, browser assets and runtime configuration. Delivery selects an exact retained renderer identity for older releases. Keep referenced generations, assets and content until their rollback retention expires. Runtime Workers have no public route and require the shared delivery secret.

- Production private draft: `draft-<site UUID without hyphens>.xeroflowpages.com`.
- Staging private draft: `draft-<site UUID without hyphens>-staging.xeroflowpages.com`.
- Shared customer staging retains `preview-<site UUID without hyphens>.xeroflow.io`.
- Wildcard DNS and TLS cover one subdomain level on `xeroflowpages.com`; production's wildcard route is overridden by the more specific `*-staging` route. Existing `publish.xeroflowpages.com` keeps its more specific route.

See [Cloudflare route precedence](https://developers.cloudflare.com/workers/configuration/routing/routes/) and [Astro Cloudflare integration](https://docs.astro.build/en/guides/integrations-guide/cloudflare/). Astro renders on demand; component or renderer code changes deploy platform code, while ordinary content publication changes data only.

## Release sequence

1. Verify fresh main ancestry and local build, runtime tests, database regressions and review in both repositories. Batch code pushes.
2. Apply migration 434 to production and preview branch `br-long-mountain-a4f73v10` in Neon project `square-tooth-23821574`.
3. Deploy the retained staging artifact and both new immutable renderers with a scoped secret; deploy delivery bindings and private preview routes. Check private Workers are not publicly reachable.
4. Deploy Page Studio management (static staging denial) and Dashboard through its guarded `pnpm deploy:*` scripts. Record exact source, Worker versions and Pages deployment IDs.
5. Verify synthetic staging save/private preview/publication/rollback, unauthenticated denial and preserved draft.
6. Enrol Fantasy Limo, approve the reviewed saved version and publish its staging pointer. Move only its existing preview hostname to production Delivery after the pointer is ready; preserve the previous static deployment for recovery. Verify routes, navigation, inputs and version headers.

Recovery: restore a retained runtime release through the panel. Before first runtime publication, leave the existing static hostname mapping in place. If the first customer canary fails, restore its recorded static hostname mapping and delivery mode; do not replace its saved checkpoint.

## Local verification

Dashboard production build passes (25,367,121 raw bytes, 101,807 below guarded ceiling). 188 publication/staging tests plus 85 public form/legacy/Worker tests pass. Studio build, 43 typecheck tasks, full test suite and 186 focused runtime/delivery tests pass. Windows HTTP acceptance now uses the real loopback workerd listener while preserving RPC build/verification and R2 restart checks; no retry masks failures.

Dashboard repository-wide typechecking has existing errors outside this change; the newly introduced runtime-state query narrowing was corrected. Do not describe its global typecheck as passing. Full Studio lint found only a formatting issue in the changed Vitest config, corrected before release.

## Hosted evidence

Migration434 applied and read back in production and isolated preview. Private renderers uploaded from Studio71193c2:

- retained staging: `xf-astro-runtime-stg-21b84e1cde3f8be3`, Worker version `1fd83e0d-f091-495b-aba8-fbe12ae2b354`.
- current staging: `xf-asr-stg-a71fb2968a783bc114ee9a340ff7ff60a6c74ab442d49fa3`, Worker version `87525cb5-10ed-495b-bce8-8a6b421febf3`.
- production: `xf-asr-prod-a6a72b897cb1ddde19c975a711a37da398e7e00fbc72847a`, Worker version `1c42967c-deca-4e4f-a900-62ada79f2021`.

Always pin the identity printed by the actual upload, not an earlier dry-run: Astro generates a new server-island encryption key by default on builds ([Astro documentation](https://docs.astro.build/en/guides/server-islands/)). Existing generations are retained rather than rebuilt in place.

The initial pending routing/canary work above was subsequently completed by
Dashboard main `a0908aaa8dad86a5c233b97f0a7f78bf1bdb3d55` and the ordinary Astro
rollout. Studio main before the CMS increment is
`8ede9b215e443b9acc64fa21ad09b79393546872`. No customer-domain launch is included.

## Generated CMS components: separate publication admission

Runtime v1 supports ordinary saved pages. It does not implement the build-bound
native feature seal/current-CMS projection contract used by static feature
delivery. A cached editor component tree is not public CMS authority.

The CMS increment rejects nonempty builder libraries, selected collection/action
pins, any nested saved builder instance and generated action-form mappings during
runtime release preparation, before writing retained content. The saved draft is
preserved. Authenticated private previews remain separate. Matching Studio guards
reject unsupported public HTML/form projections and exclude older unverified cache
entries. This prevents silently publishing stale CMS field visibility.

Local verification: 39 focused native preparation/route/projection cases and owned
ESLint pass. No migration is required. This entry records local implementation;
deploying the guard does not activate generated components. Existing deployed
renderer generations remain unchanged until their own reviewed rollout.

Before activation, implement runtime-release-bound recovery/seals and native
hostname/environment/pointer-epoch admission, project current scoped records, and
rematerialize pinned components inside Astro. Rollback retains newer CMS records
and current visibility. Verify two scopes and revoked/private/archived data. Do not
enable generated action forms or hosted feature AI to bypass these requirements.
## CMS recovery identity preparation (local increment)

`runtimeFeatureRecovery.ts` retains canonical generated component/collection
recovery bytes through the Studio-generated native verifier. The reference binds
the complete runtime release digest, including renderer and environment. Existing
objects are verified, never repaired by overwriting; new writes require verified
readback. No live record heads are retained.

This utility is not called by the public publish route yet. The internal
`prepareApprovedRuntimeFeature` coordinator now checks the original native login,
publish permission, accepted CMS graph and exact approved version before storage
work, then rechecks the same authority afterward. It reuses the static path's
recovery construction without compiling a static build. A successful return is
preparation evidence only. Activation still needs atomic binding to the current
host/environment/pointer epoch and fresh CMS projection for public responses.

Local verification on 28 September: five new preparation tests passed against a
disposable localhost PostgreSQL database, covering successful/idempotent
preparation, absence of build/release writes, rejection before storage for an
unapproved version, and approval/permission/login revocation during retention.
The complete feature-publication PostgreSQL suite passed 82 tests with one
existing skipped test. No production database or client content was touched.
Log: `/private/tmp/dashboard-runtime-feature-postgres.log`.

The ten-second deadline applies to recovery retention/readback, not the earlier
recovery loading and snapshot/media materialization stages. HTTP integration
must supply an overall request deadline. The CMS publication admission guard
remains in place. This is not evidence that generated CMS components or actions
are enabled in a deployed site.

## Runtime CMS publication (migration435)

The runtime CMS coordinator prepares exact approved recovery, then stores the
release, immutable seal, hostname pointer and epoch activation atomically. Public
projection uses current accepted record heads and field visibility under current
site/client/package authority. Explicit restore creates a fresh activation and
preserves current records; historical retries cannot revive revoked grants.

Apply `435_page_studio_runtime_features.sql` before deploying this code: public
host resolution references both new tables, including ordinary/static hosts.
The private machine routes are `published/runtime/page` and
`published/runtime/forms` under `/internal/page-studio/`. Ordinary lead forms
remain supported; generated action forms are not enabled by this work.

Coordinate the reviewed Dashboard source with the Studio Delivery worker and
immutable Astro renderer generation. Complete synthetic scoped-account and
compiled runtime acceptance before enabling customer CMS publication. The paired
Studio research record is `docs/research/2026-09-28-runtime-cms-publication.md`.

Before deploying Dashboard for CMS acceptance, verify that its target environment
sets `PAGE_STUDIO_ACTION_RUNTIME_DIGEST` to the verified deployed Studio action
runtime identity. Compare it with Studio's
`services/sandbox-worker/src/feature-action-runtime.ts` pinned digest and
`services/action-runtime/tooling/runtime-identity.mjs` verification. Read back the
deployed Dashboard setting; the local PostgreSQL fixtures supply it explicitly.
The native CMS graph coordinator requires this prerequisite even for candidates
containing only collections and components. Missing or malformed configuration
returns `503 CMS_GRAPH_RUNTIME_UNAVAILABLE` before graph acceptance, surfaced by
the editor as a control-plane `502`. Private preparation objects may already
exist; they do not acknowledge acceptance or change the current library. This
setting does not enable generated action forms or CMS publication. Configure only
the reviewed target environment; do not supply a fallback or activate production
as part of synthetic staging acceptance.

CMS runtime publication defaults to disabled. Configure the operator-owned
`PAGE_STUDIO_RUNTIME_CMS_ADMISSIONS` for an explicitly authorized synthetic
acceptance site only after verifying the deployed renderer's identity. Customer
admission additionally requires completed scoped hosted acceptance. It is a JSON
array of exact site, publication environment and renderer identities:

```json
[{"scope":{"tenantId":"page-studio-staging","clientId":"10000000-0000-4000-8000-000000000001","siteId":"a27135dc-1374-475c-a56d-7e60310425bb"},"environment":"staging","renderer":{"name":"astro-runtime","generation":"<verified-generation>","codeDigest":"<verified-64-character-sha256>","assetsDigest":"<verified-64-character-sha256>"}}]
```

Replace every renderer placeholder with verified deployed values. Missing,
malformed or mismatched entries reject CMS publication before content retention
or pointer changes. Keep production unset until the integrated production
renderer and customer rollout are approved. Ordinary website publication remains
available. CMS rollback requires an exact admission entry for the retained
renderer as well as its existing retained-generation configuration; keep both
while rollback is supported. Changing the current renderer does not admit older
generations automatically. Generated action forms are rejected before retention
and publication even for admitted renderers; ordinary native lead forms remain
supported.

Production Dashboard can project a staging pointer only through its owned,
provider-verified ready staging host. The isolated staging deployment retains its
explicit synthetic canary exception (`PAGE_STUDIO_RUNTIME_STAGING_CANARY` and
`integrations.synthetic=true`); it cannot project production pointers. The
exception never widens production Dashboard hostname authority.

28 September local verification: full Dashboard build passes (25,387,341 raw
Worker bytes); native feature PostgreSQL suite passes 109 tests with one existing
skip, including restore preserving records created after publication. Native
route/deadline cases pass. Global typecheck retains unrelated baseline errors.
Migration435 SHA `5640066fa7c07e1a7b7efdd2a2d1817f2718e9ade94e71e4bd46a5d875ea81f6`
was applied and read back on production and isolated staging; scoped site
checkpoint/version/release pointers were unchanged. No CMS publication or customer
draft write was performed. Hosted deployment and scoped acceptance remain open.
