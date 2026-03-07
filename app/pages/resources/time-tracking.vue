<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e]">
    <MarketingNav active="resources" />

    <div class="pt-[52px]">
      <div class="max-w-[720px] mx-auto px-6 pt-24 md:pt-36 pb-20 md:pb-32">

        <NuxtLink to="/resources" class="inline-flex items-center gap-1.5 text-[13px] text-[#45474D]/60 dark:text-white/40 hover:text-[#121317] dark:hover:text-white transition-colors mb-8">
          <UIcon name="i-lucide-arrow-left" class="w-3.5 h-3.5" />
          Back to Resources
        </NuxtLink>

        <h1 class="text-[clamp(32px,5vw,48px)] font-[450] text-[#121317] dark:text-white leading-[1.1] tracking-[-0.02em] mb-4">
          Time Tracking &amp; Timesheets
        </h1>
        <p class="text-lg text-[#45474D] dark:text-white/60 leading-relaxed mb-3">
          Log time against tasks and projects, submit weekly timesheets for approval, and track team utilisation across your agency.
        </p>
        <p class="text-[13px] text-[#45474D]/50 dark:text-white/40 mb-14">8 min read</p>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-14">
          <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-4 text-center">
            <div class="text-[24px] font-[450] text-[#121317] dark:text-white tracking-tight">Tasks</div>
            <div class="text-[13px] text-[#45474D]/60 dark:text-white/40 mt-1">Task-Level Logging</div>
          </div>
          <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-4 text-center">
            <div class="text-[24px] font-[450] text-[#121317] dark:text-white tracking-tight">Weekly</div>
            <div class="text-[13px] text-[#45474D]/60 dark:text-white/40 mt-1">Grid View</div>
          </div>
          <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-4 text-center">
            <div class="text-[24px] font-[450] text-[#121317] dark:text-white tracking-tight">Submit</div>
            <div class="text-[13px] text-[#45474D]/60 dark:text-white/40 mt-1">Approval Flow</div>
          </div>
          <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-4 text-center">
            <div class="text-[24px] font-[450] text-[#121317] dark:text-white tracking-tight">Timer</div>
            <div class="text-[13px] text-[#45474D]/60 dark:text-white/40 mt-1">Live Tracking</div>
          </div>
        </div>

        <div class="flex flex-col gap-12">

          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Logging Time</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Log time from the time tracking page using the entry modal or directly from a board task's Time tab. Select a project, then optionally a task within that project &mdash; the task selector cascades from project selection so you always log against the correct item.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Each entry captures the date, duration, project, task (optional), and a description of the work performed. The weekly grid displays entries in a Monday&ndash;Sunday layout where you can see your logged hours at a glance and add new entries by clicking any cell.
            </p>
          </section>

          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Timer Mode</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Start a live timer from the time tracking page or from a task's Time panel. The timer runs in the background while you work, and you can stop it at any time to create a time entry with the elapsed duration automatically calculated.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              The timer is associated with a specific project and task, so the entry is pre-populated when you stop. This eliminates the need to remember how long you spent on a task and prevents rounding errors from manual entry.
            </p>
          </section>

          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Task Time Panel</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-6">
              Every board task has a <strong class="font-medium text-[#121317] dark:text-white">Time &amp; Billing</strong> tab in the task slideover. This panel shows summary cards with total logged hours, a progress bar against estimated time (if set), an inline form for quick logging, and a timer start button.
            </p>
            <div class="rounded-2xl bg-gradient-to-br from-cyan-50 to-sky-50/50 dark:from-cyan-500/10 dark:to-sky-500/5 border border-cyan-100/50 dark:border-cyan-500/20 p-6">
              <div class="flex items-start gap-4">
                <div class="w-10 h-10 rounded-xl bg-cyan-100 dark:bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
                  <UIcon name="i-lucide-timer" class="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                </div>
                <div>
                  <p class="text-[15px] font-medium text-[#121317] dark:text-white mb-1">Contextual Time Logging</p>
                  <p class="text-[14px] text-[#45474D] dark:text-white/60 leading-relaxed">Log time without leaving the task you're working on. The inline form and timer button are always visible in the Time tab, so you can record work as you go without switching contexts.</p>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Submitting Timesheets</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              At the end of each week, submit your timesheet for manager approval. The submit action locks all entries for that week &mdash; they can no longer be edited, added, or deleted until the timesheet is returned.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              A confirmation modal shows your total hours and entry count before submission. Once submitted, a status badge updates from <strong class="font-medium text-[#121317] dark:text-white">Draft</strong> to <strong class="font-medium text-[#121317] dark:text-white">Submitted</strong>. If a manager rejects your timesheet, a banner explains the reason and your entries unlock for editing.
            </p>
          </section>

          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Manager Approvals</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Managers access the approvals page at <strong class="font-medium text-[#121317] dark:text-white">Time &rarr; Approvals</strong>. The page shows filter tabs for Submitted, Approved, and Rejected timesheets. Each row expands to show the full breakdown of entries for that person and week.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Approve individual timesheets or select multiple for bulk approval. Rejections require a reason that the team member sees in a banner on their timesheet. The status progresses: <strong class="font-medium text-[#121317] dark:text-white">Draft &rarr; Submitted &rarr; Approved/Rejected</strong>.
            </p>
          </section>

          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Team Utilisation</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Use time tracking data to understand how your team spends their hours. Compare logged time against project budgets to spot projects that are over-serviced or under-resourced. Track utilisation rates per person and per department.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              The AI assistant can answer time tracking questions like "How many hours did we spend on Client X last month?" or "Which team member has the lowest utilisation this week?" using the <strong class="font-medium text-[#121317] dark:text-white">time_tracking_query</strong> intent that searches logged entries and highlights timesheet gaps.
            </p>
          </section>

          <section class="mt-4 pt-10 border-t border-[#121317]/[0.06] dark:border-white/[0.06]">
            <h2 class="text-[18px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-5">Next Steps</h2>
            <div class="flex flex-col gap-3">
              <NuxtLink to="/resources/roles-permissions" class="flex items-center justify-between p-4 rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] hover:bg-[#eef0f3] dark:hover:bg-white/[0.05] transition-colors group">
                <div>
                  <p class="text-[15px] font-medium text-[#121317] dark:text-white">Roles &amp; Permissions</p>
                  <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Custom roles and RBAC enforcement</p>
                </div>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#45474D]/40 dark:text-white/30 group-hover:text-[#121317] dark:group-hover:text-white transition-colors" />
              </NuxtLink>
              <NuxtLink to="/resources/briefs-proposals" class="flex items-center justify-between p-4 rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] hover:bg-[#eef0f3] dark:hover:bg-white/[0.05] transition-colors group">
                <div>
                  <p class="text-[15px] font-medium text-[#121317] dark:text-white">Briefs &amp; Proposals</p>
                  <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Templates, AI tools, and quote conversion</p>
                </div>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#45474D]/40 dark:text-white/30 group-hover:text-[#121317] dark:group-hover:text-white transition-colors" />
              </NuxtLink>
              <NuxtLink to="/resources/financial-operations" class="flex items-center justify-between p-4 rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] hover:bg-[#eef0f3] dark:hover:bg-white/[0.05] transition-colors group">
                <div>
                  <p class="text-[15px] font-medium text-[#121317] dark:text-white">Financial Operations</p>
                  <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Xero sync, invoicing, and ad spend tracking</p>
                </div>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#45474D]/40 dark:text-white/30 group-hover:text-[#121317] dark:group-hover:text-white transition-colors" />
              </NuxtLink>
            </div>
          </section>

        </div>
      </div>
    </div>

    <MarketingFooter />
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false,
  public: true
})

useSeoMeta({
  title: 'Time Tracking & Timesheets — XeroFlow',
  description: 'Log time against tasks and projects, submit weekly timesheets for manager approval, and track team utilisation across your agency.',
  ogTitle: 'Time Tracking & Timesheets — XeroFlow',
  ogDescription: 'Log time against tasks and projects, submit weekly timesheets for manager approval, and track team utilisation across your agency.',
})
</script>
