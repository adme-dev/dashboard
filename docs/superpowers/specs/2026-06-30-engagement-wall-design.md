# Social Engagement Wall Design

**Date:** 2026-06-30
**Status:** Approved design; ready for implementation planning.
**Scope:** `/agency/social/inbox/wall` and Engagement navigation.
**Related docs:**
- `docs/prd/social-inbox-enterprise-native-workflow.md`
- `docs/superpowers/specs/2026-06-01-social-inbox-slice2-design.md`
- `docs/superpowers/specs/2026-06-01-social-publishing-design.md`

## Context

XeroFlow now has two separate social surfaces:

- **Publishing Wall**: a publishing-owned view over `social_posts`, showing content we created, generated, scheduled, or published through XeroFlow.
- **Engagement Inbox**: a conversation-owned triage view over comments, reviews, DMs, and replies that need operational attention.

The missing view is a post-first engagement wall: the Facebook-style view where staff can see each public post and the comments/reviews attached to that post. This helps teams understand conversation context without opening Facebook, Instagram, or Google Business directly.

## Decision

Add an **Engagement Wall** under the Engagement navigation:

`/agency/social/inbox/wall`

The Engagement Wall is distinct from the Publishing Wall. It groups inbox conversations by source post, not by publishing draft/schedule row. The first build should show posts that already have engagement records in the inbox. Full historical account backfill for posts with no engagement is a follow-up phase.

## Product Shape

### Publishing Wall

Owned by Social Publishing.

Purpose:
- Review posts we created, generated, approved, scheduled, or published through XeroFlow.
- Show publishing status, account targeting, creative preview, and publishing metrics.

Data source:
- `social_posts`
- `social_post_metrics`
- `social_accounts`

### Engagement Inbox

Owned by Social Engagement.

Purpose:
- Triage individual conversations, comments, reviews, DMs, assignments, SLAs, replies, and escalations.

Data source:
- `social_conversations`
- `social_messages`
- response queue, assignments, native task/client-request links

### Engagement Wall

Owned by Social Engagement.

Purpose:
- Show each public source post as a wall card.
- Under each post, show related comments, replies, reviews, unread status, assignments, priority, sentiment/risk, and reply state.
- Let staff move between a Facebook-style post view and the conversation-first inbox without losing context.

Data source:
- Primary: grouped `social_conversations` and `social_messages`
- Enrichment: source post metadata from provider payloads, provider hydration, or linked `social_posts` where available

## MVP Behavior

The first version shows **engagement-bearing posts only**. A post appears when at least one conversation/comment/review has been ingested for it.

Each wall card should include:
- Platform and account/page name
- Source post author/page name
- Source post caption/title/body where available
- Source post image/video thumbnail where available
- Provider permalink where available
- Published timestamp where available
- Linked publishing post badge when the source can be matched to `social_posts`
- Comment/review count, unread count, last activity time
- Sentiment/risk summary
- Assignment/status summary
- Latest comments and replies in threaded order
- Quick action to open the full conversation in the existing inbox thread

The wall should support:
- Client selector inherited from Social Publishing/Engagement shell behavior
- Platform filter
- Account filter
- Status filter
- Assigned-to filter
- Search across post caption, account name, author name, comment text, tags, and campaign name
- Sort by latest engagement by default

## Data Model

Use the existing inbox model first. Add only small, additive fields if current metadata is not enough.

Recommended additive fields on `social_conversations`:

- `source_post_id TEXT`
- `source_post_url TEXT`
- `source_post_title TEXT`
- `source_post_content TEXT`
- `source_post_media JSONB DEFAULT '[]'`
- `source_post_author_name TEXT`
- `source_post_author_avatar_url TEXT`
- `source_post_published_at TIMESTAMPTZ`
- `linked_social_post_id UUID NULL REFERENCES social_posts(id) ON DELETE SET NULL`

These fields should be populated during normalization when provider payloads contain source post context. A later hydration job can fill missing metadata by calling platform APIs.

Indexes:
- `(client_id, platform, source_post_id)`
- `(client_id, linked_social_post_id)` where `linked_social_post_id IS NOT NULL`
- `(client_id, last_message_at DESC)` to support default wall ordering

No separate `engagement_posts` table is required for the MVP. If provider hydration becomes heavy or if no-engagement historical backfill becomes a first-class feature, introduce a dedicated `social_source_posts` table later.

## API Design

Add:

- `GET /api/agency/social/inbox/wall`

Query params:
- `clientId`
- `platform`
- `accountId`
- `status`
- `assignedTo`
- `q`
- `limit`
- `cursor`

Response shape:

