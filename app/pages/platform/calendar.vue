<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e]">
    <MarketingNav active="features" />

    <!-- Hero -->
    <section class="pt-[52px]">
      <div class="max-w-[1200px] mx-auto px-6 pt-32 pb-16 md:pt-44 md:pb-24 text-center">
        <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#121317]/[0.04] dark:bg-white/[0.06] mb-8">
          <div class="w-1.5 h-1.5 rounded-full bg-blue-500" />
          <span class="text-[13px] text-[#45474D] dark:text-white/60 font-medium">Work Management</span>
        </div>
        <h1 class="text-[clamp(36px,6vw,64px)] font-[450] text-[#121317] dark:text-white leading-[1.1] tracking-[-0.03em] mb-6 max-w-[800px] mx-auto">
          Your deadlines,<br class="hidden sm:block">visualised
        </h1>
        <p class="text-lg md:text-xl text-[#45474D] dark:text-white/60 max-w-[560px] mx-auto leading-relaxed">
          A month-at-a-glance calendar that pulls due dates from any board. Drag to reschedule, filter by person or status, and never miss a deadline.
        </p>
      </div>
    </section>

    <!-- Calendar Preview -->
    <section class="pb-16 md:pb-24">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="rounded-3xl bg-[#f4f5f7] dark:bg-white/[0.03] overflow-hidden p-6 md:p-10">
          <div class="w-full rounded-2xl bg-white dark:bg-white/[0.04] shadow-sm dark:shadow-none overflow-hidden">
            <!-- Calendar header -->
            <div class="flex items-center justify-between px-5 py-4 border-b border-black/[0.04] dark:border-white/[0.06]">
              <div class="flex items-center gap-3">
                <UIcon name="i-lucide-chevron-left" class="w-4 h-4 text-[#45474D]/50 dark:text-white/40" />
                <span class="text-[14px] font-semibold text-[#121317] dark:text-white">February 2026</span>
                <UIcon name="i-lucide-chevron-right" class="w-4 h-4 text-[#45474D]/50 dark:text-white/40" />
              </div>
              <div class="flex items-center gap-2">
                <div class="px-3 py-1 rounded-full bg-blue-500/10 dark:bg-blue-500/15 text-[11px] font-medium text-blue-600 dark:text-blue-400">Today</div>
                <div class="flex gap-1">
                  <div class="w-7 h-7 rounded bg-[#121317]/[0.04] dark:bg-white/[0.06] flex items-center justify-center">
                    <UIcon name="i-lucide-filter" class="w-3.5 h-3.5 text-[#45474D]/50 dark:text-white/40" />
                  </div>
                </div>
              </div>
            </div>
            <!-- Day headers -->
            <div class="grid grid-cols-7 border-b border-black/[0.04] dark:border-white/[0.06]">
              <div v-for="day in ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']" :key="day" class="py-2 text-center text-[11px] font-semibold text-[#45474D]/50 dark:text-white/40 uppercase tracking-wider">
                {{ day }}
              </div>
            </div>
            <!-- Calendar grid -->
            <div class="grid grid-cols-7">
              <div
                v-for="cell in calendarCells"
                :key="cell.day"
                class="min-h-[80px] md:min-h-[100px] p-2 border-b border-r border-black/[0.02] dark:border-white/[0.03] last:border-r-0"
                :class="cell.isToday ? 'bg-blue-50/50 dark:bg-blue-500/[0.04]' : ''"
              >
                <div class="text-[11px] font-medium mb-1.5" :class="cell.isToday ? 'text-blue-600 dark:text-blue-400' : cell.isOtherMonth ? 'text-[#45474D]/25 dark:text-white/15' : 'text-[#45474D]/60 dark:text-white/50'">
                  {{ cell.day }}
                </div>
                <div v-for="event in cell.events" :key="event.label" class="mb-1">
                  <div class="px-1.5 py-0.5 rounded text-[8px] font-medium truncate" :class="event.class">
                    {{ event.label }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Features Grid -->
    <section class="py-20 md:py-32">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="text-center mb-14">
          <h2 class="text-[clamp(28px,4vw,44px)] font-[450] text-[#121317] dark:text-white leading-[1.15] tracking-[-0.02em] mb-4">
            More than a calendar
          </h2>
          <p class="text-[16px] text-[#45474D] dark:text-white/60 max-w-[500px] mx-auto leading-relaxed">
            Every feature is designed around how agency teams actually plan and track work.
          </p>
        </div>

        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <div
            v-for="feature in features"
            :key="feature.title"
            class="rounded-2xl bg-[#f4f5f7] dark:bg-white/[0.03] p-6 flex flex-col gap-4 hover:bg-[#eef0f3] dark:hover:bg-white/[0.05] transition-colors"
          >
            <div class="w-11 h-11 rounded-xl flex items-center justify-center" :class="feature.bgClass">
              <UIcon :name="feature.icon" class="w-5 h-5" :class="feature.iconClass" />
            </div>
            <div>
              <h3 class="text-[16px] font-medium text-[#121317] dark:text-white mb-1.5">{{ feature.title }}</h3>
              <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">{{ feature.description }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Board Integration -->
    <section class="py-20 md:py-28 bg-[#fafbfc] dark:bg-white/[0.02]">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="flex flex-col gap-12 md:flex-row md:gap-16 items-center">
          <div class="flex-1">
            <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#121317]/[0.04] dark:bg-white/[0.06] mb-6">
              <div class="w-1.5 h-1.5 rounded-full bg-violet-500" />
              <span class="text-[13px] text-[#45474D] dark:text-white/60 font-medium">Board integration</span>
            </div>
            <h2 class="text-[clamp(28px,4vw,44px)] font-[450] text-[#121317] dark:text-white leading-[1.15] tracking-[-0.02em] mb-5">
              One source of truth
            </h2>
            <p class="text-[#45474D] dark:text-white/60 text-base md:text-lg leading-relaxed mb-8 max-w-[480px]">
              The calendar reads directly from your board data. When you move a task on the calendar, the date column updates on the board — and vice versa. No syncing, no conflicts.
            </p>
            <div class="flex flex-col gap-4">
              <div v-for="item in integrationPoints" :key="item.title" class="flex items-start gap-3.5">
                <div class="w-6 h-6 rounded-full bg-emerald-50 dark:bg-emerald-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <UIcon name="i-lucide-check" class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <div class="text-[15px] font-medium text-[#121317] dark:text-white mb-0.5">{{ item.title }}</div>
                  <div class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">{{ item.description }}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="flex-1 w-full">
            <div class="rounded-2xl bg-white dark:bg-white/[0.03] border border-[#121317]/[0.04] dark:border-white/[0.06] p-6 md:p-8">
              <div class="text-[13px] font-semibold text-[#45474D]/50 dark:text-white/40 uppercase tracking-wider mb-6">Supported date columns</div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                <div v-for="col in dateColumns" :key="col" class="flex items-center gap-2.5">
                  <div class="w-5 h-5 rounded-full bg-blue-500/10 dark:bg-blue-500/15 flex items-center justify-center flex-shrink-0">
                    <UIcon name="i-lucide-calendar-days" class="w-3 h-3 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span class="text-[14px] text-[#121317] dark:text-white">{{ col }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Dark CTA -->
    <section class="py-10 md:py-16">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="rounded-[2rem] bg-[#0a0b0e] py-24 md:py-32 text-center px-6 relative overflow-hidden">
          <div class="absolute top-1/3 left-1/4 w-[400px] h-[400px] rounded-full bg-blue-500/[0.06] blur-[100px] pointer-events-none" />
          <div class="relative">
            <h2 class="text-[clamp(28px,4vw,48px)] font-[450] text-white leading-[1.15] tracking-[-0.02em] mb-4">
              Never miss a<br class="hidden sm:block">deadline again
            </h2>
            <p class="text-white/50 text-base md:text-lg max-w-[440px] mx-auto mb-10 leading-relaxed">
              Switch to calendar view on any board and see your entire month at a glance.
            </p>
            <NuxtLink
              to="/auth/login"
              class="inline-flex items-center gap-2 px-7 py-3.5 bg-white text-[#121317] text-[17.5px] font-medium rounded-full hover:bg-white/90 transition-colors"
            >
              Get Started
            </NuxtLink>
          </div>
        </div>
      </div>
    </section>

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

// Calendar preview data — simplified February grid
const calendarCells = [
  // Row 1: Jan 26-Feb 1
  { day: 26, isOtherMonth: true, events: [] },
  { day: 27, isOtherMonth: true, events: [] },
  { day: 28, isOtherMonth: true, events: [] },
  { day: 29, isOtherMonth: true, events: [] },
  { day: 30, isOtherMonth: true, events: [] },
  { day: 31, isOtherMonth: true, events: [] },
  { day: 1, isOtherMonth: false, events: [] },
  // Row 2
  { day: 2, isOtherMonth: false, isToday: true, events: [{ label: 'Sprint review', class: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400' }] },
  { day: 3, isOtherMonth: false, events: [] },
  { day: 4, isOtherMonth: false, events: [{ label: 'Copy deck due', class: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400' }] },
  { day: 5, isOtherMonth: false, events: [] },
  { day: 6, isOtherMonth: false, events: [{ label: 'Client call', class: 'bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-400' }] },
  { day: 7, isOtherMonth: false, events: [] },
  { day: 8, isOtherMonth: false, events: [] },
  // Row 3
  { day: 9, isOtherMonth: false, events: [] },
  { day: 10, isOtherMonth: false, events: [{ label: 'Design review', class: 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400' }] },
  { day: 11, isOtherMonth: false, events: [] },
  { day: 12, isOtherMonth: false, events: [{ label: 'Homepage hero', class: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400' }] },
  { day: 13, isOtherMonth: false, events: [] },
  { day: 14, isOtherMonth: false, events: [{ label: 'Build form', class: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400' }] },
  { day: 15, isOtherMonth: false, events: [{ label: 'Case studies', class: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400' }] },
  // Row 4
  { day: 16, isOtherMonth: false, events: [] },
  { day: 17, isOtherMonth: false, events: [] },
  { day: 18, isOtherMonth: false, events: [{ label: 'Analytics setup', class: 'bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-400' }] },
  { day: 19, isOtherMonth: false, events: [] },
  { day: 20, isOtherMonth: false, events: [{ label: 'SEO research', class: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400' }] },
  { day: 21, isOtherMonth: false, events: [] },
  { day: 22, isOtherMonth: false, events: [{ label: 'Campaign launch', class: 'bg-rose-500 text-white' }] },
]

const features = [
  {
    title: 'Drag to reschedule',
    icon: 'i-lucide-move',
    description: 'Grab any task card and drop it onto a new date. The board date column updates automatically — no double handling.',
    bgClass: 'bg-blue-50 dark:bg-blue-500/15',
    iconClass: 'text-blue-600 dark:text-blue-400'
  },
  {
    title: 'Filter by anything',
    icon: 'i-lucide-filter',
    description: 'Narrow the calendar by person, status, priority, or any custom column. See only what matters to you right now.',
    bgClass: 'bg-violet-50 dark:bg-violet-500/15',
    iconClass: 'text-violet-600 dark:text-violet-400'
  },
  {
    title: 'Multi-board overlay',
    icon: 'i-lucide-layers',
    description: 'Pull dates from multiple boards into a single calendar. Colour-coded by board so you can tell them apart instantly.',
    bgClass: 'bg-emerald-50 dark:bg-emerald-500/15',
    iconClass: 'text-emerald-600 dark:text-emerald-400'
  },
  {
    title: 'Date range support',
    icon: 'i-lucide-calendar-range',
    description: 'Tasks with start and end dates show as spans across multiple days. Perfect for campaigns and project phases.',
    bgClass: 'bg-amber-50 dark:bg-amber-500/15',
    iconClass: 'text-amber-600 dark:text-amber-400'
  },
  {
    title: 'Quick task creation',
    icon: 'i-lucide-plus-circle',
    description: 'Click any empty day to create a new task with that date pre-filled. Assign a person and status inline.',
    bgClass: 'bg-rose-50 dark:bg-rose-500/15',
    iconClass: 'text-rose-600 dark:text-rose-400'
  },
  {
    title: 'Real-time sync',
    icon: 'i-lucide-refresh-cw',
    description: 'Changes made anywhere — board view, Kanban, or calendar — propagate instantly via Server-Sent Events.',
    bgClass: 'bg-sky-50 dark:bg-sky-500/15',
    iconClass: 'text-sky-600 dark:text-sky-400'
  },
]

const integrationPoints = [
  {
    title: 'Bidirectional updates',
    description: 'Drag a task on the calendar and the board date column updates. Edit a date in the table and the calendar moves.'
  },
  {
    title: 'Any date column',
    description: 'Works with due date, start date, timeline, and custom date columns — you choose which one drives the calendar.'
  },
  {
    title: 'Colour by status',
    description: 'Task cards inherit their status colour from the board, so you can see at a glance what is done, in progress, or blocked.'
  },
]

const dateColumns = [
  'Due Date',
  'Start Date',
  'Timeline (range)',
  'Custom Date',
  'Created Date',
  'Last Updated',
  'Deadline',
  'Milestone Date',
]
</script>
