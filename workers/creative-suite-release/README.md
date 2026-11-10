# Additive connected standalone release candidate

This directory prepares a private asset service and a gateway module candidate against the verified EDM5 gateway. It performs no upload, stable-route switch, secret change or deployment. The complete old ASSETS inventory stays attached to the original gateway; its bindings, old URLs, MotorStack RPC and specialised EDM1/3/4/5 and Email Library routing remain present.

The current standalone candidate now has version-local shared dock, install, session and MotorStack library code. The exact preserved shell source hashes are pinned in `shell-source-pins.json`; the library's dynamically loaded CSS is redirected into the same immutable version scope. Dock destinations retain existing stable app URLs; installed-app IDs and scopes also retain those stable URLs. This preparation alone does not make stable URLs select the new editors. Native canvas import, shared saving and cross-app document transfer are not established by the presence of a library UI.

Effect's replacement `sw.js` unregisters only its current registration. It has no fetch listener and deletes no cache, IndexedDB or OPFS data. The new version's service-worker request passes the same fresh account gate as the rest of the version. Old-version service-worker routing is untouched.

The private service has no public route, workers.dev URL or preview URL. Its exact inventory gate runs before ASSETS; unknown assets, direct `.br` requests and non-GET/HEAD requests are rejected. Three requested WASM URLs are mapped to their existing verified Brotli files with manual encoding. Headers and credentials are not forwarded from gateway users to either backing asset handler.

## Reproduce locally

Run the existing EDM5 generator first if `workers/figflow-edm-assets/gateway-dist/` is absent. It reproduces reviewed local modules; it does not deploy.

```sh
python3 workers/creative-suite-release/prepare.py \
  --stage /Volumes/Backups/Development/creative-suite-upgrade-20261110/assets-candidate-standalone-flow1 \
  --output /Volumes/Backups/Development/creative-suite-upgrade-20261110/NEW-connected-assets-candidate \
  --shell /Users/paulgiurin/orca/workspaces/dashboard/craft-hosted-rollout-20261028/workers/craft-editors/static \
  --gateway workers/figflow-edm-assets/gateway-dist

PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s workers/creative-suite-release -p 'test_*.py' -v
CREATIVE_RELEASE_DIR=/absolute/prepared/root node --test workers/creative-suite-release/release.test.mjs
```

The final prepared output is `/Volumes/Backups/Development/creative-suite-upgrade-20261110/connected-assets-candidate-005`. It contains 262 files, all below 25 MiB, copied exclusively from the verified stage plus reviewed wrappers. Stage metadata and current gateway module hashes are pinned. Output must be fresh; preparer preserves every earlier candidate.

Three Python guard tests passed (existing output, changed stage metadata and linked metadata). Five Node tests passed using the actual generated service/gateway: all stored hashes/sizes, shell/install metadata and cache-safe retirement, inventory/method/direct-compression rejection, real compressed-route headers, real fresh-authority gating before dispatch, cookie stripping, old route/EDM/library preservation. The test stubs only Cloudflare's platform base class and backing network services. No browser, provider or deployed runtime acceptance is claimed.

## Publication gates

Before publishing, freshly reconcile active/latest `xeroflow-creative-tools` deployment identity, runtime settings, bindings and module hashes. The receipt's baseline source hashes alone are not live-state evidence. Upload the private service first, verify actual stored/decoded responses through a contained binding probe, then prepare the gateway upload with `keep_assets:true`, all four existing bindings and exactly the new `CREATIVE_STANDALONE_ASSETS` binding. No gateway ASSETS directory should be supplied. Existing EDM release guards describe historical IDs and must not be used unchanged.

The generated gateway exposes only six new immutable scopes after existing authorization. Stable routes deliberately remain at their prior versions for acceptance. Actual browser startup/import/save/reopen/export, fonts, dock/session, installed apps and MotorStack Rust-canvas import remain release gates. The FigFlow stable entry continues to open the specialised Email Library; any later canvas selection must preserve that experience explicitly. This candidate does not claim a hosted native Film MCP service.

A reviewed `prepare-gateway.mjs` performs the fresh read-only deployment/latest/version reconciliation and writes an upload-only config. It requires clean exact current main and refuses an unknown uploaded version even when that version has no traffic. Its baseline is `0f9b678f-b5b3-47f5-9d84-0ab25126c6b2`, deployment `ea560989-67cb-407e-ab47-b5f2ba966e9d`, with the matching script etag/runtime and four existing bindings in `gateway-baseline.json`. Its two fixture tests passed, including drift rejection. It deliberately has no production upload or promotion operation.

After source review/integration and renewed artifact verification, the release operator's sequence is:

```sh
# Root must first establish this private service name is unused, or reconcile its
# active/latest version against a newly recorded baseline. Do not overwrite it blindly.
node node_modules/wrangler/bin/wrangler.js deploy --config /prepared/root/wrangler.jsonc --dry-run --outdir /fresh/dry-run/output
# Only after reviewing that exact serialized target and service inventory:
node node_modules/wrangler/bin/wrangler.js deploy --config /prepared/root/wrangler.jsonc

# Prepare against freshly reconciled gateway state, preserving existing ASSETS:
node workers/creative-suite-release/prepare-gateway.mjs /prepared/root
node node_modules/wrangler/bin/wrangler.js versions upload --config /prepared/root/gateway/wrangler.release.json
```

Read back the uploaded version and verify its module/binding/runtime state before any traffic allocation. The private service must already exist and have been checked through an authenticated binding probe. The script does not infer browser acceptance from an upload. A later stable-route promotion remains a separately reviewed source change with explicit FigFlow Email Library/canvas routing.


The final publication envelope is pinned in `publication.json`: receipt SHA256 `a3da4bec5515cb6dab46795cd270e09f307d6ecb61263239f9f416d065509ec0`. The receipt hashes service module, private configuration, exact inventory and compressed manifest as well as gateway modules. `validate-prepared.mjs` validates that frozen envelope, every actual public file and full inventory, private target/account, and all decoded Brotli hashes before publication. Gateway preparation calls the same validator. Run it immediately before either operator upload:

```sh
node workers/creative-suite-release/validate-prepared.mjs /prepared/root
CREATIVE_RELEASE_DIR=/prepared/root node --test workers/creative-suite-release/envelope.test.mjs workers/creative-suite-release/gateway-config.test.mjs
```

Five envelope tests passed, including four distinct service/config/manifest tamper rejections. These complement the five actual service/gateway tests, three Python input guards and two gateway-state tests. No unchanged binary build was repeated.
