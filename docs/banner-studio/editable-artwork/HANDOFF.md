## Release approval checkpoint — 27 October 2026, 22:07 UTC

The tested application candidate is **`ab380c6e423bc528c9fa4054dd7912c91b7d62fe`**, including current main **`5e3f5b5472bf6827d094bae2bae029aa4e6f5820`**. The full suite passed **21,731 tests / 4,065 skipped** (2,624 files passed / 118 skipped); the subsequent scoped typing/formatting cleanup passed all **82 affected checks** and scoped lint. The full production build passed **3,032-module import closure**, all **six exact-artifact startup checks**, and unchanged limits: **25,341,792 / 25,468,928 raw bytes**, **7,262,419 / 9,750,000 gzip bytes**. Module-manifest SHA-256: `846f1b045aef94043defc58c607cbc9270de68d59c35e5f55f9ff318920d3115`. Local native R2 and Chromium proofs and 75 job/import plus 30 canvas PostgreSQL tests retain their separate evidence scopes; counts overlap.

**Production has moved independently.** Fresh Cloudflare readback identifies main `5e3f5b5472bf6827d094bae2bae029aa4e6f5820`, deployment **`c1c09443-5dc4-4f52-ae51-ed3bb39fb016`**. The three previously verified synthetic saved-export download URLs return **404** on this release. The customer baseline is still revision `2026-10-26T03:49:11.160Z`, canvas SHA-256 `e7f7c22f77232601fd80b63c1df7c604b523924e3198eac5c39640bff55b168f`. The candidate restores those routes while retaining the current marketing source. Earlier claims that production still runs `c910df968` are superseded by this readback.

The guarded production release command was **rejected before execution by automatic approval review**. Its stated reason: releasing the entire candidate is a consequential service mutation beyond clearly authorized local qualification and draft-branch work; the restoration purpose alone does not establish production-release authorization. Do not retry directly or indirectly without explicit approval. The prepared action is `pnpm deploy:production` in the isolated release worktree, targeting only `agency-dashboard`, followed by exact deployment, saved-download, editor/QR and unchanged-customer verification. No new credentials are required. The draft PR remains unmerged; merging it after required checks and review is necessary to keep later main releases from dropping the Banner changes again.

