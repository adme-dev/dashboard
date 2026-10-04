# Banner Studio reliability and conversational creation

User-approved scope (4 October 2026): document and implement the improvements proposed after the DriveAgent Facebook animation test. Retain manual editing and the existing client approval/publishing boundary.

## Outcomes and design

An optional Create with AI panel understands the current client, brand context, artwork and user's brief. It proposes native layer edits, shows a playable preview, supports follow-up prompts, applies changes as one undoable action and can prepare social formats for the existing MP4 → social draft → approval → Planner flow. Automatic model selection is the default; advanced options expose supported configured models. Image generation remains in the existing image tool with its estimate/confirmation flow; ordinary layout changes do not regenerate raster artwork. No automatic publication merely from asking for a design.

Native structured editing is chosen over generated executable HTML for the visual editor. The existing custom HTML assistant remains available for custom templates. Asset choices must stay within the current project's/client's authorized context. Validate model output, reject stale proposals, preserve locked layers unless specifically opted in, and never execute model-supplied code.

## Work packages

1. Reliability: preserve text newlines in HTML/static/video exports; fresh project reads; retain dirty state when changes occur during save; reset project history on project switch. Tests reproduce regressions.
2. Rendering: persistent job list and refresh while exports are pending; truthful stage/completion counts instead of invented percent; recover across modal close/reopen; no five-minute false failure; no duplicate export after polling timeout. Neutral social-format labels and export-specific validation.
3. Native AI proposal API: authenticated client-scoped project/brand/asset context; bounded prompt/history; automatic model routing and explicit supported options; validated native edits and format variants; readable explanation; provider failures preserve original. Tests cover malformed outputs, foreign assets, locked layers and unsupported operations.
4. Chat UI: optional panel with prompt, brief/context, quick actions, model control, proposal preview, Apply/Discard/Undo, stale-state protection and persistent session conversation per project. Reuse image generation and MP4/social-draft tools. All controls use Nuxt UI with labelled full-width fields and responsive containment.
5. Publishing handoff: proposed caption and schedule are handed to the normal composer for review. Account is client scoped; normal approval and scheduling remain mandatory. Existing scheduled November post must remain unchanged.
6. Documentation/release: update feature documentation, usage guide, discovery ledger and verification results. Focused regression/component tests, production build, review, Safari proof on a separate example and guarded deployment. No immediate Facebook publication in this implementation task.

## Acceptance

- Multiline text visually matches editor and rendered export.
- Reload reads latest saved project; save-in-flight edits remain dirty.
- Pending MP4 jobs remain visible and recoverable; completed jobs can create deduplicated social drafts.
- User can request a headline/layout/animation change, inspect a preview, apply and undo; invalid/stale output never changes the original.
- User can request matching square/portrait/story variants using native layers.
- Client brand context is present without trusting a client ID supplied independently of the project.
- Image/video generation options identify the provider/model and any available estimate; no fabricated prices.
- Handoff retains provenance and client while leaving publication under normal approvals.

## Existing completed foundations

MRec initial scale verified at 100%. Signed video asset delivery fixed in 7f781f381 (deployment 50e6ab45). MP4 social draft handoff already tested end to end with DriveAgent post 5ded46fd-4b92-4f00-8097-aee84476c79e scheduled for 4 November 2026 at 10:00 Melbourne.

## Execution record

- Base: current rollout worktree, source 7f781f381, freshly fetched origin/main 8c8a5b5c4b6ccb6a17dc7a9405169ac4bc671f0e; 71 ahead, zero behind. Retain prior unmerged rollout work.
- Work is authorized by the user's explicit request to implement the proposed scope; do not add repeated design permission gates.
- Repository-referenced frontend-design skill path is absent after searching both installed skill roots; available frontend-ui-engineering guidance and mandatory Nuxt UI conventions apply.

## Implemented changes and review

