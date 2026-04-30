# Advisor Triage + Authoring — Design Spec

**Date:** 2026-04-30
**Route:** `/advisor`
**Status:** Approved, ready for implementation plan

## 1. Context

The `/advisor` route renders an AI-generated recommendation backlog produced by the Financial Advisor (Groq LLM over Xero data). It's a read-mostly table with a triage drawer. A gap analysis identified ten Tier 1 product gaps; this phase delivers a focused subset that turns the page from "AI inbox" into a real triage + authoring tool.

**In scope (this phase):**

- Categories (fixed enum) on recommendations
- Snooze / defer (until-date) without a separate status
- Manual creation of recommendations by humans (alongside AI)
- Comments / discussion thread per recommendation
- Bulk actions (multi-select + batch patch)
- Kanban view alongside the existing table view

**Out of scope (deferred to future phases):**

- Snooze auto-resurface notification (cron + push)
- Impact-vs-effort matrix view
- Portfolio analytics page
- Source-data drill-down inside the drawer
- Metric chart over time on outcomes
- Board-task linkage
- @mentions and markdown in comments
- Backfill of categories on existing AI recs
- Free-form tags alongside the fixed enum
- Email digest of new advisor recs

## 2. Decisions locked in during brainstorming

| # | Question | Decision |
|---|----------|----------|
| 1 | Cluster scope | Triage UX + manual-create + comments (option 5) |
| 2 | Labels taxonomy | Fixed enum, 9 values |
| 3 | Snooze model | `snoozed_until` field; status enum unchanged |
| 4 | Comments model | New `recommendation_comments` table; flat; soft-delete |
| 5 | Manual-create form | Progressive: 5 fields visible, advanced disclosure for the rest |
| 6 | Build approach | Vertical slices (per-feature commits) |

**Category enum:** `cashflow`, `collections`, `pricing`, `margin`, `cost-control`, `growth`, `staffing`, `tax-compliance`, `risk`.

## 3. Data model

### Migration 085 — `085-advisor-triage-authoring.sql`

Schema additions to support categories, snooze, effort sizing, source attribution, and human authorship.

```sql
ALTER TABLE recommendations
  ADD COLUMN category TEXT
    CHECK (category IN (
      'cashflow','collections','pricing','margin',
      'cost-control','growth','staffing','tax-compliance','risk'
    )),
  ADD COLUMN effort TEXT
    CHECK (effort IN ('xs','s','m','l','xl')),
  ADD COLUMN snoozed_until DATE,
  ADD COLUMN created_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  ADD COLUMN source TEXT NOT NULL DEFAULT 'ai'
    CHECK (source IN ('ai','manual'));

CREATE INDEX IF NOT EXISTS idx_reco_category
  ON recommendations(tenant_id, category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reco_snoozed
  ON recommendations(tenant_id, snoozed_until) WHERE snoozed_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reco_source
  ON recommendations(tenant_id, source);
```

**Notes:**

- `category` is nullable. Pre-migration AI rows and AI rows the LLM cannot classify remain NULL; UI surfaces them as "Uncategorized."
- `effort` mirrors `priority`'s style (CHECK constraint, no separate Postgres enum) for cheap future extension.
- `snoozed_until` is `DATE` (day-level), matching `due_date`.
- `source` defaults to `'ai'` so existing rows are correctly attributed without a backfill.
- `created_by` is set on manual creates; remains NULL for AI rows. Drawer renders accordingly.

### Migration 086 — `086-advisor-comments.sql`

```sql
CREATE TABLE IF NOT EXISTS recommendation_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
  author_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reco_comments_rec
  ON recommendation_comments(recommendation_id, created_at)
  WHERE deleted_at IS NULL;

CREATE TRIGGER trg_reco_comments_updated_at
  BEFORE UPDATE ON recommendation_comments
  FOR EACH ROW EXECUTE FUNCTION recommendations_touch_updated_at();
```

**Notes:**

