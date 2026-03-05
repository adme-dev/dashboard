<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e]">
    <MarketingNav active="features" />

    <!-- Hero Section -->
    <section class="relative bg-[#0a0b0e] pt-[52px]">
      <MarketingHeroBackground theme="boards" />
      <div class="relative max-w-[1200px] mx-auto px-6 pt-32 pb-16 md:pt-44 md:pb-24 text-center">
        <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.06] mb-8">
          <div class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span class="text-[13px] text-white/60 font-medium">Work Management</span>
        </div>
        <h1 class="text-[clamp(36px,6vw,68px)] font-[450] text-white leading-[1.08] tracking-[-0.03em] mb-6 max-w-[820px] mx-auto">
          Boards that adapt to<br class="hidden sm:block">how you work
        </h1>
        <p class="text-lg md:text-xl text-white/50 max-w-[580px] mx-auto leading-relaxed mb-10">
          20+ column types, 5 powerful views, and real-time collaboration. Build workflows that match the way your team actually operates.
        </p>
        <div class="flex flex-col sm:flex-row items-center justify-center gap-3">
          <NuxtLink
            to="/auth/login"
            class="inline-flex items-center gap-2.5 px-6 py-3 bg-white text-[#121317] text-[17.5px] font-medium rounded-full hover:bg-white/90 transition-colors"
          >
            Get Started
          </NuxtLink>
          <button
            class="inline-flex items-center gap-2 px-6 py-3 bg-white/10 text-white text-[17.5px] font-medium rounded-full hover:bg-white/20 transition-colors"
            @click="scrollToViews"
          >
            Explore views
            <UIcon name="i-lucide-chevron-down" class="w-4 h-4" />
          </button>
        </div>
      </div>
    </section>

    <!-- Board Preview Illustration -->
    <section class="pb-16 md:pb-24">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="rounded-3xl board-hero-gradient overflow-hidden flex items-center justify-center px-6 py-10 md:px-12 md:py-16">
          <div class="w-full rounded-2xl bg-white/80 dark:bg-white/[0.06] backdrop-blur-sm shadow-sm dark:shadow-none overflow-hidden">
            <!-- Board header -->
            <div class="flex items-center gap-3 px-5 py-3.5 border-b border-black/[0.04] dark:border-white/[0.06]">
              <div class="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span class="text-[12px] font-medium text-[#121317]/70 dark:text-white/70">Campaign Board</span>
              <div class="ml-auto flex items-center gap-2">
                <div class="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#121317]/[0.04] dark:bg-white/[0.06]">
                  <div class="w-4 h-4 rounded-full bg-blue-200 dark:bg-blue-500/30 flex items-center justify-center">
                    <span class="text-[6px] font-semibold text-blue-700 dark:text-blue-300">SL</span>
                  </div>
                  <div class="w-4 h-4 rounded-full bg-violet-200 dark:bg-violet-500/30 -ml-1 flex items-center justify-center">
                    <span class="text-[6px] font-semibold text-violet-700 dark:text-violet-300">JK</span>
                  </div>
                  <div class="w-4 h-4 rounded-full bg-amber-200 dark:bg-amber-500/30 -ml-1 flex items-center justify-center">
                    <span class="text-[6px] font-semibold text-amber-700 dark:text-amber-300">MR</span>
                  </div>
                  <span class="text-[9px] text-[#45474D]/50 dark:text-white/40 ml-0.5">+4</span>
                </div>
                <div class="flex gap-1">
                  <div class="w-6 h-6 rounded bg-[#121317]/[0.04] dark:bg-white/[0.06] flex items-center justify-center">
                    <UIcon name="i-lucide-filter" class="w-3 h-3 text-[#45474D]/50 dark:text-white/40" />
                  </div>
                  <div class="w-6 h-6 rounded bg-[#121317]/[0.04] dark:bg-white/[0.06] flex items-center justify-center">
                    <UIcon name="i-lucide-search" class="w-3 h-3 text-[#45474D]/50 dark:text-white/40" />
                  </div>
                </div>
              </div>
            </div>
            <!-- Table rows -->
            <div class="overflow-hidden">
              <!-- Column headers -->
              <div class="grid grid-cols-12 gap-0 px-5 py-2 border-b border-black/[0.03] dark:border-white/[0.04] text-[9px] font-semibold text-[#45474D]/50 dark:text-white/40 uppercase tracking-wider">
                <div class="col-span-4">Task</div>
                <div class="col-span-2 hidden sm:block">Status</div>
                <div class="col-span-2 hidden sm:block">Person</div>
                <div class="col-span-2 hidden sm:block">Date</div>
                <div class="col-span-2 hidden sm:block">Priority</div>
              </div>
              <!-- Group: Sprint 1 -->
              <div class="border-b border-black/[0.03] dark:border-white/[0.04]">
                <div class="px-5 py-2 flex items-center gap-2">
                  <div class="w-3 h-0.5 rounded-full bg-blue-500" />
                  <span class="text-[10px] font-semibold text-[#121317]/60 dark:text-white/60">Sprint 1</span>
                  <span class="text-[9px] text-[#45474D]/40 dark:text-white/30 ml-1">4 items</span>
                </div>
                <div
                  v-for="row in boardRows.slice(0, 4)"
                  :key="row.task"
                  class="grid grid-cols-12 gap-0 px-5 py-2.5 border-t border-black/[0.02] dark:border-white/[0.03] hover:bg-[#121317]/[0.01] dark:hover:bg-white/[0.02] transition-colors"
                >
                  <div class="col-span-4 flex items-center gap-2">
                    <div class="w-3.5 h-3.5 rounded border border-black/[0.08] dark:border-white/[0.08]" />
                    <span class="text-[11px] text-[#121317] dark:text-white truncate">{{ row.task }}</span>
                  </div>
                  <div class="col-span-2 hidden sm:flex items-center">
                    <span
                      class="px-2 py-0.5 rounded-full text-[8px] font-medium"
                      :class="row.statusClass"
                    >{{ row.status }}</span>
                  </div>
                  <div class="col-span-2 hidden sm:flex items-center">
                    <div class="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-semibold" :class="row.avatarClass">
                      {{ row.initials }}
                    </div>
                  </div>
                  <div class="col-span-2 hidden sm:flex items-center">
                    <span class="text-[10px] text-[#45474D]/60 dark:text-white/50">{{ row.date }}</span>
                  </div>
                  <div class="col-span-2 hidden sm:flex items-center">
                    <span
                      class="px-2 py-0.5 rounded-full text-[8px] font-medium"
                      :class="row.priorityClass"
                    >{{ row.priority }}</span>
                  </div>
                </div>
              </div>
              <!-- Group: Sprint 2 -->
              <div>
                <div class="px-5 py-2 flex items-center gap-2">
                  <div class="w-3 h-0.5 rounded-full bg-violet-500" />
                  <span class="text-[10px] font-semibold text-[#121317]/60 dark:text-white/60">Sprint 2</span>
                  <span class="text-[9px] text-[#45474D]/40 dark:text-white/30 ml-1">3 items</span>
                </div>
                <div
                  v-for="row in boardRows.slice(4, 7)"
                  :key="row.task"
                  class="grid grid-cols-12 gap-0 px-5 py-2.5 border-t border-black/[0.02] dark:border-white/[0.03] hover:bg-[#121317]/[0.01] dark:hover:bg-white/[0.02] transition-colors"
                >
                  <div class="col-span-4 flex items-center gap-2">
                    <div class="w-3.5 h-3.5 rounded border border-black/[0.08] dark:border-white/[0.08]" />
                    <span class="text-[11px] text-[#121317] dark:text-white truncate">{{ row.task }}</span>
                  </div>
                  <div class="col-span-2 hidden sm:flex items-center">
                    <span
                      class="px-2 py-0.5 rounded-full text-[8px] font-medium"
                      :class="row.statusClass"
                    >{{ row.status }}</span>
                  </div>
                  <div class="col-span-2 hidden sm:flex items-center">
                    <div class="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-semibold" :class="row.avatarClass">
                      {{ row.initials }}
                    </div>
                  </div>
                  <div class="col-span-2 hidden sm:flex items-center">
                    <span class="text-[10px] text-[#45474D]/60 dark:text-white/50">{{ row.date }}</span>
                  </div>
                  <div class="col-span-2 hidden sm:flex items-center">
                    <span
                      class="px-2 py-0.5 rounded-full text-[8px] font-medium"
                      :class="row.priorityClass"
                    >{{ row.priority }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Views Section -->
    <section id="views" class="py-20 md:py-32">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="text-center mb-16">
          <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#121317]/[0.04] dark:bg-white/[0.06] mb-6">
            <div class="w-1.5 h-1.5 rounded-full bg-blue-500" />
            <span class="text-[13px] text-[#45474D] dark:text-white/60 font-medium">5 powerful views</span>
          </div>
          <h2 class="text-[clamp(28px,4vw,48px)] font-[450] text-[#121317] dark:text-white leading-[1.15] tracking-[-0.02em] mb-4">
            One board, five perspectives
          </h2>
          <p class="text-[#45474D] dark:text-white/60 text-lg max-w-[520px] mx-auto leading-relaxed">
            Switch between views instantly. Every view reads from the same data, so your team is always in sync.
          </p>
        </div>

        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <div
            v-for="view in views"
            :key="view.title"
            class="rounded-2xl bg-[#f4f5f7] dark:bg-white/[0.03] p-6 flex flex-col gap-4 group hover:bg-[#eef0f3] dark:hover:bg-white/[0.05] transition-colors"
          >
            <div class="w-11 h-11 rounded-xl bg-white dark:bg-white/[0.06] flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:shadow-none">
              <UIcon :name="view.icon" class="w-5 h-5 text-[#121317] dark:text-white" />
            </div>
            <div>
              <h3 class="text-[16px] font-medium text-[#121317] dark:text-white mb-1.5">{{ view.title }}</h3>
              <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">{{ view.description }}</p>
            </div>
            <!-- Mini illustration -->
            <div class="mt-auto pt-4 border-t border-black/[0.04] dark:border-white/[0.06]">
              <!-- Kanban mini -->
              <div v-if="view.key === 'kanban'" class="flex gap-2 h-16">
                <div class="flex-1 rounded-lg bg-blue-50/80 dark:bg-blue-500/10 p-1.5 flex flex-col gap-1">
                  <div class="text-[7px] font-semibold text-[#45474D]/40 dark:text-white/30 uppercase">To Do</div>
                  <div class="flex-1 rounded bg-white/80 dark:bg-white/[0.08] p-1">
                    <div class="h-1 w-3/4 rounded-full bg-[#121317]/10 dark:bg-white/20 mb-1" />
                    <div class="h-0.5 w-1/2 rounded-full bg-[#121317]/[0.06] dark:bg-white/10" />
                  </div>
                  <div class="flex-1 rounded bg-white/80 dark:bg-white/[0.08] p-1">
                    <div class="h-1 w-2/3 rounded-full bg-[#121317]/10 dark:bg-white/20" />
                  </div>
                </div>
                <div class="flex-1 rounded-lg bg-amber-50/80 dark:bg-amber-500/10 p-1.5 flex flex-col gap-1">
                  <div class="text-[7px] font-semibold text-[#45474D]/40 dark:text-white/30 uppercase">Active</div>
                  <div class="flex-1 rounded bg-white/80 dark:bg-white/[0.08] p-1">
                    <div class="h-1 w-4/5 rounded-full bg-[#121317]/10 dark:bg-white/20" />
                  </div>
                </div>
                <div class="flex-1 rounded-lg bg-emerald-50/80 dark:bg-emerald-500/10 p-1.5 flex flex-col gap-1">
                  <div class="text-[7px] font-semibold text-[#45474D]/40 dark:text-white/30 uppercase">Done</div>
                  <div class="flex-1 rounded bg-white/80 dark:bg-white/[0.08] p-1">
                    <div class="h-1 w-3/5 rounded-full bg-emerald-300/40" />
                  </div>
                </div>
              </div>
              <!-- Timeline mini -->
              <div v-if="view.key === 'timeline'" class="h-16 flex flex-col justify-center gap-2 px-1">
                <div class="flex items-center gap-1">
                  <div class="w-12 text-[7px] text-[#45474D]/40 dark:text-white/40 truncate">Design</div>
                  <div class="flex-1 h-3 rounded-full bg-blue-200/50 dark:bg-blue-500/15 relative ml-2">
                    <div class="absolute left-[10%] right-[30%] top-0 bottom-0 rounded-full bg-blue-400/70" />
                  </div>
                </div>
                <div class="flex items-center gap-1">
                  <div class="w-12 text-[7px] text-[#45474D]/40 dark:text-white/40 truncate">Build</div>
                  <div class="flex-1 h-3 rounded-full bg-violet-200/50 dark:bg-violet-500/15 relative ml-2">
                    <div class="absolute left-[30%] right-[10%] top-0 bottom-0 rounded-full bg-violet-400/70" />
                  </div>
                </div>
                <div class="flex items-center gap-1">
                  <div class="w-12 text-[7px] text-[#45474D]/40 dark:text-white/40 truncate">Launch</div>
                  <div class="flex-1 h-3 rounded-full bg-emerald-200/50 dark:bg-emerald-500/15 relative ml-2">
                    <div class="absolute left-[60%] right-[5%] top-0 bottom-0 rounded-full bg-emerald-400/70" />
                  </div>
                </div>
              </div>
              <!-- Calendar mini -->
              <div v-if="view.key === 'calendar'" class="h-16">
                <div class="grid grid-cols-7 gap-0.5">
                  <div v-for="d in 7" :key="'h-' + d" class="text-[6px] text-center text-[#45474D]/30 dark:text-white/30 font-medium">
                    {{ ['M', 'T', 'W', 'T', 'F', 'S', 'S'][d - 1] }}
                  </div>
                  <div
                    v-for="d in 21"
                    :key="'d-' + d"
                    class="aspect-square rounded flex items-center justify-center text-[7px]"
                    :class="[
                      d === 8 || d === 15 ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 font-medium' : '',
                      d === 11 ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-medium' : '',
                      d === 18 ? 'bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-400 font-medium' : '',
                      ![8, 11, 15, 18].includes(d) ? 'text-[#45474D]/30 dark:text-white/30' : ''
                    ]"
                  >
                    {{ d }}
                  </div>
                </div>
              </div>
              <!-- Gallery mini -->
              <div v-if="view.key === 'gallery'" class="h-16 grid grid-cols-4 gap-1.5">
                <div class="rounded-lg bg-gradient-to-br from-rose-100 to-pink-50 dark:from-rose-500/15 dark:to-pink-500/10 flex items-center justify-center">
                  <UIcon name="i-lucide-image" class="w-3 h-3 text-rose-300 dark:text-rose-400" />
                </div>
                <div class="rounded-lg bg-gradient-to-br from-blue-100 to-indigo-50 dark:from-blue-500/15 dark:to-indigo-500/10 flex items-center justify-center">
                  <UIcon name="i-lucide-file-text" class="w-3 h-3 text-blue-300 dark:text-blue-400" />
                </div>
                <div class="rounded-lg bg-gradient-to-br from-amber-100 to-yellow-50 dark:from-amber-500/15 dark:to-yellow-500/10 flex items-center justify-center">
                  <UIcon name="i-lucide-image" class="w-3 h-3 text-amber-300 dark:text-amber-400" />
                </div>
                <div class="rounded-lg bg-gradient-to-br from-emerald-100 to-teal-50 dark:from-emerald-500/15 dark:to-teal-500/10 flex items-center justify-center">
                  <UIcon name="i-lucide-video" class="w-3 h-3 text-emerald-300 dark:text-emerald-400" />
                </div>
              </div>
              <!-- Table mini -->
              <div v-if="view.key === 'table'" class="h-16 flex flex-col gap-1">
                <div class="flex gap-2 text-[7px] text-[#45474D]/40 dark:text-white/40 font-semibold uppercase border-b border-black/[0.04] dark:border-white/[0.06] pb-1">
                  <div class="flex-1">Task</div>
                  <div class="w-12">Status</div>
                  <div class="w-10">Date</div>
                </div>
                <div v-for="r in 3" :key="'tr-' + r" class="flex gap-2 items-center">
                  <div class="flex-1 h-1 rounded-full bg-[#121317]/10 dark:bg-white/15" />
                  <div class="w-12">
                    <div class="h-2.5 w-8 rounded-full" :class="['bg-blue-200/60 dark:bg-blue-500/30', 'bg-amber-200/60 dark:bg-amber-500/30', 'bg-emerald-200/60 dark:bg-emerald-500/30'][r - 1]" />
                  </div>
                  <div class="w-10 h-1 rounded-full bg-[#121317]/[0.06] dark:bg-white/10" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Column Types Section -->
    <section class="py-20 md:py-32 bg-[#b7bfd9]/[0.04] dark:bg-white/[0.02]">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="text-center mb-16">
          <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#121317]/[0.04] dark:bg-white/[0.06] mb-6">
            <div class="w-1.5 h-1.5 rounded-full bg-violet-500" />
            <span class="text-[13px] text-[#45474D] dark:text-white/60 font-medium">Flexible data</span>
          </div>
          <h2 class="text-[clamp(28px,4vw,48px)] font-[450] text-[#121317] dark:text-white leading-[1.15] tracking-[-0.02em] mb-4">
            20+ column types
          </h2>
          <p class="text-[#45474D] dark:text-white/60 text-lg max-w-[520px] mx-auto leading-relaxed">
            From simple text to formulas and dependencies. Every column type you need to model your workflow.
          </p>
        </div>

        <div class="flex flex-wrap justify-center gap-3">
          <div
            v-for="col in columnTypes"
            :key="col.label"
            class="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.06] hover:border-black/[0.12] dark:hover:border-white/[0.12] hover:shadow-[0_1px_4px_rgba(0,0,0,0.04)] transition-all group"
          >
            <div class="w-6 h-6 rounded-lg flex items-center justify-center" :class="col.iconBg">
              <UIcon :name="col.icon" class="w-3.5 h-3.5" :class="col.iconColor" />
            </div>
            <span class="text-[14px] text-[#121317] dark:text-white font-medium">{{ col.label }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Collaboration Section -->
    <section class="py-20 md:py-32">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="flex flex-col gap-12 md:flex-row md:gap-16 items-center">
          <!-- Left: text -->
          <div class="flex-1">
            <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#121317]/[0.04] dark:bg-white/[0.06] mb-6">
              <div class="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span class="text-[13px] text-[#45474D] dark:text-white/60 font-medium">Built for teams</span>
            </div>
            <h2 class="text-[clamp(28px,4vw,44px)] font-[450] text-[#121317] dark:text-white leading-[1.15] tracking-[-0.02em] mb-5">
              Collaborate in<br class="hidden sm:block">real time
            </h2>
            <p class="text-[#45474D] dark:text-white/60 text-base md:text-lg leading-relaxed mb-8 max-w-[480px]">
              Every change syncs instantly via Server-Sent Events. Organize work into groups and subtasks, save configurations as templates, and keep your entire team aligned.
            </p>
            <div class="flex flex-col gap-4">
              <div
                v-for="detail in collaborationDetails"
                :key="detail.title"
                class="flex items-start gap-3.5"
              >
                <div class="w-6 h-6 rounded-full bg-emerald-50 dark:bg-emerald-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <UIcon name="i-lucide-check" class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <div class="text-[15px] font-medium text-[#121317] dark:text-white mb-0.5">{{ detail.title }}</div>
                  <div class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">{{ detail.description }}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Right: feature list card -->
          <div class="flex-1 w-full">
            <div class="rounded-2xl bg-[#f4f5f7] dark:bg-white/[0.03] p-6 md:p-8">
              <div class="text-[13px] font-semibold text-[#45474D]/50 dark:text-white/40 uppercase tracking-wider mb-6">Everything included</div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                <div
                  v-for="feature in collaborationFeatures"
                  :key="feature"
                  class="flex items-center gap-2.5"
                >
                  <div class="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                    <UIcon name="i-lucide-check" class="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <span class="text-[14px] text-[#121317] dark:text-white">{{ feature }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Stats Strip -->
    <section class="py-16 border-y border-black/[0.04] dark:border-white/[0.06]">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-10 text-center">
          <div v-for="stat in stats" :key="stat.label">
            <div class="text-[clamp(32px,5vw,48px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] leading-none mb-2">
              {{ stat.value }}
            </div>
            <div class="text-[14px] text-[#45474D]/60 dark:text-white/40">{{ stat.label }}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- Dark CTA -->
    <section class="py-10 md:py-16">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="rounded-[2rem] bg-[#0a0b0e] py-24 md:py-32 text-center px-6 relative overflow-hidden">
          <!-- Ambient glow -->
          <div class="absolute top-1/3 left-1/4 w-[400px] h-[400px] rounded-full bg-emerald-500/[0.06] blur-[100px] pointer-events-none" />
          <div class="absolute bottom-1/3 right-1/4 w-[300px] h-[300px] rounded-full bg-blue-500/[0.04] blur-[80px] pointer-events-none" />

          <div class="relative">
            <div class="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center mx-auto mb-8">
              <span class="text-white text-xs font-semibold tracking-tight">XF</span>
            </div>
            <h2 class="text-[clamp(28px,4vw,48px)] font-[450] text-white leading-[1.15] tracking-[-0.02em] mb-4">
              Start building your<br class="hidden sm:block">first board
            </h2>
            <p class="text-white/50 text-base md:text-lg max-w-[440px] mx-auto mb-10 leading-relaxed">
              Set up columns, assign your team, and go live in minutes. No complex setup required.
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
    <MarketingFooter />
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false,
  public: true
})

function scrollToViews() {
  document.getElementById('views')?.scrollIntoView({ behavior: 'smooth' })
}

// Board preview data
const boardRows = [
  { task: 'Design homepage hero', status: 'Done', statusClass: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400', initials: 'SL', avatarClass: 'bg-blue-200 dark:bg-blue-500/25 text-blue-700 dark:text-blue-300', date: 'Feb 12', priority: 'High', priorityClass: 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400' },
  { task: 'Build contact form', status: 'Working', statusClass: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400', initials: 'JK', avatarClass: 'bg-violet-200 dark:bg-violet-500/25 text-violet-700 dark:text-violet-300', date: 'Feb 14', priority: 'Medium', priorityClass: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400' },
  { task: 'Write case studies', status: 'Working', statusClass: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400', initials: 'MR', avatarClass: 'bg-amber-200 dark:bg-amber-500/25 text-amber-700 dark:text-amber-300', date: 'Feb 15', priority: 'Medium', priorityClass: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400' },
  { task: 'Set up analytics', status: 'To Do', statusClass: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400', initials: 'PG', avatarClass: 'bg-emerald-200 dark:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300', date: 'Feb 18', priority: 'Low', priorityClass: 'bg-[#121317]/[0.06] dark:bg-white/[0.08] text-[#45474D] dark:text-white/60' },
  { task: 'SEO keyword research', status: 'To Do', statusClass: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400', initials: 'SL', avatarClass: 'bg-blue-200 dark:bg-blue-500/25 text-blue-700 dark:text-blue-300', date: 'Feb 20', priority: 'High', priorityClass: 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400' },
  { task: 'Launch campaign ads', status: 'To Do', statusClass: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400', initials: 'JK', avatarClass: 'bg-violet-200 dark:bg-violet-500/25 text-violet-700 dark:text-violet-300', date: 'Feb 22', priority: 'Critical', priorityClass: 'bg-rose-500 text-white' },
  { task: 'Performance audit', status: 'Blocked', statusClass: 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400', initials: 'MR', avatarClass: 'bg-amber-200 dark:bg-amber-500/25 text-amber-700 dark:text-amber-300', date: 'Feb 25', priority: 'Medium', priorityClass: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400' },
]

// Views data
const views = [
  {
    key: 'kanban',
    title: 'Kanban',
    icon: 'i-lucide-columns-3',
    description: 'Drag-and-drop cards grouped by any status column. See work flow across stages at a glance with real-time updates.'
  },
  {
    key: 'timeline',
    title: 'Timeline',
    icon: 'i-lucide-gantt-chart',
    description: 'Gantt-style timeline with date range bars. Drag to reschedule, visualise dependencies, and plan sprints.'
  },
  {
    key: 'calendar',
    title: 'Calendar',
    icon: 'i-lucide-calendar',
    description: 'Monthly view with task cards on due dates. Drag-to-reschedule and filter by person, status, or priority.'
  },
  {
    key: 'gallery',
    title: 'Gallery',
    icon: 'i-lucide-layout-grid',
    description: 'Visual grid with file previews and thumbnails. Ideal for creative review workflows and asset management.'
  },
  {
    key: 'table',
    title: 'Table',
    icon: 'i-lucide-table',
    description: 'Spreadsheet-style rows and columns with sortable headers, inline editing, and bulk selection for fast data entry.'
  }
]

// Column types
const columnTypes = [
  { label: 'Status', icon: 'i-lucide-circle-dot', iconBg: 'bg-blue-50 dark:bg-blue-500/15', iconColor: 'text-blue-600 dark:text-blue-400' },
  { label: 'People', icon: 'i-lucide-users', iconBg: 'bg-violet-50 dark:bg-violet-500/15', iconColor: 'text-violet-600 dark:text-violet-400' },
  { label: 'Date', icon: 'i-lucide-calendar-days', iconBg: 'bg-emerald-50 dark:bg-emerald-500/15', iconColor: 'text-emerald-600 dark:text-emerald-400' },
  { label: 'Numbers', icon: 'i-lucide-hash', iconBg: 'bg-amber-50 dark:bg-amber-500/15', iconColor: 'text-amber-600 dark:text-amber-400' },
  { label: 'Text', icon: 'i-lucide-type', iconBg: 'bg-gray-100 dark:bg-gray-500/15', iconColor: 'text-gray-600 dark:text-gray-400' },
  { label: 'Formula', icon: 'i-lucide-sigma', iconBg: 'bg-indigo-50 dark:bg-indigo-500/15', iconColor: 'text-indigo-600 dark:text-indigo-400' },
  { label: 'Timeline', icon: 'i-lucide-gantt-chart', iconBg: 'bg-blue-50 dark:bg-blue-500/15', iconColor: 'text-blue-600 dark:text-blue-400' },
  { label: 'Files', icon: 'i-lucide-paperclip', iconBg: 'bg-rose-50 dark:bg-rose-500/15', iconColor: 'text-rose-600 dark:text-rose-400' },
  { label: 'Rating', icon: 'i-lucide-star', iconBg: 'bg-amber-50 dark:bg-amber-500/15', iconColor: 'text-amber-600 dark:text-amber-400' },
  { label: 'Checkbox', icon: 'i-lucide-check-square', iconBg: 'bg-emerald-50 dark:bg-emerald-500/15', iconColor: 'text-emerald-600 dark:text-emerald-400' },
  { label: 'Dropdown', icon: 'i-lucide-chevron-down', iconBg: 'bg-violet-50 dark:bg-violet-500/15', iconColor: 'text-violet-600 dark:text-violet-400' },
  { label: 'Link', icon: 'i-lucide-link', iconBg: 'bg-blue-50 dark:bg-blue-500/15', iconColor: 'text-blue-600 dark:text-blue-400' },
  { label: 'Tags', icon: 'i-lucide-tags', iconBg: 'bg-teal-50 dark:bg-teal-500/15', iconColor: 'text-teal-600 dark:text-teal-400' },
  { label: 'Progress', icon: 'i-lucide-bar-chart', iconBg: 'bg-emerald-50 dark:bg-emerald-500/15', iconColor: 'text-emerald-600 dark:text-emerald-400' },
  { label: 'Location', icon: 'i-lucide-map-pin', iconBg: 'bg-rose-50 dark:bg-rose-500/15', iconColor: 'text-rose-600 dark:text-rose-400' },
  { label: 'Phone', icon: 'i-lucide-phone', iconBg: 'bg-gray-100 dark:bg-gray-500/15', iconColor: 'text-gray-600 dark:text-gray-400' },
  { label: 'Email', icon: 'i-lucide-mail', iconBg: 'bg-blue-50 dark:bg-blue-500/15', iconColor: 'text-blue-600 dark:text-blue-400' },
  { label: 'Color', icon: 'i-lucide-palette', iconBg: 'bg-pink-50 dark:bg-pink-500/15', iconColor: 'text-pink-600 dark:text-pink-400' },
  { label: 'Dependency', icon: 'i-lucide-git-branch', iconBg: 'bg-amber-50 dark:bg-amber-500/15', iconColor: 'text-amber-600 dark:text-amber-400' },
  { label: 'Mirror', icon: 'i-lucide-copy', iconBg: 'bg-indigo-50 dark:bg-indigo-500/15', iconColor: 'text-indigo-600 dark:text-indigo-400' },
]

// Collaboration details
const collaborationDetails = [
  {
    title: 'Real-time SSE sync',
    description: 'Changes from any teammate appear instantly. No refreshing, no conflicts. Built on Server-Sent Events with WebSocket fallback.'
  },
  {
    title: 'Groups and subtasks',
    description: 'Organize tasks into collapsible groups with nested subtasks for complex, multi-layered projects.'
  },
  {
    title: 'Board templates',
    description: 'Save any board configuration as a reusable template. Spin up new projects with your proven workflows in seconds.'
  },
  {
    title: 'Bulk actions',
    description: 'Select multiple tasks and update status, assignee, dates, or any column value in one operation.'
  }
]

// Collaboration checklist
const collaborationFeatures = [
  'Drag-and-drop reordering',
  'Inline cell editing',
  'Column filters and sorting',
  'Person assignment',
  'File attachments',
  'Activity logging',
  'Board subscriptions',
  'Export to CSV',
  'Keyboard shortcuts',
  'Search within board',
  'Custom column ordering',
  'Conditional formatting',
]

// Stats
const stats = [
  { value: '20+', label: 'Column types' },
  { value: '5', label: 'Board views' },
  { value: '<100ms', label: 'Sync latency' },
  { value: '0', label: 'Setup required' },
]
</script>

<style scoped>
.board-hero-gradient {
  background: linear-gradient(135deg, #e0e7ff 0%, #dbeafe 25%, #ede9fe 50%, #e0e7ff 75%, #dbeafe 100%);
}
</style>

<style>
.dark .board-hero-gradient {
  background: linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(59,130,246,0.10) 25%, rgba(139,92,246,0.10) 50%, rgba(99,102,241,0.12) 75%, rgba(59,130,246,0.10) 100%);
}
</style>
