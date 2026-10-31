# Private MotorStack brand asset RPC

Adds private-only outbound diagnostics to the already deployed `MotorstackBrandAssets` WorkerEntrypoint. Logs contain fixed stage/error enums and numeric HTTP status only; no URL, headers, body, key or raw exception message is logged. The default HTTP authentication, launcher, editor bundles and asset routing remain unchanged. No new public HTTP endpoint is added. Pages calls through production-only `MOTORSTACK_BRAND_ASSETS` service binding; the provider key stays in the Creative Worker.

## Verified base

- Account `a5b299b3ad15c1b5b895dc66f9357b17`, Worker `xeroflow-creative-tools`.
- Active deployment `3219f175-ee7d-41f8-b3e9-520c2ec0b3d2`.
- Active version `5ed78b26-e678-48c2-9617-bef4304dd199` (100%).
- Source SHA256 `1461ce3b66e6b9914c75dd3fece63023b0d81d578f3c5844966095c106595080`.
- Compatibility date `2026-10-27`, usage model `standard`.
- Bindings: `ASSETS` assets, `CREATIVE_AUTH_KEY` secret, `MOTORSTACK_API_KEY` secret.
- Full runtime and asset-header baseline: `source/verification.json`.

`release.py` deterministically rebuilds both ignored distribution modules and their manifest from tracked source before every check/upload/deploy, so an old self-consistent dist/manifest cannot be released under a newer commit. `build.mjs` verifies the baseline hash and a single exact patch anchor. It changes only the private entrypoint import/fetcher wiring; the named entrypoint and HTTP adapter already exist in the verified baseline. Both baseline module hashes are pinned in the build. It does not replace or rebundle the default handler. The original source is pinned in `source/worker.js`; any upstream change requires a fresh read-only capture and reviewed reconciliation.

## Contract

`listBrands()` returns `{ schemaVersion: 1, brands: [{ id, name }] }`. Brand IDs match `^[a-z0-9-]{1,40}$`. A maximum of 1,000 brands is accepted; an oversized/malformed catalog fails explicitly, never silently truncates.

`getBrandKit(brandId)` returns:

- `schemaVersion: 1`, `brand: { id, name }`.
- `fonts: [{ role, family, file: string|null, weight: number|null, sourceWeight: string|number|null, assetId: string|null }]`.
- `logos: [{ assetId: string|null, role, variant, name, file: string|null, mime: string|null, onDark: boolean|null }]`.
- `colors: [{ name, value }]`, `assets: [{ id, name, type, mime }]`, `warnings: string[]`.

Actual provider roles are `heading`, `body`, `medium`; logo roles `main`, `on-dark`, `favicon`. Preserve these source roles explicitly. The provider's numeric weight is authoritative for the source mapping; never derive it from a filename. For example Ford heading weight 700 refers to `FordBold-400.woff2`. Shared files retain the same asset ID in each corresponding role. Missing files/weights remain null with warnings. No missing font is synthesized and no licensing claim is made. Bounded collections permit up to 100 logos, 100 font roles and 100 colours; malformed/oversized collections fail rather than truncate.

`getBrandAsset({ brandId, assetId })` returns a `Response` with bounded binary bytes, MIME and private/no-store headers. Asset IDs are SHA256 lowercase hex64. Each request revalidates brand membership and resolves the requested ID within that brand's current provider catalog. Caller URLs, tools, credentials and extra arguments are rejected. No provider URL/key is returned by metadata. Provider URLs and every redirect are restricted to the existing exact provider/R2 allowlist; Bearer credentials are sent only to the provider origin. Binary files are limited to 32 MiB; ICO files to 2 MiB. ICO accepts both icon MIME aliases and returns canonical `image/x-icon`.

Pages must authenticate/authorize its caller, validate actual file bytes (font signatures and safe SVG/ICO/raster content), and persist through managed asset storage before creating kits. Provider catalog access does not establish client ownership. Scope/tenant assignment stays in Pages. The RPC itself is private to trusted bound Workers, not an end-user authorization boundary.

## Test and build

From repository root (Node 24 used for verification):

```sh
node workers/creative-motorstack-brand-release/build.mjs
node --test workers/creative-motorstack-brand-release/brand-rpc.test.mjs
python3 workers/creative-motorstack-brand-release/release_test.py
node_modules/workerd/bin/workerd test --compat-date=2026-07-08 workers/creative-motorstack-brand-release/runtime.capnp
python3 workers/creative-motorstack-brand-release/release.py plan
```