- Soft-delete via `deleted_at` so the existing `recommendation_events` audit log can still reference comment ids without dangling FKs.
- Reuses the `recommendations_touch_updated_at()` trigger function from migration 068.
- Flat (no `parent_id`); threaded discussion is out of scope.

### Active-view filter logic

When the index endpoint receives `status=active` (default behaviour or `status=open,in_progress`), it adds:

```sql
AND (snoozed_until IS NULL OR snoozed_until <= CURRENT_DATE)
```

`?include_snoozed=1` opts back into seeing snoozed rows. Other status values bypass this filter.

## 4. API surface

### New endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/advisor/recommendations` | Manual create |
| `POST` | `/api/advisor/recommendations/bulk` | Batch patch |
| `POST` | `/api/advisor/recommendations/[id]/comments` | Add comment |
| `PATCH` | `/api/advisor/recommendations/[id]/comments/[commentId]` | Edit comment |
| `DELETE` | `/api/advisor/recommendations/[id]/comments/[commentId]` | Soft-delete comment |

#### `POST /api/advisor/recommendations`

```ts
// Body (Zod-validated)
{
  title: string,                   // required
  action: string,                  // required
  category?: typeof CATEGORIES[number] | null,
  priority?: 'low' | 'medium' | 'high',  // default 'medium'
  client_id?: string | null,       // null = agency-scope
  impact?: string | null,
  target_metric?: string | null,
  target_direction?: 'up' | 'down' | null,
  effort?: 'xs' | 's' | 'm' | 'l' | 'xl' | null,
  due_date?: string | null,        // ISO date
  assigned_to?: string | null,
}
```

- `requireAuth(event)` → user; `requireWriteAccess(event)` → blocks viewer/guest.
- Sets `source='manual'`, `created_by=user.id`, `tenant_id` from session.
- Inserts an event row (`event_type='created_manual'`, `actor_id=user.id`).
- Best-effort Vectorize embed via `event.context.cloudflare?.context?.waitUntil(advisorEmbedder.embed(rec))`. Failure logs `console.warn('[advisor] embed failed', err)` and does **not** propagate.
- Returns `{ recommendation: Recommendation }`.

#### `POST /api/advisor/recommendations/bulk`

```ts
// Body
{
  ids: string[],          // 1..200 UUIDs
  patch: {
    status?: 'open' | 'in_progress' | 'done' | 'dismissed' | null,
    priority?: 'low' | 'medium' | 'high' | null,
    category?: CategoryEnum | null,
    assigned_to?: string | null,
    snoozed_until?: string | null,    // ISO date or null to clear
  },
}
```

- All patch fields are `.nullable().optional()`. **Convention:** key missing = unchanged; `null` = clear field.
- Server validates every id belongs to the active tenant before applying any update (`WHERE id = ANY($ids) AND tenant_id = $tenant`).
- Runs inside `transaction()` with `client.query()` (per project memory: `queryOne`/`execute` cannot be used inside `transaction()`).
- Emits one `recommendation_events` row per updated rec with `event_type='bulk_updated'`, `payload={ fields: {...changes}, actor_id }`.
- Returns `{ updated: number }`.
- Response is 400 if `ids` is empty or > 200, or if any id fails tenant scoping.

#### `POST /api/advisor/recommendations/[id]/comments`

```ts
// Body
{ body: string }           // 1..10_000 chars
```

- Returns the new comment row with `author_id`, `author_name`, `author_avatar_url`.
- Emits event `event_type='commented'`, `payload={ comment_id }`.

#### `PATCH /api/advisor/recommendations/[id]/comments/[commentId]`

- Authorization: `comment.author_id = currentUser.id` OR `hasRole(['owner','admin'])`. (Top-level role is `owner`, not `super_admin`.)
- Body `{ body: string }`.
- Updates `body` and bumps `updated_at` via the existing trigger.
- Emits event `event_type='comment_edited'`, `payload={ comment_id }`.

#### `DELETE /api/advisor/recommendations/[id]/comments/[commentId]`