All local source work is retained. [PR 720](https://github.com/adme-dev/dashboard/pull/720) is the review surface; remote CI remains pending and is not represented as passing. The release packet is `output/banner-release-candidate-20261028/`. All dispatched workers are settled (97 released, two previously user-retained; none reclaimable).

[Craft tool status](TOOLS-DEPLOYMENT-STATUS.md): PhotoCraft/VectorCraft have a deployed **disabled private canary**, not active hosted integration. EffectCraft/FilmCraft/FigCraft/SoundCraft have no qualified adapters or deployed integrations. The earlier native one-run and live AI-provider automatic-review rejections remain unresolved. Scoped project analysis admission is also disabled. Full PRD, reconstruction, provider quality and print readiness remain incomplete. The remaining low-severity lock/performance limits are explicitly recorded in [the residual review](INGEST-RESIDUAL-CLOSURE.md).

Earlier checkpoints below are historical.

## Protected ingestion checkpoint — 27 October 2026, 21:16 UTC

Fresh ownership/lifecycle checks, bounded multipart ingress, authenticated result delivery, saved protected exports and managed-flow exclusions are now implemented locally. The candidate contains the owned changes on current main; production is unchanged. The combined focused suite passed 1,023 tests, the final lifecycle PostgreSQL proof passed 59, and the flow PostgreSQL proof passed 16 (counts overlap with other reported runs). A cancellation-edge regression was reproduced and fixed. Independent review, actual local browser export proof and full guarded build remain in progress. **Scoped admission remains disabled; this is not full PRD or hosted provider acceptance.** See [the integration record](OWNED-INGEST-INTEGRATION.md) for authoritative scope, evidence and remaining gates. Earlier completed-release statements below describe the previous PNG source-only release.

# Orca receiving-agent handoff

## Current continuation — autonomous release and remaining product work

27 October: Paul requested the whole job run autonomously. Resume from [AUTONOMOUS-RUN.md](AUTONOMOUS-RUN.md), which supersedes the older authorization/checkpoint statements below. The isolated release candidate is current with main; reviewed corrections are integrated and focused tests pass, but the full build now fails the immutable Pages size budget. Size repair, persistent engine service and AMD64 qualification are active under the existing Orca Run. No new deployment or complete-PRD acceptance is claimed.

Related approved workstream: [OpenUI chat rollout](../../ai-chat/openui-rollout.md). Paul requested its inclusion for finance, analytics, reports, dashboards and presentations. Keep it documented while continuing Banner Studio/Craft implementation; no OpenUI rollout is claimed.

## Current checkpoint — authenticated private engine previews

27 October: resume from [ENGINE-JOBS.md](ENGINE-JOBS.md), [Pages guard](ENGINE-JOBS-PAGES.md), [independent review](ENGINE-JOBS-REVIEW.md) and [Kimi’s completion audit](COMPLETION-AUDIT.md). The default-off API binds an uploaded native file to current saved-project authority, records immutable PostgreSQL attempts and returns private validated PNGs through the pinned Linux worker. It does not import editable layers or replace the manual wording bridge. Final evidence and remaining activation gates are recorded in the engine report.

Final local proof: `output/editable-artwork-engine-jobs/proof-2026-10-27T05-26-57-516Z/`, with unchanged source hashes, 12 SQL/native cases and exact private alpha PNGs. Coordinator regression adds 358 disjoint tests, for 370 unique passing tests across 17 files; scoped lint and whitespace checks pass. The small actual Pages build passes; no full dashboard build or global typecheck is claimed.

No hosted activation, live migration, production deployment, merge or publication is authorized by this local checkpoint. Preserve the shared dirty worktree. Other Craft adapters, live AI quality, all-side reconstruction and print acceptance remain open.

Independent review accepts this bounded local snapshot with no unresolved P1/P2 findings. Kimi audit, server authority, worker transport, cleanup correction, Pages helper, Pages entry guard and independent review tasks all succeeded and were released. The owned disposable database and HTTP fixture are stopped; no labelled native proof container remains. Orca card is in review.

Final repository check: `origin/main` advanced during this increment to `5d17d2fa4012a011f943df8a80c579923f163dd8` (HEAD one ahead/one behind). Its only new change is `docs/runbooks/ita-dealer-completion-ledger-20261026.md`, with no overlap in the engine source. The recorded test hashes remain current; reconcile this documentation-only advancement before further implementation or release. No merge or dirty-worktree stash/reset was performed.

## Historical checkpoint — companion wording review in the editor

27 October: resume from [COMPANION-WORDING.md](COMPANION-WORDING.md), [UI](COMPANION-UI.md), [platform fonts](COMPANION-FONTS.md) and [review](COMPANION-REVIEW.md). Final actual Nuxt/Linux proof passes at `output/editable-artwork-companion/ui-2026-10-27T04-32-30-268Z/`: real editor request, selected native edit/reopen, imported before/after review, explicit apply, exact one undo/redo, fixture save/reopen and repeated export with descriptive provenance. Original 124 supplied layer fields and managed QR are preserved. Preview and actual canvas use the exact served SourceSans3-Bold font; 21 source/runtime hashes remain stable.

The browser owns transient authority; imports propose wording only. Optional saved `companionEdit` has `engineVerified:false` and cannot authorize further changes. The CLI confines files to owned output, exports only the selected supported heading and validates the exact complete returned project. Unsupported original Arial/multiline headings are explained and not converted. Source Sans 3 normal 700 is now reserved for the pinned 3.052 platform face, which can affect legacy same-family custom/remote font versions; other faces remain separate.

Coordinator regression passes 273 unique tests across 19 files, plus one optional existing skip. Scoped new/changed-module lint and whitespace checks pass; the contrast fix passes component tests and the final browser proof. Do not claim full build, global types, hosted API persistence or live model quality. Runtime is the existing accepted Linux image; no new provider calls, database changes, purchase, commit, merge or deployment. Current HEAD47ec30c3522f6ab660d730776709770c8a22d7c8 includes freshly checked main4469d6a2fb873c2d7b90ece9a359dd571def0ba2; parent and dirty checkout preserved.

Next: authenticated hosted authority/queue and owned storage using the existing runner/result contracts, then live persistence acceptance. The manual bridge is not an AI wording generator; existing catalogue/copy tools supply AI proposals. Full flyer reconstruction, arbitrary fonts, four-side creative/print acceptance and live background quality remain open. OpenUI stays in its separate linked rollout. Independent review passes with no unresolved P1/P2 findings in this slice. All three workers succeeded and were released with transcripts archived; no reclaimable worker remains. The owned Nuxt server on3137 is stopped, its port is closed, the proof browser exited and no labelled Linux proof container remains. Orca card is in review; all source remains local and uncommitted.

## Historical checkpoint — Linux native lettering return

27 October: read [Linux native round trip and evidence](LINUX-NATIVE-ROUNDTRIP.md), [fonts](LINUX-FONTS.md), [typed document bridge](LINUX-DOCUMENT-BRIDGE.md) and [review](LINUX-NATIVE-REVIEW.md). The post-fix integrated proof passes at `output/editable-artwork-linux-native/integration-2026-10-27T03-22-34-330Z/`. Independent review accepts this bounded local slice with no unresolved P1/P2 findings.

Pinned Source Sans 3 Bold is checked in the executing Linux container. The typed text-only bridge exports a supported heading, edits wording, reopens the native file and returns the existing guarded plan. Exact exported archive hashing prevents an altered cache-bearing file from reaching the native edit operation. Arbitrary imported returns are inspected only; their text is freshly reconstructed for measurement.

The actual Banner store passes one undo, redo and fixture save/reopen. All supplied fields of the original 124 layers survive; ordinary legacy-load defaults are recorded, and all non-selected canonical layers plus the managed QR remain exact across the bridge. Chrome renders the returned heading using the exact pinned font through the existing HTML exporter, with no overflow, errors or remote requests. This is not Nuxt bridge UI or live API persistence acceptance.

This increment passes 163 unique tests including the real Linux/browser integration, plus scoped lint and whitespace checks. Standalone strict types remain unverified because the attempt reached existing Nuxt-context and shared typing failures. No full build, hosted mutation, deployment or publication occurred. Current HEAD remains `47ec30c3522f6ab660d730776709770c8a22d7c8`, including the freshly checked main `4469d6a2fb873c2d7b90ece9a359dd571def0ba2`; preserve the dirty worktree and parent.

Next integration gates: hosted authority/queue/owned storage and reviewed bridge apply UI, exact platform browser-font delivery and stored provenance. Public job results remain PNG previews. Original fonts, full artwork interchange, live AI quality and print acceptance remain open. OpenUI's separate approved rollout is linked above.

The font/runtime, Linux bridge and independent review workers all succeeded and were released with transcripts archived. The inbox is acknowledged and no worker is awaiting release. No labelled Linux proof container or workspace listener remains. Orca card is in review; all changes remain local and uncommitted.

## Historical checkpoint — Creative Studio home and Linux engine foundation

27 October: read [implementation/evidence](ONLINE-ENGINE-IMPLEMENTATION.md), [job contract](ONLINE-ENGINE-CONTRACT.md), [runner](ONLINE-ENGINE-RUNNER.md), [Linux runtime](ONLINE-ENGINE-LINUX.md) and [independent review](ONLINE-ENGINE-REVIEW.md).

The new `/agency/creative` home reuses existing Banner, Video and Audio studios, templates and brand kits. Actual Nuxt fixture proof covers light/dark desktop, mobile resource scrolling, destination navigation, public feature documentation and creative-role denial, with no page errors or writes. It is local source, not a hosted rollout.

PhotoCraft 0.16.0 and VectorCraft 0.17.0 execute headlessly in isolated Linux ARM64 containers. Native acceptance passes 13 checks including edited native text, independent pixel/vector masks, fractional alpha and exact Linux save/reopen pixels. Safety proof passes 7 actual checks. The bounded runner and pure result validator reject duplicate/stale/altered/unowned results; output remains a PNG preview (`editableImport:false`). Final integration has a retained exact runtime manifest/proof snapshot at `output/editable-artwork-online-engine/integration-2026-10-27T02-22-57-080Z/`.

Selected regression now covers 162 unique passing cases, including the earlier actual saved-native bridge editor fixture. Strict integrated types and scoped lint pass. MarketingNav retains its 35 identical pre-existing HEAD lint errors; no full build or hosted tests were run. Linux substitutes Arial and Inter Bold, so exact production font fidelity remains open. User artwork remains unchanged.

Next: connect an authenticated hosted job authority/queue and owned storage to the proven worker boundary, provision pinned fonts, and return reviewed native proposals through the existing bridge. Other four engine names remain disabled vocabulary. Full four-side artwork, live AI quality, hosted multi-tenant/crash behavior and print acceptance are still separate gates.

The root-owned Nuxt server is stopped; Orca reports no workspace listeners. Actual labelled Linux proof containers are absent. No merge, deployment, publication, purchase or parent-checkout edit occurred. All four workers succeeded and were released. Final HEAD `47ec30c3522f6ab660d730776709770c8a22d7c8` includes refreshed origin/main `4469d6a2fb873c2d7b90ece9a359dd571def0ba2`; all 237 existing source-file hashes survived reconciliation. Details are in the implementation report.

## Historical checkpoint — reviewed lettering repair and PhotoCraft bridge

27 October: read [implementation/evidence](BRIDGE-REPAIR-IMPLEMENTATION.md), [independent review](BRIDGE-REPAIR-REVIEW.md), [server](LETTERING-REPAIR-SERVER.md), [UI](LETTERING-REPAIR-UI.md) and [bridge contract/CLI](DOCUMENT-BRIDGE.md). Actual Nuxt fixture proof passes region repair preview, native heading/font, one undo/redo, save/reopen and right-click tween movement. Managed QR is unchanged and all 1,444,072 pixels outside the rectangle are exact. Repair provenance is saved on both related layers. The white provider patch is synthetic; live background quality is unverified.

The local PhotoCraft bridge exports only supported layers and returns wording-only proposals with trusted measured fit, hashes and revision fencing. Actual saved native files pass 15 predicates, and the editor store accepts the bound result with one undo/save/reopen. Original 124 layers remain exact; supported heading125 is a separate explicit fixture. Broad regression passes 1,214 tests/19 skipped; final bridge follow-up 55 passed. Scope and skipped gates are explicit in the reports.

Fresh main was included before code work. During work origin/main advanced to `ec2b67ff4d7952ca0ea33a4cd98365a1d9a18798` (HEAD 1 ahead/5 behind), changing only the unrelated ITA ledger. No code overlap found; preserve dirty work and refresh/integrate before release or the next implementation. No commit, merge, production deployment or client publication.

Latest product direction: [online engine architecture](ONLINE-ENGINE-DESIGN.md) includes PhotoCraft, VectorCraft, EffectCraft, FilmCraft, FigCraft and SoundCraft. Browser edits and unattended server jobs are distinct. FigCraft/SoundCraft have public-source research only; no runtime integration is claimed. Hosted workers, actual AI repair quality, complete artwork interchange and print acceptance remain open.

All five workers for this increment succeeded and were released with archived transcripts. The owned Nuxt server on port 3137 is stopped and the port is verified closed. PhotoCraft workers recorded clean process exits and closed control ports. Orca card is in review.

## Historical checkpoint — installed Craft app proofs

27 October: read [combined findings](CRAFTING-APPS-RND.md) and the four linked application reports. PhotoCraft installed desktop passed native/PSD text, independent masks, font/wording edits and undo with exact pixel restoration. VectorCraft passed desktop/native/SVG checks with a recorded font substitution; EffectCraft matching CLI passed native/Lottie animation and alpha checks; FilmCraft matching CLI passed native/video alpha checks but lost editable titles through OTIO. These are synthetic local proofs, not application adapters or automatic flyer reconstruction. REA 6.4.0 supplied bounded static bundle inventories.

All three research workers succeeded and were released with transcripts archived; root stopped its PhotoCraft process. Existing dirty implementation and parent remain preserved. No commit, merge, deployment or publication. Research did not refresh remote refs; fetch/reconcile current main before the next application change. Earlier provider, hosted and full-artwork acceptance gates remain open.

Managed platform QR continuation: [MANAGED-QR.md](MANAGED-QR.md). Earlier generation/lettering evidence remains separately labelled.
Current governed job and model ownership: [JOB.md](JOB.md). Retail editing example: [RETAIL-EDIT-SCENARIO.md](RETAIL-EDIT-SCENARIO.md).
## Historical checkpoint — interrupted dispatch recovery

Read [DISPATCH-RECOVERY.md](DISPATCH-RECOVERY.md) and [independent recovery review](RECOVERY-REVIEW.md). Main remains `4a68e92367fbcffd08a3f6a6a6e4537c71195937`, included in HEAD `d4560047ae045e14d337ccf062055dce83692fcb`. Existing dirty implementation and parent remain preserved; no commit or deployment.

Queued initial/retry generations now persist versioned delivery intent. Database leases and a default-off authenticated recovery endpoint can redeliver an unstarted generation after interrupted dispatch, without creating another provider attempt. Running inference is never restarted. Transport reservations are capped at five, separately from three explicit provider attempts; original deadlines and import/cancellation fences remain. Hosted requests require a queue; direct lifetime fallback is loopback development/test only.

Coordinator regression passes 914 tests / 5 skipped; independent actual PostgreSQL proof passes 43 cases, with matching source hashes and successful owned-cluster cleanup. Scoped lint and whitespace checks pass. Earlier native/editor/QR/browser artifacts remain intact. Hosted scheduling/queue/Neon/provider acceptance, cost ceilings, automatic background repair and four-side/print acceptance remain open. Recovery is not activated.

Both recovery workers succeeded and were released with transcripts archived. The owned database is removed, no workspace server remains, and the Orca card is in review.

## Historical checkpoint — asynchronous retry continuation

Read [ASYNC-JOBS.md](ASYNC-JOBS.md) and [independent review](ASYNC-JOBS-REVIEW.md). Fresh main remains `4a68e92367fbcffd08a3f6a6a6e4537c71195937`, already included in HEAD `d4560047ae045e14d337ccf062055dce83692fcb`; no rebase was needed this continuation. Existing dirty implementation and parent were preserved.

Retry admission is now separate from execution: it reserves a queued generation bound to the reviewed attempt, dispatches once through the existing queue or registered request lifetime, and returns saved status. Lost responses recover by reading status, without automatic resubmission. Legacy jobs receive a server-issued identity for safe retry. The same dialog now supports queued progress and cancellation; it no longer needs the close/reopen workaround. Actual Nuxt fixture proof passes in `output/editable-artwork-async-jobs/ui/review.html`; final regression/SQL review details are in ASYNC-JOBS.md. Coordinator checks pass886 tests/5 skipped; independent real PostgreSQL proof passes25 cases and122 focused regressions. Both workers succeeded/released, the owned port 3137 server is stopped, and the card is in review.

Request lifetime remains bounded by the host. Hosted queue/Neon/provider acceptance, process-death recovery and automatic reconstruction/print gates remain separate. No deployment or publication occurred.

## Historical checkpoint — persisted reconstruction jobs

27 October: read [JOB-RELIABILITY.md](JOB-RELIABILITY.md) and [governing review](JOB-RELIABILITY-REVIEW.md). Current reconciled HEAD `d4560047ae045e14d337ccf062055dce83692fcb` includes main `4a68e92367fbcffd08a3f6a6a6e4537c71195937`. Seven upstream commits were reconciled before implementation, preserving tracked/untracked changes and the dirty parent. No new commit or deployment.

The existing Dissector now persists attempts/progress, cancellation, bounded explicit retry, access-time timeout expiry and exact-result/revision-bound atomic import receipts. Saved analyses resume across close/reload; late responses are fenced and existing-project import creates one undo action. Coordinator regressions: 851 passed / 5 skipped in two non-overlapping commands. Actual Nuxt fixture browser proof passes with zero errors: one upload, two retries, one cancellation, one import, four saves, undo/redo and reload. Independent real PostgreSQL proof passes 14 cases including concurrency, rollback, replay and expiry, with owned cluster cleanup. Evidence: `output/editable-artwork-jobs/ui/review.html`, `ui/evidence.json`, `postgres-proof.json`.

All three job-reliability workers succeeded and were released with archived transcripts. Governing review accepts the bounded local increment.

Remaining: manual retry awaits the request, so close/reopen to resume progress/cancel while it runs; the existing no-queue fallback is not durable dispatch. Hosted queue/Neon/provider behavior, cost ceilings, automatic clean-background repair and four-side acceptance remain open. Do not mark all R12 complete. Preserve all earlier native/lettering/QR/retail proof artifacts.

## Historical checkpoint — retail invitation continuation

27 October: read [RETAIL-IMPLEMENTATION.md](RETAIL-IMPLEMENTATION.md) and [RETAIL-REVIEW.md](RETAIL-REVIEW.md). The existing native design assistant now supports a selected-layer region, exact approved wording, protected body layout, before/after review and measured glyph fit before one undoable apply. Current source HEAD `3d28afca8cb768e02b1cca68953b0ea92c4e0b6c` includes main `3a837b45149b25f561558be65e1a89ca31bf4315`; the tracked autostash and untracked work were preserved. All changes remain local/uncommitted.

Final broad automated check: 803 passed, 5 skipped across 96 passing / 4 skipped files. Reviewer independently passed 156 tests across 11 files with no remaining blocking source finding. Actual browser proof passes with zero page/console/fixture errors: 31 original text blocks exact, 120 protected layer hashes unchanged, 10 affected text blocks fitting in preview/editor, one undo/redo and save/reopen. Review is accepted within this local native scope. All three retail workers succeeded and were released with transcripts archived: initial implementation `ctx_011bfb13885c`, browser `ctx_6d8e21f19e78`, and governing reviewer `ctx_65b0a85c9fed`. The inbox is clear. The owned port 3137 dev server was stopped after proof; the port has no listener. Orca card is in review. Live provider and database credentials remain unavailable locally.

## Historical managed-QR checkpoint

The managed-QR continuation is implemented locally and the final combined suite passes 725 tests (5 skipped). Read MANAGED-QR.md and JOB.md before the older G1/G2 checkpoint below. The supplied flat front/back have not been replaced with a live managed QR; this requires an authorised client record and final layout review. The retail pizza/drinks panel remains a planned acceptance scenario.

Run `run_666e5ba6039d` has three successful, released workers: Astra high governing review and two Sol high implementation/browser tasks. The inbox is clear. Governing acceptance is bounded to local managed-QR source and tests; the coordinator addendum records actual editor fixture proof. Final scoped lint passes; a test-only WebSocket instance capture cleanup was rerun with all six protection tests passing. The owned port 3137 dev server has been stopped. The Orca card is in review; pending retail task is `task_d013391fe298`.

Read [V2-IMPLEMENTATION.md](V2-IMPLEMENTATION.md) first. G1 creation/styles and G2 native/isolated-raster lettering are implemented locally; actual Nuxt fixture proof covers preview, apply, undo/redo, save/reopen and custom styles. Bounded suites: 457 passed, 5 skipped across 59 passing/4 skipped files. This is explicit fixture-provider/file-backed persistence evidence, not live OpenAI or hosted database acceptance.

A real Qwen `--run` failed with a Space error and no layers: `output/banner-provider-benchmarks/2026-10-26T07-10-28-456Z-b496bdc49cb9/evidence.json`. Do not repeat it blindly or label the earlier dry-run as inference. Seedream/LayerD runtimes and Quiver application adapter remain unavailable. OpenAI credentials/live generation remain unverified.

All implementation is local/uncommitted; nothing deployed. Final reconciled HEAD `4111fb9b42b1463b42411a2ba5e4a1acaaf8a197` includes freshly fetched main `21b162c19eb1956c80dc2ab2ab4731ead7968bfd`; autostash preserved existing edits. Preserve Stage 0/1 artifacts and the dirty parent checkout. Historical checkpoints below remain provenance, not current release authority.

Next: obtain authorised provider/hosted evidence without fabricating success. Automatic flat-poster clean-background repair, native-to-raster without an owned raster reference, durable R12 jobs, other three sides, 20-case evaluation, absolute dollar-cost caps and print/vector gates remain incomplete. One-call/rate/size limits exist; USD ceilings are not enforced.

## Mission

Continue the editable-artwork project from this worktree. Read README, BRIEF, PRD v2, LETTERING-WORKFLOW, TECHNICAL-DESIGN, VECTOR-RND, PROVIDER-READINESS and IMPLEMENTATION-PLAN. Local Stage 0/1 and layering repairs already have evidence; preserve them and follow the latest G1–G3 increments. Do not restart completed work or stop at another plan if implementation can proceed.

## Authority and boundaries

Paul requested a proper brief/PRD, Quiver capability research and an Orca worktree to continue work. Draft implementation and local validation are in scope. There is no instruction to merge, deploy, publish client artwork, send external messages, train on vendor outputs or purchase subscriptions. Do not invent credentials or claim provider acceptance without a real response.
You own this worktree's implementation and the handoff docs. You are not alone in the repository: preserve other contributors' edits and reconcile rather than reverting them. Do not edit or clean the dirty parent checkout. Use source origin adme-dev/dashboard, not upstream template identity.

## Important correction from Paul

“Can you come up with a lifestyle image instead of the beach because they haven’t moved to the beach?”
The final Concept B references are the LOCAL LIFESTYLE front/back, created with a leafy park family picnic setting. Do not use the superseded summer-adventure coastal files. The brief does not claim the pictured park is the dealer premises.

## Original handoff snapshot (historical; see continuation checkpoints)

- Four current A4 JPEG concept sides and originals are in the local reference pack; read manifest for hashes.
- Copy, OEM vehicle/logo sources and prior vector map data included.
- Current source audit documents real gaps: whole source used as background, staggered decomposition import positions, raster-only Qwen output and generic fallback manifests.
- Native text effects and brand-aware copy suggestions already exist on the new main. Extend them.
- Dedicated Orca worktree is based on initial 294d5fc10082ee627ccfd9d7eeb604b79b4bc82e; refresh origin/main before implementation/release.
- No runtime provider tests, paid vector benchmark or new feature deployment performed.
- Earlier Banner Studio drafts from previous restrained layouts exist but are not the newly generated creative concepts. Create new reconstruction drafts; do not overwrite those or claim they match the current designs.

## Start commands

Check git status, branch/upstream and current origin/main, then inspect the cited source. Dependencies were installed during the local pilot; verify their current state before setup. Follow normal repository setup using authorised local secrets without copying or printing them into docs.
Load the project's required skills for code/form work. Build a meaningful testable slice. Do not create a new generic editor or AI catalogue when established surfaces exist.
Record progress in an implementation log and the Orca card comment. Use real browser evidence for live claims. Preserve this brief and update decisions explicitly if new evidence changes the plan.

## Continuation checkpoint — local Stage 0/1 implemented

Read [LOCAL-PILOT.md](LOCAL-PILOT.md), [IMPLEMENTATION-LOG.md](IMPLEMENTATION-LOG.md) and [PROVIDER-READINESS.md](PROVIDER-READINESS.md) before resuming. This branch has been reconciled again onto origin/main `d4df8643c230b758765d9b56e396a0e1394cedbe`; documentation HEAD `0bb6b8caf9fd61dc522f432e177232a855c5247c`. Implementation changes are local and uncommitted; preserve them.

Native local project and comparison: `output/editable-artwork-pilot/project.json` and `review.html`. This is the new **local lifestyle letter back**, separate from older drafts. Exact approved copy, clean plate, native road/panel geometry, scoped heading preview/apply and undo are implemented and tested. The full local UI uses explicit test API adapters. Never present its fake local identity, deterministic copy response or file persistence as live auth/provider/database success.

Validation: 311 regression tests pass; explicit Chromium reconstruction and full editor UI proofs pass. Global `pnpm typecheck` exits 2 with 952 diagnostics outside changed/new files; full log retained in the pilot output. Owned local dev server has been stopped. Orca card is in review.

Next bounded increment: obtain an authorised Banner Studio session and catalogue/provider access, upload owned source/derived assets through the established asset boundary, create a new tenant/client-scoped draft and repeat the same proof with a real copy-provider response. Then Stage 2 durable jobs/owned imports and remaining sides. Do not run the local fixture identity against a hosted application. Do not broaden to automatic reconstruction or press-ready output based on this pilot.

## Parallel-agent continuation

The same uncommitted worktree now also repairs the existing Qwen/Dissector flows. Read the README capability matrix and the final IMPLEMENTATION-LOG section. Qwen uses registered raster frames, complete-set validation, signed owned-asset loading, and one undo; synthetic browser proofs cover cover/crop and half-opacity rejection. Dissector no longer fabricates results or uses the original as a clean background; missing background repair blocks import with `review_ready`. Both routes still need real provider acceptance. No live account or deployment was used. The next live benchmark must distinguish Qwen raster-separation quality from native-text reconstruction, and preserve current default-animation limitations documented in the log.

## Latest steering — create, then edit

Paul supplied the bold retail **lifestyle** front and named Artlist/Lovart as workflow references. The priority is complete campaign artwork generation using OpenAI, followed by reusable style prompt recipes, element selection/AI edits and native-text reconstruction. Read the new BRIEF and IMPLEMENTATION-PLAN clarification before further code work. At that historical clarification checkpoint, no OpenAI provider adapter, style-library feature or live generation acceptance had been implemented; do not report the earlier layering fixes as delivering them.

## Historical documentation checkpoint — PRD v2 (superseded by current checkpoint above)

Paul requested the complete discussion be captured in the PRD. Requirements R18–R24 and gates A09–A12 now cover generation, style recipes and right-click/inspector lettering edits. LETTERING-WORKFLOW.md specifies native text reconstruction versus raster redraw, editable wording/instruction fields, retained reference/recipe, scoped background repair, preview, save/reopen and atomic undo. Claude Design is an interaction reference, not evidence of flattened-image typography recovery.

Two research agents expanded primary-source model research: Qwen-Layered, Seedream 5.0 and LayerD are decomposition benchmark candidates; Nano Banana/MiniMax generation and editing are distinguished from layer output; Qwen-Image-2.1 and OmniPSD limitations/licences are recorded. No live quality benchmark ran. Technical design and plan are aligned; no new product code was added for this documentation checkpoint.

At that historical checkpoint, implementation verification was 397 passing regression tests and three explicit browser proofs, using local/synthetic providers as documented in IMPLEMENTATION-LOG.md. The earlier 311-test checkpoint above is historical. Global typecheck remains failing; no new clean claim. All work remains local and uncommitted, with no merge, deployment or client publication.

Final runtime checkpoint: the owned Nuxt server on port 3137 is stopped and the port has no listener. Orca inbox is clear, no workers remain reclaimable, and the card is in review. No other contributor runtime or database was stopped.


## 27 October: animation, alpha/masks and ArtCraft reference

Paul approved right-click Animate/Add Tween, then requested a second PNG alpha and mask check and supplied ArtCraft as an integration reference. See [animation workflow and evidence](ANIMATION-WORKFLOW.md) and [pinned ArtCraft/PhotoCraft source research](ARTCRAFT-RND.md). Changes remain local and uncommitted. Current source includes refreshed origin/main; the dirty parent remains preserved.

The coordinator regression passes 1,074 tests with 61 environment-gated skips across 118 files. Eleven explicitly enabled Chromium cases pass separately. Both actual Nuxt workflows now pass: flyer seven assertion groups with 124 unchanged unselected layers, and alpha/masks six groups covering normal/inverted rectangle and ellipse, undo, save/reload and both exporters. Source hashes match; independent review and worker settlement are recorded in ANIMATION-WORKFLOW.md. No deployment, live provider-quality proof or installed ArtCraft integration is claimed.

## 27 October: installed ArtCraft investigation

Paul pointed to `/Applications/ArtCraft.app` and requested agents. Two research workers examined the signed 0.41.0 bundle and versioned public source while the coordinator inspected the running app. See [installed workflow evidence](ARTCRAFT-INSTALLED-UI.md). Basic Moodboard text edit, undo/redo and exact text after webview reload are proven; the test object was removed and the app returned home. No client artwork upload or generation was invoked. This does not establish a portable document bridge, PSD fidelity or flattened-flyer lettering recovery. Canvas base-image and Moodboard imports have upload side effects according to tagged source. PhotoCraft is a separate free early-alpha app and the next useful installed native-text/mask/PSD test; user offered to download other apps, and only PhotoCraft was recommended. Existing implementation and the dirty parent remain preserved; no new application code or deployment in this increment.
