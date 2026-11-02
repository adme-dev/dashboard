# Native parity remediation recovery — 2 November 2026

This is the coordinator reconstruction of the read-only Kimi report, after an
Orca/host restart cleared `/private/tmp`. Original review task
`task_38b3b864d02b` / `ctx_167a153afe74` settled succeeded. Implementation
remediation task `task_69ec3ae73811` / `ctx_519bd87837dc` was interrupted and
marked failed during runtime recovery. No passing compilation was claimed.
Source is reconstructed from the SHA-256-verified pinned upstream tarball,
verified first four patches and the preserved tracked native bridge patch.
Recovered engine source SHA-256 before remediation:
`77a53f07329e1c76fe916a283f4ddf9b4cebccfda53713fce850cc7ee3edafbd`.

## Required source fixes and proof fixtures

1. **High — image bytes after allowed URL reuse.** Existing `set-props` only
   selects bytes when `state.images` lacks the target block. A→B keeps A bytes.
   Preserve an immutable baseline URL-to-byte mapping separately from current
   per-block mappings; resolve on every changed URL. Prove distinct-image
   A→B→A, empty→B and repeated snapshots, including paint hashes.
2. **High — legal address token lock parity.** Match the exact shared legal
   expression, including `{{address}}`, `{{ address }}` and arbitrary whitespace
   around business_address/company_address. Prove shared native capability
   agreement and text/style/structural mutation refusal on those blocks.
3. **Medium — nested token scanning.** For `{{ outer {{firstName}}`, shared
   `/\{\{[^{}]+\}\}/g` finds the inner token, while native skips through it.
   Invalid candidate openers must advance only beyond the opener. Prove token
   preservation with nested/unmatched and multiple ordinary tokens.
4. **Medium — safe URL grammar.** Native accepts credentials in HTTPS URLs and
   any hash fragment; shared rejects credentials and only allows
   `^#[A-Za-z0-9_.:-]*$`. Prove Button/Image credential and invalid-fragment
   rejection with credential-free HTTP(S), mailto/tel and ordinary fragment
   positive controls. Images remain HTTPS-only.
5. **Medium — structural references.** Only EmailLayout/Container can own direct
   childrenIds; ColumnsContainer owns exact column child lists. Non-container
   children/child-bearing columns must be refused. Prove valid nested columns
   retain exact counts while hidden/non-container references are rejected.
6. **Parent-found compile hazard.** In `edm_panel::designer_section`, the
   `allows` closure borrows designer/app.session across mutable FigApp calls.
   Materialize content grants into an owned set/booleans before rendering.

Also complete canonical operation-log Undo/Redo as assigned: internal native
commands only; no exported browser apply/undo/redo and no extra server op kind.
Replay immutable baseline with deterministic IDs and verified baseline bytes,
validate fingerprints atomically, clear redo after a new edit, and prevent or
safely route generic keyboard undo from bypassing the operation log. Record
actual keyboard behavior rather than assuming it works.

No local Cargo/Rust build/install is authorized for this worker. Parent owns
tracked patch/pins/test-name receipts and Linux compiler/WASM/hosted acceptance.
Keep final source and reports inside `.verification/` or `docs/email-builder/`
in addition to compatibility aliases in `/private/tmp`.
