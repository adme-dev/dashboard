# Immutable FigFlow EDM assets

This private static service isolates `/figflow/0.11.2-edm1/` from the existing
creative editor asset set. It has no public route, workers.dev address, secrets,
database, or send capability. The creative host must retain its existing staff
authentication before forwarding this prefix, and must retain its existing
`ASSETS` binding with `keep_assets: true` when adding the service binding.

`prepare.py ARCHIVE BUILD_RECEIPT COMMIT` accepts only the successful native CI
browser archive with matching source, byte count and SHA-256. It refuses an
existing output directory, unsafe archives, missing relay/WASM and oversized
assets. Generated output lives under ignored `dist/`; retain its receipt with
the release evidence. Preparation is separate from deployment.

No production release has occurred. Matching source/native tests, browser
acceptance, current-main checks and a guarded creative-host binding change are
required before activation. See the active round-trip milestone ledger.

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

These commands have not yet been run for this milestone. No native or hosted
acceptance is implied by their presence.
