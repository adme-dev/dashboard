# Social Inbox Slice 2 — Phase 2a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working social engagement inbox + reviews manager for **comments and reviews** across the networks whose APIs allow it — ingestion (Meta-comment webhook + poll cron), a unified conversation store, manual reply, and the agency inbox/reviews UI — without the Meta App Review gate.

**Architecture:** Hybrid ingestion (Meta comments via HMAC-verified webhook; YouTube/TikTok/LinkedIn comments + GBP/FB reviews via a `social-inbox-cron` companion Worker → `/api/cron/sync-social-inbox`) funnels through one pure `normalizeEvent()` layer into the unified `social_conversations` + `social_messages` tables. Replies go out through new `fetchInbox`/`reply` methods on the existing `social-providers/*` registry. UI under `/agency/social/inbox/*`, sibling to `/publishing`.

**Tech Stack:** Nuxt 4 / Nitro, Neon Postgres via `~~/server/utils/db` (`queryRows`/`queryOne`/`execute`), Nuxt UI v4, vitest + happy-dom, Cloudflare Pages + companion Worker. Spec: `docs/superpowers/specs/2026-06-01-social-inbox-slice2-design.md`.

**Conventions (mirror Slice 1):** `client_id` tenancy (FK `agency_clients`); server imports use `~~/server/utils/` never `~/`; endpoints `await requireAuth(event)`; `clientId` passed as query/body param; idempotent DB upserts keyed on platform IDs; 0 new type errors; companion-Worker cron with `x-cron-secret`.

**Phase boundary:** 2a = comments + reviews, read + manual reply. **Deferred:** automation engine (2b), assignment/SLA/saved-replies (2c), DMs/mentions/client-portal/Durable-Object real-time (2d). Do **not** build those here. The schema includes their columns (additive) but 2a leaves them unused.

---

## File Structure

**Create:**
- `server/database/migrations/147_social_inbox.sql` — `social_conversations`, `social_messages`, `social_sync_cursors`.
- `server/utils/socialInbox/normalize.ts` — pure `normalizeEvent()` + per-source raw→normalized mappers.
- `server/utils/socialInbox/store.ts` — idempotent `upsertConversation()` / `insertMessage()` + `recordInbound()`/`recordOutbound()`.
- `server/utils/socialInbox/types.ts` — shared server-side inbox types (`ChannelType`, `NormalizedEvent`, `InboxItem`).
- `server/api/webhooks/social/meta.post.ts` — Meta comment webhook (HMAC verify + GET verify challenge).
- `server/api/cron/sync-social-inbox.post.ts` — poll dispatcher.
- `server/api/agency/social/inbox/conversations/index.get.ts` — list.
- `server/api/agency/social/inbox/conversations/[id]/index.get.ts` — get + messages.
- `server/api/agency/social/inbox/conversations/[id]/index.patch.ts` — status/read.
- `server/api/agency/social/inbox/conversations/[id]/reply.post.ts` — manual reply.
- `server/api/agency/social/inbox/accounts/sync.post.ts` — manual poll trigger.
- `workers/social-inbox-cron/{wrangler.toml,package.json,src/index.ts}` — companion Worker.
- `app/composables/useSocialInbox.ts` — data composable.
- `app/pages/agency/social/inbox/index.vue` — inbox hub.
- `app/pages/agency/social/inbox/reviews.vue` — reviews view.
- `app/components/social-inbox/InboxSidebar.vue`, `InboxThread.vue`, `InboxComposer.vue`, `ThreadActionPanel.vue`.
- Tests under `tests/socialInbox/`.

**Modify:**
- `server/utils/social-providers/types.ts` — add `fetchInbox?`/`reply?` to `SocialPostProvider` + inbox param/result types.
- `server/utils/social-providers/{youtube,linkedin,tiktok,google-business,facebook}.ts` — implement `fetchInbox`/`reply`.
- `app/types/index.ts` — add `SocialConversation`, `SocialMessage`, `SocialChannelType`.
- `app/layouts/agency.vue` — add Inbox/Reviews to the Creative-gated "Social" nav group.
- `app/pages/features/index.vue` + `[slug].vue` + `app/components/MarketingNav.vue` — marketing sync (final task).

---

## Task 1: Migration 147 — unified inbox schema

**Files:**
- Create: `server/database/migrations/147_social_inbox.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 147_social_inbox.sql — Social Suite Slice 2: unified engagement inbox + reviews.
-- Additive. Columns for later phases (2b automation, 2c SLA, 2d portal) are included
-- but unused in 2a. Run: psql "$DATABASE_URL" -f server/database/migrations/147_social_inbox.sql

CREATE TABLE IF NOT EXISTS social_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  social_account_id UUID REFERENCES social_accounts(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,                       -- facebook|instagram|linkedin|tiktok|youtube|google-business
  channel_type TEXT NOT NULL,                   -- comment|dm|mention|review
  platform_conversation_id TEXT NOT NULL,       -- post/thread/review id on the platform
  permalink TEXT,
  participant_id TEXT,
  participant_name TEXT,
  participant_handle TEXT,
  status TEXT NOT NULL DEFAULT 'open',           -- open|snoozed|closed
  snoozed_until TIMESTAMPTZ,
  priority TEXT,
  assigned_to TEXT,                              -- (2c)
  assigned_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  last_message_direction TEXT,                   -- in|out
  unread_count INT NOT NULL DEFAULT 0,
  message_count INT NOT NULL DEFAULT 0,
  sentiment NUMERIC,
  rating INT,                                    -- reviews only
  tags TEXT[],
  sla_due_at TIMESTAMPTZ,                         -- (2c)
  first_response_at TIMESTAMPTZ,                  -- (2c)
  sla_breached BOOLEAN NOT NULL DEFAULT FALSE,    -- (2c)
  automation_state TEXT,                          -- (2b)
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (social_account_id, channel_type, platform_conversation_id)
);
CREATE INDEX IF NOT EXISTS idx_social_conv_client ON social_conversations(client_id, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_conv_channel ON social_conversations(client_id, channel_type);

CREATE TABLE IF NOT EXISTS social_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES social_conversations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  platform_message_id TEXT,                      -- idempotency (nullable for notes/pending-outbound)
  direction TEXT NOT NULL,                       -- in|out
  author_id TEXT,
  author_name TEXT,
  message_type TEXT NOT NULL DEFAULT 'text',     -- text|image|video|comment|review|...
  content TEXT,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  parent_message_id UUID REFERENCES social_messages(id) ON DELETE SET NULL,
  is_internal_note BOOLEAN NOT NULL DEFAULT FALSE,
  sent_by_user_id TEXT,
  ai_generated BOOLEAN NOT NULL DEFAULT FALSE,    -- (2b)
  ai_suggested BOOLEAN NOT NULL DEFAULT FALSE,    -- (2b)
  ai_confidence NUMERIC,                          -- (2b)
  automation_rule_id UUID,                        -- (2b)
  platform_timestamp TIMESTAMPTZ,
  reactions JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_social_msg_platform
  ON social_messages(conversation_id, platform_message_id)
  WHERE platform_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_social_msg_conv ON social_messages(conversation_id, platform_timestamp);

CREATE TABLE IF NOT EXISTS social_sync_cursors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL,                    -- comment|review
  cursor TEXT,                                   -- platform page-token / ISO ts / last-id
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (social_account_id, channel_type)
);
```

