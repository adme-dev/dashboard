# Design — Social Publishing Planner: Campaign Board + AI Generation

**Status:** Approved (brainstorm) · **Owner:** Paul (ADME / XeroFlow) · **Date:** 2026-06-24
**Route:** `/agency/social/publishing/planner`
**Parent PRD:** `docs/prd/social-publishing-enterprise-overhaul.md` (Slice 3 — Queue + Planner)

---

## 1. Context

The Planner route is half-built. Today `planner.vue` is a recurring **posting-slots**
manager with a stubbed *"AI week planner — coming soon"* alert. The PRD intends Planner to
be a *"campaign/theme planning board feeding Compose"* plus *"AI content-calendar generation
(brief → N scheduled drafts)"*. This slice completes it to enterprise (Agorapulse/Sprout-class)
parity, with AI woven in.

Competitive R&D (Sprout, Hootsuite, Loomly, SocialBee, FeedHive, Buffer, ContentStudio, Vista
Social) confirmed the dominant enterprise pattern: **one dataset of posts, surfaced as
board / calendar / queue views, with campaign as a colored grouping** — not a rigid theme
kanban, and never auto-publishing AI output.

### Decisions locked during brainstorm

| Decision | Choice |
|---|---|
| Scope | Full Slice 3 — campaign/theme board **and** AI calendar generation |
| Data model | First-class `social_campaigns` table; `social_posts.campaign_id` FK |
| Slots | Recurring posting-slots **move to the Queue page** (UI relocation only; API unchanged). Planner = board + AI gen |
| Board axis | **Status lanes** as the spine + a **"Group by campaign"** swimlane toggle (not campaign-columns) |
| Ownership | Cards show assignee + due; new additive columns on `social_posts` |
| AI safety | AI generates **drafts only** — nothing schedules/publishes without explicit human action |
| Build style | Flag-gated; reuse Groq + CF Workers AI + existing `PostComposer`; reuse existing slot/queue engine |

## 2. Goals / Non-goals

**Goals**
- A production-pipeline **board** (status lanes) that the Calendar and Queue can't show, with
  campaign rollups on demand (swimlane toggle).
- First-class **campaigns** (name, color, status, optional date window, brief/goal) that group
  posts and are the target of AI generation.
- **AI "Generate plan"**: brief + campaign + count + date-range + tone + platform mix → N draft
  cards landing in a review lane, each editable/regenerable, never auto-scheduled.
- **Relocate** the posting-slots manager to the Queue page (PRD intent).
- Three views (board / calendar / queue) over **one source of truth** (`social_posts`).

**Non-goals (this slice)**
- Content **pillars** with slot-binding cadence (the two-tier model; deferred fast-follow — see §12).
- New posting-time auto-scheduling logic — reuse the existing slot/queue "fill from drafts" engine.
- Rebuilding the composer, calendar, or approvals — reuse and cross-link.
- New network integrations or evergreen recycling.

## 3. Data model — migration `200_social_campaigns.sql`

Additive only (`IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`), matching house style.

```sql
-- 200_social_campaigns.sql — Planner Slice 3: first-class campaigns + post ownership.
CREATE TABLE IF NOT EXISTS social_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',          -- hex; rendered as the card/swimlane chip
  status TEXT NOT NULL DEFAULT 'active'            -- active | planning | archived
    CHECK (status IN ('active','planning','archived')),
  start_date DATE,                                 -- optional campaign window
  end_date DATE,
  brief TEXT,                                      -- free-text goal/brief; seeds AI generation
  goal_post_count INT,                             -- optional target for the rollup header
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_social_campaigns_client
  ON social_campaigns(client_id, status);

-- Link posts to campaigns + add pipeline ownership (no existing assignee/due on posts).
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS campaign_id UUID
  REFERENCES social_campaigns(id) ON DELETE SET NULL;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS assigned_to TEXT;     -- user id; NULL = unassigned
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;   -- pipeline due date (≠ scheduled_at)
CREATE INDEX IF NOT EXISTS idx_social_posts_campaign
  ON social_posts(campaign_id) WHERE campaign_id IS NOT NULL;
```

**Why these fields:** `color` drives the campaign chip/swimlane; `start_date/end_date` bound a
launch; `brief` is reused verbatim as AI context; `goal_post_count` powers the rollup header
("4 / 20"). `assigned_to`/`due_at` are the enterprise accountability layer the board needs and
that posts lack today. A post belongs to **0 or 1** campaigns (`SET NULL` keeps posts when a
campaign is deleted — never destroy content).

### Board lanes derive from existing status (no enum change)

The `social_posts.status` CHECK already covers the pipeline; lanes are **derived**, not new
columns, so no risky enum migration:

