# Banner Studio editable retail artwork — governed job

27 October 2026 continuation. Coordinator: current owner of this worktree. User requested a proper tracked job and delegated model selection.

## Workspace and source

- Orca Run: `run_666e5ba6039d`.
- Worktree (separate working folder): `/Users/paulgiurin/orca/workspaces/dashboard/banner-editable-artwork`.
- Git branch (change history): `adme-dev/banner-editable-artwork`.
- Source authority: `adme-dev/dashboard`; the upstream template label in Orca is not the source repository.
- Historical source at job creation: HEAD `4111fb9b42b1463b42411a2ba5e4a1acaaf8a197` includes main `21b162c19eb1956c80dc2ab2ab4731ead7968bfd`.
- Earlier implementation is uncommitted and preserved. No new worktree is needed while workers have disjoint file ownership. Dirty parent remains untouched.

## Model selection and actual dispatches

The coordinator chose the following models under the user’s explicit delegation. Orca launch receipts confirm requested and effective model/effort match. All three dispatched tasks have now succeeded and their workers have been released. Model selection for development agents is separate from the application’s existing AI catalogue assignments.

| Role | Model / effort | Task | Dispatch | Ownership |
|---|---|---|---|---|
| Governing architecture and acceptance review | GPT-6 Astra / high | `task_370b23abc921` | `ctx_e6f0ca6d955d` | Review only; GOVERNING-REVIEW.md |
| Browser and QR scan verification | GPT-6.1 Sol / high | `task_bb2406fa4b63` | `ctx_e5039d269158` | Proof script and ignored evidence |
| Managed QR persistence/provenance implementation | GPT-6.1 Sol / high | `task_a666f1a7b9a9` | `ctx_2708e3b71437` | Server save validator, generated-asset attestation, focused tests |
| Integration and source ownership | Current coordinator | This session | — | Store/realtime/design-assistant guards, docs, final verification |

## Work tree

```text
Banner Studio editable retail artwork (Orca Run)
├── Existing local foundation
│   ├── Curated native lifestyle letter back and exact copy
│   ├── OpenAI concept proposal adapter and saved style recipes
│   └── Selected native/raster lettering preview, undo and persistence
├── Managed platform QR integration (current increment)
│   ├── Existing client QR selection and deterministic owned SVG
│   ├── Immutable code identity across AI/editor/save boundaries
│   └── Actual editor browser proof and decoded canonical short URL
├── Governing review and acceptance (current gate)
├── Scoped retail invitation edits (implementation and browser acceptance)
└── Live provider, four-side reconstruction and print gates (outstanding)
```

The retail-edit task `task_d013391fe298` completed its initial implementation through GPT-6.1 Sol high (`ctx_011bfb13885c`) and its worker was released. The coordinator owns subsequent review remediation. A second GPT-6.1 Sol high worker owns actual editor proof in task `task_64716378246a`, dispatch `ctx_6d8e21f19e78`. Both launch receipts confirm effective model and effort. See [RETAIL-IMPLEMENTATION.md](RETAIL-IMPLEMENTATION.md) for the native-layer scope, current source revisions and acceptance status. The complete flattened-source scenario is not yet delivered. Future workers must read [RETAIL-EDIT-SCENARIO.md](RETAIL-EDIT-SCENARIO.md), [V2-IMPLEMENTATION.md](V2-IMPLEMENTATION.md) and current handoff before acting.

## Gates and boundaries

- Managed QR means a registered same-client platform QR record, canonical platform redirect and existing analytics/destination owner. AI must not invent or redraw code pixels.
- Preview/apply/undo/save/reopen must preserve original unselected elements and protected commercial facts. Tests and browser fixtures do not prove live database/provider access.
- Governing findings must have an implementation owner and focused regression evidence before acceptance. File ownership is explicit; workers must not overwrite each other.
- No commit, merge, deployment, client publication, subscription purchase or live synthetic QR scan is authorised by this job setup. Preserve prior artifacts and updated supplied artwork.
- Missing live access, provider quality, automatic clean-background repair, durable jobs and print preflight remain explicit gates; see V2-IMPLEMENTATION.md.

## Settled implementation evidence

The browser/scan task succeeded and its worker was released after transcript capture. The persistence task succeeded with 138 focused tests and was released. Final coordinator regression passes 725 tests with 5 skipped across 93 passing and 4 skipped files. The actual editor fixture proves managed QR insertion, undo/reload and decoding, with no live provider/database/scan claim. The governing review accepted the bounded local implementation after 189 focused tests, and its worker was released; see [GOVERNING-REVIEW.md](GOVERNING-REVIEW.md), including the coordinator evidence addendum. The retail-invitation increment is under separate final browser/governing acceptance; job setup does not mark the complete PRD delivered.

