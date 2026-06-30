# Engagement Wall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Engagement Wall under `/agency/social/inbox/wall` that shows source posts grouped from inbox conversations, with comment/review previews and links back into the existing inbox thread.

**Architecture:** Project source-post metadata from message metadata onto `social_conversations` during inbox persistence, then add a focused grouped wall query/API over conversations and recent messages. The wall UI is read-first and reuses the existing inbox thread for detailed reply/assignment work via `?conversation=<id>`.

**Tech Stack:** Nuxt 4, Nuxt UI v4, PostgreSQL SQL migrations, server `queryRows/queryOne/execute`, Vitest query-builder tests, existing Social Suite navigation.

---

## File Structure

- Create: `server/database/migrations/214_social_inbox_source_post_projection.sql`
  - Adds conversation-level source post projection fields for fast grouping/filtering.
- Modify: `server/utils/socialInbox/types.ts`
  - Adds `publishedAt` and normalized media shape to `SocialInboxMessageMetadata.sourcePost`.
- Modify: `app/types/index.ts`
  - Mirrors source-post metadata additions and adds `SocialEngagementWallPost`.
- Modify: `server/utils/socialInbox/store.ts`
  - Extracts source-post metadata from inbound messages and upserts it onto `social_conversations`.
- Create: `server/utils/socialInbox/wall.ts`
  - Builds the grouped Engagement Wall SQL query.
- Create: `server/api/agency/social/inbox/wall.get.ts`
  - Authenticated API endpoint for wall cards.
- Create: `app/pages/agency/social/inbox/wall.vue`
  - Engagement Wall route and UI.
- Modify: `app/pages/agency/social/inbox/index.vue`
  - Opens a selected conversation from `?conversation=<id>` so wall cards can deep-link into the existing inbox thread.
- Modify: `app/utils/socialSuiteNavigation.ts`
  - Adds `Wall` under Engagement.
- Modify: `test/social/suiteNavigation.test.ts`
  - Updates nav expectations.
- Modify: `test/social/routeCoverage.test.ts`
  - Adds the new wall route to route coverage.
- Modify: `test/social/inboxStore.test.ts`
  - Verifies source-post projection SQL/params.
- Create: `test/server/utils/socialInboxWall.test.ts`
  - Verifies wall grouping/filter query shape.

## Task 1: Add Source Post Projection To Conversations

**Files:**
- Create: `server/database/migrations/214_social_inbox_source_post_projection.sql`
- Modify: `server/utils/socialInbox/types.ts`
- Modify: `app/types/index.ts`
- Modify: `server/utils/socialInbox/store.ts`
- Test: `test/social/inboxStore.test.ts`

- [ ] **Step 1: Write the failing store test**

Add this test before the final `recordOutbound` test in `test/social/inboxStore.test.ts`:

```ts
  it('projects source post metadata onto the conversation row', async () => {
    let sql = ''
    const params: unknown[][] = []
    const db: DbRunner = {
      async queryOne<T = unknown>(s: string, p?: unknown[]) {
        sql = s
        if (p) params.push(p)
        return { id: 'conv-1' } as T
      },
      async execute() {
        return 0
      }
    }

    await recordInbound(db, 'client-1', 'acct-1', {
      ...ev,
      message: {
        ...ev.message,
        metadata: {
          sourcePost: {
            id: 'post-1',
            platform: 'facebook',
            title: 'GWS Monster Sale Weekend',
            text: 'Trading hours and offers',
            imageUrl: 'https://cdn.example.com/post.jpg',
            thumbnailUrl: 'https://cdn.example.com/post-thumb.jpg',
            mediaType: 'image',
            permalink: 'https://facebook.com/post/1',
            publishedAt: '2026-06-25T04:00:00Z'
          }
        }
      }
    })

    expect(sql).toMatch(/source_post_id/)
    expect(sql).toMatch(/source_post_media/)
    expect(sql).toMatch(/source_post_published_at/)
    expect(sql).toMatch(/source_post_id = COALESCE/)
    expect(params[0]).toContain('post-1')
    expect(params[0]).toContain('https://facebook.com/post/1')
    expect(params[0]).toContain('GWS Monster Sale Weekend')
    expect(params[0]).toContain('Trading hours and offers')
    expect(params[0]).toContain('2026-06-25T04:00:00Z')
  })
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
pnpm exec vitest run test/social/inboxStore.test.ts
```

