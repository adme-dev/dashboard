# Linux native roundtrip independent review

27 October 2026. Independent source/test/evidence review against `LINUX-NATIVE-ROUNDTRIP.md`. The reviewer owns only this report; implementation and Docker execution belong to the font/runtime and Linux bridge owners, with integrated native/editor evidence owned by the coordinator.

## Verdict

The bounded **local, text-only Linux roundtrip passes this review** after the findings below were corrected and independently rechecked. No unresolved P1/P2 finding remains in this slice. Final evidence is `output/editable-artwork-linux-native/integration-2026-10-27T03-22-34-330Z/`, whose ten recorded implementation hashes matched current source at final review. This is not hosted-service, full-artwork, original-font or print acceptance.

## Review boundary

Source baseline is branch `adme-dev/banner-editable-artwork`, HEAD `47ec30c3522f6ab660d730776709770c8a22d7c8`, local `origin/main` `4469d6a2fb873c2d7b90ece9a359dd571def0ba2`. The shared worktree contains extensive existing uncommitted work. No fetch, rebase, implementation edit, Docker command, deployment, database/provider operation, purchase or commit is performed by this reviewer.

The review starts from `DOCUMENT-BRIDGE.md`, `ONLINE-ENGINE-REVIEW.md` and `shared/bannerDocumentBridge.ts`. Acceptance is limited to source, tests and retained local evidence. An explicit redistributable-font fixture does not prove the original lifestyle heading's font fidelity, general native interchange, hosted integration or print output. OpenUI remains separately documented in `docs/ai-chat/openui-rollout.md` with implementation and rollout pending.

## Initial observations

- The existing wording-only planner binds full project state, sidecar digest, revision and native structure; it requires trusted fit measurement and revalidates the reviewed plan at apply time. The host still owns the live editor epoch, single undo transaction and persistence boundary.
- The inherited desktop archive reader launches Python without a timeout. The Linux wrapper now supplies a 15-second kill deadline and 16 MiB output cap, alongside bounded staged input and ZIP sizes.
- Existing engine jobs remain render-preview. New local native helper receipts must not be represented as hosted editable job acceptance.

## Findings and closure work

### R1 — P2: selected edit could execute altered derived cache bytes

The initial `editLinuxWording` validated a staged archive through `planBridgeReturn`, which intentionally normalizes text cache/PSD cache fields, then opened that same archive in the native engine. The text-only archive allowlist limits entry names but does not make referenced cache bytes trusted. An archive with unchanged wording and structure but altered cache bytes therefore reached the native-edit boundary.

Reviewer reproduced the validation gap without Docker: copied the actual `integration-2026-10-27T03-17-01-721Z/export/document.pcraft` to a temporary archive, replaced a referenced `tiles/0449b3475d220081c99cd7aa4a6d7cee342be2fc5d4aa1519505510bc3b17a47.zst` payload with invalid plain bytes, and observed both `readLinuxArchive` and `planBridgeReturn` pass with `changes: []`. The temporary archive was removed and never executed.

**Closed.** Export now seals `nativeArchiveHash` inside the trusted sidecar. Typed edit validates the sidecar digest and exact staged archive hash before any native command; arbitrary returned archives remain inspection-only. The independently executed regression changes archive bytes without changing native structure and verifies rejection with zero engine calls. Reviewer also recomputed the final real export hash and matched its sidecar binding. The Python allowlist separately rejects unreferenced/missing payloads and any raster/mask layer in this text-only lane.

### R2 — P2: negative font proof could accept unrelated runtime failures

The first `rejectedImage` proof accepted any non-cleanup exception plus zero CLI logs, so a Docker create/start or executable-check failure could satisfy a missing/tampered-font assertion without reaching font verification. The first log parser also silently dropped non-JSON diagnostics.

**Closed.** Owner added exact missing-font-path/ENOENT and checksum-mismatch assertions, an owned-container-name check, positive exact-container absence, and rejection of unexpected diagnostics. Only the exact known PNG flattening diagnostic is allowed. Reviewer independently checked the stronger `fonts-v1/proof-2026-10-27T03-17-37.227Z/` acceptance, all eight receipts, expected negative reasons, six successful executions' font/isolation facts and four artifact digests. The accepted runtime/capability files remain bound to the original accepted proof; this stronger rerun retains separate evidence without rewriting them.

### Early integration corrections

Source now passes verified `runtime.font` coverage to assessment, caps 32 supported text candidates before measurement, and exclusively reserves each operation root before native execution. The reservation now fsyncs the intent file and parent directory; failed roots remain occupied. The integrated apply measurer now receives the originating Linux binding, and root proof retains exact capability/acceptance/runtime snapshots plus implementation hashes. These corrections were requested during initial review, before final acceptance.

The native adapter's diagnostic parser was also tightened after review to reject both outer and nested command-result warnings/errors/error, non-object envelopes and unexpected non-JSON output. Five independent negative measurement regressions pass. Final integrated evidence was regenerated after this last source change.

## Independent verification

`pnpm exec vitest run test/banner/documentBridge.test.ts test/banner/documentBridgeArchive.test.ts test/banner/documentBridgeEditor.test.ts test/banner/engineLinux.test.ts` passed **62 tests across four files**, with one optional actual native artifact test skipped. This establishes baseline regression only; it does not exercise the new Linux font/native modules. Vite emitted its existing `__dirname` configuration warning.

The expanded six-file suite including `documentBridgeLinux.test.ts` and `engineFonts.test.ts` subsequently passed **90 tests, one optional desktop artifact case skipped**. The suite covers unsupported face/glyph/style rejection, sidecar/current source/revision/runtime binding changes, structural/raster/mask changes, protected copy, fresh measured overflow, concurrent mutation, same-root replay and pre-measurement candidate limits.

