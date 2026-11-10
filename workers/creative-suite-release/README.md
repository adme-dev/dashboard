# Existing Creative Suite upgrade and guarded publication

This release upgrades the existing `creative.xeroflow.io` suite. It retains its launcher, seven cards, branding, dock/tab behavior, sign-in, installation identities, MotorStack HTTP/RPC and specialised FigFlow EDM1/3/4/5 paths. The complete old ASSETS binding stays attached to the original gateway. It creates a private additive assets service; it never replaces that binding with a partial directory. See [PARITY.md](PARITY.md) and [the release ledger](../../docs/runbooks/creative-suite-upgrade-20261110.md).

## Published release

The six normal canonical suite links were promoted on10November after actual owner-session hosted save/reopen/export checks for every editor. [published-release.json](published-release.json) records source9ac, exact gateway/private versions and deployments. [The release ledger](../../docs/runbooks/creative-suite-upgrade-20261110.md) distinguishes immutable publication, additive qualification and stable promotion. The preparation-time status fields below and in the frozen receipt describe the artifact before publication; they are not current deployment state.

## Frozen candidate

Current output: `/Volumes/Backups/Development/creative-suite-upgrade-20261110/connected-assets-candidate-009`.

- 264 stored files, all below 25 MiB.
- Receipt SHA256: `fa1163712c7a4516bcce19ef36d93cb7f33501896a3156158440350ec8ac8aad`.
- Inputs: verified standalone stageflow3, Photo0.22.0-flow2 and Film0.19.0-flow2, other four flow1 scopes.
- All assets, inventory/config/route manifests, decoded Brotli payloads, additive gateway and separate promotion modules are frozen in `publication.json`.
- Earlier candidates and original packages remain retained. No upload or traffic change occurred during preparation.

The shell preserves the existing loading XF logo, #1b1b1e theme, maskable icon, session overlay, MotorStack library and stable installation IDs/scopes/start URLs. Effect's replacement service worker unregisters only itself; it deletes no cache, IndexedDB or OPFS data.

New FigFlow's default entry preserves the existing library HTML and restrictive HTTP CSP, changing only its Canvas iframe to `/figflow/0.17.0-flow1/?canvas=1`. That query selects the native canvas. The Email templates iframe, hash navigation, explicit old paths and EDM5 save/bridge authority remain unchanged. Standalone0.17 is not an upgrade of the specialised0.11.2-edm5 engine.

The private assets service has no public route, workers.dev or preview URL. Inventory/method checks precede ASSETS. Unknown paths, direct `.br` requests and non-GET/HEAD methods are rejected. Requested WASM URLs map to verified encoded files with manual Brotli response encoding. Gateway dispatch follows fresh existing account authorization and forwards no user credential headers.

## Reproduce and verify

Generate the existing EDM5 baseline modules first if `workers/figflow-edm-assets/gateway-dist/` is absent. Preparation requires their exact recorded hashes and fresh output; it deploys nothing.

```sh
python3 workers/creative-suite-release/prepare.py \
  --stage /Volumes/Backups/Development/creative-suite-upgrade-20261110/assets-candidate-standalone-flow3 \
  --output /absolute/NEW-connected-candidate \
  --shell /Users/paulgiurin/orca/workspaces/dashboard/craft-hosted-rollout-20261028/workers/craft-editors/static \
  --gateway workers/figflow-edm-assets/gateway-dist

PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s workers/creative-suite-release -p 'test_*.py' -v
CREATIVE_RELEASE_DIR=/absolute/prepared/root node --test \
  workers/creative-suite-release/release.test.mjs \
  workers/creative-suite-release/envelope.test.mjs \
  workers/creative-suite-release/gateway-config.test.mjs \
  workers/creative-suite-release/promotion.test.mjs
node workers/creative-suite-release/validate-prepared.mjs /absolute/prepared/root
```