- Same authorization as edit.
- Soft-delete: sets `deleted_at = NOW()`.
- Emits event `event_type='comment_deleted'`, `payload={ comment_id }`.

### Modified endpoints

#### `GET /api/advisor/recommendations` (`index.get.ts`)

New query parameters:

- `category` — one of the 9 enum values, or `none` for `IS NULL`.
- `source` — `ai` | `manual`.
- `include_snoozed` — `1` to include rows where `snoozed_until > CURRENT_DATE`.
- `q` — keyword (ILIKE on `title || ' ' || action`); escapes `%` and `_` per project SQL injection rule.

Response row shape gains: `category`, `effort`, `snoozed_until`, `source`, `created_by`, `created_by_name`, `created_by_avatar_url`, `comment_count`.

`comment_count` comes from a single `LEFT JOIN recommendation_comments c ON c.recommendation_id = r.id AND c.deleted_at IS NULL` with `COUNT(c.id)` and `GROUP BY r.id` — **not** a per-row subquery.

#### `GET /api/advisor/recommendations/[id]` (`[id].get.ts`)

Adds `comments: RecommendationComment[]` to the response shape, ordered by `created_at ASC`, excluding `deleted_at IS NOT NULL`.

#### `PATCH /api/advisor/recommendations/[id]` (`[id].patch.ts`)

Accepts the new fields: `category`, `effort`, `snoozed_until`. Validation matches the schema CHECK constraints. Existing event payload format is unchanged — new fields just appear in the per-field diff.

#### `GET /api/ai/financial-advisor` (Groq prompt)

The prompt is updated to instruct the model to emit one of the 9 `category` values per recommendation when confident; otherwise omit. The Zod schema on the response gains:

```ts
category: z.enum(CATEGORIES).optional(),
```

Old responses without `category` continue to parse and persist with NULL.

### Validation rules

- All bodies validated by Zod at the endpoint boundary.
- `bulk.ids` length ∈ [1, 200].
- `comment.body` length ∈ [1, 10_000].
- `q` length ≤ 200; trimmed; escapes `%` and `_`.
- All UUIDs validated via `z.string().uuid()`.

### Authorization summary

| Endpoint | Auth | Write check | Extra |
|----------|------|-------------|-------|
| `POST /recommendations` | requireAuth | requireWriteAccess | — |
| `POST /recommendations/bulk` | requireAuth | requireWriteAccess | tenant scoping per id |
| `POST /[id]/comments` | requireAuth | requireWriteAccess | — |
| `PATCH /comments/[commentId]` | requireAuth | requireWriteAccess | author OR owner/admin |
| `DELETE /comments/[commentId]` | requireAuth | requireWriteAccess | author OR owner/admin |

## 5. Frontend architecture

### Component split

`app/pages/advisor/index.vue` becomes a thin orchestrator. The drawer-content extraction (`AdvisorDrawer.vue` + `AdvisorFilters.vue`) is done as **scaffolding inside slice 1** so subsequent slices have clean component boundaries to add into. New components live in `app/components/advisor/` alongside the existing `AdvisorGraph.vue`:

```
app/components/advisor/
├── AdvisorGraph.vue            (existing, unchanged)
├── AdvisorFilters.vue          (filter row + category chip strip)
├── AdvisorTableView.vue        (UTable + checkbox col + sticky bar)
├── AdvisorKanbanView.vue       (4-column drag-to-change-status)
├── AdvisorRecCard.vue          (card used in Kanban + similar list)
├── AdvisorBulkActionBar.vue    (sticky bottom bar)
├── AdvisorCreateModal.vue      (progressive manual-create form)
├── AdvisorDrawer.vue           (slideover content extracted from index.vue)
├── AdvisorDrawerComments.vue   (Discussion section: list + compose)
└── AdvisorCategoryBadge.vue    (chip used in cells, cards, filters)
```

