# Video Studio Views Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. Steps use checkbox syntax.

**Goal:** Make Storyboard and preview usable when switching Video Studio views.
**Architecture:** Reuse the tabbed workspace, keep stateful panes mounted, give each pane scrolling and fit the preview into the measured workspace.
**Tech Stack:** Nuxt 4, Vue 3, Nuxt UI v4, Vitest/happy-dom.
**Spec:** docs/superpowers/specs/2026-11-20-video-studio-views-design.md

## Global Constraints

- Preserve drafts, selected shots, playhead and selected clips across view switches.
- No navigation-triggered mutations or generation/render actions.
- Nuxt UI v4 controls; independent bounded scrolling; no form-field changes.
- Keep renderer release separate and preserve unrelated work.

## Review Focus

- Opening Storyboard from mobile and collapsed inspector must reveal the main pane.
- Preview/Storyboard mounts and local state survive Library/History round trips.
- Small workspace heights and landscape previews preserve aspect ratio and fit.
- Workspace navigation must not leave the mobile main pane hidden.
- Switching panes does not emit render, apply or generation events.

## Task 1: Workspace navigation and state

Files: app/components/media/VideoStudioWorkbench.vue, ProjectEditor.client.vue;
test/components/videoStudioWorkbench.test.ts.

- [x] Add failing tests for a visible Storyboard tab, preserved mounts, collapsed/mobile navigation and zero output actions.
- [x] Move the existing storyboard binding into a workspace slot; route all existing open/close actions through workspace view state.
- [x] Give each pane independent scrolling and preserve mounted preview/storyboard state.
- [x] Run focused component tests and review the complete changed files.

## Task 2: Preview fit and acceptance

Files: app/components/media/MediaAvPreview.client.vue and Workbench;
scoped preview sizing utility/test only if needed for meaningful geometry checks.

- [x] Add meaningful fit checks for portrait/square/landscape and small pane sizes.
- [x] Fit the authored aspect ratio to available pane dimensions without the current 520px minimum.
- [x] Run focused tests and inspect actual local browser layout across view switches and small/large viewports.
- [ ] Independent review, current-main CI, guarded Pages release and live view-switching checks.

## Source verification checkpoint

27 focused tests pass across Workbench, Storyboard, Inspector and banner preview.
SFC compilation passes for all three modified components. Independent review
found one mobile producer-route issue; a failing reactive-props regression
reproduced it, and restricting mode changes to explicit tab selection fixed it.
The review then reported no remaining Critical or Important findings.

A disposable local Nuxt fixture using the actual components confirmed the full
Storyboard workspace at 1440x900 and 390x844. Local brief copy survived a Library
round trip, and the output-action counter remained zero. Desktop portrait preview
fits its pane. Further shape/height checks were deliberately paused, and the own
dev server and fixture tab closed, to free memory for the renderer benchmark.
The synthetic fixture was moved outside the repository before commit. No deployed
UI acceptance is claimed.

## Related retry correction

Code inspection of the actual failed Reels-only pilot exposed a related export
control defect: Retry discarded its job argument and defaulted to all three
formats. Recover the output set only when persisted variants plus current format
account for the recorded total. If historical evidence is incomplete, show a
toast directing the operator to select formats explicitly; never guess and
expand the request. Three failing regressions cover Reels-only, a known partial
set and incomplete/unknown evidence. This change remains within the user’s
authorized Video Studio cleanup and preserves the explicit render action.

Retry verification: the three new regressions failed before implementation;
21 focused format/workbench/render-panel tests pass afterward. Independent
review found no Critical or Important findings. The original UI source head
8d0b44aa9 passed full CI 44669583204 before this bounded follow-up; the new head
requires its own CI.

## Completed local browser acceptance

The remaining geometry sweep passes 12/12 combinations: portrait/square/landscape
at 1440×900, 1440×600, 390×844 and 390×700. Each frame fits its measured pane, has
no document horizontal overflow and leaves the output-action counter at zero.
The edited storyboard brief survives Library, History and Preview round trips.
A dark-mode mobile screenshot was inspected. This uses the actual production
components in a private client-only harness with the official Nuxt UI 4 Vue/Vite
plugin, without Nitro/auth/database or new installed dependencies. Both its
server and tab were closed before the final renderer benchmark. Hosted/live
acceptance remains separate.
