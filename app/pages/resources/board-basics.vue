<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e]">
    <MarketingNav active="resources" />

    <!-- Article -->
    <article class="pt-[52px]">
      <div class="max-w-[720px] mx-auto px-6 pt-24 md:pt-36 pb-16 md:pb-24">

        <!-- Breadcrumb -->
        <NuxtLink to="/resources" class="inline-flex items-center gap-1.5 text-[14px] text-[#45474D] dark:text-white/50 hover:text-[#121317] dark:hover:text-white transition-colors mb-8">
          <UIcon name="i-lucide-arrow-left" class="w-3.5 h-3.5" />
          Back to Resources
        </NuxtLink>

        <!-- Hero -->
        <div class="mb-16">
          <div class="flex items-center gap-3 mb-6">
            <div class="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <UIcon name="i-lucide-kanban" class="w-5 h-5 text-blue-600" />
            </div>
            <span class="text-[13px] text-[#45474D]/60 dark:text-white/40 font-medium">10 min read</span>
          </div>
          <h1 class="text-[clamp(32px,5vw,48px)] font-[450] text-[#121317] dark:text-white leading-[1.1] tracking-[-0.02em] mb-4">
            Board Basics
          </h1>
          <p class="text-lg text-[#45474D] dark:text-white/60 leading-relaxed">
            Boards are the foundation of work management in XeroFlow. Learn how to create them, configure columns, organize tasks into groups, and switch between five powerful views.
          </p>
        </div>

        <!-- Feature Grid: Board Views -->
        <div class="grid sm:grid-cols-3 gap-4 mb-16">
          <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
            <div class="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center mb-3">
              <UIcon name="i-lucide-table" class="w-4 h-4 text-blue-600" />
            </div>
            <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">Table View</p>
            <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Spreadsheet-style editing with inline cells, sorting, and bulk actions.</p>
          </div>
          <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
            <div class="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center mb-3">
              <UIcon name="i-lucide-kanban" class="w-4 h-4 text-violet-600" />
            </div>
            <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">Kanban Board</p>
            <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Drag-and-drop cards grouped by status for visual workflow tracking.</p>
          </div>
          <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
            <div class="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center mb-3">
              <UIcon name="i-lucide-gantt-chart" class="w-4 h-4 text-emerald-600" />
            </div>
            <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">Timeline</p>
            <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Gantt-style horizontal timeline for scheduling and overlap detection.</p>
          </div>
        </div>

        <!-- Content -->
        <div class="flex flex-col gap-14">

          <!-- Section 1 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Creating a board</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Navigate to the Boards section from your sidebar and click "New Board." Each board represents a project, workflow, or area of work -- for example, "Q1 Campaign Deliverables" or "Website Redesign." You can also start from a template if one has been saved by your team.
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Boards are visible to all workspace members by default. If you need a private board (for example, for HR or finance tasks), you can restrict access from the board settings. Every board gets its own URL that you can share directly with teammates or bookmark for quick access.
            </p>
          </section>

          <!-- Section 2 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Working with columns</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Columns define the data you track for each task. XeroFlow supports over 20 column types, so you can model virtually any workflow. The most commonly used types are:
            </p>
            <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] divide-y divide-[#121317]/[0.06] dark:divide-white/[0.06] mb-4">
              <div class="flex items-center gap-3 p-4">
                <UIcon name="i-lucide-circle-dot" class="w-4 h-4 text-blue-500 flex-shrink-0" />
                <div>
                  <span class="text-[15px] font-medium text-[#121317] dark:text-white">Status</span>
                  <span class="text-[14px] text-[#45474D]/70 dark:text-white/40 ml-2">Define workflow stages with color-coded labels (e.g. To Do, In Progress, Done)</span>
                </div>
              </div>
              <div class="flex items-center gap-3 p-4">
                <UIcon name="i-lucide-user" class="w-4 h-4 text-violet-500 flex-shrink-0" />
                <div>
                  <span class="text-[15px] font-medium text-[#121317] dark:text-white">People</span>
                  <span class="text-[14px] text-[#45474D]/70 dark:text-white/40 ml-2">Assign one or more team members to a task</span>
                </div>
              </div>
              <div class="flex items-center gap-3 p-4">
                <UIcon name="i-lucide-calendar" class="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <div>
                  <span class="text-[15px] font-medium text-[#121317] dark:text-white">Date</span>
                  <span class="text-[14px] text-[#45474D]/70 dark:text-white/40 ml-2">Set deadlines or date ranges for timeline visualization</span>
                </div>
              </div>
              <div class="flex items-center gap-3 p-4">
                <UIcon name="i-lucide-hash" class="w-4 h-4 text-amber-500 flex-shrink-0" />
                <div>
                  <span class="text-[15px] font-medium text-[#121317] dark:text-white">Numbers</span>
                  <span class="text-[14px] text-[#45474D]/70 dark:text-white/40 ml-2">Track budgets, hours, scores, or any numeric value</span>
                </div>
              </div>
              <div class="flex items-center gap-3 p-4">
                <UIcon name="i-lucide-type" class="w-4 h-4 text-gray-500 flex-shrink-0" />
                <div>
                  <span class="text-[15px] font-medium text-[#121317] dark:text-white">Text</span>
                  <span class="text-[14px] text-[#45474D]/70 dark:text-white/40 ml-2">Free-form text for notes, links, or short descriptions</span>
                </div>
              </div>
              <div class="flex items-center gap-3 p-4">
                <UIcon name="i-lucide-sigma" class="w-4 h-4 text-rose-500 flex-shrink-0" />
                <div>
                  <span class="text-[15px] font-medium text-[#121317] dark:text-white">Formula</span>
                  <span class="text-[14px] text-[#45474D]/70 dark:text-white/40 ml-2">Calculated columns that reference other column values</span>
                </div>
              </div>
            </div>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
              To add a column, click the "+" at the end of the column headers, select a type, and give it a name. You can reorder columns by dragging their headers, and configure column-specific settings (like status labels or number formats) from the column menu.
            </p>
          </section>

          <!-- Highlight Callout -->
          <div class="rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50/50 border border-blue-100/50 p-6">
            <div class="flex items-start gap-4">
              <div class="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                <UIcon name="i-lucide-lightbulb" class="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p class="text-[15px] font-medium text-[#121317] dark:text-white mb-1">Over 20 Column Types</p>
                <p class="text-[14px] text-[#45474D] dark:text-white/60 leading-relaxed">Beyond the basics, XeroFlow supports dropdowns, checkboxes, file uploads, ratings, formulas, dependencies, location, phone, email, and more. You can model virtually any data structure your agency needs -- from creative approval stages to budget tracking with calculated fields.</p>
              </div>
            </div>
          </div>

          <!-- Section 3 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Organizing with groups</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Groups let you organize tasks into logical sections within a board. A common pattern is to group by project phase ("Planning", "Design", "Development", "QA"), by client, or by sprint. Each group is collapsible, so you can focus on the section that matters right now.
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
              To create a new group, scroll to the bottom of your board and click "Add Group." You can rename groups by clicking their header, reorder them by dragging, and color-code them for quick visual identification. Tasks can be moved between groups by dragging or by using the task context menu.
            </p>
          </section>

          <!-- Section 4 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Switching between views</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Every board supports five views, each giving you a different perspective on the same data. Switch between them using the view tabs in the board toolbar:
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              <strong class="text-[#121317] dark:text-white">Table</strong> is the default spreadsheet-style view. It shows all columns and supports inline editing, sorting, and bulk actions. This is where most detailed data entry happens.
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              <strong class="text-[#121317] dark:text-white">Kanban</strong> displays tasks as cards grouped by a status column. Drag cards between columns to update their status. It is ideal for tracking workflow progress at a glance.
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              <strong class="text-[#121317] dark:text-white">Timeline</strong> renders tasks on a Gantt-style horizontal timeline using their date or date-range column. Drag to reschedule, resize to adjust duration, and see overlaps between tasks.
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              <strong class="text-[#121317] dark:text-white">Calendar</strong> shows tasks on a monthly calendar grid. Tasks appear on their due date, and you can drag them to reschedule. Useful for editorial calendars and content planning.
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
              <strong class="text-[#121317] dark:text-white">Gallery</strong> presents tasks as visual cards with file previews. This is perfect for creative review workflows where you need to see designs, images, or video thumbnails at a glance.
            </p>
          </section>

          <!-- Section 5 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Subtasks and nesting</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Any task can have subtasks. Click the expand arrow on a task row to reveal its subtask area, then add child tasks that inherit the parent's group and board context. Subtasks have their own column values, assignees, and status -- they function as full tasks nested under a parent.
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
              This is especially useful for breaking down complex deliverables. A task like "Launch Landing Page" might have subtasks for "Write copy," "Design mockup," "Develop page," and "QA review." The parent task can show a progress summary based on how many subtasks are complete.
            </p>
          </section>

          <!-- Stats Row -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-4 text-center">
              <div class="text-[24px] font-[450] text-[#121317] dark:text-white tracking-tight">20+</div>
              <div class="text-[13px] text-[#45474D]/60 dark:text-white/40 mt-1">Column Types</div>
            </div>
            <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-4 text-center">
              <div class="text-[24px] font-[450] text-[#121317] dark:text-white tracking-tight">5</div>
              <div class="text-[13px] text-[#45474D]/60 dark:text-white/40 mt-1">Board Views</div>
            </div>
            <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-4 text-center">
              <div class="text-[24px] font-[450] text-[#121317] dark:text-white tracking-tight">&infin;</div>
              <div class="text-[13px] text-[#45474D]/60 dark:text-white/40 mt-1">Subtask Levels</div>
            </div>
            <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-4 text-center">
              <div class="text-[24px] font-[450] text-[#121317] dark:text-white tracking-tight">Live</div>
              <div class="text-[13px] text-[#45474D]/60 dark:text-white/40 mt-1">Real-time Sync</div>
            </div>
          </div>

          <!-- Next Steps -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Next steps</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-6">
              Now that you understand board fundamentals, explore these related guides to level up your workflow.
            </p>
            <div class="flex flex-col gap-3">
              <NuxtLink
                to="/resources/inviting-team"
                class="flex items-center justify-between p-4 rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] hover:border-[#121317]/15 dark:hover:border-white/15 hover:bg-[#f4f5f7]/50 dark:hover:bg-white/[0.03] transition-all group"
              >
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center">
                    <UIcon name="i-lucide-users" class="w-4 h-4 text-violet-600" />
                  </div>
                  <div>
                    <span class="text-[15px] font-medium text-[#121317] dark:text-white">Inviting Your Team</span>
                    <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Get your colleagues on the board</p>
                  </div>
                </div>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#121317]/30 dark:text-white/20 group-hover:text-[#121317] dark:group-hover:text-white transition-colors" />
              </NuxtLink>
              <NuxtLink
                to="/resources/first-automation"
                class="flex items-center justify-between p-4 rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] hover:border-[#121317]/15 dark:hover:border-white/15 hover:bg-[#f4f5f7]/50 dark:hover:bg-white/[0.03] transition-all group"
              >
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-lg bg-rose-50 flex items-center justify-center">
                    <UIcon name="i-lucide-zap" class="w-4 h-4 text-rose-600" />
                  </div>
                  <div>
                    <span class="text-[15px] font-medium text-[#121317] dark:text-white">Your First Automation</span>
                    <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Automate status changes and notifications</p>
                  </div>
                </div>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#121317]/30 dark:text-white/20 group-hover:text-[#121317] dark:group-hover:text-white transition-colors" />
              </NuxtLink>
              <NuxtLink
                to="/resources/setting-up-clients"
                class="flex items-center justify-between p-4 rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] hover:border-[#121317]/15 dark:hover:border-white/15 hover:bg-[#f4f5f7]/50 dark:hover:bg-white/[0.03] transition-all group"
              >
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
                    <UIcon name="i-lucide-building-2" class="w-4 h-4 text-amber-600" />
                  </div>
                  <div>
                    <span class="text-[15px] font-medium text-[#121317] dark:text-white">Setting Up Clients</span>
                    <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Client records, portal access, and billing</p>
                  </div>
                </div>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#121317]/30 dark:text-white/20 group-hover:text-[#121317] dark:group-hover:text-white transition-colors" />
              </NuxtLink>
            </div>
          </section>

        </div>
      </div>
    </article>

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
  title: 'Board Basics — XeroFlow',
  description: 'Learn how boards work in XeroFlow. Columns, views, groups, subtasks, and real-time collaboration for managing agency work.',
  ogTitle: 'Board Basics — XeroFlow',
  ogDescription: 'Learn how boards work in XeroFlow. Columns, views, groups, subtasks, and real-time collaboration for managing agency work.',
})
</script>
