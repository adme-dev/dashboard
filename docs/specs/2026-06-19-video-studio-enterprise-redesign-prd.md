# Video Studio Enterprise Redesign PRD

**Date:** 2026-06-19
**Status:** Draft implementation spec
**Owner:** Product/Engineering
**Feature area:** Creative > Video Studio
**Related docs:**
- `docs/superpowers/specs/2026-06-18-video-studio-unified-producer-prd.md`
- `docs/superpowers/handoffs/2026-06-18-video-studio-unified-producer-handoff.md`
- `docs/engagr-ai-media-studio-video-v1-roadmap.md`
- `docs/engagr-ai-media-studio-competitive-patterns.md`

## Objective

Redesign Video Studio from a collection of capable panels into a professional agency production workspace.

The target user is an agency operator, creative lead, or account manager building short-form client video from approved footage, stills, generated clips, voiceover, overlays, captions, and render outputs. The interface must feel like an enterprise editor: predictable, dense, governed, reviewable, and integrated with the agency platform.

Success means a user can open one Video Studio screen, find the right asset, inspect or prepare it, generate supporting media, assemble or adjust a timeline, render platform variants, and send/publish/save outputs without jumping between disconnected studios or scrolling through page-length tool sections.

## Current State

The platform already has the foundations:

- AV project editor with video, overlay, voiceover, and music lanes.
- Video Studio workbench shell.
- Multi-source asset library rail.
- AI video generation through Cloudflare AI Gateway, not MuAPI.
- AI Producer/asset-intelligence harness for masks, derivatives, bucketed assets, activity, and draft assembly.
- Voiceover generation through existing Cloudflare/Workers AI voice infrastructure.
- Banner Studio overlay integration.
- Caption metadata and VTT visibility.
- Render jobs panel with publish, portal, library, retry, and download affordances.
- Timeline editing, preview, version save, render status, and render queue.
- Creative sidebar entry for Video Studio.

The main gap is information architecture. Features exist, but too many concepts compete at once:

- Library, Assets, Project Assets, Buckets, Selected Asset, AI Producer workspace.
- Producer rail plus AI Producer harness plus render jobs plus voice/overlay composers.
- Long vertical tool sections that push the timeline out of the working view.
- Context-specific actions spread across left, center, right, and lower page regions.

## Product Principles

1. **Timeline is the destination**
   Every creation, preparation, producer, voice, overlay, caption, or render action should clearly lead to the timeline, reusable asset library, or review/export output.

2. **Inspector over panels**
   The right side should behave like a context-aware inspector. It should not be a dumping ground for unrelated tools.

3. **Assets are the source of truth**
   All footage, stills, generated clips, derivatives, voice, music, overlays, captions, and renders should be discoverable from one asset rail.

4. **AI is a production mode, not a separate workspace**
   AI Producer should be part of the editor workflow: brief, prepare, generate, assemble, review, render.

5. **Enterprise density**
   The UI should prioritize scanability, stable layout, compact controls, visible state, and repeat workflows over large explanatory cards.

6. **Governance is visible**
   Model availability, Cloudflare AI Gateway-only policy, provenance, license state, approval state, render status, and publish readiness should be visible in context.

7. **No MuAPI dependency**
   Model access goes through the platform-owned Cloudflare AI Gateway and approved provider rails.

## Target UX Model