Auto-import naming follows Nuxt convention: `advisor/AdvisorGraph.vue` → `<AdvisorGraph>` (verified — no `Advisor` prefix collision with the directory).

### View toggle

`UTabs` in the navbar with two values: `table | kanban`. Persisted via VueUse `useLocalStorage('advisor.view', 'table')`. Default = `table` to avoid churn for existing users.

### Filters (slice 1 + 2)

Inside the existing `<UCard>`:

- **Status `UButtonGroup`** — unchanged.
- **Category chip strip** (new) — 9 category chips + "Uncategorized" chip; single-select; toggles map to `?category=<value>` or `?category=none`.
- Existing **priority / client / period / assignee** `USelectMenu`s — unchanged.
- **Source `UButtonGroup`** — `All | AI | Manual`.
- **"Show snoozed" `UCheckbox`** — when off (default), excludes future-snoozed rows.
- **Keyword `UInput`** — search icon, 300 ms debounce, sets `?q=`.

### Table view (slice 5)

- Selection column at index 0. Implementation order: verify UTable v4 `v-model:selection` API against installed Nuxt UI version at slice 5 start; if API differs from current docs, fall back to a manual checkbox column with a `Set<string>` ref. The decision is made up-front, not mid-build.
- New cells: `category` (`AdvisorCategoryBadge`, renders only when set), `effort` (small badge, renders only when set), `comments` (icon + count when > 0), `source` (mini "AI" / "✋" badge).
- `due_date` cell shows a clock icon when `snoozed_until` is set.
- Row click opens drawer; checkbox click uses `@click.stop` to avoid opening drawer.
- When `selection.size > 0`, mounts `<AdvisorBulkActionBar>` fixed at bottom.

### Bulk action bar (slice 5)

- Fixed bottom-center, slide-up entrance.
- Renders `{n} selected` plus buttons: Status ▾, Priority ▾, Category ▾, Assignee ▾, Snooze until ▾, Dismiss, ✕ Clear.
- Each ▾ opens a `UPopover` with the relevant `USelectMenu` or `UInput type="date"`.
- Dismiss confirms via `UModal` (irreversible).
- POST `/bulk`, then refetch list. Loading state on the bar during the request.
- Partial-failure toast: "Updated X of Y. Some items couldn't be changed."

### Kanban view (slice 6)

- Four columns: Open / In progress / Done / Dismissed.
- Column header: name + count + "+ Add" → opens `AdvisorCreateModal` with the column's status preset.
- Card body (`AdvisorRecCard`): priority dot (left edge stripe), title (1-line truncate), action (2-line clamp), category chip, effort badge, assignee avatar, due date or snooze indicator, comment count.
- Drag-to-change-status: PATCH on drop; snap-back on failure.
- Drag primitive: reuse whichever library boards already use for group reordering. The implementation step verifies (`grep -r "draggable" app/components/`) and uses the project's existing wrapper.
- Snoozed cards hidden when "Show snoozed" off (consistent with table).
- Bulk actions are **not** wired into Kanban in this phase (table-only).

### Drawer changes

- Header gets two new badges next to existing priority + status: category chip and source (`"AI"` or `"Manual"` with creator avatar/name).
- Controls grid gains: Category (`USelectMenu`), Effort (`USelectMenu`), Snooze until (`UInput type="date"` with × clear button).
- New "Discussion" section between "Outcome notes" and "Relationships" — renders `<AdvisorDrawerComments>`.
- Activity-event grouping: consecutive `bulk_updated` events from the same `actor_id` within a 5-minute window collapse to "Paul updated 12 items." Implemented client-side in the parent of `prettyEvent`.

### Manual-create modal (slice 3)