- [ ] **Step 2: Run the migration against the dev DB**

Run:
```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/147_social_inbox.sql
```
Expected: `CREATE TABLE` / `CREATE INDEX` lines, no errors. (If `147_*` already exists, bump to the next free number and update the filename + this plan.)

- [ ] **Step 3: Verify columns landed**

Run:
```bash
psql "$DATABASE_URL" -c "\d social_conversations" -c "\d social_messages" -c "\d social_sync_cursors"
```
Expected: all three tables with the columns above.

- [ ] **Step 4: Commit**

```bash
git add server/database/migrations/147_social_inbox.sql
git commit -m "feat(social-inbox): migration 147 — unified conversations/messages/cursors"
```

---

## Task 2: Shared inbox types

**Files:**
- Create: `server/utils/socialInbox/types.ts`
- Modify: `app/types/index.ts` (append to the social section)

- [ ] **Step 1: Create the server-side types**

```ts
// server/utils/socialInbox/types.ts
export type ChannelType = 'comment' | 'dm' | 'mention' | 'review'
export type Direction = 'in' | 'out'

/** Output of normalizeEvent — the shape store.ts persists. */
export interface NormalizedEvent {
  platform: string
  channelType: ChannelType
  platformConversationId: string
  permalink?: string
  participant: { id?: string; name?: string; handle?: string }
  message: {
    platformMessageId: string
    direction: Direction
    authorId?: string
    authorName?: string
    messageType: string
    content: string
    attachments?: Array<{ url: string; type: string }>
    platformTimestamp?: string // ISO
  }
  rating?: number // reviews
}

/** One raw item returned by a provider's fetchInbox(). */
export interface InboxItem {
  channelType: ChannelType
  platformConversationId: string
  permalink?: string
  participant: { id?: string; name?: string; handle?: string }
  platformMessageId: string
  authorId?: string
  authorName?: string
  content: string
  messageType?: string
  attachments?: Array<{ url: string; type: string }>
  platformTimestamp?: string
  rating?: number
}
```

- [ ] **Step 2: Add the runtime frontend types**

Append to `app/types/index.ts`:
```ts
// --- Social Inbox (Slice 2) ---
export type SocialChannelType = 'comment' | 'dm' | 'mention' | 'review'

export interface SocialConversation {
  id: string
  client_id: string
  social_account_id: string | null
  platform: string
  channel_type: SocialChannelType
  permalink: string | null
  participant_name: string | null
  participant_handle: string | null
  status: 'open' | 'snoozed' | 'closed'
  last_message_at: string | null
  last_message_preview: string | null
  last_message_direction: 'in' | 'out' | null
  unread_count: number
  message_count: number
  rating: number | null
  tags: string[] | null
  created_at: string
}

export interface SocialMessage {
  id: string
  conversation_id: string
  platform_message_id: string | null
  direction: 'in' | 'out'
  author_name: string | null
  message_type: string
  content: string | null
  attachments: Array<{ url: string; type: string }>
  is_internal_note: boolean
  platform_timestamp: string | null
  created_at: string
}
```

- [ ] **Step 3: Typecheck**

Run: `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck 2>&1 | grep -c socialInbox || true`
Expected: `0` (no new errors referencing the new types).

- [ ] **Step 4: Commit**

```bash
git add server/utils/socialInbox/types.ts app/types/index.ts
git commit -m "feat(social-inbox): shared conversation/message types"
```

---

## Task 3: `normalizeEvent` (pure, TDD)

**Files:**
- Create: `server/utils/socialInbox/normalize.ts`
- Test: `tests/socialInbox/normalize.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/socialInbox/normalize.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeInboxItem, normalizeMetaCommentWebhook } from '~~/server/utils/socialInbox/normalize'
import type { InboxItem } from '~~/server/utils/socialInbox/types'

describe('normalizeInboxItem', () => {
  it('maps a polled YouTube comment to a NormalizedEvent', () => {
    const item: InboxItem = {
      channelType: 'comment',
      platformConversationId: 'video_abc',
      permalink: 'https://youtu.be/abc',
      participant: { id: 'u1', name: 'Jane' },
      platformMessageId: 'cmt_1',
      authorId: 'u1', authorName: 'Jane',
      content: 'Great video!',
      platformTimestamp: '2026-06-01T00:00:00Z',
    }
    const ev = normalizeInboxItem('youtube', item)
    expect(ev.platform).toBe('youtube')
    expect(ev.channelType).toBe('comment')
    expect(ev.platformConversationId).toBe('video_abc')
    expect(ev.message.direction).toBe('in')
    expect(ev.message.platformMessageId).toBe('cmt_1')
    expect(ev.message.content).toBe('Great video!')
  })

  it('carries rating through for reviews', () => {
    const item: InboxItem = {
      channelType: 'review', platformConversationId: 'rev_9', participant: { name: 'Bob' },
      platformMessageId: 'rev_9', content: 'Five stars', rating: 5,
    }
    const ev = normalizeInboxItem('google-business', item)
    expect(ev.rating).toBe(5)
    expect(ev.message.messageType).toBe('review')
  })
})

describe('normalizeMetaCommentWebhook', () => {
  it('extracts a comment from a page feed change', () => {
    const change = {
      field: 'feed',
      value: {
        item: 'comment', verb: 'add', comment_id: 'c_1', post_id: 'p_1',
        message: 'Nice!', from: { id: 'fb_u', name: 'Ann' }, created_time: 1735689600,
      },
    }
    const ev = normalizeMetaCommentWebhook('facebook', change)
    expect(ev?.channelType).toBe('comment')
    expect(ev?.platformConversationId).toBe('p_1')
    expect(ev?.message.platformMessageId).toBe('c_1')
    expect(ev?.message.content).toBe('Nice!')
    expect(ev?.participant.name).toBe('Ann')
  })

  it('returns null for non-comment changes', () => {
    expect(normalizeMetaCommentWebhook('facebook', { field: 'feed', value: { item: 'like', verb: 'add' } })).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/socialInbox/normalize.test.ts`
Expected: FAIL — module/exports not found.

- [ ] **Step 3: Implement**

