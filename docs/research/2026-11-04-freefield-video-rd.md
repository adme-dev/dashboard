# Freefield — Video Studio R&D review

**Reviewed:** 4 November 2026

**Status:** Source review and proposed tasks; no implementation or GPU evaluation performed

**External revision:** [`neuregex/freefield@e5fa71b`](https://github.com/neuregex/freefield/tree/e5fa71b8ae52db7f20aa76b5e6e56fc3adff2fca)

**Our source baseline:** `c39b8b7f4a79f73350e2a1c4620075f87881a6c5`

**Related:** [Storyboard PRD](../superpowers/specs/2026-11-04-video-storyboard-producer-prd.md), [implementation task list](../superpowers/plans/2026-11-04-video-storyboard-producer.md), [competitive R&D index](../engagr-ai-media-studio-competitive-patterns.md).

## Recommendation

Use Freefield's recipe, example, comparison and run-evidence patterns to improve our existing editor. Keep the OneMinute-Film-inspired storyboard as the organizing workflow. Freefield is primarily a catalogue of model workflows and media tools, rather than a replacement for our timeline, project approvals or renderer.

Adopt a small recipe catalogue with validated controls, examples that prefill a draft, clear handoffs between eligible tools, synchronized take comparison, reliable output selection and evidence-backed quality review. Research video matting, upscaling and generative reframing separately. No new ComfyUI, Modal or self-hosted GPU runtime is selected by this review.

## What was actually reviewed

Inspected the README, MIT licence, app schema, registry, runner, history/progress/output handling, guard, representative manifests/workflows, web workspace/viewer/comparison code, lab notes/publisher, example index, tests and CI configuration. Viewed the bundled workspace screenshot; this was not a live browser test. Did not install dependencies, run automated suites, download model weights or execute GPU jobs. Repository run results below are the author's reports, not our independently reproduced results.

An independent parse of `apps/*/app.json` found **120 manifests: 119 ready, one draft; 70 image, 45 video, two audio and three utility**. These are manifest categories, not 120 distinct models or independently proven capabilities. Many apps are presets over shared workflows. Registry readiness checks establish graph/input compatibility; they do not establish commercial eligibility or output quality.

## Best improvements for our editor

| Priority | Freefield pattern and evidence | Adaptation for XeroFlow | Planned owner |
|---|---|---|---|
| Adopt | Typed manifests declare controls, presets, inputs, output roles and model dependencies. Registry checks detect unbound inputs, missing defaults and invalid graph bindings. [Schema](https://github.com/neuregex/freefield/blob/e5fa71b8ae52db7f20aa76b5e6e56fc3adff2fca/schema/app.schema.json), [registry](https://github.com/neuregex/freefield/blob/e5fa71b8ae52db7f20aa76b5e6e56fc3adff2fca/server/registry.ts) | Version our existing producer recipes with Zod validation, format/duration constraints, reference slots and semantic controls. Every exposed control must reach the plan/provider request or explain why it is unsupported. Resolve execution eligibility through existing server model/action policy. | R1 T01/T04; R2 T11 |
| Adopt | Workspace shows a finished example, its settings and a load-example action. Examples include run identity, inputs, actual seed, timing and hardware metadata. [Workspace](https://github.com/neuregex/freefield/blob/e5fa71b8ae52db7f20aa76b5e6e56fc3adff2fca/web/js/workspace.js), [example index](https://github.com/neuregex/freefield/blob/e5fa71b8ae52db7f20aa76b5e6e56fc3adff2fca/web/examples/index.json) | Curate our own authorized dealer offer/product/brand examples. “Use example” prefills a local draft without invoking AI, spending or replacing an edit. Pin recipe/evaluation revisions; revalidate assets and obtain a fresh quote before production. Never import another client's inputs or third-party showcase assets by default. | R1 T07/T09; R2 T12 |
| Adopt | “Use in…” finds another tool with a compatible image/video input. [Workspace handoff](https://github.com/neuregex/freefield/blob/e5fa71b8ae52db7f20aa76b5e6e56fc3adff2fca/web/js/workspace.js) | Offer “Use in shot” and eligible existing asset actions using canonical IDs and explicit input roles. Server checks tenancy, approval and provider capabilities again. Preserve lineage and return to the source shot. A handoff only prepares the next action; it cannot submit paid work or replace a timeline clip. | R2 T12; wider tool chaining remains backlog |
| Adopt | Image side-by-side/wipe and video comparison with shared transport. [Compare UI](https://github.com/neuregex/freefield/blob/e5fa71b8ae52db7f20aa76b5e6e56fc3adff2fca/web/js/compare.js) | Compare source versus result or two takes. Use common elapsed seconds, shared seek/play and an explicit audio selector. Show duration/resolution differences, freeze the shorter take at its end and avoid independent loops that hide drift. Keep previous/rejected takes inspectable. | R2 T12 |
| Adopt | Runner resolves defaults and random seeds before recording history; history distinguishes execution and total latency. [Runner](https://github.com/neuregex/freefield/blob/e5fa71b8ae52db7f20aa76b5e6e56fc3adff2fca/server/runner.ts), [history](https://github.com/neuregex/freefield/blob/e5fa71b8ae52db7f20aa76b5e6e56fc3adff2fca/server/history.ts) | Protected run record: recipe/model revision when supplied, normalized request, input hashes, actual seed when supported/reported, provider identity, cost and stage timestamps. Separate queue, provider and finalization time. Recreate means a new reviewed request, not guaranteed identical output or a free reroll. | R2 T10/T11 |
| Adopt with correction | Declared output nodes/order prevent presenting a warp guide or input clip as the result. History still falls back to arbitrary outputs when no expected node appears. [History output selection](https://github.com/neuregex/freefield/blob/e5fa71b8ae52db7f20aa76b5e6e56fc3adff2fca/server/history.ts) | Explicit final/preview/reference/matte/diagnostic roles. Missing required final output blocks selection. Probe media, do not trust extension or provider type alone. Finalization must be idempotent; success requires a saved canonical, measured artifact. | R2 T11 |
| Adopt | Lab notes preserve weak and failed semantic results even when execution succeeded. [Run notes](https://github.com/neuregex/freefield/blob/e5fa71b8ae52db7f20aa76b5e6e56fc3adff2fca/docs/lab-runs.md) | Separate runnable, eligible, evaluated and human-approved states. A small versioned fixture set reviews whole clips, product fidelity, motion, audio and actual exported copy. An example from a previous model/recipe revision does not certify the current one. | R1 T09; R2 T12 |

## Product direction learned from the failures

The repository's [lab notes](https://github.com/neuregex/freefield/blob/e5fa71b8ae52db7f20aa76b5e6e56fc3adff2fca/docs/lab-runs.md) are more useful than a large effects menu:

- Camera-gear terminology sometimes caused a film camera to appear in the image. Use visual descriptions such as shallow depth of field or warm backlight. Distinguish **prompt guidance** from a provider-enforced control.
- One dolly move worked in a reported cinema case; multiple ordered moves were ignored or reversed. Default to one primary movement per shot. Split complex movement into reviewed shots; do not promise choreography from a multi-select prompt.
- Prompt enhancement helped a cinematic face case but the authors preferred it off for product-ad fixtures. Keep enhancement recipe-specific and explicit. Show the proposed change before submission, and never rewrite approved copy or product facts.
- First-frame stylization did not guarantee style held through the video. Review the full duration, including start/middle/end and transitions, rather than accepting a thumbnail.
- Generated brand marks appeared despite generic/unbranded directions. Real source images, provenance and a preservation prompt cannot certify exact OEM identity. Inspect badging, grille, wheels, proportions and offer text; required logos/copy stay in deterministic overlays.
- A technically completed reshoot exposed a guide artifact as the result. Define output roles before adding multi-output operations.

These observations are bounded examples from the reviewed revision. They do not prove universal behavior of a model or that our current providers share the same failure rates.

## Existing foundations and integration gaps

| Our current source | What to retain / extend |
|---|---|
| `app/utils/video/producerRecipes.ts` | Existing lightweight recipe catalogue; add versioned validated definitions and preserve legacy consumers. Do not create a disconnected catalogue. |
| `app/utils/video/generationTemplates.ts` | Existing prompt presets; reuse useful language while exposing which controls are merely prompt suggestions. Preservation language is not a fidelity guarantee. |
| `server/utils/video-generation/modelRegistry.ts` | Authority for supported mode, duration, aspect, source approval and pricing. Conservative extension/end-frame/video-to-video capabilities must remain off unless independently supported. |
| `server/utils/video-asset-intelligence/registry.ts` | Reuse existing action gating. Image removal/segmentation entries and future video-mask comments do not establish shipping video matting. |
| `server/utils/video-generation/finalize.ts` | Existing R2/asset finalization path. Source comments acknowledge whole-output buffering and a duplicate-asset race between webhook and reconciliation. T11 must address bounded storage/probing and exactly-once canonical asset creation before more demanding production outputs. |
| `server/utils/audio/videoCompositeGraph.ts`, `workers/audio-jobs/` | Preserve current fit/fill/crop, overlays and media container. Generative outpainting is a distinct optional transformation, not an automatic replacement for ordinary resizing. |

Use Nuxt UI v4 and the existing editor inspector/review surfaces. Do not reproduce Freefield's standalone raw-HTML application or its local file-based history as our persistence layer. Tenant/project rules, current rights evidence, source approval, budget reservations and final rendering remain owned by our established services.

## Separate research backlog

All items below are **unstarted investigations**, not R1/R2/R3 delivery dependencies. Read current provider/model terms and capabilities when a spike starts; record exact model/weight revisions, relevant terms and source evidence. A manifest's licence string is not a legal determination. Any paid evaluation needs a bounded authorized allowance. If no eligible existing provider exists, return a capability gap; a new GPU/backend decision requires a separate proposal.

| ID / priority | Research task | Source inspiration | Exit evidence before promotion |
|---|---|---|---|
| FF-RD01 / first | Video background removal / reusable matte for product and presenter clips | [`video-remove-bg`](https://github.com/neuregex/freefield/blob/e5fa71b8ae52db7f20aa76b5e6e56fc3adff2fca/apps/video-remove-bg/app.json) | Approved capability/terms; full-clip hair, glass, spokes and motion-edge fixtures; frame/duration/audio synchronization; explicit matte/alpha format that the renderer can consume. A cutout MP4 is not necessarily transparent. Preserve source and measured before/after comparison. |
| FF-RD02 / first | Controlled video upscaling for low-resolution approved footage | [`upscale-video`](https://github.com/neuregex/freefield/blob/e5fa71b8ae52db7f20aa76b5e6e56fc3adff2fca/apps/upscale-video/app.json) | Compare against existing resize baseline at equal output size; inspect detail hallucination, logos, text, flicker and skin; measure cost, latency, memory and render compatibility. Source remains available; never automatically replace it. |
| FF-RD03 / next | Optional format expansion for portrait/square/landscape reuse | [`reframe`](https://github.com/neuregex/freefield/blob/e5fa71b8ae52db7f20aa76b5e6e56fc3adff2fca/apps/reframe/app.json) | Compare fit/fill/crop baseline with generative outpaint; preserve subject geometry, test moving camera and borders over the entire clip; compose exact-copy overlays afterwards. Explicit review of newly invented surroundings; unchanged fallback remains available. |
| FF-RD04 / later | Structured reference-sheet preview and style consistency | [`genjutsu`](https://github.com/neuregex/freefield/blob/e5fa71b8ae52db7f20aa76b5e6e56fc3adff2fca/apps/genjutsu/app.json), [`mixed-media`](https://github.com/neuregex/freefield/blob/e5fa71b8ae52db7f20aa76b5e6e56fc3adff2fca/apps/mixed-media/app.json) | Preserve original role/asset IDs and review the constructed sheet; verify provider actually consumes references; full-duration consistency and identity review. Prefer artistic brand content over accuracy-critical vehicle material. |
| FF-RD05 / later, constrained | Reference camera motion / reshoot feasibility | [`camera-copy`](https://github.com/neuregex/freefield/blob/e5fa71b8ae52db7f20aa76b5e6e56fc3adff2fca/apps/camera-copy/app.json), [`reshoot`](https://github.com/neuregex/freefield/blob/e5fa71b8ae52db7f20aa76b5e6e56fc3adff2fca/apps/reshoot/app.json) | Establish a commercially eligible supported alternative before product promotion. The reviewed camera-copy manifest labels a dependency research/non-commercial; reshoot lists an unstated weight licence. Then compare requested versus observed motion and geometry with human review. |

Task checklist for the research owner:

- [ ] FF-RD01: capability/terms discovery, bounded matte fixture evaluation and renderer compatibility decision.
- [ ] FF-RD02: baseline versus upscale evaluation and cost/quality go/no-go.
- [ ] FF-RD03: crop versus outpaint evaluation and product-preservation go/no-go.
- [ ] FF-RD04: reference-sheet/style feasibility with provenance and temporal-quality evidence.
- [ ] FF-RD05: licence/capability feasibility first; only then consider bounded motion evaluation.

Each result records source/provider revisions, input ownership, budget, output hashes, execution results, semantic failures and a promote/defer/reject decision. No checked box merely because an app exists upstream.

## Explicit deferrals and cautions

- **Self-hosted ComfyUI/Modal:** no new backend selected. Freefield's Node/ComfyUI/GPU environment, local disk history and optional shared-passcode guard are not our multi-tenant Cloudflare architecture. Large models have real GPU, storage and operational costs; open-source does not mean cost-free generation.
- **HDR:** [`sdr-hdr`](https://github.com/neuregex/freefield/blob/e5fa71b8ae52db7f20aa76b5e6e56fc3adff2fca/apps/sdr-hdr/app.json) illustrates separate preview/master output roles, but 10-bit HLG delivery needs a separate color-management/export design and playback verification. It is not part of this plan.
- **Arbitrary workflow import:** Freefield's [import helper](https://github.com/neuregex/freefield/blob/e5fa71b8ae52db7f20aa76b5e6e56fc3adff2fca/docs/import-workflow.md) creates drafts with inferred controls and unresolved details. Do not accept customer-supplied executable graphs or custom nodes through the recipe catalogue.
- **Face swaps, identity replacement and voice cloning:** not introduced by this research. They do not address the immediate storyboard/editing priorities.
- **Commercial reuse:** repository [code is MIT-licensed](https://github.com/neuregex/freefield/blob/e5fa71b8ae52db7f20aa76b5e6e56fc3adff2fca/LICENSE). Model weights, custom nodes, input media and outputs require their own applicable terms/approval. No code or showcase asset was copied into our application.
- **Evidence freshness:** the [example publisher](https://github.com/neuregex/freefield/blob/e5fa71b8ae52db7f20aa76b5e6e56fc3adff2fca/lab/publish.py) can preserve older showcases and clear an old quality mark after replacement. Our new/replaced output starts unreviewed; previous acceptance never transfers automatically.

## Delivery mapping

The linked PRD/task list keeps the original three releases and fourteen tasks. R1 gains a validated recipe definition and safe example-prefill behavior (A13). R2 gains protected run records, explicit output/finalization semantics (A14) and synchronized comparison plus semantic evaluation evidence (A15). The five research spikes above remain independent; none enables a provider, spends money, changes a licence decision or advertises a feature as shipped.
