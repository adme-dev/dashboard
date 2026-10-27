# Companion platform font delivery

27 October 2026. Task 1 of [the companion plan](COMPANION-REVIEW-PLAN.md) provides the exact existing Linux font through the platform, browser verification/measurement, and the existing editor/export font interfaces. This is local source and focused test evidence; the coordinator owns actual Nuxt/CLI integration and rendered-font browser acceptance.

## Assets and identity

`shared/bannerPinnedFont.ts` exports the immutable `BANNER_PINNED_FONT` declaration. Its public asset is the unmodified static Adobe Source Sans 3 Bold 700, version 3.052, PostScript `SourceSans3-Bold`:

- `/fonts/banner/SourceSans3-Bold.9214b9d95e4231c609802815c2646c98174e2102d0d37f88978a7f8e71006e6a.ttf`: 428,176 bytes, SHA-256 `9214b9d95e4231c609802815c2646c98174e2102d0d37f88978a7f8e71006e6a`.
- `/fonts/banner/OFL-SourceSans3.89ad2c4f66dd29127527493e729c31e731f111cf10faf5774c3db9275ed0c22c.md`: complete unchanged OFL/copyright, SHA-256 `89ad2c4f66dd29127527493e729c31e731f111cf10faf5774c3db9275ed0c22c`.

Both were copied from the previously verified `output/editable-artwork-linux-native/fonts-v1/downloads/` files after independently checking their hashes. No download, font modification, Docker build or system installation was performed. The official source commit and native acceptance are documented in [LINUX-FONTS.md](LINUX-FONTS.md). The byte test also checks native pin equality, parsed static identity and all 198 proven codepoints.

## Browser API

`app/utils/banner-pinned-font.ts` exports:

```ts
loadBannerPinnedFont(options?: { signal?: AbortSignal }): Promise<FontFace>
measureBannerPinnedText(
  layer: Layer,
  text: string,
  options?: { signal?: AbortSignal }
): Promise<{ left: number; top: number; right: number; bottom: number }>
```

Loading streams only the expected 428,176 bytes from the fixed same-origin URL, verifies SHA-256 before constructing `FontFace`, waits for successful decoding, and installs only that binary face. Missing, short, oversized, tampered or undecodable data reject. The operation has a 15-second deadline, concurrent callers share verification, and each caller can cancel independently. A late cancelled measurement never returns accepted bounds. Failure is retryable on a subsequent explicit load; it never installs a replacement or local fallback.

Case-insensitive same-family normal Bold faces, including variable weight ranges covering 700, reject as collisions. Other weights remain available. Cached loads recheck font membership and collisions; the review/apply path calls this API again for each fresh measurement. An unexpected same-name installed font requires a clean page reload, rather than trusting its source. Development HMR can leave an old FontFace registered after its owning module state is replaced; reload the page before integration proof.

Measurement snapshots its input before awaiting font loading, then combines Canvas actual glyph ink bounds and advance with a fresh offscreen DOM baseline, range advance and actual line box. This includes leading/trailing spaces, left/top overhang and descenders. It rejects invalid/non-finite bounds and anything outside the original width/height; it never resizes, changes wording or changes style. DOM probes are removed in `finally`.

Supported text is one normal, left-aligned, untransformed Source Sans 3 Bold line with no rich text, effects or nonzero tracking. Glyphs are printable ASCII, Latin-1 U+00A0–U+00FF, curly quotes, en/em dashes and bullet. Controls, C1 controls, combining marks and other scripts reject. Maximum size is 512px, text length 4,000, and `text.length * fontSize ** 2` is at most 16,777,216. The caller must still enforce canonical project/selection/revision authority, protected copy, cancellation after every await and human approval; returned bounds are not an authorization token.

## Existing editor and exports

`useBannerFonts` reserves only the normal Bold face, uses the verified loader through `loadFont`/`loadUsedFonts`, omits that face from Google requests and custom upload CSS, and merges duplicate catalog entries while retaining other weights. Ordinary editor startup logs font-load failure; companion review/apply awaits the strict API and fails closed. A custom upload cannot replace the platform Bold face. Existing custom-font upload/refresh/deletion behavior remains covered by its regression suite.

`getExportCustomFonts` and `buildCustomFontsCss` expose the platform asset through the existing export interface. Both HTML builders emit the fixed pinned CSS once and ignore conflicting custom Bold URLs, while preserving non-pinned fonts. Client exports resolve the URL against the current application origin; server exports use their existing trusted `options.baseUrl` when supplied. A server caller rendering HTML away from an application origin must supply `baseUrl`, as it already does for relative image sources. Export CSS references the same content-addressed asset; SHA verification is specifically the editor/review loader boundary, not an authenticated claim about a downloaded standalone HTML file.

## Verification and limits

Focused command:

```sh
pnpm exec vitest run test/banner/pinnedFont.test.ts test/banner/pinnedFontBytes.test.ts test/banner/customFontCatalog.test.ts test/banner/serverHtmlBuilderParity.test.ts test/banner/engineFonts.test.ts --maxWorkers=1
pnpm exec eslint shared/bannerPinnedFont.ts app/utils/banner-pinned-font.ts app/composables/useBannerFonts.ts test/banner/pinnedFont.test.ts test/banner/pinnedFontBytes.test.ts
```

The focused command passes **60 tests across five files**. The font suite exercises real asset bytes plus mocked browser decoding/geometry for deterministic failure paths. The coordinator's actual Nuxt proof must serve the unaltered font URL normally and verify Chrome's rendered-font report; these unit tests alone do not establish actual editor rendering. Geometry negatives cover all four ink edges, trailing advance, line-box overflow and non-finite bounds. Other cases cover missing/changed bytes, decode failure/deadline, concurrent calls, cancellation, collisions, removed faces, unsupported typography/glyphs, catalog deduplication and client/server export integration.

Font-owned modules and tests pass scoped lint. Each pre-existing HTML builder has 20 lint findings outside the font edits (18 are also present in HEAD; two belong to earlier dirty animation work). Those unrelated edits are preserved. No full build, deployment, live persistence, hosted companion, broad-script typography, arbitrary original font fidelity or print acceptance is claimed.

Working source remains `adme-dev/banner-editable-artwork`, HEAD `47ec30c3522f6ab660d730776709770c8a22d7c8`; inspected remote-tracking main `4469d6a2fb873c2d7b90ece9a359dd571def0ba2` is included (one ahead, zero behind). Existing dirty source/parent checkout were preserved. No commit, provider/DB mutation or release occurred.
