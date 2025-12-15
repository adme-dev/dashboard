# PRD: Agency Workflow Dashboard (Monday.com Style)

## Overview

Build a comprehensive departmental workflow management system for advertising agencies, featuring Kanban boards, task management, approval workflows, and capacity planning.

**Target Users:** Agency team members, department heads, project managers, account managers, clients (limited view)

**Key Competitors:** Monday.com, Asana, Teamwork, Wrike, ClickUp

---

## Phase 1: Database Schema & Foundation

### 1.1 Create Department Tables
- [ ] **1.1.1** Create `departments` table
  - id (UUID, PK)
  - name (VARCHAR 100) - 'Creative', 'Marketing', 'Production', 'Account Services', 'Operations'
  - slug (VARCHAR 50, unique) - URL-friendly identifier
  - description (TEXT)
  - color (VARCHAR 7) - Hex color for UI
  - icon (VARCHAR 50) - Lucide icon name
  - manager_id (UUID, FK → team_members)
  - is_active (BOOLEAN, default true)
  - sort_order (INTEGER)
  - created_at, updated_at (TIMESTAMPTZ)

- [ ] **1.1.2** Create `department_members` junction table
  - id (UUID, PK)
  - department_id (UUID, FK → departments)
  - team_member_id (UUID, FK → team_members)
  - role (VARCHAR 50) - 'lead', 'senior', 'member', 'junior'
  - is_primary (BOOLEAN) - Primary department for this member
  - created_at (TIMESTAMPTZ)
  - UNIQUE(department_id, team_member_id)

- [ ] **1.1.3** Add department_id to team_members table (primary department shortcut)

### 1.2 Create Task Management Tables
- [ ] **1.2.1** Create `task_statuses` table (configurable workflow stages)
  - id (UUID, PK)
  - department_id (UUID, FK → departments, nullable for global statuses)
  - name (VARCHAR 100) - 'Backlog', 'To Do', 'In Progress', etc.
  - slug (VARCHAR 50)
  - color (VARCHAR 7)
  - icon (VARCHAR 50)
  - category (VARCHAR 50) - 'not_started', 'in_progress', 'review', 'done', 'cancelled'
  - is_default (BOOLEAN) - Default status for new tasks
  - is_final (BOOLEAN) - Marks task as complete
  - sort_order (INTEGER)
  - created_at (TIMESTAMPTZ)

- [ ] **1.2.2** Create `tasks` table
  - id (UUID, PK)
  - project_id (UUID, FK → projects)
  - department_id (UUID, FK → departments)
  - parent_task_id (UUID, FK → tasks, nullable) - For subtasks
  - status_id (UUID, FK → task_statuses)
  - title (VARCHAR 255)
  - description (TEXT)
  - priority (VARCHAR 20) - 'urgent', 'high', 'medium', 'low'
  - task_type (VARCHAR 50) - 'task', 'milestone', 'bug', 'feature', 'review'
  - assignee_id (UUID, FK → team_members, nullable)
  - reporter_id (UUID, FK → team_members)
  - due_date (DATE)
  - start_date (DATE)
  - estimated_hours (DECIMAL 5,2)
  - actual_hours (DECIMAL 5,2)
  - sort_order (INTEGER)
  - is_blocked (BOOLEAN, default false)
  - blocked_reason (TEXT)
  - created_at, updated_at (TIMESTAMPTZ)

- [ ] **1.2.3** Create `task_assignees` table (multiple assignees support)
  - id (UUID, PK)
  - task_id (UUID, FK → tasks)
  - team_member_id (UUID, FK → team_members)
  - role (VARCHAR 50) - 'assignee', 'reviewer', 'approver'
  - created_at (TIMESTAMPTZ)
  - UNIQUE(task_id, team_member_id, role)

- [ ] **1.2.4** Create `task_labels` table
  - id (UUID, PK)
  - name (VARCHAR 100)
  - color (VARCHAR 7)
  - department_id (UUID, FK → departments, nullable)
  - created_at (TIMESTAMPTZ)

- [ ] **1.2.5** Create `task_label_assignments` junction table
  - task_id (UUID, FK → tasks)
  - label_id (UUID, FK → task_labels)
  - PRIMARY KEY (task_id, label_id)