Expected before implementation: FAIL because `source_post_id` is not present in the `INSERT INTO social_conversations` SQL.

- [ ] **Step 3: Add the migration**

Create `server/database/migrations/214_social_inbox_source_post_projection.sql`:

```sql
ALTER TABLE social_conversations
  ADD COLUMN IF NOT EXISTS source_post_id text,
  ADD COLUMN IF NOT EXISTS source_post_url text,
  ADD COLUMN IF NOT EXISTS source_post_title text,
  ADD COLUMN IF NOT EXISTS source_post_content text,
  ADD COLUMN IF NOT EXISTS source_post_media jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS source_post_author_name text,
  ADD COLUMN IF NOT EXISTS source_post_author_avatar_url text,
  ADD COLUMN IF NOT EXISTS source_post_published_at timestamptz,
  ADD COLUMN IF NOT EXISTS linked_social_post_id uuid REFERENCES social_posts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_social_conversations_source_post
  ON social_conversations(client_id, platform, source_post_id)
  WHERE source_post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_social_conversations_source_post_url
  ON social_conversations(client_id, source_post_url)
  WHERE source_post_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_social_conversations_linked_social_post
  ON social_conversations(client_id, linked_social_post_id)
  WHERE linked_social_post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_social_conversations_last_message
  ON social_conversations(client_id, last_message_at DESC);
```

- [ ] **Step 4: Extend source-post types**

In `server/utils/socialInbox/types.ts`, extend `sourcePost`:

```ts
  sourcePost?: {
    id?: string
    platform?: string
    title?: string
    text?: string
    imageUrl?: string
    thumbnailUrl?: string
    mediaType?: string
    permalink?: string
    publishedAt?: string
    authorName?: string
    authorAvatarUrl?: string
  }
```

Make the same addition in `app/types/index.ts` inside `SocialMessageMetadata.sourcePost`.

- [ ] **Step 5: Add projection helpers in the store**

Add these helpers near `uuidOrNull` in `server/utils/socialInbox/store.ts`:

```ts
function sourcePostFromEvent(ev: NormalizedEvent) {
  const post = ev.message.metadata?.sourcePost
  if (!post || typeof post !== 'object') return null
  const media = [
    post.imageUrl ? { url: post.imageUrl, type: post.mediaType ?? 'image', thumbnailUrl: post.thumbnailUrl ?? null } : null,
    !post.imageUrl && post.thumbnailUrl ? { url: post.thumbnailUrl, type: post.mediaType ?? 'image', thumbnailUrl: post.thumbnailUrl } : null
  ].filter(Boolean)

  return {
    id: textOrNull(post.id),
    url: textOrNull(post.permalink) ?? textOrNull(ev.permalink),
    title: textOrNull(post.title),
    content: textOrNull(post.text),
    media,
    authorName: textOrNull(post.authorName),
    authorAvatarUrl: textOrNull(post.authorAvatarUrl),
    publishedAt: textOrNull(post.publishedAt)
  }
}
```

- [ ] **Step 6: Persist projected fields in `ensureConversation`**

Inside `ensureConversation`, add:

```ts
  const sourcePost = sourcePostFromEvent(ev)
```

Extend the insert column list with:

```sql
        source_post_id, source_post_url, source_post_title, source_post_content,
        source_post_media, source_post_author_name, source_post_author_avatar_url,
        source_post_published_at,
```

Extend `VALUES` with the next placeholders:

```sql
        $17,$18,$19,$20,$21::jsonb,$22,$23,$24::timestamptz,
```

Extend `ON CONFLICT DO UPDATE SET` with:

```sql
       source_post_id = COALESCE(EXCLUDED.source_post_id, social_conversations.source_post_id),
       source_post_url = COALESCE(EXCLUDED.source_post_url, social_conversations.source_post_url),
       source_post_title = COALESCE(EXCLUDED.source_post_title, social_conversations.source_post_title),
       source_post_content = COALESCE(EXCLUDED.source_post_content, social_conversations.source_post_content),
       source_post_media = CASE
         WHEN jsonb_array_length(EXCLUDED.source_post_media) > 0 THEN EXCLUDED.source_post_media
         ELSE social_conversations.source_post_media
       END,
       source_post_author_name = COALESCE(EXCLUDED.source_post_author_name, social_conversations.source_post_author_name),
       source_post_author_avatar_url = COALESCE(EXCLUDED.source_post_author_avatar_url, social_conversations.source_post_author_avatar_url),
       source_post_published_at = COALESCE(EXCLUDED.source_post_published_at, social_conversations.source_post_published_at),
```

