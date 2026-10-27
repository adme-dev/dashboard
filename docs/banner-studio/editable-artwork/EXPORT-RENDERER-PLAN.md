# Private Banner PNG/JPEG/GIF renderer

Status: implementation and local proof; no deployment or hosted Browser Rendering acceptance. Root owns Pages integration and release. Worker task `task_8f2c22d90a85` owns this contract and `workers/banner-renderer/`.

## Problem and authority

Release `b8250892` (source `e58188d4e`) returned HTTP 503 because Pages left Puppeteer as unavailable external imports. Existing routes also loaded unrestricted resource URLs, ran arbitrary GIF script, enlarged CSS viewport instead of device scale for 2× output, and silently truncated GIFs. These are repaired at their respective boundaries rather than installing a local browser fallback on edge.

Pages authenticates the actor, authorizes the project, validates requests, stores output using its native storage authority, and writes existing export records. The renderer has **no DB, R2, user identity or secrets**. Contract shape alone grants no project access. Its only platform capability is `BROWSER`.

Private Workers are `banner-renderer-production` and `banner-renderer-staging`; each exposes named `BannerRenderer.render`, while both default and named `fetch` return 404. `workers_dev=false`, `preview_urls=false`, no routes or crons. Pages uses the exclusive matching `BANNER_RENDERER_PRODUCTION` or `BANNER_RENDERER_STAGING` binding, pointing to entrypoint `BannerRenderer`; the bridge derives expected environment from that binding.

## Wire contract

Pure, import-free `shared/bannerRenderContract.ts` exports `parseBannerRenderRequest`, `BANNER_RENDER_LIMITS`, `BannerRenderRequest`, `BannerRenderResponse`, `BannerRenderedItem`, `BannerRendererClient`, and `BannerRenderError`.

```ts
{
  version: 1,
  expectedEnvironment: 'production' | 'staging',
  requestId: string, // opaque /^[A-Za-z0-9_-]{8,64}$/
  output: 'png' | 'jpeg' | 'gif',
  jpegQuality?: number, // integer 1..100, required only for jpeg
  fps?: number, // integer 5..15, required only for gif
  items: [{ key: string, width: number, height: number, scale: 1 | 2, html: string }]
}
```

Keys match `/^[A-Za-z0-9][A-Za-z0-9_.:x-]{0,63}$/` and are unique. Unknown fields, nonfinite/fractional dimensions, mode-inappropriate fields, invalid scales and missing content fail before launching a browser. GIF requires scale 1. No URL, actor, project or caller-defined resource allowlist is accepted.

Success: `{version:1,ok:true,value:{items}}`. Each item contains `key`, `output`, `mime`, CSS `width/height`, `pixelWidth/pixelHeight`, `frames`, `byteLength`, lowercase hex `sha256`, and `bytes:Uint8Array`. GIF also has finite `durationSec` and actual encoded `frameDelayMs = round(100/fps)*10` (centisecond precision).

Failure is atomic per RPC call: `{version:1,ok:false,error:{code,message,itemKey?}}`; there are no partial bytes. Messages are fixed strings with no HTML, resource paths, tokens, stack traces or credentials.

Codes: `INVALID_INPUT`, `LIMIT_EXCEEDED`, `UNAVAILABLE`, `BROWSER_UNAVAILABLE`, `RESOURCE_BLOCKED`, `RESOURCE_FAILED`, `UNSUPPORTED_TIMELINE`, `TIMEOUT`, `RENDER_FAILED`. Pages independently verifies response metadata, signatures/dimensions, GIF frame timing, hash and bounds before storing.

## Approved limits

| Limit | Value |
|---|---|
| Items per RPC | 4; Pages batches the existing 25-format UI request |
| Static CSS side / device pixels | 4000 / 16,000,000; print 2480×3508 at 1× remains supported |
| GIF CSS side / frames / total frame pixels | 2000 / 100 / 60,000,000 |
| HTML per item / per call | 2 MiB / 6 MiB UTF-8 |
| Output per item / per call | 20 MiB / 28 MiB |
| Whole rendering deadline | 120 seconds including all items; cleanup attempts add at most 2 seconds per close |
| Navigation / asset settling | 15 seconds / 5 seconds |
| Worker CPU | 60,000 ms |
| Resource requests / response body / cumulative resource bytes | 100 per item / 10 MiB / 32 MiB per item |