- [ ] **1.2.6** Create `task_dependencies` table
  - id (UUID, PK)
  - task_id (UUID, FK → tasks) - The dependent task
  - depends_on_task_id (UUID, FK → tasks) - The blocking task
  - dependency_type (VARCHAR 50) - 'blocks', 'is_blocked_by', 'relates_to'
  - created_at (TIMESTAMPTZ)
  - UNIQUE(task_id, depends_on_task_id)

### 1.3 Create Activity & Comments Tables
- [ ] **1.3.1** Create `task_activities` table
  - id (UUID, PK)
  - task_id (UUID, FK → tasks)
  - user_id (UUID, FK → team_members)
  - activity_type (VARCHAR 50) - 'created', 'status_change', 'assignment', 'comment', 'attachment', 'due_date_change', 'priority_change'
  - old_value (JSONB) - Previous state
  - new_value (JSONB) - New state
  - content (TEXT) - For comments
  - created_at (TIMESTAMPTZ)

- [ ] **1.3.2** Create `task_attachments` table
  - id (UUID, PK)
  - task_id (UUID, FK → tasks)
  - uploaded_by (UUID, FK → team_members)
  - file_name (VARCHAR 255)
  - file_url (TEXT)
  - file_type (VARCHAR 100)
  - file_size (INTEGER)
  - created_at (TIMESTAMPTZ)

### 1.4 Create Approval Workflow Tables
- [ ] **1.4.1** Create `approval_workflows` table
  - id (UUID, PK)
  - name (VARCHAR 100)
  - description (TEXT)
  - department_id (UUID, FK → departments, nullable)
  - is_active (BOOLEAN)
  - created_at (TIMESTAMPTZ)

- [ ] **1.4.2** Create `approval_workflow_steps` table
  - id (UUID, PK)
  - workflow_id (UUID, FK → approval_workflows)
  - step_order (INTEGER)
  - name (VARCHAR 100) - 'Internal Review', 'Client Review', 'Final Approval'
  - approver_type (VARCHAR 50) - 'specific_user', 'role', 'department_lead', 'client'
  - approver_id (UUID, nullable) - Specific user if approver_type = 'specific_user'
  - approver_role (VARCHAR 50, nullable) - Role name if approver_type = 'role'
  - required_approvals (INTEGER, default 1)
  - can_skip (BOOLEAN, default false)
  - created_at (TIMESTAMPTZ)

- [ ] **1.4.3** Create `task_approvals` table
  - id (UUID, PK)
  - task_id (UUID, FK → tasks)
  - workflow_step_id (UUID, FK → approval_workflow_steps)
  - status (VARCHAR 50) - 'pending', 'approved', 'rejected', 'skipped'
  - approved_by (UUID, FK → team_members, nullable)
  - approved_at (TIMESTAMPTZ)
  - comments (TEXT)
  - created_at (TIMESTAMPTZ)

### 1.5 Database Indexes & Views
- [ ] **1.5.1** Create indexes for all foreign keys
- [ ] **1.5.2** Create index on tasks(status_id, department_id)
- [ ] **1.5.3** Create index on tasks(assignee_id, status_id)
- [ ] **1.5.4** Create index on tasks(project_id, department_id)
- [ ] **1.5.5** Create index on tasks(due_date)
- [ ] **1.5.6** Create index on task_activities(task_id, created_at)

- [ ] **1.5.7** Create `v_task_summary` view
  - Task with all related data joined (status, assignee, department, project, client)

- [ ] **1.5.8** Create `v_department_workload` view
  - Tasks per department, status distribution, assignee workload

- [ ] **1.5.9** Create `v_team_capacity` view
  - Team member workload, estimated vs actual hours, upcoming deadlines

