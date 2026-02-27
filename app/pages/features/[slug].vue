<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e]">
    <MarketingNav active="features" />

    <!-- Feature Found -->
    <template v-if="feature">
      <!-- Breadcrumb -->
      <div class="pt-[52px]">
        <div class="max-w-[1200px] mx-auto px-6 pt-8">
          <NuxtLink to="/features" class="inline-flex items-center gap-1.5 text-[14px] text-[#45474D] dark:text-white/60 hover:text-[#121317] dark:hover:text-white transition-colors">
            <UIcon name="i-lucide-arrow-left" class="w-3.5 h-3.5" />
            All Features
          </NuxtLink>
        </div>
      </div>

      <!-- Hero -->
      <section>
        <div class="max-w-[720px] mx-auto px-6 pt-16 pb-16 md:pt-24 md:pb-20">
          <div class="flex items-center gap-3 mb-6">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center" :class="feature.categoryIconBg">
              <UIcon :name="feature.categoryIcon" class="w-5 h-5" :class="feature.categoryIconColor" />
            </div>
            <span class="text-[14px] text-[#45474D] dark:text-white/60 font-medium">{{ feature.category }}</span>
          </div>
          <div class="flex items-start gap-5 mb-6">
            <div class="w-14 h-14 rounded-2xl bg-[#f4f5f7] dark:bg-white/[0.06] flex items-center justify-center flex-shrink-0">
              <UIcon :name="feature.icon" class="w-7 h-7 text-[#121317] dark:text-white" />
            </div>
            <h1 class="text-[clamp(32px,5vw,48px)] font-[450] text-[#121317] dark:text-white leading-[1.1] tracking-[-0.02em]">
              {{ feature.title }}
            </h1>
          </div>
          <p class="text-lg md:text-xl text-[#45474D] dark:text-white/60 leading-relaxed">
            {{ feature.description }}
          </p>
        </div>
      </section>

      <!-- Detail Sections -->
      <section class="pb-20 md:pb-32">
        <div class="max-w-[720px] mx-auto px-6">
          <div class="flex flex-col gap-16">
            <div
              v-for="(detail, i) in feature.details"
              :key="i"
              class="relative"
            >
              <div class="flex items-center gap-3 mb-4">
                <div class="w-8 h-8 rounded-lg bg-[#f4f5f7] dark:bg-white/[0.06] flex items-center justify-center text-[14px] font-medium text-[#45474D] dark:text-white/60">
                  {{ String(i + 1).padStart(2, '0') }}
                </div>
                <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em]">{{ detail.title }}</h2>
              </div>
              <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-[1.75] pl-11">
                {{ detail.content }}
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- CTA -->
      <section class="py-10 md:py-16">
        <div class="max-w-[1200px] mx-auto px-6">
          <div class="rounded-[2rem] bg-[#0a0b0e] py-24 md:py-32 text-center px-6">
            <h2 class="text-[clamp(28px,4vw,48px)] font-[450] text-white leading-[1.15] tracking-[-0.02em] mb-10">
              Ready to see it in action?
            </h2>
            <NuxtLink
              to="/auth/login"
              class="inline-flex items-center gap-2 px-7 py-3.5 bg-white text-[#121317] text-[17.5px] font-medium rounded-full hover:bg-white/90 transition-colors"
            >
              Get Started
            </NuxtLink>
          </div>
        </div>
      </section>
    </template>

    <!-- 404 — slug not found -->
    <template v-else>
      <div class="pt-[52px]">
        <div class="max-w-[720px] mx-auto px-6 pt-32 pb-40 text-center">
          <div class="w-16 h-16 rounded-2xl bg-[#f4f5f7] dark:bg-white/[0.06] flex items-center justify-center mx-auto mb-6">
            <UIcon name="i-lucide-search-x" class="w-8 h-8 text-[#45474D] dark:text-white/60" />
          </div>
          <h1 class="text-[32px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-3">Feature not found</h1>
          <p class="text-[16px] text-[#45474D] dark:text-white/60 mb-8">The feature you're looking for doesn't exist or may have been moved.</p>
          <NuxtLink
            to="/features"
            class="inline-flex items-center gap-2 px-6 py-3 bg-[#121317] dark:bg-white text-white dark:text-[#121317] text-[15px] font-medium rounded-full hover:bg-[#2a2b30] dark:hover:bg-white/90 transition-colors"
          >
            <UIcon name="i-lucide-arrow-left" class="w-4 h-4" />
            Back to Features
          </NuxtLink>
        </div>
      </div>
    </template>

    <!-- Footer -->
    <footer class="pt-20 pb-10">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="flex flex-col md:flex-row gap-12 md:gap-0 md:justify-between mb-20">
          <div>
            <h3 class="text-[clamp(22px,3vw,32px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em]">Experience XeroFlow</h3>
          </div>
          <div class="flex gap-20 md:gap-28">
            <div class="flex flex-col gap-3.5 text-[15px]">
              <NuxtLink to="/auth/login" class="text-[#45474D] dark:text-white/50 hover:text-[#121317] dark:hover:text-white transition-colors">Sign In</NuxtLink>
              <NuxtLink to="/auth/xeroflow" class="text-[#45474D] dark:text-white/50 hover:text-[#121317] dark:hover:text-white transition-colors">XeroFlow</NuxtLink>
              <NuxtLink to="/portal/login" class="text-[#45474D] dark:text-white/50 hover:text-[#121317] dark:hover:text-white transition-colors">Client Portal</NuxtLink>
              <NuxtLink to="/features" class="text-[#45474D] dark:text-white/50 hover:text-[#121317] dark:hover:text-white transition-colors">Features</NuxtLink>
            </div>
            <div class="flex flex-col gap-3.5 text-[15px]">
              <NuxtLink to="/privacy" class="text-[#45474D] dark:text-white/50 hover:text-[#121317] dark:hover:text-white transition-colors">Privacy</NuxtLink>
              <NuxtLink to="/terms" class="text-[#45474D] dark:text-white/50 hover:text-[#121317] dark:hover:text-white transition-colors">Terms</NuxtLink>
              <NuxtLink to="/support" class="text-[#45474D] dark:text-white/50 hover:text-[#121317] dark:hover:text-white transition-colors">Support</NuxtLink>
            </div>
          </div>
        </div>
        <div class="overflow-hidden mb-10">
          <div class="text-[clamp(80px,18vw,220px)] font-[450] text-[#121317] dark:text-white leading-[0.9] tracking-[-0.04em] select-none">XeroFlow</div>
        </div>
        <div class="pt-6 border-t border-black/[0.06] dark:border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div class="flex items-center gap-2.5">
            <div class="w-5 h-5 bg-[#121317] dark:bg-white rounded flex items-center justify-center">
              <span class="text-white dark:text-[#121317] text-[8px] font-semibold">XF</span>
            </div>
            <span class="text-[13px] text-[#45474D] dark:text-white/50">ADME Digital</span>
          </div>
          <div class="flex items-center gap-6 text-[13px] text-[#45474D]/60 dark:text-white/40">
            <NuxtLink to="/about" class="hover:text-[#45474D] dark:hover:text-white/60 transition-colors">About</NuxtLink>
            <NuxtLink to="/privacy" class="hover:text-[#45474D] dark:hover:text-white/60 transition-colors">Privacy</NuxtLink>
            <NuxtLink to="/terms" class="hover:text-[#45474D] dark:hover:text-white/60 transition-colors">Terms</NuxtLink>
            <span>&copy; {{ new Date().getFullYear() }}</span>
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false,
  public: true
})

const route = useRoute()
const slug = route.params.slug as string

interface FeatureDetail {
  title: string
  content: string
}

interface Feature {
  title: string
  slug: string
  icon: string
  category: string
  categoryIcon: string
  categoryIconBg: string
  categoryIconColor: string
  description: string
  details: FeatureDetail[]
}