- `UModal`, `max-w-lg`.
- **Visible by default:** `title` (`UInput`, required), `action` (`UTextarea` rows=4, required), `category` (`USelectMenu` of 9), `priority` (`USelectMenu`, default Medium), `client_id` (`USelectMenu`, default "Agency").
- **"Show advanced ▾" disclosure:** `impact` (`UInput`), `effort` (`USelectMenu`), `target_metric` (`USelectMenu` of metric registry), `target_direction` (`UButtonGroup` up/down), `due_date` (`UInput type="date"`), `assigned_to` (`USelectMenu`).
- Submit disabled until `title` and `action` non-empty after `trim()`.
- On success: prepend new rec to list, close modal, open drawer for the new rec.
- Triggers: header "+ New" button **and** Kanban column "+ Add" affordance.

### State management

- `useFetch` query stays reactive; new filter pieces (`category`, `source`, `include_snoozed`, `q`) join the existing `query` computed.
- Bulk selection: `const selection = ref<Set<string>>(new Set())`; cleared on filter change or refresh.
- View toggle: `useLocalStorage('advisor.view', 'table')`.
- URL persistence: only `clientId` is URL-persisted today; this phase does not extend that to other filters (deferred).

### Optimistic updates

- Drawer single-field PATCH (status, priority, category, snooze, etc.): optimistic local mutate → PATCH → on error, toast + rollback to server response (matches existing `patchRec` pattern).
- Comment add: optimistic append with a temp id; replace with server response on success; on failure, remove + toast.
- Bulk PATCH: pessimistic — spinner on bar, refetch list on response.
- Manual create: pessimistic — disable submit; on success close + refetch.
- Kanban drag: optimistic column move; snap-back on PATCH failure.

### Accessibility / mobile

- Clickable rows gain `role="button"` + `tabindex="0"` + Enter/Space handlers.
- Kanban: horizontal scroll on mobile (4 columns × ~280 px = 1120 px desktop).
- Sticky bulk bar respects iOS safe area (`pb-safe`).

## 6. Error handling

### Server

- All expected failures return `createError({ statusCode, statusMessage })`.
- Bulk endpoint: full transaction rollback on any row failure. Tenant scoping in the SQL `WHERE` makes cross-tenant id forging impossible.
- Comment edit/delete returns 403 with `'Not authorized to modify this comment'` on author mismatch.
- Vectorize embed for manual create: try/catch + `console.warn`; never throws. Rec is saved either way and can be re-embedded by a future backfill run.

### Client

- All `$fetch` mutations follow the existing `patchRec` pattern: success → toast + refetch; error → toast `err?.data?.statusMessage ?? err?.message` + rollback.
- Bulk bar: disabled during request; partial failure surfaces a neutral-color toast with X-of-Y counts.
- Drawer optimistic rollback uses the authoritative server response payload to overwrite local state.
- Kanban drag failure: card animates back, error toast.

### Tenant safety

Every endpoint resolves `getSelectedTenant(event)` and scopes by `tenant_id`. The bulk endpoint adds an explicit `WHERE id = ANY($ids) AND tenant_id = $tenant` so a forged id list cannot leak across tenants.

## 7. Testing strategy

### Vitest (server)

Add tests in `server/tests/advisor/`:

- `bulk.test.ts` — happy path, mixed-tenant rejection, empty patch, oversize array (201 ids → 400), `null`-clears-field semantics.
- `manual-create.test.ts` — title+action only succeeds, missing title 400, sets `source='manual'` and `created_by`, emits `created_manual`, survives Vectorize unavailability.
- `comments.test.ts` — add, edit (author only), edit (admin override), delete (soft), deleted comments excluded from `[id].get` response.
- `snooze-visibility.test.ts` — index excludes snoozed when active, includes when `include_snoozed=1`, naturally resurfaces when date passes.
- `category-filter.test.ts` — `?category=cashflow` filters, `?category=none` returns NULL rows.

### Browser tests

Per CLAUDE.md UI testing rule, browser-test each slice's frontend before marking complete:

- Slice 1: chip click filters; new AI report shows category badge.
- Slice 2: snooze date hides row; clearing brings it back; toggle works.
- Slice 3: + New opens modal; advanced expands; submit saves and opens drawer.
- Slice 4: comment compose submits; edit own works; admin can edit another user's; deleted hide.
- Slice 5: select 3 rows, bulk-change priority, all 3 update; deselect resets bar.
- Slice 6: drag card from Open to In Progress; reload preserves view choice.

