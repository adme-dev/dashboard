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
- Recovery now uses same-job retries with atomic reservations and worker claims. Deploy the audio queue worker before Pages. Running jobs are never automatically reset.
- Updated public feature pages/navigation and docs/guides/banner-studio-ai-workflow.md.

## Verification / release

- Initial combined implementation: 150 tests passed across 25 files.
- Root save/image/draft regressions: 24 tests passed across 3 files.
- Recovery and audio pipeline: 482 tests passed across 71 files.
- New and focused modified files pass ESLint. Repository-wide lint has tens of thousands of pre-existing findings; no repository-wide clean claim.
- Final combined test run, production build, guarded release and Safari verification: pending.
