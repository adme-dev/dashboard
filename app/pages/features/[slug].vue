<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e]">
    <MarketingNav active="features" />

    <!-- Feature Found -->
    <template v-if="feature">
      <!-- Hero with background -->
      <section class="relative bg-[#0a0b0e] pt-[52px]">
        <MarketingHeroBackground theme="feature-detail" />
        <div class="relative">
          <!-- Breadcrumb -->
          <div class="max-w-[1200px] mx-auto px-6 pt-8">
            <NuxtLink to="/features" class="inline-flex items-center gap-1.5 text-[14px] text-white/60 hover:text-white transition-colors">
              <UIcon name="i-lucide-arrow-left" class="w-3.5 h-3.5" />
              All Features
            </NuxtLink>
          </div>

          <!-- Hero -->
          <div class="max-w-[720px] mx-auto px-6 pt-16 pb-16 md:pt-24 md:pb-20">
            <div class="flex items-center gap-3 mb-6">
              <div class="w-10 h-10 rounded-xl flex items-center justify-center bg-white/[0.06]">
                <UIcon :name="feature.categoryIcon" class="w-5 h-5 text-white/80" />
              </div>
              <span class="text-[14px] text-white/60 font-medium">{{ feature.category }}</span>
            </div>
            <div class="flex items-start gap-5 mb-6">
              <div class="w-14 h-14 rounded-2xl bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                <UIcon :name="feature.icon" class="w-7 h-7 text-white" />
              </div>
              <h1 class="text-[clamp(32px,5vw,48px)] font-[450] text-white leading-[1.1] tracking-[-0.02em]">
                {{ feature.title }}
              </h1>
            </div>
            <p class="text-lg md:text-xl text-white/50 leading-relaxed">
              {{ feature.description }}
            </p>
          </div>
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
    <MarketingFooter />
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
  'voice-ai': {
    title: 'Voice AI',
    slug: 'voice-ai',
    icon: 'i-lucide-mic',
    category: 'AI & Intelligence',
    categoryIcon: 'i-lucide-brain',
    categoryIconBg: 'bg-amber-50',
    categoryIconColor: 'text-amber-600',
    description: 'Talk to your AI assistant with voice. Speech-to-text transcription and text-to-speech responses powered by Cloudflare Workers AI.',
    details: [
      {
        title: 'Voice Input with Live Feedback',
        content: 'Click the mic button and speak naturally. The recorder captures audio with echo cancellation, noise suppression, and automatic gain control. A live volume visualiser shows real-time audio levels while recording, and silence detection automatically stops the recording after 1.5 seconds of quiet — so you never have to remember to press stop.'
      },
      {
        title: 'Speech-to-Text Transcription',
        content: 'Your voice is transcribed using Cloudflare Workers AI at the edge. The transcribed text feeds into the same AI pipeline as typed messages — intent classification, entity context retrieval, and Groq-powered response generation all work identically. Voice messages appear as regular text in your conversation history, so you can reference them later.'
      },
      {
        title: 'Text-to-Speech Responses',
        content: 'AI responses are automatically read back to you using Workers AI text-to-speech. Markdown formatting is stripped before synthesis for natural-sounding audio. Click the volume button to stop playback at any time. If TTS is unavailable, the text response still appears — voice is additive, never blocking.'
      },
      {
        title: 'Zero Setup, Graceful Degradation',
        content: 'Voice AI requires no additional configuration or dependencies — it uses the same Workers AI binding as other AI features. In local development or when the AI binding is unavailable, the mic button simply does not appear. The feature degrades gracefully at every step: if transcription fails you get a helpful error; if TTS fails the text response still shows.'
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

  // ─── Creative & Ad Operations ──────────────────────────────────
  'bulk-ad-launch': {
    title: 'Bulk Ad Launch',
    slug: 'bulk-ad-launch',
    icon: 'i-lucide-rocket',
    category: 'Creative Production',
    categoryIcon: 'i-lucide-rocket',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Launch dozens of ads across platforms in minutes. Select creatives from Banner Studio, configure campaigns, and publish to Meta Ads — all from one page.',
    details: [
      {
        title: 'Cross-Project Creative Selection',
        content: 'Browse every published banner across all your Banner Studio projects in one unified picker. Creatives are grouped by project with thumbnails, format names, and dimensions visible at a glance. Use the search bar to filter by project name or ad format, then select individual banners or entire projects with a single click. The picker supports hundreds of published banners without performance issues, so even agencies running 50+ client accounts can see everything in one view.'
      },
      {
        title: 'Campaign & Ad Set Targeting',
        content: 'Connect your Meta Ads account via OAuth, then browse existing campaigns and ad sets directly inside XeroFlow. No need to switch to Ads Manager to find campaign IDs or create new ad sets. The wizard pulls your campaigns in real time, showing names and statuses. Select a campaign and ad set, and all creatives you launch will be placed there — matching your existing targeting, budget, and schedule settings without reconfiguration.'
      },
      {
        title: 'Multi-Creative Ad Copy',
        content: 'Write up to five primary text variations, five headlines, and five descriptions — Meta will automatically test combinations to find the best performers. Set a call-to-action button, link URL, and Facebook Page. Save your copy as a preset so you can reuse winning text across future launches. The copy section includes character counters and validation to ensure your ads meet platform requirements before you hit publish.'
      },
      {
        title: 'One-Click Bulk Publish',
        content: 'Hit the launch button and watch each creative upload to Meta in sequence — image upload, creative creation, and ad creation happen automatically for every selected banner. A real-time progress tracker shows the status of each creative as it moves through the pipeline. Ads are created in PAUSED status by default so you can review them in Ads Manager before spending. Failed uploads show error details so you can fix and retry without starting over.'
      }
    ]
  },

  'ad-platform-export': {
    title: 'Ad Platform Export',
    slug: 'ad-platform-export',
    icon: 'i-lucide-download',
    category: 'Creative Production',
    categoryIcon: 'i-lucide-rocket',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Export HTML5 banners for 14 ad platforms with automatic clickTag injection, file size validation, and compliant ZIP download — ready to upload to any ad server.',
    details: [
      {
        title: 'Platform-Aware ClickTag Injection',
        content: 'Each ad platform has its own click tracking mechanism. Google Ads uses var clickTag, The Trade Desk requires var clickTAG (uppercase TAG — case-sensitive), Xandr needs the AppNexus HTML5 library loaded before calling APPNEXUS.getClickTag(), and Yahoo DSP uses adkit.onReady() with adkit.clicktag(). XeroFlow injects the correct script for the selected platform, including any required external libraries in the head. No manual HTML editing needed.'
      },
      {
        title: 'Automatic Compliance Validation',
        content: 'Before download, your banner is validated against the platform\'s rules. File size is measured in bytes and compared against limits (150KB for Google Ads/AdSense/AdRoll, 200KB for most others). External scripts and stylesheets are flagged for platforms that block third-party calls. GSAP repeat:-1 and CSS infinite animations are detected for platforms that prohibit looping. Animation time limits (15s or 30s) trigger advisory warnings. Results display with clear error vs. warning severity.'
      },
      {
        title: 'One-Click ZIP Download',
        content: 'The export builds a complete HTML5 document with all variables substituted, CSS and JS inlined, the ad.size meta tag set, and the clickTag script injected. External resources are stripped for platforms that block them. Everything is compressed into a ZIP with index.html at the root — the standard format accepted by all ad servers. The filename includes your banner name, dimensions, and platform for easy identification.'
      },
      {
        title: '14 Supported Platforms',
        content: 'Export for Google Ads, Display & Video 360, Google Ad Manager, Campaign Manager 360, Google AdSense, Amazon DSP, The Trade Desk, Xandr (AppNexus), Sizmek, Flashtalking, AdRoll, Criteo, Yahoo DSP, or Generic IAB Standard. Each platform definition includes file size limits, animation constraints, external resource policies, looping rules, and required libraries — all maintained in a single specification file for easy updates.'
      }
    ]
  },

  // ─── Banner Studio ──────────────────────────────────────────────
  'banner-editor': {
    title: 'Visual Editor',
    slug: 'banner-editor',
    icon: 'i-lucide-pen-tool',
    category: 'Banner Studio',
    categoryIcon: 'i-lucide-palette',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'A full WYSIWYG artboard editor with layers, properties panel, drag-to-position, and multi-format support — purpose-built for HTML5 banner production.',
    details: [
      {
        title: 'Layer-Based Design',
        content: 'Build banners by stacking layers — text, images, buttons, rectangles, and background elements. Each layer has its own position, size, rotation, opacity, and animation properties. Reorder layers by drag-and-drop in the sidebar, lock layers to prevent accidental edits, and toggle visibility to focus on specific elements. The layer system mirrors what designers expect from tools like Figma or Photoshop, but outputs production-ready HTML5.'
      },
      {
        title: 'Multi-Format Artboards',
        content: 'Define multiple ad sizes in a single project — 300x250, 728x90, 160x600, 320x50, and any custom dimensions. Each format gets its own artboard with independent layer positioning, so you can fine-tune layouts per size while keeping shared assets and animations consistent. Add new formats at any time, and optionally use AI auto-resize to adapt layouts intelligently.'
      },
      {
        title: 'Properties Panel',
        content: 'Select any layer to reveal a context-sensitive properties panel on the right. Text layers show font family, size, weight, colour, line height, and letter spacing. Images show source URL, object fit, and border radius. All layers expose position (x, y), dimensions (width, height), rotation, opacity, and animation controls. Changes apply instantly on the artboard with no render delay.'
      },
      {
        title: 'Keyboard Shortcuts',
        content: 'Full keyboard shortcut support for professional workflows — arrow keys for pixel nudging, Shift+arrow for 10px jumps, Delete to remove layers, Cmd+D to duplicate, Cmd+Z/Shift+Cmd+Z for undo/redo, and bracket keys for layer reordering. Shortcuts are discoverable in the editor and match conventions from popular design tools so there is no learning curve.'
      }
    ]
  },
  'banner-animation': {
    title: 'Animation & Timeline',
    slug: 'banner-animation',
    icon: 'i-lucide-clapperboard',
    category: 'Banner Studio',
    categoryIcon: 'i-lucide-palette',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'GSAP-powered keyframe timeline with entry and exit animations, easing curves, and frame-accurate playback for rich HTML5 ad production.',
    details: [
      {
        title: 'Keyframe Timeline',
        content: 'A visual timeline at the bottom of the editor shows every layer as a row with diamond-shaped keyframe markers. Drag keyframes to adjust timing, click between them to add new property changes, and use the playhead to scrub through the animation in real time. Each keyframe can animate position, scale, rotation, opacity, colour, and more — all rendered by GSAP for buttery smooth playback.'
      },
      {
        title: 'Entry & Exit Animations',
        content: 'Choose from 9 entry presets (fade in, slide from left/right/top/bottom, scale up, bounce, blur in, rotate in) and 9 matching exit presets. Each preset is configurable — adjust duration, delay, and easing independently. Entry animations fire on timeline start, exit animations fire before the banner loops or ends. This makes building "intro → hold → outro" sequences fast and intuitive.'
      },
      {
        title: 'Easing Library',
        content: 'Select from 30+ easing functions — linear, ease-in, ease-out, ease-in-out, plus GSAP-specific curves like back, elastic, bounce, and power curves (power1 through power4). Preview each curve visually before applying. The right easing choice transforms a mechanical-feeling animation into one that feels natural and polished, critical for ad creative that needs to catch attention in the first half-second.'
      },
      {
        title: 'PlayAll Modal',
        content: 'Preview all formats simultaneously in a single modal. Each artboard animates in sync so you can verify that your 300x250, 728x90, and 160x600 all look correct before exporting. Pause, rewind, and step frame-by-frame. This eliminates the tedious process of previewing each format individually and catching timing mismatches late in production.'
      }
    ]
  },
  'motion-paths': {
    title: 'Motion Paths',
    slug: 'motion-paths',
    icon: 'i-lucide-spline',
    category: 'Banner Studio',
    categoryIcon: 'i-lucide-palette',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'SVG-based motion path editor with draggable waypoints, curviness control, and auto-rotate — animate elements along custom curves.',
    details: [
      {
        title: 'Visual Waypoint Editor',
        content: 'Click on the artboard to place waypoints that define a curved path. Each waypoint appears as a draggable handle overlaid on the canvas, connected by a smooth SVG Catmull-Rom spline. Drag waypoints to reshape the curve in real time — the layer follows the path as you scrub the timeline, giving instant visual feedback on the motion trajectory.'
      },
      {
        title: 'Curviness & Auto-Rotate',
        content: 'Adjust the curviness parameter to control how tightly the path follows the waypoints — low values create angular paths, high values create sweeping arcs. Enable auto-rotate so the layer rotates to face the direction of travel, perfect for animating icons, arrows, or character illustrations that need to orient along the curve.'
      },
      {
        title: 'GSAP MotionPath Integration',
        content: 'Motion paths are powered by GSAP MotionPathPlugin, ensuring pixel-accurate rendering across all browsers. The path data is serialised into the banner HTML so animations work identically in the editor, in preview, and in the published ad tag. When a motion path is active, it replaces manual x/y keyframes — the timeline UI hides position tracks to avoid conflicts.'
      },
      {
        title: 'Export-Ready',
        content: 'Published banners include the MotionPathPlugin CDN script automatically. The SVG path data is embedded as a JSON attribute so the animation runs independently with no server dependency. The exported HTML is self-contained and works on all major ad platforms that support GSAP animations.'
      }
    ]
  },
  'banner-export': {
    title: 'Static & GIF Export',
    slug: 'banner-export',
    icon: 'i-lucide-image',
    category: 'Banner Studio',
    categoryIcon: 'i-lucide-palette',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Export banners to PNG or JPG at 1x/2x resolution via headless Chromium, or as animated GIFs with configurable frame rate.',
    details: [
      {
        title: 'Static Image Export',
        content: 'Generate pixel-perfect PNG or JPG screenshots of any banner format using Cloudflare Browser Rendering — a headless Chromium instance running at the edge. Choose 1x or 2x resolution for retina displays. JavaScript is disabled during capture for security, and the rendered HTML is identical to what appears in the editor. Images are uploaded to R2 for CDN delivery.'
      },
      {
        title: 'GIF Export',
        content: 'Capture animated banners as GIF files by rendering frame-by-frame with GSAP timeline seeking. Configure the frame rate between 5 and 15 FPS — lower for smaller files, higher for smoother animation. Each frame is captured as PNG, quantised to an optimised palette, and assembled into a GIF using gifenc. The export modal shows estimated frame count and file size before rendering begins.'
      },
      {
        title: 'File Size Meter',
        content: 'A real-time file size indicator appears in the editor toolbar and export modal, colour-coded green (<100KB), yellow (100-150KB), or red (>150KB). Asset sizes are tracked per-format so you can identify which images or fonts are pushing the banner over ad platform limits. This prevents the common workflow of building a beautiful banner only to discover at export time that it exceeds the 150KB Google Ads limit.'
      },
      {
        title: 'Per-Format Export',
        content: 'Export individual formats or all formats at once. Each format generates its own file with the correct dimensions and format-specific layer positioning. Batch export creates a ZIP containing one file per format, named with the project, dimensions, and format key for easy identification when uploading to ad servers.'
      }
    ]
  },
  'video-export': {
    title: 'Video Export',
    slug: 'video-export',
    icon: 'i-lucide-film',
    category: 'Banner Studio',
    categoryIcon: 'i-lucide-palette',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Export banner animations as MP4 video with frame-by-frame GSAP capture and ffmpeg encoding.',
    details: [
      {
        title: 'Frame-by-Frame Capture',
        content: 'The video export pipeline uses headless Chromium to render each frame individually. GSAP timeline.seek() positions the animation at precise timestamps, and a full-page screenshot captures the result. This approach guarantees frame-accurate output that matches exactly what you see in the editor preview — no dropped frames or timing drift.'
      },
      {
        title: 'ffmpeg Encoding',
        content: 'Captured frames are piped into ffmpeg for MP4 encoding with H.264 compression. The output is optimised for web delivery with a small file size and broad compatibility. Configurable frame rate and quality settings let you balance file size against visual fidelity depending on whether the video is for social media, email, or client presentation.'
      },
      {
        title: 'Social Media Ready',
        content: 'MP4 exports are formatted for direct upload to social platforms. The container format, codec, and pixel format are chosen for maximum compatibility with Meta, LinkedIn, Twitter, and YouTube upload requirements. This extends Banner Studio beyond traditional display ads into short-form video content for social campaigns.'
      },
      {
        title: 'R2 Storage',
        content: 'Exported videos are uploaded to Cloudflare R2 with a stable URL so they can be shared with clients or embedded in presentations. Each export includes metadata about the source project, format dimensions, duration, and frame rate for easy reference.'
      }
    ]
  },
  'ad-tags': {
    title: 'Ad Tags & Publishing',
    slug: 'ad-tags',
    icon: 'i-lucide-code',
    category: 'Banner Studio',
    categoryIcon: 'i-lucide-palette',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Publish banners with stable CDN URLs. Generate iframe, JavaScript, and AMPHTML embed tags with click-through wrapping and tracking pixels.',
    details: [
      {
        title: 'Stable CDN URLs',
        content: 'Published banners are hosted on Cloudflare R2 at a stable path that never changes — banner-hosted/{projectId}/{formatKey}/index.html. When you re-publish with updates, the URL stays the same so any live ad tags automatically serve the latest version. No need to swap URLs in your ad server when you make creative revisions.'
      },
      {
        title: 'Embed Tag Generation',
        content: 'Generate ready-to-paste embed code in three formats: iframe (simplest — works everywhere), JavaScript (loads async with a fallback image), and AMPHTML (for AMP pages and Google Ads). Each tag includes the correct dimensions, sandbox attributes, and loading strategy. Copy to clipboard with one click.'
      },
      {
        title: 'Click-Through & Tracking',
        content: 'Set a click-through URL per format. The published banner wraps all click events to route through your destination URL. Add impression and click tracking pixels — up to 5 of each — that fire alongside the primary click. Tracking URLs are validated (http/https only) to prevent injection attacks.'
      },
      {
        title: 'Version History',
        content: 'Each publish creates a version record with a timestamp, publishing user, and snapshot of the banner configuration. Roll back to any previous version if a live ad needs to revert. Up to 50 versions are stored per project, with the oldest auto-pruned to manage storage.'
      }
    ]
  },
  'brand-kits': {
    title: 'Brand Kits',
    slug: 'brand-kits',
    icon: 'i-lucide-swatch-book',
    category: 'Banner Studio',
    categoryIcon: 'i-lucide-palette',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Define brand colours, fonts, and logos. Apply across banner projects with one click and full undo support.',
    details: [
      {
        title: 'Brand Definition',
        content: 'Create brand kits with primary, secondary, and accent colours, plus typography settings for headings and body text. Upload logos and brand marks that can be applied to any banner project. Each brand kit lives at the organisation level so it is available across all projects and team members.'
      },
      {
        title: 'One-Click Apply',
        content: 'Select a brand kit and apply it to the current project. Colour tokens are mapped to layer properties — primary colour goes to headings and buttons, secondary to body text, accent to highlights. Font families are swapped across all text layers. The mapping is intelligent — it identifies which layers serve which purpose based on their names and properties.'
      },
      {
        title: 'Undo Support',
        content: 'Applying a brand kit captures the previous state of all affected layers. A single undo action reverts every change, restoring the exact colours, fonts, and styles that were in place before. This makes it safe to experiment with different brand kits without fear of losing your current design.'
      },
      {
        title: 'CRUD Management',
        content: 'Full create, read, update, and delete operations for brand kits via the Brand Kit Manager UI. Edit colours with a colour picker, swap fonts from the font library, and update logos by uploading new assets. Changes to a brand kit do not retroactively update projects that already applied it — each application is a snapshot, not a live link.'
      }
    ]
  },
  'template-marketplace': {
    title: 'Template Marketplace',
    slug: 'template-marketplace',
    icon: 'i-lucide-store',
    category: 'Banner Studio',
    categoryIcon: 'i-lucide-palette',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Save designs as reusable templates. Browse a categorised gallery with search, tags, and usage tracking.',
    details: [
      {
        title: 'Save from Project',
        content: 'Turn any banner project into a template with one click. The template captures all layers, animations, formats, and brand settings as a snapshot. Add a description, tags, and category to make it discoverable. Saving a template does not affect the original project — it creates an independent copy that can be instantiated into new projects.'
      },
      {
        title: 'Category Gallery',
        content: 'Browse templates in a visual gallery organised by category — social media ads, display banners, email headers, promotional, and more. Each template card shows a preview thumbnail, format count, and usage statistics. Filter by category, search by name or tag, and sort by newest or most used.'
      },
      {
        title: 'Usage Tracking',
        content: 'Every time a template is used to create a new project, the usage counter increments. This helps your team identify which templates are most popular and which might need updating. Template creators can see how widely their designs are being adopted across the organisation.'
      },
      {
        title: 'Custom HTML Templates',
        content: 'Beyond the visual editor templates, support for custom HTML templates lets developers create advanced banner layouts with custom code. Upload HTML files that integrate with the Banner Studio layer system, enabling effects and interactions that go beyond the standard editor capabilities.'
      }
    ]
  },
  'data-feeds-dco': {
    title: 'Data Feeds & DCO',
    slug: 'data-feeds-dco',
    icon: 'i-lucide-database',
    category: 'Banner Studio',
    categoryIcon: 'i-lucide-palette',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Upload CSV or JSON data feeds, bind columns to layer properties, and auto-generate per-row banner variants for dynamic creative at scale.',
    details: [
      {
        title: 'Feed Upload & Column Detection',
        content: 'Upload a CSV or JSON file and XeroFlow automatically detects column types — text, number, URL, and colour. The feed data is stored as JSON on R2 with a reference in the database. Column types determine which layer properties each column can bind to, preventing mismatches like binding a text column to a colour property.'
      },
      {
        title: 'Layer Property Bindings',
        content: 'Bind feed columns to layer properties with a visual picker. Text columns bind to text content, URL columns to image sources, colour columns to fill and background colours, number columns to font sizes. When a binding is set, the editor shows a feed icon on the bound layer. Bindings are per-layer and per-property, giving precise control over what is dynamic and what stays static.'
      },
      {
        title: 'Editor Preview Mode',
        content: 'Toggle feed preview mode to see your banner populated with actual feed data. Navigate between rows with arrow buttons to preview each variant. The preview updates instantly — every bound property swaps to the current row values. This lets designers verify that product names fit, images load correctly, and colours look right before generating variants.'
      },
      {
        title: 'DCO Variant Generation',
        content: 'Generate pre-baked HTML banners for every combination of feed row and ad format. Unlike runtime data feeds that require JavaScript, DCO variants embed the data directly into the HTML — making them compatible with any ad platform including those that block external scripts. Variants are hosted on R2 with stable URLs and can be exported as ad tags or ZIP files.'
      }
    ]
  },
  'design-precision': {
    title: 'Design Precision',
    slug: 'design-precision',
    icon: 'i-lucide-grid-3x3',
    category: 'Banner Studio',
    categoryIcon: 'i-lucide-palette',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Google Fonts library, custom font upload, pixel grid, snap-to-grid, smart guides, and six-direction layer alignment tools.',
    details: [
      {
        title: 'Google Fonts Library',
        content: 'Access 120+ curated Google Fonts directly in the editor. Fonts load on-demand via a link tag so only the fonts you actually use are included in the published banner. Search by name or browse by category (sans-serif, serif, display, monospace). Recent fonts are tracked so your favourites appear at the top. Published banners include the Google Fonts link tag so text renders correctly everywhere.'
      },
      {
        title: 'Custom Font Upload',
        content: 'Upload WOFF2, WOFF, TTF, or OTF font files for brands that use proprietary typefaces. Uploaded fonts are stored on R2 and injected into the editor and published HTML via @font-face rules. The font picker shows a Custom tab with all uploaded fonts alongside the Google Fonts library. URL validation prevents injection of malicious font sources.'
      },
      {
        title: 'Grid & Snap',
        content: 'Toggle a pixel grid overlay on the artboard with configurable size (8px, 10px, 16px, etc.). When snap-to-grid is enabled, layer positions and sizes round to the nearest grid increment during drag operations. This ensures precise alignment without manual coordinate entry — essential for banner production where pixel-level accuracy matters.'
      },
      {
        title: 'Smart Guides & Alignment',
        content: 'As you drag a layer, magenta guide lines appear when it aligns with artboard edges, artboard centre, or other layer edges. Smart guides snap at configurable thresholds so you get alignment assistance without fighting the cursor. Six-direction alignment buttons (left, centre, right, top, middle, bottom) align selected layers to the artboard. Distribute and match-size operations help create evenly spaced, consistently sized element groups.'
      }
    ]
  },
  'ai-creative-assistant': {
    title: 'AI Creative Assistant',
    slug: 'ai-creative-assistant',
    icon: 'i-lucide-sparkles',
    category: 'Banner Studio',
    categoryIcon: 'i-lucide-palette',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'AI text-to-image generation, layer editing & decomposition, copy suggestions, URL-to-banner, auto-resize, and image recommendations — built into the editor.',
    details: [
      {
        title: 'AI Text-to-Image Generation',
        content: 'Describe an image and AI generates it directly in the editor. Powered by Qwen-Image-2512, the generator supports five aspect ratios (1:1, 16:9, 9:16, 4:3, 3:4), adjustable guidance and inference steps, optional prompt enhancement, and reproducible seed control. Generated images upload to your asset library and drop onto the canvas with one click. Use the "Reuse Seed" button to create variations of a result you like.'
      },
      {
        title: 'AI Layer Editing',
        content: 'Right-click any image layer and select "Edit with AI" to open a prompt-based editor. Describe the change — "make the background blue," "remove the text," "add a sunset sky" — and the AI generates a modified version using Qwen-Image-Edit. Preview before and after side by side, adjust guidance scale and inference steps, lock a seed for reproducibility, then apply or try again. The original layer is preserved until you confirm.'
      },
      {
        title: 'AI Layer Decomposition',
        content: 'Break a flat image into individual editable layers with one click. The AI identifies distinct visual elements — foreground objects, backgrounds, text, logos — and extracts each as a transparent PNG layer on the canvas. Supports prompt-guided decomposition for targeted extraction, and exports PPTX and ZIP bundles of the decomposed layers for use outside the editor.'
      },
      {
        title: 'Merge Layers',
        content: 'Select multiple image layers with Shift+click in the timeline, then right-click to merge them into a single composited layer. The merge uses client-side canvas rendering that respects each layer\'s position, size, opacity, and rotation. The merged result uploads to your asset library as a new image, replacing the originals on the canvas. Useful for flattening complex compositions before export or further AI editing.'
      },
      {
        title: 'AI Copy Suggest',
        content: 'Select any text layer and click the AI icon to generate copy variations. The AI analyses the banner context — other text layers, brand name, and ad format — to suggest headlines, CTAs, and body copy that fit the available space. Powered by Workers AI with Groq fallback for fast response times. Suggestions appear in a popover and apply with one click.'
      },
      {
        title: 'URL-to-Banner',
        content: 'Paste a URL and XeroFlow scrapes the page to extract brand colours, images, headlines, and body copy. The AI then generates a complete banner layout with appropriate layers, typography, and composition. The result is a fully editable banner project — not a static screenshot — so you can tweak every element. Ideal for quickly mocking up ad concepts from a client landing page.'
      },
      {
        title: 'Smart Auto-Resize',
        content: 'When adding new ad formats to a project, AI auto-resize analyses the aspect ratio change and intelligently reflows layers. Wide-to-tall conversions stack elements vertically, tall-to-wide conversions arrange them horizontally. Text that does not fit is automatically trimmed by AI to preserve meaning while fitting the space. Toggle smart resize on or off per format.'
      },
      {
        title: 'Image Suggestions',
        content: 'The AI analyses text layers in your banner to suggest relevant image keywords and style directions. If your headline mentions "summer sale," suggestions include beach, sunshine, warm tones, and lifestyle imagery. Suggestions appear in the assets panel so you can search stock libraries or your uploaded assets with contextually relevant terms.'
      }
    ]
  },
  'banner-collaboration': {
    title: 'Real-Time Collaboration',
    slug: 'banner-collaboration',
    icon: 'i-lucide-users',
    category: 'Banner Studio',
    categoryIcon: 'i-lucide-palette',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Multi-user editing with live cursors, soft layer locking, presence indicators, and version history — powered by Durable Objects.',
    details: [
      {
        title: 'Live Cursors',
        content: 'See other editors\' cursors moving across the artboard in real time. Each collaborator gets a unique colour with their name displayed next to their cursor. Cursor positions are relayed via a Durable Object WebSocket at 12fps (83ms throttle) for smooth movement without excessive bandwidth. Stale cursors from disconnected users are cleaned up after 5 seconds.'
      },
      {
        title: 'Soft Layer Locking',
        content: 'When you select a layer, it is soft-locked to prevent conflicting edits. Other collaborators see a coloured dashed border around the locked layer with the editor\'s name badge. Attempting to select a locked layer shows a toast warning rather than blocking — the lock is advisory, not hard. This prevents frustrating edit conflicts while keeping the workflow flexible.'
      },
      {
        title: 'Live Layer Sync',
        content: 'Layer additions, removals, property changes, and reorderings are broadcast to all connected editors instantly. When your colleague adds a new text layer, it appears on your artboard within milliseconds. Echo prevention ensures you do not see your own changes reflected back. The sync protocol handles concurrent edits gracefully — last-write-wins with visual indicators of who changed what.'
      },
      {
        title: 'Presence & Version History',
        content: 'A presence bar shows stacked avatars of everyone currently editing the project, with an online count. Version history captures snapshots on save, with up to 50 versions per project and automatic pruning of the oldest. Roll back to any previous version if needed. Graceful degradation means the editor works perfectly in single-user mode when the Durable Object is unavailable.'
      }
    ]
  },

  // ─── Creative Production (additional) ───────────────────────────
  'ad-previews': {
    title: 'Ad Previews',
    slug: 'ad-previews',
    icon: 'i-lucide-monitor-smartphone',
    category: 'Creative Production',
    categoryIcon: 'i-lucide-rocket',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Preview banners in 8 platform mockups — see exactly how your ads will look on Meta Feed, Stories, Reels, LinkedIn, and more.',
    details: [
      {
        title: 'Platform Mockup Components',
        content: 'Eight built-in mockup components render your banner inside realistic platform frames — Meta Feed (mobile and desktop), Meta Stories, Meta Reels, Instagram Feed, LinkedIn Feed, Google Display Network, and a generic display mockup. Each frame replicates the actual platform UI around your ad — profile headers, like buttons, comment sections — so you see the full context.'
      },
      {
        title: 'Editor Integration',
        content: 'Open the Preview slideover directly from the editor toolbar. Your current banner renders live inside each mockup with real-time animation playback. Switch between platforms instantly to verify your design works across contexts. The preview uses the same HTML build pipeline as export, so what you see is exactly what gets published.'
      },
      {
        title: 'Standalone Preview Page',
        content: 'A dedicated /agency/ad-preview page lets you preview any published banner by URL. Share the preview link with clients or stakeholders who want to see how ads look in context without accessing the editor. The page loads the published banner from R2 and renders it inside the selected platform mockup.'
      },
      {
        title: 'Responsive Frames',
        content: 'Mockup frames adapt to the banner dimensions. A 300x250 medium rectangle renders in a feed context, while a 728x90 leaderboard shows in a desktop header context. Stories mockups enforce 9:16 aspect ratio framing. The system automatically selects the most appropriate mockup layout based on your banner dimensions.'
      }
    ]
  },
  'safe-zones': {
    title: 'Safe Zone Overlays',
    slug: 'safe-zones',
    icon: 'i-lucide-scan',
    category: 'Creative Production',
    categoryIcon: 'i-lucide-rocket',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Platform-specific safe zone guides for 11 ad platforms — ensure text and logos stay visible across placements.',
    details: [
      {
        title: '11 Platform Definitions',
        content: 'Safe zone definitions for Meta Feed, Meta Stories, Meta Reels, Instagram Feed, Google Display, YouTube, LinkedIn, Twitter/X, Snapchat, TikTok, and Pinterest. Each definition specifies the percentage-based safe area where text and logos will not be obscured by platform UI elements like profile headers, engagement buttons, or swipe-up indicators.'
      },
      {
        title: 'SVG Overlay',
        content: 'Safe zones render as a semi-transparent SVG overlay on the artboard at z-index 9992 — above all layers but below the UI controls. The danger zone is shaded while the safe area is clear, giving an instant visual indication of where to keep important content. Toggle the overlay on and off from the editor toolbar.'
      },
      {
        title: 'Active Zone Selection',
        content: 'Select the active safe zone from a dropdown in the toolbar. When designing for Meta Stories, select the Stories safe zone to see exactly where the profile header and CTA button will overlap your creative. Switch zones as you work across different placements to verify each one.'
      },
      {
        title: 'Design Confidence',
        content: 'Safe zones eliminate the guesswork of "will my headline be cut off on Stories?" or "does the logo overlap with the YouTube skip button?" By making platform constraints visible during design, you catch placement issues before export rather than discovering them after launch when budget has already been spent.'
      }
    ]
  },
  'meta-upload-wizard': {
    title: 'Meta Upload Wizard',
    slug: 'meta-upload-wizard',
    icon: 'i-lucide-upload',
    category: 'Creative Production',
    categoryIcon: 'i-lucide-rocket',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'A five-step slideover wizard to publish banner creatives directly to Meta Ads — account, campaign, ad set, creatives, and go live.',
    details: [
      {
        title: 'Account Selection',
        content: 'Connect your Meta Ads account via OAuth and select which ad account to publish to. The wizard shows all accessible accounts with names, IDs, and status. For agencies managing multiple client accounts, switch between them without re-authenticating. The OAuth scope includes ads_management for full read/write access.'
      },
      {
        title: 'Campaign & Ad Set Picker',
        content: 'Browse existing campaigns and ad sets within the selected account. Campaigns show name, status, objective, and daily budget. Ad sets show targeting summary and schedule. Select where your new ads will live in your existing campaign structure — no need to recreate targeting or budgets that are already configured in Ads Manager.'
      },
      {
        title: 'Creative Selection',
        content: 'Pick published banners from any Banner Studio project. Thumbnails show the banner preview with format dimensions. Multi-select to launch several creatives at once. The wizard validates that selected formats are compatible with the chosen placement — flagging mismatches before you attempt to upload.'
      },
      {
        title: 'Text & Publish',
        content: 'Enter primary text, headline, description, call-to-action, and destination URL. Save text presets for reuse across launches. Hit publish and watch the progress tracker as each creative uploads, creates an ad creative object, and creates an ad in PAUSED status. Review in Ads Manager before activating.'
      }
    ]
  },

  // ─── Analytics & Reporting ──────────────────────────────────────
  'cross-platform-dashboard': {
    title: 'Cross-Platform Dashboard',
    slug: 'cross-platform-dashboard',
    icon: 'i-lucide-layout-dashboard',
    category: 'Analytics & Reporting',
    categoryIcon: 'i-lucide-chart-area',
    categoryIconBg: 'bg-cyan-50',
    categoryIconColor: 'text-cyan-600',
    description: 'Aggregated ad performance across Meta, Google, and other platforms in a single unified dashboard.',
    details: [
      {
        title: 'Unified Metrics',
        content: 'See spend, impressions, clicks, CTR, CPC, conversions, and ROAS from every connected ad platform in one view. Metrics are normalised so you can compare Meta CPC against Google CPC without switching between platform dashboards. Date range selection applies globally, and all charts update simultaneously.'
      },
      {
        title: 'Multi-Platform Aggregation',
        content: 'Data from Meta Ads, Google Ads, and any other connected platforms is fetched, transformed, and merged on the server. Each platform has its own API client and data normalisation layer so metrics map consistently regardless of how each platform reports them. The dashboard handles API rate limits and partial data gracefully.'
      },
      {
        title: 'Client-Level Filtering',
        content: 'Filter the dashboard by client to see only their campaigns across all platforms. This gives account managers a single view of their client\'s entire paid media performance. Combine with date range filtering to prepare monthly reports or investigate specific time periods.'
      },
      {
        title: 'Campaign Drill-Down',
        content: 'Click any metric to drill down into campaign-level detail. See individual campaigns ranked by spend, ROAS, or any other metric. Deep links take you directly to the campaign in the original ad platform dashboard for further investigation or optimisation.'
      }
    ]
  },
  'hourly-breakdowns': {
    title: 'Hourly Breakdowns',
    slug: 'hourly-breakdowns',
    icon: 'i-lucide-clock-4',
    category: 'Analytics & Reporting',
    categoryIcon: 'i-lucide-chart-area',
    categoryIconBg: 'bg-cyan-50',
    categoryIconColor: 'text-cyan-600',
    description: 'Granular hourly performance data with spend, impressions, and conversion trends throughout the day.',
    details: [
      {
        title: 'Hourly Granularity',
        content: 'See how ad performance varies hour by hour. Identify peak conversion windows, spot wasteful overnight spend, and discover when your audience is most engaged. Daily totals hide these patterns — hourly data reveals them. Charts show spend, impressions, clicks, and conversions for each hour of the selected day.'
      },
      {
        title: 'Day-Part Analysis',
        content: 'Compare morning, afternoon, evening, and night performance automatically. The dashboard highlights which day-parts deliver the best ROAS and which are underperforming. This data directly informs ad scheduling decisions — shift budget to high-performing hours and pause during low-conversion periods.'
      },
      {
        title: 'Heatmap Visualisation',
        content: 'A heatmap view shows days of the week on one axis and hours on the other, with colour intensity representing performance. Patterns emerge quickly — maybe your client\'s audience converts heavily on Tuesday afternoons but barely at all on weekends. The heatmap makes these patterns visible at a glance.'
      },
      {
        title: 'Cross-Platform Timing',
        content: 'Compare hourly patterns across platforms to discover if your audience behaves differently on Meta versus Google. Maybe they browse social media in the morning but search Google in the afternoon. These insights drive platform-specific scheduling strategies that maximise budget efficiency.'
      }
    ]
  },
  'campaign-alerts': {
    title: 'Campaign Alerts',
    slug: 'campaign-alerts',
    icon: 'i-lucide-bell-ring',
    category: 'Analytics & Reporting',
    categoryIcon: 'i-lucide-chart-area',
    categoryIconBg: 'bg-cyan-50',
    categoryIconColor: 'text-cyan-600',
    description: 'Automated alerts for spend anomalies, pacing issues, and budget thresholds across all connected ad platforms.',
    details: [
      {
        title: 'Spend Anomaly Detection',
        content: 'The alerting engine compares current spend against historical averages and flags significant deviations. A campaign that suddenly spends 3x its daily average triggers an alert before it burns through the monthly budget. Sensitivity is configurable — set tighter thresholds for high-spend accounts and looser ones for experimental campaigns.'
      },
      {
        title: 'Budget Pacing',
        content: 'Track how campaigns are pacing against their monthly budget. Alerts fire when a campaign is projected to overspend or significantly underspend by month-end. Early warnings give media buyers time to adjust bids, budgets, or targeting before the situation becomes critical.'
      },
      {
        title: 'Performance Degradation',
        content: 'Alerts trigger when key metrics decline beyond thresholds — CTR drops below 1%, CPC rises above target, conversion rate falls significantly. Each alert includes the metric, current value, threshold, and trend direction so the media buyer has immediate context to investigate.'
      },
      {
        title: 'Dashboard Widget',
        content: 'Active alerts appear in a dashboard widget with severity indicators. Critical alerts (budget exceeded, account paused) surface at the top, while informational alerts (minor pacing deviation, slight CTR decline) sit below. Click any alert to jump to the relevant campaign detail for investigation.'
      }
    ]
  },
  'platform-comparison': {
    title: 'Platform Comparison',
    slug: 'platform-comparison',
    icon: 'i-lucide-git-compare',
    category: 'Analytics & Reporting',
    categoryIcon: 'i-lucide-chart-area',
    categoryIconBg: 'bg-cyan-50',
    categoryIconColor: 'text-cyan-600',
    description: 'Side-by-side platform performance with unified metrics, normalised for cross-channel analysis.',
    details: [
      {
        title: 'Normalised Metrics',
        content: 'Each ad platform reports metrics differently — Meta calls it "cost per result" while Google uses "cost per conversion." The comparison view normalises everything into consistent definitions so you can legitimately compare cost-per-acquisition across platforms. Attribution models are noted so you understand the comparison context.'
      },
      {
        title: 'Side-by-Side Charts',
        content: 'Dual-axis charts overlay performance from multiple platforms on the same timeline. See how a Google Ads spend increase correlates with Meta performance changes. Identify which platform is delivering better results for the same audience segment during the same time period.'
      },
      {
        title: 'Budget Allocation Insights',
        content: 'The comparison surface suggests optimal budget allocation based on historical performance data. If Meta consistently delivers 30% lower CPA than Google for a specific client, the dashboard highlights the opportunity to shift budget. These insights are data-driven recommendations, not automated changes.'
      },
      {
        title: 'Client Reporting',
        content: 'Export the comparison view as part of client reports. The unified format means clients see a clear story across platforms without needing to understand each platform\'s reporting quirks. AI-generated summaries provide natural-language explanations of cross-platform trends.'
      }
    ]
  },
  'on-demand-sync': {
    title: 'On-Demand Sync',
    slug: 'on-demand-sync',
    icon: 'i-lucide-refresh-cw',
    category: 'Analytics & Reporting',
    categoryIcon: 'i-lucide-chart-area',
    categoryIconBg: 'bg-cyan-50',
    categoryIconColor: 'text-cyan-600',
    description: 'Pull the latest data from ad platforms instantly — no waiting for scheduled syncs.',
    details: [
      {
        title: 'Instant Data Refresh',
        content: 'Click the sync button to pull the latest data from all connected ad platforms immediately. Scheduled syncs run periodically, but when you are in a client meeting or preparing a report, you want the numbers as of right now. On-demand sync queries the platform APIs in real time and updates the dashboard within seconds.'
      },
      {
        title: 'Per-Platform Control',
        content: 'Sync individual platforms independently. If you only need fresh Meta data, sync just Meta without waiting for Google to respond. Each platform shows its last sync timestamp so you know how fresh the data is. Failed syncs show error details with retry options.'
      },
      {
        title: 'Rate Limit Awareness',
        content: 'The sync engine respects platform API rate limits to avoid account throttling. If you have hit the limit recently, the sync button shows a cooldown indicator with the estimated time until the next sync is available. This prevents accidental rate limit violations that could temporarily block API access.'
      },
      {
        title: 'Incremental Updates',
        content: 'On-demand sync only fetches data that has changed since the last sync, minimising API calls and response time. For date ranges that have already been fully synced, cached data is used. Only the current day and any recently modified historical data are refreshed.'
      }
    ]
  },
  'export-reporting': {
    title: 'Export & Reporting',
    slug: 'export-reporting',
    icon: 'i-lucide-file-down',
    category: 'Analytics & Reporting',
    categoryIcon: 'i-lucide-chart-area',
    categoryIconBg: 'bg-cyan-50',
    categoryIconColor: 'text-cyan-600',
    description: 'Export analytics to CSV with date ranges, metric breakdowns, and AI-generated performance summaries.',
    details: [
      {
        title: 'CSV Export',
        content: 'Export any analytics view to CSV with all visible columns, filters, and date ranges preserved. The export includes raw metric values for spreadsheet analysis, along with calculated fields like CTR and ROAS. Column headers match the dashboard labels so the export is immediately understandable without a data dictionary.'
      },
      {
        title: 'Date Range Selection',
        content: 'Choose custom date ranges, or use presets like last 7 days, last 30 days, this month, last month, or quarter-to-date. Date ranges apply to all charts and tables simultaneously. Compare two date ranges side-by-side to show period-over-period performance changes.'
      },
      {
        title: 'AI Summaries',
        content: 'Each analytics view includes an AI-generated summary that highlights the most important trends in natural language. Instead of scanning 20 metrics to find the story, the summary tells you "Meta spend increased 15% week-over-week with a corresponding 8% improvement in ROAS, driven primarily by the retargeting campaign." The summaries are generated on-demand and can be included in exports.'
      },
      {
        title: 'Breakdown Dimensions',
        content: 'Break down performance by campaign, ad set, ad creative, placement, device, age, gender, and geography. Each breakdown adds a row dimension to the table and a series to the charts. Multiple breakdowns can be combined for detailed cross-tabulation analysis.'
      }
    ]
  },

  // ─── Communication (additional) ─────────────────────────────────
  'link-previews': {
    title: 'Link Previews',
    slug: 'link-previews',
    icon: 'i-lucide-external-link',
    category: 'Communication',
    categoryIcon: 'i-lucide-message-circle',
    categoryIconBg: 'bg-violet-50',
    categoryIconColor: 'text-violet-600',
    description: 'Automatic OG unfurl for shared URLs — rich preview cards with title, image, and description appear inline in chat.',
    details: [
      {
        title: 'Server-Side OG Unfurl',
        content: 'When a message contains a URL, the server fetches the page and extracts Open Graph metadata — title, description, image, and site name. The unfurl happens server-side so users do not need to click the link to see what it contains. Results are cached to avoid repeated fetches for the same URL.'
      },
      {
        title: 'Rich Preview Cards',
        content: 'Link previews render as cards below the message with the page title, description, thumbnail image, and domain name. Cards are styled to fit naturally within the chat interface without dominating the conversation. Click the card to open the link in a new tab.'
      },
      {
        title: 'Security',
        content: 'The unfurl service validates URLs to prevent SSRF attacks — localhost, private IP ranges, and non-HTTP protocols are blocked. Image URLs from the OG metadata are proxied rather than loaded directly to prevent tracking pixels from firing in the chat context.'
      },
      {
        title: 'Supported Sources',
        content: 'Link previews work with any publicly accessible URL that includes Open Graph or Twitter Card metadata. This covers most websites, blog posts, documentation pages, and social media profiles. Internal XeroFlow links (tasks, boards, projects) render with custom preview cards that show entity-specific details.'
      }
    ]
  },
  'message-forwarding': {
    title: 'Message Forwarding',
    slug: 'message-forwarding',
    icon: 'i-lucide-forward',
    category: 'Communication',
    categoryIcon: 'i-lucide-message-circle',
    categoryIconBg: 'bg-violet-50',
    categoryIconColor: 'text-violet-600',
    description: 'Forward messages to any channel or DM with full attribution and context preserved.',
    details: [
      {
        title: 'Forward to Any Channel',
        content: 'Right-click any message or use the forward action to send it to another channel or DM. A modal lets you search and select the destination. The forwarded message appears with clear attribution — showing the original sender, channel, and timestamp. Add an optional note to provide context for why you are sharing it.'
      },
      {
        title: 'Preserved Context',
        content: 'Forwarded messages retain their original formatting, attachments, and emoji reactions. File attachments are linked rather than re-uploaded so they do not consume additional storage. Thread context is noted so recipients know if the message was part of a longer conversation.'
      },
      {
        title: 'Multi-Channel Forwarding',
        content: 'Forward a single message to multiple destinations at once. Select several channels or DMs in the forward modal and the message is sent to all of them simultaneously. Each destination receives an independent copy so reactions and replies in one channel do not affect others.'
      },
      {
        title: 'API Endpoint',
        content: 'Message forwarding is backed by a dedicated API endpoint that handles permission checks, message duplication, and notification delivery. Only users with access to the source message can forward it, and forwarding respects channel membership — you cannot forward to a channel you are not a member of.'
      }
    ]
  },
  'activity-hub': {
    title: 'Activity Hub',
    slug: 'activity-hub',
    icon: 'i-lucide-activity',
    category: 'Communication',
    categoryIcon: 'i-lucide-message-circle',
    categoryIconBg: 'bg-violet-50',
    categoryIconColor: 'text-violet-600',
    description: 'A unified notification centre with live chat feed, For You tab, incoming items, and AI recommendations — accessible via keyboard shortcuts.',
    details: [
      {
        title: 'Live Feed Tab',
        content: 'The Feed tab shows a real-time stream of chat messages across all your channels. Messages arrive instantly via WebSocket — no polling or page refresh needed. Cursor-based pagination loads older messages as you scroll. Muted channels are filtered out so you only see conversations you care about. Click any message to jump directly to that channel.'
      },
      {
        title: 'For You Tab',
        content: 'The For You tab surfaces notifications personalised to your role and activity — task assignments, @mentions, approval requests, deadline reminders, and board events that affect your work. Notifications are grouped by time and priority so the most urgent items appear first.'
      },
      {
        title: 'Draggable Panel',
        content: 'The Activity Hub renders as a floating panel that can be dragged to any position on screen. Toggle between compact and expanded modes depending on how much screen real estate you want to dedicate. Position is persisted via localStorage so it stays where you put it across page navigations and sessions.'
      },
      {
        title: 'Keyboard Shortcuts',
        content: 'Press the period key (.) to toggle the Activity Hub open or closed. Press N to jump directly to the For You tab. These shortcuts work globally across all agency pages, making it fast to check notifications without reaching for the mouse. The hub replaces the old notification slideover and AI chat widget with a unified, more accessible interface.'
      }
    ]
  },

  'smart-watch': {
    title: 'Smart Watch & Notifications',
    slug: 'smart-watch',
    icon: 'i-lucide-bell-ring',
    category: 'Communication',
    categoryIcon: 'i-lucide-message-circle',
    categoryIconBg: 'bg-violet-50',
    categoryIconColor: 'text-violet-600',
    description: 'Granular subscription controls, AI-prioritised inbox, daily digest narrative, snooze, quiet hours, and semantic keyword watch — so the right team members hear about the right work without drowning in pings.',
    details: [
      {
        title: 'Watch any board, any item, any column',
        content: 'Subscribe at three scopes: an entire board, a single item, or a specific column (e.g. only when something enters Done). The Watch popover on every board header surfaces a subscriber stack with avatars, a snooze section, and quick options — All activity, Mentions only, Muted, or Custom… The Custom modal exposes five event categories (items, status moves, field edits, people, structure) plus a per-board email toggle. Item-level Watch lives on the task panel, and a "Watching" page at /agency/notifications/watching lists every subscription with bulk unwatch and a scope filter.'
      },
      {
        title: 'Reasons baked into every notification',
        content: 'Every notification carries a reason tag: Mentioned (red), Assigned (blue), Watching (grey), or system. The reason renders as a UBadge next to the title in your inbox so you can triage in one glance — no more "why am I getting this?" mystery. A small ? icon next to the badge opens an AI-generated one-line explanation specific to that notification, drawing on the actor, the change, and the board context.'
      },
      {
        title: 'AI-prioritised inbox',
        content: 'Every notification is scored 0..1 on importance using a fast rule-based heuristic at write time — mentions and assignments score highest, watching is moderate, with type-specific bumps for overdue tasks and approval requests. On inbox open, Workers AI re-classifies recent items via the llama-3.1-8b classifier and refines the scores in place. Toggle "Sort: Importance" in the inbox tab to surface the urgent stuff first; "Sort: Recent" preserves the historical newest-first behaviour.'
      },
      {
        title: 'Daily digest with AI narrative',
        content: 'A "Digest" tab in the notification slideover rolls up Today or Last 7 days into per-board summaries, with counts split by reason and the top 3 items by activity. Click any board to navigate, click any item to deep-link straight to its panel. Groq generates a one-sentence narrative for each board ("Sarah unblocked the homepage proof and Meta spend jumped 42% awaiting your sign-off") so you can skim what mattered without reading every entry.'
      },
      {
        title: 'Snooze and Quiet Hours',
        content: 'Snooze any board for 1h, 8h, end of day, tomorrow 8am, next workday (skipping weekends), or pick a custom date and time. While snoozed, the Watch button shows a moon icon with the remaining countdown and auto-uncovers when the window expires. At the user level, Quiet Hours suppresses browser push notifications during a configured time range and selected days — your inbox still receives everything, but the bell stops ringing. @mentions and assignments always come through regardless, since they are direct user-action.'
      },
      {
        title: 'Auto-watch & auto-acknowledge',
        content: 'When you create a task, comment on one, get assigned, or are @mentioned, you are automatically subscribed at the item level so you stay in the loop without thinking about it. Toggle off in /settings/notifications if you prefer manual. Auto-acknowledge is opt-in: when on, the moment someone assigns you a task, Groq drafts a contextual acknowledgement comment in your voice and posts it on your behalf, so the assigner knows you are alerted even before you open the app.'
      },
      {
        title: 'Semantic keyword subscriptions',
        content: 'Add keywords on the Watching page to track topics across every board you have access to. When new notification text contains a keyword (case-insensitive ILIKE), you get a "Keyword match" notification. Beyond exact matches, every keyword is embedded with Workers AI bge-base-en-v1.5 and stored in Vectorize, so semantically related text fires "Related to" notifications too — typing "invoicing" once will catch "billing", "payment processing", and "EOM submission" without you naming each.'
      },
      {
        title: 'Auto-watch suggestions',
        content: 'If you keep visiting a board you do not subscribe to (3+ visits in a 7-day window), a friendly toast surfaces with a one-click Watch button. Saves the awkward dance of "oh, I should have subscribed to this last week".'
      }
    ]
  },

  // ─── AI & Intelligence (additional) ─────────────────────────────
  'composite-scoring': {
    title: 'Composite Scoring',
    slug: 'composite-scoring',
    icon: 'i-lucide-blend',
    category: 'AI & Intelligence',
    categoryIcon: 'i-lucide-brain',
    categoryIconBg: 'bg-amber-50',
    categoryIconColor: 'text-amber-600',
    description: 'Five-signal retrieval formula that blends semantic similarity, recency, importance, intent match, and entity overlap for optimal AI context.',
    details: [
      {
        title: 'Five-Signal Formula',
        content: 'Every piece of context retrieved for the AI is scored using five signals: semantic similarity (Vectorize cosine distance), recency (exponential decay from last update), importance (type-weighted — spend data scores 0.85, board data 0.55), intent match (how well the item matches the classified intent), and entity overlap (shared clients, projects, or tasks with the query). The signals are combined using per-intent weighting profiles.'
      },
      {
        title: 'Per-Intent Scoring Profiles',
        content: 'Different query types weight the signals differently. Financial queries emphasise recency (0.30 weight, 7-day half-life) because spend data becomes stale quickly. Process queries emphasise semantic similarity (0.35 weight, 90-day half-life) because documentation stays relevant longer. Search queries emphasise entity overlap (0.35 weight) to surface exact matches. All profile weights sum to 1.0.'
      },
      {
        title: 'Diversity Penalty',
        content: 'To prevent the AI context from being dominated by a single type of information, a diversity penalty applies -0.08 per item beyond 3 of the same type. If the top results are all "spend" items, the fourth and fifth spend items get progressively penalised, letting other types (tasks, briefs, clients) surface. This produces more balanced and useful AI responses.'
      },
      {
        title: 'Semantic Reranking',
        content: 'Items sourced from the database are reranked by Vectorize cosine similarity to the user query. A single Vectorize query generates embeddings and attaches a semanticScore to each item. This hybrid approach — database retrieval plus vector reranking — delivers better results than either approach alone, with graceful degradation if Vectorize is unavailable.'
      }
    ]
  },
  'ai-training-pipeline': {
    title: 'AI Training Pipeline',
    slug: 'ai-training-pipeline',
    icon: 'i-lucide-graduation-cap',
    category: 'AI & Intelligence',
    categoryIcon: 'i-lucide-brain',
    categoryIconBg: 'bg-amber-50',
    categoryIconColor: 'text-amber-600',
    description: 'Extract training data from conversations, upload knowledge entries, manage datasets, and monitor training quality.',
    details: [
      {
        title: 'Five Extractors',
        content: 'Training data is extracted from real conversations using five specialised extractors: chat Q&A pairs, intent classification examples, RAG retrieval pairs, knowledge base entries, and combined multi-format output. Each extractor produces JSONL output with anonymisation applied — PII is stripped before any data enters the training pipeline.'
      },
      {
        title: 'Dataset Management',
        content: 'View, filter, and manage training datasets from the admin UI. Each dataset shows its source, extraction type, entry count, and creation date. Download datasets as JSONL for external use or delete datasets that are no longer needed. Statistics show the total volume of training data across all dataset types.'
      },
      {
        title: 'R2 Storage',
        content: 'Extracted training data is stored on Cloudflare R2 as JSONL files. Each dataset has a unique key and metadata record in the database. The R2 storage model keeps training data separate from the production database, making it easy to manage lifecycle, access control, and compliance requirements independently.'
      },
      {
        title: 'Queue Integration',
        content: 'Training data extraction runs as async jobs via the queue system. Submit an extraction job from the admin UI, and it processes in the background without blocking the main application. The training.extract job type handles scheduling, progress tracking, and error handling for large extraction operations.'
      }
    ]
  },
  'knowledge-base': {
    title: 'Knowledge Base',
    slug: 'knowledge-base',
    icon: 'i-lucide-book-open',
    category: 'AI & Intelligence',
    categoryIcon: 'i-lucide-brain',
    categoryIconBg: 'bg-amber-50',
    categoryIconColor: 'text-amber-600',
    description: 'Curate and approve knowledge entries that enhance AI responses with agency-specific context and domain expertise.',
    details: [
      {
        title: 'Knowledge Upload',
        content: 'Upload knowledge entries individually or in bulk via CSV/JSONL. Each entry has a title, content, category, and source reference. The upload process validates format and content length, then queues entries for Vectorize embedding so they become searchable by the AI system immediately.'
      },
      {
        title: 'Approval Workflow',
        content: 'Knowledge entries go through an approval workflow before they influence AI responses. New entries start as pending, reviewers can approve or reject with comments, and only approved entries are included in the AI context retrieval pipeline. This prevents inaccurate or outdated information from degrading AI quality.'
      },
      {
        title: 'Vectorize Deduplication',
        content: 'When new entries are uploaded, the system checks for semantic duplicates using Vectorize cosine similarity. Entries that are too similar to existing ones are flagged for review rather than auto-approved. This prevents the knowledge base from accumulating redundant information that wastes context window space.'
      },
      {
        title: 'CRUD API',
        content: 'Six API endpoints handle the full knowledge lifecycle — list with search and filters, create single entries, bulk create from file, read individual entries with full content, update entries and re-embed, and delete entries with Vectorize cleanup. The admin UI provides a searchable, filterable interface for managing hundreds of knowledge entries.'
      }
    ]
  },

  // ─── Briefs & Proposals ─────────────────────────────────────
  'brief-templates': {
    title: 'Brief Templates',
    slug: 'brief-templates',
    icon: 'i-lucide-file-plus',
    category: 'Briefs & Proposals',
    categoryIcon: 'i-lucide-file-text',
    categoryIconBg: 'bg-orange-50',
    categoryIconColor: 'text-orange-600',
    description: 'Build structured intake templates with 30+ field types — text, dropdown, file upload, date pickers, budgets, and more. Define required fields, set defaults, and organize sections with drag-and-drop.',
    details: [
      {
        title: '30+ Field Types',
        content: 'Go far beyond simple text fields. Brief templates support rich text, dropdowns, multi-select, file uploads, date pickers, number inputs, currency fields, URL inputs, email fields, checkboxes, radio groups, sliders, color pickers, and many more. Each field type has validation rules, placeholder text, and help descriptions that guide clients and team members through the brief creation process.'
      },
      {
        title: 'Drag-and-Drop Organization',
        content: 'Arrange fields in the exact order that makes sense for your workflow. Group related fields into collapsible sections — creative requirements, budget details, timeline, target audience. Reorder entire sections or individual fields with drag-and-drop. Templates stay organized even as you add dozens of fields across multiple categories.'
      },
      {
        title: 'Required vs Optional Fields',
        content: 'Mark fields as required to ensure you always capture critical information, or leave them optional for nice-to-have details. The brief submission form enforces required fields before allowing submission, preventing incomplete briefs from entering your workflow. Optional fields expand on hover to keep the form clean.'
      },
      {
        title: 'Template Library',
        content: 'Save templates for different brief types — campaign briefs, social content requests, video production briefs, website projects. Each template captures the unique information that workflow needs. Duplicate existing templates to create variations without starting from scratch. Templates are versioned so in-progress briefs continue using the version they started with.'
      }
    ]
  },
  'template-builder': {
    title: 'Template Builder',
    slug: 'template-builder',
    icon: 'i-lucide-blocks',
    category: 'Briefs & Proposals',
    categoryIcon: 'i-lucide-file-text',
    categoryIconBg: 'bg-orange-50',
    categoryIconColor: 'text-orange-600',
    description: 'Visual template editor with live preview, field configuration panels, section grouping, and default value management. Design professional intake forms without code.',
    details: [
      {
        title: 'Visual Field Editor',
        content: 'Each field has a configuration panel where you set the label, placeholder text, help description, validation rules, and default value. Preview how the field will look to brief creators in real time. Toggle between edit mode and preview mode to see the full template as your team and clients will experience it.'
      },
      {
        title: 'Section Grouping',
        content: 'Organize fields into logical sections with custom headers and descriptions. Sections can be collapsed by default to keep long templates scannable. Add section-level instructions that appear above the fields — perfect for explaining what information you need and why you need it for each part of the brief.'
      },
      {
        title: 'Field Validation Rules',
        content: 'Set minimum and maximum character counts for text fields, restrict file uploads to specific formats and sizes, define number ranges for budget fields, and require specific date ranges for timeline fields. Validation errors appear inline as users fill out the brief, catching issues before submission rather than during review.'
      },
      {
        title: 'Default Values & Prefills',
        content: 'Set sensible defaults for fields that commonly have the same value — default currency, standard deliverable sizes, typical timeline lengths. When team members or clients start a new brief from this template, defaults are pre-filled so they only need to change what is different from the norm.'
      }
    ]
  },
  'ai-brief-tools': {
    title: 'AI Brief Tools',
    slug: 'ai-brief-tools',
    icon: 'i-lucide-sparkles',
    category: 'Briefs & Proposals',
    categoryIcon: 'i-lucide-file-text',
    categoryIconBg: 'bg-orange-50',
    categoryIconColor: 'text-orange-600',
    description: 'AI-powered brief assistance — field suggestions as you type, completeness scoring, quality assessment, and full brief generation from minimal input.',
    details: [
      {
        title: 'Field Suggestions',
        content: 'As you fill out a brief, AI analyzes the context and suggests values for empty fields. Start typing a campaign objective and get suggested target audiences, recommended platforms, and estimated timelines. Suggestions appear as popover cards that you can accept, modify, or dismiss with a single click.'
      },
      {
        title: 'Brief Scoring',
        content: 'Every brief is scored on three dimensions: required field completion (40% weight), optional field completion (20% weight), and content quality (40% weight). Quality scoring evaluates field value length, specificity, and relevance. Scores update in real time as you edit, with a visual progress indicator showing what is needed to reach a strong brief.'
      },
      {
        title: 'AI Brief Generator',
        content: 'Provide a one-paragraph project description and AI generates a complete brief with all template fields populated. Review each field individually — accept the AI suggestion, edit it, or reject it and write your own. The generator uses your agency knowledge base and past briefs to produce contextually relevant content rather than generic placeholders.'
      },
      {
        title: 'Quality Assessment',
        content: 'AI reviews completed briefs for vague language, missing context, conflicting requirements, and unrealistic timelines. Issues are flagged with specific improvement suggestions. This catches problems that template validation cannot — like a brief that requests a TV campaign on a social media budget, or a launch date that falls on a public holiday.'
      }
    ]
  },
  'brief-to-quote': {
    title: 'Brief-to-Quote',
    slug: 'brief-to-quote',
    icon: 'i-lucide-receipt',
    category: 'Briefs & Proposals',
    categoryIcon: 'i-lucide-file-text',
    categoryIconBg: 'bg-orange-50',
    categoryIconColor: 'text-orange-600',
    description: 'Auto-generate quotes from approved briefs. Rate card matching, line item extraction, Xero push, status sync, and quote-to-invoice conversion.',
    details: [
      {
        title: 'Auto-Generation on Approval',
        content: 'When a brief is approved and its template has quoting enabled, a quote is automatically generated. The system extracts deliverables from brief field values and matches each to your rate card using fuzzy matching with a configurable similarity threshold. Line items are created with quantities, rates, and descriptions pulled directly from the brief.'
      },
      {
        title: 'Rate Card Matching',
        content: 'Deliverables from the brief are matched to your rate card entries using fuzzy string matching. The system finds the best match above a 40% similarity threshold, pulling in the correct pricing, account codes, and descriptions. When no match is found, line items are flagged for manual pricing so nothing falls through the cracks.'
      },
      {
        title: 'Xero Integration',
        content: 'Push quotes to Xero as DRAFT quotes with a single click. The system matches the client to their Xero contact, maps line items to chart of accounts codes, and creates the quote in Xero. Sync status back to see when clients view, accept, or decline the quote. All changes flow bidirectionally between XeroFlow and Xero.'
      },
      {
        title: 'Quote-to-Invoice Conversion',
        content: 'When a client accepts a Xero quote, convert it to a DRAFT invoice with one click. The invoice inherits all line items, pricing, and contact details from the quote. This completes the full cycle: brief submission, approval, quote, client acceptance, invoice — all tracked and auditable within XeroFlow.'
      }
    ]
  },
  'bulk-brief-operations': {
    title: 'Bulk Operations',
    slug: 'bulk-brief-operations',
    icon: 'i-lucide-layers',
    category: 'Briefs & Proposals',
    categoryIcon: 'i-lucide-file-text',
    categoryIconBg: 'bg-orange-50',
    categoryIconColor: 'text-orange-600',
    description: 'Multi-select briefs for bulk status changes, assignment, duplication, and export. Floating action bar appears when briefs are selected.',
    details: [
      {
        title: 'Multi-Select Interface',
        content: 'Checkbox selection on the briefs list allows you to select multiple briefs at once. Select all, select by filter criteria, or pick individual items. A floating action bar appears at the bottom of the screen showing the selection count and available bulk actions. Selection persists across page navigation so you can work with large sets.'
      },
      {
        title: 'Bulk Status Changes',
        content: 'Move multiple briefs through workflow stages in one action. Change 20 briefs from Draft to In Review, or archive a batch of completed briefs. Status changes trigger the same notifications and automations as individual changes, so your team stays informed without extra effort.'
      },
      {
        title: 'Bulk Assignment & Duplication',
        content: 'Reassign multiple briefs to a different team member during handoffs or team changes. Duplicate a set of briefs to create a new campaign batch with the same structure but fresh status tracking. Duplicated briefs preserve all field values and attachments while resetting workflow state.'
      },
      {
        title: 'Export & Analytics',
        content: 'Export selected briefs to CSV for reporting or external sharing. The export includes all field values, metadata, status history, and timeline data. Combined with the brief analytics dashboard, you can track cycle times, completion rates, and bottleneck patterns across your entire brief pipeline.'
      }
    ]
  },
  'brief-analytics': {
    title: 'Brief Analytics',
    slug: 'brief-analytics',
    icon: 'i-lucide-bar-chart-2',
    category: 'Briefs & Proposals',
    categoryIcon: 'i-lucide-file-text',
    categoryIconBg: 'bg-orange-50',
    categoryIconColor: 'text-orange-600',
    description: 'Cycle time funnels, completion rates, aggregate analytics, and template performance — understand how briefs flow through your agency.',
    details: [
      {
        title: 'Cycle Time Funnel',
        content: 'Visualize how long briefs spend in each workflow stage — from submission to review to approval to production. Identify bottlenecks where briefs stall and take action to speed up your pipeline. Filter by template, client, or team member to drill into specific workflow patterns.'
      },
      {
        title: 'Completion Rates',
        content: 'Track what percentage of briefs reach completion versus those that are abandoned, rejected, or stuck in review. Break down by template type to see which brief formats have the highest success rate. Low completion rates signal template complexity issues or unclear requirements.'
      },
      {
        title: 'Template Performance',
        content: 'Compare templates against each other — which ones produce the highest quality briefs, which have the fastest turnaround, and which generate the most revisions. Use these insights to refine your templates over time, removing friction from your best-performing workflows.'
      },
      {
        title: 'Aggregate Metrics',
        content: 'Dashboard widgets show total briefs in progress, average time to approval, briefs awaiting review, and briefs converted to quotes. Eight aggregate queries power the analytics dashboard, giving you a real-time pulse on your agency\'s brief pipeline across all clients and projects.'
      }
    ]
  },

  // ─── Administration ─────────────────────────────────────────
  'custom-roles': {
    title: 'Custom Roles',
    slug: 'custom-roles',
    icon: 'i-lucide-user-cog',
    category: 'Administration',
    categoryIcon: 'i-lucide-shield',
    categoryIconBg: 'bg-slate-50',
    categoryIconColor: 'text-slate-600',
    description: 'Create custom roles beyond the 15 built-in levels. Define granular permissions for each role to match your agency\'s unique organizational structure.',
    details: [
      {
        title: 'Beyond Built-In Roles',
        content: 'XeroFlow ships with 15 roles from owner to guest, but every agency is different. Create custom roles like \'Junior Media Buyer\' with ad spend visibility but no budget editing, or \'External Contractor\' with board access but no financial data. Custom roles inherit a base permission set that you can expand or restrict.'
      },
      {
        title: 'Granular Permission Matrix',
        content: 'Each role is defined by a matrix of 15+ permission areas — finance, creative, media buying, client management, admin, board access, chat, time tracking, and more. Toggle permissions on or off for each area. The permission matrix is visual, showing exactly what each role can and cannot do at a glance.'
      },
      {
        title: 'Server-Enforced Security',
        content: 'Permissions are not just a frontend concept. Every API endpoint checks the user\'s resolved permissions via server middleware. Even if someone manipulates the frontend, the server blocks unauthorized actions. Role resolution happens on every request, so permission changes take effect immediately without requiring users to log out.'
      },
      {
        title: 'Role Assignment',
        content: 'Assign roles from the admin user management panel. Change a user\'s role and their sidebar, available pages, and API access update instantly. Bulk role changes are supported for team restructuring. An audit trail tracks who changed what role and when, so you always know who authorized access changes.'
      }
    ]
  },
  'permission-system': {
    title: 'Permission System',
    slug: 'permission-system',
    icon: 'i-lucide-lock',
    category: 'Administration',
    categoryIcon: 'i-lucide-shield',
    categoryIconBg: 'bg-slate-50',
    categoryIconColor: 'text-slate-600',
    description: 'Fine-grained role-based access control with server-enforced middleware. 15+ permission areas cover every part of the platform.',
    details: [
      {
        title: 'RBAC Architecture',
        content: 'The permission system is built on role-based access control with permissions defined at both server and frontend levels. Server middleware blocks unauthorized mutations globally — viewers and guests cannot create, update, or delete any resources. Frontend middleware prevents navigation to unauthorized pages, and sidebar items are conditionally hidden based on permissions.'
      },
      {
        title: '15+ Permission Areas',
        content: 'Permissions cover finance (invoices, expenses, P&L), creative (banner studio, briefs), media (ad accounts, spend), client management (portal, contacts), admin (users, roles, settings), boards (create, edit, archive), chat (channels, DMs), time tracking (entries, approvals), AI (chat, training), and more. Each area can be independently granted or restricted per role.'
      },
      {
        title: 'Route Protection',
        content: '87 page files are protected by 7 route middleware files — role-admin, role-finance, role-creative, role-media, role-management, role-clients, and sales. Users who navigate to a page they cannot access are redirected to the dashboard. Direct URL access is blocked server-side, not just hidden in the UI.'
      },
      {
        title: 'Mutation Guards',
        content: 'Every POST, PUT, PATCH, and DELETE request passes through the RBAC middleware. External callers like Xero webhooks and Cloudflare Workers are exempt. Internal API routes are scoped correctly. The system enforces write access restrictions at the API layer, making permission bypass impossible regardless of how the request originates.'
      }
    ]
  },
  'admin-dashboard': {
    title: 'Admin Dashboard',
    slug: 'admin-dashboard',
    icon: 'i-lucide-settings',
    category: 'Administration',
    categoryIcon: 'i-lucide-shield',
    categoryIconBg: 'bg-slate-50',
    categoryIconColor: 'text-slate-600',
    description: 'Central admin panel with horizontal tab navigation — manage users, configure permissions, assign roles, and monitor access controls.',
    details: [
      {
        title: 'User Management',
        content: 'View all team members with their current roles, last login, and status. Search and filter by role, department, or activity. Invite new users, deactivate accounts, and change roles from a single interface. User cards show role badges and permission summaries so administrators can quickly audit who has access to what.'
      },
      {
        title: 'Role Configuration',
        content: 'The permissions tab displays the full role-permission matrix. See every built-in and custom role alongside their granted permissions. Create new custom roles, edit existing ones, and compare roles side by side. Changes are applied immediately and enforced on the next API request — no deployment or restart needed.'
      },
      {
        title: 'Horizontal Tab Navigation',
        content: 'The admin panel uses horizontal tabs within the agency layout — Users, Permissions, and Settings are all accessible without leaving the main navigation. This matches the platform\'s existing tab-based design patterns and keeps admin tasks integrated with the daily workflow rather than hidden in a separate settings area.'
      },
      {
        title: 'Audit & Compliance',
        content: 'Track role changes, permission modifications, and user access patterns. Know when a role was created, who assigned it, and what permissions were granted. This audit trail is essential for agencies handling client data, financial information, or regulated advertising — demonstrating who had access to what and when.'
      }
    ]
  },

  // ─── Financial Operations (additional) ──────────────────────
  'rate-cards': {
    title: 'Rate Cards',
    slug: 'rate-cards',
    icon: 'i-lucide-credit-card',
    category: 'Financial Operations',
    categoryIcon: 'i-lucide-calculator',
    categoryIconBg: 'bg-emerald-50',
    categoryIconColor: 'text-emerald-600',
    description: 'Define service pricing with rate cards. Fuzzy match to Xero chart of accounts, variance dashboards, and AI integration for pricing queries.',
    details: [
      {
        title: 'Service Pricing Database',
        content: 'Create rate card entries for every service your agency offers — hourly rates for strategy, fixed prices for deliverables, platform fees, production costs, and retainer components. Each entry includes a description, unit price, tax treatment, and mapping to your Xero chart of accounts. Rate cards serve as your single source of truth for pricing.'
      },
      {
        title: 'Xero Account Matching',
        content: 'Rate card entries are fuzzy-matched to your Xero chart of accounts so invoices generated from rate cards automatically use the correct revenue accounts. The variance dashboard highlights discrepancies between your rate card pricing and what is actually invoiced in Xero, catching pricing drift before it becomes a revenue issue.'
      },
      {
        title: 'Variance Dashboard',
        content: 'Compare rate card pricing against actual invoiced amounts across clients and time periods. See which services are consistently quoted at rates above or below the rate card. Identify clients with special pricing arrangements and track whether those arrangements are being applied correctly by your accounts team.'
      },
      {
        title: 'AI Pricing Integration',
        content: 'Ask the AI assistant pricing questions — \'What do we charge for social media management?\' or \'What is our hourly rate for video production?\' — and get instant answers from your rate card data. Rate card entries are embedded in the vector database so pricing information is part of the AI\'s knowledge base.'
      }
    ]
  },
  'quotes-proposals': {
    title: 'Quotes & Proposals',
    slug: 'quotes-proposals',
    icon: 'i-lucide-file-check',
    category: 'Financial Operations',
    categoryIcon: 'i-lucide-calculator',
    categoryIconBg: 'bg-emerald-50',
    categoryIconColor: 'text-emerald-600',
    description: 'Generate quotes from briefs with rate card pricing. Push to Xero, sync acceptance status, and convert accepted quotes directly into invoices.',
    details: [
      {
        title: 'Brief-Driven Quotes',
        content: 'Quotes are generated directly from approved briefs. The system extracts deliverables and quantities from brief field values, matches each to your rate card, and creates a structured quote with line items, totals, and tax calculations. This eliminates the manual step of re-entering brief requirements into a quoting tool.'
      },
      {
        title: 'Xero Quote Sync',
        content: 'Push quotes to Xero as DRAFT quotes with one click. Client contact matching, chart of accounts mapping, and tax treatment are handled automatically based on your rate card configuration. Once in Xero, quotes can be sent to clients for review. Status changes in Xero sync back to XeroFlow automatically.'
      },
      {
        title: 'Acceptance Tracking',
        content: 'Monitor quote status from within XeroFlow — Draft, Sent, Viewed, Accepted, Declined. When a client accepts a quote in Xero, the status updates in XeroFlow and the brief is marked as commercially approved. Declined quotes can be revised and resubmitted without creating duplicate records.'
      },
      {
        title: 'Invoice Conversion',
        content: 'Convert accepted quotes to DRAFT invoices with a single action. All line items, pricing, contact details, and account codes transfer from the quote to the invoice. This completes the brief-to-cash pipeline: intake, approval, quote, acceptance, invoice, payment tracking.'
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
