<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e]">
    <MarketingNav active="resources" />

    <!-- Article Content -->
    <div class="pt-[52px]">
      <div class="max-w-[720px] mx-auto px-6 pt-24 md:pt-36 pb-20 md:pb-32">

        <!-- Breadcrumb -->
        <NuxtLink to="/resources" class="inline-flex items-center gap-1.5 text-[13px] text-[#45474D]/60 dark:text-white/40 hover:text-[#121317] dark:hover:text-white transition-colors mb-8">
          <UIcon name="i-lucide-arrow-left" class="w-3.5 h-3.5" />
          Back to Resources
        </NuxtLink>

        <!-- Hero -->
        <h1 class="text-[clamp(32px,5vw,48px)] font-[450] text-[#121317] dark:text-white leading-[1.1] tracking-[-0.02em] mb-4">
          Work Management Deep Dive
        </h1>
        <p class="text-lg text-[#45474D] dark:text-white/60 leading-relaxed mb-3">
          A complete guide to boards, views, column types, and real-time collaboration in XeroFlow.
        </p>
        <p class="text-[13px] text-[#45474D]/50 dark:text-white/40 mb-14">12 min read</p>

        <!-- Stats Row -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-14">
          <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-4 text-center">
            <div class="text-[24px] font-[450] text-[#121317] dark:text-white tracking-tight">20+</div>
            <div class="text-[13px] text-[#45474D]/60 dark:text-white/40 mt-1">Column Types</div>
          </div>
          <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-4 text-center">
            <div class="text-[24px] font-[450] text-[#121317] dark:text-white tracking-tight">5</div>
            <div class="text-[13px] text-[#45474D]/60 dark:text-white/40 mt-1">Board Views</div>
          </div>
          <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-4 text-center">
            <div class="text-[24px] font-[450] text-[#121317] dark:text-white tracking-tight">Real-time</div>
            <div class="text-[13px] text-[#45474D]/60 dark:text-white/40 mt-1">Live Sync</div>
          </div>
          <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-4 text-center">
            <div class="text-[24px] font-[450] text-[#121317] dark:text-white tracking-tight">&infin;</div>
            <div class="text-[13px] text-[#45474D]/60 dark:text-white/40 mt-1">Unlimited Boards</div>
          </div>
        </div>

        <!-- Content Sections -->
        <div class="flex flex-col gap-12">

          <!-- Section 1 -->
          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">The Board System</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Every project in XeroFlow lives on a board. Boards are flexible workspaces that combine tasks, data columns, and multiple visual layouts into a single shared surface. Think of them as a spreadsheet that understands your workflow -- each row is a task, and each column holds a specific piece of data about that task.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              You can create as many boards as you need. Most agencies organise boards by client, by department, or by project type. Each board can be templated, shared with specific team members, and linked to chat channels for real-time discussion. Board-level permissions let you control who can view, edit, or manage the board structure itself.
            </p>
          </section>

          <!-- Section 2 -->
          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Column Types</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              XeroFlow supports over 20 column types that cover everything from simple text and numbers to complex formulas and linked items. The core set includes <strong class="font-medium text-[#121317] dark:text-white">Status</strong> (customisable label groups with colours), <strong class="font-medium text-[#121317] dark:text-white">People</strong> (assign one or more team members), <strong class="font-medium text-[#121317] dark:text-white">Date</strong> (single dates or date ranges for timelines), <strong class="font-medium text-[#121317] dark:text-white">Number</strong> (with formatting for currency, percentage, or plain values), and <strong class="font-medium text-[#121317] dark:text-white">Text</strong> (single-line or rich text).
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Beyond the basics, you have <strong class="font-medium text-[#121317] dark:text-white">Dropdown</strong> for single or multi-select options, <strong class="font-medium text-[#121317] dark:text-white">Checkbox</strong> for boolean values, <strong class="font-medium text-[#121317] dark:text-white">Rating</strong> for priority scoring, <strong class="font-medium text-[#121317] dark:text-white">File</strong> for attachments uploaded to R2 storage, <strong class="font-medium text-[#121317] dark:text-white">Link</strong> for URLs, <strong class="font-medium text-[#121317] dark:text-white">Email</strong>, <strong class="font-medium text-[#121317] dark:text-white">Phone</strong>, and <strong class="font-medium text-[#121317] dark:text-white">Location</strong> fields.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              The <strong class="font-medium text-[#121317] dark:text-white">Formula</strong> column type lets you compute derived values from other columns -- sum hours, calculate margins, or concatenate labels. Formula columns update in real time as their source values change, making them ideal for budget tracking or progress calculations across tasks.
            </p>
          </section>

          <!-- Section 3 -->
          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Views: Five Ways to See Your Work</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-6">
              Every board supports five distinct views, and you can switch between them instantly without losing any data or configuration.
            </p>

            <!-- View Feature Grid -->
            <div class="flex flex-wrap gap-4 my-8">
              <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4 flex-1 min-w-[140px]">
                <div class="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center mb-3">
                  <UIcon name="i-lucide-table" class="w-4 h-4 text-emerald-600" />
                </div>
                <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">Table</p>
                <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Spreadsheet layout with inline editing and bulk selection.</p>
              </div>
              <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4 flex-1 min-w-[140px]">
                <div class="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center mb-3">
                  <UIcon name="i-lucide-kanban" class="w-4 h-4 text-violet-600" />
                </div>
                <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">Kanban</p>
                <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Drag-and-drop swim lanes grouped by status.</p>
              </div>
              <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4 flex-1 min-w-[140px]">
                <div class="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center mb-3">
                  <UIcon name="i-lucide-gantt-chart" class="w-4 h-4 text-amber-600" />
                </div>
                <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">Timeline</p>
                <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Gantt-style chart with drag-to-reschedule.</p>
              </div>
              <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4 flex-1 min-w-[140px]">
                <div class="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center mb-3">
                  <UIcon name="i-lucide-calendar" class="w-4 h-4 text-blue-600" />
                </div>
                <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">Calendar</p>
                <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Monthly grid for deadlines and content planning.</p>
              </div>
              <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4 flex-1 min-w-[140px]">
                <div class="w-9 h-9 rounded-lg bg-rose-50 flex items-center justify-center mb-3">
                  <UIcon name="i-lucide-image" class="w-4 h-4 text-rose-600" />
                </div>
                <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">Gallery</p>
                <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Visual card grid for creative asset review.</p>
              </div>
            </div>

            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              The <strong class="font-medium text-[#121317] dark:text-white">Table View</strong> is the default spreadsheet layout with sortable columns, inline cell editing, and bulk row selection for mass updates. It is the fastest way to triage a large number of tasks.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              <strong class="font-medium text-[#121317] dark:text-white">Kanban View</strong> groups tasks into swim lanes based on any status column. Drag cards between columns to update status instantly. Each card shows a configurable preview of key fields so you can scan priority, assignee, and due date at a glance.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              <strong class="font-medium text-[#121317] dark:text-white">Timeline View</strong> renders tasks as horizontal bars on a Gantt-style chart. Tasks with date-range columns display their start and end dates visually. You can drag to reschedule, resize to adjust duration, and see overlapping work across your team.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              <strong class="font-medium text-[#121317] dark:text-white">Calendar View</strong> displays tasks on a monthly calendar grid. Tasks appear on their due date or within their date range. Drag a task card to a new date to reschedule it. Calendar view is particularly useful for content calendars, campaign launch timelines, and deadline tracking.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              <strong class="font-medium text-[#121317] dark:text-white">Gallery View</strong> shows tasks as visual cards in a grid layout, prioritising file previews and images. Creative teams use this view for asset review, proof management, and visual project tracking. Each card expands into a detail panel for comments and approvals.
            </p>
          </section>

          <!-- Section 4 -->
          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Groups, Subtasks, and Hierarchy</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Tasks within a board can be organised into <strong class="font-medium text-[#121317] dark:text-white">groups</strong> -- collapsible sections that let you partition work by phase, sprint, priority, or any other category you need. Groups carry their own colour coding and can be reordered by drag-and-drop.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Any task can have <strong class="font-medium text-[#121317] dark:text-white">subtasks</strong> nested beneath it, creating a parent-child hierarchy. Subtasks inherit the board's column structure but can have their own status, assignee, and dates. A progress indicator on the parent task automatically reflects how many subtasks have been completed.
            </p>
          </section>

          <!-- Section 5 -->
          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Templates and Bulk Actions</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Save any board configuration as a <strong class="font-medium text-[#121317] dark:text-white">template</strong> to spin up new projects instantly. Templates capture column definitions, groups, default values, and automation recipes -- everything except task-specific data. When you create a board from a template, a fresh workspace appears with all the structure already in place.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Bulk actions let you select multiple tasks and apply changes in one operation: update a status, reassign ownership, move tasks between groups, duplicate rows, or delete in batch. Combined with table view's checkbox selection, bulk actions make it practical to manage hundreds of tasks without tedious one-by-one edits.
            </p>
          </section>

          <!-- Section 6 -->
          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Real-Time Collaboration</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              XeroFlow uses <strong class="font-medium text-[#121317] dark:text-white">Server-Sent Events (SSE)</strong> backed by Durable Objects to deliver live updates to everyone viewing a board. When a teammate changes a cell value, adds a subtask, or drags a card in Kanban view, your screen updates within milliseconds -- no manual refresh required.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-6">
              Online presence indicators show which team members are currently viewing the board. The system gracefully degrades through a WebSocket to SSE to polling fallback chain, so real-time updates work reliably regardless of network conditions or browser support.
            </p>

            <!-- Highlight Callout -->
            <div class="rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50/50 border border-emerald-100/50 p-6">
              <div class="flex items-start gap-4">
                <div class="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <UIcon name="i-lucide-radio" class="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p class="text-[15px] font-medium text-[#121317] dark:text-white mb-1">Zero-Refresh Collaboration</p>
                  <p class="text-[14px] text-[#45474D] dark:text-white/60 leading-relaxed">Every cell edit, status change, and card drag is broadcast instantly to all viewers. With the WebSocket-to-SSE-to-polling fallback chain, real-time updates are resilient across any network condition -- your team always sees the latest state.</p>
                </div>
              </div>
            </div>
          </section>

          <!-- Next Steps -->
          <section class="mt-4 pt-10 border-t border-[#121317]/[0.06] dark:border-white/[0.06]">
            <h2 class="text-[18px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-5">Next Steps</h2>
            <div class="flex flex-col gap-3">
              <NuxtLink to="/resources/financial-operations" class="flex items-center justify-between p-4 rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] hover:bg-[#eef0f3] dark:hover:bg-white/[0.05] transition-colors group">
                <div>
                  <p class="text-[15px] font-medium text-[#121317] dark:text-white">Financial Operations</p>
                  <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Xero sync, invoicing, and ad spend tracking</p>
                </div>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#45474D]/40 dark:text-white/30 group-hover:text-[#121317] dark:group-hover:text-white transition-colors" />
              </NuxtLink>
              <NuxtLink to="/resources/ai-automation" class="flex items-center justify-between p-4 rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] hover:bg-[#eef0f3] dark:hover:bg-white/[0.05] transition-colors group">
                <div>
                  <p class="text-[15px] font-medium text-[#121317] dark:text-white">AI & Automation</p>
                  <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">AI chat, anomaly detection, and automation recipes</p>
                </div>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#45474D]/40 dark:text-white/30 group-hover:text-[#121317] dark:group-hover:text-white transition-colors" />
              </NuxtLink>
              <NuxtLink to="/resources/integrations" class="flex items-center justify-between p-4 rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] hover:bg-[#eef0f3] dark:hover:bg-white/[0.05] transition-colors group">
                <div>
                  <p class="text-[15px] font-medium text-[#121317] dark:text-white">Integrations</p>
                  <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">All 8 platform integrations at a glance</p>
                </div>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#45474D]/40 dark:text-white/30 group-hover:text-[#121317] dark:group-hover:text-white transition-colors" />
              </NuxtLink>
            </div>
          </section>

        </div>
      </div>
    </div>

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
            <NuxtLink to="/about" class="hover:text-[#45474D] dark:hover:text-white transition-colors">About</NuxtLink>
            <NuxtLink to="/privacy" class="hover:text-[#45474D] dark:hover:text-white transition-colors">Privacy</NuxtLink>
            <NuxtLink to="/terms" class="hover:text-[#45474D] dark:hover:text-white transition-colors">Terms</NuxtLink>
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

useSeoMeta({
  title: 'Work Management — XeroFlow',
  description: 'Deep dive into XeroFlow work management. Boards, columns, views, groups, subtasks, and real-time collaboration for agency teams.',
  ogTitle: 'Work Management — XeroFlow',
  ogDescription: 'Deep dive into XeroFlow work management. Boards, columns, views, groups, subtasks, and real-time collaboration for agency teams.',
})
</script>