Five Python guards and nineteen Node tests passed against candidate009. Coverage includes actual file hashes/sizes, connected shells/install metadata, compressed route headers, fresh authorization, credential stripping, old paths/EDM, exact library HTML/CSP parity, native-canvas query selection, twelve canonical stable redirects, legacy-origin routing, tampered envelopes and failed promotion admission. Cloudflare's base class and backing network services are stubbed; these tests do not establish hosted/provider acceptance.

## Publication order

Use reviewed, clean exact current main after source integration and required CI. Reconcile the live gateway's active/latest versions, runtime, bindings and etag against `gateway-baseline.json` immediately before upload. Existing historical EDM release guards name older releases; do not execute them unchanged.

First establish the private service name is unused, or reconcile its current active/latest versions. Validate the frozen candidate and dry-run the exact immutable target/account/config before deployment:

```sh
node workers/creative-suite-release/validate-prepared.mjs /prepared/root
node node_modules/wrangler/bin/wrangler.js deploy \
  --config /prepared/root/wrangler.jsonc --dry-run --outdir /fresh/dry-run/output
# Review serialized target, configuration and inventory first.
node node_modules/wrangler/bin/wrangler.js deploy --config /prepared/root/wrangler.jsonc
```

Read back the deployed private service through a contained remote binding. The operator's temporary probe must listen explicitly on127.0.0.1, forward only the allowed canvas query, and compare actual stored/decoded responses with the frozen inventory. Keep source/command/response receipts; this is Cloudflare-account binding evidence, not end-user sign-in acceptance.

Next prepare and upload the additive gateway. It preserves all four existing bindings with `keep_assets:true` and adds only `CREATIVE_STANDALONE_ASSETS`. No gateway ASSETS directory is supplied:

```sh
node workers/creative-suite-release/prepare-gateway.mjs /prepared/root
node node_modules/wrangler/bin/wrangler.js versions upload \
  --config /prepared/root/gateway/wrangler.release.json
```

Read back source annotation, runtime, bindings and uploaded version before allocating traffic. The additive gateway exposes only the new immutable prefixes; stable selections remain old while the operator verifies the actual hosted editors, dock/session, MotorStack native import, Fig library/EDM and retained paths. An upload is not traffic allocation or browser acceptance.

## Stable route promotion

Separate `promotion/worker.js` and `promotion-receipt.json` select the six new versions on the existing canonical gateway. Legacy worker.dev origins keep their old routes and origin storage. FigFlow's stable route reaches its preserved library entry; `?canvas=1` reaches the new canvas. Original immutable versions remain available.

`prepare-promotion.mjs` requires an evidence-backed hosted acceptance JSON with:

- `status: "accepted-immutable-candidate"`, current `receiptSha256`, exact `sourceCommit`, matching additive `modules` and `promotionModules`.
- Actual `gateway` deployment/version/etag and `assets` deployment/version.
- True recorded checks: `allSixStartupSaveReopenExport`, `dockSession`, `motorstackNativeImport`, `figLibraryAndEdm`, `oldVersionsRetained`, `privateAssetService`.

The helper never generates acceptance. It rechecks clean exact current main, the frozen envelope, active/latest gateway and assets versions, and exact gateway source annotation/runtime/bindings. It writes an upload-only configuration:

```sh
node workers/creative-suite-release/prepare-promotion.mjs \
  /prepared/root /real/hosted-acceptance.json
node node_modules/wrangler/bin/wrangler.js versions upload \
  --config /prepared/root/promotion/wrangler.release.json
```

Review/read back that version before traffic allocation. After promotion, verify all six stable URLs and retained paths live and record exact source, private/gateway versions and deployment IDs. Keep the preceding verified gateway version available for rollback; never clear browser storage to upgrade.

Native Film MCP activation, shared XeroFlow project autosave and cross-editor document transfer are separate capabilities. Installed-app runtime behavior and universal historical-document/font fidelity remain distinct from browser and manifest checks.
