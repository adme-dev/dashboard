# Email Editor — Preview / HTML / Save / Toolbar (Phase 2a-ii-4) Plan

> Executed inline in worktree `.worktrees/email-2aii4` (branch `email-2aii4`), pushed to `origin/feat/email-marketing`.

**Goal:** Make the editor shippable end-to-end — undo/redo toolbar, live Preview + HTML views (via the existing render endpoint), Save to `edm_templates` (create + update), load an existing template via `?id=`, and a Compose link from `/agency/email`.

**Architecture:** Add a top toolbar + view-mode switch to `EdmFlyhubBuilder.client.vue` (it already owns the singleton store). Preview/HTML call `POST /api/email/templates/render` with `body_source = store.document`. Save uses a `UModal` for name/subject/preview_text → `POST` (create) or `PATCH` (update) `/api/email/templates`. Loading reads `route.query.id` and `store.resetDocument(template.body_source)`. No new server code (all endpoints exist from 2a-i).

**Verification:** lint + 33 tests + dev-build smoke (no browser this session). Browser eyeball deferred with 2a-ii-2/3.

## Decisions
- **View modes** local `viewMode: 'editor' | 'preview' | 'html'` (not the store's 4-tab enum — no JSON view needed here).
- **Preview** renders into a sandboxed `<iframe :srcdoc="previewHtml">` for accurate, style-isolated email rendering. Fetch on entering preview/html and via a Refresh button (not live-on-every-keystroke — avoids hammering the endpoint).
- **HTML view** = same rendered `html` in a read-only `UTextarea` (mono) + Copy button.
- **Save** modal collects `name` (required), `subject`, `preview_text`. First save → `POST` (create), stores returned `template.id`; subsequent saves → `PATCH /[id]`. Toast on success/error.
- **Load** on mount if `?id=`: `GET /[id]` → `resetDocument(body_source)`, prefill name/subject/preview_text + templateId.
- Toolbar identity field: show the template name inline (read-only chip) once saved/loaded; editing name happens in the Save modal.
- No new unit tests — render pipeline + templates util already covered (33 tests); UI verified by build + browser. (Consistent with 2a-ii-2/3.)

## Tasks
1. **Add toolbar + view modes + preview/html + save/load to `EdmFlyhubBuilder.client.vue`.**
   - Script adds: `route` (useRoute), `viewMode`, `previewHtml`, `previewLoading`, `previewError`, `templateId`, `name`, `subject`, `previewText`, `saving`, `showSaveModal`.
   - `renderPreview()` → `$fetch('/api/email/templates/render', { method: 'POST', body: { body_source: store.document.value, subject, preview_text: previewText } })`, set `previewHtml`; guard errors → toast + `previewError`.
   - `watch(viewMode)`: when `'preview'|'html'` and no/again → call `renderPreview()`.
   - `save()` → if `templateId` PATCH else POST; on create set `templateId`; toast; close modal.
   - `onMounted`: if `route.query.id` (string) → `$fetch('/api/email/templates/' + id)`, `store.resetDocument(template.body_source)`, prefill fields + templateId.
   - Template: toolbar row (undo/redo `UButton`s gated by `canUndo/canRedo`; segmented `viewMode` `UButton` group Editor/Preview/HTML; Refresh button visible in preview/html; Save `UButton`). Center pane `v-if` by viewMode: editor=existing 3-pane canvas; preview=iframe; html=UTextarea+copy. Right inspector/settings sidebar shows only in editor mode. Save `UModal` with `UFormField` name/subject/preview_text.
   - Lint, commit.
2. **Add Compose link to `/agency/email` index header.** `UButton` `to="/agency/email/compose"` icon `i-lucide-pen-line` label "Compose email". Lint, commit.
3. **Verify + push.** Lint module, 33 tests, dev-build smoke (compose 200, render 401 unauth, no transform errors), commit, fast-forward push `HEAD:feat/email-marketing`.

## Gotchas honoured
- `~~/app/...` for any tested imports (none new here). `$fetch` for mutations, `useFetch` not needed (client actions).
- `store.*` accessed via `.value` (singleton composable, not Pinia).
- iframe `sandbox` attribute omitted intentionally? No — keep default `srcdoc` (no sandbox needed for trusted self-rendered HTML; do NOT add `allow-scripts` + `allow-same-origin` together). Use `sandbox=""` to neuter scripts in preview.
- No `@flyhub` imports added (render is server-side pure-TS).
- Worktree isolation + fast-forward push (concurrent sessions flip the shared tree).