Append these params after `paidMediaCampaignName`:

```ts
      sourcePost?.id ?? null,
      sourcePost?.url ?? null,
      sourcePost?.title ?? null,
      sourcePost?.content ?? null,
      JSON.stringify(sourcePost?.media ?? []),
      sourcePost?.authorName ?? null,
      sourcePost?.authorAvatarUrl ?? null,
      sourcePost?.publishedAt ?? null
```

- [ ] **Step 7: Run the focused test**

Run:

```bash
pnpm exec vitest run test/social/inboxStore.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 1**

```bash
git add server/database/migrations/214_social_inbox_source_post_projection.sql server/utils/socialInbox/types.ts app/types/index.ts server/utils/socialInbox/store.ts test/social/inboxStore.test.ts
git commit -m "feat(social): project source post metadata"
```

## Task 2: Add Engagement Wall Query And API

**Files:**
- Create: `server/utils/socialInbox/wall.ts`
- Create: `server/api/agency/social/inbox/wall.get.ts`
- Modify: `app/types/index.ts`
- Test: `test/server/utils/socialInboxWall.test.ts`

- [ ] **Step 1: Add the failing query tests**

Create `test/server/utils/socialInboxWall.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildSocialInboxWallQuery } from '~~/server/utils/socialInbox/wall'

describe('buildSocialInboxWallQuery', () => {
  it('groups engagement conversations by source post identity', () => {
    const q = buildSocialInboxWallQuery({ clientId: 'client-1', limit: 25 })

    expect(q.params).toEqual(['client-1', 25])
    expect(q.sql).toMatch(/WITH filtered_conversations AS/)
    expect(q.sql).toMatch(/COALESCE\(c\.source_post_id/)
    expect(q.sql).toMatch(/jsonb_agg/)
    expect(q.sql).toMatch(/latest_conversations/)
    expect(q.sql).toMatch(/ORDER BY MAX\(fc\.last_message_at\) DESC NULLS LAST/)
  })

  it('adds platform, account, status, assignee, and search filters', () => {
    const q = buildSocialInboxWallQuery({
      clientId: 'client-1',
      platform: 'facebook',
      accountId: 'acct-1',
      status: 'open',
      assignedTo: 'user-1',
      search: 'monster sale',
      limit: 10
    })

    expect(q.params).toEqual([
      'client-1',
      'facebook',
      'acct-1',
      'open',
      'user-1',
      '%monster sale%',
      10
    ])
    expect(q.sql).toMatch(/c\.platform = \$2/)
    expect(q.sql).toMatch(/c\.social_account_id = \$3/)
    expect(q.sql).toMatch(/c\.status = \$4/)
    expect(q.sql).toMatch(/c\.assigned_to = \$5/)
    expect(q.sql).toMatch(/source_post_content ILIKE \$6/)
  })

  it('escapes search wildcards', () => {
    const q = buildSocialInboxWallQuery({ clientId: 'client-1', search: '100%_ok' })

    expect(q.params).toContain('%100\\%\\_ok%')
    expect(q.sql).toContain('ESCAPE \'\\\'')
  })
})
```

- [ ] **Step 2: Run the failing query tests**

Run:

```bash
pnpm exec vitest run test/server/utils/socialInboxWall.test.ts
```

Expected before implementation: FAIL because `server/utils/socialInbox/wall.ts` does not exist.

- [ ] **Step 3: Add `SocialEngagementWallPost` types**

In `app/types/index.ts`, after `SocialWallPost`, add:

```ts
export interface SocialEngagementWallConversationSummary {
  id: string
  participant_name: string | null
  participant_handle: string | null
  channel_type: string
  status: string
  assigned_to: string | null
  unread_count: number
  rating: number | null
  last_message_preview: string | null
  last_message_at: string | null
  latest_author_name: string | null
  latest_author_avatar_url: string | null
}

export interface SocialEngagementWallPost {
  key: string
  client_id: string
  platform: string
  social_account_id: string | null
  account_name: string | null
  platform_account_id: string | null
  source_post_id: string | null
  source_post_url: string | null
  source_post_title: string | null
  source_post_content: string | null
  source_post_media: Array<{ url: string, type?: string | null, thumbnailUrl?: string | null }>
  source_post_author_name: string | null
  source_post_author_avatar_url: string | null
  source_post_published_at: string | null
  linked_social_post_id: string | null
  campaign_name: string | null
  status_summary: { open: number, snoozed: number, closed: number }
  unread_count: number
  conversation_count: number
  message_count: number
  latest_activity_at: string | null
  latest_conversations: SocialEngagementWallConversationSummary[]
}
```

- [ ] **Step 4: Implement the wall query builder**

Create `server/utils/socialInbox/wall.ts`:

```ts
export interface SocialInboxWallInput {
  clientId: string
  platform?: string | null
  accountId?: string | null
  status?: string | null
  assignedTo?: string | null
  search?: string | null
  limit?: number
}

export interface SocialInboxWallQuery {
  sql: string
  params: unknown[]
}

const MAX_LIMIT = 120

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, match => `\\${match}`)
}

