<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e] flex flex-col">
    <MarketingNav active="features" />

    <!-- Main Content -->
    <main class="flex-1">

      <!-- Hero Section -->
      <section class="relative bg-[#0a0b0e] pt-[52px]">
        <MarketingHeroBackground theme="time-tracking" />
        <div class="relative max-w-[1200px] mx-auto px-6 text-center pt-28 pb-16 sm:pt-40 sm:pb-24">
          <div class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/[0.12] border border-indigo-500/20 mb-6">
            <UIcon name="i-lucide-clock" class="w-3.5 h-3.5 text-indigo-400" />
            <span class="text-[13px] font-medium text-indigo-400 tracking-[-0.01em]">Time & Capacity</span>
          </div>
          <h1
            class="font-[450] text-white tracking-[-0.02em] mb-5"
            style="font-size: clamp(2rem, 5vw, 3.25rem); line-height: 1.1"
          >
            Track every billable minute
          </h1>
          <p
            class="max-w-[580px] mx-auto text-white/50 leading-relaxed"
            style="font-size: clamp(1rem, 2vw, 1.125rem)"
          >
            From start/stop timers to weekly timesheets and manager approvals, XeroFlow gives your team a complete time tracking
            workflow built right into your project boards.
          </p>
        </div>
      </section>

      <!-- Time Entry Section -->
      <section class="px-6 py-16 sm:py-24">
        <div class="max-w-[1200px] mx-auto grid md:grid-cols-2 gap-12 md:gap-20 items-center">
          <!-- Left: Text -->
          <div>
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#b7bfd9]/[0.08] dark:bg-white/[0.06] mb-5">
              <UIcon name="i-lucide-timer" class="w-3.5 h-3.5 text-[#45474D] dark:text-white/50" />
              <span class="text-[12px] font-medium text-[#45474D] dark:text-white/50 uppercase tracking-wide">Time Entry</span>
            </div>
            <h2
              class="font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4"
              style="font-size: clamp(1.5rem, 3.5vw, 2.25rem); line-height: 1.15"
            >
              Log time against projects and tasks
            </h2>
            <p class="text-[#45474D] dark:text-white/60 text-[16px] leading-relaxed mb-8">
              Whether your team prefers start/stop timers or manual entry at the end of the day, every
              minute is captured against the right project and task. The weekly grid view gives a clear
              picture of where time is being spent across the entire week.
            </p>
          </div>

          <!-- Right: Feature List -->
          <div class="bg-[#f4f5f7] dark:bg-white/[0.03] rounded-2xl p-8">
            <div class="space-y-5">
              <div v-for="feature in timeEntryFeatures" :key="feature" class="flex items-start gap-3.5">
                <div class="mt-0.5 w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center shrink-0">
                  <UIcon name="i-lucide-check" class="w-3 h-3 text-indigo-600" />
                </div>
                <span class="text-[15px] text-[#121317] dark:text-white leading-snug font-[420]">{{ feature }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Timesheet Approval Section -->
      <section class="px-6 py-16 sm:py-24 bg-[#f4f5f7]/60 dark:bg-white/[0.02]">
        <div class="max-w-[1200px] mx-auto">
          <div class="text-center mb-14">
            <h2
              class="font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4"
              style="font-size: clamp(1.5rem, 3.5vw, 2.25rem); line-height: 1.15"
            >
              Weekly timesheets with approval workflow
            </h2>
            <p class="max-w-[560px] mx-auto text-[#45474D] dark:text-white/60 text-[16px] leading-relaxed">
              Team members submit their weekly timesheets for review. Managers approve or reject
              with a single click, keeping everyone accountable and billing accurate.
            </p>
          </div>

          <!-- Status Cards Grid -->
          <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div
              v-for="status in timesheetStatuses"
              :key="status.label"
              class="bg-white dark:bg-white/[0.03] rounded-xl p-6 border border-[#121317]/[0.04] dark:border-white/[0.06]"
            >
              <div class="flex items-center gap-2.5 mb-3.5">
                <span class="text-lg">{{ status.step }}</span>
                <div
                  class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-medium"
                  :class="status.badgeClass"
                >
                  {{ status.label }}
                </div>
              </div>
              <p class="text-[14px] text-[#45474D] dark:text-white/60 leading-relaxed">{{ status.description }}</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Task Integration Section -->
      <section class="px-6 py-16 sm:py-24">
        <div class="max-w-[1200px] mx-auto grid md:grid-cols-2 gap-12 md:gap-20 items-center">
          <!-- Left: Feature List -->
          <div class="order-2 md:order-1 bg-[#f4f5f7] dark:bg-white/[0.03] rounded-2xl p-8">
            <div class="space-y-5">
              <div v-for="feature in taskIntegrationFeatures" :key="feature" class="flex items-start gap-3.5">
                <div class="mt-0.5 w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center shrink-0">
                  <UIcon name="i-lucide-check" class="w-3 h-3 text-indigo-600" />
                </div>
                <span class="text-[15px] text-[#121317] dark:text-white leading-snug font-[420]">{{ feature }}</span>
              </div>
            </div>
          </div>

          <!-- Right: Text -->
          <div class="order-1 md:order-2">
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#b7bfd9]/[0.08] dark:bg-white/[0.06] mb-5">
              <UIcon name="i-lucide-layout-panel-left" class="w-3.5 h-3.5 text-[#45474D] dark:text-white/50" />
              <span class="text-[12px] font-medium text-[#45474D] dark:text-white/50 uppercase tracking-wide">Task Integration</span>
            </div>
            <h2
              class="font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4"
              style="font-size: clamp(1.5rem, 3.5vw, 2.25rem); line-height: 1.15"
            >
              Time tracking inside every task
            </h2>
            <p class="text-[#45474D] dark:text-white/60 text-[16px] leading-relaxed">
              Open any task on your board and the Time panel is right there. See total hours logged, track
              progress against estimates, start a timer, or add a manual entry without leaving the task
              slideover. Everything stays connected to the work.
            </p>
          </div>
        </div>
      </section>

      <!-- Manager View Section -->
      <section class="px-6 py-16 sm:py-24 bg-[#f4f5f7]/60 dark:bg-white/[0.02]">
        <div class="max-w-[1200px] mx-auto grid md:grid-cols-2 gap-12 md:gap-20 items-center">
          <!-- Left: Text -->
          <div>
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#b7bfd9]/[0.08] dark:bg-white/[0.06] mb-5">
              <UIcon name="i-lucide-shield-check" class="w-3.5 h-3.5 text-[#45474D] dark:text-white/50" />
              <span class="text-[12px] font-medium text-[#45474D] dark:text-white/50 uppercase tracking-wide">Manager Approvals</span>
            </div>
            <h2
              class="font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4"
              style="font-size: clamp(1.5rem, 3.5vw, 2.25rem); line-height: 1.15"
            >
              Manager approvals page
            </h2>
            <p class="text-[#45474D] dark:text-white/60 text-[16px] leading-relaxed mb-8">
              A dedicated approvals view lets managers filter by status, expand individual timesheets
              for line-by-line detail, approve in bulk, or reject with a reason. No more chasing
              spreadsheets or email threads.
            </p>
          </div>

          <!-- Right: Feature List -->
          <div class="bg-white dark:bg-white/[0.03] rounded-2xl p-8 border border-[#121317]/[0.04] dark:border-white/[0.06]">
            <div class="space-y-5">
              <div v-for="feature in managerFeatures" :key="feature" class="flex items-start gap-3.5">
                <div class="mt-0.5 w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center shrink-0">
                  <UIcon name="i-lucide-check" class="w-3 h-3 text-indigo-600" />
                </div>
                <span class="text-[15px] text-[#121317] dark:text-white leading-snug font-[420]">{{ feature }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Dark CTA Section -->
      <section class="px-6 py-16 sm:py-24">
        <div class="max-w-[800px] mx-auto">
          <div class="bg-[#121317] rounded-2xl px-8 py-12 sm:px-14 sm:py-16 text-center">
            <h2
              class="font-[450] text-white tracking-[-0.02em] mb-4"
              style="font-size: clamp(1.5rem, 3vw, 2rem); line-height: 1.2"
            >
              Start tracking your team's time
            </h2>
            <p class="text-white/60 text-[16px] leading-relaxed mb-8 max-w-[440px] mx-auto">
              Built into your boards, connected to your invoicing. Every hour accounted for.
            </p>
            <NuxtLink
              to="/auth/login"
              class="inline-flex items-center gap-2 px-6 py-3 bg-white text-[#121317] text-[15px] font-medium rounded-full hover:bg-white/90 transition-colors"
            >
              Get Started
              <UIcon name="i-lucide-arrow-right" class="w-4 h-4" />
            </NuxtLink>
          </div>
        </div>
      </section>

    </main>

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

const timeEntryFeatures = [
  'Project selector with client grouping',
  'Task cascade — pick project, then task',
  'Start/stop timer widget with live counter',
  'Manual entry with hours and description',
  'Weekly grid view for at-a-glance tracking'
]

const timesheetStatuses = [
  {
    step: '1.',
    label: 'Draft',
    badgeClass: 'bg-[#b7bfd9]/10 text-[#45474D]',
    description: 'Team members log time throughout the week. Entries can be edited freely.'
  },
  {
    step: '2.',
    label: 'Submitted',
    badgeClass: 'bg-indigo-50 text-indigo-700',
    description: 'Weekly timesheet is submitted for review. Entries are locked from further edits.'
  },
  {
    step: '3.',
    label: 'Approved',
    badgeClass: 'bg-emerald-50 text-emerald-700',
    description: 'Manager approves the timesheet. Hours are ready for invoicing and reporting.'
  },
  {
    step: '4.',
    label: 'Rejected',
    badgeClass: 'bg-red-50 text-red-700',
    description: 'Manager rejects with a reason. Entries unlock so the team member can correct and resubmit.'
  }
]

const taskIntegrationFeatures = [
  'Summary cards showing total hours and budget',
  'Progress bars for estimate vs. actual tracking',
  'Inline log form right inside the task panel',
  'One-click timer start from any task',
  'Automatic project and task association'
]

const managerFeatures = [
  'Filter tabs by status — pending, approved, rejected',
  'Expandable detail view for each timesheet',
  'Bulk approve multiple timesheets at once',
  'Reject with a reason and automatic unlock',
  'Weekly summary with hours per team member',
  'Direct link from approval to source task'
]
</script>
