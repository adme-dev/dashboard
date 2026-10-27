# Renderer resource routing review

Reviewed 27 October 2026. **No blocker found in the minimal routing patch.** Independent local review supports the change; the coordinator subsequently reported successful hosted PNG acceptance. Caller-zone inheritance remains an inference, not an independently established runtime fact.

## Scope and evidence boundary

Read-only review of the original dirty worktree; only this report was written. No deployment, production-log access, credential access, or live application requests were performed. Compared current renderer files with supplied hosted baseline `39bfe92b9`. Local checkout HEAD was `47ec30c3522f6ab660d730776709770c8a22d7c8`; this report does not attest release-branch currency or deployment provenance.

The coordinator supplied the initial controlled observations: identical saved synthetic 640×360 HTML with pinned SourceSans3 succeeds through a local remote binding but fails through Pages; removing its font-face allows Pages to render and persist a private PNG. These isolate a resource-dependent failure and are consistent with routing differences, but alone do not establish the exact failing network hop.

## Primary-source finding

- Cloudflare's [compatibility flags documentation](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#global-fetch-strictly-public) states that the flag routes global fetch through the public Cloudflare front door. Without it, same-zone requests can bypass Workers and Cloudflare security and go to origin. The documentation supplies no default enable date for this flag.
- The [workerd compatibility definition](https://github.com/cloudflare/workerd/blob/main/src/workerd/io/compatibility-date.capnp#L419-L458) declares the enable/disable flags without an enable-date annotation and explains this origin-bypass behavior. It also expressly says the flag has no effect in standalone workerd, whose outbound routing is configured separately. Consequently, local workerd success cannot establish this hosted fix.
- `render.ts` intercepts browser resources and sends approved URLs through `fetchBannerRenderResource`, a lexical global-fetch wrapper. This is the relevant flag-controlled boundary; the native-fetch receiver fix is preserved. Exact same-host font and signed-asset paths must reach their public Pages handlers.

The documented mechanism supports the hypothesis and the minimal flag addition. The reviewed public sources do **not** specifically prove that this RPC invocation inherits the Pages caller's zone. Do not promote that inference into a confirmed root-cause claim.

## Patch and type-generation review

Against `39bfe92b9`, the reviewed delta is exactly:

1. Both renderer JSONC configurations add `global_fetch_strictly_public` alongside `nodejs_compat`, retaining compatibility date `2026-07-15`.
2. `deploy.mjs` pins that exact pair, preserving all account, target, binding, origin, route, preview, and worker-publication guards.
3. `bannerRendererIsolation.test.ts` requires the flag and verifies rejection of omitted/private-origin variants for both environments.

`resourcePolicy.ts`, `render.ts`, and both generated declaration files are byte-identical to the baseline. The coordinator reports running `generate-types.mjs`; this reviewer did not regenerate files outside its ownership. Unchanged declarations are reasonable: there is no binding change, and generation uses `--include-runtime=false`. Keep the existing CI regeneration/diff and strict typecheck gates. Cloudflare documents that [generated types reflect configuration and compatibility settings](https://developers.cloudflare.com/workers/languages/typescript/#generate-types); no manual declaration edit or compatibility-date upgrade is justified for this patch.

## Regression and security constraints

- Preserve private RPC ingress: no routes, workers.dev or preview URLs, and HTTP entrypoints still return 404. Public **outbound routing** does not require public renderer exposure.
- Retain exact HTTPS origin/path/type allowlists, GET-only requests, manual redirect rejection, omitted credentials, and no copied browser/caller headers. The flag is not a replacement for resource validation.
- Preserve pinned font byte length and SHA-256 verification, failed-font rejection, resource byte/count/deadline limits, CSP, disabled static-image JavaScript, GIF network API restrictions, and browser cleanup. Do not accept fallback-font output as success.
- Public routing can expose legitimate requests to WAF/Access/challenges or redirects. Such responses must fail closed; do not weaken security, add credentials, or forward challenge bodies to bypass them. Existing diagnostics retain stage/status without resource URLs or bodies.
- Tests protect configuration and local rendering, not Cloudflare routing. Hosted acceptance must exercise the actual Pages/editor path with the same saved HTML and font. Signed-asset delivery and other output formats require their own acceptance if claimed; a font PNG alone does not prove them.

## Verification and hosted update

Independently executed on Node `v24.18.0`:

- Five renderer suites (`Isolation`, `Policy`, `Contract`, `Lifecycle`, `Browser`): **49 tests passed**, including real local Chromium with mocked resource transport.
- Both `deploy.mjs <environment> --check-only` guards: passed.
- `tsc --noEmit -p workers/banner-renderer/tsconfig.json`: passed.

Coordinator message `msg_fe1b6c953c0d` subsequently reports renderer source `86ebf6fd3`, deployment version `cb00095b-73af-4cfb-acef-9b54aa52de11`, and successful actual editor PNG download: 640×360, 35,124 bytes, independently decoded by the coordinator with Sharp; SHA-256 `25e801dee9da48cc0b96d84c7b4b9819d202fb291e0d79ca7096e183311f557c`, saved export `45b8ecb0-74c5-4ccd-8f35-1046931db44d`. This is **coordinator-reported hosted acceptance**, not a live check by this reviewer. It supports the flag-only repair outcome for that PNG while leaving exact zone inheritance and broader format/resource coverage unproven.