function clampLimit(limit: number | undefined) {
  if (!Number.isFinite(limit)) return 60
  return Math.min(Math.max(Math.trunc(limit || 60), 1), MAX_LIMIT)
}

export function buildSocialInboxWallQuery(input: SocialInboxWallInput): SocialInboxWallQuery {
  const params: unknown[] = [input.clientId]
  let where = 'WHERE c.client_id = $1'

  for (const [column, value] of [
    ['c.platform', input.platform],
    ['c.social_account_id', input.accountId],
    ['c.status', input.status],
    ['c.assigned_to', input.assignedTo]
  ] as const) {
    if (value) {
      params.push(value)
      where += ` AND ${column} = $${params.length}`
    }
  }

  const search = input.search?.trim()
  if (search) {
    params.push(`%${escapeLike(search)}%`)
    const idx = params.length
    where += ` AND (
      c.source_post_title ILIKE $${idx} ESCAPE '\\'
      OR c.source_post_content ILIKE $${idx} ESCAPE '\\'
      OR c.participant_name ILIKE $${idx} ESCAPE '\\'
      OR c.last_message_preview ILIKE $${idx} ESCAPE '\\'
      OR a.account_name ILIKE $${idx} ESCAPE '\\'
      OR EXISTS (
        SELECT 1 FROM social_messages sm
        WHERE sm.conversation_id = c.id
          AND (sm.content ILIKE $${idx} ESCAPE '\\' OR sm.author_name ILIKE $${idx} ESCAPE '\\')
      )
    )`
  }

  params.push(clampLimit(input.limit))
  const limitRef = `$${params.length}`

  const sql = `
    WITH filtered_conversations AS (
      SELECT
        c.*,
        a.account_name,
        a.platform_account_id,
        sp.campaign_id,
        sc.name AS campaign_name,
        COALESCE(
          c.source_post_id,
          c.source_post_url,
          c.linked_social_post_id::text,
          c.id::text
        ) AS wall_key
      FROM social_conversations c
      LEFT JOIN social_accounts a ON a.id = c.social_account_id
      LEFT JOIN social_posts sp ON sp.id = c.linked_social_post_id
      LEFT JOIN social_campaigns sc ON sc.id = sp.campaign_id
      ${where}
    ),
    latest_messages AS (
      SELECT DISTINCT ON (m.conversation_id)
        m.conversation_id,
        m.author_name,
        m.metadata,
        m.platform_timestamp,
        m.created_at
      FROM social_messages m
      JOIN filtered_conversations fc ON fc.id = m.conversation_id
      WHERE m.direction = 'in'
      ORDER BY m.conversation_id, m.platform_timestamp DESC NULLS LAST, m.created_at DESC
    )
    SELECT
      fc.wall_key AS key,
      MIN(fc.client_id::text) AS client_id,
      MIN(fc.platform) AS platform,
      MIN(fc.social_account_id::text) AS social_account_id,
      MIN(fc.account_name) AS account_name,
      MIN(fc.platform_account_id) AS platform_account_id,
      MIN(fc.source_post_id) AS source_post_id,
      MIN(fc.source_post_url) AS source_post_url,
      MIN(fc.source_post_title) AS source_post_title,
      MIN(fc.source_post_content) AS source_post_content,
      COALESCE(NULLIF(MIN(fc.source_post_media::text), '[]'), '[]')::jsonb AS source_post_media,
      MIN(fc.source_post_author_name) AS source_post_author_name,
      MIN(fc.source_post_author_avatar_url) AS source_post_author_avatar_url,
      MIN(fc.source_post_published_at)::text AS source_post_published_at,
      MIN(fc.linked_social_post_id::text) AS linked_social_post_id,
      MIN(fc.campaign_name) AS campaign_name,
      jsonb_build_object(
        'open', COUNT(*) FILTER (WHERE fc.status = 'open'),
        'snoozed', COUNT(*) FILTER (WHERE fc.status = 'snoozed'),
        'closed', COUNT(*) FILTER (WHERE fc.status = 'closed')
      ) AS status_summary,
      COALESCE(SUM(fc.unread_count), 0)::int AS unread_count,
      COUNT(*)::int AS conversation_count,
      COALESCE(SUM(fc.message_count), 0)::int AS message_count,
      MAX(fc.last_message_at)::text AS latest_activity_at,
      COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', fc.id,
          'participant_name', fc.participant_name,
          'participant_handle', fc.participant_handle,
          'channel_type', fc.channel_type,
          'status', fc.status,
          'assigned_to', fc.assigned_to,
          'unread_count', fc.unread_count,
          'rating', fc.rating,
          'last_message_preview', fc.last_message_preview,
          'last_message_at', fc.last_message_at,
          'latest_author_name', lm.author_name,
          'latest_author_avatar_url', lm.metadata->>'authorAvatarUrl'
        )
        ORDER BY fc.last_message_at DESC NULLS LAST
      ), '[]'::jsonb) AS latest_conversations
    FROM filtered_conversations fc
    LEFT JOIN latest_messages lm ON lm.conversation_id = fc.id
    GROUP BY fc.wall_key
    ORDER BY MAX(fc.last_message_at) DESC NULLS LAST
    LIMIT ${limitRef}`

  return { sql, params }
}
```

- [ ] **Step 5: Add the API endpoint**

Create `server/api/agency/social/inbox/wall.get.ts`:

```ts
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { buildSocialInboxWallQuery } from '~~/server/utils/socialInbox/wall'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = getQuery(event)
  const clientId = q.clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })

  const { sql, params } = buildSocialInboxWallQuery({
    clientId,
    platform: q.platform as string | undefined,
    accountId: q.accountId as string | undefined,
    status: q.status as string | undefined,
    assignedTo: q.assignedTo as string | undefined,
    search: q.q as string | undefined,
    limit: Number(q.limit) || undefined
  })

  return await queryRows(sql, params)
})
```

- [ ] **Step 6: Run wall query tests**

Run:

```bash
pnpm exec vitest run test/server/utils/socialInboxWall.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add app/types/index.ts server/utils/socialInbox/wall.ts server/api/agency/social/inbox/wall.get.ts test/server/utils/socialInboxWall.test.ts
git commit -m "feat(social): add engagement wall API"
```

## Task 3: Add Engagement Wall Route UI

**Files:**
- Create: `app/pages/agency/social/inbox/wall.vue`
- Modify: `app/pages/agency/social/inbox/index.vue`
- Test: `test/social/routeCoverage.test.ts`

- [ ] **Step 1: Update route coverage expectation first**

In `test/social/routeCoverage.test.ts`, add:

```ts
  ['app/pages/agency/social/inbox/wall.vue', 'SocialSuiteSectionNav'],