```ts
interface SocialEngagementWallPost {
  key: string
  client_id: string
  platform: string
  social_account_id: string | null
  account_name: string | null
  source_post_id: string | null
  source_post_url: string | null
  source_post_title: string | null
  source_post_content: string | null
  source_post_media: Array<{ url: string, type?: string, thumbnailUrl?: string }>
  source_post_author_name: string | null
  source_post_author_avatar_url: string | null
  source_post_published_at: string | null
  linked_social_post_id: string | null
  campaign_name: string | null
  status_summary: {
    open: number
    snoozed: number
    closed: number
  }
  unread_count: number
  conversation_count: number
  message_count: number
  latest_activity_at: string | null
  latest_conversations: SocialConversationSummary[]
}
```

The wall API should group by:

1. `source_post_id` when present.
2. `source_post_url` when no ID exists.
3. `linked_social_post_id` when source metadata is incomplete but a publishing match exists.
4. Conversation id as a final fallback, so orphaned comments still render.

## Frontend Design

Add route:

- `app/pages/agency/social/inbox/wall.vue`

Add navigation item:

- Engagement group label: `Wall`
- Route: `/agency/social/inbox/wall`
- Icon: `i-lucide-panels-top-left` or `i-lucide-layout-grid`

Use a dense operational layout, not a marketing layout:

- Top filter bar with search, platform, account, status, assignee, refresh.
- Responsive grid of post cards on desktop.
- Single column on mobile/tablet.
- Cards should be 8px radius or less, consistent with the dashboard.
- Reuse existing social preview/post card components where possible.
- Do not duplicate full inbox reply logic in the first wall pass; quick actions open the existing conversation detail.

Each card should have:
- Header: account/page, platform badge, posted date, open-in-platform link.
- Post preview: media thumbnail, caption/title, linked campaign/publishing badge.
- Engagement summary row: open threads, unread, comments/replies, latest activity.
- Thread preview: latest 3 conversations/comments with avatar/name/timestamp if available.
- Actions: open in inbox, open on platform, assign/review where supported by existing APIs.

## Provider Hydration

Provider payloads vary. The implementation should degrade gracefully:

- If post image is unavailable, render text-only source post card.
- If source post author is unavailable, use account/page name.
- If commenter identity is unavailable due platform privacy limits, continue using existing fallbacks.
- If permalink is unavailable, hide external link rather than showing a broken button.

Hydration order:

1. Use metadata already received in webhook/poll payloads.
2. Match to `social_posts.platform_results` by provider post id or URL.
3. Later: add scheduled hydration for missing source post metadata per account/platform.

## Non-Goals

- Do not replace the existing inbox.
- Do not merge Publishing Wall and Engagement Wall into one route.
- Do not backfill every historical platform post in the MVP.
- Do not build a new reply engine just for the wall.
- Do not show posts from disconnected accounts.

## Implementation Phases

### Phase 1: Engagement-Bearing Wall

- Add additive source-post metadata fields to inbox conversations.
- Update provider normalizers to persist source post metadata already available in payloads.
- Add grouped wall API.
- Add `Engagement > Wall` route and navigation item.
- Render wall cards with source post preview and latest conversation snippets.
- Link card actions back to existing inbox thread routes.

### Phase 2: Publishing Match Enrichment

- Match engagement records to `social_posts` when provider post ids or URLs line up.
- Show `Published through XeroFlow` / campaign badges.
- Reuse richer publishing preview cards when linked source data exists.

### Phase 3: Provider Hydration

- Add per-platform source post hydration for missing caption/media/permalink.
- Store last hydration timestamp and provider error state in metadata.
- Rate-limit hydration per account.

### Phase 4: All Discovered Posts

- Introduce `social_source_posts` only if needed.
- Import historical posts from connected public accounts.
- Allow the wall to show all discovered posts, including posts with no comments yet.

## Testing

Backend:
- Grouping by `source_post_id`, URL, linked publishing id, and fallback conversation id.
- Filters for client, platform, account, status, assignee, and search.
- Source metadata persistence from normalizer fixtures.
- Client scoping and auth checks.

Frontend:
- Empty state.
- Text-only source post.
- Media source post.
- Unavailable author/avatar fallback.
- Linked publishing badge.
- Filter state and refresh behavior.

Verification commands:
- `pnpm exec vitest run test/server/utils/socialInbox*.test.ts test/social/*.test.ts`
- `pnpm exec eslint app/pages/agency/social/inbox app/components/social-inbox server/api/agency/social/inbox server/utils/socialInbox`
- `pnpm run build`

## Open Questions For Implementation Planning

- Whether the first card action should open a side panel inside the wall or route to the existing inbox thread.
- Whether wall-specific assignment/status controls should ship in Phase 1 or after the existing inbox action APIs are reused cleanly.
- Exact platform support for source post hydration across Meta, Instagram, Google Business, YouTube, LinkedIn, and TikTok after reviewing current provider fixtures.