| Lane | Derivation |
|---|---|
| **Draft** | `status='draft'` AND `approval_requested_at IS NULL` |
| **Needs approval** | `approval_requested_at IS NOT NULL` AND `approved_at IS NULL` AND `status='draft'` (mirror `approvals/index.get.ts`) |
| **Scheduled** | `status IN ('approved','scheduled')` |
| **Published** | `status IN ('published','partially_published')` |
| (badge) **Attention** | `status IN ('failed','cancelled')` — surfaced as a card badge + filter chip, not a lane |

AI-generated posts land as `status='draft'` → **Draft** lane. "Idea/backlog" is simply an
unscheduled draft; we do **not** add an `idea` enum value in this slice (YAGNI).

## 4. API surface

All under `server/api/agency/social/publishing/`, `requireAuth` + creative role, mirroring
existing endpoints. New:

- `campaigns/index.get.ts` — `GET ?clientId=` → `SocialCampaign[]` (+ derived `post_count`,
  `scheduled_count`, `published_count` via a grouped join for the rollup header).
- `campaigns/index.post.ts` — create campaign.
- `campaigns/[id]/index.patch.ts` — update (name/color/status/dates/brief/goal).
- `campaigns/[id]/index.delete.ts` — delete (posts detach via `SET NULL`).
- `board.get.ts` — `GET ?clientId=&campaignId=` → posts shaped for the board: each post + its
  derived `lane`, `campaign` summary, `assigned_to`. One query feeds both lane and swimlane views.
- `posts/[id]/index.patch.ts` (**existing**) — extend to accept `campaign_id`, `assigned_to`,
  `due_at`, and lane-transition fields (drag-to-lane reuses this; e.g. drag→Needs-approval calls
  `request-approval`, drag→Scheduled sets `scheduled_at`).
- `ai/generate-plan.post.ts` — mirrors `ai/generate-caption.post.ts` (Groq `gpt-oss-120b` →
  `20b` fallback → CF Workers AI). Body: `{ clientId, campaignId?, brief, count, dateFrom,
  dateTo, tone?, platforms[] }`. Returns `{ posts: GeneratedDraft[] }` of **per-platform-aware**
  draft suggestions. **Persists nothing** — it's a pure generation endpoint.
- **Accept** reuses the existing `posts/index.post.ts` (one call per accepted card) — no new
  accept endpoint. Each creates a `status='draft'` row with `campaign_id` set.

Extend **existing** `nav-counts.get.ts` to include a `campaigns` count for the tile badge.

Slots endpoints (`slots/*`) are **unchanged** — only their management UI moves to Queue.

## 5. Frontend architecture

Reuse the suite shell. New/changed files under `app/`:

- **`pages/agency/social/publishing/planner.vue`** (rewrite) — `SocialPublishingShell`
  wrapper; header actions = `[Group by campaign ⌃] [+ Campaign] [✨ Generate plan]`; body =
  `<SocialPlannerBoard>`. Flag-gated (§7): when off, render a concise "Planner v2 coming" state.
  (Slots have already moved to Queue unconditionally with this slice, so the flag-off state does
  **not** show slots — no functionality is lost, it just lives on Queue now.)
- **`components/social-publishing/SocialPlannerBoard.vue`** — the board. Owns lane columns,
  the swimlane toggle, drag-and-drop, and filters. Consumes `useSocialPlanner`.
- **`components/social-publishing/SocialPlannerCard.vue`** — a post card: copy excerpt,
  network badges, campaign color chip, assignee avatar, due/scheduled date, status/attention
  badge. Click → Compose (`{ query: { edit: id } }`); drag = lane transition.
- **`components/social-publishing/SocialCampaignManager.vue`** — modal/slideover: list +
  create/edit/delete campaigns (name, color picker, status, date window, brief, goal). Uses
  `UFormField` per house form rules; date inputs via `UPopover`+`UCalendar` (not native).
- **`components/social-publishing/SocialAiPlanModal.vue`** — the "Generate plan" flow (§6).
- **`composables/useSocialPlanner.ts`** — thin API client (campaigns CRUD, board fetch,
  lane/assignment mutations, AI generate/accept), same shape as `useSocialPublishing.ts`.
- **`pages/agency/social/publishing/queue.vue`** (edit) — add a collapsible **"Posting slots /
  cadence"** section above the queue list, moving the slot CRUD UI out of `planner.vue` (reuses
  the unchanged `slots/*` API). Extract the shared slot UI into
  `components/social-publishing/SocialSlotManager.vue` so both the move and future reuse are clean.

**Single source of truth:** the board, calendar, and queue all read `social_posts`; the board
is the only new *view*. Mutations go through shared endpoints so views never drift (PRD §5).

## 6. AI "Generate plan" flow

