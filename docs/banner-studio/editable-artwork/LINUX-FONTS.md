# Pinned Linux native font capability

27 October 2026. The new isolated Linux image loads **Source Sans 3 Bold 700, PostScript `SourceSans3-Bold`, version 3.052** exactly in PhotoCraft 0.16.0. Actual native create, save/reopen, glyph coverage and metrics pass; VectorCraft 0.17.0 reports its Bold face as exact with zero missing glyphs. This is the font prerequisite for [LINUX-NATIVE-ROUNDTRIP.md](LINUX-NATIVE-ROUNDTRIP.md), separate from Banner apply, hosted execution, original artwork fidelity and commercial print acceptance.

## Pinned bytes and license

The static TrueType face comes from Adobe's official [Source Sans 3.052R release](https://github.com/adobe-fonts/source-sans/releases/tag/3.052R), at commit `ed1808970eb3c7301c9a523bee26473ba0bb62fa`:

- [Unmodified font](https://github.com/adobe-fonts/source-sans/blob/ed1808970eb3c7301c9a523bee26473ba0bb62fa/TTF/SourceSans3-Bold.ttf): SHA-256 `9214b9d95e4231c609802815c2646c98174e2102d0d37f88978a7f8e71006e6a`, 428,176 bytes.
- [Official OFL 1.1 license and copyright](https://github.com/adobe-fonts/source-sans/blob/ed1808970eb3c7301c9a523bee26473ba0bb62fa/LICENSE.md): SHA-256 `89ad2c4f66dd29127527493e729c31e731f111cf10faf5774c3db9275ed0c22c`; retained verbatim in `workers/banner-engine/fonts/LICENSE-SourceSans3.md`, downloaded evidence and `/usr/share/doc/banner-engine/fonts/source-sans-3/LICENSE.md` inside the image. The font's internal Adobe copyright, trademark and Reserved Font Name notices remain intact.
- Runtime font location: `/usr/share/fonts/truetype/banner/SourceSans3-Bold.ttf`. No host/global font installation or proprietary desktop font copy occurs.

Preparation checks the checksum before parsing font structures, then validates the static SFNT, exact family/PostScript/version, OS/2 weight/italic flag and absence of variable axes. It reads Unicode cmap format 4, hhea and hmtx from these pinned bytes. The font's total 2,478 glyphs are not a broad script claim: the adapter allows only 198 proven characters, printable ASCII, Latin-1 U+00A0–U+00FF, curly quotes, en/em dashes and bullet. Controls, line breaks, combining sequences, emoji, complex scripts and characters outside that small allowlist reject even if some might exist elsewhere in the font.

VectorCraft's pinned source [embedded Bold font](https://github.com/storytold/vectorcraft/blob/43313f9451de7ab5b909801006b8881458f2bf04/assets/fonts/SourceSans3-Bold.ttf) independently hashes to the exact same Adobe bytes. Thus its embedded/system same-name candidates do not conceal a different font version in this image; `vector-font-byte-match.json` retains that comparison. PhotoCraft's exact face enumeration and actual native run identify the newly installed font, with no synthetic bold/italic and no variable axes.

## Versioned runtime and interface

New image: `sha256:370ffe56ef1865a370f988ecc315f060d5288b982093c718b5942a9e6cb40dc6`, tagged `xeroflow-banner-engine:linux-fonts-v1`.

It extends the earlier accepted image `sha256:1fbdad626b0f743bfcd4fd308342b7feeb877473579da2ca52d0e97cda9597f8`. The earlier image, manifests and proofs in `output/editable-artwork-online-engine/linux/` remain unchanged. New preparation, download, manifest, license, native files, previews, receipts and proofs live only under ignored `output/editable-artwork-linux-native/fonts-v1/`. The Docker base alias is dedicated to this build and verified against the immutable accepted ID; the accepted execution manifest always uses the full immutable image ID.

`workers/banner-engine/fonts/runtime.mjs` exports:

- `FONT_FACE`: exact family/weight/italic/PostScript identity.
- `FONT_PIN`: identity plus static font version, official source commit, exact font/license hashes and fixed in-container path.
- `loadFontRuntime(engine = 'photocraft', manifestPath?, options?)`: validates the new font manifest, local font/license bytes and existing engine capability/acceptance hash binding. Returns `runtime.font` with parsed names, cmap coverage/glyph IDs and metrics. Prepared manifests require explicit `{ allowPrepared: true }` and are for preparation/proof only.
- `assertSupportedText(layer, text, runtime.font)`: excludes wrong family, unavailable weight, italic style, unsupported glyphs and excessive text/measurement resources. Size must be positive and at most 512; text length at most 4,096; `length × size²` at most 16,777,216. Other style/geometry/protection checks remain the bridge contract's responsibility.
- `executeFontContainer(runtime, options)`: internal trusted adapter using the existing isolated runtime. It hashes the actual font in the same container after verifying the engine executable and before running the engine. Missing/unreadable/tampered font rejects. Its hook cannot be overridden by options. Receipts include the observed font hash and face.

A coordinated optional `beforeExecute(name)` hook was added to `runtime/render-preview.mjs`. Existing callers retain their behavior. Only the trusted local font adapter populates this hook; no public job field, native file, uploaded font, remote URL or job-selected executable supplies it. The bridge owns typed operations and fresh native measurement in `native/photocraft.ts`; callers must use that validated bridge rather than treat this internal command hook as an untrusted API. Merely checking font bytes does not validate arbitrary text/styles in an arbitrary native file.

All executions retain the existing runtime's no-network, read-only root, UID/GID 65532, dropped capabilities, no-new-privileges, one read-only input file, bounded tmpfs, CPU/memory/process/time/log/output limits and independent exact-name cleanup readback. The public engine operation remains `render-preview`; these local helper receipts are not hosted job results. No container mounts host fonts or a Docker socket.

## Actual Linux evidence

Accepted manifest: `output/editable-artwork-linux-native/fonts-v1/runtime.json`.

Initial accepted proof: `proof-2026-10-27T03-15-47.339Z/`. Review-strengthened revalidation: **`proof-2026-10-27T03-17-37.227Z/`**, ten passing predicates, preserving the original accepted manifest/capability/acceptance bytes. The stronger proof requires specific missing-font and checksum-mismatch errors, a valid owned container identity, zero engine log bytes before rejection and positive absence readback. Unexpected native warnings/errors fail; only the exact known PNG flatten warning is allowed, since PNG preview deliberately discards layers.

| Evidence | Observed result |
|---|---|
| Actual `type.fonts` | One exact `Source Sans 3` Bold face, weight 700, `SourceSans3-Bold`, no axes |
| Native `type.create` / `type.info` | Exact family/weight/PostScript, faux bold/italic false, one line/run |
| Saved native reopen | Exact wording, face and complete `type.info` metrics preserved |
| 198-character specimen | Every allowed codepoint maps to a nonzero glyph in the pinned cmap; actual native single-run rendering and PNG retained |
| Independent native `H`, size 100 | Advance approximately 67.4, ascent 100, descent 32.6, matching the pinned hmtx/hhea metrics at 1,000 units/em |
| Heading, size 32 | `COME CELEBRATE WITH US`, advance 374.5279541015625, ascent 32, descent 10.432000160217285 |
| VectorCraft native font report | Family `Source Sans 3`, style `Bold`, `status: exact`, `missing: false`, `missingGlyphs: 0`; native saved document retained |
| Actual missing font | Earlier fontless image fails at the fixed font path before any engine command executes |
| Actual tampered font | Separately built tamper-test image fails the actual in-container font checksum before any engine command executes |
| Isolation and cleanup | Receipts include actual Docker inspection, executable/font hashes, resource limits, output hashes and verified owned-container removal |

`metrics.json` contains the parsed font metadata plus actual native command results; `receipts.json` retains full command diagnostics and cleanup checks. `heading.pcraft`, `heading.png`, `glyphs.png` and `vector-font.vectorcraft` are reviewable artifacts. Both PNGs were inspected. The transparent, very wide glyph specimen is a coverage diagnostic, not a typography design deliverable. The native `H` metrics were independently cross-checked against the font bytes by the reviewer, along with all 198 cmap IDs and hmtx advances.

The image's font bytes are pinned; cross-engine/browser pixel parity, kerning equivalence at arbitrary sizes and general multilingual layout are not claimed. These metrics do not make unsupported original layers exportable. In particular original lifestyle Arial 900/multiline/negative-tracking lettering remains explicitly excluded. The coordinator's separate proof appends its supported heading and preserves the original 124 layers.

## Tests and reproduction

Focused tests pass **15/15**: seven font contract cases and eight existing runtime cases. Tests cover face/weight/style, glyph and measurement resource rejection, invalid font bytes, fixed-path missing/tampered font verification, mandatory hook protection and legacy/wrong-version/tampered font manifest rejection. Scoped ESLint passes for both runtime modules, preparation/proof scripts and the font tests. The actual Docker proof is required in addition to these unit cases.

```sh
# First preparation only; requires the earlier accepted Linux runtime/image.
node scripts/banner-studio/prove-linux-fonts-prepare.mjs
node scripts/banner-studio/prove-linux-fonts.mjs

# Repeat actual proof while preserving accepted manifests and earlier evidence.
node scripts/banner-studio/prove-linux-fonts.mjs --verify-only
pnpm exec vitest run test/banner/engineFonts.test.ts test/banner/engineLinux.test.ts
pnpm exec eslint workers/banner-engine/fonts/runtime.mjs workers/banner-engine/runtime/render-preview.mjs scripts/banner-studio/prove-linux-fonts-prepare.mjs scripts/banner-studio/prove-linux-fonts.mjs test/banner/engineFonts.test.ts
```

Preparation refuses to overwrite an existing prepared/accepted manifest. A future runtime/font change requires a new versioned root/tag and fresh proof. Only preparation downloads from fixed authoritative URLs; Docker build steps use `--network=none`, and executions never pull or use networking. Proof reruns create new timestamped evidence, verify the accepted image remains identical, and keep its manifests unchanged. The fontless accepted image and a dedicated derived tamper image supply the two negative cases; the latter is a local test artifact, not an accepted runtime.

Retained preparatory failures are honest evidence: BuildKit interpreted `FROM sha256:ID` as a registry name and rejected it; a first derived image failed nonroot font access because automatically created directories were not traversable. The corrected Dockerfile creates readable/traversable parents before copying read-only font bytes. Failed prepared artifacts are retained in `failed-prepared-permissions/`. Early probes also rejected an invalid CLI `--new` syntax, unsupported VectorCraft `run --help`, and a proof assertion that treated VectorCraft's numeric `missingGlyphs: 0` as an array. A stricter rerun initially rejected the expected PNG flatten diagnostic before that single diagnostic was explicitly allowed. None counted as acceptance.

Source checkpoint: HEAD `47ec30c3522f6ab660d730776709770c8a22d7c8`, local remote-tracking main `4469d6a2fb873c2d7b90ece9a359dd571def0ba2`, zero behind/one ahead at inspection. This worker did not fetch/rebase/commit or claim release freshness. No deployment, provider/DB mutation, purchase, hosted execution or global installation occurred. The coordinator owns final native wording return, editor history/save/reopen, browser typography and preservation checks; hosted authorization/transport, crash supervision, customer-scale budgets and print acceptance remain separate gates.