```ts
// server/utils/socialInbox/normalize.ts
import type { InboxItem, NormalizedEvent } from './types'

/** Map a provider-fetched InboxItem (already half-normalized) into a NormalizedEvent. */
export function normalizeInboxItem(platform: string, item: InboxItem): NormalizedEvent {
  return {
    platform,
    channelType: item.channelType,
    platformConversationId: item.platformConversationId,
    permalink: item.permalink,
    participant: item.participant ?? {},
    rating: item.rating,
    message: {
      platformMessageId: item.platformMessageId,
      direction: 'in',
      authorId: item.authorId,
      authorName: item.authorName ?? item.participant?.name,
      messageType: item.messageType ?? (item.channelType === 'review' ? 'review' : 'comment'),
      content: item.content,
      attachments: item.attachments,
      platformTimestamp: item.platformTimestamp,
    },
  }
}

/** Map one Meta webhook `feed` change into a NormalizedEvent, or null if not a comment add. */
export function normalizeMetaCommentWebhook(platform: string, change: any): NormalizedEvent | null {
  const v = change?.value
  if (change?.field !== 'feed' || v?.item !== 'comment' || v?.verb !== 'add') return null
  if (!v.comment_id || !v.post_id) return null
  return {
    platform,
    channelType: 'comment',
    platformConversationId: String(v.post_id),
    permalink: v.permalink_url,
    participant: { id: v.from?.id, name: v.from?.name },
    message: {
      platformMessageId: String(v.comment_id),
      direction: 'in',
      authorId: v.from?.id,
      authorName: v.from?.name,
      messageType: 'comment',
      content: v.message ?? '',
      platformTimestamp: v.created_time ? new Date(v.created_time * 1000).toISOString() : undefined,
    },
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run tests/socialInbox/normalize.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/socialInbox/normalize.ts tests/socialInbox/normalize.test.ts
git commit -m "feat(social-inbox): normalizeEvent layer (poll + Meta-comment webhook)"
```

---

## Task 4: Idempotent store helpers (TDD against a fake db)

**Files:**
- Create: `server/utils/socialInbox/store.ts`
- Test: `tests/socialInbox/store.test.ts`

The store takes an injected query runner so it's unit-testable without a live DB.

- [ ] **Step 1: Write the failing test**

```ts
// tests/socialInbox/store.test.ts
import { describe, it, expect, vi } from 'vitest'
import { recordInbound } from '~~/server/utils/socialInbox/store'
import type { NormalizedEvent } from '~~/server/utils/socialInbox/types'

const ev: NormalizedEvent = {
  platform: 'youtube', channelType: 'comment', platformConversationId: 'v1',
  participant: { id: 'u1', name: 'Jane' },
  message: { platformMessageId: 'c1', direction: 'in', authorName: 'Jane', messageType: 'comment', content: 'hi' },
}

describe('recordInbound', () => {
  it('upserts the conversation then inserts the message and bumps counters', async () => {
    const calls: string[] = []
    const db = {
      queryOne: vi.fn(async (sql: string) => {
        calls.push(sql.trim().split('\n')[0])
        return { id: 'conv-1' }
      }),
      execute: vi.fn(async (sql: string) => { calls.push(sql.trim().split('\n')[0]); return 1 }),
    }
    const res = await recordInbound(db as any, 'client-1', 'acct-1', ev)
    expect(res.conversationId).toBe('conv-1')
    // conversation upsert happens before message insert
    expect(calls[0]).toMatch(/INSERT INTO social_conversations/i)
    expect(calls.some(c => /INSERT INTO social_messages/i.test(c))).toBe(true)
  })

  it('is idempotent — a duplicate platform_message_id inserts no second message', async () => {
    const db = {
      queryOne: vi.fn(async () => ({ id: 'conv-1' })),
      execute: vi.fn(async (sql: string) => (/INSERT INTO social_messages/i.test(sql) ? 0 : 1)), // ON CONFLICT DO NOTHING → 0 rows
    }
    const res = await recordInbound(db as any, 'client-1', 'acct-1', ev)
    expect(res.inserted).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/socialInbox/store.test.ts`
Expected: FAIL — `recordInbound` not found.

- [ ] **Step 3: Implement**

```ts
// server/utils/socialInbox/store.ts
import type { NormalizedEvent } from './types'

export interface DbRunner {
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>
  execute(sql: string, params?: any[]): Promise<number>
}

/** Upsert the conversation for an event, returning its id. */
async function upsertConversation(db: DbRunner, clientId: string, accountId: string, ev: NormalizedEvent): Promise<string> {
  const row = await db.queryOne<{ id: string }>(
    `INSERT INTO social_conversations
       (client_id, social_account_id, platform, channel_type, platform_conversation_id,
        permalink, participant_id, participant_name, participant_handle, rating,
        last_message_at, last_message_preview, last_message_direction, message_count, unread_count, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, COALESCE($11, NOW()), $12, $13, 1, 1, NOW())
     ON CONFLICT (social_account_id, channel_type, platform_conversation_id) DO UPDATE SET
       last_message_at = COALESCE(EXCLUDED.last_message_at, social_conversations.last_message_at),
       last_message_preview = EXCLUDED.last_message_preview,
       last_message_direction = EXCLUDED.last_message_direction,
       message_count = social_conversations.message_count + 1,
       unread_count = social_conversations.unread_count + (CASE WHEN EXCLUDED.last_message_direction = 'in' THEN 1 ELSE 0 END),
       status = CASE WHEN social_conversations.status = 'closed' THEN 'open' ELSE social_conversations.status END,
       updated_at = NOW()
     RETURNING id`,
    [clientId, accountId, ev.platform, ev.channelType, ev.platformConversationId,
     ev.permalink ?? null, ev.participant.id ?? null, ev.participant.name ?? null, ev.participant.handle ?? null,
     ev.rating ?? null, ev.message.platformTimestamp ?? null,
     (ev.message.content ?? '').slice(0, 200), ev.message.direction],
  )
  if (!row) throw new Error('upsertConversation: no id returned')
  return row.id
}

/** Insert a message; ON CONFLICT DO NOTHING makes it idempotent. Returns rows affected. */
async function insertMessage(db: DbRunner, conversationId: string, clientId: string, ev: NormalizedEvent): Promise<number> {
  return db.execute(
    `INSERT INTO social_messages
       (conversation_id, client_id, platform_message_id, direction, author_id, author_name,
        message_type, content, attachments, platform_timestamp)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
     ON CONFLICT (conversation_id, platform_message_id) WHERE platform_message_id IS NOT NULL DO NOTHING`,
    [conversationId, clientId, ev.message.platformMessageId, ev.message.direction,
     ev.message.authorId ?? null, ev.message.authorName ?? null, ev.message.messageType,
     ev.message.content ?? '', JSON.stringify(ev.message.attachments ?? []), ev.message.platformTimestamp ?? null],
  )
}

/** Record an inbound event: upsert conversation, idempotently insert the message. */
export async function recordInbound(db: DbRunner, clientId: string, accountId: string, ev: NormalizedEvent) {
  const conversationId = await upsertConversation(db, clientId, accountId, ev)
  const affected = await insertMessage(db, conversationId, clientId, ev)
  return { conversationId, inserted: affected > 0 }
}

/** Record an outbound reply we just sent (direction='out'); also stamps the conversation. */
export async function recordOutbound(
  db: DbRunner, conversationId: string, clientId: string,
  args: { platformMessageId: string | null; content: string; sentByUserId: string; messageType?: string },
): Promise<void> {
  await db.execute(
    `INSERT INTO social_messages
       (conversation_id, client_id, platform_message_id, direction, message_type, content, sent_by_user_id, platform_timestamp)
     VALUES ($1,$2,$3,'out',$4,$5,$6, NOW())`,
    [conversationId, clientId, args.platformMessageId, args.messageType ?? 'text', args.content, args.sentByUserId],
  )
  await db.execute(
    `UPDATE social_conversations SET
       last_message_at = NOW(), last_message_preview = $2, last_message_direction = 'out',
       message_count = message_count + 1, unread_count = 0, updated_at = NOW()
     WHERE id = $1`,
    [conversationId, args.content.slice(0, 200)],
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run tests/socialInbox/store.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/socialInbox/store.ts tests/socialInbox/store.test.ts
git commit -m "feat(social-inbox): idempotent conversation/message store helpers"
```

