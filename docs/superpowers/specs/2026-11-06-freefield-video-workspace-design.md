# Freefield-inspired Video Studio workspace

Status: proceeding under user screenshot/go-fast instruction relayed by coordinator on6November2026; prior approval gate superseded for this scoped implementation. Existing storyboard production activation is a separate authorized operation. Repository location: `docs/superpowers/specs/2026-11-06-freefield-video-workspace-design.md`.

## Intent and decisions

Make the implemented video work discoverable: a visually rich project gallery, a clear creation flow, understandable model selection and a coherent storyboard-to-output workspace. Reuse XeroFlow projects, assets, tenancy, permissions, approval receipts, quotes and budgets. Never turn a catalogue entry into a claim that a model is operational. No inferred ComfyUI/GPU deployment, paid generation, fabricated thumbnails or replacement project database.

User requested Freefield style/UI and project/model/platform flow. Coordinator-approved implementation interpretation: “signing models” means selecting/assigning a supported model; connecting provider accounts is a separate administrator task. Approved implementation choices: gallery default with remembered list toggle; scoped real-image covers; a two-stage create flow; model assignment per generation request rather than an unimplemented project-wide default; existing routes retained. Persistent project-wide model defaults are outside this implementation.

## Source evidence and comparison

Dashboard inspected at `32556750e33ba9b7d1eab86829c27719bff303f3`. Freefield inspected at `e5fa71b8ae52db7f20aa76b5e6e56fc3adff2fca` in https://github.com/neuregex/freefield, including actual `ui-app.jpg`: dark canvas, approximately340px control rail, prominent media preview, History/Library/How-it-works tabs and related-output masonry. It is an application/workflow catalogue with per-app generation history, not a persisted multi-shot project system. Adopt its visual hierarchy and clear controls; do not import its backend, model availability assumptions or app-as-project semantics. Detailed pinned source paths and screenshot observations accompany this document in `freefield-research.md`.

Options considered: (A) minimally restyle the current table, fast but leaves workspace discovery weak; (B) retain canonical projects and add gallery/create/workspace presentation, recommended; (C) transplant Freefield's workflow execution platform, rejected because it introduces a separate runtime and data model outside user scope.

## Screens and interaction

### Project home

Keep `/agency/audio/projects?mediaType=av` as Video Studio home and `/agency/audio/projects/:id` as editor. Audio-only users retain their existing list and editor. At desktop width show page title, a concise count, search, client/status filters and New project, followed by gallery/list toggle. Gallery uses three columns when space permits, two on narrower desktop, one on mobile. Each card has a16:9 media area, title, client/Agency label, updated time and real draft/render state. Open is the primary action; duplicate/delete live in an explicit overflow menu, with existing confirmation and authority. Selection never creates or starts anything.

Cover precedence (new projection contract, not implemented today): most recent authorized completed video render's poster; otherwise a real project-linked image/still; otherwise a neutral icon/format card labeled “No preview yet”. No autoplay, random stock imagery, remote arbitrary URLs or invented output. The server resolves assets through existing tenancy/storage rules and returns short-lived authorized delivery URLs; do not persist expiring URLs. A bounded batch projection returns cover metadata with the list, avoiding one editor/timeline request per card. Failed and expired URLs fall back to the neutral card. No generation on list reads. V1 uses existing imagery only; background poster extraction is separate opt-in follow-up if there is no existing safe asset.

Search/filter and grid/list preference are local presentation over the authorized project result in the first phase; do not claim server pagination until implemented. Preserve the current mediaType query contract and scoped list behavior. Add explicit loading, empty filtered result, first-project and request-error states. Keyboard focus, visible titles and accessible actions must work without hover.

### Create project

