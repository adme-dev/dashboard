<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e]">
    <MarketingNav active="features" />

    <!-- Hero -->
    <section class="relative bg-[#0a0b0e] pt-[52px]">
      <MarketingHeroBackground theme="templates" />
      <div class="relative max-w-[1200px] mx-auto px-6 pt-32 pb-16 md:pt-44 md:pb-24 text-center">
        <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.06] mb-8">
          <div class="w-1.5 h-1.5 rounded-full bg-blue-400" />
          <span class="text-[13px] text-white/60 font-medium">Work Management</span>
        </div>
        <h1 class="text-[clamp(36px,6vw,64px)] font-[450] text-white leading-[1.1] tracking-[-0.03em] mb-6 max-w-[800px] mx-auto">
          Start fast with<br class="hidden sm:block">proven workflows
        </h1>
        <p class="text-lg md:text-xl text-white/50 max-w-[560px] mx-auto leading-relaxed">
          Save any board as a reusable template — columns, groups, automations, and views included. Or pick from our pre-built library.
        </p>
      </div>
    </section>

    <!-- Template Categories -->
    <section class="pb-20 md:pb-28">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <div
            v-for="cat in categories"
            :key="cat.title"
            class="rounded-2xl bg-[#f4f5f7] dark:bg-white/[0.03] p-6 md:p-8 flex flex-col gap-5 group hover:bg-[#eef0f3] dark:hover:bg-white/[0.05] transition-colors"
          >
            <div class="flex items-center gap-3">
              <div class="w-11 h-11 rounded-xl flex items-center justify-center" :class="cat.bgClass">
                <UIcon :name="cat.icon" class="w-5 h-5" :class="cat.iconClass" />
              </div>
              <div>
                <h3 class="text-[16px] font-medium text-[#121317] dark:text-white">{{ cat.title }}</h3>
                <span class="text-[12px] text-[#45474D]/50 dark:text-white/30">{{ cat.count }} templates</span>
              </div>
            </div>
            <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">{{ cat.description }}</p>
            <!-- Mini template preview -->
            <div class="mt-auto pt-4 border-t border-black/[0.04] dark:border-white/[0.06]">
              <div class="flex flex-col gap-1.5">
                <div v-for="tmpl in cat.templates" :key="tmpl" class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-white/[0.04]">
                  <div class="w-1.5 h-1.5 rounded-full" :class="cat.dotClass" />
                  <span class="text-[11px] text-[#121317] dark:text-white/80 truncate">{{ tmpl }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- How Templates Work -->
    <section class="py-20 md:py-28 bg-[#fafbfc] dark:bg-white/[0.02]">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="text-center mb-14">
          <h2 class="text-[clamp(28px,4vw,44px)] font-[450] text-[#121317] dark:text-white leading-[1.15] tracking-[-0.02em] mb-4">
            How templates work
          </h2>
          <p class="text-[16px] text-[#45474D] dark:text-white/60 max-w-[500px] mx-auto leading-relaxed">
            Three steps from blank board to fully configured workflow.
          </p>
        </div>

        <div class="grid md:grid-cols-3 gap-6">
          <div
            v-for="step in steps"
            :key="step.number"
            class="relative rounded-2xl bg-white dark:bg-white/[0.03] border border-[#121317]/[0.04] dark:border-white/[0.06] p-6 md:p-8 flex flex-col gap-5"
          >
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/15 flex items-center justify-center flex-shrink-0">
                <span class="text-[15px] font-semibold text-blue-700 dark:text-blue-400">{{ step.number }}</span>
              </div>
              <div class="w-11 h-11 rounded-xl bg-[#f4f5f7] dark:bg-white/[0.06] flex items-center justify-center">
                <UIcon :name="step.icon" class="w-5 h-5 text-[#121317] dark:text-white" />
              </div>
            </div>
            <div>
              <h3 class="text-[18px] font-medium text-[#121317] dark:text-white mb-2">{{ step.title }}</h3>
              <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">{{ step.description }}</p>
            </div>
            <div v-if="step.number < 3" class="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 z-10">
              <UIcon name="i-lucide-chevron-right" class="w-5 h-5 text-[#45474D]/30 dark:text-white/20" />
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- What's Included -->
    <section class="py-20 md:py-28">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="flex flex-col gap-12 md:flex-row md:gap-16 items-center">
          <div class="flex-1">
            <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#121317]/[0.04] dark:bg-white/[0.06] mb-6">
              <div class="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span class="text-[13px] text-[#45474D] dark:text-white/60 font-medium">Everything saved</span>
            </div>
            <h2 class="text-[clamp(28px,4vw,44px)] font-[450] text-[#121317] dark:text-white leading-[1.15] tracking-[-0.02em] mb-5">
              Templates capture<br class="hidden sm:block">your entire setup
            </h2>
            <p class="text-[#45474D] dark:text-white/60 text-base md:text-lg leading-relaxed mb-8 max-w-[480px]">
              When you save a board as a template, everything comes along — not just columns and groups, but your automations, views, and configurations.
            </p>
          </div>

          <div class="flex-1 w-full">
            <div class="rounded-2xl bg-[#f4f5f7] dark:bg-white/[0.03] p-6 md:p-8">
              <div class="text-[13px] font-semibold text-[#45474D]/50 dark:text-white/40 uppercase tracking-wider mb-6">Included in every template</div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                <div v-for="item in included" :key="item" class="flex items-center gap-2.5">
                  <div class="w-5 h-5 rounded-full bg-emerald-500/10 dark:bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                    <UIcon name="i-lucide-check" class="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <span class="text-[14px] text-[#121317] dark:text-white">{{ item }}</span>
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
          <div class="absolute top-1/3 right-1/4 w-[400px] h-[400px] rounded-full bg-blue-500/[0.06] blur-[100px] pointer-events-none" />
          <div class="relative">
            <h2 class="text-[clamp(28px,4vw,48px)] font-[450] text-white leading-[1.15] tracking-[-0.02em] mb-4">
              Set up a board<br class="hidden sm:block">in seconds
            </h2>
            <p class="text-white/50 text-base md:text-lg max-w-[440px] mx-auto mb-10 leading-relaxed">
              Pick a template, customise what you need, and your team is ready to go.
            </p>
            <NuxtLink
              to="/contact"
              class="inline-flex items-center gap-2 px-7 py-3.5 bg-white text-[#121317] text-[17.5px] font-medium rounded-full hover:bg-white/90 transition-colors"
            >
              Talk to us
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

const categories = [
  {
    title: 'Campaign Management',
    icon: 'i-lucide-megaphone',
    bgClass: 'bg-rose-50 dark:bg-rose-500/15',
    iconClass: 'text-rose-600 dark:text-rose-400',
    dotClass: 'bg-rose-400',
    count: 4,
    description: 'End-to-end campaign tracking from brief to launch with approval gates and performance columns.',
    templates: ['Social Campaign Tracker', 'Content Calendar', 'Campaign Retrospective']
  },
  {
    title: 'Client Onboarding',
    icon: 'i-lucide-user-plus',
    bgClass: 'bg-blue-50 dark:bg-blue-500/15',
    iconClass: 'text-blue-600 dark:text-blue-400',
    dotClass: 'bg-blue-400',
    count: 3,
    description: 'Structured onboarding checklists with kickoff tasks, access provisioning, and handoff milestones.',
    templates: ['New Client Setup', 'Brand Discovery', 'Access & Credentials']
  },
  {
    title: 'Sprint Planning',
    icon: 'i-lucide-target',
    bgClass: 'bg-violet-50 dark:bg-violet-500/15',
    iconClass: 'text-violet-600 dark:text-violet-400',
    dotClass: 'bg-violet-400',
    count: 3,
    description: 'Two-week sprint boards with backlog, in-progress, review, and done groups. Story points included.',
    templates: ['2-Week Sprint', 'Kanban Backlog', 'Release Planning']
  },
  {
    title: 'Creative Production',
    icon: 'i-lucide-palette',
    bgClass: 'bg-amber-50 dark:bg-amber-500/15',
    iconClass: 'text-amber-600 dark:text-amber-400',
    dotClass: 'bg-amber-400',
    count: 4,
    description: 'Track deliverables from concept to final approval with file columns, revision history, and sign-off statuses.',
    templates: ['Design Pipeline', 'Video Production', 'Asset Library']
  },
  {
    title: 'Website Projects',
    icon: 'i-lucide-globe',
    bgClass: 'bg-emerald-50 dark:bg-emerald-500/15',
    iconClass: 'text-emerald-600 dark:text-emerald-400',
    dotClass: 'bg-emerald-400',
    count: 3,
    description: 'Full website build workflow — discovery, wireframes, design, development, QA, and launch phases.',
    templates: ['Website Build', 'Landing Page Sprint', 'SEO Audit']
  },
  {
    title: 'Reporting & Finance',
    icon: 'i-lucide-bar-chart-3',
    bgClass: 'bg-sky-50 dark:bg-sky-500/15',
    iconClass: 'text-sky-600 dark:text-sky-400',
    dotClass: 'bg-sky-400',
    count: 3,
    description: 'Monthly reporting cycles, invoice tracking, and budget management with formula columns.',
    templates: ['Monthly Report Cycle', 'Budget Tracker', 'Invoice Pipeline']
  },
]

const steps = [
  {
    number: 1,
    title: 'Choose or save',
    icon: 'i-lucide-layout-template',
    description: 'Pick a template from the library, or save any existing board as a new template to capture your proven workflow.'
  },
  {
    number: 2,
    title: 'Customise',
    icon: 'i-lucide-settings-2',
    description: 'Rename columns, adjust groups, toggle views, and set up automations. The template is your starting point, not a constraint.'
  },
  {
    number: 3,
    title: 'Launch',
    icon: 'i-lucide-rocket',
    description: 'Your new board is ready with all columns, groups, views, and automations pre-configured. Assign people and go.'
  }
]

const included = [
  'Column configuration',
  'Group structure',
  'View presets',
  'Automation recipes',
  'Status labels & colours',
  'Column ordering',
  'Default filters',
  'Subtask templates',
  'Person assignments',
  'File placeholders',
]
</script>