```

inside `agencySocialRouteNavs`, near the other inbox routes.

- [ ] **Step 2: Run route coverage to see the expected failure**

Run:

```bash
pnpm exec vitest run test/social/routeCoverage.test.ts
```

Expected before route creation: FAIL because `wall.vue` does not exist.

- [ ] **Step 3: Add query-param selection to the inbox**

In `app/pages/agency/social/inbox/index.vue`, add:

```ts
const route = useRoute()
```

near other composable declarations.

After `onMounted(() => { reload() ... })`, replace the mounted body with:

```ts
onMounted(async () => {
  await reload()
  typingCleanupTimer = setInterval(pruneTypingPresence, 4000)
  const requestedConversation = typeof route.query.conversation === 'string' ? route.query.conversation : null
  if (requestedConversation) await select(requestedConversation)
})
```

- [ ] **Step 4: Create the wall page**

Create `app/pages/agency/social/inbox/wall.vue`:

```vue
<script setup lang="ts">
import type { SocialEngagementWallPost } from '~/types'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

interface AgencyClientOption { id: string, name: string }
type AgencyClientsResponse = AgencyClientOption[] | { clients?: AgencyClientOption[] }

const { data: clientsData } = await useFetch<AgencyClientsResponse>('/api/agency/clients', { query: { limit: 200 } })
const clients = computed<AgencyClientOption[]>(() => {
  const d = clientsData.value
  return Array.isArray(d) ? d : (d?.clients ?? [])
})
const clientOptions = computed(() => clients.value.map(c => ({ label: c.name, value: c.id })))
const clientId = ref<string | null>(clients.value[0]?.id ?? null)
const search = ref('')
const platform = ref('all')
const status = ref('open')