---

## Task 5: Extend the provider interface with `fetchInbox`/`reply`

**Files:**
- Modify: `server/utils/social-providers/types.ts`

- [ ] **Step 1: Add the inbox types + optional methods**

Append to `server/utils/social-providers/types.ts`:
```ts
import type { InboxItem } from '~~/server/utils/socialInbox/types'

export interface FetchInboxParams {
  accountId: string
  accessToken: string
  /** opaque cursor from the last sync (page token / ISO ts / last id) */
  cursor?: string | null
}

export interface FetchInboxResult {
  items: InboxItem[]
  /** cursor to persist for the next sync */
  nextCursor?: string | null
}

export interface ReplyParams {
  accountId: string
  accessToken: string
  /** platform conversation id (post id / review id) */
  conversationId: string
  content: string
}
```
And add to the `SocialPostProvider` interface (after `comment?`):
```ts
  /** Optional: pull new comments/reviews since a cursor (poll path). */
  fetchInbox?(params: FetchInboxParams): Promise<FetchInboxResult>
  /** Optional: post a reply to a comment/review thread. Returns the platform id of the reply. */
  reply?(params: ReplyParams): Promise<{ platformMessageId: string; status: 'success' | 'failed'; error?: string }>
```

- [ ] **Step 2: Typecheck**

Run: `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck 2>&1 | grep -c "social-providers/types" || true`
Expected: `0`.

- [ ] **Step 3: Commit**

```bash
git add server/utils/social-providers/types.ts
git commit -m "feat(social-inbox): add fetchInbox/reply to provider interface"
```

---

## Task 6: YouTube provider — `fetchInbox` + `reply` (comments)

**Files:**
- Modify: `server/utils/social-providers/youtube.ts`
- Test: `tests/socialInbox/youtube-inbox.test.ts`

YouTube Data API v3: list comment threads for the channel via `commentThreads?allThreadsRelatedToChannelId=`; reply via `comments.insert` with `parentId`. The response→`InboxItem[]` mapping is a pure function we TDD.

- [ ] **Step 1: Write the failing test for the response mapper**

```ts
// tests/socialInbox/youtube-inbox.test.ts
import { describe, it, expect } from 'vitest'
import { mapYouTubeThreads } from '~~/server/utils/social-providers/youtube'

describe('mapYouTubeThreads', () => {
  it('maps commentThreads.list items to InboxItems', () => {
    const api = {
      items: [{
        snippet: {
          videoId: 'vid1',
          topLevelComment: {
            id: 'cmt1',
            snippet: {
              textDisplay: 'Loved it', authorDisplayName: 'Jane',
              authorChannelId: { value: 'uc_jane' }, publishedAt: '2026-06-01T00:00:00Z',
            },
          },
        },
      }],
      nextPageToken: 'PAGE2',
    }
    const { items, nextCursor } = mapYouTubeThreads(api)
    expect(nextCursor).toBe('PAGE2')
    expect(items[0]).toMatchObject({
      channelType: 'comment', platformConversationId: 'vid1', platformMessageId: 'cmt1',
      content: 'Loved it', authorName: 'Jane',
    })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/socialInbox/youtube-inbox.test.ts`
Expected: FAIL — `mapYouTubeThreads` not exported.

- [ ] **Step 3: Implement (export the mapper + wire fetchInbox/reply)**

Add to `server/utils/social-providers/youtube.ts`:
```ts
import type { FetchInboxParams, FetchInboxResult, ReplyParams } from './types'
import type { InboxItem } from '~~/server/utils/socialInbox/types'

/** Pure: map a YouTube commentThreads.list response to InboxItems + next cursor. */
export function mapYouTubeThreads(api: any): FetchInboxResult {
  const items: InboxItem[] = (api?.items ?? []).map((t: any) => {
    const c = t.snippet?.topLevelComment
    const s = c?.snippet ?? {}
    return {
      channelType: 'comment' as const,
      platformConversationId: String(t.snippet?.videoId ?? ''),
      permalink: t.snippet?.videoId ? `https://youtu.be/${t.snippet.videoId}` : undefined,
      participant: { id: s.authorChannelId?.value, name: s.authorDisplayName },
      platformMessageId: String(c?.id ?? ''),
      authorId: s.authorChannelId?.value,
      authorName: s.authorDisplayName,
      content: s.textDisplay ?? '',
      messageType: 'comment',
      platformTimestamp: s.publishedAt,
    }
  })
  return { items, nextCursor: api?.nextPageToken ?? null }
}
```
Then attach the methods to the exported `youtubeProvider` object:
```ts
youtubeProvider.fetchInbox = async ({ accessToken, cursor }: FetchInboxParams): Promise<FetchInboxResult> => {
  const url = new URL('https://www.googleapis.com/youtube/v3/commentThreads')
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('allThreadsRelatedToChannelId', 'MINE') // resolved server-side via the channel; see note
  url.searchParams.set('maxResults', '50')
  if (cursor) url.searchParams.set('pageToken', cursor)
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error(`youtube fetchInbox ${res.status}`)
  return mapYouTubeThreads(await res.json())
}

youtubeProvider.reply = async ({ accessToken, conversationId, content }: ReplyParams) => {
  // conversationId here carries the parent comment thread id for a reply
  const res = await fetch('https://www.googleapis.com/youtube/v3/comments?part=snippet', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ snippet: { parentId: conversationId, textOriginal: content } }),
  })
  const j: any = await res.json().catch(() => ({}))
  return res.ok
    ? { platformMessageId: String(j.id ?? ''), status: 'success' as const }
    : { platformMessageId: '', status: 'failed' as const, error: j?.error?.message ?? `http ${res.status}` }
}
```
> Note for the engineer: `allThreadsRelatedToChannelId` needs the channel id, not `MINE`; resolve it from `social_accounts.platform_account_id` and substitute. Left explicit so the channel-id source is obvious.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run tests/socialInbox/youtube-inbox.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/social-providers/youtube.ts tests/socialInbox/youtube-inbox.test.ts
git commit -m "feat(social-inbox): youtube fetchInbox/reply for comments"
```

---

## Task 7: Google Business + Facebook review providers — `fetchInbox` + `reply`

**Files:**
- Modify: `server/utils/social-providers/google-business.ts`, `server/utils/social-providers/facebook.ts`
- Test: `tests/socialInbox/reviews-inbox.test.ts`

GBP reviews: `accounts/*/locations/*/reviews` (read) + `.../reviews/*/reply` (PUT). FB: page `ratings` edge for recommendations + reply via comment on the recommendation. TDD the two response mappers.

- [ ] **Step 1: Write the failing test**

