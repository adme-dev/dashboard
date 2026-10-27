# Protected saved export: local Chromium proof

Status: **PASS — synthetic local browser proof only.**

The new `test/workers/bannerScopedRendererBrowser.test.ts` connects production
`prepareScopedExport` to the existing `handleBannerRender` implementation and an
owned, real local Chrome process. It does not replace the server HTML builder,
authority checks, private asset resolver, renderer, or image encoders with mocks.
No production source file was changed by this proof worker.

## Reproduce and observed result

Run from the original `banner-editable-artwork` workspace using Node 24 and an
installed Chrome/Chromium:

```sh
pnpm exec vitest run test/workers/bannerScopedRendererBrowser.test.ts --reporter=verbose
```

Observed on the task run: Node `v24.18.0`, Google Chrome `156.0.8078.48`, Vitest
`4.1.10`; **1 test file passed, 10 tests passed, 0 failed, 0 skipped**, exit 0,
7.06 seconds. The local command log is
`/private/tmp/banner-scoped-browser-proof.log` (temporary, not a committed artifact).
The log records owned Chrome PID `28775` and positive exit confirmation.
Vite emitted its existing `configLoader: native` / `__dirname` advisory; it did
not affect the test result.

The suite fails if Chrome is missing. Startup, DevTools commands, rendering,
page navigation, and tests have time limits. Cleanup sends SIGTERM to the owned
Chrome only, escalates to SIGKILL after five seconds if needed, awaits its exit,
and asserts that its PID no longer exists before removing the temporary profile.
No `--no-sandbox` or other sandbox weakening is used. All generated HTML/ZIP and
the browser profile live under `/private/tmp/banner-scoped-browser-*` and are
removed at teardown; no permanent browser or server is started.

## What the ten tests prove

| Coverage | Observable assertion |
| --- | --- |
| Private PNG → PNG/JPG/GIF, three tests | Production preparation replaces the saved private locator with verified embedded PNG bytes; production rendering draws the source's red left half and blue right half. PNG and JPG independently decode to 600×500; GIF independently decodes both 300×250 frames with 200 ms delay. |
| Text-only protected canvas → PNG/JPG/GIF, three tests | A saved `dissectionSource` marker retains the source job/hash dependency even without an image locator. No private object read occurs. Independent decoders find black glyph pixels in the expected text region on a white canvas. |
| Private-image and text-only HTML/ZIP, two tests | Each server-prepared HTML document and its JSZip-packed/extracted counterpart is opened through `file://` in real Chromium: four page loads total. The runtime initializes, images decode, screenshots pass the same pixel checks, and text content is checked. |
| Revoked client assignment, one test | Real authority logic denies preparation with 403 before private R2 fixture access. |
| Stale text-only revision, one test | Preparation denies a previous saved revision with 409 before rendering or R2 access. |

The private source is a deterministic, valid 30×25 PNG. Its actual SHA-256 and
byte length populate the synthetic source manifest, delivery registry, asset
row, and request-native R2 fixture. The real resolver reads the object outside
the database transaction, verifies its length/MIME/hash, and rechecks authority.
The fixture uses a client-owned project, a CREATIVE role, and an explicit client
assignment; the real access code evaluates those records.

Saved format `mrec` supplies authoritative 300×250 dimensions and layers. Caller
HTML deliberately contains a private locator and script, and caller dimensions
are deliberately 1×1. Neither overrides the generated renderer request. Both
canvases use a bounded 0.4 second playback cycle; GIF exercises the generated
GSAP/frame runtime and both frames, with static artwork rather than animated
motion. PNG/JPG run the existing static renderer path at 2× scale.

Each renderer request is checked for absence of protected locators/storage keys,
the synthetic cookie/bearer token, caller script, and protected canvas markers.
Output bytes are independently decoded with `pngjs`, `jpeg-js`, and libvips via
`sharp` respectively, and their SHA-256 is checked. Production provenance
serialization/parsing retains the expected dependency and output digest.