Step1: title and client/Agency selection, video mode preselected from the route, followed by Create project. Step2 is the empty editor's setup surface: choose blank timeline, assemble existing assets, or storyboard from idea/approved script. These are entry modes, not three new kinds of project. Reuse `POST /api/agency/audio/projects` with `{title,clientId,mediaType:'av'}` and a stable idempotency key for a submission/retry. AV timeline defaults remain server-owned. No provider call, storyboard plan or auto-save beyond the explicitly confirmed project creation. If the response is ambiguous, reuse the same key; do not create a second project. Client selection is constrained by existing authorization and cannot grant tenancy access.

Target format and brief belong in editor setup after project creation unless a reviewed additive server contract is introduced. Do not silently add unsupported fields to the existing create payload. Canceling step1 creates nothing; closing step2 leaves the explicitly created empty project visible and resumable. Titles are optional today; the UI can suggest “Untitled video” without pretending it is saved until creation succeeds.

Use UModal/USlideover, UFormField, UInput, USelectMenu, UButton and UAlert. Read the repository-mandated frontend-design skill before implementation. All controls full-width in container-aware layouts; no raw browser dialogs/form fields.

### Project workspace

Keep the existing ProjectEditor and VideoStudioWorkbench rather than duplicate editors. Header: project/client, save status, undo/history and context-aware action. Central stage: preview and timeline; left rail: canonical assets and references; right rail: selected mode/shot controls. At narrow widths collapse the rails into explicit tabs/drawers; do not shrink the timeline and controls beyond usability. Respect agency layout's bounded scroll ownership (`min-h-0`, independent overflow region).

Primary modes: Assets, Edit, Produce, Review. Produce exposes Storyboard prominently, not inside an unrelated generator menu. Show a brief/script, target format, ordered shot cards and per-shot asset/model intentions. Existing copy approval, readiness findings, candidate diff and Apply-to-timeline confirmation remain mandatory. Editing a draft never silently mutates the committed timeline. Refresh recovers pending application receipts; ambiguous Apply continues existing recovery semantics. Review shows framing/copy/audio obligations and precise blocked reasons. Separate draft, applied, rendered and approved states; none imply another.

Use Freefield-like visual focus (large real preview, grouped compact controls, restrained accent, spacious media cards) within XeroFlow's semantic dark/light tokens and Nuxt UI. Keep agency navigation, Audio Studio and QR Codes reachable. No replacement branding or copying public example media into customer workspaces.

### Model picker and assignment

A model card shows real registry label/provider, modality, supported duration/aspect/resolution, native-audio support and conservative capability flags. Source is `server/utils/video-generation/modelRegistry.ts` plus `app/utils/video/modelPresentation.ts`; no hard-coded marketing capabilities. Filter by the current request and approved source requirements. Display estimated cost with units and distinguish it from an authoritative quote.

First-release audience is explicitly configured pilot tenants only (builder recommendation for user review), not all agency clients; broader rollout requires a separate tenant-policy implementation and acceptance. Operational states must be server-resolved per project: Available for this pilot; Requires administrator setup; Tenant policy disabled; Source/subject incompatible; Unsupported capability; Research only. Registry `defaultEnabled` alone is insufficient. Mock/internal/disabled entries never become selectable customer models. Choosing a model updates a local request draft; only a separate confirmed generation action can reserve budget/submit, using existing contracts. Do not persist a new project-level or per-shot model default in v1: the existing storyboard request/candidate pipeline must first support it. When unsupported, show an explicit handoff to the existing generation panel, not a decorative selector that silently does nothing.

The existing `models.get.ts` is feature-gated, checks project ownership and tenant policy, but its returned list is not complete provider-readiness proof. An additive read-only eligibility projection is required before the redesigned picker advertises “Available”: combine configured provider presence (booleans only), model surface/capabilities, tenant policy/allowlist and project source compatibility. Submission must still revalidate all authority. Never return credentials. Provider-account setup remains admin-owned and is not bundled into model selection.

### Outputs and run history

