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

Public routing and customer canary remain pending. No customer-domain launch is included: Fantasy Limo has no ready production domain.