Triggered from the board header (`✨ Generate plan`). Gated by `SOCIAL_PLANNER_AI_ENABLED`.

1. **Modal inputs** (`SocialAiPlanModal.vue`): target **campaign** (optional — defaults to the
   filtered one, prefills `brief` from the campaign), **brief/topic** (textarea), **count**
   (1–14), **date range** (`UPopover`+`UCalendar`), **tone** (select), **platforms** (multi,
   from connected accounts). Keep knobs to these few (R&D: over-knobbing is a known pitfall).
2. **Generate** → `POST ai/generate-plan` → returns N draft suggestions, each with
   **per-platform variants** (R&D: one caption reused everywhere is the #1 complaint). Brand
   context (client name + campaign brief) is fed into the prompt.
3. **Review grid** (inside the modal): each suggested draft is editable inline and has
   **Regenerate** (per card) and **Discard**. Nothing is persisted yet.
4. **Accept** → "Add N drafts" creates them as `status='draft'`, `campaign_id` set, suggested
   `scheduled_at` within the range (still a draft — not scheduled/approved). They appear in the
   board **Draft** lane for normal human review/approval/scheduling.

**Hard safety gate:** generation only ever writes `draft` rows. Scheduling and publishing remain
the existing human-driven flows. This mirrors the project rule that nothing publishes without a
go-ahead.

## 7. Flags & safety

Two granular gates, matching house style (`process.env.X === 'true'`, default off → dormant):

- `SOCIAL_PLANNER_ENABLED` — gates the campaign board + campaign CRUD surface. When off,
  `planner.vue` shows a lightweight "coming soon" placeholder (slots already live on Queue, so
  nothing is lost). Campaigns/board API return 404/empty when off.
- `SOCIAL_PLANNER_AI_ENABLED` — gates the `ai/generate-plan` endpoint + the "Generate plan"
  button. Planning works without AI when this is off.

Server gate helper: `server/utils/socialPublishing/plannerGate.ts` (mirrors
`socialInbox/automationGate.ts`). Both flags default **false**; rollout is operator-flipped CF env
var + redeploy.

## 8. Reuse map (don't rebuild)

| Need | Reuse |
|---|---|
| Page shell, nav, client context | `SocialPublishingShell`, `useSocialPublishingClient`, `nav-counts.get.ts` |
| Editing a card | existing **Compose** / `PostComposer.vue` (`?edit=<id>`) |
| AI call pattern | `ai/generate-caption.post.ts` (Groq → CF Workers AI fallback) |
| Slot CRUD | unchanged `slots/*` API; UI extracted to `SocialSlotManager.vue` |
| Queue fill / cadence | existing `queue/fill.post.ts` ("fill from drafts") |
| Drag-and-drop pattern | existing `queue.vue` HTML5 DnD + `utils/socialQueue.reorder` |
| Approvals transition | existing `posts/[id]/request-approval`, `approve`, `reject` |
| Date inputs | `UPopover`+`UCalendar` per CLAUDE.md form rules |

## 9. Testing

- **Unit (Vitest):** lane-derivation pure function (status/approval fields → lane);
  `useSocialPlanner` client; campaign rollup count aggregation; AI-plan request validation (Zod).
- **API:** campaigns CRUD authz + client scoping; `board.get` shape; `generate-plan` gated off →
  403 when flag off; accept creates only `draft` rows.
- **Guard tests:** flags default off; generate never writes non-draft status.
- Manual: board renders full-width + scrolls (PRD success criteria); drag across lanes persists;
  swimlane toggle; slots now live on Queue and still drive "fill from drafts".

## 10. Rollout & success criteria

- Flag-gated slice, merged dormant, operator-flipped (per house style). Migration 200 is additive
  and auto-run on deploy.
- **Success:** Planner is a full-width board with status lanes + campaign swimlane toggle;
  campaigns are first-class and group posts; ≥1 AI feature (generate-plan) produces editable
  drafts behind a review gate; slots live on Queue; no regressions; tests green.

## 11. Front-facing sync (per CLAUDE.md)

Update `app/pages/features/index.vue`, `features/[slug].vue`, and `MarketingNav.vue` to list the
campaign planner + AI content-calendar generation under the social publishing feature set.

## 12. Deferred / out of scope (named, not silent)

- **Content pillars with slot-binding cadence** (the SocialBee/FeedHive two-tier bridge: pillar =
  theme + recurring slot rule). High-leverage fast-follow; explicitly deferred per the data-model
  decision. The Queue's "fill from drafts" is the interim cadence bridge.
- Evergreen recycling / auto-reposting.
- AI best-time-to-post, approval pre-checks, reply suggestions (PRD Slice 5).
- Bulk CSV import, calendar-drag from the board into a specific calendar slot (board→Compose is
  the v1 hand-off).
```
