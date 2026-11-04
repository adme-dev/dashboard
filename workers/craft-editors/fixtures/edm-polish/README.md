# Isolated EDM polish fixture

This fixture exercises the actual native canvas, not a replacement editor. It
makes no app API calls, saves no server data, and uses only synthetic copy and
example.invalid links. The fixture directly calls the native bridge on localhost;
it does **not** establish production relay origin/authentication acceptance.

Root owns browser use. Do not reuse the user's existing tabs. After native CI
produces the candidate package, verify the archive/source receipt, unpack it into
an owned `.verification` directory, and obtain the exact WASM hash from the
artifact receipt. Then run from the repository root:

```sh
python3 workers/craft-editors/serve-polish-fixture.py \
  --package .verification/OWNED-PACKAGE/figcraft-web-0.11.2-edm5 \
  --wasm-sha256 EXACT_VERIFIED_WASM_SHA256 --port 8935
```

Open `http://127.0.0.1:8935/` in the isolated browser. The server binds only
127.0.0.1, refuses a mismatched WASM, disables caching, and serves no repository
files outside the explicit fixture and package roots. Stop the server after the
run. Record source commit, package SHA256, actual response WASM SHA256, viewport,
console errors and screenshots; a successful local HTTP check is not WASM proof.

`design.json` includes mixed protected rich text with two anchors, scalar emoji,
escaped literal markup, four canonical Spacer blocks, granted multiline plain
text and a CTA, and an explicit arbitrary-HTML fallback. `capabilities.json` was
generated with the shared `designerCapabilities` function, not a test-only grant
implementation. The two import buttons load the same fixture in content and
designer mode. Snapshot shows the unchanged canonical content or canonical
operation list. `window.__edmPolishFixture` retains request/reply receipts and
exposes `load`, `snapshot` and `call` for the root-owned test harness.

Required visual/interaction checks at 1440×900 and 1280×800, initial fit and100%:

- Native content shows the rocket outline and unchanged accented Latin/mixed
  style runs; record monochrome appearance. This is not a color-emoji claim.
- Both modes show only supported email controls, component selection, pan/zoom
  and appropriate history; no generic shape/pen/text creation, resources,
  prototype, share, export or native-file download entry point.
- Try R/P/T, Delete, arrow nudges, Enter, Cmd/Ctrl+S, Shift+Cmd/Ctrl+S,
  generic cut/paste, right-click menus, dragging/resizing and dropping a file.
  None may create an unsaveable scene edit, download or unrelated document.
- Keyboard Tab/Shift+Tab and F6 reach named components, fields and canvas.
  Mouse and keyboard selection, wheel/pinch/Space-pan and fit/100% work.
- Content mode retains multiline text/newlines, CTA text/URL and image metadata
  grants where present; rich/protected roles remain uneditable. Designer edits,
  add/move/duplicate/remove and Undo/Redo still yield canonical operations.
- No-op snapshots are exact. Apply a granted edit, undo/redo, snapshot and
  reimport; verify mixed protected HTML remains byte-identical and run ranges
  remain Unicode scalar based. Empty/linked/legal fixtures still need the
  established native regression coverage.

Limitations must remain separate: arbitrary HTML is still a protected label,
compiled preview is the fidelity surface, and emoji coverage is bounded by the
pinned font rather than all Unicode emoji sequences. Hosted save/reopen and
application activation are not performed by this fixture.