const features: Record<string, Feature> = {
  // ─── Work Management ──────────────────────────────────────────
  'boards': {
    title: 'Boards',
    slug: 'boards',
    icon: 'i-lucide-kanban',
    category: 'Work Management',
    categoryIcon: 'i-lucide-kanban',
    categoryIconBg: 'bg-blue-50',
    categoryIconColor: 'text-blue-600',
    description: 'Monday-style boards with 20+ column types — status, people, date, numbers, formulas, and more. The foundation of every project in XeroFlow.',
    details: [
      {
        title: '20+ Column Types',
        content: 'Go far beyond simple text and status columns. XeroFlow boards support people pickers, date ranges, formulas, file attachments, dependency links, ratings, timelines, dropdown menus, checkboxes, country selectors, and more. Each column type has its own editor, filter logic, and sort behavior — so your boards match exactly how your team thinks about work.'
      },
      {
        title: 'Flexible Grouping',
        content: 'Organize tasks into collapsible groups that represent phases, departments, sprints, or any structure that fits your workflow. Groups can be color-coded, reordered by drag-and-drop, and collapsed to focus on what matters. Combined with subtasks, you get a full hierarchy without the rigidity of traditional project management tools.'
      },
      {
        title: 'Inline Editing',
        content: 'Every cell in your board is editable in place — click a status to change it, pick a person from a dropdown, or type directly into a text cell. No modals, no separate edit screens. Changes are saved instantly and broadcast to everyone viewing the board via real-time Server-Sent Events, so your whole team stays in sync.'
      },
      {
        title: 'Five Connected Views',
        content: 'Each board can be viewed as a table, Kanban, timeline, calendar, or gallery — all reading from the same underlying data. Switch views instantly without losing filters or group state. Your media buyers might prefer Kanban while your project managers live in timeline view, and both see the same tasks.'
      }
    ]
  },
  'kanban-view': {
    title: 'Kanban View',
    slug: 'kanban-view',
    icon: 'i-lucide-columns-3',
    category: 'Work Management',
    categoryIcon: 'i-lucide-kanban',
    categoryIconBg: 'bg-blue-50',
    categoryIconColor: 'text-blue-600',
    description: 'Drag-and-drop Kanban boards grouped by any status column with real-time updates. Visualize your workflow as cards flowing through stages.',
    details: [
      {
        title: 'Group by Any Status Column',
        content: 'Unlike rigid Kanban tools that only support a single workflow, XeroFlow lets you group cards by any status-type column on your board. Switch between grouping by approval status, production stage, priority level, or custom workflows. Each grouping creates a fresh Kanban layout while preserving all your card data and metadata.'
      },
      {
        title: 'Drag-and-Drop with Real-Time Sync',
        content: 'Move cards between columns with a simple drag gesture. The status column updates instantly and the change is broadcast to all connected teammates in real time via SSE. No page refresh needed — when your account manager moves a task to "Client Review," your designer sees it happen live on their screen.'
      },
      {
        title: 'Card Previews',
        content: 'Each Kanban card shows a configurable preview of key columns — assignee avatars, due dates, priority badges, and file thumbnails. Hover for a quick summary or click to open the full task panel. Cards with overdue dates are automatically highlighted, so nothing slips through the cracks during a busy production week.'
      },
      {
        title: 'Column Limits and Alerts',
        content: 'Set work-in-progress limits on any Kanban column to prevent bottlenecks. When a column exceeds its limit, it visually highlights so your team knows capacity has been reached. This helps agencies avoid the common trap of starting too many tasks without finishing existing ones, keeping throughput high and cycle times low.'
      }
    ]
  },
  'timeline-view': {
    title: 'Timeline View',
    slug: 'timeline-view',
    icon: 'i-lucide-gantt-chart',
    category: 'Work Management',
    categoryIcon: 'i-lucide-kanban',
    categoryIconBg: 'bg-blue-50',
    categoryIconColor: 'text-blue-600',
    description: 'Gantt-style timeline with date range bars, drag-to-reschedule, and dependency tracking. See your entire project schedule at a glance.',
    details: [
      {
        title: 'Visual Date Range Bars',
        content: 'Every task with a start and end date renders as a horizontal bar on the timeline. Bars are color-coded by status or group, and their length directly represents duration. Zoom between day, week, and month granularity to see individual task detail or a bird\'s-eye view of a multi-month campaign plan.'
      },
      {
        title: 'Drag to Reschedule',
        content: 'Grab any bar to move it forward or backward in time, or drag the edges to extend or shorten the duration. The underlying date columns update instantly and sync across all views. When a client pushes a launch date back by two weeks, you can reschedule the entire chain of dependent tasks in seconds rather than editing each one individually.'
      },
      {
        title: 'Dependency Tracking',
        content: 'Link tasks together with finish-to-start dependencies so your team understands the critical path. Dependencies are drawn as connector lines between bars. When a predecessor task slips, downstream tasks are visually flagged, giving project managers early warning about schedule risks before they cascade into missed deadlines.'
      },
      {
        title: 'Milestone Markers',
        content: 'Drop milestone markers on key dates — campaign launches, client presentations, media buy deadlines. Milestones appear as diamond indicators on the timeline and are visible in every zoom level. Use them to anchor your project schedule around the dates that matter most to your clients and stakeholders.'
      }
    ]
  },
  'calendar-view': {
    title: 'Calendar View',
    slug: 'calendar-view',
    icon: 'i-lucide-calendar',
    category: 'Work Management',
    categoryIcon: 'i-lucide-kanban',
    categoryIconBg: 'bg-blue-50',
    categoryIconColor: 'text-blue-600',
    description: 'Monthly calendar with task cards, drag-to-reschedule, and date-based filtering. Plan your team\'s capacity and deadlines visually.',
    details: [
      {
        title: 'Monthly Task Layout',
        content: 'Tasks appear as compact cards on their due dates, organized by day. Each card shows the task title, assignee avatar, and a color-coded status indicator. When multiple tasks land on the same day, they stack vertically with an overflow indicator so you can see at a glance which days are overloaded and which have capacity.'
      },
      {
        title: 'Drag-to-Reschedule',
        content: 'Drag any task card from one day to another to change its due date instantly. The underlying date column updates in real time across all views — your team\'s table view and Kanban board reflect the change immediately. This makes weekly capacity planning meetings fast and visual, with the whole team watching changes happen live.'
      },
      {
        title: 'Date-Based Filtering',
        content: 'Filter the calendar by assignee, status, client, or any column to focus on specific slices of work. See only your tasks, only overdue items, or only tasks for a specific client. Filters persist as you navigate between months, so you can scan ahead to see how workload is distributed across upcoming weeks.'
      },
      {
        title: 'Timezone-Aware Scheduling',
        content: 'Built on @internationalized/date for proper timezone handling. Tasks display in each user\'s local timezone, and date calculations account for daylight saving transitions. When your Sydney team and London team look at the same calendar, dates resolve correctly for both — critical for agencies managing global campaigns with hard launch dates.'
      }
    ]
  },
  'gallery-view': {
    title: 'Gallery View',
    slug: 'gallery-view',
    icon: 'i-lucide-layout-grid',
    category: 'Work Management',
    categoryIcon: 'i-lucide-kanban',
    categoryIconBg: 'bg-blue-50',
    categoryIconColor: 'text-blue-600',
    description: 'Visual grid of tasks with file previews — perfect for creative review workflows where you need to see the work, not just read about it.',
    details: [
      {
        title: 'File-First Layout',
        content: 'Gallery view prioritizes the visual — each task is rendered as a card with its primary file attachment displayed as a large thumbnail. Images, PDFs, and videos get visual previews. This is purpose-built for creative teams reviewing ad designs, social posts, brand assets, and client deliverables where the visual output is what matters.'
      },
      {
        title: 'Quick Approval Workflow',
        content: 'Each gallery card shows the current approval status and allows one-click status changes. Reviewers can scan through a grid of creative assets, approve the ones that look good, and flag the ones that need revisions — all without opening individual task panels. Combined with client portal access, this becomes a powerful external review tool.'
      },
      {
        title: 'Configurable Card Fields',
        content: 'Choose which columns appear below each gallery thumbnail. Display the assignee, due date, client name, platform tag, or any custom column. Configure different gallery layouts for different workflows — your social team might show platform and post date, while your design team shows file type and revision number.'
      },
      {
        title: 'Lightbox Preview',
        content: 'Click any gallery card to open a full-screen lightbox with the file at maximum resolution. Navigate between items with arrow keys. The lightbox includes file metadata, download options, and the ability to leave comments directly on the preview. Share the direct link with a client for quick ad-hoc reviews outside the portal.'
      }
    ]
  },
  'groups-subtasks': {
    title: 'Groups & Subtasks',
    slug: 'groups-subtasks',
    icon: 'i-lucide-list-tree',
    category: 'Work Management',
    categoryIcon: 'i-lucide-kanban',
    categoryIconBg: 'bg-blue-50',
    categoryIconColor: 'text-blue-600',
    description: 'Organize tasks into collapsible groups with nested subtasks for complex projects. Build hierarchies that match how your agency actually works.',
    details: [
      {
        title: 'Collapsible Groups',
        content: 'Create groups within a board to represent phases, departments, sprints, or any logical division of work. Groups are color-coded, reorderable, and collapsible — expand the ones you\'re working on and collapse the rest to reduce visual noise. Each group shows an aggregate summary (task count, completion percentage) even when collapsed.'
      },
      {
        title: 'Nested Subtasks',
        content: 'Break complex tasks into subtasks that inherit the parent board\'s column structure. Subtasks can have their own assignees, dates, statuses, and file attachments. The parent task shows a progress bar based on subtask completion, giving managers a roll-up view without needing to drill into every line item on a busy board.'
      },
      {
        title: 'Drag-and-Drop Reordering',
        content: 'Move tasks between groups or reorder them within a group using drag-and-drop. Subtasks can be promoted to top-level tasks or demoted back. The entire hierarchy is sortable, so you can organize work exactly how your team needs it — whether that\'s by priority, by client, by deadline, or by whoever screams the loudest.'
      },
      {
        title: 'Group-Level Actions',
        content: 'Apply bulk actions at the group level — change all statuses, reassign all tasks, duplicate the entire group, or archive it. When you spin up a new campaign, duplicate an existing group to get a pre-populated task list with all the standard deliverables, then customize from there. Templates on top of templates.'
      }
    ]
  },
  'templates': {
    title: 'Templates',
    slug: 'templates',
    icon: 'i-lucide-copy',
    category: 'Work Management',
    categoryIcon: 'i-lucide-kanban',
    categoryIconBg: 'bg-blue-50',
    categoryIconColor: 'text-blue-600',
    description: 'Save board configurations as templates. Spin up new projects in seconds with pre-built column structures, groups, and task lists.',
    details: [
      {
        title: 'Save Any Board as Template',
        content: 'Convert any existing board into a reusable template with one click. The template captures the full column configuration, groups, default values, and optionally the task items themselves. Your best-performing campaign setup becomes the starting point for every new campaign, ensuring consistency and reducing setup time from hours to seconds.'
      },
      {
        title: 'Template Library',
        content: 'Browse your agency\'s template library organized by category — client onboarding, social media campaigns, website builds, SEO audits, ad production. Each template includes a description and a preview of its structure. New team members can spin up properly configured boards without needing to learn the agency\'s conventions from scratch.'
      },
      {
        title: 'Customizable on Creation',
        content: 'When you create a board from a template, you can choose which elements to include — columns, groups, tasks, or just the structure. Override default values, rename groups, and adjust dates relative to a start date. The template is a starting point, not a rigid constraint, so every project can be tailored while still inheriting proven workflows.'
      },
      {
        title: 'Template Versioning',
        content: 'Update your templates as your processes improve. When you refine a workflow, save the updated version without affecting boards that were already created from the old version. This means your agency\'s operational playbook evolves over time, and new projects always get the latest and greatest setup.'
      }
    ]
  },
  'real-time-sse': {
    title: 'Real-Time SSE',
    slug: 'real-time-sse',
    icon: 'i-lucide-radio',
    category: 'Work Management',
    categoryIcon: 'i-lucide-kanban',
    categoryIconBg: 'bg-blue-50',
    categoryIconColor: 'text-blue-600',
    description: 'Live updates via Server-Sent Events — see changes from teammates instantly, with WebSocket upgrade and polling fallback for maximum reliability.',
    details: [
      {
        title: 'Instant Change Propagation',
        content: 'When anyone on your team edits a cell, creates a task, moves a Kanban card, or changes a status, the update appears on every other user\'s screen within milliseconds. No manual refresh required. This is essential for agencies where multiple people work on the same boards simultaneously — during production weeks, status meetings, or live campaign launches.'
      },
      {
        title: 'Multi-Layer Connection Strategy',
        content: 'XeroFlow uses a three-tier connection strategy: WebSocket (via Durable Objects) as the primary channel, SSE as the first fallback, and periodic polling as the last resort. The client automatically negotiates the best available connection and seamlessly switches between them without user intervention. Your real-time experience degrades gracefully rather than breaking entirely.'
      },
      {
        title: 'Online Presence Indicators',
        content: 'See which teammates are currently viewing the same board with live presence indicators. User avatars appear in the board header showing who is online. This helps your team coordinate in real time — you know whether to ping someone on chat or just wait for them to see the update, and you avoid conflicting edits on the same tasks.'
      },
      {
        title: 'Event-Driven Architecture',
        content: 'Under the hood, every board change emits a typed event that flows through Cloudflare Durable Objects. This same event system powers chat notifications, board-linked channels, automation triggers, and the activity feed. A single status change can simultaneously update the board, post to a chat channel, send an email notification, and log to the audit trail.'
      }
    ]
  },
  'table-view': {
    title: 'Table View',
    slug: 'table-view',
    icon: 'i-lucide-table',
    category: 'Work Management',
    categoryIcon: 'i-lucide-kanban',
    categoryIconBg: 'bg-blue-50',
    categoryIconColor: 'text-blue-600',
    description: 'Spreadsheet-style table with sortable columns, inline editing, and bulk actions. The power-user view for agencies that think in rows and columns.',
    details: [
      {
        title: 'Spreadsheet-Style Editing',
        content: 'Table view renders your board as a dense, data-rich spreadsheet where every cell is inline-editable. Click any cell to modify it — statuses toggle, dates open pickers, people show assignment dropdowns. Tab between cells like a spreadsheet. For agencies processing high volumes of tasks, this is the fastest way to update data in bulk.'
      },
      {
        title: 'Multi-Column Sorting and Filtering',
        content: 'Sort by any column in ascending or descending order, or apply multi-column sorts (e.g., sort by client first, then by due date within each client). Combine with column filters to create precise views — show only tasks assigned to you, due this week, with a status of "In Progress." Save these filter combinations as named views for quick access.'
      },
      {
        title: 'Bulk Actions',
        content: 'Select multiple rows with checkboxes and apply actions in bulk — change status, reassign, move to a different group, duplicate, or archive. When a client puts a project on hold, select all their tasks and set them to "Paused" in one action instead of editing each one. Bulk actions respect permissions and log to the audit trail.'
      },
      {
        title: 'Column Resizing and Pinning',
        content: 'Drag column borders to resize, and pin important columns to the left so they stay visible when you scroll horizontally. Hide columns you don\'t need for the current workflow. Table view adapts to however wide your board is — whether you\'re using 5 columns or 25 — and remembers your layout preferences per board.'
      }
    ]
  },

  // ─── Financial Operations ─────────────────────────────────────
  'xero-integration': {
    title: 'Xero Integration',
    slug: 'xero-integration',
    icon: 'i-lucide-link',
    category: 'Financial Operations',
    categoryIcon: 'i-lucide-calculator',
    categoryIconBg: 'bg-emerald-50',
    categoryIconColor: 'text-emerald-600',
    description: 'Two-way sync with Xero for invoices, expenses, contacts, and chart of accounts. Keep your project management and accounting in perfect alignment.',
    details: [
      {
        title: 'OAuth-Connected Sync',
        content: 'Connect your Xero organization with a secure OAuth 2.0 flow. Once linked, XeroFlow syncs contacts, invoices, expense claims, and chart of accounts bidirectionally. New clients created in XeroFlow automatically appear as contacts in Xero, and invoices generated through the EOM engine upload directly to your Xero ledger with correct line items, tax codes, and tracking categories.'
      },
      {
        title: 'Invoice Lifecycle Management',
        content: 'Track invoices from draft to paid without leaving XeroFlow. See payment status, due dates, overdue amounts, and aging reports alongside your project data. When a client\'s invoice is overdue, the information surfaces on their client card and in the AI anomaly detection system, so your account managers can follow up proactively instead of waiting for month-end surprises.'
      },
      {
        title: 'Expense Tracking',
        content: 'Sync expense claims and bills from Xero to track costs against projects and clients. XeroFlow maps expenses to the right client and project using tracking categories, giving you a real-time view of profitability that combines revenue (invoices) with costs (expenses and ad spend) in a single dashboard. No more reconciling spreadsheets across three systems.'
      },
      {
        title: 'Chart of Accounts Mapping',
        content: 'XeroFlow imports your Xero chart of accounts so that EOM-generated invoices use the correct revenue accounts, tax rates, and tracking categories. Configure mappings once and every future invoice follows your accounting structure automatically. Your finance team reviews clean, correctly categorized invoices in Xero rather than fixing manual entry errors.'
      }
    ]
  },
  'eom-engine': {
    title: 'EOM Engine',
    slug: 'eom-engine',
    icon: 'i-lucide-file-spreadsheet',
    category: 'Financial Operations',
    categoryIcon: 'i-lucide-calculator',
    categoryIconBg: 'bg-emerald-50',
    categoryIconColor: 'text-emerald-600',
    description: 'End-of-month invoice generation with configurable line items, tax calculations, and auto-upload to Xero. Turn month-end from a week-long ordeal into a one-click process.',
    details: [
      {
        title: 'Automated Invoice Generation',
        content: 'The EOM engine generates invoices for all active clients based on their retainer agreements, ad spend pass-throughs, and project fees. Configure recurring line items once — monthly retainer, management fees, platform costs — and the engine calculates amounts, applies tax rates, and creates draft invoices ready for review. What used to take your finance team an entire week now happens in minutes.'
      },
      {
        title: 'Ad Spend Pass-Through',
        content: 'Automatically pull actual Meta and Google Ads spend data into invoice line items. The engine calculates management fees as a percentage of spend, adds platform costs, and separates billable spend from agency fees. Each line item references the campaign and date range so clients can reconcile their invoices against their own ad platform dashboards.'
      },
      {
        title: 'Review and Approval Workflow',
        content: 'Generated invoices land in a review queue where your finance team can inspect line items, adjust amounts, add one-off charges, or apply credits before finalizing. Each invoice shows a side-by-side comparison with the previous month so anomalies are easy to spot. Once approved, invoices upload to Xero with a single click and link back to the XeroFlow record for audit purposes.'
      },
      {
        title: 'Archive and Export',
        content: 'Every EOM run is archived to Cloudflare R2 with full line-item detail, calculation breakdowns, and PDF copies. Download historical runs for audits, compare month-over-month trends, or export to CSV for custom analysis. The archive is immutable — once an EOM run is finalized, the record cannot be altered, providing a reliable audit trail for compliance.'
      }
    ]
  },
  'meta-ads-tracking': {
    title: 'Meta Ads Tracking',
    slug: 'meta-ads-tracking',
    icon: 'i-lucide-megaphone',
    category: 'Financial Operations',
    categoryIcon: 'i-lucide-calculator',
    categoryIconBg: 'bg-emerald-50',
    categoryIconColor: 'text-emerald-600',
    description: 'OAuth-connected Meta Ads spend syncing with daily breakdowns and campaign-level budgets. Know exactly what you are spending across every client account.',
    details: [
      {
        title: 'OAuth-Connected Accounts',
        content: 'Connect your Meta Business accounts through a secure OAuth flow. XeroFlow pulls ad account data, campaign structures, and spend metrics directly from the Meta Graph API. Multiple ad accounts can be mapped to the correct XeroFlow clients, so agencies managing dozens of client accounts see all their spend in one consolidated view without switching between Business Manager tabs.'
      },
      {
        title: 'Daily Spend Syncing',
        content: 'Ad spend data syncs daily with campaign-level granularity. See exactly how much was spent on each campaign, ad set, and ad — broken down by day. Historical data is retained so you can compare spend patterns over weeks and months. The sync runs automatically on a schedule, with manual refresh available when you need up-to-the-minute numbers before a client call.'
      },
      {
        title: 'Budget Monitoring and Alerts',
        content: 'Set monthly budgets per client or per campaign and get alerted when spend approaches defined thresholds. Warnings trigger at 80% and 90% of budget, with critical alerts at 100%. Budget data feeds directly into the AI anomaly detection system, which can identify unusual spend patterns — like a sudden spike from a misconfigured ad set — before they blow through the budget.'
      },
      {
        title: 'EOM Integration',
        content: 'Meta spend data flows directly into the EOM invoice engine. Actual spend becomes a line item on client invoices with exact amounts, date ranges, and campaign references. No more copying numbers from spreadsheets or trusting manual entry. The entire chain — from Meta platform to client invoice to Xero ledger — is automated and auditable.'
      }
    ]
  },
  'google-ads-tracking': {
    title: 'Google Ads Tracking',
    slug: 'google-ads-tracking',
    icon: 'i-lucide-bar-chart-3',
    category: 'Financial Operations',
    categoryIcon: 'i-lucide-calculator',
    categoryIconBg: 'bg-emerald-50',
    categoryIconColor: 'text-emerald-600',
    description: 'Google Ads performance data with spend tracking, budget alerts, and audit trails. Complete visibility into your Google advertising investment.',
    details: [
      {
        title: 'Google Ads API Integration',
        content: 'Connect your Google Ads manager accounts via OAuth. XeroFlow syncs campaign data, spend metrics, and performance indicators through the Google Ads REST API. Like Meta, multiple customer accounts map to XeroFlow clients, giving your media buying team a single source of truth for Google spend across every client in the agency.'
      },
      {
        title: 'Campaign-Level Breakdowns',
        content: 'View spend data at the campaign, ad group, and keyword level with daily granularity. Compare performance across campaigns to identify top performers and underperformers. The data is presented in the same format as Meta spend, so your team uses a consistent interface for both platforms rather than context-switching between different analytics tools.'
      },
      {
        title: 'Budget Management with Audit Trails',
        content: 'Set and track budgets with full audit trails. Every budget change is logged with who changed it, when, and the previous value. When a client questions why their Google spend exceeded the agreed amount, you have a timestamped record showing exactly when the budget was adjusted and by whom. Transparency builds client trust.'
      },
      {
        title: 'Cross-Platform Reporting',
        content: 'Combine Google and Meta spend data in unified dashboards. See total advertising investment per client across both platforms, broken down by month. The AI system analyzes cross-platform patterns — like whether shifting budget from Google to Meta improved overall ROAS — and surfaces actionable recommendations in your AI chat and anomaly reports.'
      }
    ]
  },
  'profit-loss': {
    title: 'Profit & Loss',
    slug: 'profit-loss',
    icon: 'i-lucide-trending-up',
    category: 'Financial Operations',
    categoryIcon: 'i-lucide-calculator',
    categoryIconBg: 'bg-emerald-50',
    categoryIconColor: 'text-emerald-600',
    description: 'Real-time P&L dashboards with revenue, expenses, and margin analysis per client. Understand exactly which clients are profitable and which are not.',
    details: [
      {
        title: 'Client-Level Profitability',
        content: 'See revenue, direct costs, ad spend, and margin for every client in a single dashboard. Revenue comes from Xero invoices, costs from expense claims, and ad spend from Meta and Google integrations. Each client shows a margin percentage so you can instantly identify which accounts are healthy and which are eroding profitability — before it is too late to course-correct.'
      },
      {
        title: 'Monthly Trend Analysis',
        content: 'Track P&L trends over time with month-over-month comparisons. Spot patterns like seasonal dips, growing costs, or declining margins. The dashboard highlights significant changes — a client whose margin dropped 15% this month versus last — so your leadership team can investigate and act. Data is sourced live from Xero so there is no stale reporting lag.'
      },
      {
        title: 'Expense Categorization',
        content: 'Expenses are categorized by type — platform costs, contractor fees, software subscriptions, production costs — using your Xero chart of accounts. Drill into any category to see individual transactions. This granularity helps you identify which expense categories are growing faster than revenue and where operational efficiencies can be gained.'
      },
      {
        title: 'Forecasting Inputs',
        content: 'P&L data feeds into the cashflow forecasting system, giving you forward-looking projections based on current revenue run rates, contracted retainers, and historical expense patterns. Combined with budget data from ad spend tracking, you get a realistic picture of your agency\'s financial trajectory — not just where you are today, but where you will be in three months.'
      }
    ]
  },
  'budget-management': {
    title: 'Budget Management',
    slug: 'budget-management',
    icon: 'i-lucide-wallet',
    category: 'Financial Operations',
    categoryIcon: 'i-lucide-calculator',
    categoryIconBg: 'bg-emerald-50',
    categoryIconColor: 'text-emerald-600',
    description: 'Set monthly budgets per client and campaign. Get alerts when spend approaches limits and maintain audit trails for every budget change.',
    details: [
      {
        title: 'Client and Campaign Budgets',
        content: 'Set monthly spending limits at the client level and optionally at the campaign level within each client. Budgets can be configured as hard caps or soft warnings. The system tracks actual spend against budget in real time, pulling from both Meta and Google data sources. At any point you can see the percentage consumed, remaining amount, and projected end-of-month total.'
      },
      {
        title: 'Threshold Alerts',
        content: 'Configure alert thresholds at any percentage — commonly 80%, 90%, and 100%. Alerts can trigger in-app notifications, email messages, or both. When a campaign hits 90% of its monthly budget on the 15th of the month, your media buyers get an immediate notification so they can adjust pacing before overspending occurs. The alert includes current spend, budget limit, and daily run rate.'
      },
      {
        title: 'Full Audit Trail',
        content: 'Every budget creation, modification, and deletion is logged with the user who made the change, the timestamp, and the before/after values. When questions arise about budget decisions — from clients, from management, or during annual reviews — you have a complete, tamper-proof history. This audit trail integrates with the AI system for anomaly detection on budget patterns.'
      },
      {
        title: 'Variance Reporting',
        content: 'Monthly variance reports compare budgeted amounts against actual spend, showing over/under for each client and campaign. Identify clients where you consistently underspend (potential upsell opportunity) or overspend (process or pacing issue). Variance data surfaces in AI reports with recommendations, helping your team turn financial data into actionable strategy adjustments.'
      }
    ]
  },

  // ─── Communication ────────────────────────────────────────────
  'real-time-chat': {
    title: 'Real-Time Chat',
    slug: 'real-time-chat',
    icon: 'i-lucide-message-circle',
    category: 'Communication',
    categoryIcon: 'i-lucide-message-circle',
    categoryIconBg: 'bg-violet-50',
    categoryIconColor: 'text-violet-600',
    description: 'Channels, DMs, group messages, threads, and file sharing — built on Cloudflare Durable Objects for true real-time communication within your agency.',
    details: [
      {
        title: 'Channels and Direct Messages',
        content: 'Create public channels for teams (#design, #media-buying, #finance), private channels for sensitive discussions, and direct messages for 1-on-1 conversations. Group DMs support ad-hoc conversations between any combination of team members. Channel discovery lets new team members browse and join relevant channels without needing an invitation for every one.'
      },
      {
        title: 'Threaded Conversations',
        content: 'Reply to any message in a thread to keep discussions organized. Threads prevent the main channel from becoming a wall of back-and-forth. Each thread shows a reply count and the most recent participants, so you can see activity at a glance without reading every message. Threads work in channels, DMs, and group messages — keeping context contained everywhere.'
      },
      {
        title: 'File Sharing and Previews',
        content: 'Drag and drop files directly into any conversation. Images, PDFs, and videos render inline previews. Files are stored in Cloudflare R2 and linked to the conversation context, so you can find them later through search. When your designer shares a mockup in #design, the creative director can review it without downloading, then pin it for the team to reference.'
      },
      {
        title: 'Durable Object Architecture',
        content: 'Chat is powered by Cloudflare Durable Objects — each channel is a persistent, stateful object at the edge. This means messages are delivered with near-zero latency regardless of where your team members are located. The architecture supports hibernatable WebSocket connections for efficient resource usage, and gracefully handles reconnection when network conditions change.'
      }
    ]
  },
  'board-linked-channels': {
    title: 'Board-Linked Channels',
    slug: 'board-linked-channels',
    icon: 'i-lucide-link-2',
    category: 'Communication',
    categoryIcon: 'i-lucide-message-circle',
    categoryIconBg: 'bg-violet-50',
    categoryIconColor: 'text-violet-600',
    description: 'Auto-created channels for boards and tasks. Board events post directly to chat, keeping your communication and project management seamlessly connected.',
    details: [
      {
        title: 'Automatic Channel Creation',
        content: 'When a board is created, XeroFlow can automatically create a linked chat channel for that board. Task-specific channels can also be auto-created when a task requires discussion. These channels are pre-populated with the board context — name, description, and a link back to the board — so conversations start with full context rather than requiring someone to explain what they are talking about.'
      },
      {
        title: 'Board Event Feed',
        content: 'Configure which board events post to the linked channel — status changes, new tasks, assignment changes, due date updates, or file uploads. Each event is formatted as a compact message with the relevant details and a direct link to the task. Your team sees project activity flow through chat without needing to watch the board, while the board remains the source of truth for task data.'
      },
      {
        title: 'Configurable Feed Settings',
        content: 'Not every event needs to post to chat. The BoardChatFeedSettings modal lets you fine-tune which event types generate messages. A high-activity production board might only post status changes and new tasks, while a client-facing board might post everything so account managers have a complete activity log in their chat channel.'
      },
      {
        title: 'Bidirectional Context',
        content: 'From the board, open the linked chat channel to see discussions about tasks. From chat, click any task reference to open the board panel. The task slideover includes a chat toggle that opens the relevant channel as an overlay. This bidirectional linking means context is never more than one click away, regardless of whether you started in chat or on the board.'
      }
    ]
  },
  'rich-messages': {
    title: 'Rich Messages',
    slug: 'rich-messages',
    icon: 'i-lucide-image',
    category: 'Communication',
    categoryIcon: 'i-lucide-message-circle',
    categoryIconBg: 'bg-violet-50',
    categoryIconColor: 'text-violet-600',
    description: 'File attachments, emoji reactions, message pinning, quoting, and forwarding. Everything your team needs for expressive, actionable communication.',
    details: [
      {
        title: 'File Attachments and Previews',
        content: 'Attach images, documents, videos, and any file type to messages. Images and PDFs render inline previews directly in the conversation. Files are stored in Cloudflare R2 with CDN delivery for fast access worldwide. Your team can share creative assets, client briefs, or reference documents without leaving the conversation or switching to a separate file sharing tool.'
      },
      {
        title: 'Emoji Reactions',
        content: 'React to any message with emoji to quickly acknowledge, approve, or express feedback without cluttering the conversation with reply messages. Common reactions include thumbs-up for approval, eyes for "I have seen this," and checkmark for "done." Reaction counts are visible on the message, and you can see who reacted by hovering — useful for gauging team sentiment on a proposal.'
      },
      {
        title: 'Message Pinning and Quoting',
        content: 'Pin important messages to the top of any channel so they are easy to find. Pinned items might include project briefs, meeting notes, shared links, or key decisions. Quote any message when replying to preserve context — the original message appears as an embedded block above your response, making it clear exactly what you are responding to in a busy channel.'
      },
      {
        title: 'Formatting and Forwarding',
        content: 'Use a formatting toolbar for bold, italic, code blocks, and inline code. Keyboard shortcuts (Cmd+B, Cmd+I) work for quick formatting. Forward any message to another channel or DM to share relevant information across teams. Forwarded messages include the original sender, timestamp, and channel context so the recipient has full attribution and origin.'
      }
    ]
  },
  'read-receipts': {
    title: 'Read Receipts',
    slug: 'read-receipts',
    icon: 'i-lucide-check-check',
    category: 'Communication',
    categoryIcon: 'i-lucide-message-circle',
    categoryIconBg: 'bg-violet-50',
    categoryIconColor: 'text-violet-600',
    description: 'See who has read your messages with avatar indicators and reader lists. Never wonder again whether your team saw an important update.',
    details: [
      {
        title: 'Avatar Indicators',
        content: 'Below each message, small avatar circles show which team members have read it. Avatars appear in real time as people view the message. This gives senders immediate visibility into whether their message has been seen — critical for time-sensitive communications like campaign launch approvals or urgent client requests that need acknowledgment.'
      },
      {
        title: 'Reader List Detail',
        content: 'Click the read receipt avatars to see a full list of readers with timestamps showing when each person viewed the message. This detailed view is useful for accountability — when you send an important announcement to a channel, you can verify exactly who has seen it and follow up individually with anyone who has not, rather than resending to the entire group.'
      },
      {
        title: 'Unread Indicators',
        content: 'Channels and DMs show unread message counts in the sidebar. Bold text indicates channels with new activity, and a blue dot marks the exact position of your last-read message within a conversation. Jump to the first unread message with a single click, even in channels with hundreds of recent messages — you never have to scroll to find where you left off.'
      },
      {
        title: 'Privacy Controls',
        content: 'Read receipts can be configured at the user level. Team members who prefer not to broadcast their read status can disable receipts for their account. When disabled, their avatars do not appear in read receipt lists, and their activity does not trigger read timestamp updates. This respects individual privacy preferences while maintaining the feature for those who find it useful.'
      }
    ]
  },
  'email-templates': {
    title: 'Email Templates',
    slug: 'email-templates',
    icon: 'i-lucide-mail',
    category: 'Communication',
    categoryIcon: 'i-lucide-message-circle',
    categoryIconBg: 'bg-violet-50',
    categoryIconColor: 'text-violet-600',
    description: 'Resend-powered email templates for notifications, invites, and client communications. Consistent, branded emails without the HTML headaches.',
    details: [
      {
        title: 'Template Editor',
        content: 'Create and manage email templates with a visual editor. Templates support dynamic variables — client name, task title, due date, assignee — that are populated automatically when the email is sent. Build templates for common communications: task assignment notifications, deadline reminders, client welcome emails, and delivery confirmations. Each template uses your agency branding for a professional appearance.'
      },
      {
        title: 'Resend Integration',
        content: 'Emails are sent through Resend for reliable delivery with tracking. Every email includes delivery status (sent, delivered, opened, bounced) so you know whether recipients actually received and engaged with your messages. Resend handles SPF, DKIM, and DMARC configuration for your domain, ensuring emails land in inboxes rather than spam folders.'
      },
      {
        title: 'Automation Triggers',
        content: 'Connect email templates to automation triggers so emails send automatically when conditions are met. When a task moves to "Client Review," automatically email the client with the deliverable and approval link. When a deadline is 48 hours away, send a reminder to the assignee. The automation system handles the logic; the template handles the presentation.'
      },
      {
        title: 'Inbound Email Processing',
        content: 'XeroFlow includes a Cloudflare Workers-based email processor that handles inbound emails. Clients can reply to notification emails and their responses are captured, parsed, and attached to the relevant task or conversation. This creates a seamless communication loop where clients can participate in your workflow through their email client without needing to log into any platform.'
      }
    ]
  },
  'automations': {
    title: 'Automations',
    slug: 'automations',
    icon: 'i-lucide-zap',
    category: 'Communication',
    categoryIcon: 'i-lucide-message-circle',
    categoryIconBg: 'bg-violet-50',
    categoryIconColor: 'text-violet-600',
    description: 'Trigger-action recipes that automate repetitive workflows. Auto-notify on status changes, assignments, and due dates — so your team focuses on work, not process.',
    details: [
      {
        title: 'Trigger-Action Architecture',
        content: 'Every automation is a simple recipe: when something happens (trigger), do something else (action). Triggers include status changes, date arrivals, task creation, assignment changes, and form submissions. Actions include sending emails, posting to chat, updating task fields, creating subtasks, and notifying team members. Combine these building blocks to automate any repetitive process.'
      },
      {
        title: 'Pre-Built Recipes',
        content: 'Start with common automation recipes: notify assignees when tasks are created, remind about upcoming deadlines, post to a channel when tasks move to a status, auto-assign tasks based on project type, or escalate overdue items to managers. Each recipe can be customized with conditions and filters — only trigger for specific boards, groups, or column values.'
      },
      {
        title: 'Conditional Logic',
        content: 'Add conditions to automations to control when they fire. A notification automation might only trigger for high-priority tasks, or only when the assignee is a specific person, or only for tasks in a particular group. Conditions can reference any column value on the board, giving you fine-grained control over automation behavior without creating separate recipes for every edge case.'
      },
      {
        title: 'Execution Logging',
        content: 'Every automation execution is logged with the trigger event, the conditions evaluated, and the action performed. Review the automation log to verify that your recipes are firing correctly and to troubleshoot unexpected behavior. The log shows successes and failures separately, so you can quickly identify broken automations — like an email template referencing a deleted column.'
      }
    ]
  },

  // ─── AI & Intelligence ────────────────────────────────────────
  'ai-chat': {
    title: 'AI Chat',
    slug: 'ai-chat',
    icon: 'i-lucide-bot',
    category: 'AI & Intelligence',
    categoryIcon: 'i-lucide-brain',
    categoryIconBg: 'bg-amber-50',
    categoryIconColor: 'text-amber-600',
    description: 'Groq-powered conversational AI with @entity mentions for clients, tasks, and projects. Ask questions about your agency data in natural language.',
    details: [
      {
        title: 'Natural Language Queries',
        content: 'Ask questions about your agency in plain English. "How much did we spend on Meta for Client X last month?" or "Which tasks are overdue this week?" The AI understands your agency context — clients, projects, tasks, financial data — and retrieves the relevant information using a composite scoring system that combines semantic similarity, recency, importance, and entity matching.'
      },
      {
        title: '@Entity Mentions',
        content: 'Type @ to mention specific clients, tasks, projects, or briefs in your AI conversation. Mentioned entities are pinned to the top of the AI context, ensuring the response is grounded in the exact data you are asking about. The autocomplete supports prefix-matching search across all entity types, so finding the right reference is fast even in agencies with hundreds of active projects.'
      },
      {
        title: 'Conversation Management',
        content: 'Conversations persist across sessions with full history. Pin important conversations (up to 25) to your sidebar for quick access to frequently referenced topics. Start new conversations for fresh context or continue existing ones to build on previous analysis. The AI maintains awareness of the conversation history, so follow-up questions work naturally.'
      },
      {
        title: 'Groq-Powered Performance',
        content: 'The AI chat uses Groq for inference, delivering responses with extremely low latency. Complex queries that involve multiple data lookups and analysis still return in seconds. The system uses edge-first intent classification (via Cloudflare Workers AI) to route queries efficiently, with Groq handling the conversational response generation for the best balance of speed and quality.'
      }
    ]
  },
  'anomaly-detection': {
    title: 'Anomaly Detection',
    slug: 'anomaly-detection',
    icon: 'i-lucide-alert-triangle',
    category: 'AI & Intelligence',
    categoryIcon: 'i-lucide-brain',
    categoryIconBg: 'bg-amber-50',
    categoryIconColor: 'text-amber-600',
    description: 'Eight specialized analyzers that proactively flag spend anomalies, deadline risks, and budget issues before they become problems.',
    details: [
      {
        title: 'Eight Specialized Analyzers',
        content: 'The proactive agent runs eight independent analyzers covering spend anomalies (unusual daily spend), budget pacing (projected overspend), deadline risks (tasks likely to miss due dates), workload imbalance (team members overloaded), client health (engagement and satisfaction signals), revenue patterns (declining or growing accounts), timesheet gaps (missing time entries), and operational efficiency (process bottlenecks).'
      },
      {
        title: 'Proactive Notifications',
        content: 'Anomalies are surfaced proactively through the Activity Hub and AI chat without requiring anyone to run a report or ask a question. When the spend analyzer detects that a campaign burned through 60% of its monthly budget in the first week, a notification appears immediately with the relevant context and suggested actions. This turns your team from reactive (discovering problems at month-end) to proactive.'
      },
      {
        title: 'Severity Scoring',
        content: 'Each anomaly is scored for severity based on financial impact, time sensitivity, and historical patterns. Critical anomalies (like a budget overspend in progress) trigger immediate alerts, while informational findings (like a minor workload imbalance) appear in summary reports. The scoring adapts over time as the system learns which types of anomalies your team acts on and which they dismiss.'
      },
      {
        title: 'Feedback Loop',
        content: 'Rate AI recommendations as helpful or unhelpful to train the system. Dismissed anomalies with feedback help calibrate future detection sensitivity. Over time, the anomaly detection becomes tuned to your agency\'s specific patterns and thresholds rather than generic defaults. This feedback also informs the LoRA adapter training pipeline for agency-specific model improvements.'
      }
    ]
  },
  'semantic-search': {
    title: 'Semantic Search',
    slug: 'semantic-search',
    icon: 'i-lucide-search',
    category: 'AI & Intelligence',
    categoryIcon: 'i-lucide-brain',
    categoryIconBg: 'bg-amber-50',
    categoryIconColor: 'text-amber-600',
    description: 'Vectorize-powered search across tasks, clients, briefs, and knowledge base entries. Find what you need by meaning, not just by keyword.',
    details: [
      {
        title: 'Meaning-Based Search',
        content: 'Traditional keyword search fails when you do not remember the exact terms used. Semantic search understands meaning — searching for "social media campaign performance" will find tasks about "Facebook ad results" or "Instagram engagement metrics" even if those exact words do not appear in your query. The search uses Cloudflare Vectorize with embedding-based similarity scoring.'
      },
      {
        title: 'Cross-Entity Search',
        content: 'Search across all entity types simultaneously — tasks, clients, briefs, projects, and knowledge base entries. Results are ranked by a composite score that combines semantic similarity with recency, importance, and entity type diversity. A single search might return a relevant brief, the associated task, and a knowledge base article, giving you complete context in one query.'
      },
      {
        title: 'Hybrid Search Strategy',
        content: 'The search system combines vector-based semantic search with traditional keyword ILIKE queries. Keyword results catch exact matches that semantic search might rank lower, while semantic results catch conceptual matches that keyword search misses entirely. The hybrid approach delivers better recall than either method alone, especially for agencies with diverse terminology across clients and departments.'
      },
      {
        title: 'Automatic Embedding Pipeline',
        content: 'Tasks, briefs, and clients are automatically embedded when created or updated. A queue-based pipeline processes embed jobs asynchronously using SHA-256 change detection to avoid redundant re-embedding. The Vectorize index is continuously updated so search results reflect the latest data. No manual indexing or maintenance required — the system keeps itself current.'
      }
    ]
  },
  'intent-classification': {
    title: 'Intent Classification',
    slug: 'intent-classification',
    icon: 'i-lucide-target',
    category: 'AI & Intelligence',
    categoryIcon: 'i-lucide-brain',
    categoryIconBg: 'bg-amber-50',
    categoryIconColor: 'text-amber-600',
    description: 'Edge-first intent classifier that routes queries to the right data sources automatically. The AI traffic controller that makes everything faster and smarter.',
    details: [
      {
        title: 'Edge-First Classification',
        content: 'The intent classifier runs on Cloudflare Workers AI at the edge, classifying user queries in single-digit milliseconds before the main AI model even starts processing. This pre-classification step determines which data sources to query — financial data for spend questions, task data for project questions, knowledge base for process questions — so the AI retrieval system fetches exactly the right context.'
      },
      {
        title: 'Intent Categories',
        content: 'The classifier recognizes multiple intent types: financial queries, project status, search requests, process questions, client information, time tracking queries, and general conversation. Each intent type has a tailored scoring profile that adjusts the weights for semantic similarity, recency, importance, and entity matching in the retrieval pipeline. A financial query prioritizes recency; a process query prioritizes semantic accuracy.'
      },
      {
        title: 'LoRA-First Classification',
        content: 'When a LoRA adapter trained on your agency\'s data is available, the classifier uses it as the primary classification model. Agency-specific language patterns, custom terminology, and domain jargon are understood natively rather than requiring generic model interpretation. The system falls back to the base model when no adapter is available, ensuring consistent functionality.'
      },
      {
        title: 'Continuous Improvement',
        content: 'Classification accuracy improves over time through the feedback loop. When users indicate that a response was not helpful, the system logs the original intent classification for review. Patterns of misclassification inform retraining priorities and LoRA adapter updates. The goal is a classifier that understands your agency\'s language as well as your team does.'
      }
    ]
  },
  'ai-reports': {
    title: 'AI Reports',
    slug: 'ai-reports',
    icon: 'i-lucide-file-text',
    category: 'AI & Intelligence',
    categoryIcon: 'i-lucide-brain',
    categoryIconBg: 'bg-amber-50',
    categoryIconColor: 'text-amber-600',
    description: 'Auto-generated reports with insights, trends, and recommendations. Turn raw data into actionable intelligence for your agency leadership.',
    details: [
      {
        title: 'Automated Report Generation',
        content: 'The AI generates reports on demand or on a schedule — weekly performance summaries, monthly client health reports, or ad-hoc analysis of specific topics. Reports combine data from multiple sources (boards, financial data, ad spend, time tracking) and present them with narrative explanations, not just raw numbers. Your leadership team gets insights without needing to build dashboards or run queries.'
      },
      {
        title: 'Trend Analysis',
        content: 'Reports include trend analysis that compares current metrics against historical baselines. Month-over-month revenue growth, week-over-week ad spend efficiency, rolling average task completion rates — the AI identifies whether your metrics are improving, declining, or stable and highlights the most significant changes. Trends that deviate from normal patterns are flagged for attention.'
      },
      {
        title: 'Actionable Recommendations',
        content: 'Every report includes specific, actionable recommendations based on the data. Not generic advice like "improve efficiency" but specific suggestions like "Client X\'s Google Ads CPA increased 34% this month — consider reviewing the keyword targeting for Campaign Y." Recommendations are prioritized by potential impact and include links to the relevant tasks, clients, or campaigns for immediate follow-up.'
      },
      {
        title: 'Export and Sharing',
        content: 'Reports can be exported as PDF, shared via chat channel, or emailed to stakeholders. The format is clean and professional — suitable for client presentations or board meetings. Scheduled reports are automatically delivered to configured channels or email addresses, so your Monday morning starts with fresh insights rather than a scramble to compile last week\'s numbers.'
      }
    ]
  },
  'lora-adapters': {
    title: 'LoRA Adapters',
    slug: 'lora-adapters',
    icon: 'i-lucide-cpu',
    category: 'AI & Intelligence',
    categoryIcon: 'i-lucide-brain',
    categoryIconBg: 'bg-amber-50',
    categoryIconColor: 'text-amber-600',
    description: 'Fine-tune AI models with your agency data. Custom LoRA adapters with traffic routing and A/B testing for continuously improving AI performance.',
    details: [
      {
        title: 'Training Data Pipeline',
        content: 'XeroFlow extracts training data from your agency\'s actual usage — chat conversations, intent classifications, knowledge base entries, and AI interaction patterns. Five extractors produce different dataset types: QA pairs, intent examples, RAG chunks, knowledge entries, and combined sets. Data is automatically anonymized to remove PII before being used for training. Datasets export as JSONL and archive to R2.'
      },
      {
        title: 'Adapter Management',
        content: 'Upload, activate, and retire LoRA adapters through the admin UI. Each adapter has metadata — training dataset, base model, creation date, and performance metrics. The system supports multiple active adapters simultaneously with weighted traffic routing, so you can gradually shift traffic from the base model to a new adapter as confidence in its performance grows.'
      },
      {
        title: 'A/B Testing with Traffic Routing',
        content: 'Route a percentage of AI requests to different adapters to compare performance. Start a new adapter at 10% traffic, monitor quality metrics, and gradually increase to 100% as results validate. If an adapter underperforms, roll back instantly by adjusting traffic weights. This approach eliminates the risk of deploying a poorly trained adapter to your entire team.'
      },
      {
        title: 'Performance Metrics',
        content: 'Track adapter performance with metrics collected from every AI interaction — response helpfulness ratings, intent classification accuracy, response latency, and user feedback scores. Compare adapter performance against the base model and against each other. The metrics dashboard shows trends over time so you can see whether your latest training run actually improved the model for your agency\'s specific use cases.'
      }
    ]
  },

  // ─── Client Portal ────────────────────────────────────────────
  'dedicated-login': {
    title: 'Dedicated Login',
    slug: 'dedicated-login',
    icon: 'i-lucide-lock',
    category: 'Client Portal',
    categoryIcon: 'i-lucide-briefcase',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Separate cookie-based auth system for clients. They get their own login experience, completely scoped to their data with granular permissions.',
    details: [
      {
        title: 'Separate Auth System',
        content: 'The client portal uses an entirely separate authentication system from the staff dashboard. Clients authenticate with email and password, receiving an httpOnly session cookie (client_session_token) that scopes all their API requests to their own client ID. There is zero chance of a client accidentally seeing another client\'s data — the scoping happens at the API layer, not just the UI layer.'
      },
      {
        title: 'Invitation-Based Onboarding',
        content: 'Invite clients to the portal by email. They receive a branded invitation with a link to set their password and complete their profile. The invitation specifies which permissions the client will have — invoice viewing, approval capabilities, comment access — so you control exactly what each client contact can see and do from the moment they first log in.'
      },
      {
        title: 'Granular Permissions',
        content: 'Each client user is assigned a set of permissions: canViewInvoices, canApproveWork, canAddComments, and more. Permissions are evaluated on every API request and used to conditionally render navigation items and page content. A client\'s marketing manager might have full access, while their CEO only sees invoices and high-level project status — same client account, different permission sets.'
      },
      {
        title: 'Branded Experience',
        content: 'The client portal uses a clean, dedicated layout separate from the agency dashboard. Clients see a focused sidebar with only the sections relevant to them — dashboard, projects, approvals, gallery, invoices, and notifications. No internal tools, no other client data, no agency operations. The experience is professional and purpose-built for external stakeholders.'
      }
    ]
  },
  'project-visibility': {
    title: 'Project Visibility',
    slug: 'project-visibility',
    icon: 'i-lucide-folder-open',
    category: 'Client Portal',
    categoryIcon: 'i-lucide-briefcase',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Clients see their projects, tasks, and progress without internal data leaks. Transparent project tracking that builds trust and reduces status update requests.',
    details: [
      {
        title: 'Scoped Project Views',
        content: 'Clients see only their own projects and tasks — automatically scoped by client ID at the API layer. Each project shows a progress overview, active tasks, upcoming deadlines, and recent activity. The information displayed is curated to show meaningful progress indicators rather than every internal detail, maintaining professionalism while providing real transparency.'
      },
      {
        title: 'Task Progress Tracking',
        content: 'Clients can drill into individual tasks to see status, assignee, due dates, and progress. Subtask completion rolls up into percentage bars so clients understand how complex deliverables are progressing. This self-service access to project status dramatically reduces the volume of "where is this?" emails and calls that consume your account managers\' time.'
      },
      {
        title: 'Activity Timeline',
        content: 'Each project includes a filtered activity timeline showing client-relevant updates — status changes, file uploads, deadline updates, and comments. Internal activities (reassignments between staff, internal notes, budget discussions) are filtered out. The timeline gives clients a chronological narrative of project progress without exposing your team\'s internal workflow.'
      },
      {
        title: 'Dashboard Overview',
        content: 'The client dashboard shows a consolidated view of all active projects, pending approvals, recent invoices, and new notifications. Clients get a single-page summary of their relationship with your agency — what is active, what needs their attention, and what has been delivered recently. This high-level view is often the only page clients need to visit for routine check-ins.'
      }
    ]
  },
  'approval-workflows': {
    title: 'Approval Workflows',
    slug: 'approval-workflows',
    icon: 'i-lucide-check-circle',
    category: 'Client Portal',
    categoryIcon: 'i-lucide-briefcase',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Upload deliverables for client review. Approve, revise, or comment — all tracked with full audit history and notification triggers.',
    details: [
      {
        title: 'Multi-Step Approval Process',
        content: 'Configure approval workflows with multiple review steps — internal review, client review, final sign-off. Each step can require specific approvers and optionally include automated notifications when the deliverable is ready for review. The workflow tracks which steps are complete, which are pending, and who needs to take action, providing clear accountability at every stage.'
      },
      {
        title: 'Client Review Interface',
        content: 'Clients see deliverables in a dedicated approval interface with the file preview, project context, and action buttons. They can approve with a single click, request revisions with a comment explaining what needs to change, or add general feedback. The interface is intentionally simple — clients should not need training to use it — while capturing all the information your team needs to act on their response.'
      },
      {
        title: 'Revision Tracking',
        content: 'When a client requests revisions, the system tracks the revision history — original version, client feedback, revised version, and final approval. Each revision cycle is timestamped and attributed so there is a complete record of what was requested, what was changed, and when it was approved. This history is invaluable for managing scope creep and clarifying expectations on future projects.'
      },
      {
        title: 'Automated Notifications',
        content: 'Both sides receive automated notifications at each step. When your team uploads a deliverable for review, the client gets an email with a direct link to the approval page. When the client approves or requests revisions, your team gets notified in chat and via email. The notification system ensures no approval sits waiting because someone did not know it was their turn to act.'
      }
    ]
  },
  'invoice-access': {
    title: 'Invoice Access',
    slug: 'invoice-access',
    icon: 'i-lucide-receipt',
    category: 'Client Portal',
    categoryIcon: 'i-lucide-briefcase',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Permission-gated invoice viewing so clients can check billing without sending emails. Self-service financial transparency for your client relationships.',
    details: [
      {
        title: 'Permission-Gated Access',
        content: 'Invoice viewing requires the canViewInvoices permission, which is set when inviting client users. Not all client contacts need to see financial information — your day-to-day marketing contact might only need project access, while the finance contact needs invoice access. Permissions are granular so you control exactly who sees billing data for each client account.'
      },
      {
        title: 'Invoice List and Detail Views',
        content: 'Clients see a list of all their invoices with status (draft, sent, paid, overdue), dates, and amounts. Click any invoice to see full line-item detail — service descriptions, quantities, rates, tax, and totals. The detail view matches what appears in Xero, so clients can reconcile against their own records without requesting copies from your finance team.'
      },
      {
        title: 'Payment Status Tracking',
        content: 'Invoice status syncs from Xero in real time. When a client pays an invoice, the status updates automatically. Clients can see their outstanding balance, overdue amounts, and payment history. This self-service access eliminates the back-and-forth emails about "has our payment been received?" and "which invoices are still outstanding?" that consume your accounts receivable team\'s time.'
      },
      {
        title: 'PDF Download',
        content: 'Clients can download PDF copies of any invoice directly from the portal. PDFs are generated from the Xero invoice data and formatted with your agency branding. For clients who need to submit invoices to their own internal finance systems, the download feature provides exactly what they need without requiring them to contact your team for a copy.'
      }
    ]
  },
  'creative-gallery': {
    title: 'Creative Gallery',
    slug: 'creative-gallery',
    icon: 'i-lucide-image',
    category: 'Client Portal',
    categoryIcon: 'i-lucide-briefcase',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Browse all delivered assets in a visual gallery with download and preview. A permanent library of everything your agency has created for each client.',
    details: [
      {
        title: 'Visual Asset Library',
        content: 'The creative gallery shows all files delivered to the client as a visual grid — images, PDFs, videos, and documents with thumbnail previews. Assets are organized by project and date, creating a permanent, searchable library of everything your agency has produced for the client. No more digging through email attachments or shared drives to find last quarter\'s ad creative.'
      },
      {
        title: 'Full-Resolution Preview',
        content: 'Click any asset to open it at full resolution in a lightbox viewer. Images display at native quality, PDFs render inline, and videos play directly in the browser. Navigate between assets with keyboard arrows. The preview includes file metadata — name, size, upload date, and associated project — so clients have full context for every asset.'
      },
      {
        title: 'Download and Share',
        content: 'Download individual assets or select multiple for bulk download as a zip file. Each download is logged so your team can see which assets clients are actively using. The gallery also supports direct sharing links — useful when a client\'s marketing coordinator needs to share a specific asset with their internal team or an external partner.'
      },
      {
        title: 'Organized by Project',
        content: 'Assets are automatically grouped by the project they belong to, with the most recent deliveries appearing first. Clients can filter by project, file type, or date range to find specific assets quickly. For long-running client relationships with hundreds of delivered assets, the organization and filtering make the gallery practical rather than overwhelming.'
      }
    ]
  },
  'notifications': {
    title: 'Notifications',
    slug: 'notifications',
    icon: 'i-lucide-bell',
    category: 'Client Portal',
    categoryIcon: 'i-lucide-briefcase',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Clients get notified when new deliverables, invoices, or updates are ready. Timely, relevant notifications that keep clients engaged without overwhelming them.',
    details: [
      {
        title: 'In-Portal Notifications',
        content: 'A notification center in the client portal shows all recent activity relevant to the client — new deliverables ready for review, invoice status changes, project updates, and approval requests. Notifications are marked as read when viewed and persist for historical reference. The notification badge in the sidebar shows unread count, so clients know at a glance whether something needs their attention.'
      },
      {
        title: 'Email Notifications',
        content: 'Critical updates are also delivered via email using Resend. New approval requests, invoice reminders, and important project milestones trigger email notifications with direct links to the relevant portal page. Email notifications are formatted with your agency branding and include just enough context for the client to decide whether to click through or acknowledge from their inbox.'
      },
      {
        title: 'Notification Preferences',
        content: 'Clients can configure which notifications they receive and through which channels. Some clients want email for everything; others prefer to check the portal at their own pace and only want email for urgent items like approval requests. Preferences are per-user, so different contacts within the same client account can have different notification settings based on their role and involvement.'
      },
      {
        title: 'Agency-Controlled Triggers',
        content: 'Your agency controls which events trigger client notifications. Configure whether clients are notified about status changes, file uploads, comment replies, or only explicit approval requests. This gives you editorial control over the client experience — you decide when clients hear about activity and what level of detail they see, keeping communication intentional rather than noisy.'
      }
    ]
  },

  // ─── Time & Capacity ──────────────────────────────────────────
  'time-tracking': {
    title: 'Time Tracking',
    slug: 'time-tracking',
    icon: 'i-lucide-clock',
    category: 'Time & Capacity',
    categoryIcon: 'i-lucide-timer',
    categoryIconBg: 'bg-indigo-50',
    categoryIconColor: 'text-indigo-600',
    description: 'Log time against projects and tasks with start/stop timers or manual entry. Accurate time data for billing, capacity planning, and profitability analysis.',
    details: [
      {
        title: 'Timer and Manual Entry',
        content: 'Start a timer when you begin working and stop it when you are done — the entry is created automatically with the exact duration. Prefer manual entry? Log time after the fact with a project, task, date, duration, and optional description. Both methods feed into the same system, so your team uses whichever approach fits their workflow. Timers persist across page navigations so you do not lose a running timer by switching tabs.'
      },
      {
        title: 'Project and Task Association',
        content: 'Every time entry is linked to a project, and optionally to a specific task within that project. The project selector cascades — pick a project first, then the task list filters to show only tasks in that project. This association is what powers task-level time reporting, project profitability analysis, and the comparison between estimated hours and actual hours spent.'
      },
      {
        title: 'Weekly Grid View',
        content: 'The weekly grid shows all your time entries laid out by day, with row totals and column totals giving you a clear picture of how your week is shaping up. Each row represents a project-task combination, and cells show the hours logged for each day. The grid is editable — click any cell to adjust the time. Daily and weekly totals update in real time as you enter data.'
      },
      {
        title: 'Integration with Board Tasks',
        content: 'Time entries surface directly on board tasks. The task slideover includes a Time tab showing total time logged, a progress bar (if an estimate was set), and the ability to start a timer or log time without leaving the board context. Project managers can see time spent alongside task status, helping them understand whether a task is on track from both a progress and an effort perspective.'
      }
    ]
  },
  'weekly-timesheets': {
    title: 'Weekly Timesheets',
    slug: 'weekly-timesheets',
    icon: 'i-lucide-calendar-days',
    category: 'Time & Capacity',
    categoryIcon: 'i-lucide-timer',
    categoryIconBg: 'bg-indigo-50',
    categoryIconColor: 'text-indigo-600',
    description: 'Weekly grid view with submit, approval, and rejection workflows. Structured time reporting that flows into billing and capacity planning.',
    details: [
      {
        title: 'Weekly Submit Workflow',
        content: 'At the end of each week, team members review their time entries in the weekly grid and submit them for approval. The submit action locks entries for that week — no further edits are possible until a manager returns them. A confirmation modal shows the total hours and a breakdown by project before submission, giving the team member a final check before committing their timesheet.'
      },
      {
        title: 'Status Tracking',
        content: 'Each weekly timesheet has a status: Draft (still being filled), Submitted (awaiting manager review), Approved (locked and ready for billing), or Rejected (returned with feedback). Status badges are visible in the timesheet UI so team members always know where their submission stands. The status flows through a clear lifecycle with no ambiguity about the current state.'
      },
      {
        title: 'Entry Locking',
        content: 'Submitted and approved time entries are locked and cannot be edited by the team member. This prevents accidental or intentional changes to time data that has already been reviewed or billed. If a correction is needed after submission, the manager must reject the timesheet with a reason, which returns it to Draft status and unlocks the entries for editing.'
      },
      {
        title: 'Rejection with Reason',
        content: 'When a manager rejects a timesheet, they must provide a reason — missing entries, incorrect project allocation, excessive hours on a task, or any other concern. The rejection reason appears as a banner on the team member\'s timesheet so they know exactly what needs to be corrected. This structured feedback loop replaces back-and-forth messages about timesheet issues.'
      }
    ]
  },
  'manager-approvals': {
    title: 'Manager Approvals',
    slug: 'manager-approvals',
    icon: 'i-lucide-shield-check',
    category: 'Time & Capacity',
    categoryIcon: 'i-lucide-timer',
    categoryIconBg: 'bg-indigo-50',
    categoryIconColor: 'text-indigo-600',
    description: 'Review and approve team timesheets with bulk approve, reject with reason, and locked entry enforcement. The manager\'s control center for time data quality.',
    details: [
      {
        title: 'Approval Dashboard',
        content: 'The manager approvals page shows all submitted timesheets in a filterable list with tabs for Pending, Approved, and Rejected. Each entry shows the team member, week, total hours, and a breakdown by project. Managers can scan the list quickly to identify timesheets that need attention, with pending items prominently displayed at the top. Filter by team member or week to focus on specific submissions.'
      },
      {
        title: 'Expandable Detail View',
        content: 'Click any timesheet to expand it and see the full daily breakdown — which projects and tasks the team member worked on, how many hours each day, and any descriptions provided. This detail view gives managers enough context to assess whether the time allocation makes sense without needing to cross-reference against the project boards or ask the team member for clarification.'
      },
      {
        title: 'Bulk Approve',
        content: 'Select multiple timesheets and approve them in a single action. For weeks where everything looks normal, bulk approve saves managers from clicking through each submission individually. The bulk action is available from the list view — select the checkboxes, click approve, and all selected timesheets are locked with an approved status. The approval is timestamped and attributed to the approving manager.'
      },
      {
        title: 'Reject with Structured Feedback',
        content: 'Rejecting a timesheet opens a modal where the manager provides a reason. The rejection reason is saved and displayed to the team member on their timesheet page as a prominent banner. Common rejection reasons include missing time entries, incorrect project allocation, and unreasonable hours. The structured feedback ensures corrections are clear and actionable, reducing the back-and-forth that unstructured feedback creates.'
      }
    ]
  },
  'task-level-logging': {
    title: 'Task-Level Logging',
    slug: 'task-level-logging',
    icon: 'i-lucide-list-checks',
    category: 'Time & Capacity',
    categoryIcon: 'i-lucide-timer',
    categoryIconBg: 'bg-indigo-50',
    categoryIconColor: 'text-indigo-600',
    description: 'Link time entries to specific tasks. See time spent per task with progress bars and compare actual effort against estimates.',
    details: [
      {
        title: 'Task-Linked Time Entries',
        content: 'Every time entry can be linked to a specific task within a project. The task selector in the time entry modal shows tasks from the selected project, and the association flows through to all reporting views. When you log 2 hours on "Design social media ads" under the "Q1 Campaign" project, that time appears on the task card, in the project summary, and in the weekly timesheet — all connected.'
      },
      {
        title: 'Progress Bars and Estimates',
        content: 'Set hour estimates on tasks and see progress bars that fill as time is logged. A task estimated at 8 hours with 6 hours logged shows a 75% progress bar. When time logged exceeds the estimate, the bar turns red as a visual warning. This comparison between estimated and actual effort helps project managers identify scope creep and improve future estimates based on real data.'
      },
      {
        title: 'Task Time Summary Panel',
        content: 'The task slideover includes a dedicated Time panel showing summary cards (total time, number of entries, average per entry), the progress bar against estimate, and a list of all time entries with inline logging. Team members can start a timer or log time directly from the task context without navigating to the time tracking page. Everything related to time for that task is in one place.'
      },
      {
        title: 'Utilization and Efficiency Analysis',
        content: 'Task-level time data enables utilization analysis — see which types of tasks consume the most effort, which clients require more hours than budgeted, and which team members are most efficient at specific work types. This data feeds into capacity planning, helping managers allocate work based on actual performance data rather than assumptions about how long things should take.'
      }
    ]
  },
}

const feature = computed(() => features[slug] || null)

useSeoMeta({
  title: `${feature.value?.title ?? 'Feature'} — XeroFlow`,
  description: feature.value?.description ?? 'Explore this XeroFlow feature.',
  ogTitle: `${feature.value?.title ?? 'Feature'} — XeroFlow`,
  ogDescription: feature.value?.description ?? 'Explore this XeroFlow feature.',
})
</script>