const platformOptions = [
  { label: 'All platforms', value: 'all' },
  { label: 'Facebook', value: 'facebook' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'Google Business', value: 'google-business' },
  { label: 'YouTube', value: 'youtube' },
  { label: 'LinkedIn', value: 'linkedin' },
  { label: 'TikTok', value: 'tiktok' }
]
const statusOptions = [
  { label: 'Open', value: 'open' },
  { label: 'All statuses', value: 'all' },
  { label: 'Snoozed', value: 'snoozed' },
  { label: 'Closed', value: 'closed' }
]

const query = computed(() => ({
  clientId: clientId.value,
  q: search.value || undefined,
  platform: platform.value === 'all' ? undefined : platform.value,
  status: status.value === 'all' ? undefined : status.value,
  limit: 80
}))

const { data: wallPosts, pending, error, refresh } = await useFetch<SocialEngagementWallPost[]>(
  '/api/agency/social/inbox/wall',
  { query, watch: [query], default: () => [] }
)

function postImage(post: SocialEngagementWallPost) {
  return post.source_post_media?.[0]?.thumbnailUrl || post.source_post_media?.[0]?.url || null
}
function postTitle(post: SocialEngagementWallPost) {
  return post.source_post_title || post.source_post_content?.split(/\r?\n/).find(Boolean) || `${post.account_name || post.platform} post`
}
function fmtDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Unknown date'
}
function plural(count: number, singular: string, pluralLabel = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralLabel}`
}
</script>

<template>
  <div class="min-h-[calc(100vh-4rem)]">
    <div class="flex flex-wrap items-center gap-3 border-b border-default p-4">
      <div>
        <h1 class="text-lg font-semibold">Engagement Wall</h1>
        <p class="text-sm text-muted">Post-first view of comments, reviews, replies, and moderation work.</p>
      </div>
      <div class="ml-auto flex flex-wrap items-center gap-2">
        <USelectMenu v-model="clientId" :items="clientOptions" value-key="value" class="w-56 max-w-full" />
        <UButton icon="i-lucide-refresh-cw" label="Refresh" variant="subtle" :loading="pending" @click="refresh" />
      </div>
    </div>

    <div class="px-4">
      <SocialSuiteSectionNav />
    </div>

    <div class="grid gap-2 border-y border-default p-4 lg:grid-cols-[minmax(0,1fr)_12rem_12rem]">
      <UInput v-model="search" icon="i-lucide-search" placeholder="Search posts, comments, accounts" />
      <USelectMenu v-model="platform" :items="platformOptions" value-key="value" />
      <USelectMenu v-model="status" :items="statusOptions" value-key="value" />
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="soft"
      icon="i-lucide-alert-triangle"
      title="Could not load engagement wall"
      class="m-4"
    />

    <div v-if="pending" class="grid gap-4 p-4 lg:grid-cols-2 2xl:grid-cols-3">
      <USkeleton v-for="i in 6" :key="i" class="h-96 rounded-md" />
    </div>

    <div v-else-if="!wallPosts.length" class="p-8 text-center text-sm text-muted">
      No engagement-bearing posts match the current filters.
    </div>

    <div v-else class="grid gap-4 p-4 lg:grid-cols-2 2xl:grid-cols-3">
      <article v-for="post in wallPosts" :key="post.key" class="overflow-hidden rounded-md border border-default bg-default">
        <div class="flex items-start gap-3 border-b border-default p-4">
          <img
            v-if="postImage(post)"
            :src="postImage(post) || undefined"
            :alt="postTitle(post)"
            class="size-20 rounded object-cover"
            loading="lazy"
            referrerpolicy="no-referrer"
          >
          <div v-else class="flex size-20 items-center justify-center rounded bg-muted/20 text-muted">
            <UIcon name="i-lucide-image" class="size-5" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-1.5">
              <UBadge color="neutral" variant="subtle" size="xs">{{ post.platform }}</UBadge>
              <UBadge v-if="post.campaign_name" color="primary" variant="subtle" size="xs">{{ post.campaign_name }}</UBadge>
            </div>
            <h2 class="mt-1 line-clamp-2 text-sm font-semibold">{{ postTitle(post) }}</h2>
            <p class="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-muted">{{ post.source_post_content }}</p>
            <p class="mt-2 text-xs text-muted">{{ post.account_name || post.platform_account_id || 'Account unavailable' }} · {{ fmtDate(post.source_post_published_at || post.latest_activity_at) }}</p>
          </div>
        </div>

        <div class="grid grid-cols-4 gap-2 border-b border-default p-3 text-center text-xs">
          <div><div class="font-semibold">{{ post.conversation_count }}</div><div class="text-muted">Threads</div></div>
          <div><div class="font-semibold">{{ post.message_count }}</div><div class="text-muted">Messages</div></div>
          <div><div class="font-semibold">{{ post.unread_count }}</div><div class="text-muted">Unread</div></div>
          <div><div class="font-semibold">{{ post.status_summary.open }}</div><div class="text-muted">Open</div></div>
        </div>

        <div class="space-y-2 p-3">
          <div
            v-for="conversation in post.latest_conversations.slice(0, 3)"
            :key="conversation.id"
            class="rounded-md bg-elevated p-3"
          >
            <div class="flex items-center gap-2 text-xs">
              <span class="font-medium">{{ conversation.latest_author_name || conversation.participant_name || 'User unavailable' }}</span>
              <UBadge color="neutral" variant="subtle" size="xs">{{ conversation.channel_type }}</UBadge>
              <span class="ml-auto text-muted">{{ fmtDate(conversation.last_message_at) }}</span>
            </div>
            <p class="mt-1 line-clamp-2 text-sm text-muted">{{ conversation.last_message_preview }}</p>
            <div class="mt-2 flex justify-end">
              <UButton
                :to="`/agency/social/inbox?conversation=${conversation.id}`"
                size="xs"
                variant="ghost"
                icon="i-lucide-message-square"
              >
                Open thread
              </UButton>
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between border-t border-default p-3">
          <span class="text-xs text-muted">Latest activity {{ fmtDate(post.latest_activity_at) }}</span>
          <UButton
            v-if="post.source_post_url"
            :to="post.source_post_url"
            target="_blank"
            size="xs"
            variant="ghost"
            icon="i-lucide-external-link"
          >
            Open post
          </UButton>
        </div>
      </article>
    </div>
  </div>
</template>
```