Current retail source: HEAD `3d28afca8cb768e02b1cca68953b0ea92c4e0b6c`, reconciled main `3a837b45149b25f561558be65e1a89ca31bf4315`. Retail governing reviewer: GPT-6 Astra high, task `task_32b684814b47`, dispatch `ctx_65b0a85c9fed`; model and effort confirmed by launch receipt. See RETAIL-IMPLEMENTATION.md for remediation and final acceptance status.

## Retail increment settlement — 27 October

- Initial implementation: `task_d013391fe298` / `ctx_011bfb13885c`, succeeded/released. Coordinator subsequently repaired governing findings with regression evidence.
- Actual Nuxt proof: `task_64716378246a` / `ctx_6d8e21f19e78`, succeeded/released. Full workflow passes with 31 exact original text blocks, 120 unchanged protected hashes, 10 text blocks fitting, one undo/redo and six fixture saves; zero console/page/fixture errors.
- Governing acceptance: `task_32b684814b47` / `ctx_65b0a85c9fed`, succeeded/released. No remaining blocking source finding; 156 focused tests plus 25 after the final preview marker change. Scope and hashes recorded in RETAIL-REVIEW.md.
- Coordinator: 803 passing / 5 skipped broad regressions, source reconciliation, final browser evidence audit, scoped lint, Vue compilation, docs/card and runtime cleanup. Every worker transcript was archived before release; no active retail dispatch remains.

All work remains local/uncommitted. The native subset is accepted; the complete PRD remains open for automatic flat-source reconstruction, live provider/hosted acceptance and print gates. Review link: `output/editable-artwork-v2/retail-invitation/review.html`.

## Reconstruction jobs continuation — 27 October

See [JOB-RELIABILITY.md](JOB-RELIABILITY.md) for current source and model ownership. The server and UI Sol high tasks (`task_48fa0a4551bf`, `task_af6d08ca931d`) succeeded and were released. Astra high task `task_7e8f00f70e5c` accepted the bounded increment and succeeded; its worker was released with transcript archived. Coordinator evidence: 851 regressions passed / 5 skipped, actual Nuxt job-control/import/undo proof passed; real local PostgreSQL proof passed 14 cases. This is a bounded R12 increment, not automatic reconstruction or hosted asynchronous acceptance.

## Asynchronous job continuation — 27 October

The next increment is [ASYNC-JOBS.md](ASYNC-JOBS.md): server task `task_749e5ca6e1d4` / `ctx_7dd2c4134386`, reviewer task `task_eac2082bcfd1` / `ctx_1b04a4162242`, coordinator UI/browser/integration. Both workers inherit the configured Codex default; no explicit model/effort was requested or inferred. The source still includes the freshly fetched main. Existing approved local artifacts and dirty parent remain preserved.

Asynchronous increment settled: both server and independent review tasks succeeded and were released with archived transcripts. Root integration passed886 regressions/5 skipped and actual Nuxt queued-retry/cancellation/import/undo proof. Independent proof passed25 real PostgreSQL cases and122 focused tests; no blocking finding within local scope. Runtime cleanup completed. See ASYNC-JOBS-REVIEW.md for source hashes and the remaining hosted/durable-outbox/full-PRD gates.

## Interrupted dispatch recovery — 27 October

See [DISPATCH-RECOVERY.md](DISPATCH-RECOVERY.md). Server task `task_a196ddab326b` / `ctx_6976cff842ce` owns durable delivery intent and bounded queue recovery. Independent task `task_6087f0cf6953` / `ctx_1924e6a65b68` owns real PostgreSQL crash/race proof and review. Both use configured Codex defaults; model/effort identity is not present in launch receipts. Coordinator owns integration, docs and card. Fresh main is still included in HEAD; dirty implementation and parent remain preserved. This wave passed local acceptance: 914 coordinator regressions / 5 skipped, 43 actual PostgreSQL cases and 134 independent focused tests. These overlapping counts are not added. No hosted activation or deployment is requested. Worker settlement is recorded in DISPATCH-RECOVERY.md.


## 27 October: animation, alpha/masks and ArtCraft reference

Paul approved right-click Animate/Add Tween, then requested a second PNG alpha and mask check and supplied ArtCraft as an integration reference. See [animation workflow and evidence](ANIMATION-WORKFLOW.md) and [pinned ArtCraft/PhotoCraft source research](ARTCRAFT-RND.md). Changes remain local and uncommitted. Current source includes refreshed origin/main; the dirty parent remains preserved.

The coordinator regression passes 1,074 tests with 61 environment-gated skips across 118 files. Eleven explicitly enabled Chromium cases pass separately. Both actual Nuxt workflows now pass: flyer seven assertion groups with 124 unchanged unselected layers, and alpha/masks six groups covering normal/inverted rectangle and ellipse, undo, save/reload and both exporters. Source hashes match; independent review and worker settlement are recorded in ANIMATION-WORKFLOW.md. No deployment, live provider-quality proof or installed ArtCraft integration is claimed.