- Native AI API and panel, preview/refinement/apply/undo, client-scoped brand/assets, social variants, automatic/fast/quality routing.
- Save serialization and dirty-state race fixes; artboard-aware undo; project history isolation.
- Export newline and line-height parity, fresh project reads, recoverable MP4 job status and selected-format blocking.
- Recraft V4.1 image UI with current supported controls, generation-only estimate, quality-review enforcement and project/client response guards.
- Caption/timing handoff to deduplicated drafts, scoped to project/client/render within the current browser-tab session; scheduling still requires an exact reviewed date/time.
- Independent review identified five integration bugs. Fixed supported cubic-Bezier validation, lost render suggestions, same-project client-switch invalidation, unsaved-image null identity and orphaned queued-job recovery.
- Recovery now uses same-job retries with atomic reservations and worker claims. Deploy the audio queue worker before Pages. Active rendering leases remain protected. Expired leases can be recovered with fencing so an old attempt cannot overwrite a newer result.
- Updated public feature pages/navigation and docs/guides/banner-studio-ai-workflow.md.

## Verification / release

- Initial combined implementation: 150 tests passed across 25 files.
- Root save/image/draft regressions: 24 tests passed across 3 files.
- Recovery and audio pipeline: 482 tests passed across 71 files.
- New and focused modified files pass ESLint. Repository-wide lint has tens of thousands of pre-existing findings; no repository-wide clean claim.
- Combined regression run: 522 tests passed across 76 files before the final abandoned-lease fix.
- Production build, guarded release and Safari verification completed; see final release record below.

- Release review approved fenced render recovery at eba4fb50d: 503 banner/audio tests pass, plus exact SQL verified against isolated PostgreSQL.
- Build assessment exceeded raw budget by 9,613 bytes. Extended existing lossless string compaction to bound SQL literals and static AI instructions across generated server chunks; budget unchanged. Exact-content and actual workerd/postbuild tests: 16 passing. Assessment estimates 45 KB saved.
- Removed only this worktree's generated .nuxt files after local ENOSPC, then regenerated configuration.


## Final release and live verification — 4 October 2026

- Native rendering worker deployed version95d45f5f-0f15-4d26-bad8-9da2b6bf2208 before Pages.
- Final web source b03f7a39d; guarded production deployment https://0a8108d9.agency-dashboard-6cm.pages.dev (app.xeroflow.io). Raw25,423,952/25,468,928 bytes; gzip6,944,638/9,750,000. Limits unchanged.
- Combined regression:82files,592tests passed. Scoped lint passed after callback-format correction. Independent backend/model review123tests; UI review18tests. No remaining material findings in those reviews.
- Added project/client-scoped image references and private TXT/Markdown guide manifests; direct native bucket access, actual image vision analysis, finite upload limits and stale-response guards. Existing client brand/profile context confirmed in successful proposal.
- Live Groq provider returned404 for legacy Llama70B. Account catalog verified GPT OSS120B/20B; native design now has its own managed assignment. Auto/Quality use120B with20B fallback; Fast20B. Other feature assignments unchanged.
- Safari uploaded campaign-visual-guide.md (6,524characters) and driveagent-customer-profiles-square.png; actual LLaVA analysis became ready. GPT OSS120B successfully returned an editable proposal including both references and saved DriveAgent kit/profile context.
- Safari Apply/Undo/reapply verified. Saved QA project9accbca3-321f-4de4-b416-28d8310917d9 has headline Connected teams. / Better outcomes.
- Prepare social export saved and opened MP4; renderd28bd149-5b1e-4e09-ad5d-4fe2906f9fb1 completed and played in Safari. Create social draft produceda63650c7-6b2a-4b44-924b-637f18a3a59b with the suggested caption and correct DriveAgent client. Database confirmed draft, no scheduled/published timestamp.
- Existing November post5ded46fd-4b92-4f00-8097-aee84476c79e remained scheduled4November10:00Melbourne. No QA content publicly published.
- Known limits: PDF extraction unsupported; image analysis is visual inspiration, not exact editable-layer extraction. Session selections persist within the browser tab, not a cross-device attachment library. New example is a300×250verification render, not a portrait campaign delivery.