Video Studio should be a four-mode editor:

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Page header: Video Studio / project state / save / versions          │
├─────────────────────────────────────────────────────────────────────┤
│ Workbench toolbar: add / generate / render formats / render          │
├───────────────┬─────────────────────────────────────┬───────────────┤
│ Assets        │ Preview + Timeline Context          │ Inspector     │
│               │                                     │               │
│ Search        │ Selected asset/clip/project state    │ Context tabs  │
│ Filters       │ Preview canvas                       │ Actions       │
│ Buckets       │ Generation/prepare state             │ Producer      │
│ Asset rows    │ Timeline-adjacent controls           │ Review        │
├───────────────┴─────────────────────────────────────┴───────────────┤
│ Render strip + timeline: video / overlay / voiceover / music         │
└─────────────────────────────────────────────────────────────────────┘
```

### Primary Modes

1. **Assets**
   - Focus: browsing, filtering, selecting, adding, inspecting source media.
   - Default visible left rail.
   - Filters live here, not in the producer workspace.

2. **Edit**
   - Focus: preview, selected asset or selected clip, timeline operations.
   - Shows selected asset panel, generation availability, assembly preview, and clip inspector when a clip is selected.

3. **Produce**
   - Focus: AI Producer, voiceover, overlays, captions, draft plan, recipes.
   - Lives primarily in the right inspector.
   - The AI Producer harness becomes a compact preparation module, not a page-length workspace.

4. **Review**
   - Focus: render jobs, versions, output variants, approvals, portal send, social publish, asset save, failure retry.
   - Render queue can appear as a strip when active and expand into Review.

## Feature Inventory To Preserve

### Assets

- Uploaded footage.
- Uploaded stills.
- AI-generated video clips.
- Render outputs.
- Audio Studio voiceover assets.
- Music/audio assets.
- Banner Studio overlays.
- Captions and VTT links.
- AI Producer derivatives:
  - mask-only assets
  - mask/lift derivatives
  - background removals
  - clean layers
  - asset intelligence outputs
- Project buckets:
  - generated
  - source
  - selected
  - prepared
  - render/export buckets where applicable
- Status states:
  - ready
  - queued
  - running
  - succeeded
  - failed
  - blocked
  - unavailable/unknown
- Asset metadata:
  - title
  - source
  - model/provider
  - prompt
  - transcript
  - aspect ratio
  - duration
  - captions
  - provenance
  - readiness for timeline

### Editor

- AV timeline lanes:
  - video
  - overlay
  - voiceover
  - music
- Add footage.
- Add overlay.
- Add generated video.
- Add voiceover.
- Add captions.
- Replace selected video clip.
- Add derivatives to timeline.
- Timeline play/scrub.
- Zoom controls.
- Fit timeline.
- Split where supported.
- Delete selected clip.
- Save version.
- Version history.
- Missing-source warning.
- Render status strip.

### Generation

- Cloudflare AI Gateway video generation.
- Image-to-video source asset generation.
- Model availability and unavailable states.
- Recent generation jobs.
- Prompt visibility.
- Aspect ratio controls.
- Active job counts.
- Failed/blocked state visibility.
- No MuAPI integration.

### AI Producer / Prepare

- Project asset buckets.
- Asset selection.
- Tool selector:
  - lift highlighted area
  - erase/fill
  - mask-only
  - layer decomposition
  - background removal
- Instruction prompt.
- Highlighter mask canvas.
- Brush size.
- Save mask.
- Clear mask.
- Available model display.
- Selected asset activity.
- Derivative reuse.
- Add derivative to timeline.
- AI activity stream.
- Draft assembly plan route.
- Producer recipes.
- Selected asset context.
- Build draft plan.
- Apply plan to timeline.

### Voice, Overlays, Captions

- Cloudflare/Workers AI voiceover generation.
- Voiceover title.
- Voiceover script.
- Use producer brief.
- Existing voiceover count.
- Add generated voiceover to timeline.
- Replace voiceover clip.
- Banner Studio overlay project search.
- Overlay format selection.
- Overlay start/duration.
- Add overlay.
- Replace selected overlay.
- Caption metadata visibility.
- Caption/VTT link.
- Caption generation remains a planned spike unless already enabled behind existing rails.

### Review, Render, Distribution

- Render selected formats:
  - reels_9x16
  - square_1x1
  - youtube_16x9
- Render jobs:
  - queued
  - running
  - done
  - failed
- Retry render.
- Failure details.
- Download variants.
- Save render to library.
- Send to portal.
- Publish/social handoff.
- Render queue strip.
- Latest render date/state.

## Information Architecture

### Left Rail: Assets

Purpose: find and select project media.

Required controls:

- Search.
- Type filters:
  - All
  - Footage
  - Stills
  - Generated
  - Derivatives
  - Voiceover
  - Music
  - Overlays
  - Captions
- Source filters:
  - All sources
  - Uploads
  - AI
  - Renders
  - Audio Studio
  - Banner Studio
  - Derivatives
- Status filters:
  - All status
  - Ready
  - Running
  - Failed
  - Blocked
  - Unknown
- Model and aspect ratio filters.
- Sort.
- Refresh assets.

Asset rows should show:

- Asset type icon.
- Title.
- Source/subtitle.
- Status badge.
- Small metadata chips.
- Fast actions:
  - preview
  - generate from asset
  - inspect
  - publish/share where applicable
  - add to timeline

### Center: Preview + Timeline Context

Purpose: show what is selected and how it affects the timeline.

States:

- No asset/clip selected:
  - Empty selected-state.
  - Model availability warning if generation unavailable.
  - Assembly preview placeholder.
- Asset selected:
  - Preview media.
  - Metadata.
  - Add to timeline.
  - Replace selected clip where valid.
  - Generate from asset.
  - Generate/add captions where valid.
  - Activity for selected asset.
- Clip selected:
  - Clip inspector.
  - Track, start, duration, source.
  - Replace, split/delete, captions, mute/lock where applicable.
- Producer preparation:
  - Compact prepare module only; no full-page vertical workspace.

### Right Rail: Inspector

Purpose: context-specific controls.

Inspector tabs:

- **Details**
  - Selected asset/clip/project info.
- **Produce**
  - AI Producer brief.
  - Recipes.
  - Draft plan readiness.
  - Voiceover.
  - Overlay.
  - Captions.
- **Review**
  - Render jobs.
  - Versions.
  - Portal/publish/library actions.

Rules:

- The right rail should have stable width.
- Long content scrolls inside the rail.
- The rail can collapse, but mode navigation must reopen it when needed.
- Do not place full-width producer workspaces below the main editor.

### Timeline

Purpose: the destination and source of truth for assembly.

Requirements:

- Render strip and timeline controls should be visible in the first working viewport on desktop.
- Timeline lanes remain below the workbench.
- Workbench panes scroll internally so long producer/asset content does not bury the timeline.
- Timeline should eventually support:
  - per-track hide/lock/mute
  - clip replacement
  - caption lane visibility
  - selected clip inspector binding
  - render readiness indicators per segment

### Timeline Track Affordance Plan

Track controls should be compact, lane-local, and predictable. They belong in the sticky track label column, not in a separate settings drawer, because operators need to scan state while trimming and moving clips.

#### Track Header Controls

Each timeline track header should support:

- **Mute**
  - Audio, voiceover, and music tracks: mutes playback/render contribution for the full track.
  - Video and overlay tracks: not shown unless we later support embedded source audio on video tracks separately.
  - State should render as a muted icon and reduced track opacity.

- **Hide**
  - Video, overlay, and caption tracks: hides preview/render contribution for the full track.
  - Audio-only tracks: not shown.
  - State should render as an eye-off icon and reduced clip contrast.

- **Lock**
  - All tracks: prevents move, trim, split, delete, replace, and add-to-track operations for that lane.
  - Locked tracks remain selectable for inspection, but edit actions should be disabled with clear button labels/tooltips.
  - State should render as a lock icon and disabled clip handles.

- **Solo** (later, optional)
  - Audio-family tracks only.
  - Useful for reviewing voice/music mix, but not required for the first implementation.

#### Clip-Level Inspector Rules

The selected clip inspector should read track affordance state from the parent track:

- If the track is locked, destructive actions are disabled.
- If an audio track is muted, gain controls remain visible but render/playback state is clearly marked as muted.
- If a visual track is hidden, replacement and timing controls remain visible, but preview-dependent actions should disclose that the track is hidden.

#### Auto-Ducking Rules

Auto-ducking should be governed at the music-track level:

- Default trigger: voiceover clips duck music tracks.
- First implementation should expose a simple per-music-track toggle, not per-clip automation curves.
- Ducking metadata should remain timeline-level (`ducking`) so render workers and preview stay aligned.
- Future inspector controls can expose duck amount and fade duration after the basic toggle is stable.

#### Caption Lane Rules

Caption tracks should behave as first-class timeline lanes:

- Caption lane visibility uses the same Hide affordance as visual tracks.
- Caption clips remain editable when hidden, but preview is suppressed.
- Caption style remains clip-level because campaign cuts can mix hook captions and subtitle-safe captions.
- If a caption clip references a VTT source, the selected clip inspector should keep the VTT link visible in Details.

#### Implementation Sequence

1. Extend timeline state types to support `hidden` and `locked` on tracks while preserving existing `muted`.
2. Add pure helpers for deriving track affordance state and determining whether an operation is allowed.
3. Update `MediaTimeline.client.vue` sticky track labels with icon buttons for supported affordances.
4. Gate move, trim, split, delete, replace, and add-to-track operations through the helper.
5. Surface locked/hidden/muted state inside `VideoStudioClipInspector`.
6. Add a later server/render check so hidden/muted tracks affect render output consistently.

#### Acceptance For Implementation

- Operators can see track state without opening a drawer.
- Locked tracks cannot be edited by drag, shortcut, toolbar, or inspector action.
- Hidden visual/caption tracks do not appear in preview/render once render support lands.
- Muted audio-family tracks do not contribute to playback/render.
- Caption style remains clip-level.
- Existing timelines without `hidden` or `locked` fields load with safe defaults.

## Visual Design Direction

Use a quiet, dense, enterprise SaaS aesthetic:

- Dark editor surface remains acceptable, but reduce large empty fields.
- Use Nuxt UI primitives consistently.
- Prefer link/segmented navigation over big pill blocks.
- Use icons for tools and actions.
- Use badges for counts/status only.
- Use compact grids and scan-friendly rows.
- Avoid nested card stacks inside card stacks.
- Avoid explanatory feature copy inside the editor except concise state/helper text.
- Keep headings operational:
  - Assets
  - Edit
  - Producer
  - Review
  - Render queue
  - Selected asset
  - Clip inspector
- Remove duplicate terms where possible.

## Technical Design

### Existing Components To Refactor

- `app/components/media/VideoStudioWorkbench.vue`
  - Becomes the stable shell for mode navigation, bounded panes, toolbar, and slots.

- `app/components/media/VideoStudioLibraryRail.vue`
  - Remains the asset rail.
  - Needs denser row treatment and clearer grouping.

- `app/components/media/VideoStudioSelectedAssetPanel.vue`
  - Becomes the center selected-context panel.
  - Should absorb more selected asset actions currently scattered elsewhere.

- `app/components/media/VideoStudioProducerRail.vue`
  - Becomes a subview of a new inspector, not the entire rail.

- `app/components/media/VideoStudioVoiceComposer.vue`
  - Moves under Produce inspector tab.

- `app/components/media/VideoStudioOverlayComposer.vue`
  - Moves under Produce inspector tab.

- `app/components/media/VideoStudioRenderJobsPanel.vue`
  - Moves under Review inspector tab or expandable render queue.

- `app/components/media/MediaAssetHarness.vue`
  - Split into smaller embeddable modules:
    - `VideoStudioPrepareAssetPanel`
    - `VideoStudioAssetActivityPanel`
    - optional full harness route/panel for advanced/debug use.

### New Components Proposed

- `VideoStudioInspector.vue`
  - Right rail shell.
  - Tabs: Details, Produce, Review.
  - Receives selected asset, selected clip, render jobs, producer state.

- `VideoStudioModeNav.vue`
  - Editor mode navigation:
    - Assets
    - Edit
    - Produce
    - Review

- `VideoStudioStatusBar.vue`
  - Compact state:
    - save state
    - asset count
    - render queue
    - model availability
    - selected format
    - warning counts

- `VideoStudioPrepareAssetPanel.vue`
  - Tool selector, instruction, mask canvas, derivatives, available models.

- `VideoStudioReviewPanel.vue`
  - Render jobs, versions, output actions, publish/portal/library.

### Data/State Boundaries

- Keep `useMediaProjectEditor` as the source for timeline state.
- Keep `useVideoStudioAssets` as the source for normalized asset aggregation.
- Keep video generation model policy in server-side registry/provider utilities.
- Do not introduce a new generation provider abstraction unless Cloudflare AI Gateway requires it.
- Avoid route/schema changes in the first redesign slice.

## Commands

Use these commands for implementation verification:

```bash
pnpm exec vitest run test/components/videoStudioWorkbench.test.ts test/components/videoStudioLibraryRail.test.ts test/components/videoStudioProducerRail.test.ts test/components/videoStudioSelectedAssetPanel.test.ts test/components/mediaAssetHarnessEmbedded.test.ts
pnpm exec vue-tsc --noEmit --pretty false --skipLibCheck
pnpm run build
pnpm exec nuxt dev --port 3100
```

Browser verification:

```text
http://localhost:3100/agency/audio/projects/bfa93ac8-fc95-412c-bae4-81307cb7ede4
```

Use dev login locally:

```text
/api/auth/dev-login
```

## Testing Strategy

### Component Tests

Required coverage:

- Workbench mode navigation renders correctly.
- Producer mode expands/reveals the inspector.
- Long producer content remains internally scrollable.
- Render queue remains visible above timeline.
- Asset filters still render and emit existing events.
- Producer, voice, overlay, render jobs continue to emit existing actions.

### Typecheck

Run `pnpm exec vue-tsc --noEmit --pretty false --skipLibCheck` after every UI slice.

### Browser QA

Verify at:

- Desktop 1440px+.
- Laptop-ish 1280px.
- Mobile 390px.

Manual flows:

- Open AV project.
- Confirm Creative > Video Studio link.
- Select asset from Assets rail.
- Add asset to timeline.
- Generate from selected asset where models are available.
- Generate voiceover from producer brief.
- Add Banner overlay.
- Build draft plan.
- Render formats.
- Retry failed render.
- Save render to library.
- Send to portal.
- Publish handoff.

## Boundaries

Always:

- Preserve existing AV timeline and render behavior.
- Keep Cloudflare AI Gateway as the generation path.
- Keep existing tests green.
- Keep audio-only projects unaffected.
- Preserve render job actions and publishing/portal/library affordances.
- Use Nuxt UI primitives where practical.
- Keep timeline visible or immediately accessible in the first working viewport.

Ask first:

- Database migrations.
- New dependencies.
- Provider/model registry changes.
- Enabling disabled models.
- Changing render queue/container bindings.
- Changing publish/social provider behavior.
- Removing any existing feature from the UI.

Never:

- Reintroduce MuAPI as a provider.
- Hide failures without an operator path to retry/details.
- Remove governance/model availability messaging.
- Let long AI/asset panels push the timeline far below the editor again.
- Commit secrets or environment files.

## Success Criteria

- The Video Studio first viewport reads as an integrated editor, not a dashboard of AI widgets.
- Desktop users can see the workbench and timeline controls in one working view.
- Asset filtering is clearly owned by the left rail.
- Producer/voice/overlay/render controls are consolidated into inspector/review flows.
- AI Producer is discoverable but no longer dominates the page layout.
- All existing shipped features remain reachable.
- Component tests and typecheck pass.
- Browser screenshots show no clipped controls, unusable text columns, or page-length producer gaps.

## Implementation Plan

### Phase 1: Shell and Navigation

- [x] Add stage navigation to current workbench.
- [x] Bound workbench height and pane scrolling so timeline remains visible.
- [x] Convert stage language to final modes: Assets, Edit, Produce, Review.
- [x] Add a compact status bar for model availability, render queue, save state, and selected formats.

### Phase 2: Inspector Consolidation

- [x] Create `VideoStudioInspector.vue`.
  - Acceptance: right rail has Details, Produce, Review tabs.
  - Verify: component test renders tab labels and active panel.
  - Files: new inspector component, workbench/page integration tests.

- [x] Move voiceover composer into Produce inspector.
  - Acceptance: voiceover generation remains usable and emits existing events.
  - Verify: existing voice composer test plus inspector integration test.
  - Files: `VideoStudioInspector.vue`, page integration.

- [x] Move overlay composer into Produce inspector.
  - Acceptance: overlay project search, format selection, start/duration, add/replace still work.
  - Verify: existing overlay composer tests plus inspector integration.
  - Files: `VideoStudioInspector.vue`, page integration.

- [x] Move AI Producer rail into Produce inspector.
  - Acceptance: recipes, brief, format, build plan, apply plan remain available.
  - Verify: producer rail test plus inspector integration.
  - Files: `VideoStudioInspector.vue`, `VideoStudioProducerRail.vue` if needed.

- [x] Move render jobs into Review inspector.
  - Acceptance: retry, publish, portal, library, download remain available.
  - Verify: render jobs panel tests and browser check.
  - Files: `VideoStudioInspector.vue`, `VideoStudioRenderJobsPanel.vue`.

- [x] Sync workbench mode navigation with inspector tabs.
  - Acceptance: Produce and Review modes open the matching inspector context; inspector tab clicks keep mode state aligned.
  - Verify: workbench and inspector component tests.
  - Files: `VideoStudioWorkbench.vue`, `VideoStudioInspector.vue`, page integration.

### Phase 3: Prepare/AI Harness Split

- [x] Extract `VideoStudioPrepareAssetPanel.vue` from embedded `MediaAssetHarness`.
  - Acceptance: tool selector, instruction, mask canvas, brush size, model list, derivatives remain usable.
  - Verify: new component test and existing harness test.
  - Files: new component, `MediaAssetHarness.vue`, page integration.

- [x] Extract `VideoStudioAssetActivityPanel.vue`.
  - Acceptance: selected asset activity and recent AI jobs show without full harness chrome.
  - Verify: new component test.
  - Files: new component, harness/page integration.

- [x] Keep full `MediaAssetHarness` available only as advanced/debug workspace if still required.
  - Acceptance: normal Video Studio no longer embeds the full harness as a long page section.
  - Verify: browser screenshot and test for absence of full harness chrome in main editor.
  - Implementation: normal Video Studio uses the `studio` variant; the default harness chrome remains available for advanced/debug use.

### Phase 4: Asset Rail Professionalization

- [x] Tighten asset row layout.
  - Acceptance: rows are denser, action icons align, long titles truncate predictably.
  - Verify: component test and browser screenshot.

- [x] Add consistent source/provenance/license/status chips.
  - Acceptance: source, model/provider, captions, timeline readiness and status are scannable.
  - Verify: asset normalization tests and component tests.

- [x] Add saved filter state where appropriate.
  - Acceptance: operator can keep common asset filters without fighting reset behavior.
  - Verify: component test or composable test.
  - Implementation: persist reusable category, source, status, and sort preferences; keep project-specific search/model/aspect/bucket filters ephemeral.

### Phase 5: Timeline/Review Integration

- [x] Add selected clip inspector binding.
  - Acceptance: selected timeline clip changes the center/right inspector context.
  - Verify: timeline editor component/composable tests.
  - Implementation: timeline clip selection clears asset selection, opens Edit mode, and renders the clip inspector in the workbench preview and inspector Details context.

- [x] Add track affordance plan.
  - Acceptance: spec/update for hide, lock, mute, auto-ducking, caption lane behavior.
  - Verify: design-only until implementation task.
  - Implementation: added `Timeline Track Affordance Plan` with track header controls, clip inspector rules, auto-ducking rules, caption lane rules, implementation order, and acceptance criteria.

- [ ] Improve render queue strip.
  - Acceptance: queue summary is compact, failed jobs expose details/retry, completed variants expose output actions.
  - Verify: render jobs panel tests and browser screenshot.

### Phase 6: Governance and Agency Polish

- [ ] Surface model availability and disabled states consistently.
  - Acceptance: unavailable models are shown as platform policy/account state, not broken UI.
  - Verify: component tests for unavailable state.

- [ ] Add provenance/licensing indicators.
  - Acceptance: generated, uploaded, render, audio, overlay, and derivative assets have clear provenance.
  - Verify: asset normalization and UI tests.

- [ ] Prepare approval/review hooks.
  - Acceptance: Review mode has a place for comments/approval state without implementing full approval workflow yet.
  - Verify: spec/task update.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Moving panels breaks existing event wiring | High | Move one composer at a time with focused component tests. |
| Inspector becomes another overloaded panel | Medium | Enforce Details/Produce/Review tabs and context rules. |
| Timeline visibility regresses | High | Keep layout guard tests for bounded workbench height and pane scrolling. |
| Existing full harness behavior is still needed | Medium | Preserve full harness as advanced/debug path while extracting normal editor modules. |
| Mobile editor becomes cramped | Medium | Use mode navigation to show one zone at a time on small screens. |
| Model unavailable states look like errors | Medium | Use explicit account/policy messaging for Cloudflare AI Gateway availability. |

## Open Questions

1. Should the final top-level modes be `Assets / Edit / Produce / Review`, or should `Review` remain a render queue strip only?
2. Should full AI Producer preparation stay available as an advanced drawer, or be fully decomposed into inspector modules?
3. Do we want approval comments in Video Studio now, or only a reserved Review placeholder?
4. Should ad-cleared/licensing badges be added in this redesign cycle or tracked as a separate asset governance phase?
5. Should transcript-driven editing and auto-ducking be included in this redesign loop or added after inspector consolidation?
