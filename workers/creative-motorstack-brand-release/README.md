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

## Safe release procedure (not executed during preparation)

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

Inspect serialized multipart metadata and hash both module parts against `dist/manifest.json`. It must contain `keep_assets:true`, exact three inherited bindings, the expected date/usage model, and no assets manifest/JWT. `compatibility_flags:[]` is equivalent to an omitted empty flag list; no nonempty flags may change. The generated config has no asset directory, and `--no-bundle` plus explicit additional-module rules preserve exact reviewed bytes.

Use normal CLI `versions view`, `versions list` and `deployments list` for read-only runtime/deployment checks. Wrangler 4.110 `init --from-dash` rejects Workers with Assets, so it cannot independently download this source. For the actual upload, keep `--outfile /private/tmp/creative-rpc-actual-upload.bin`, verify its submitted module hashes, and record the successful version receipt plus immutable script etag. This establishes submitted bytes and accepted version, not independently downloaded source bytes; do not claim the latter without an approved API/provider capability. Reapply all baseline/current-main/serialized-release guards documented above. `versions upload` without `--dry-run` creates a version only; `versions deploy VERSION@100%` is a separate activation. Record both actual IDs and verify GET readback and all public/authenticated acceptance checks before proceeding. Preparation is not authorization to skip those checks.