- [ ] **Step 5: Remove unused helpers if lint flags them**

If ESLint reports `plural` is unused, delete the `plural` function from `wall.vue`.

- [ ] **Step 6: Run route coverage**

Run:

```bash
pnpm exec vitest run test/social/routeCoverage.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add app/pages/agency/social/inbox/wall.vue app/pages/agency/social/inbox/index.vue test/social/routeCoverage.test.ts
git commit -m "feat(social): add engagement wall route"
```

## Task 4: Add Engagement Navigation And Tests

**Files:**
- Modify: `app/utils/socialSuiteNavigation.ts`
- Modify: `test/social/suiteNavigation.test.ts`

- [ ] **Step 1: Update the expected navigation tests first**

In `test/social/suiteNavigation.test.ts`, change the Engagement expected items to:

```ts
['Inbox', 'Wall', 'Reply Queue', 'Reviews', 'Automation', 'Inbox Analytics', 'Inbox Settings']
```

And change the full nav expected sequence to include `Wall` after `Inbox`:

```ts
'Engagement',
'Inbox',
'Wall',
'Reply Queue',
```

- [ ] **Step 2: Run the failing nav test**

Run:

```bash
pnpm exec vitest run test/social/suiteNavigation.test.ts
```

Expected before navigation implementation: FAIL because `Wall` is missing.