### 1.6 Seed Default Data
- [ ] **1.6.1** Seed default departments
  - Creative (color: #8B5CF6, icon: palette)
  - Marketing (color: #F59E0B, icon: megaphone)
  - Production (color: #10B981, icon: video)
  - Account Services (color: #3B82F6, icon: users)
  - Operations (color: #6B7280, icon: settings)

- [ ] **1.6.2** Seed default task statuses
  - Backlog (category: not_started, color: #6B7280)
  - To Do (category: not_started, color: #3B82F6, is_default: true)
  - In Progress (category: in_progress, color: #F59E0B)
  - Internal Review (category: review, color: #8B5CF6)
  - Client Review (category: review, color: #EC4899)
  - Revisions (category: in_progress, color: #EF4444)
  - Approved (category: done, color: #10B981)
  - Done (category: done, color: #10B981, is_final: true)
  - Cancelled (category: cancelled, color: #6B7280, is_final: true)

- [ ] **1.6.3** Seed default labels
  - Urgent, Bug, Feature, Enhancement, Documentation, Design, Development

- [ ] **1.6.4** Seed default approval workflow
  - Standard Creative Approval: Internal Review → Client Review → Final

### 1.7 Update Zero Schema
- [ ] **1.7.1** Add departments table to Zero schema
- [ ] **1.7.2** Add tasks table to Zero schema
- [ ] **1.7.3** Add task_statuses table to Zero schema
- [ ] **1.7.4** Add task_activities table to Zero schema
- [ ] **1.7.5** Add task_labels table to Zero schema
- [ ] **1.7.6** Update Zero replication publication
- [ ] **1.7.7** Define Zero permissions for new tables

---

## Phase 2: API Endpoints

### 2.1 Department APIs
- [ ] **2.1.1** GET /api/agency/departments - List all departments
- [ ] **2.1.2** GET /api/agency/departments/[id] - Get department details
- [ ] **2.1.3** POST /api/agency/departments - Create department
- [ ] **2.1.4** PUT /api/agency/departments/[id] - Update department
- [ ] **2.1.5** GET /api/agency/departments/[id]/members - Get department members
- [ ] **2.1.6** POST /api/agency/departments/[id]/members - Add member to department
- [ ] **2.1.7** DELETE /api/agency/departments/[id]/members/[memberId] - Remove member

### 2.2 Task APIs
- [ ] **2.2.1** GET /api/agency/tasks - List tasks with filters
  - Query params: department_id, project_id, status_id, assignee_id, due_date_from, due_date_to, priority, search
- [ ] **2.2.2** GET /api/agency/tasks/[id] - Get task details with activities
- [ ] **2.2.3** POST /api/agency/tasks - Create task
- [ ] **2.2.4** PUT /api/agency/tasks/[id] - Update task
- [ ] **2.2.5** DELETE /api/agency/tasks/[id] - Delete task (soft delete)
- [ ] **2.2.6** PATCH /api/agency/tasks/[id]/status - Update task status
- [ ] **2.2.7** PATCH /api/agency/tasks/[id]/assignee - Update assignee
- [ ] **2.2.8** POST /api/agency/tasks/[id]/comments - Add comment
- [ ] **2.2.9** GET /api/agency/tasks/[id]/activities - Get task activity feed
- [ ] **2.2.10** POST /api/agency/tasks/[id]/attachments - Upload attachment
- [ ] **2.2.11** PATCH /api/agency/tasks/reorder - Reorder tasks (drag-drop)

### 2.3 Task Status APIs
- [ ] **2.3.1** GET /api/agency/statuses - List all statuses
- [ ] **2.3.2** GET /api/agency/statuses/[departmentId] - Get department-specific statuses
- [ ] **2.3.3** POST /api/agency/statuses - Create custom status
- [ ] **2.3.4** PUT /api/agency/statuses/[id] - Update status
- [ ] **2.3.5** PATCH /api/agency/statuses/reorder - Reorder statuses

### 2.4 Label APIs
- [ ] **2.4.1** GET /api/agency/labels - List all labels
- [ ] **2.4.2** POST /api/agency/labels - Create label
- [ ] **2.4.3** PUT /api/agency/labels/[id] - Update label
- [ ] **2.4.4** DELETE /api/agency/labels/[id] - Delete label

### 2.5 Approval APIs
- [ ] **2.5.1** GET /api/agency/tasks/[id]/approvals - Get approval status
- [ ] **2.5.2** POST /api/agency/tasks/[id]/approvals - Submit for approval
- [ ] **2.5.3** PATCH /api/agency/tasks/[id]/approvals/[stepId] - Approve/reject

### 2.6 Dashboard/Analytics APIs
- [ ] **2.6.1** GET /api/agency/dashboard/department/[id] - Department dashboard data
- [ ] **2.6.2** GET /api/agency/dashboard/workload - Team workload data
- [ ] **2.6.3** GET /api/agency/dashboard/my-tasks - Current user's tasks
- [ ] **2.6.4** GET /api/agency/dashboard/overdue - Overdue tasks
- [ ] **2.6.5** GET /api/agency/dashboard/upcoming - Upcoming deadlines

---

## Phase 3: Core UI Components

### 3.1 Kanban Board Components
- [ ] **3.1.1** Create `KanbanBoard.vue` - Main board container
  - Props: departmentId, projectId, filters
  - Slots for custom column headers and card templates
  - Horizontal scrolling for many columns

- [ ] **3.1.2** Create `KanbanColumn.vue` - Status column
  - Props: status, tasks, canAddTask
  - Drag-and-drop zone for cards
  - Task count badge
  - Collapse/expand functionality
  - "Add task" button

- [ ] **3.1.3** Create `KanbanCard.vue` - Task card
  - Props: task
  - Draggable with @vueuse/core useDraggable
  - Shows: title, assignee avatar, due date, priority indicator, labels
  - Quick actions: change assignee, change priority, open details
  - Visual indicators: overdue (red), blocked (gray), has comments (icon)

- [ ] **3.1.4** Create `KanbanCardDetail.vue` - Task detail slideover/modal
  - Full task editing
  - Activity feed
  - Comments section
  - Attachments
  - Subtasks list
  - Time tracking integration

- [ ] **3.1.5** Create `KanbanFilters.vue` - Filter bar
  - Filter by: assignee, priority, label, due date range
  - Search box
  - Group by: none, assignee, priority, project
  - View toggle: board, list, timeline

- [ ] **3.1.6** Implement drag-and-drop logic
  - Use @vueuse/core or vue-draggable-plus
  - Optimistic UI updates
  - Server sync with rollback on error
  - Cross-column drag support
  - Sort order persistence

### 3.2 Task Form Components
- [ ] **3.2.1** Create `TaskForm.vue` - Create/edit task form
  - Title (required)
  - Description (rich text with @tiptap/vue-3)
  - Department selector
  - Project selector
  - Assignee(s) selector with avatars
  - Due date picker
  - Start date picker
  - Priority selector
  - Labels multi-select
  - Estimated hours
  - Parent task selector (for subtasks)
  - Attachments upload

- [ ] **3.2.2** Create `TaskQuickAdd.vue` - Inline quick add
  - Minimal form: title only
  - Inherits department/project from context
  - Auto-focuses on create
  - Enter to submit, Escape to cancel

- [ ] **3.2.3** Create `TaskAssigneeSelect.vue` - Assignee selector
  - Search/filter team members
  - Show avatars and roles
  - Multi-select support for reviewers

- [ ] **3.2.4** Create `TaskPrioritySelect.vue` - Priority selector
  - Visual priority indicators (colors, icons)
  - Keyboard navigation

- [ ] **3.2.5** Create `TaskLabelSelect.vue` - Label multi-select
  - Colored labels
  - Create new label inline
  - Search labels

- [ ] **3.2.6** Create `TaskDueDatePicker.vue` - Due date picker
  - Calendar picker
  - Quick options: Today, Tomorrow, Next week, Custom
  - Time selection for deadlines
  - Overdue visual indicator

### 3.3 Activity & Comments Components
- [ ] **3.3.1** Create `TaskActivityFeed.vue` - Activity timeline
  - Chronological list of all activities
  - Filter by type (all, comments, changes)
  - Load more pagination

- [ ] **3.3.2** Create `TaskActivityItem.vue` - Single activity item
  - Different layouts for: comment, status change, assignment, etc.
  - Relative timestamps
  - User avatar

- [ ] **3.3.3** Create `TaskCommentInput.vue` - Comment input
  - Rich text editor
  - @mentions support
  - Attachment upload
  - Submit on Ctrl+Enter

- [ ] **3.3.4** Create `TaskAttachmentList.vue` - Attachments display
  - Thumbnail previews for images
  - File type icons
  - Download links
  - Delete option

### 3.4 Workload & Capacity Components
- [ ] **3.4.1** Create `WorkloadHeatmap.vue` - Team capacity heatmap
  - Rows: team members
  - Columns: days/weeks
  - Cell color: utilization percentage
  - Hover: show task details

- [ ] **3.4.2** Create `WorkloadBar.vue` - Individual workload bar
  - Props: memberId, period
  - Shows: assigned hours vs available hours
  - Visual: progress bar with color coding

- [ ] **3.4.3** Create `CapacityOverview.vue` - Capacity summary cards
  - Total team capacity
  - Assigned hours
  - Available hours
  - Overallocated members warning

- [ ] **3.4.4** Create `TeamMemberWorkload.vue` - Member workload detail
  - Task list for member
  - Hours by project breakdown
  - Upcoming deadlines

### 3.5 Department Dashboard Components
- [ ] **3.5.1** Create `DepartmentHeader.vue` - Department page header
  - Department name and icon
  - Member avatars
  - Quick stats (active tasks, overdue, completed this week)

- [ ] **3.5.2** Create `DepartmentStats.vue` - Statistics cards
  - Tasks by status (pie chart)
  - Completion rate
  - Average time to complete
  - Overdue percentage

- [ ] **3.5.3** Create `DepartmentMemberList.vue` - Team member cards
  - Member avatar, name, role
  - Current task count
  - Utilization indicator
  - Click to filter board by member

---

## Phase 4: Pages & Navigation

### 4.1 Department Pages
- [ ] **4.1.1** Create `/agency/workflow/index.vue` - Workflow overview
  - All departments grid
  - Quick stats per department
  - Recent activity across all departments

- [ ] **4.1.2** Create `/agency/workflow/[department]/index.vue` - Department board
  - Full Kanban board for department
  - Department header with stats
  - Filter bar
  - Board/List/Timeline view toggle

- [ ] **4.1.3** Create `/agency/workflow/[department]/tasks/[id].vue` - Task detail page
  - Full task view (alternative to modal)
  - All task details
  - Activity feed
  - Related tasks

- [ ] **4.1.4** Create `/agency/workflow/my-tasks.vue` - Personal task list
  - All tasks assigned to current user
  - Grouped by: status, project, department, due date
  - Quick filters

- [ ] **4.1.5** Create `/agency/workflow/calendar.vue` - Calendar view
  - Tasks on calendar by due date
  - Month/week/day views
  - Drag to reschedule

- [ ] **4.1.6** Create `/agency/workflow/timeline.vue` - Gantt-style timeline
  - Tasks as bars on timeline
  - Dependencies shown as arrows
  - Milestones markers

### 4.2 Settings Pages
- [ ] **4.2.1** Create `/agency/settings/departments.vue` - Department management
  - CRUD for departments
  - Member assignment
  - Custom statuses per department

- [ ] **4.2.2** Create `/agency/settings/statuses.vue` - Status management
  - Global and department-specific statuses
  - Drag to reorder
  - Color picker

- [ ] **4.2.3** Create `/agency/settings/labels.vue` - Label management
  - CRUD for labels
  - Color picker
  - Department assignment

- [ ] **4.2.4** Create `/agency/settings/workflows.vue` - Approval workflow settings
  - Create/edit approval workflows
  - Define steps and approvers

### 4.3 Navigation Updates
- [ ] **4.3.1** Add Workflow section to sidebar
  - Workflow Overview link
  - Individual department links
  - My Tasks link
  - Calendar link

- [ ] **4.3.2** Add workflow items to command palette
  - Quick task creation
  - Jump to department
  - Search tasks

- [ ] **4.3.3** Add workflow notifications
  - Task assigned to you
  - Task status changed
  - Approval required
  - Comment mentions

---

## Phase 5: Advanced Features

### 5.1 Drag-and-Drop Enhancements
- [ ] **5.1.1** Implement cross-department drag
  - Drag task from one department board to another
  - Confirm department change dialog

- [ ] **5.1.2** Implement bulk actions
  - Multi-select tasks
  - Bulk status change
  - Bulk assign
  - Bulk move to project

- [ ] **5.1.3** Implement keyboard shortcuts
  - N: New task
  - E: Edit selected task
  - D: Delete task
  - Arrow keys: Navigate cards
  - 1-9: Set priority
  - Enter: Open task detail

### 5.2 Approval Workflow Features
- [ ] **5.2.1** Implement approval UI in task detail
  - Show current approval step
  - Approve/Reject buttons with comment
  - Approval history

- [ ] **5.2.2** Implement approval notifications
  - Email notification (future)
  - In-app notification
  - Dashboard widget for pending approvals

- [ ] **5.2.3** Implement client approval portal (future)
  - Limited external view
  - Client login
  - Approve/request changes

### 5.3 Time Tracking Integration
- [ ] **5.3.1** Link time entries to tasks
  - Add time_entry from task detail
  - Show logged hours on task card
  - Compare estimated vs actual

- [ ] **5.3.2** Auto-calculate actual hours
  - Sum time entries linked to task
  - Update task.actual_hours automatically

### 5.4 Reporting & Analytics
- [ ] **5.4.1** Create task completion report
  - Tasks completed per period
  - By department, project, member
  - Average completion time

- [ ] **5.4.2** Create workload report
  - Team utilization
  - Over/under allocated
  - Forecast based on estimated hours

- [ ] **5.4.3** Create project progress report
  - Task progress per project
  - Burndown chart
  - Upcoming milestones

### 5.5 Automations (Future)
- [ ] **5.5.1** Design automation rules engine
- [ ] **5.5.2** Implement status-based automations
  - When status = X, assign to Y
  - When status = X, notify Z
- [ ] **5.5.3** Implement due date automations
  - Send reminder X days before due
  - Auto-escalate overdue tasks

---

## Phase 6: Polish & Optimization

### 6.1 Performance Optimization
- [ ] **6.1.1** Implement virtual scrolling for large task lists
- [ ] **6.1.2** Optimize Kanban board rendering (only visible cards)
- [ ] **6.1.3** Implement optimistic updates for drag-drop
- [ ] **6.1.4** Add loading skeletons for all components
- [ ] **6.1.5** Implement task list pagination

### 6.2 Real-time Updates
- [ ] **6.2.1** Configure Zero sync for tasks
- [ ] **6.2.2** Implement real-time task updates across clients
- [ ] **6.2.3** Show "task updated" indicator when others edit
- [ ] **6.2.4** Handle concurrent edit conflicts

### 6.3 Mobile Responsiveness
- [ ] **6.3.1** Make Kanban board horizontally scrollable on mobile
- [ ] **6.3.2** Create mobile-optimized task card
- [ ] **6.3.3** Implement swipe actions for quick status change
- [ ] **6.3.4** Optimize task detail view for mobile

### 6.4 Accessibility
- [ ] **6.4.1** Add keyboard navigation to Kanban board
- [ ] **6.4.2** Add ARIA labels to all interactive elements
- [ ] **6.4.3** Ensure color contrast meets WCAG AA
- [ ] **6.4.4** Add screen reader announcements for drag-drop

### 6.5 Testing
- [ ] **6.5.1** Write unit tests for task API endpoints
- [ ] **6.5.2** Write component tests for Kanban components
- [ ] **6.5.3** Write E2E tests for critical workflows
  - Create task
  - Drag task to new status
  - Assign task
  - Add comment

---

## Implementation Order

### Sprint 1: Foundation (Week 1-2)
1. Phase 1.1-1.3: Database tables (departments, tasks, activities)
2. Phase 1.5-1.6: Indexes, views, seed data
3. Phase 1.7: Update Zero schema
4. Phase 2.1-2.2: Department and Task APIs

### Sprint 2: Core Kanban (Week 3-4)
1. Phase 3.1: Kanban board components
2. Phase 3.2: Task form components
3. Phase 4.1.1-4.1.2: Department pages
4. Phase 4.3.1: Navigation updates

### Sprint 3: Interaction & Polish (Week 5-6)
1. Phase 3.3: Activity and comments
2. Phase 5.1: Drag-drop enhancements
3. Phase 5.3: Time tracking integration
4. Phase 6.1-6.2: Performance and real-time

### Sprint 4: Advanced Features (Week 7-8)
1. Phase 1.4: Approval workflow tables
2. Phase 2.5: Approval APIs
3. Phase 5.2: Approval workflow UI
4. Phase 3.4: Workload components
5. Phase 4.1.4-4.1.6: Additional pages

### Sprint 5: Reporting & Mobile (Week 9-10)
1. Phase 5.4: Reporting & analytics
2. Phase 6.3-6.4: Mobile and accessibility
3. Phase 6.5: Testing
4. Phase 4.2: Settings pages

---

## Success Metrics

- [ ] Team can create and track tasks through full workflow
- [ ] Kanban board loads in < 2 seconds with 100+ tasks
- [ ] Drag-drop status changes sync within 500ms
- [ ] 90%+ of team interactions happen without page reload
- [ ] Workload view accurately reflects team capacity
- [ ] Approval workflow reduces email back-and-forth by 50%

---

## Technical Dependencies

**Required Packages:**
- `@vueuse/core` - Draggable, keyboard shortcuts
- `vue-draggable-plus` or `@formkit/drag-and-drop` - Drag and drop
- `@tiptap/vue-3` - Rich text editor for descriptions/comments
- `date-fns` - Date formatting (already installed)

**Database:**
- Postgres (Neon) - Already configured
- Zero sync - Already configured

**UI Components:**
- Nuxt UI - Already installed
- Lucide icons - Already installed