After all review fixes, the same six-file suite passed **100 tests across six files, one optional historical desktop artifact case skipped**. Final scoped ESLint passed on ten new/changed runtime, CLI, proof and test files. The coordinator additionally reports 162 passing tests across nine files plus one actual Linux integration; that broader count is coordinator-reported, not this reviewer's executed suite.

Reviewer independently parsed the pinned TrueType format-12 cmap and horizontal metrics with Python standard-library code, matching all **198 glyph IDs and advances** against the implementation's format-4-derived metadata. Actual native `H` at size 100 reported advance `67.4000015258789`, ascent `100`, descent `32.60000228881836`, matching pinned font values `67.4`, `100`, `32.6` within the proof tolerance. Font SHA-256 `9214b9d95e4231c609802815c2646c98174e2102d0d37f88978a7f8e71006e6a` and license SHA-256 `89ad2c4f66dd29127527493e729c31e731f111cf10faf5774c3db9275ed0c22c` were recomputed. Four initial native proof artifact hashes and the accepted manifest/capability/acceptance digest chain matched.

Standalone strict TypeScript checking of the Linux bridge/CLI follows inherited application type imports into Nuxt-dependent modules and fails on existing aliases/globals and `shared/bannerDocumentBridge.ts`'s optional `text`/JSON index signature. No diagnostic named the new Linux bridge files. This is **not** a passing broad typecheck; the report retains that limitation.

## Actual native and Banner evidence

Final image is `sha256:370ffe56ef1865a370f988ecc315f060d5288b982093c718b5942a9e6cb40dc6`, with PhotoCraft executable `486d0d83d6cdacec3ec76ff6e30e47d5d2c207ad15084631a61902df157e8c8d`. The prior accepted fontless image and earlier proof manifests remain separate. The retained VectorCraft bundled Bold font independently hashes to the same pinned Adobe font bytes.

For the final integration directory above, reviewer independently checked:

- All ten source hashes against current files, copied capability/manifest/acceptance digest relationships, and the actual exported ZIP hash against the trusted sidecar.
- Exported and reopened edited ZIP manifests: exactly one native text layer, changing `COME CELEBRATE OUR NEW HOME` to `COME CELEBRATE WITH US`; the edited manifest matches `returned-document.json`.
- The saved/reopened Banner project: only heading 125 changes, with all other 125 canonical layers exact, including the 124 original layers and added managed QR fixture. Existing project load adds four animation defaults; supplied original fields remain unchanged, and those additions are recorded in `legacy-load-defaults.json` before the bridge snapshot.
- Eight retained native execution/measurement receipts with the expected executable/font digests, unprivileged UID, no network and read-only root. Owned runtime cleanup performs positive exact-name removal/readback before returning. Actual container execution and live cleanup were performed by owners; this reviewer did not operate Docker.
- Browser evidence: a single custom `SourceSans3-Bold` face, exact intercepted font bytes, no page errors or unexpected requests, text width `1170.40625` and range height `133` inside the unchanged `2233 × 140` box. Native width is approximately `1170.3999` with a `120` line box. Both fit; pixel parity is not claimed. The selected-heading screenshot was visually inspected.

The real store integration source checks one undo restores the complete canonical canvas, redo restores the change, and fixture save/reopen preserves it. Reviewer additionally revalidated the retained plan through `validateBridgeApply` using measurements replayed only for its exact bound wording; that additional check is artifact validation, not a second live native measurement. The coordinator's actual final run performs fresh bound Linux measurement before apply.

The separate final reusable CLI evidence in `cli-final-20261027T032217Z/` records export/edit/reopen/import and stale, overflow, unsupported glyph, changed native bytes and extra-payload rejections. Reviewer inspected the ten acceptance predicates and eight command exit receipts and recomputed its exported native digest. It records nine owned containers absent after the final parser-hardened CLI run.

The final integration's `coordinator-verification.json` separately records zero labelled Linux containers and zero workspace listeners after cleanup, current source hashes, the broader regression count and no deployment. Those live process/container readbacks are coordinator evidence; this reviewer inspected the record without repeating Docker operations.

## Remaining acceptance limits

- This is a trusted local companion, not an authenticated hosted upload/job/mutation service. Optional manifest paths and helper roots are operator configuration. Production tenancy, storage ownership, durable cross-host attempt fencing, aggregate admission, cancellation/recovery and live apply authorization remain separate work.
- Native export is text-only with one exact static font, bounded glyph set and single-line style. Images, masks, alpha, logos, maps and QR are retained in Banner's sidecar, not converted by this Linux bridge. Earlier raster/mask proof remains distinct.
- The supported heading is an explicit added fixture, not recovery or substitution of the original Arial 900/multiline/negative-tracking artwork. Original-font fidelity, arbitrary font/script support, full-artwork visual parity, commercial print and hosted availability are not accepted.
- Undo/redo uses the actual Banner store; API persistence is mocked. The browser proof uses the production HTML exporter with a locally intercepted font response, not a hosted font delivery route or Nuxt bridge review/apply UI. Provenance is retained beside the sidecar/evidence bundle, not added to saved project metadata.
- Managed QR equality here proves preservation of that fixture's canonical fields, not live tenant authorization, scanability, destination ownership or occlusion acceptance.
- Source remains uncommitted in the shared worktree at the recorded HEAD/main. No release, integration or fresh remote-state approval is implied. OpenUI rollout remains separately documented and pending.