- [ ] **Step 3: Add the navigation item**

In `app/utils/socialSuiteNavigation.ts`, insert this item immediately after `Inbox`:

```ts
      {
        label: 'Wall',
        icon: 'i-lucide-panels-top-left',
        to: '/agency/social/inbox/wall',
        objective: 'Review engagement grouped by the public post that generated the comments, replies, and reviews.'
      },
```

- [ ] **Step 4: Run nav tests**

Run:

```bash
pnpm exec vitest run test/social/suiteNavigation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add app/utils/socialSuiteNavigation.ts test/social/suiteNavigation.test.ts
git commit -m "feat(social): add engagement wall navigation"
```

## Task 5: Focused Verification And Cleanup

**Files:**
- Review all files changed by Tasks 1-4.

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm exec vitest run test/social/inboxStore.test.ts test/server/utils/socialInboxWall.test.ts test/social/suiteNavigation.test.ts test/social/routeCoverage.test.ts test/social/sourcePost.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run focused lint**

Run:

```bash
pnpm exec eslint app/pages/agency/social/inbox app/utils/socialSuiteNavigation.ts app/types/index.ts server/api/agency/social/inbox server/utils/socialInbox test/social/inboxStore.test.ts test/server/utils/socialInboxWall.test.ts test/social/suiteNavigation.test.ts test/social/routeCoverage.test.ts
```

Expected: PASS. Fix only lint issues directly caused by this feature.

- [ ] **Step 3: Run production build**

Run:

```bash
pnpm run build
```

Expected: PASS.

- [ ] **Step 4: Browser verify locally**

Ensure the dev server is running on `localhost:3000`, then visit:

```text
http://localhost:3000/agency/social/inbox/wall
```

Expected:
- The Social Suite nav shows `Engagement > Wall`.
- The route renders an empty state or engagement post cards.
- Filters do not create duplicate records because the route only reads from `GET /api/agency/social/inbox/wall`.
- `Open thread` navigates to `/agency/social/inbox?conversation=<id>` and opens the existing inbox thread.

- [ ] **Step 5: Final review diff**

Run:

```bash
git status --short --branch
git diff --stat HEAD~4..HEAD
```

Expected:
- Only Engagement Wall feature files changed.
- No unrelated files or generated build outputs staged.

- [ ] **Step 6: Commit any verification fixes**

If Step 1-4 required small fixes:

```bash
git add app/pages/agency/social/inbox/wall.vue app/pages/agency/social/inbox/index.vue app/utils/socialSuiteNavigation.ts app/types/index.ts server/api/agency/social/inbox/wall.get.ts server/utils/socialInbox/store.ts server/utils/socialInbox/types.ts server/utils/socialInbox/wall.ts test/social/inboxStore.test.ts test/server/utils/socialInboxWall.test.ts test/social/suiteNavigation.test.ts test/social/routeCoverage.test.ts
git commit -m "fix(social): harden engagement wall"
```

If no fixes were required, skip this commit.

## Self-Review

Spec coverage:
- Engagement-bearing wall: Task 2 and Task 3.
- Separate from Publishing Wall: Task 3 creates `/agency/social/inbox/wall`; no publishing wall changes.
- Source post metadata: Task 1 projects existing provider metadata onto conversations.
- Wall API grouping: Task 2 groups by source post id, URL, linked post, then conversation fallback.
- UI/UX: Task 3 adds filters, post cards, source preview, thread previews, and deep links to inbox.
- Navigation: Task 4 adds Engagement Wall to Social Suite nav.
- Tests and verification: Task 5 covers focused tests, lint, build, and browser verification.

No placeholders:
- The plan contains exact file paths, test snippets, implementation snippets, commands, and expected results.

Scope decisions:
- Phase 1 does not import every historical provider post.
- Phase 1 does not add wall-native reply controls; it links to the existing inbox thread.
- Phase 1 does not introduce `social_source_posts`.
