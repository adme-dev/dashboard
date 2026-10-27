## Current candidate checkpoint — 27 October 2026, 21:56 UTC

Protected ingestion, private derived delivery, saved exports, restricted-project cleanup and source lineage are implemented in the isolated release candidate. R1–R4 are closed or mitigated as specified; follow-up search-probe and delete/import deadlock regressions are fixed. Current main `5e3f5b5472bf6827d094bae2bae029aa4e6f5820` is included through merge `926ac205f61402db4bbb116b4c2dba8f28688b06`. The original shared dirty workspace remains intact.

The merged full suite passed **21,731 tests / 4,065 skipped**, with **2,624 files passed / 118 skipped**. Worker proofs passed **75 actual PostgreSQL job/import tests** and **30 actual PostgreSQL canvas tests**, including three deadlocks first reproduced against the old code and then closed. Real local Chrome exports passed 10 cases; real workerd/R2 passed 14. Counts overlap and must not be summed. The final guarded build is pending. Scoped admission remains disabled. Production is still source `c910df968ac1bef181f9aa99c14008ed2897edac`, Pages `eb493158-0d78-4f9c-9102-89f20ae5a770`; no new deployment is claimed.

See [integration evidence](OWNED-INGEST-INTEGRATION.md), [residual review](INGEST-RESIDUAL-CLOSURE.md), and [the exact Craft tool deployment status](TOOLS-DEPLOYMENT-STATUS.md). PhotoCraft/VectorCraft have a disabled private canary, not an active hosted integration; the other four Craft adapters are unimplemented. Full PRD, provider/native hosted acceptance and print readiness remain incomplete. Earlier release checkpoints below are historical.

## Protected ingestion checkpoint — 27 October 2026, 21:16 UTC

Fresh ownership/lifecycle checks, bounded multipart ingress, authenticated result delivery, saved protected exports and managed-flow exclusions are now implemented locally. The candidate contains the owned changes on current main; production is unchanged. The combined focused suite passed 1,023 tests, the final lifecycle PostgreSQL proof passed 59, and the flow PostgreSQL proof passed 16 (counts overlap with other reported runs). A cancellation-edge regression was reproduced and fixed. Independent review, actual local browser export proof and full guarded build remain in progress. **Scoped admission remains disabled; this is not full PRD or hosted provider acceptance.** See [the integration record](OWNED-INGEST-INTEGRATION.md) for authoritative scope, evidence and remaining gates. Earlier completed-release statements below describe the previous PNG source-only release.

## Final PNG release verification — 27 October 2026, 16:13 UTC