```ts
// tests/socialInbox/reviews-inbox.test.ts
import { describe, it, expect } from 'vitest'
import { mapGoogleReviews } from '~~/server/utils/social-providers/google-business'
import { mapFacebookRatings } from '~~/server/utils/social-providers/facebook'

describe('mapGoogleReviews', () => {
  it('maps GBP reviews to InboxItems with rating', () => {
    const api = { reviews: [{
      reviewId: 'r1', comment: 'Great service', starRating: 'FIVE',
      reviewer: { displayName: 'Sam' }, createTime: '2026-06-01T00:00:00Z',
      name: 'accounts/1/locations/2/reviews/r1',
    }], nextPageToken: 'NX' }
    const { items, nextCursor } = mapGoogleReviews(api)
    expect(nextCursor).toBe('NX')
    expect(items[0]).toMatchObject({ channelType: 'review', platformMessageId: 'r1', rating: 5, content: 'Great service' })
  })
})

describe('mapFacebookRatings', () => {
  it('maps FB recommendations to InboxItems', () => {
    const api = { data: [{
      open_graph_story: { id: 'og1' }, recommendation_type: 'positive',
      review_text: 'Recommend!', reviewer: { name: 'Pat', id: 'p1' }, created_time: '2026-06-01T00:00:00Z',
    }], paging: { cursors: { after: 'AFTER' } } }
    const { items, nextCursor } = mapFacebookRatings(api)
    expect(nextCursor).toBe('AFTER')
    expect(items[0]).toMatchObject({ channelType: 'review', content: 'Recommend!', authorName: 'Pat' })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/socialInbox/reviews-inbox.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the mappers + methods**

Add to `server/utils/social-providers/google-business.ts`:
```ts
import type { FetchInboxParams, FetchInboxResult, ReplyParams } from './types'
import type { InboxItem } from '~~/server/utils/socialInbox/types'

const STAR: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }

export function mapGoogleReviews(api: any): FetchInboxResult {
  const items: InboxItem[] = (api?.reviews ?? []).map((r: any) => ({
    channelType: 'review' as const,
    platformConversationId: String(r.reviewId ?? r.name ?? ''),
    permalink: undefined,
    participant: { name: r.reviewer?.displayName },
    platformMessageId: String(r.reviewId ?? ''),
    authorName: r.reviewer?.displayName,
    content: r.comment ?? '',
    messageType: 'review',
    rating: STAR[r.starRating] ?? undefined,
    platformTimestamp: r.createTime,
    // stash the full resource name so reply() can target it
    attachments: r.name ? [{ url: r.name, type: 'gbp-resource' }] : undefined,
  }))
  return { items, nextCursor: api?.nextPageToken ?? null }
}
```
Wire `googleBusinessProvider.fetchInbox` (GET `https://mybusiness.googleapis.com/v4/{location}/reviews?pageToken=`) and `googleBusinessProvider.reply` (PUT `.../reviews/{id}/reply` with `{ comment }`), following the YouTube method-attachment pattern from Task 6 (Authorization Bearer, map non-2xx → `{status:'failed'}`).

Add to `server/utils/social-providers/facebook.ts`:
```ts
export function mapFacebookRatings(api: any): FetchInboxResult {
  const items: InboxItem[] = (api?.data ?? []).map((r: any) => ({
    channelType: 'review' as const,
    platformConversationId: String(r.open_graph_story?.id ?? r.reviewer?.id ?? ''),
    participant: { id: r.reviewer?.id, name: r.reviewer?.name },
    platformMessageId: String(r.open_graph_story?.id ?? `${r.reviewer?.id}_${r.created_time}`),
    authorName: r.reviewer?.name,
    content: r.review_text ?? '',
    messageType: 'review',
    rating: r.recommendation_type === 'positive' ? 5 : r.recommendation_type === 'negative' ? 1 : undefined,
    platformTimestamp: r.created_time,
  }))
  return { items, nextCursor: api?.paging?.cursors?.after ?? null }
}
```
Wire `facebookProvider.fetchInbox` for both `feed` comments and `ratings` (the engineer splits by `channel_type`; for 2a the cron only calls the review path for FB since FB comments arrive by webhook) and `facebookProvider.reply` (POST `/{comment_or_object_id}/comments` with `{ message }` on the page token), reusing the existing Graph base URL/version constant already in this file.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run tests/socialInbox/reviews-inbox.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/social-providers/google-business.ts server/utils/social-providers/facebook.ts tests/socialInbox/reviews-inbox.test.ts
git commit -m "feat(social-inbox): GBP + Facebook review fetchInbox/reply"
```

---

## Task 8: LinkedIn + TikTok comment providers (best-effort)

**Files:**
- Modify: `server/utils/social-providers/linkedin.ts`, `server/utils/social-providers/tiktok.ts`
- Test: `tests/socialInbox/linkedin-tiktok-inbox.test.ts`

LinkedIn: `socialActions/{shareUrn}/comments` (read + create). TikTok: `v2/video/comment/list/` (read; reply via `comment/reply/create/` where the app has the scope). Same pattern — TDD the pure mapper for each, wire `fetchInbox`/`reply`. If TikTok comment-reply scope is unavailable, `reply` returns `{ status:'failed', error:'tiktok reply not available' }` (no throw).

- [ ] **Step 1–5:** Mirror Task 6/7 exactly: write `mapLinkedInComments(api)` and `mapTikTokComments(api)` pure mappers returning `FetchInboxResult` (`channelType:'comment'`), test each maps a representative response, implement, wire methods, run, commit.

```bash
git commit -m "feat(social-inbox): linkedin + tiktok comment fetchInbox/reply (best-effort)"
```

---

## Task 9: Meta comment webhook endpoint

**Files:**
- Create: `server/api/webhooks/social/meta.post.ts`, `server/api/webhooks/social/meta.get.ts`
- Test: `tests/socialInbox/meta-webhook.test.ts`

GET = subscription verify-challenge. POST = HMAC-verified comment events → `normalizeMetaCommentWebhook` → `recordInbound`. Must be exempt from the RBAC write-block (webhook exemption, like Xero) — verify the middleware path-prefix list includes `/api/webhooks/`.

- [ ] **Step 1: Write the failing test for HMAC verification**

```ts
// tests/socialInbox/meta-webhook.test.ts
import { describe, it, expect } from 'vitest'
import { verifyMetaSignature } from '~~/server/utils/socialInbox/metaWebhook'
import crypto from 'node:crypto'

