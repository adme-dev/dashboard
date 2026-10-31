# Private MotorStack brand asset RPC

Adds only the named `MotorstackBrandAssets` WorkerEntrypoint to the current Creative Suite Worker. The default HTTP authentication, launcher, editor bundles and asset routing remain unchanged. No new public HTTP endpoint is added. Pages calls through production-only `MOTORSTACK_BRAND_ASSETS` service binding; the provider key stays in the Creative Worker.

## Verified base

- Account `a5b299b3ad15c1b5b895dc66f9357b17`, Worker `xeroflow-creative-tools`.
- Active deployment `0ddd8bf0-96c3-4855-94fd-c2e85e9bf6f1`.
- Active version `4ac68720-79ab-450a-a38f-6a5c81294269` (100%).
- Source SHA256 `845b46f54c8a7584827a83b10e903b4f5035b4368d38460b4352d84fd7cdfe4f`.
- Compatibility date `2026-10-27`, usage model `standard`.
- Bindings: `ASSETS` assets, `CREATIVE_AUTH_KEY` secret, `MOTORSTACK_API_KEY` secret.
- Full runtime and asset-header baseline: `source/verification.json`.

`release.py` deterministically rebuilds both ignored distribution modules and their manifest from tracked source before every check/upload/deploy, so an old self-consistent dist/manifest cannot be released under a newer commit. `build.mjs` verifies the baseline hash and a single exact patch anchor. It exposes the existing bounded provider RPC/binary functions internally and appends a named entrypoint. It does not replace or rebundle the default handler. The original source is pinned in `source/worker.js`; any upstream change requires a fresh read-only capture and reviewed reconciliation.

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
3. Run `python3 workers/creative-motorstack-brand-release/release.py check`. This makes only GET requests and verifies the active deployment, latest uploaded version, original module SHA, all binding names/types, complete runtime and asset header/routing settings. Stop on any drift. Never update baseline IDs just to bypass a failure.
4. On the exact merged current-main commit, run the explicit upload command:

```sh
python3 workers/creative-motorstack-brand-release/release.py upload --commit FULL_REVIEWED_MAIN_SHA --allow-mutation
```

This POSTs `/versions?bindings_inherit=strict`; it **does not deploy**. Multipart metadata uses `keep_assets: true`, inherits exactly `ASSETS`, `CREATIVE_AUTH_KEY`, `MOTORSTACK_API_KEY`, and retains compatibility/usage model. There is no asset manifest/JWT upload and no secret copy. The script verifies the uploaded source modules and complete runtime before writing `upload-receipt.json`.

5. Review that receipt. With the same unchanged main commit and no intervening upload, activate only its verified version:

```sh
python3 workers/creative-motorstack-brand-release/release.py deploy --commit FULL_REVIEWED_MAIN_SHA --version VERIFIED_UPLOAD_VERSION_UUID --allow-mutation
```

The script repeats active deployment, latest version, complete runtime and candidate source checks. It also requires `HEAD == origin/main == remote main` and no uncommitted files in this release directory. It then POSTs a 100% version deployment and records `deployment-receipt.json`. The tool uses existing local Wrangler OAuth authentication; tokens never appear in command arguments or output. **Never use a partial asset-directory Wrangler deploy.**

6. Verify live deployment metadata, default HTTP authentication, seven launcher cards and all six editor asset sets before Pages activation. Inspect denied and permitted authentication paths, load actual editor bundles, and compare recorded launcher/asset hashes where available. Then deploy Pages via the repository's guarded `pnpm deploy:production` workflow and test the production binding through authenticated Banner Studio. Keep source, configuration, transport and rendered outcome evidence distinct.
7. Rollback, if needed, is an explicitly reviewed deployment of the recorded original version at 100%; preserve its original assets/bindings. This tool deliberately has no automatic rollback or blind retry. Reconcile newer source before any later release.

## Official API basis

- [Direct static asset uploads](https://developers.cloudflare.com/workers/static-assets/direct-upload/) documents `keep_assets: true` reuse without reuploading asset data.
- [Upload Version API](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/versions/methods/create/) separates upload from deployment.
- [Bindings API reference](https://developers.cloudflare.com/api/typescript/resources/workers/) documents `inherit` defaulting to latest and the legacy script API restriction on explicit version IDs.
- [Named RPC entrypoints](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/) documents named WorkerEntrypoint classes coexisting with the default handler.
