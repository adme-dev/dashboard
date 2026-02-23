# Task Comments, @Mentions & Chat System - Implementation Plan

## Current State
- ✅ `task_activities` table exists with `comment` activity type
- ✅ `notifications` table exists with `task_mentioned` type
- ❌ Missing: Threaded replies, @mention links, reactions/likes

## Phase 1: Database Schema (Week 1)

### 1.1 Enhanced Comments Table
```sql
-- Extend task_activities for threaded comments
ALTER TABLE task_activities ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES task_activities(id) ON DELETE CASCADE;
ALTER TABLE task_activities ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE task_activities ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE task_activities ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE task_activities ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES team_members(id);

-- For tracking comment order within a thread
ALTER TABLE task_activities ADD COLUMN IF NOT EXISTS thread_position INTEGER;
```

### 1.2 Comment Mentions Table
```sql
-- Track who was @mentioned in a comment
CREATE TABLE task_comment_mentions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  comment_id UUID NOT NULL REFERENCES task_activities(id) ON DELETE CASCADE,
  mentioned_user_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  mentioned_by_user_id UUID NOT NULL REFERENCES team_members(id),
  mention_text TEXT NOT NULL, -- The @username or @Name that was used
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(comment_id, mentioned_user_id)
);

CREATE INDEX idx_comment_mentions_comment ON task_comment_mentions(comment_id);
CREATE INDEX idx_comment_mentions_user ON task_comment_mentions(mentioned_user_id);
CREATE INDEX idx_comment_mentions_created ON task_comment_mentions(created_at);
```

### 1.3 Comment Reactions/Likes Table
```sql
CREATE TABLE task_comment_reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  comment_id UUID NOT NULL REFERENCES task_activities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  reaction_type VARCHAR(50) DEFAULT 'like' CHECK (reaction_type IN ('like', 'heart', 'thumbs_up', 'thumbs_down', 'laugh', 'sad')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(comment_id, user_id, reaction_type)
);

CREATE INDEX idx_comment_reactions_comment ON task_comment_reactions(comment_id);
CREATE INDEX idx_comment_reactions_user ON task_comment_reactions(user_id);
```

### 1.4 Views for Efficient Querying
```sql
-- View: Comments with author, reactions count, and reply count
CREATE OR REPLACE VIEW v_task_comments AS
SELECT 
  ta.id,
  ta.task_id,
  ta.user_id as author_id,
  tm.name as author_name,
  tm.avatar_url as author_avatar,
  ta.parent_id,
  ta.content,
  ta.is_internal,
  ta.created_at,
  ta.edited_at,
  ta.is_deleted,
  -- Reaction counts
  COUNT(DISTINCT CASE WHEN tcr.reaction_type = 'like' THEN tcr.user_id END) as likes_count,
  COUNT(DISTINCT tcr.user_id) as total_reactions_count,
  -- Reply count
  (SELECT COUNT(*) FROM task_activities replies WHERE replies.parent_id = ta.id AND replies.is_deleted = false) as reply_count,
  -- Whether current user liked (needs session param, handled in API)
  NULL::boolean as user_has_liked
FROM task_activities ta
JOIN team_members tm ON ta.user_id = tm.id
LEFT JOIN task_comment_reactions tcr ON tcr.comment_id = ta.id
WHERE ta.activity_type = 'comment'
GROUP BY ta.id, ta.task_id, ta.user_id, tm.name, tm.avatar_url, ta.parent_id, ta.content, ta.is_internal, ta.created_at, ta.edited_at, ta.is_deleted;
```

---

## Phase 2: Backend API (Week 1-2)

### 2.1 Comment CRUD APIs
```
GET    /api/tasks/:id/comments          - List comments (with threading)
POST   /api/tasks/:id/comments          - Create comment
PUT    /api/comments/:id                - Edit comment
DELETE /api/comments/:id                - Soft delete comment
POST   /api/comments/:id/reply          - Reply to comment (creates threaded comment)
```

### 2.2 Reactions API
```
POST   /api/comments/:id/like           - Toggle like
POST   /api/comments/:id/react          - Add reaction (with type)
DELETE /api/comments/:id/react          - Remove reaction
```

### 2.3 Mentions & Notifications
```
GET    /api/users/search?q=:query       - Search users for @mentions
POST   /api/notifications/mentions      - Get unread mentions count
```

### 2.4 Real-time Updates (WebSocket/SSE)
```
WS     /api/ws/tasks/:id                - Task real-time updates (comments, status changes)
```

### 2.5 Key Backend Logic

#### Parse Mentions
```typescript
function parseMentions(content: string): { userIds: string[], mentions: Mention[] } {
  // Extract @username or @First Last patterns
  const mentionRegex = /@([a-zA-Z0-9_]+)|@([A-Za-z]+\s+[A-Za-z]+)/g
  // Match against team_members table
  // Return user IDs and formatted mention data
}
```

#### Create Comment with Mentions
```typescript
async function createComment(taskId, content, parentId?, userId) {
  // 1. Create comment in task_activities
  // 2. Parse @mentions from content
  // 3. Create task_comment_mentions records
  // 4. Create notifications for mentioned users
  // 5. Broadcast via WebSocket
}
```

---

## Phase 3: Frontend Components (Week 2-3)

### 3.1 Comment Input Component
```vue
<!-- TaskCommentInput.vue -->
<template>
  <div class="comment-input">
    <UserMentionInput 
      v-model="content"
      :users="teamMembers"
      @mention="insertMention"
      placeholder="Write an update and mention others with @"
    />
    <div class="toolbar">
      <button @click="attachFile">📎</button>
      <button @click="addEmoji">😊</button>
      <button class="primary" @click="submit">Update</button>
    </div>
  </div>
</template>
```