Caps fail explicitly; there is no automatic scaling, partial export or frame truncation. Sequential items share one fresh browser session; every item has a fresh page. Pages/browser close in `finally`, including failure/timeout; late launch/page resolution also closes its resource. Close attempts are bounded; a provider that refuses close is a residual remote-lifecycle limit, not proof of successful cancellation.

## Resource and execution policy

HTML is delivered by intercepting the first navigation to synthetic `https://banner-render.invalid/document`. No caller URL is navigated. Chrome's automatic synthetic favicon is answered locally with 204.

Allowed resource destinations, reviewed by root on 27 October:

- Google font CSS: exact `https://fonts.googleapis.com/css2`; fonts: `https://fonts.gstatic.com/s/` with constrained font paths.
- GIF scripts only: exact cdnjs GSAP **3.12.2** `gsap.min.js`, `MotionPathPlugin.min.js`, `CustomEase.min.js`. No query or alternative version.
- Production app `https://app.xeroflow.io`: only `/api/public/banner-assets/v1.<48 base64url chars>.<43 base64url chars>` and exact `/fonts/banner/SourceSans3-Bold.9214b9d95e4231c609802815c2646c98174e2102d0d37f88978a7f8e71006e6a.ttf`.
- Legacy images/fonts: exact `https://agency-files.a5b299b3ad15c1b5b895dc66f9357b17.r2.cloudflarestorage.com`; signed query strings are retained, never logged.
- Inline data images/fonts. No blob URLs, frames, media, arbitrary scripts or generic app-host paths.

Staging app/asset lists are empty until separately reviewed; staging cannot inherit production assets automatically. Deployment guard pins these exact capabilities and manifests.

Each permitted HTTPS request is fetched by the Worker with no browser/caller cookies or headers, `credentials:omit`, `redirect:manual`, an abort signal and bounded streaming read. Any redirect fails before following `Location`. Responses are supplied to the browser with restrictive headers and font CORS; request failures fail the export. Private/IP/loopback hosts, credentials in URLs, nondefault ports, unknown origins and non-GET requests are rejected. DNS-prefetch is disabled in the document response.

Static PNG/JPEG disables JavaScript, freezes CSS animation/transition playback, waits for fonts/images and uses `deviceScaleFactor`, retaining the CSS-sized viewport. GIF uses only the explicit `window.__engagrFrame` protocol with finite duration, ready status, a timeline diagnostic, seek and clean runtime diagnostics. CSS animations are frozen while GSAP is explicitly paused/seeked. Resources are settled again before frame capture. External video/feed execution is unsupported and fails rather than silently claiming fidelity.

CSP blocks connection APIs, frames, workers, objects, base URLs, forms and media. Before document script executes, non-HTTP browser transports and popup/Worker constructors are made unavailable. No browser receives platform bindings or credentials.

**Root decision at 11:14 UTC:** preserve current HTML payloads, including unsaved editor state. GIF inline script is therefore **untrusted**, confined by the browser, CSP, interception and deadlines. This is not canonical script validation, and it must not be reported as trusted regenerated HTML. Browser sandbox integrity and the approved external script hosts remain residual assumptions.

## Packaging and verification

Package-local exact versions: `@cloudflare/puppeteer` 1.4.0, `gifenc` 1.0.3, `pngjs` 7.0.0; root dependencies are unchanged. The bundle reuses the repository synchronous PNG adapter and bounded inflater with explicit CJS/default interop. Compatibility date is `2026-07-15`, matching the installed workerd capability ceiling; both deployment configs use this same date.

Verification includes contract/resource/deployment/lifecycle tests, real local Chromium independent PNG/JPEG decode, and actual bundled workerd named-RPC/startup plus real PNG-decode/GIF-encode execution. It does not establish hosted launch, provider quotas, Pages binding deployment, production asset availability or full creative fidelity. See `EXPORT-RENDERER-REPORT.md` for exact commands and evidence.

Official references: [Browser Rendering Puppeteer](https://developers.cloudflare.com/browser-run/puppeteer/), [private named RPC](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/), [Workers practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/).
