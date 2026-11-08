# Immutable FigFlow EDM assets

## edm5 additive publication source — not published

Use `prepare-bundle.py`, `edm5-gateway.py` and `prepare-gateway.mjs` for this
candidate. The historical `creative-release.py` below is pinned to an obsolete
gateway and must not be used to replace current production. The builder first
reproduces the verified live edm4 gateway from `creative-multibrand-release/build.py`,
including MotorStack vehicle/offer/date changes, seven launcher cards, existing
authentication and editor routing, then changes only its native prefix allowlist.

`publication.json` pins active/latest private asset version
`b278e54b-debc-4af1-9173-fba6964dfb87` at deployment
`1d62c12f-6f7d-4778-82a8-3dfa6e88ea4a`, and gateway version
`b50acb4f-30d5-48a1-a711-339f3b98c979` at deployment
`670df50b-4fb7-45d9-94e5-eb9f58f1a44a`. It retains the full gateway
runtime/bindings/module hashes and every edm1/edm3/edm4 file pin. The edm5 package
is exact native source `404e3ff06f1619d928218c5dd0236143209750be`, successful
workflow-dispatch run `41856781523`, archive SHA-256
`c18d7d71745a7bff680ca8c8163e8ec9be08e215602dbc4f6459a135bd43f508`.
Its 31 runtime files come from that retained archive; no synthetic PR checkout
receipt or relabelled package is accepted.

The baseline above was reconfirmed by read-only Wrangler deployment/version
readbacks on 8 November 2026: it is the current 100%-traffic edm4 release from
`bbb6b07a36dcc48dd92590e125564f07b2f61acd`, with gateway `worker.js`
`f1f4602ed93ff4a9aa75d0f611f74a7ba6d7a6be9c890fba7df669c253b0c665` and script
etag `a7e8602713c3103e309fac04e78e37f4ac78f6829713076c09a93d553b9f6057`.
Older pre-edm4 baselines still recorded on main must not replace this live
parent during merges. The raw receipts are retained in
`.verification/edm5-completion-20261108/`; any subsequent live change remains a
release stop requiring a new explicit reconciliation.

Preparation requires the retained schema-2 edm1/edm3/edm4 bundle and its 90
verified files plus the exact edm5 archive/receipt. It validates every base
receipt entry and byte, writes a separate `dist-edm5` output, and refuses an
existing output, missing versions, changed inventories, unreviewed bytes and
archive traversal. The resulting receipt and tree contain exactly 121 runtime
files: 30 edm1, 30 edm3, 30 edm4 and 31 edm5. Existing dist directories must be
preserved and reconciled explicitly, never overwritten.

The asset worker accepts only edm1/edm3/edm4/edm5 prefixes on the existing host.
Successful versioned responses are `private, max-age=31536000, immutable`;
errors and the unversioned library shell stay `private, no-store`. Authorization
stays in the gateway before service forwarding; cookies/credentials never enter
the private asset request. No shared/public cache is enabled. Target remains
`xeroflow-figflow-edm-assets`, account `a5b299b3ad15c1b5b895dc66f9357b17`,
workers.dev/previews disabled, no routes, ASSETS only.

The gateway candidate changes exactly one expression: the verified live
edm1/edm3/edm4 condition becomes an explicit edm1/edm3/edm4/edm5 prefix
allowlist. Reversing that expression must restore the live edm4 `worker.js`
hash exactly; `brand-rpc.mjs` remains unchanged. Preparation requires current
clean main and live active/latest version equality and emits a version-upload
configuration with `keep_assets: true` and all four existing bindings inherited.
It never supplies a gateway asset directory or secret values. Any live/latest
drift must stop the release and trigger reconciliation; do not update baseline
pins merely to clear a guard.

Release sequence after independent review and source integration:

1. Preserve the verified edm1/edm3/edm4 `dist`, then prepare the additive bundle:
   `python3 workers/figflow-edm-assets/prepare-bundle.py workers/figflow-edm-assets/dist EDM5_ZIP EDM5_BUILD_RECEIPT`.
   Inspect `dist-edm5/receipt.json` and all 121 files.
2. On exact clean current main with the pinned Node version, run
   `node workers/figflow-edm-assets/deploy.mjs --check-only`, then `--dry-run`.
   Verify target and full inventory; the mutation path additionally verifies
   unchanged native CI inputs, successful exact-source CI and unchanged live
   asset baseline before publication. Publish only through this guarded script.
3. Run `python3 workers/figflow-edm-assets/edm5-gateway.py` and its tests; then
   `node workers/figflow-edm-assets/prepare-gateway.mjs FULL_CURRENT_MAIN_SHA`.
   Inspect `gateway-dist/manifest.json` and use Wrangler version upload **dry-run**
   with the generated config and `--no-bundle`. Inspect serialized multipart
   metadata/module hashes: inherit all assets/runtime/bindings and retain the
   launcher, MotorStack and every existing tool route. No partial asset upload.