**Features:**
- @mention autocomplete (type @ to see user list)
- File attachments
- Emoji picker
- Rich text (markdown-lite)

### 3.2 Comment Thread Component
```vue
<!-- CommentThread.vue -->
<template>
  <div class="comment-thread">
    <CommentItem 
      v-for="comment in threadedComments" 
      :key="comment.id"
      :comment="comment"
      :current-user="currentUser"
      @reply="startReply"
      @like="toggleLike"
      @edit="editComment"
      @delete="deleteComment"
    />
  </div>
</template>
```

**CommentItem Features:**
- Author avatar + name
- Formatted content (with highlighted @mentions)
- Like button + count
- Reply button
- Edit/Delete (if author)
- Timestamp ("11m", "42m", "2h")
- Thread indicator for replies

### 3.3 User Mention Autocomplete
```vue
<!-- UserMentionInput.vue -->
<template>
  <div class="mention-input">
    <textarea 
      ref="textarea"
      v-model="text"
      @keydown="handleKeydown"
      @input="checkForMention"
    />
    <MentionDropdown 
      v-if="showMentions"
      :users="filteredUsers"
      :position="cursorPosition"
      @select="selectMention"
    />
  </div>
</template>
```

### 3.4 Activity Feed Container
```vue
<!-- TaskActivityFeed.vue -->
<template>
  <div class="activity-feed">
    <Tabs :tabs="['Updates', 'Files', 'Activity Log', 'Info']">
      <template #updates>
        <CommentInput @submit="addComment" />
        <CommentThread 
          :comments="comments" 
          :loading="loading"
          @load-more="loadMore"
        />
      </template>
      <!-- Other tabs -->
    </Tabs>
  </div>
</template>
```

---

## Phase 4: Real-time & Advanced Features (Week 3-4)

### 4.1 WebSocket Integration
```typescript
// composables/useTaskWebSocket.ts
export function useTaskWebSocket(taskId: string) {
  const ws = new WebSocket(`ws://localhost:3001/api/ws/tasks/${taskId}`)
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data)
    switch(data.type) {
      case 'comment_added':
        addCommentToFeed(data.comment)
        break
      case 'comment_updated':
        updateComment(data.comment)
        break
      case 'reaction_added':
        updateReaction(data)
        break
    }
  }
}
```

### 4.2 Notification Center
```vue
<!-- NotificationDropdown.vue -->
<template>
  <Dropdown>
    <template #trigger>
      <BellIcon :count="unreadCount" />
    </template>
    <NotificationList 
      :notifications="notifications"
      @mark-read="markAsRead"
      @mark-all-read="markAllRead"
    />
  </Dropdown>
</template>
```

### 4.3 Email Notifications
- New comment on watched task
- @mention in comment
- Reply to your comment

---

## Data Flow Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│   Nitro API     │────▶│   PostgreSQL    │
│   (Vue/Nuxt)    │     │   (Nuxt Server) │     │   (Neon)        │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        │                       ▼                       │
        │              ┌─────────────────┐              │
        │              │   WebSocket     │              │
        │◀─────────────│   (Broadcast)   │◀─────────────┘
        │              └─────────────────┘
        ▼
┌─────────────────┐
│   Zero Sync     │  ← Real-time sync to other clients
│   (Electric)    │
└─────────────────┘
```

---

## Implementation Order (Priority)

### Week 1: Foundation
1. [ ] Run database migration (schema updates)
2. [ ] Create comment CRUD APIs
3. [ ] Build CommentInput component with @mentions
4. [ ] Build CommentThread display

### Week 2: Interactions
5. [ ] Add Like/Reaction functionality
6. [ ] Add Reply threading
7. [ ] Connect to existing notifications system
8. [ ] Add edit/delete comments

### Week 3: Polish
9. [ ] WebSocket real-time updates
10. [ ] File attachments in comments
11. [ ] Rich text formatting
12. [ ] Email notifications for mentions

### Week 4: Advanced
13. [ ] Comment search/filter
14. [ ] Activity log integration
15. [ ] Performance optimization (pagination)

---

## Files to Create/Modify

### Database
- `server/database/schema-task-comments.sql` (new migration)

### API Routes
- `server/api/tasks/[id]/comments.get.ts` (new)
- `server/api/tasks/[id]/comments.post.ts` (new)
- `server/api/comments/[id].put.ts` (new)
- `server/api/comments/[id].delete.ts` (new)
- `server/api/comments/[id]/like.post.ts` (new)
- `server/api/users/search.get.ts` (new)

### Components
- `app/components/task/CommentInput.vue` (new)
- `app/components/task/CommentThread.vue` (new)
- `app/components/task/CommentItem.vue` (new)
- `app/components/common/UserMentionInput.vue` (new)
- `app/components/common/MentionDropdown.vue` (new)

### Composables
- `app/composables/useTaskComments.ts` (new)
- `app/composables/useMentions.ts` (new)

---

## Key Design Decisions

1. **Soft Delete**: Comments are soft-deleted (is_deleted flag) to preserve thread integrity
2. **Threading**: Flat structure with parent_id, not nested (simpler queries)
3. **Mentions**: Separate table for mention tracking + notification trigger
4. **Reactions**: Limited set (like, heart, thumbs_up/down, laugh, sad)
5. **Real-time**: WebSocket for immediate updates, Zero sync for persistence
