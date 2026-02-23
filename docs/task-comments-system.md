# Task Comments System - Complete Documentation

## Overview
A comprehensive real-time commenting system for tasks with @mentions, threading, reactions, and file attachments.

## Features

### Core Features
- 💬 **Comments** - Rich text comments with markdown support
- 🧵 **Threading** - Reply to specific comments (1 level deep)
- 👥 **@Mentions** - Mention individuals, teams, or groups
- ❤️ **Reactions** - Like and emoji reactions
- 🔔 **Notifications** - Real-time notifications for mentions
- 📎 **Attachments** - File uploads in comments
- 👁️ **Read receipts** - See who's viewed comments
- ✏️ **Edit/Delete** - Soft delete with edit history

### Real-time Features (WebSocket/Durable Objects)
- ⚡ **Instant sync** - Comments appear instantly across clients
- 👀 **Active users** - See who's currently viewing
- 💬 **Typing indicators** - Know when someone's typing
- 📜 **Message history** - New clients get recent messages on connect

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Client                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ CommentInput │  │ CommentItem  │  │ CommentThread    │  │
│  │ - @mentions  │  │ - Reactions  │  │ - Real-time WS   │  │
│  │ - Files      │  │ - Replies    │  │ - Typing indicator│  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────┬───────────────────────────────────┘
                          │ WebSocket (wss://)
┌─────────────────────────┼───────────────────────────────────┐
│              Cloudflare Durable Objects                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ TaskRoom (per task)                                  │  │
│  │ - Maintains WS connections                           │  │
│  │ - Broadcasts messages                                │  │
│  │ - Caches recent messages (50)                        │  │
│  │ - Persists to Neon                                   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────┘
                          │ SQL
┌─────────────────────────┼───────────────────────────────────┐
│              Neon PostgreSQL                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │task_activities│  │task_comment_ │  │task_comment_ │      │
│  │  (comments)  │  │  _mentions   │  │  _reactions  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Tables

#### task_activities (Enhanced)
```sql
CREATE TABLE task_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  activity_type VARCHAR(50) NOT NULL, -- 'comment', 'like', 'edit', etc.
  parent_id UUID REFERENCES task_activities(id) ON DELETE CASCADE, -- For threading
  content TEXT, -- Comment content
  old_value JSONB, -- For edits
  new_value JSONB,
  is_internal BOOLEAN DEFAULT false, -- Private team comments
  is_deleted BOOLEAN DEFAULT false, -- Soft delete
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### task_comment_mentions
```sql
CREATE TABLE task_comment_mentions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  comment_id UUID NOT NULL REFERENCES task_activities(id) ON DELETE CASCADE,
  mentioned_user_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  mentioned_by_user_id UUID NOT NULL REFERENCES team_members(id),
  mention_text TEXT NOT NULL, -- The @Name that was used
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### task_comment_reactions
```sql
CREATE TABLE task_comment_reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  comment_id UUID NOT NULL REFERENCES task_activities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  reaction_type VARCHAR(50) DEFAULT 'like', -- like, heart, thumbs_up, etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(comment_id, user_id, reaction_type)
);
```

---

## API Reference

### Comments

#### GET /api/tasks/:id/comments
List comments with threading support.

**Query Parameters:**
- `limit` (number, default: 50) - Max comments to return
- `offset` (number, default: 0) - Pagination offset
- `replies` (boolean, default: true) - Include replies

**Response:**
```json
{
  "comments": [
    {
      "id": "uuid",
      "task_id": "uuid",
      "author_id": "uuid",
      "author_name": "Paul Giurin",
      "author_avatar": "https://...",
      "parent_id": null,
      "content": "@Clara Check this out",
      "is_internal": false,
      "created_at": "2024-02-22T10:00:00Z",
      "edited_at": null,
      "likes_count": 3,
      "user_has_liked": true,
      "reply_count": 2,
      "replies": [...],
      "mentions": [
        { "userId": "uuid", "name": "Clara Padalini", "mentionText": "Clara" }
      ]
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

#### POST /api/tasks/:id/comments
Create a new comment.

**Body:**
```json
{
  "content": "@Clara Padalini Check this out",
  "parentId": "uuid", // Optional - for replies
  "isInternal": false
}
```

**Notes:**
- @mentions are automatically extracted and notifications sent
- Returns 201 with full comment object

#### PUT /api/comments/:id
Edit an existing comment.

**Body:**
```json
{
  "content": "Updated comment content"
}
```

**Restrictions:**
- Only the author can edit
- Cannot edit deleted comments

#### DELETE /api/comments/:id
Soft delete a comment.

**Response:**
```json
{ "success": true, "id": "uuid" }
```

### Reactions

#### POST /api/comments/:id/like
Toggle like on a comment.

**Response:**
```json
{
  "liked": true,
  "likesCount": 5
}
```

### Users & Mentions

#### GET /api/users/search?q=:query
Search users for @mentions.

**Query Parameters:**
- `q` (string, min: 2 chars) - Search query

**Response:**
```json
{
  "users": [
    {
      "id": "uuid",
      "name": "Clara Padalini",
      "email": "clara@example.com",
      "avatar_url": "https://...",
      "mention_name": "Clara"
    }
  ]
}
```

---

## WebSocket Protocol

### Connection
```javascript
const ws = new WebSocket(
  `wss://api.yourapp.com/api/ws/tasks/${taskId}?` +
  `userId=${userId}&userName=${userName}&userAvatar=${avatar}`
);
```

### Message Types

#### Client → Server

**Send Comment:**
```json
{
  "type": "comment",
  "taskId": "uuid",
  "content": "@Clara Check this",
  "data": { "parentId": "uuid" }
}
```

**Send Like:**
```json
{
  "type": "like",
  "taskId": "uuid",
  "commentId": "uuid"
}
```

**Typing Indicator:**
```json
{
  "type": "typing",
  "taskId": "uuid",
  "data": { "isTyping": true }
}
```

#### Server → Client

**New Comment:**
```json
{
  "type": "comment",
  "taskId": "uuid",
  "commentId": "uuid",
  "userId": "uuid",
  "userName": "Paul Giurin",
  "content": "@Clara Check this",
  "timestamp": 1708600000000
}
```

**Presence Update:**
```json
{
  "type": "presence",
  "data": {
    "event": "joined",
    "activeUsers": [
      { "userId": "uuid", "userName": "Paul" }
    ]
  }
}
```

**Typing Indicator:**
```json
{
  "type": "typing",
  "data": {
    "userName": "Paul",
    "isTyping": true
  }
}
```

**Message History (on connect):**
```json
{
  "type": "history",
  "messages": [...]
}
```

---

## @Mentions System

### Supported Mention Types

1. **Individual Users**
   - Type `@` → Shows user search
   - Format: `@Firstname Lastname` or `@username`
   - Triggers notification to mentioned user

2. **Teams/Groups** (Enhanced Feature)
   - `@Everyone on this board` - All board members
   - `@Everyone on this item` - All task assignees/followers
   - `@Everyone on this workspace` - All workspace members
   - `@Everyone at [Company]` - All organization members

3. **Special Mentions**
   - `@here` - Active users in task
   - `@channel` - All task participants

### Mention Dropdown UI
```
┌──────────────────────────────┐
│ @                            │
├──────────────────────────────┤
│ People                       │
│ 👤 Alicia Karitsas           │
│ 👤 Clara Padalini (Director) │
│ 👤 Craig Lawrence            │
│ 👤 Matthew Crawford          │
├──────────────────────────────┤
│ Teams                        │
│ 👥 Everyone on this board    │
│ 👥 Everyone on this item     │
│ 👥 Everyone on this workspace│
│ 👥 Everyone at ADME...       │
├──────────────────────────────┤
│ ✉️ Invite new member         │
└──────────────────────────────┘
```

### Implementation

#### Frontend (CommentInput.vue)
```vue
<template>
  <div class="relative">
    <UTextarea
      v-model="content"
      @input="checkForMention"
      @keydown="handleKeydown"
    />
    <MentionDropdown
      v-if="showMentions"
      :users="users"
      :teams="teams"
      @select="insertMention"
    />
  </div>
</template>
```

#### Mention Parsing (PostgreSQL)
```sql
-- Extract @mentions from content
CREATE OR REPLACE FUNCTION extract_mentions(content_text TEXT)
RETURNS TABLE (mention_text TEXT, username TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    regexp_matches[1] as mention_text,
    regexp_replace(regexp_matches[1], '^@', '') as username
  FROM regexp_matches(content_text, '@([A-Za-z0-9_]+|(?:[A-Za-z]+\s+[A-Za-z]+))', 'gi') as regexp_matches;
END;
$$ LANGUAGE plpgsql;
```

---

## Components Usage

### Basic Comment Thread
```vue
<template>
  <TaskActivityFeed :task-id="taskId" />
</template>
```

### With Real-time WebSocket
```vue
<template>
  <CommentThreadRealtime 
    :task-id="taskId"
    placeholder="Write an update..."
  />
</template>
```

### Individual Components
```vue
<template>
  <!-- Just the input -->
  <TaskCommentInput
    :task-id="taskId"
    @submit="onSubmit"
  />
  
  <!-- Just the list -->
  <TaskCommentItem
    v-for="comment in comments"
    :key="comment.id"
    :comment="comment"
    @like="onLike"
    @reply="onReply"
  />
</template>
```

---

## Composables

### useTaskComments
```typescript
const {
  comments,      // Ref<Comment[]>
  loading,       // Ref<boolean>
  hasMore,       // Ref<boolean>
  fetchComments, // (reset?: boolean) => Promise<void>
  createComment, // (data: CreateCommentData) => Promise<Comment>
  editComment,   // (id: string, content: string) => Promise<void>
  deleteComment, // (id: string) => Promise<void>
  toggleLike     // (id: string) => Promise<void>
} = useTaskComments(taskId);
```

### useTaskWebSocket
```typescript
const {
  isConnected,   // Ref<boolean>
  activeUsers,   // Ref<Array<{userId, userName}>>
  typingText,    // Ref<string>
  connect,       // (userId, userName, avatar?) => void
  sendComment,   // (content: string) => void
  sendLike,      // (commentId: string) => void
  onMessage      // (handler) => () => void (unsubscribe)
} = useTaskWebSocket(taskId);
```

---

## Deployment

### 1. Apply Database Migration
```bash
psql $DATABASE_URL -f server/database/schema-task-comments.sql
```

### 2. Deploy Durable Objects
```bash
# Deploy to Cloudflare Workers
npx wrangler deploy

# Apply migrations
npx wrangler d1 migrations apply agency-dashboard
```

### 3. Environment Variables
```bash
# Required
DATABASE_URL=postgresql://...

# Optional (for WebSocket)
API_URL=https://your-api.com
```

---

## Testing

### Test Page
Visit: `http://localhost:3001/test/comments`

### Manual Tests
1. Create a comment with @mention
2. Verify notification sent
3. Reply to comment
4. Like a comment
5. Edit comment
6. Delete comment (soft)
7. Open multiple browsers - verify real-time sync

---

## Future Enhancements

### Short-term
- [ ] File attachments in comments
- [ ] Emoji picker
- [ ] Rich text editor (Markdown)
- [ ] Comment search

### Medium-term
- [ ] Reactions beyond like (👍 👎 😄 🎉)
- [ ] Comment pinning
- [ ] Anonymous comments (client portal)
- [ ] Comment templates/snippets

### Long-term
- [ ] Voice messages
- [ ] Video comments (Loom integration)
- [ ] AI-powered comment summarization
- [ ] Sentiment analysis

---

## Troubleshooting

### WebSocket not connecting
- Check `wrangler.toml` has DO bindings
- Verify `compatibility_flags = ["nodejs_compat"]`
- Check browser console for CORS errors

### @mentions not working
- Verify `task_comment_mentions` table exists
- Check trigger is applied: `trigger_process_mentions`
- Ensure user search API returns results

### Comments not persisting
- Check Neon connection string
- Verify `task_activities` table has correct schema
- Check API logs for errors