4. Only after that review, upload a gateway version without traffic. Verify its
   exact module hashes, edm5 annotation, complete runtime/asset settings and all
   four bindings via normal Wrangler readback; verify active/latest identities
   again immediately before switching traffic. This preparation helper does not
   perform upload or deployment. A stale upload or unrelated latest version is a
   stop.
5. Verify authenticated edm1/edm3/edm4/edm5 assets and all existing creative
   tools, launcher, MotorStack routes, auth refusal and QR Codes. Record
   deployment IDs, source and hashes. Only then make a separate runtime-pointer
   change and run Pages gates from latest main; publish assets before changing
   the pointer.

Rollback: leave all immutable assets installed and restore the prior application
pointer first. The recorded prior gateway is a rollback target only while no
subsequent creative changes would be lost; re-read live state before rollback.
Do not roll the asset service back after a newer pointer depends on edm5 unless
the pointer has already been restored. No flag, migration 499, Pages build or
application pointer is changed by this candidate.

Remaining acceptance: independent publication review, guarded serialized dry-run,
live publication/receipts, hosted dual-surface and ordinary-role acceptance.
The bounded historical monochrome emoji font is not full modern/color/ZWJ emoji
coverage, and protected arbitrary Html fallback is not whole-Ford native fidelity.

Cloudflare references checked for this candidate:
[Worker-first asset routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/),
[asset headers](https://developers.cloudflare.com/workers/static-assets/headers/),
[versions and deployments](https://developers.cloudflare.com/workers/versions-and-deployments/).

## Historical edm1 release

This private service isolates `/figflow/0.11.2-edm1/` from the existing
creative editor asset set and serves an exact standalone-index navigation shell.
It has no public route, workers.dev address, secrets,
database, or send capability. The creative host must retain its existing staff
authentication before forwarding this prefix, and must retain its existing
`ASSETS` binding with `keep_assets: true` when adding the service binding.

The shell's Canvas/Email templates navigation keeps the old canvas mounted and
loads the scoped app library in a separate frame. `?canvas=1` retains the original
standalone assets behind the same creative authorization. No native archive is
rebuilt for this navigation change. `creative-release.py` now reconciles against
verified live gateway `595f31ce-abd5-4e3d-ba7c-b9e1f3f59fce`, preserving its
existing native service, assets, runtime and secret bindings. New production
receipt/hosted acceptance belongs in the template-browser report.

`prepare.py ARCHIVE BUILD_RECEIPT COMMIT` accepts only the successful native CI
browser archive with matching source, byte count and SHA-256. It refuses an
existing output directory, unsafe archives, missing relay/WASM and oversized
assets. Generated output lives under ignored `dist/`; retain its receipt with
the release evidence. Preparation is separate from deployment.

Production asset version `86f446f6-f9de-4ce1-b6af-10a0bf722cb1` and creative
gateway version `595f31ce-abd5-4e3d-ba7c-b9e1f3f59fce` were deployed from main
`b63cd1e59bebcbc6f88d698f7eac62ee52953924` after native CI and isolated actual-WASM
acceptance. Hosted staff acceptance passed on 2 November, including native mouse/keyboard
edits and two saved composer round trips. See the completed milestone and
`docs/email-builder/figflow-production-activation-20261102.json`.

Release order after final verification:

1. Prepare the successful native CI archive and retain `dist/receipt.json`.
2. From clean current main, run `node deploy.mjs --check-only`, then
   `node deploy.mjs`. The guard validates all prepared bytes, native source
   ancestry, unchanged native inputs, and successful GitHub native CI.
3. Run `python3 creative-release.py plan` and `check`. The gateway build must
   reproduce the currently verified creative base, and the private asset service
   must already have the current source tag with workers.dev disabled.
4. Run `python3 creative-release.py upload`, inspect `dist/creative-upload.json`,
   then `python3 creative-release.py deploy`. Upload is a version only; it does not
   route traffic. The guard preserves current assets, runtime, secrets and old
   editor routes, and refuses changed live source or an unrelated latest upload.
5. Verify the new immutable package through the authenticated creative host and
   all existing editor/launcher routes. Retain the deployment receipt and prior
   creative version for rollback. Enable composer/backend flags only after the
   separate private email service and schema prerequisites are verified.

Steps 1–5 completed for the recorded release, including authenticated hosted
editing and persistence acceptance on 2 November.
The promotion script is pinned
to its previous creative baseline; after successful deployment it must refuse
that old baseline. Reconcile the current source/version before another release.
Cloudflare, authentication-boundary and authenticated hosted acceptance passed;
real email-client rendering remains separate.
