# Enhanced @Mentions System

## Overview
The enhanced mention system supports both **individual users** and **team/group mentions**.

## Mention Types

### Individual Users
```
@Paul Giurin
@clara
```

### Team Mentions (NEW)

| Mention | Description | Resolved To |
|---------|-------------|-------------|
| `@Everyone on this board` | All department/board members | Department members |
| `@Everyone on this item` | Task assignees + subscribers | Task participants |
| `@Everyone on this workspace` | All workspace members | Workspace members |
| `@Everyone at [Company]` | All organization members | All active users |
| `@here` | Currently active users | Active in this task |
| `@channel` | All task participants | Commenters + assignees |

## Database Schema

### mention_types Table
```sql
INSERT INTO mention_types (id, name, category, icon) VALUES
  ('user', 'Person', 'person', 'i-lucide-user'),
  ('board', 'Everyone on this board', 'team', 'i-lucide-users'),
  ('item', 'Everyone on this item', 'team', 'i-lucide-file-text'),
  ('workspace', 'Everyone on this workspace', 'team', 'i-lucide-building'),
  ('company', 'Everyone at company', 'team', 'i-lucide-building-2'),
  ('here', 'Active here', 'special', 'i-lucide-radio'),
  ('channel', 'All participants', 'special', 'i-lucide-message-circle');
```

### Resolution

Team mentions are resolved to individual users:

```sql
-- "@Everyone on this board" becomes:
SELECT team_member_id FROM department_members WHERE department_id = ?

-- "@Everyone on this item" becomes:
SELECT assignee_id FROM tasks WHERE id = ?
UNION
SELECT user_id FROM task_subscribers WHERE task_id = ?
UNION
SELECT user_id FROM task_activities WHERE task_id = ?
```

## UI Components

### Mention Dropdown
```
┌────────────────────────────────┐
│ @                              │
├────────────────────────────────┤
│ People                         │
│ 👤 Alicia Karitsas             │
│ 👤 Clara Padalini (Director)   │
│ 👤 Craig Lawrence              │
├────────────────────────────────┤
│ Teams                          │
│ 👥 Everyone on this board      │
│ 👥 Everyone on this item       │
│ 👥 Everyone on this workspace  │
│ 👥 Everyone at ADME...         │
├────────────────────────────────┤
│ ✉️ Invite new member           │
└────────────────────────────────┘
```

## API Usage

### Search Mentions
```
GET /api/users/search?q=eve&taskId=xxx&boardId=xxx
```

**Response:**
```json
{
  "suggestions": [
    {
      "id": "board",
      "name": "Everyone on this board",
      "type": "board",
      "category": "team",
      "icon": "i-lucide-users",
      "is_team": true
    },
    {
      "id": "user-uuid",
      "name": "Paul Giurin",
      "type": "user",
      "category": "person",
      "is_team": false
    }
  ]
}
```

## Notifications

### Team Mention Notifications
When someone uses `@Everyone on this board`:

1. System creates ONE mention record with `resolved_user_ids` array
2. Each resolved user gets a notification:
   ```
   "You were mentioned by Paul in 'Everyone on this board'"
   ```
3. Notification links to the task with highlight

## Implementation Details

### Frontend
- Type `@` to show dropdown
- Shows both users and team options
- Team mentions highlighted differently
- "Invite" button for adding new members

### Backend
- `get_mention_suggestions()` - Returns users + teams
- `resolve_team_mention()` - Expands team to users
- `process_comment_mentions_v2()` - Handles both types

## Testing

```bash
# Test team mention
POST /api/tasks/xxx/comments
{ "content": "@Everyone on this board please review" }

# Verify notifications sent to all board members
SELECT * FROM notifications WHERE type = 'task_mentioned';

# Verify mention record
SELECT * FROM task_comment_mentions 
WHERE mention_type = 'board' 
AND resolved_user_ids IS NOT NULL;
```

## Migration

Already applied:
```sql
-- Run this to add team support
psql $DATABASE_URL -f server/database/schema-task-mentions-enhanced.sql
```
