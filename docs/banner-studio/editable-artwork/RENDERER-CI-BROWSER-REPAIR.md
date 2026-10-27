# Renderer browser CI fixture repair

Date: 28 October 2026 (Australia/Melbourne).
Target source: `fb065b7d2fabc4c94c2aff490b1f35114a6aab7f`.
Failed CI run: `40508897634`; relevant log: `/private/tmp/banner-full-job.log`, lines 22769–22855.

## Finding

Both failures come from fixture layout, before any image decoding: a 4×3 CSS-pixel viewport with the default 8px body margin overflows. Classic scrollbars consume the entire viewport width. The renderer uses `captureBeyondViewport: false`, and Chrome rejects the screenshot with:

```text
ProtocolError: Protocol error (Page.captureScreenshot): Cannot take screenshot with 0 width.
```

The renderer converts that exception to `RENDER_FAILED`. The font fixture had already loaded its real pinned font; the GIF fixture had passed its forbidden-API check without any `pageerror`. Neither failure indicates a font-integrity failure, exposed network API, PNG decoder failure, or insufficient timeout.

macOS overlay scrollbars concealed the defect. The previous font test's text was also entirely outside its tiny screenshot, so successful capture did not prove visible glyphs.

## Deterministic reproduction

Browser: local macOS Google Chrome `156.0.8078.48`, real CDP connection and actual renderer source/bundle. No hosted browser or Linux rerun is claimed.

1. The unmodified release browser test and renderer were verified byte-for-byte against the target commit. The unmodified browser suite passed **15/15**, no skips.
2. In only the two failing fixtures, add this stylesheet without changing their original dimensions, body margins, runtime, font, or assertions:

   ```css
   ::-webkit-scrollbar { width: 15px; height: 15px; }
   ```

3. Run `pnpm exec vitest run test/workers/bannerRendererBrowser.test.ts`. Result: **13 passed, exactly the same two failed**, no skips. Both reported the same assertion failures as CI. The complete reproduction log is `/private/tmp/banner-ci-classic-scrollbars-red.log`.
4. A temporary screenshot wrapper logged DOM metrics immediately before calling the real `page.screenshot()` and rethrew its original exception. The independent diagnostic script is `/private/tmp/banner-ci-repro.mjs`, with the unchanged renderer bundle at `/private/tmp/banner-renderer-ci-render.mjs`.

| Original fixture | Scrollbars | innerWidth × innerHeight | documentElement.clientWidth | Font status | Capture |
| --- | --- | --- | --- | --- | --- |
| Pinned font | macOS overlay | 4 × 3 | 4 | loaded | 8 × 6 PNG, success |
| Pinned font | forced classic | 4 × 3 | 0 | loaded | zero-width protocol error |
| GIF API check | macOS overlay | 4 × 3 | 4 | no fonts | 4 × 3 PNG frame, success |
| GIF API check | forced classic | 4 × 3 | 0 | no fonts | zero-width protocol error |

The permanent test retains that exact classic-scrollbar CSS in both repaired fixtures, so reverting the layout repair remains observable on macOS. No browser flags hide scrollbars, and no screenshot method is mocked in the tests.

## Repair and retained contracts

Only `test/workers/bannerRendererBrowser.test.ts` and this report change.

- Give the font fixture a 160×40 CSS-pixel canvas, zero body margin, and explicit 20px text with 24px line height. Retain 2× output, real pinned font bytes, JavaScript-disabled rendering, and successful-render assertions. Independently decode the 320×80 PNG and require more than 100 opaque dark pixels, proving visible text instead of an empty white image.
- Remove the default body margin from the tiny GIF API fixture. Retain all eight forbidden-API checks and its explicit timeline. Set the background red only after those checks pass, then independently decode the GIF and verify its 4×3 size and opaque red pixel, plus one-frame renderer metadata.
- Keep the exact generated HTML, GSAP, font, 640×360 dimensions, 50 frames, source/bundle runs, and full-size workerd test unchanged. Keep failure, CSP, redirect, font-decode, lifecycle, resource-policy, and output-limit coverage intact.
- No production changes, timeout increases, assertion weakening, or added skips. The existing browser-discovery skip guard is unchanged; it did not skip any test in these runs.

## Verification

Final commands:

```sh
pnpm exec vitest run test/workers/bannerRendererBrowser.test.ts test/workers/bannerRendererPolicy.test.ts test/workers/bannerRendererIsolation.test.ts test/workers/bannerRendererInflate.test.ts test/workers/bannerRendererLifecycle.test.ts test/workers/bannerRendererContract.test.ts --reporter=verbose
pnpm exec eslint test/workers/bannerRendererBrowser.test.ts
```

Final results: **67 passed in six files, including all 15 real-browser checks, zero skips**; ESLint exits 0. Verbose final test log: `/private/tmp/banner-ci-browser-final.log`. The pre-existing Vite `configLoader: native` / `__dirname` warning is unrelated.

Full-size workerd verification still independently decodes a 640×360, 50-frame GIF with 100ms frame delays and changing image content. The local focused run recorded 574671 bytes, SHA-256 `b68c2264c5e5a16c707aae2b9255d45c3be412b6ad777b0970bcb2a088e82be7`, and 23630 changed pixels between checked frames. This is local runtime/browser evidence, not hosted acceptance.

Preserved release-source SHA-256 values:

| File | SHA-256 |
| --- | --- |
| `workers/banner-renderer/src/render.ts` | `ec47b366e4349ad5b70ddb72fdfa50843f72c747cac7143714567dda8a332bfd` |
| `test/fixtures/banner/generated-animated-export.html` | `ac1f54e312d646954d87229b754dc3c11934f784e80f8259322d4be369d8e25e` |
| `test/fixtures/banner/gsap-3.12.2.min.js` | `efc85c7eb141819717cda0033484a84b1c890d13b02e355a2fec79d424b20e7a` |

## Integration boundary

Work was performed in the assigned dirty `banner-editable-artwork` workspace on `adme-dev/banner-editable-artwork`, HEAD `47ec30c3522f6ab660d730776709770c8a22d7c8`; its tracked base is older than the release candidate. The renderer and browser-test working copies matched the target release at investigation start. The test is untracked against this workspace's older HEAD, so review its delta against `fb065b7d`, not its apparent all-new diff against HEAD.

The coordinator owns integration into `banner-artwork-release-20261027`, independent review, and the Linux/full CI rerun. No commit, push, deploy, native canary, credential read, or full application suite was performed by this worker. Unrelated dirty work remains preserved.