Use tabs/sections for project render jobs, generation jobs and saved versions; do not merge statuses into a fictitious universal job. Present thumbnail where real, format, timestamps, provider/model provenance, cost estimate/actual only if recorded, failed reason/retry eligibility and output actions. Map queued/running/succeeded/failed from generation separately from queued/rendering/done/failed rendering. History reads never replay a job. Retry requires the existing explicit submission/quote/approval rules and cannot be a GET action. Existing save-asset, portal and social actions retain their permissions and confirmation; no automatic publishing. Skeletons and empty states are not fake examples.

## Canonical implementation map

| Area | Existing owner | Contract / required delta |
|---|---|---|
| Gallery/create | `app/pages/agency/audio/projects/index.vue` | Existing GET/POST `/api/agency/audio/projects`; add bounded authorized cover projection, no new project store |
| Project identity | `MediaProject` in `app/types/index.ts`; `server/utils/audio/projects.ts` | id/clientId/createdBy/mediaType/status/currentTimelineId; currently no thumbnail field |
| Editor/timeline | `app/components/media/ProjectEditor.client.vue`; `useMediaProjectEditor.ts` | Existing GET project, PUT timeline CAS, saved versions; preserve dirty/recovery flow |
| Produce | `VideoStudioProducerRail.vue`, `VideoStudioStoryboard.vue`, `useVideoStoryboard.ts` | Idea/approved-script drafts, references, candidate/diff/apply and review; no inferred provider run |
| Storyboard API | `/api/agency/video/projects/:id/storyboard` and subroutes | GET read; plan/revisions/references/resolve/apply have distinct contracts/authority |
| Model catalogue | `/api/agency/video/generation/models?projectId=...` | Registry presentation exists; truthful operational eligibility projection is new work |
| Generation | `/api/agency/video/generation/jobs` and `jobs/:id` | Preserve source approval, policy, compliance, budget and enqueue boundaries |
| Render outputs | `/api/agency/audio/projects/:id/render-jobs`, `/renders/:jobId/:format` | Existing render job provenance and scoped delivery; no synthetic success |
| Versions | `/api/agency/audio/projects/:id/versions` | Keep version creation distinct from viewing history |

## Working versus unavailable inventory

- Existing and source-backed: canonical project list/create, AV/audio editor, assets/timeline, storyboard draft/candidate/approval/application contracts, render/generation job records, provider registry, scoped storage and authority checks. Live storyboard activation must be verified in the release receipt; implementation existence is not full acceptance.
- Current pilot verification: authenticated read-only smoke route `/agency/audio/projects/eae34a22-66c3-4146-860f-ca7f754bef28`; no customer mutation or provider submission authorized by this design.
- Video render/generation/harness flags were false in the pre-activation public config. Read-only discovery confirmed the existing server render/generation gates were already enabled; the coordinator authorized VIDEO_STUDIO_ENABLED=true and VIDEO_GENERATION_ENABLED=true at build time to mirror them. Existing nuxt.config.ts couples public asset-harness visibility to generation, so the activation also exposes the implemented preparation panel. No separate harness/provider binding changes, and research-only capabilities remain unpromoted. A 200 response listing five models and credential presence establish discovery, not successful provider execution.
- `loadTenantVideoGenerationPolicy` is fail-closed by default and currently supports an explicit test-tenant environment allowlist/cap; there is no DB-backed per-client policy. Do not present an administrator tenancy editor as implemented.
- Mock outputs, unsupported extension/end-frame/video-to-video capabilities and future R2/R3 research are not offered as real ready tools. R1 physical-device/provider/end-to-end acceptance remains separate from UI visibility.
- New work in this design: richer gallery/create presentation, authorized cover projection, truthful eligibility presentation, integrated history and polish. No new GPU execution infrastructure.

## Delivery phases and acceptance