Retained documents open in fresh browser contexts with no app cookies, after
the synthetic actor has been disabled. Every request is intercepted: only that
local document, embedded data, and the exact public GSAP URL are permitted.
The GSAP URL is fulfilled from the existing pinned test fixture. Unexpected
requests are blocked and fail the assertion; cookie/authorization headers also
fail it. All four loads make **zero authenticated source requests**, perform no
additional R2 reads, report no page errors, and render the expected artwork.
This demonstrates that already-downloaded bytes remain usable independently of
an application session; it does not promise revocation of copies already saved.

## Fixture boundaries and exclusions

- Database query/transaction I/O is synthetic and strictly routed to known
  fixture records. Real `resolveDissectionContext`, `assertDissectionAccess`,
  `withDissectionAuthority`, and `resolveScopedDissectionAsset` code runs; there
  is no real PostgreSQL connection, SQL lock/concurrency proof, or production DB
  access. The supplied actor ID represents an already-authenticated caller;
  this does not test session authentication or HTTP route middleware.
- The request-native `MEDIA_BUCKET.get` is an in-memory streaming fixture.
  No native hosted R2, persistence, download endpoint, or storage write is tested.
  The metadata check is serialization/validation, not a durable storage proof.
- The renderer's launch adapter connects the existing Cloudflare Puppeteer
  client to owned local Chrome. The real renderer source executes in Node; this
  run does not execute a workerd bundle, service binding/RPC, hosted Browser
  Rendering, a Pages deployment, or a production release artifact.
- Fonts use local system Arial. The only permitted external URL is public GSAP,
  served from the existing local fixture: no live CDN/provider requests occur.
  Retained HTML requires no authenticated source fetch, but still references
  public GSAP; this is not a claim of a completely offline HTML package.
- ZIP construction mirrors the existing JSZip export test convention. Chromium
  loads the extracted HTML, not the ZIP binary itself. This does not test the
  export modal, HTTP HTML endpoint, browser download UX, or archive extraction UI.
- No live provider, deployment, production database, new authentication, native
  engine canary, dependency change, release reconciliation, or broader feature
  acceptance is included. Hosted acceptance remains open.

## Source identity and handoff

Workspace: `/Users/paulgiurin/orca/workspaces/dashboard/banner-editable-artwork`.
Branch: `adme-dev/banner-editable-artwork`; HEAD:
`47ec30c3522f6ab660d730776709770c8a22d7c8`.
This shared workspace contains existing modified/untracked implementation files,
so HEAD alone does not identify the tested source. The branch has no configured
upstream; the locally recorded `origin/main` comparison was 1 ahead / 11 behind.
No fetch, branch reconciliation, commit, or release was performed by this worker;
the coordinator owns those steps.

Selected tested working-file SHA-256 values:

```text
5d6be80aea7a00fabbb90d79f98b2dff6a81b892132ad605ec796d7fc3e3d430  server/utils/banner/scopedExport.ts
97fb2754561c19cee4842104bf73baf95982c5ed7ffbf54ed16428deaea2162a  server/utils/banner/dissectionAccess.ts
5fadbf17d0a25509098f611f1c1c1ace6da56538e3a2fdf05155971109ba7637  server/utils/banner/dissectionDelivery.ts
1200b177fe98ca7b2ad05bcaeb2aa336575bc4f6a03e3a6e43eab922d6d62e82  server/utils/banner/htmlBuilder.ts
ec47b366e4349ad5b70ddb72fdfa50843f72c747cac7143714567dda8a332bfd  workers/banner-renderer/src/render.ts
2e74e85ce86132b2944809095cdc71d75a0d1b321ff97d61fe3e67be9951d378  workers/banner-renderer/src/codec.ts
2d068dc0c15cd64d70f65c62d6813589e2800b134e797e53402ac4fb70aeda1f  test/workers/bannerScopedRendererBrowser.test.ts
```

No production source defect was observed in these scenarios. The bounded local
proof is complete; the coordinator should rerun it if the relevant source
changes during reconciliation and retain the distinction between local evidence
and hosted/release acceptance.
