# FigFlow native build prerequisite

This directory builds the pinned FigFlow source and its browser-local bridge.
It does not deploy an editor or enable the EDM feature.

The bridge supports status, inspection, explicit node creation/updates, and a
bounded composer EDM content round trip plus a separate typed component-designer operation return. Canonical identity and
locked fields are retained while unsupported native structural edits fail closed.
Image bytes are resolved only by the packaged relay into a browser-only envelope;
they never enter canonical JSON or become durable native asset uploads.

The `0.11.2-edm3` package injects the separately pinned `figflow-edm-relay.mjs`. It adds font resolution to edm2: each email font key resolves to the first family the font database has (canonical renderer stack, then bundled OFL substitutes, then Inter — the browser build registers only Inter for Latin text), and Headings honour `fontWeight`. `0.11.2-edm1` and `0.11.2-edm2` remain separate immutable packages.
The prepared `0.11.2-edm4` candidate adds display-only protected Text/Heading
projection through the pinned engine's character-indexed `StyleRun` API. It is
not a published runtime or whole-email fidelity claim. The original canonical
HTML, attributes and assets remain authoritative; `Role::Other` still prevents
native content, runs, links or geometry from being serialized into canonical data.

Supported projection grammar is deliberately strict: balanced `a`, `span`,
`b`/`strong`, `i`/`em`, `u`, `s`, `p`, `div`, and `br`; quoted attributes;
font size in px, line height in px or unitless, registered font-family stacks
(fallback Inter), numeric/normal/bold weights, normal/italic, CSS color,
underline/line-through/none, and whole-wrapper alignment. Zero margin/padding
and inline/whole-wrapper block display are accepted. Block boundaries become
newlines without a synthetic trailing blank line. Source whitespace/newlines are
retained; this is not a browser CSS whitespace/margin layout implementation.
Links use the existing bounded URL validator, including fragments, tel, mailto
and encoded query ampersands. Native runs carry destinations, not HTML attributes.
Target/rel remain canonical metadata; native click/navigation parity is not claimed.

Entity decoding is single-pass: amp/lt/gt/quot/apos/nbsp, copy/reg/trade,
ndash/mdash/hellip, curly quotes, and valid decimal/hex Unicode scalars.
Escaped literal markup stays literal. Unknown entities, malformed nesting,
unknown attributes/CSS, empty paragraph/div wrappers, nested anchors, active content and other HTML fall back
as a whole to a protected label directing the user to compiled preview. Bounds:
8192 UTF-8 bytes, 1024 tokens, 32 nested elements; no dependencies or fetches.

The same TextData (including style runs) is measured and rendered; canonical
padding applies once and siblings receive no synthetic gap. Tests distinguish
the screenshot-shaped anchor plus four **canonical Spacer** blocks (24 + 4×8,
hero y=56) from arbitrary Html fragments. Html remains a measured *label* whose
height is not the source email's geometry. Tables, hidden preheaders, background
images and arbitrary Html spacers are not repaired by this candidate. Compiled
preview remains the fidelity surface; no rasterization or new renderer is added.

New Rust regressions cover mixed runs, Unicode indices, multiple links, entities,
malformed/bounded input, anchor style/padding/geometry, rich Heading, wrapping,
exact content/designer no-op, neighbouring edit preservation and protected-edit
refusal. CI must run all 44 engine EDM tests and compile WASM after independent
source review. Actual-WASM tests must then verify these projections, existing
blank/imported/fixture suites, real-font substitution and screenshots at 100%
and fit-width. Full Ford fidelity, save/reopen/Undo, hosted acceptance and
publication remain separate gates. This change does not implement WP-N viewport,
chrome or relay rebase work, or change the runtime pointer/assets/flags.

Native file snapshot/export, authenticated server relay sessions, durable native
artifacts, arbitrary layout conversion and native template/module publication remain
unsupported. Server-side library publication is a separate capability. Existing manual download/export controls are separate capabilities.

`source-pins.json` fixes the upstream source, Cargo.lock, patch order and hashes.
The four established patches come from dashboard commit
`90f8fab183722b00d4e2483403e33cc7148a7908`. The bridge originates from
`docs/plans/fixtures/figflow-browser-bridge.patch`, with a test request-ID collision
corrected in this copy and its checksum updated.

The `FigFlow native source build` GitHub workflow validates those inputs, runs
native tests, then builds the browser package on Ubuntu x86_64. It requires the
nine named bridge tests, 44 named engine EDM tests and eight named EDM UI tests to
pass; a zero-test Cargo result is rejected. Jobs
upload source/build receipts and logs, and have no deployment steps or secrets.

The CI entry points require an isolated Linux runner and `RUNNER_TEMP`:

```sh
bash workers/craft-editors/ci-build-browser.sh figcraft test
bash workers/craft-editors/ci-build-browser.sh figcraft web
```

Successful CI is not hosted browser acceptance. Before any later promotion,
verify the actual WASM bridge and the manual save/reopen/export workflow, choose
a new immutable hosted version, and preserve the previous version for rollback.

The prepared EDM2 native component panel implements explicit canonical style/property and
add/move/duplicate/remove operations, deterministic IDs, creation-only pinned
brand defaults, protected linked/legal content and empty-image placeholders.
No-op snapshots return no operations; arbitrary canvas edits cannot become
canonical source. The server independently replays and validates every operation
against the saved baseline and current authority before explicit Apply. Durable
native artifacts remain unavailable. The previous EDM1 hosted package is retained
separately for rollback; new-package CI does not establish hosted acceptance.
The current source includes internal operation-log Undo/Redo and guarded keyboard
routing. Native compilation, fixture execution and actual-WASM acceptance remain
required; source review is not evidence that those gates have passed.