describe('verifyMetaSignature', () => {
  const secret = 'appsecret'
  const body = JSON.stringify({ object: 'page', entry: [] })
  const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex')
  it('accepts a correct signature', () => expect(verifyMetaSignature(body, sig, secret)).toBe(true))
  it('rejects a tampered body', () => expect(verifyMetaSignature(body + 'x', sig, secret)).toBe(false))
  it('rejects a missing signature', () => expect(verifyMetaSignature(body, undefined, secret)).toBe(false))
})
```

- [ ] **Step 2: Run to verify it fails.** `pnpm exec vitest run tests/socialInbox/meta-webhook.test.ts` → FAIL.

- [ ] **Step 3: Implement the verifier + the handlers**

```ts
// server/utils/socialInbox/metaWebhook.ts
import crypto from 'node:crypto'
export function verifyMetaSignature(rawBody: string, signature: string | undefined, appSecret: string): boolean {
  if (!signature?.startsWith('sha256=')) return false
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')
  const a = Buffer.from(signature); const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
```
```ts
// server/api/webhooks/social/meta.get.ts — subscription verification
export default defineEventHandler((event) => {
  const q = getQuery(event)
  if (q['hub.mode'] === 'subscribe' && q['hub.verify_token'] === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return q['hub.challenge']
  }
  throw createError({ statusCode: 403, statusMessage: 'verify failed' })
})
```
```ts
// server/api/webhooks/social/meta.post.ts
import { readRawBody, getHeader } from 'h3'
import { queryOne, execute } from '~~/server/utils/db'
import { verifyMetaSignature } from '~~/server/utils/socialInbox/metaWebhook'
import { normalizeMetaCommentWebhook } from '~~/server/utils/socialInbox/normalize'
import { recordInbound } from '~~/server/utils/socialInbox/store'

export default defineEventHandler(async (event) => {
  const raw = (await readRawBody(event)) || ''
  const sig = getHeader(event, 'x-hub-signature-256')
  const secret = process.env.META_APP_SECRET || ''
  if (!import.meta.dev && !verifyMetaSignature(raw, sig, secret)) {
    throw createError({ statusCode: 401, statusMessage: 'bad signature' })
  }
  const payload = JSON.parse(raw || '{}')
  for (const entry of payload.entry ?? []) {
    const pageId = String(entry.id)
    const account = await queryOne<{ id: string; client_id: string }>(
      `SELECT id, client_id FROM social_accounts WHERE platform_account_id = $1 AND is_active = TRUE LIMIT 1`, [pageId],
    )
    if (!account) continue
    const platform = payload.object === 'instagram' ? 'instagram' : 'facebook'
    for (const change of entry.changes ?? []) {
      const ev = normalizeMetaCommentWebhook(platform, change)
      if (ev) await recordInbound({ queryOne, execute }, account.client_id, account.id, ev)
    }
  }
  return { ok: true }
})
```

- [ ] **Step 4: Run to verify it passes.** `pnpm exec vitest run tests/socialInbox/meta-webhook.test.ts` → PASS (3 tests).

- [ ] **Step 5: Verify the RBAC middleware exempts `/api/webhooks/`.**

Run: `grep -rn "webhooks" server/middleware/rbac.ts`
Expected: a path-prefix exemption covering `/api/webhooks/`. If absent, add `/api/webhooks/` to the exempt list in `server/middleware/rbac.ts` and commit that change with this task.

- [ ] **Step 6: Commit**

```bash
git add server/api/webhooks/social/ server/utils/socialInbox/metaWebhook.ts tests/socialInbox/meta-webhook.test.ts
git commit -m "feat(social-inbox): Meta comment webhook (HMAC-verified) + verify challenge"
```

---

## Task 10: Poll cron `/api/cron/sync-social-inbox`

**Files:**
- Create: `server/api/cron/sync-social-inbox.post.ts`

Mirrors `publish-social-posts.post.ts`: `x-cron-secret` gate; for each active account whose provider has `fetchInbox`, sync each supported poll channel using the per-account cursor, write items via `recordInbound`, advance the cursor.

- [ ] **Step 1: Implement**

```ts
// server/api/cron/sync-social-inbox.post.ts
import { defineEventHandler, getHeader, createError } from 'h3'
import { queryRows, queryOne, execute } from '~~/server/utils/db'
import { getProvider } from '~~/server/utils/social-providers/registry'
import { normalizeInboxItem } from '~~/server/utils/socialInbox/normalize'
import { recordInbound } from '~~/server/utils/socialInbox/store'

// Which channels each platform polls (comments+reviews only in 2a; webhooks cover Meta comments).
const POLL_CHANNELS: Record<string, Array<'comment' | 'review'>> = {
  youtube: ['comment'], linkedin: ['comment'], tiktok: ['comment'],
  'google-business': ['review'], facebook: ['review'],
}

export default defineEventHandler(async (event) => {
  const secret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && secret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const accounts = await queryRows<any>(
    `SELECT id, client_id, platform, platform_account_id, access_token
       FROM social_accounts WHERE is_active = TRUE AND access_token IS NOT NULL`,
  )
  let synced = 0
  for (const acct of accounts) {
    const provider = getProvider(acct.platform)
    if (!provider?.fetchInbox) continue
    for (const channel of POLL_CHANNELS[acct.platform] ?? []) {
      const cur = await queryOne<{ cursor: string | null }>(
        `SELECT cursor FROM social_sync_cursors WHERE social_account_id=$1 AND channel_type=$2`, [acct.id, channel],
      )
      try {
        const { items, nextCursor } = await provider.fetchInbox({
          accountId: acct.platform_account_id, accessToken: acct.access_token, cursor: cur?.cursor ?? null,
        })
        for (const item of items.filter(i => i.channelType === channel)) {
          const res = await recordInbound({ queryOne, execute }, acct.client_id, acct.id, normalizeInboxItem(acct.platform, item))
          if (res.inserted) synced++
        }
        await execute(
          `INSERT INTO social_sync_cursors (social_account_id, channel_type, cursor, last_synced_at, last_error, updated_at)
           VALUES ($1,$2,$3, NOW(), NULL, NOW())
           ON CONFLICT (social_account_id, channel_type) DO UPDATE SET
             cursor=EXCLUDED.cursor, last_synced_at=NOW(), last_error=NULL, updated_at=NOW()`,
          [acct.id, channel, nextCursor ?? null],
        )
      } catch (e: any) {
        await execute(
          `INSERT INTO social_sync_cursors (social_account_id, channel_type, last_synced_at, last_error, updated_at)
           VALUES ($1,$2, NOW(), $3, NOW())
           ON CONFLICT (social_account_id, channel_type) DO UPDATE SET last_synced_at=NOW(), last_error=$3, updated_at=NOW()`,
          [acct.id, channel, String(e?.message ?? e).slice(0, 500)],
        )
      }
    }
  }
  console.log('social-inbox-sync.run', { accounts: accounts.length, synced })
  return { synced }
})
```

- [ ] **Step 2: Smoke locally**

Run (dev server up): `curl -s -X POST http://localhost:3000/api/cron/sync-social-inbox`
Expected: `{"synced":0}` (no connected accounts yet) and no 500.

- [ ] **Step 3: Commit**

```bash
git add server/api/cron/sync-social-inbox.post.ts
git commit -m "feat(social-inbox): poll cron sync-social-inbox (comments + reviews)"
```

---

## Task 11: Companion Worker `social-inbox-cron`

**Files:**
- Create: `workers/social-inbox-cron/{wrangler.toml,package.json,src/index.ts}`

Copy `workers/social-dispatch-cron` verbatim, changing the name, the cron, and the target path. **Deploy gotcha (from project memory):** deploy from a copy OUTSIDE the repo tree to dodge the root `.wrangler/deploy/config.json` redirect.

- [ ] **Step 1: Create the three files**

`wrangler.toml`:
```toml
name = "social-inbox-cron"
main = "src/index.ts"
compatibility_date = "2025-12-01"

[triggers]
crons = [ "*/5 * * * *" ]   # poll comments + reviews every 5 min

[vars]
APP_BASE_URL = "https://agency-dashboard-6cm.pages.dev"
# CRON_SECRET set via: wrangler secret put CRON_SECRET (must match the Pages project)
```
`src/index.ts`:
```ts
interface Env { APP_BASE_URL: string; CRON_SECRET: string }
export default {
  async scheduled(_c: ScheduledController, env: Env) {
    const res = await fetch(`${env.APP_BASE_URL}/api/cron/sync-social-inbox`, {
      method: 'POST', headers: { 'x-cron-secret': env.CRON_SECRET },
    })
    console.log('social-inbox-cron.run', { status: res.status, body: (await res.text()).slice(0, 200) })
  },
}
```
`package.json`: copy `workers/social-dispatch-cron/package.json`, change `"name"` to `"social-inbox-cron"`.

- [ ] **Step 2: Commit (deploy is an operator step at release, not now)**

```bash
git add workers/social-inbox-cron/
git commit -m "feat(social-inbox): social-inbox-cron companion Worker"
```

> Release note (do NOT run during build): deploy from an isolated copy — `cp -R workers/social-inbox-cron /tmp/sic && cd /tmp/sic && <repo>/node_modules/.bin/wrangler deploy && wrangler secret put CRON_SECRET`.

---

## Task 12: Agency API — conversations list + get + patch

**Files:**
- Create: `server/api/agency/social/inbox/conversations/index.get.ts`, `[id]/index.get.ts`, `[id]/index.patch.ts`

- [ ] **Step 1: List endpoint**

```ts
// server/api/agency/social/inbox/conversations/index.get.ts
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = getQuery(event)
  const clientId = q.clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  const params: any[] = [clientId]
  let sql = `SELECT * FROM social_conversations WHERE client_id = $1`
  for (const [col, key] of [['channel_type', 'channel'], ['platform', 'platform'], ['status', 'status']] as const) {
    if (q[key]) { params.push(q[key]); sql += ` AND ${col} = $${params.length}` }
  }
  params.push(Math.min(Number(q.limit) || 100, 500))
  sql += ` ORDER BY last_message_at DESC NULLS LAST LIMIT $${params.length}`
  return await queryRows(sql, params)
})
```

- [ ] **Step 2: Get-with-messages endpoint**

```ts
// server/api/agency/social/inbox/conversations/[id]/index.get.ts
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const conversation = await queryOne(`SELECT * FROM social_conversations WHERE id = $1`, [id])
  if (!conversation) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const messages = await queryRows(
    `SELECT * FROM social_messages WHERE conversation_id = $1 ORDER BY platform_timestamp ASC NULLS FIRST, created_at ASC`, [id],
  )
  return { conversation, messages }
})
```

- [ ] **Step 3: Patch (status / mark-read) endpoint**

```ts
// server/api/agency/social/inbox/conversations/[id]/index.patch.ts
import { requireAuth } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const sets: string[] = []; const params: any[] = []
  if (body.status && ['open', 'snoozed', 'closed'].includes(body.status)) { params.push(body.status); sets.push(`status = $${params.length}`) }
  if (body.markRead === true) sets.push(`unread_count = 0`)
  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'nothing to update' })
  params.push(id)
  await execute(`UPDATE social_conversations SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`, params)
  return { ok: true }
})
```

- [ ] **Step 4: Smoke + Commit**

Run (dev): `curl -s "http://localhost:3000/api/agency/social/inbox/conversations?clientId=<a-real-client-uuid>"` → `[]` (200) once authed.
```bash
git add server/api/agency/social/inbox/conversations/
git commit -m "feat(social-inbox): conversations list/get/patch API"
```

---

## Task 13: Agency API — manual reply + manual sync

**Files:**
- Create: `server/api/agency/social/inbox/conversations/[id]/reply.post.ts`, `server/api/agency/social/inbox/accounts/sync.post.ts`

- [ ] **Step 1: Reply endpoint** (loads the conversation + its account, calls `provider.reply`, records outbound)

```ts
// server/api/agency/social/inbox/conversations/[id]/reply.post.ts
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, execute } from '~~/server/utils/db'
import { getProviderOrThrow } from '~~/server/utils/social-providers/registry'
import { recordOutbound } from '~~/server/utils/socialInbox/store'
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const { content } = await readBody(event)
  if (!content?.trim()) throw createError({ statusCode: 400, statusMessage: 'content required' })
  const conv = await queryOne<any>(
    `SELECT c.*, a.platform_account_id, a.access_token
       FROM social_conversations c JOIN social_accounts a ON a.id = c.social_account_id WHERE c.id = $1`, [id],
  )
  if (!conv) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const provider = getProviderOrThrow(conv.platform)
  if (!provider.reply) throw createError({ statusCode: 400, statusMessage: `${conv.platform} replies not supported` })
  const r = await provider.reply({
    accountId: conv.platform_account_id, accessToken: conv.access_token,
    conversationId: conv.platform_conversation_id, content: content.trim(),
  })
  if (r.status !== 'success') throw createError({ statusCode: 502, statusMessage: r.error || 'reply failed' })
  await recordOutbound({ queryOne, execute }, id, conv.client_id, {
    platformMessageId: r.platformMessageId, content: content.trim(), sentByUserId: String(user.id),
  })
  return { ok: true, platformMessageId: r.platformMessageId }
})
```

- [ ] **Step 2: Manual-sync endpoint** — thin wrapper that POSTs the cron internally for one client (calls `$fetch('/api/cron/sync-social-inbox', { method:'POST', headers:{ 'x-cron-secret': process.env.CRON_SECRET } })`), so the UI "Refresh" button works without waiting for the 5-min tick.

- [ ] **Step 3: Commit**

```bash
git add server/api/agency/social/inbox/
git commit -m "feat(social-inbox): manual reply + manual sync API"
```

---

## Task 14: `useSocialInbox` composable

**Files:**
- Create: `app/composables/useSocialInbox.ts`

- [ ] **Step 1: Implement** (mirrors `useSocialPublishing` — `useFetch` for reads, `$fetch` for mutations)

```ts
// app/composables/useSocialInbox.ts
import type { SocialConversation, SocialMessage } from '~/types'
export function useSocialInbox(clientId: Ref<string>) {
  const conversations = ref<SocialConversation[]>([])
  const loading = ref(false)
  async function load(filters: Record<string, string> = {}) {
    loading.value = true
    try {
      conversations.value = await $fetch<SocialConversation[]>('/api/agency/social/inbox/conversations', {
        query: { clientId: clientId.value, ...filters },
      })
    } finally { loading.value = false }
  }
  async function open(id: string) {
    return await $fetch<{ conversation: SocialConversation; messages: SocialMessage[] }>(
      `/api/agency/social/inbox/conversations/${id}`)
  }
  async function reply(id: string, content: string) {
    return await $fetch(`/api/agency/social/inbox/conversations/${id}/reply`, { method: 'POST', body: { content } })
  }
  async function setStatus(id: string, status: string) {
    return await $fetch(`/api/agency/social/inbox/conversations/${id}`, { method: 'PATCH', body: { status } })
  }
  async function refresh() { return await $fetch('/api/agency/social/inbox/accounts/sync', { method: 'POST', body: { clientId: clientId.value } }) }
  return { conversations, loading, load, open, reply, setStatus, refresh }
}
```

- [ ] **Step 2: Typecheck + Commit**

Run: `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck 2>&1 | grep -c useSocialInbox || true` → `0`.
```bash
git add app/composables/useSocialInbox.ts
git commit -m "feat(social-inbox): useSocialInbox composable"
```

---

## Task 15: Inbox UI — components

**Files:**
- Create: `app/components/social-inbox/{InboxSidebar,InboxThread,InboxComposer,ThreadActionPanel}.vue`

**Before writing any of these, invoke the `frontend-design` skill** (project rule for form-touching work — the composer + filters are forms) and apply it.

Build with Nuxt UI v4 only (no native elements; see CLAUDE.md UI table). Adapt the sibling `UnifiedInbox*` components conceptually — do not copy shadcn markup.

- [ ] **Step 1: `InboxSidebar.vue`** — props `conversations`, `selectedId`; emits `select`. Renders a list: `UAvatar` (participant) + name + `last_message_preview` + a `UBadge` for `platform` and `channel_type` + unread dot (`unread_count > 0`). Filter bar at top: `USelectMenu` for network / channel / status (sentinel `'all'`, never `''`), `UInput` search. Use semantic colors (`text-muted`, `bg-elevated`).
- [ ] **Step 2: `InboxThread.vue`** — props `conversation`, `messages`. Renders the message timeline: inbound left / outbound right bubbles, author + relative time (`date-fns`), `message_type` icon, attachments. Review threads show a `rating` star row.
- [ ] **Step 3: `InboxComposer.vue`** — `UTextarea` (`:rows="4"`, border ring) + send `UButton` (loading state); emits `send(content)`. Disabled with a tooltip when the platform has no `reply` (TikTok best-effort).
- [ ] **Step 4: `ThreadActionPanel.vue`** — status `USelectMenu` (open/snoozed/closed) + "Mark read" `UButton` + permalink link-out `UButton`. (Assignment/tags are 2c — omit.)
- [ ] **Step 5: Typecheck + Commit**

```bash
git add app/components/social-inbox/
git commit -m "feat(social-inbox): inbox UI components (Nuxt UI v4)"
```

---

## Task 16: Inbox + Reviews pages

**Files:**
- Create: `app/pages/agency/social/inbox/index.vue`, `app/pages/agency/social/inbox/reviews.vue`

- [ ] **Step 1: `index.vue`** — three-pane hub. Client picker (reuse the publishing pages' client-select pattern), `useSocialInbox(clientId)`. Left `InboxSidebar` (load on mount + on filter change), center `InboxThread` + `InboxComposer` (calls `reply` then reloads the open thread), right `ThreadActionPanel`. A "Refresh" `UButton` calls `refresh()` then `load()`. `definePageMeta` with the same Creative middleware the publishing pages use.
- [ ] **Step 2: `reviews.vue`** — same composable, pre-filtered `channel_type='review'`. Header shows rating distribution (count by `rating`); list uses `InboxThread` for the selected review; reply via `InboxComposer`.
- [ ] **Step 3: Manual check** — `pnpm dev`, sign in, visit `/agency/social/inbox` and `/agency/social/inbox/reviews`: pages render, client picker works, empty states show, no console errors. (No live data until accounts connect — expected.)
- [ ] **Step 4: Commit**

```bash
git add app/pages/agency/social/inbox/
git commit -m "feat(social-inbox): inbox + reviews pages"
```

---

## Task 17: Nav + marketing sync

**Files:**
- Modify: `app/layouts/agency.vue`, `app/pages/features/index.vue`, `app/pages/features/[slug].vue`, `app/components/MarketingNav.vue`

- [ ] **Step 1: Nav** — in the Creative-gated "Social" group in `app/layouts/agency.vue`, add `Inbox` (`/agency/social/inbox`) and `Reviews` (`/agency/social/inbox/reviews`) alongside Publishing, using the existing item shape + a Lucide icon (`i-lucide-messages-square`, `i-lucide-star`).
- [ ] **Step 2: Marketing** — add a "Social Inbox & Reviews" feature to `features/index.vue` (Social category), a `[slug]` detail entry with 3–4 sections (unified inbox, reviews, multi-network, manual reply now / AI + automation coming), and the MarketingNav mega-menu entry. (Per CLAUDE.md Front-Facing Page Sync rule.)
- [ ] **Step 3: Commit**

```bash
git add app/layouts/agency.vue app/pages/features/ app/components/MarketingNav.vue
git commit -m "feat(social-inbox): nav group + marketing page sync"
```

---

## Task 18: Full-suite test + typecheck gate

- [ ] **Step 1:** `pnpm exec vitest run tests/socialInbox/` → all green.
- [ ] **Step 2:** `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck 2>&1 | tail -5` — confirm **no new** errors vs the repo's pre-existing baseline (grep for `socialInbox|social-inbox|social-providers` → 0).
- [ ] **Step 3:** `grep -rn "@apply.*\b(bg-muted|bg-elevated|bg-default|text-muted|border-default)\b" app/components/social-inbox app/pages/agency/social/inbox` → empty (Tailwind v4 `@apply` of semantic utilities breaks the prod build — project memory).
- [ ] **Step 4: Commit** any fixes, then this phase is ready for PR (off `origin/main`, isolated worktree).

---

## Self-Review (completed during planning)

**Spec coverage (2a rows only):** data model §4 → Task 1; normalization §5 → Task 3; provider `fetchInbox`/`reply` §5 → Tasks 5–8; Meta webhook §5 → Task 9; poll cron + Worker §5 → Tasks 10–11; agency API §10 → Tasks 12–13; composable + UI §10 → Tasks 14–16; nav + marketing §10/§14 → Task 17; security (HMAC §11, SSRF — providers only hit platform hosts, RBAC webhook exemption) → Tasks 9, 12; testing §12 → Tasks 3,4,6,7,9 + gate Task 18. Deferred rows (automation/SLA/portal/DM/real-time) correctly absent.

**Placeholder scan:** Tasks 6–9 carry full code for the testable mappers + verifier; Task 8 explicitly mirrors the fully-shown Task 6/7 pattern (sibling networks, same shape); the YouTube `channel-id` and FB review-reply target are flagged as runtime-resolved with the source named (not vague TODOs).

**Type consistency:** `NormalizedEvent`/`InboxItem` (Task 2) are the single shape produced by `normalizeEvent` (Task 3) + provider `fetchInbox` (Tasks 6–8) and consumed by `recordInbound` (Task 4) and the cron (Task 10); `FetchInboxResult`/`ReplyParams` (Task 5) match every provider impl and the reply endpoint (Task 13); `SocialConversation`/`SocialMessage` (Task 2) match the composable (Task 14) + UI (Tasks 15–16).