The installed workerd is `1.20260708.1`, so local RPC smoke tests use its latest supported date. The production candidate retains `2026-10-27`; local tests do not claim coverage of newer compatibility behavior. Runtime smoke tests call the actual generated named entrypoint through a service binding, verify the private helper is unavailable, and consume the returned Response stream and headers. All outbound requests use a local provider fixture, never real credentials. An expected denied-brand exception is logged by workerd while the test passes.

## Historical API release procedure (do not execute)

The commands in this section record the original candidate workflow. Use the normal Wrangler CLI procedure below for current releases; automatic approval review rejected the custom OAuth-file-reading API transport.

1. Integrate reviewed source/tests with Pages on current main. Fetch again immediately before release and prove the candidate contains current main. Build and run the commands above. Record source commit, baseline deployment/version and module hashes from `dist/manifest.json`.
2. Serialize Creative Worker releases: do not run another upload concurrently. The legacy script API's `inherit` and `keep_assets` use the latest uploaded version, which can differ from active deployment. API preflight is not an atomic compare-and-swap; release serialization is necessary.
3. Run `python3 workers/creative-motorstack-brand-release/release.py check`. This makes only GET requests and verifies the active deployment, latest uploaded version, original module SHA, all binding names/types, complete runtime and asset header/routing settings. The source download is explicitly for the latest uploaded version, with latest-version checks before and after downloading; the API has no version selector. Stop on any drift. Never update baseline IDs just to bypass a failure.
4. On the exact merged current-main commit, run the explicit upload command:

```sh
python3 workers/creative-motorstack-brand-release/release.py upload --commit FULL_REVIEWED_MAIN_SHA --allow-mutation
```

This POSTs `/versions?bindings_inherit=strict`; it **does not deploy**. Multipart metadata uses `keep_assets: true`, inherits exactly `ASSETS`, `CREATIVE_AUTH_KEY`, `MOTORSTACK_API_KEY`, and retains compatibility/usage model. There is no asset manifest/JWT upload and no secret copy. The script verifies the uploaded source modules and complete runtime before writing `upload-receipt.json`.

5. Review that receipt. Before deployment, `python3 workers/creative-motorstack-brand-release/release.py check --version VERIFIED_UPLOAD_VERSION_UUID` performs a read-only post-upload verification. It checks the original active deployment, immutable original-version script etag and runtime, latest candidate identity and bytes, and the receipt's original upload commit against Cloudflare's version annotation. It never tries to fetch old-version content using an unsupported query parameter.

With no intervening upload, activate only that verified version:

```sh
python3 workers/creative-motorstack-brand-release/release.py deploy --commit FULL_REVIEWED_MAIN_SHA --version VERIFIED_UPLOAD_VERSION_UUID --allow-mutation
```

The script repeats active deployment, immutable baseline etag, latest version, complete runtime and candidate source checks. It also requires `HEAD == origin/main == remote main` and no uncommitted files in this release directory. A later current-main release-tool-only fix may activate the existing upload only when its current deterministic build is byte-identical to the original receipt, that receipt commit matches Cloudflare provenance, and the upload commit is an ancestor of current main. Never edit the receipt to relabel an old upload. The script then POSTs a 100% version deployment and records both original `uploadCommit` and current `releaseCommit` in `deployment-receipt.json`. The tool uses existing local Wrangler OAuth authentication; tokens never appear in command arguments or output. **Never use a partial asset-directory Wrangler deploy.**

6. Verify live deployment metadata, default HTTP authentication, seven launcher cards and all six editor asset sets before Pages activation. Inspect denied and permitted authentication paths, load actual editor bundles, and compare recorded launcher/asset hashes where available. Then deploy Pages via the repository's guarded `pnpm deploy:production` workflow and test the production binding through authenticated Banner Studio. Keep source, configuration, transport and rendered outcome evidence distinct.
7. Rollback, if needed, is an explicitly reviewed deployment of the recorded original version at 100%; preserve its original assets/bindings. This tool deliberately has no automatic rollback or blind retry. Reconcile newer source before any later release.

## Official API basis