### Battle test (CLAUDE.md pre-commit)

Before each slice commit:

1. Re-read every modified file end-to-end.
2. Verify `~~/server/utils/` (not `~/`) for server imports.
3. USelectMenu values never `''` (use `'all'`, `'none'`, `'__custom__'`).
4. Computed reactivity: filter changes actually update URL/query.
5. No duplicate UI sections from edits.
6. No localhost / private-IP fetch from server.
7. Run new Vitest tests + lint.

### Type-checking

Project has ~60 pre-existing TS errors (per CLAUDE.md). Don't enable strict; just don't add net-new errors.

## 8. Slice order & commit shape

Each slice = (migration where needed) + endpoints + UI + tests + browser-test + atomic commit.

| # | Slice | Migration | New endpoints | Modified | Components | Risk |
|---|-------|-----------|---------------|----------|------------|------|
| 1 | Categories + drawer extraction | 085 | — | `index.get`, `[id].patch`, `financial-advisor.get` (LLM prompt) | Extract `AdvisorDrawer.vue` + `AdvisorFilters.vue`; add `AdvisorCategoryBadge`, chip strip | Low |
| 2 | Snooze + source filter | (covered by 085) | — | `index.get`, `[id].patch` | "Show snoozed" toggle, drawer field, source toggle | Low |
| 3 | Manual create | (covered by 085) | `POST /recommendations` | — | `AdvisorCreateModal`, "+ New" button | Med |
| 4 | Comments | 086 | `POST /comments`, `PATCH /comments/[id]`, `DELETE /comments/[id]` | `[id].get`, `index.get` (comment_count JOIN) | `AdvisorDrawerComments` | Low |
| 5 | Bulk actions | — | `POST /recommendations/bulk` | — | Checkbox column, `AdvisorBulkActionBar`, drawer event grouping | Med |
| 6 | Kanban view | — | — | — | `AdvisorKanbanView`, `AdvisorRecCard`, view toggle | Med |

**Why this order:**

- Slice 1 ships value alone (filter + badge for new AI reports going forward).
- Slices 2-3 build on 1's schema migration.
- Slice 4 (comments) is independent; slot can swap with 2 or 3 if priority shifts.
- Slice 5 needs slice 1 (so bulk-set-category exists).
- Slice 6 (Kanban) is last — uses every prior addition; Kanban + bulk multi-select interaction is intentionally **out of scope** for this phase.

**Commit messages:** repo style — `feat(advisor): <slice description>` with brief body. One commit per slice; migration + tests + UI together.

## 9. Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| LLM Zod schema change breaks old responses | `category` is `.optional()`; missing field parses as undefined → NULL. |
| `waitUntil` lifetime on CF Pages (~30 s) for Vectorize embed | Manual rec embed takes <1 s; well within budget. Failed embeds re-run during the next backfill (`backfill-embeddings.post.ts`). |
| Drag-drop library mismatch | Implementation step inspects `app/components/` for the existing wrapper before introducing a new dependency. |
| UTable v4 selection API uncertainty | Fallback path: manual checkbox column with `Set<string>` ref. |
| Migration 085 batches schema for slices 1-3 (unused columns ship in slice 1) | Acceptable — columns are NULL placeholders; reduces migration churn. |
| Activity-log noise from 50-row bulk patches | Phase 1 accepts noise. Drawer collapses consecutive same-actor `bulk_updated` events within a 5-min window. |

## 10. Open dependencies

None blocking. The financial-advisor LLM prompt change in slice 1 is contained to one file (`server/api/ai/financial-advisor.get.ts`) and its Zod schema. The `requireWriteAccess` middleware and `hasRole` helper are both stable (the recent shared-array bug fix landed 2026-03-25 with 60 unit tests).