**This bounded PNG source-integrity release is deployed and verified. The full editable-artwork PRD remains incomplete.** CI [40529448515](https://github.com/adme-dev/dashboard/actions/runs/40529448515) completed successfully on exact deployed source `c910df968ac1bef181f9aa99c14008ed2897edac`: 20,770 tests passed / 3,811 skipped, 2,558 files passed / 113 skipped. All preceding database stages, Linux production build, six exact-artifact startup/codec checks, 891 social regressions and 21 deployment guards passed. Linux bundle bytes are 25,399,514 raw and 7,444,499 gzip, below unchanged limits. These Linux bytes are distinct from the actually uploaded macOS artifact recorded below.

Canonical Pages readback still identifies `eb493158-0d78-4f9c-9102-89f20ae5a770` on the exact source above, and the release worktree is clean. Seven hosted invalid uploads, fresh unchanged job history, preserved saved-download hashes, authenticated/unauthenticated access, editor/QR navigation and the unchanged customer canvas are recorded in the [review packet](../../../output/banner-release-acceptance-20261027/index.html). Draft PR [720](https://github.com/adme-dev/dashboard/pull/720) is ready for user review of this bounded release and has not been merged. The owned browser verification tab is closed; no supervised worker awaits release.

Native canary readback remains admission-disabled. The prior automatic-review rejection of paid one-time native execution is unresolved, and its explicit approval question remains unanswered. Live AI-provider acceptance also remains unexecuted after automatic-review rejection; production OpenAI credentials are absent. Neither missing approval nor elapsed time was treated as execution permission.

Next implementation work is the fresh ownership and protected-result-delivery boundary in [OWNED-INGEST-PLAN.md](OWNED-INGEST-PLAN.md), followed by bounded multipart ingress and explicit physical context. Full creative reconstruction, broader adapters, provider quality and print acceptance remain open. Valid hosted Dissector upload was deliberately not used as a validation probe because it automatically dispatches inference. The completed source-only checks must not be represented as hosted provider or full R01 acceptance.

## PNG ingestion release — 27 October 2026, 15:27 UTC

Source `c910df968ac1bef181f9aa99c14008ed2897edac` includes fresh main `eb294e8600cc4054d1c9dd98eb46ec61c1ea9958` and is now canonical production Pages deployment `eb493158-0d78-4f9c-9102-89f20ae5a770`. The guarded release passed 282 focused tests, lint on ten source/test/page files, 45 actual disposable PostgreSQL tests, full build and six exact-artifact startup/codec tests. Raw modules are 25,399,666 / 25,468,928 bytes; gzip 7,444,610 / 9,750,000. Limits were not changed. Final module manifest SHA-256 is `f4efb2425bd3e5cde099dd593186c4bbbbf6311bb22df071f5084b94a3a5a330`.

The live upload endpoint rejects seven synthetic invalid inputs with 400: empty, text, truncated PNG, bad CRC, invalid scanline filter, PNG labelled JPEG and PNG labelled WebP. No job was returned and fresh job history is unchanged. The bounded validator records exact original PNG identity; progress/retry retain it and the pipeline checks it before inference. JPEG/WebP retain valid legacy upload behavior without verified-source metadata. This is PNG source integrity, not full R01 owned ingestion or bounded multipart transport.

After release, the editor reloaded, QR Codes rendered and all three existing synthetic PNG/JPG/GIF downloads matched their hashes with authenticated GET/HEAD 200 and private/no-store headers. Browser requests with credentials omitted return 401; Python's default client is separately denied by Cloudflare with 1010/403. The customer baseline revision and canvas hash remain unchanged. No valid hosted Dissector job or AI-provider call was submitted. [Review packet](../../../output/banner-release-acceptance-20261027/index.html) and `output/editable-artwork-ingest/hosted-rejection-evidence.json` retain exact observations.

Baseline CI `40519026264` passed (20,631 tests); new-source CI `40529448515` is still running. Draft PR 720 remains unmerged. All supervised workers are settled: 81 released, two user-retained, none reclaimable, inbox empty. Native admission remains disabled and its one-run approval remains unanswered after automatic-review rejection. Production OpenAI key is absent and provider acceptance is also blocked by the earlier automatic review. The full PRD remains incomplete; [owned-ingestion plan](OWNED-INGEST-PLAN.md) records the next implementation boundaries.

## Superseding CI checkpoint — 27 October 2026, 15:12 UTC

Corrected full CI `40519026264` succeeded on `7eb52a6736989aacb3c4bd62ac086baf8a1bf0f4`, including production build, all six exact-artifact startup/codec checks, 20,631 passing tests / 3,809 optional skips, and remaining mandatory checks. Production app source remains `fb065b7d2fabc4c94c2aff490b1f35114a6aab7f` at this checkpoint. The next reviewed PNG source-integrity increment is candidate-qualified locally in [INGEST-SOURCE-INTEGRITY.md](INGEST-SOURCE-INTEGRITY.md); its release remains separate. Native canary admission remains disabled and the specific one-run approval unanswered. Production OpenAI key presence is false; no live provider request occurred.

# Banner release verification — 28 October 2026

The editor/export release is deployed and passes the bounded synthetic checks below. The full editable-artwork PRD is incomplete. Native execution and live AI-provider acceptance require the specific approvals described below.

## Deployed editor and downloads

- Pages project: `agency-dashboard`, production/main; source `fb065b7d2fabc4c94c2aff490b1f35114a6aab7f`, including main `eb294e8600cc4054d1c9dd98eb46ec61c1ea9958`.
- Deployment: `7aed0def-b310-4d4b-85e9-8ed8a3ef73cb`. Cloudflare readback confirms success.
- Final guarded build: raw 25,394,066 / 25,468,928 bytes; gzip 7,441,981 / 9,750,000 bytes. All six actual-artifact startup/codec checks pass. Limits were unchanged.
- Private renderer: source `8326ba1c6`, version `4f21784e-a014-48be-8b8c-9f14f1bb42ee`, with workers.dev and preview URLs disabled.
- Actual editor downloads pass: PNG 640×360, JPG 2× 1280×720, GIF 640×360 with 50 frames at 100ms and seven distinct decoded frames. The saved private downloads match captured hashes; unauthenticated GET/HEAD return 401. Signed-upload rendering passes.
- The first history read after new PNG export `448ccd1b-6fd8-422a-95ff-cfe273baba47` contains that new row. Its 35,124 bytes match SHA-256 `25e801dee9da48cc0b96d84c7b4b9819d202fb291e0d79ca7096e183311f557c`. This accepts the `queryRowsFresh` history repair.
- Synthetic save/reopen, exact undo/redo, animation persistence, HTML export and Banner/QR navigation passed. Existing customer project revision and canvas hash remain unchanged.

The actual downloaded files and sanitized JSON receipts are in `output/banner-release-acceptance-20261027/index.html` in the original workspace. [Hosted raster acceptance](HOSTED-RASTER-ACCEPTANCE.md) retains the chronological hashes and earlier checkpoints; this report supersedes its pending-history-release status.

## CI fixture correction

Run `40508897634` passed the database gates, production build and artifact-isolation checks, then failed exactly two browser fixtures: 20,629 tests passed, two failed. It is not a green release run.

Both fixtures used default body margins inside a 4×3 viewport. Forced classic scrollbars reproduce both failures on macOS: the screenshot area becomes zero-width before decoding. The font was loaded and the GIF forbidden-API check had passed. The correction changes test layout only, retains classic-scrollbar coverage and adds independently decoded glyph/GIF pixel evidence. Production source, timeouts, security checks, generated HTML and workerd proof are unchanged. All 67 focused tests, including 15 real browser tests with no skips, and scoped lint pass. See [the reproduction and repair](RENDERER-CI-BROWSER-REPAIR.md). The corrected source still requires its full CI rerun; PR 720 remains draft pending that result and final review.

## Native registry publication and private deployment

The retained image is now published. Fresh registry GETs by tag and immutable digest return the exact original manifest bytes; the remote config matches exactly, and every required blob has a matching descriptor readback.

- Manifest: `sha256:12158e33bb5a22ed0ff01b0f9d1cde28e24d44904f3c1819e4ef379fe4f47472`.
- Config: `sha256:e7bfa3ca18487c5c231229ca24164de533eff36934f1a78c29b96b57f1301805`.
- Repository: `registry.cloudflare.com/a5b299b3ad15c1b5b895dc66f9357b17/banner-engine-native-canary`; tag `qualified-20261027-12158e33`.
- All 24 original compressed layers, config and Docker schema2 manifest were preserved. No rebuild, image-store change, recompression or image execution occurred.
- Publication used official regctl v0.11.7, binary SHA-256 `8ac077a1eeb834d3053714e86ccbd838d0da46567df8cd7c2695d1a19135bf60`, with serial commands and bounded internal retries. Eight offline harness checks passed. Earlier Docker EOFs and the first serial pass's local timeout remain failed historical receipts; a size-based continuation verified and reused existing blobs before completing publication in 858.58 seconds.
- Final sanitized receipt: `/private/tmp/banner-serial-upload-20261027/publication-sized-receipt.json`. All temporary registry credential files were removed.

The dedicated Worker `banner-engine-native-canary` was deployed with admission disabled from the same current source as Pages. Bundle SHA-256: `d3a47e5a509e0bd5e108fa053eb8bb1b94216daf420970c0cc6ad3bf9e86d1d9`; disabled config SHA-256: `46425991a92d803aedc160fedc414b7f62afd4af0e5c4d2788b3ec9a304970dd`.

- Worker version: `90f29fcc-73b6-461a-922d-5181b2ca061b`; deployment: `4dca3f63-ea82-429c-aeb2-c9b74feb01ec`.
- Container application: `a036a963-5c0c-475a-8f3f-46e515e51cc1`, maximum one standard-3 instance.
- Cloudflare readback confirms workers.dev and preview URLs disabled and `BANNER_NATIVE_CANARY_ENABLED=false`.
- Private status RPC at `2026-10-27T14:05:58.959Z` returned `record:null`: the durable native invocation is unconsumed. The loopback invoker was stopped and its nonce file removed.

## Explicit approval boundaries

Automatic approval review rejected the attempted canary-enable command before execution. Its stated reason was that enabling/deploying the native canary would authorize external compute with potential cost and irreversible one-time consumption, which broad autonomy instructions did not specifically authorize. The safer alternative was to leave admission disabled. Readback confirms it remains disabled; no enabled config or invocation marker was created. No workaround or native run occurred.

The concrete remaining native action is one synthetic qualification using this exact published image, one container, two sequential fixed engine fixtures, a permanent consumption record and a five-minute destruction deadline, followed by verified destruction and admission disable. It does not activate production engine jobs or use customer artwork.

An earlier automatic approval review also rejected live AI-provider verification because of external transmission/provider spend. That request remains unexecuted. Separate approval is needed for a synthetic lettering test using only test wording/style data. No new login is required by either prepared action, but existing account capability must still be valid when approved.

Registry publication and private deployment do not prove native rendering, provider quality, full creative reconstruction, cross-role acceptance or duplex/CMYK/print readiness. Those broader requirements remain open in the completion audit.