- [Direct static asset uploads](https://developers.cloudflare.com/workers/static-assets/direct-upload/) documents `keep_assets: true` reuse without reuploading asset data.
- [Upload Version API](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/versions/methods/create/) separates upload from deployment.
- [Bindings API reference](https://developers.cloudflare.com/api/typescript/resources/workers/) documents `inherit` defaulting to latest and the legacy script API restriction on explicit version IDs.
- [Named RPC entrypoints](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/) documents named WorkerEntrypoint classes coexisting with the default handler.

- [Script content API](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/content/methods/get/) has no version query parameter; observed old/new version queries both returned latest uploaded modules. [Version metadata](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/versions/methods/get/) exposes each immutable version’s script etag separately.

## Current release transport: normal Wrangler CLI

Automatic approval review rejected a custom OAuth-file-reading API invocation during live diagnosis. Use normal Wrangler authentication for new network operations; do not use `release.py` API commands as a workaround. Offline `plan` and tests remain useful. No secret needs to be copied.

After reviewing and merging current main, generate the CLI config:

```sh
node workers/creative-motorstack-brand-release/prepare-cli.mjs FULL_CURRENT_MAIN_COMMIT
pnpm exec wrangler versions upload --config workers/creative-motorstack-brand-release/dist/wrangler.release.json --no-bundle --dry-run --outfile /private/tmp/creative-rpc-upload.bin
```

Inspect serialized multipart metadata and hash both module parts against `dist/manifest.json`. It must contain `keep_assets:true`, exact three inherited bindings, the expected date/usage model, and no assets manifest/JWT. The flag list must match the active baseline; the current list is `["global_fetch_strictly_public"]`. The generated config has no asset directory, and `--no-bundle` plus explicit additional-module rules preserve exact reviewed bytes.

Use normal CLI `versions view`, `versions list` and `deployments list` for read-only runtime/deployment checks. Wrangler 4.110 `init --from-dash` rejects Workers with Assets, so it cannot independently download this source. For the actual upload, keep `--outfile /private/tmp/creative-rpc-actual-upload.bin`, verify its submitted module hashes, and record the successful version receipt plus immutable script etag. This establishes submitted bytes and accepted version, not independently downloaded source bytes; do not claim the latter without an approved API/provider capability. Reapply all baseline/current-main/serialized-release guards documented above. `versions upload` without `--dry-run` creates a version only; `versions deploy VERSION@100%` is a separate activation. Record both actual IDs and verify GET readback and all public/authenticated acceptance checks before proceeding. Preparation is not authorization to skip those checks.

## Configuration-only public routing repair

The active diagnostic version at the time was `01deb944-d20a-4987-a9c9-b66faa64f9a9`, deployment `25d1ac45-9b4e-40b0-8d62-d96841d61698`. See `source/public-routing-baseline.json` for normal-CLI readback, exact submitted module hashes and the outbound-target review. The original `source/verification.json` remains the reconstruction baseline; it is not relabelled as this later deployment.

The observed RPC receives HTTP522 before the provider is invoked while the authenticated HTTP adapter succeeds. The only intended runtime change is `compatibility_flags: ["global_fetch_strictly_public"]`. Per Cloudflare's official documentation this sends global fetches through public routing rather than a same-zone origin path. This is a routing hypothesis until the live retry succeeds; it does not establish a provider defect. Existing URL restrictions, credentials and redirect checks remain unchanged.

Source review found only fixed public auth/provider endpoints and the restricted public R2 host. No global fetch targets the Creative Worker itself, and no intentional private origin fetch exists. `env.ASSETS.fetch` uses the asset binding, so this flag does not change its routing. Public routing may apply normal edge security; it does not bypass it.

For that repair, `prepare-cli.mjs` required generated module hashes to equal the submitted active diagnostic version, and added exactly the one reviewed flag. Run `node --test workers/creative-motorstack-brand-release/prepare-cli.test.mjs`, regenerate the CLI config with the actual merged-main commit, inspect dry-run multipart metadata, and verify before activation that all runtime/assets settings match the live baseline except this exact flag list. Do not run the old Python upload/deploy guard for this configuration delta. After activation, test live RPC catalog/provider arrival, existing HTTP catalog/authentication, public launcher/covers, and then real import/asset rendering before claiming resolution.

## Media connection release

The public routing repair succeeded: baseline version `02026280-47fc-4dbc-93c3-3f2b546e47ce`, deployment `07380698-c215-490c-848f-70954eeb6598`, source `4794ae06d07d25ac68e840d2f5339cd109e95104`. Normal Wrangler readback is recorded in `source/media-release-baseline.json` with exact reviewed candidate hashes. For that release, `prepare-cli.mjs` pinned those media candidate bytes rather than requiring the previous configuration-only candidate.

This release adds the exact public media CDN `motorstackmedia.driveagent.io` to the existing host allowlist and two private RPC methods on the existing entrypoint: `listMedia({brandId, model?})` and `getMediaAsset({brandId, model?, assetId})`. Provider credentials remain origin-only; each file is rebound to the current brand/model catalog, redirects remain validated, and metadata contains opaque IDs without provider URLs. Provider-filtered brochures retain their supplied labels (for example H7 / Haval H7); image matching is unchanged. The default authentication, launcher, existing editor assets and runtime configuration remain unchanged. Build preservation tests reverse only these declared source patches.

Use normal Wrangler version/deployment readback, verify active and latest versions against this baseline immediately before upload, preserve `keep_assets` and exact inherited bindings, inspect dry-run and actual multipart hashes, then activate only the accepted version after metadata review. Do not use the earlier Python API transport. Verify live HTTP media and Pages RPC media before claiming completion.

## Media preview and search repair — 31 October 2026

The observed Geely EX2 `.png` URL delivers valid `image/webp` bytes. The old exact filename-derived MIME comparison rejected it. `media-repair-patches.mjs` permits conversions only among PNG/JPEG/WebP/GIF and verifies the returned signature before forwarding its actual MIME; Pages validates the bytes again and saves the actual extension. PDF, font, vector, host, redirect and credential restrictions remain intact.

The brand catalogue now requests colour heroes from `get_variants` with photos disabled. Choosing a model requests its photos too, with the existing bounds and omission warning. The picker defaults to images and searches every typed word across names/type/format; documents remain explicitly selectable. Failed previews have an explicit retry.

## Creative catalogue release — 31 October 2026

The private named entrypoint adds `listCreativeCatalog({ brandId, kind })` for fixed `variants` and `offers` kinds. It verifies the brand through `list_oems`, calls `get_variants` or `get_offers` with fixed arguments, and returns bounded display fields without provider URLs or credentials. It exposes no new HTTP route and accepts no caller-supplied provider tool, model URL or asset URL. The Pages endpoint verifies the selected saved kit and client access, then validates the returned shape. Offer copy and disclaimers are shown as references with their end dates; no campaign canvas is changed automatically.

The feature was first released from source `5c7a01f9690c9d38688e72f841dccc86aa2fcb05` as Worker version `09923c96-b549-4b06-961d-ea23e378a767`, deployment `3ebe3253-f4db-4a09-9b4d-686c06c790d8`, and Pages source `81ffcad4eebe6bece02e6ae6fa3822dfcd96bbe9`, production deployment `af1ec274-cd2b-4e04-8c32-545714238df8`. Live Forthing variants loaded. Its no-offers response exposed a provider shape the first Worker rejected.

`source/creative-catalog-candidate.json` now pins the hotfix's two generated module hashes against the initial active Worker version. Hotfix source `869058095b6a95325fec268d4048a69d742d8128` accepts MotorStack's explicit zero-match response without accepting malformed nonzero offers. The dry-run and actual upload both contained only the two pinned modules, exact inherited `ASSETS`, `CREATIVE_AUTH_KEY`, `MOTORSTACK_API_KEY` bindings, `keep_assets: true`, compatibility date `2026-10-27`, `global_fetch_strictly_public`, and standard usage model. Readback of version `e5de27cd-41cd-456f-a7f7-9a91e0276777` showed the same runtime and six named RPC methods; deployment `d75c00fc-5168-4ddf-b410-aaf9967c1457` routed 100% traffic to it. The authenticated live retry displayed Forthing's empty state, and Geely's six published offers, end dates and full terms. Local unit and workerd RPC tests passed. The Pages endpoint needed no hotfix change.

`source/media-repair-baseline.json` records the then-active version `0bc6f95e-8a0c-49a1-8f6c-ebc3dd7b3e3e`, deployment `82181c14-6dd6-4454-8714-b0352f486ba1`, and its runtime/assets/bindings read through normal Wrangler. The prior submitted module hashes are retained separately from the reviewed candidate. Use the normal CLI procedure above, verify no active/latest drift before uploading, inspect multipart bytes and inherited assets, then activate the exact accepted version. The matching Pages MIME validation repair shipped with that media release.