1. **Inventory and contract fixtures.** Fresh origin/main branch; recheck active Banner work and flags. Record project/list/asset/model/job contracts and authorization tests. Add fixtures with genuinely absent covers and disabled eligibility, not production-looking invented results. Confirm no side-effectful reads.
2. **Project gallery/list.** Add shared project card and view preference, filtering, bounded cover projection and empty/error states. Verify cross-tenant cover denial, expired-image fallback, keyboard opening, no N+1 timeline fetches and audio route preservation. No destructive action on card click.
3. **Create flow.** Add Nuxt UI forms and resumable setup surface using existing POST. Test duplicate-click/ambiguous-response idempotency, forbidden client, cancel-before-create, AV server seed and failed creation recovery. Run frontend-design review before forms.
4. **Model eligibility and selection.** Reuse the existing server model-eligibility response with honest disabled reasons; preserve submission-time guards. Verify mock/internal exclusion, tenant disabled, missing provider, source/subject mismatch, unsupported parameters and budget/quote races. Test selecting a model causes zero provider submissions.
5. **Storyboard/workspace and history.** Integrate real shot/reference/approval states, candidate diff, apply recovery and distinct render/generation histories. Verify saved work survives refresh, conflicts remain explicit, no silent Apply or job retry and format/copy/framing obligations persist.
6. **Pilot acceptance and release.** Read-only navigation first, then separately authorized disposable pilot writes and paid runs if requested. Capture desktop/narrow-screen/keyboard and actual device evidence where required; no fabricated R1 completion. Update accurate public marketing availability. Use current-main source guard, relevant tests and CI, 10GiB build ceiling, `pnpm deploy:check` then `pnpm deploy:production`; verify exact provider source/deployment/flags and preserve backups before owned cleanup.

## Developer setup and handoff

Use Node24.18.0 and pinned pnpm/lockfile. Read AGENTS.md plus relevant deployment/frontend skills. Source checkout must be clean/current before release; use a separate short-lived branch for implementation. On space-constrained hosts use an isolated authorized external build directory; never reuse/delete another worker's held runtime. `workers/audio-jobs` has standalone dependencies and its deployment runbook; UI changes do not imply redeploying all workers. Do not run shared installs/builds concurrently. Runtime secrets are read from approved local/service configuration, never copied into docs.

Flags: the shared storyboard policy defaults on when VIDEO_STORYBOARD_ENABLED is absent; literal true enables it and explicit false/malformed values disable it. Cloudflare bindings take precedence over process fallback. The public flag is baked at build time, so a runtime false override disables server edits immediately but hiding the entry requires rebuilding. Preserve SEARCH_AUTHORITY_ENABLED=true. Build VIDEO_STUDIO_ENABLED=true and VIDEO_GENERATION_ENABLED=true as authorized to mirror verified existing server gates; do not add redundant production bindings. The public asset-harness flag also becomes true through the existing generation OR condition; no separate harness binding or tenant cap is changed. Use the release receipt for actual deployed state.

A new developer should first reproduce the smoke editor without mutating it, inspect existing tests under `test/video`, `test/server/api/videoStoryboard*` and relevant media/model tests, then implement one phase with isolated fixtures. Proposed migrations/fields require explicit additive contracts and normal migration verification. Keep source existence, local tests, CI, deployed flag/source, authenticated workflow and paid provider acceptance as separate evidence.

## Review gate

Coordinator accepted the detailed design plus five user screenshots and instructed implementation without further brainstorming. The implementation plan sequences an independently released activation fix before UI integration. The coordinator authorized request-level model selection; provider account setup and persistent project-wide defaults remain separate work. Implementation now proceeds with Kimi K3.1 Pro on disjoint gallery/form files and Codex integration/backend/review; no paid generation is authorized.

## Independent builder check

A fresh reviewer identified two material planning questions: request-level versus persisted project/shot model assignment, and named pilots versus agency-wide runnable access. Storyboard visibility follows existing authenticated project authorization; runnable generation remains limited by the existing tenant policy and cap. No new audience allowlist or administrative policy editor is introduced. Assignment defaults to request-level selection; coordinator authorized this default without another approval round. Persistent assignment would add schema, inheritance and compatibility work and must be reflected in a revised full design. No other blocking planning question was reported.
