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
publication remain separate gates. The follow-up viewport change fits the EmailLayout width at first real canvas
sizing (100% cap, 24px top/side inset), including the exact upstream default
1200×800 viewport. Later resizes preserve user pan/zoom; Fit width / 100% controls
explicitly reset it. A tiny/hidden viewport defers initialization until usable.
The ninth EDM UI regression verifies sizing, explicit controls, no-op authority
and preservation of later camera state; actual-WASM viewport/control acceptance
remains required. Generic EDM chrome restrictions were outside the edm4 commits; see the edm5
candidate below. Runtime pointer/assets/flags remain separate release ownership.

Native file snapshot/export, authenticated server relay sessions, durable native
artifacts, arbitrary layout conversion and native template/module publication remain
unsupported. Server-side library publication is a separate capability. Generic-file download/export controls remain separate capabilities outside EDM;
the edm5 candidate refuses them inside an EDM document.

`source-pins.json` fixes the upstream source, Cargo.lock, patch order and hashes.
The four established patches come from dashboard commit
`90f8fab183722b00d4e2483403e33cc7148a7908`. The bridge originates from
`docs/plans/fixtures/figflow-browser-bridge.patch`, with a test request-ID collision
corrected in this copy and its checksum updated.

The `FigFlow native source build` GitHub workflow validates those inputs, runs
native tests, then builds the browser package on Ubuntu x86_64. It requires the
ten named bridge tests, 44 named engine EDM tests and 16 named EDM UI tests to
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

## Isolated edm5 polish candidate

`0.11.2-edm5` appends `figflow-edm-polish.patch` after the unchanged edm4 bridge
patch. This source is a candidate, not authorization to alter hosted assets or
runtime pointers. The native scene renderer, canonical authority, rich parser,
scalar-indexed style runs and server replay contracts remain the existing ones.

EDM documents show a native email toolbar, component selection list and the
existing canonical email controls. The app command boundary admits only explicit
EDM operations, selection, camera, history, Move/Hand and policy-granted content
text/image/button metadata updates. Generic shape/vector/text creation, freeform
transforms, files/downloads, clipboard scene insertion, resources, prototypes,
sharing and unsupported menus are refused before execution. Canvas pointer
handling reuses the engine's selection-only mode; spacing/guide/paint/prototype
handles and file drops are excluded. Generic documents keep their original UI.
Native text fields retain multiline editing and their own clipboard/undo; designer
edits still emit typed operations and canvas Undo/Redo retains recovery of
adversarial unlogged engine edits. F6/Tab region navigation remains available.

A pinned, unmodified `NotoEmoji-Regular.ttf` from googlefonts/noto-emoji commit
`2f1ffdd6fbbd05d6f382138a3d3adcd89c5ce800` joins the existing build-time font
manifest and native/egui fallback lists. Its 418,804 bytes fit the bounded font
input budget; SHA256 is
`415dc6290378574135b64c808dc640c1df7531973290c4970c51fdeb849cb0c5`.
The font's own OFL 1.1 license (`fonts/LICENSE`, not the repository's code license)
is checksum-verified and copied to the package as `OFL-noto-emoji.txt`. There is
no runtime font fetch, text rasterization, font modification or second editor.
The existing 24 MiB WASM gate is unchanged and must pass for the candidate.

Coverage is deliberately limited: this is the historical monochrome Noto Emoji
1.05 outline font (887 mapped Unicode scalars), including rocket, grinning face
and heart. It is not full modern emoji, color emoji, variation-selector or ZWJ
sequence fidelity; newer emoji can still lack glyphs. The current larger variable
font was not substituted because its roughly 1.98 MB input risks the existing
WASM size budget. An up-to-date bounded font/subsetting pipeline would need a
separate reviewed implementation. Arbitrary HTML remains a protected fallback,
and compiled preview remains the fidelity surface.

The seven additional native UI regressions cover command refusals, menu/download
and keyboard tools, drag/double-click/Enter/deletion, granted content edits,
AccessKit regions/F6, multiline field commits and real emoji outlines with scalar layout. The original
nine UI, 44 engine and nine bridge regressions remain required, alongside the
21 relay tests and offline font-input bounds/hash/license tests. A tenth bridge
regression refuses generic automation creation/geometry and all unlogged designer
updates before scene mutation, retaining policy-granted content text updates.
The bridge and UI use the same command policy. Reproducible
fixtures and localhost serving instructions live in
[`fixtures/edm-polish/README.md`](fixtures/edm-polish/README.md). Remote compilation
and a successful package are distinct from root-owned actual-WASM visual and
hosted acceptance; no live activation is part of this implementation task.
