<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e]">
    <MarketingNav active="features" />

    <!-- Hero -->
    <section class="relative bg-[#0a0b0e] pt-[52px]">
      <MarketingHeroBackground theme="automations" />
      <div class="relative max-w-[1200px] mx-auto px-6 pt-32 pb-16 md:pt-44 md:pb-24 text-center">
        <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/[0.12] mb-8">
          <div class="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <span class="text-[13px] text-amber-400 font-medium">Automations</span>
        </div>
        <h1 class="text-[clamp(36px,6vw,64px)] font-[450] text-white leading-[1.1] tracking-[-0.03em] mb-6 max-w-[800px] mx-auto">
          Automate the<br class="hidden sm:block">repetitive stuff
        </h1>
        <p class="text-lg md:text-xl text-white/50 max-w-[580px] mx-auto leading-relaxed">
          Build trigger-action recipes that handle notifications, board events, and status updates — so your team can focus on real work.
        </p>
      </div>
    </section>

    <!-- How It Works -->
    <section class="pb-20 md:pb-32">
      <div class="max-w-[1200px] mx-auto px-6">
        <h2 class="text-[clamp(24px,3vw,32px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4 text-center">
          How it works
        </h2>
        <p class="text-[15px] text-[#45474D] dark:text-white/60 text-center mb-12 max-w-[480px] mx-auto">
          Three steps to put any workflow on autopilot.
        </p>
        <div class="grid md:grid-cols-3 gap-6">
          <div
            v-for="step in steps"
            :key="step.number"
            class="relative rounded-2xl bg-[#f4f5f7] dark:bg-white/[0.03] p-6 md:p-8 flex flex-col gap-5"
          >
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-500/[0.12] flex items-center justify-center flex-shrink-0">
                <span class="text-[15px] font-semibold text-amber-700 dark:text-amber-400">{{ step.number }}</span>
              </div>
              <div class="w-11 h-11 rounded-xl bg-white dark:bg-white/[0.06] flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <UIcon :name="step.icon" class="w-5 h-5 text-[#121317] dark:text-white" />
              </div>
            </div>
            <div>
              <h3 class="text-[18px] font-medium text-[#121317] dark:text-white mb-2">{{ step.title }}</h3>
              <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">{{ step.description }}</p>
            </div>
            <!-- Connector arrow (visible on md+ between cards) -->
            <div v-if="step.number < 3" class="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 z-10">
              <UIcon name="i-lucide-chevron-right" class="w-5 h-5 text-[#45474D]/30 dark:text-white/30" />
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Trigger Types -->
    <section class="py-20 md:py-32 bg-[#f4f5f7] dark:bg-[#121317]">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="flex items-center gap-3 mb-10">
          <div class="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-500/[0.12] flex items-center justify-center">
            <UIcon name="i-lucide-play" class="w-5 h-5 text-amber-700 dark:text-amber-400" />
          </div>
          <div>
            <h2 class="text-[clamp(24px,3vw,32px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em]">Trigger Types</h2>
            <p class="text-[14px] text-[#45474D]/70 dark:text-white/40">Events that kick off your automations</p>
          </div>
        </div>
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <div
            v-for="trigger in triggers"
            :key="trigger.title"
            class="rounded-2xl bg-white dark:bg-white/[0.03] p-5 flex flex-col gap-4 group hover:bg-white/80 dark:hover:bg-white/[0.05] transition-colors"
          >
            <div class="w-11 h-11 rounded-xl bg-[#f4f5f7] dark:bg-white/[0.06] flex items-center justify-center">
              <UIcon :name="trigger.icon" class="w-5 h-5 text-[#121317] dark:text-white" />
            </div>
            <div>
              <h3 class="text-[16px] font-medium text-[#121317] dark:text-white mb-1.5">{{ trigger.title }}</h3>
              <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">{{ trigger.description }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Action Types -->
    <section class="py-20 md:py-32">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="flex items-center gap-3 mb-10">
          <div class="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-500/[0.12] flex items-center justify-center">
            <UIcon name="i-lucide-sparkles" class="w-5 h-5 text-amber-700 dark:text-amber-400" />
          </div>
          <div>
            <h2 class="text-[clamp(24px,3vw,32px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em]">Action Types</h2>
            <p class="text-[14px] text-[#45474D]/70 dark:text-white/40">What happens when a trigger fires</p>
          </div>
        </div>
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <div
            v-for="action in actions"
            :key="action.title"
            class="rounded-2xl bg-[#f4f5f7] dark:bg-white/[0.03] p-5 flex flex-col gap-4 group hover:bg-[#eef0f3] dark:hover:bg-white/[0.05] transition-colors"
          >
            <div class="w-11 h-11 rounded-xl bg-white dark:bg-white/[0.06] flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <UIcon :name="action.icon" class="w-5 h-5 text-[#121317] dark:text-white" />
            </div>
            <div>
              <h3 class="text-[16px] font-medium text-[#121317] dark:text-white mb-1.5">{{ action.title }}</h3>
              <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">{{ action.description }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Email Integration -->
    <section class="py-20 md:py-32 bg-[#f4f5f7] dark:bg-[#121317]">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="grid md:grid-cols-2 gap-12 md:gap-16 items-center">
          <div>
            <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100 dark:bg-amber-500/[0.12] mb-6">
              <UIcon name="i-lucide-mail" class="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
              <span class="text-[13px] text-amber-700 dark:text-amber-400 font-medium">Email Engine</span>
            </div>
            <h2 class="text-[clamp(24px,3vw,36px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4 leading-[1.15]">
              Resend-powered transactional email
            </h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-6">
              Send automated emails when automations fire. Use HTML templates with dynamic variables pulled from board data, client details, and task fields. Subscribe team members to board-level email digests.
            </p>
            <p class="text-[14px] text-[#45474D]/60 dark:text-white/40 leading-relaxed">
              Every email is sent through Resend with delivery tracking, so you always know what was sent and when it arrived.
            </p>
          </div>
          <div class="flex flex-col gap-4">
            <div
              v-for="feature in emailFeatures"
              :key="feature.title"
              class="rounded-2xl bg-white dark:bg-white/[0.03] p-5 flex items-center gap-4"
            >
              <div class="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/[0.1] flex items-center justify-center flex-shrink-0">
                <UIcon :name="feature.icon" class="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h3 class="text-[15px] font-medium text-[#121317] dark:text-white">{{ feature.title }}</h3>
                <p class="text-[13px] text-[#45474D]/60 dark:text-white/40 leading-relaxed">{{ feature.description }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Board Event Bridge -->
    <section class="py-20 md:py-32">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="max-w-[720px] mx-auto text-center">
          <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100 dark:bg-amber-500/[0.12] mb-6">
            <UIcon name="i-lucide-radio" class="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
            <span class="text-[13px] text-amber-700 dark:text-amber-400 font-medium">Board Event Bridge</span>
          </div>
          <h2 class="text-[clamp(24px,3vw,36px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4 leading-[1.15]">
            Real-time board events fire automations automatically
          </h2>
          <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-10">
            Every task change, status update, and column modification emits a real-time event. Automations listen to these events and execute instantly — no polling, no delays.
          </p>
          <div class="grid sm:grid-cols-3 gap-5">
            <div
              v-for="event in boardEvents"
              :key="event.title"
              class="rounded-2xl bg-[#f4f5f7] dark:bg-white/[0.03] p-5 text-center"
            >
              <div class="w-11 h-11 rounded-xl bg-white dark:bg-white/[0.06] flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.04)] mx-auto mb-3">
                <UIcon :name="event.icon" class="w-5 h-5 text-[#121317] dark:text-white" />
              </div>
              <h3 class="text-[15px] font-medium text-[#121317] dark:text-white mb-1">{{ event.title }}</h3>
              <p class="text-[13px] text-[#45474D]/60 dark:text-white/40 leading-relaxed">{{ event.description }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="py-10 md:py-16">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="rounded-[2rem] bg-[#0a0b0e] py-24 md:py-32 text-center px-6">
          <h2 class="text-[clamp(28px,4vw,48px)] font-[450] text-white leading-[1.15] tracking-[-0.02em] mb-10">
            Put your workflows on autopilot
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

const steps = [
  {
    number: 1,
    title: 'Choose a Trigger',
    description: 'Pick the event that starts your automation — a status change, approaching due date, new assignment, or any column update.',
    icon: 'i-lucide-play'
  },
  {
    number: 2,
    title: 'Set Conditions',
    description: 'Add filters to narrow when the automation fires. Match specific column values, boards, groups, or assignees.',
    icon: 'i-lucide-filter'
  },
  {
    number: 3,
    title: 'Define the Action',
    description: 'Choose what happens — send a notification, fire an email, update a column, create a task, or post to chat.',
    icon: 'i-lucide-zap'
  }
]

const triggers = [
  {
    title: 'Status Changed',
    description: 'Fires when any status column transitions to a new value.',
    icon: 'i-lucide-arrow-right-left'
  },
  {
    title: 'Due Date Approaching',
    description: 'Triggers at a configurable interval before a task deadline.',
    icon: 'i-lucide-clock'
  },
  {
    title: 'Item Created',
    description: 'Runs when a new task or subtask is added to a board.',
    icon: 'i-lucide-plus-circle'
  },
  {
    title: 'Item Assigned',
    description: 'Fires when a person column is updated with a new assignee.',
    icon: 'i-lucide-user-plus'
  },
  {
    title: 'Column Updated',
    description: 'Triggers on any change to a specific column across all items.',
    icon: 'i-lucide-columns-3'
  },
  {
    title: 'Custom Webhook',
    description: 'Accept incoming HTTP requests from external services as triggers.',
    icon: 'i-lucide-webhook'
  }
]

const actions = [
  {
    title: 'Send Notification',
    description: 'Push an in-app notification to specific users or entire teams.',
    icon: 'i-lucide-bell'
  },
  {
    title: 'Send Email',
    description: 'Dispatch a templated email via Resend with dynamic variables.',
    icon: 'i-lucide-mail'
  },
  {
    title: 'Update Column',
    description: 'Automatically set a column value — status, date, number, or text.',
    icon: 'i-lucide-pen-line'
  },
  {
    title: 'Create Task',
    description: 'Spin up a new task in any board with pre-filled column values.',
    icon: 'i-lucide-list-plus'
  },
  {
    title: 'Post to Chat',
    description: 'Send a message to a channel or board-linked chat room.',
    icon: 'i-lucide-message-square'
  },
  {
    title: 'Move to Group',
    description: 'Relocate the task to a different group within the same board.',
    icon: 'i-lucide-move'
  }
]

const emailFeatures = [
  {
    title: 'HTML Templates',
    description: 'Design rich email layouts with your agency branding.',
    icon: 'i-lucide-code'
  },
  {
    title: 'Dynamic Variables',
    description: 'Inject task names, client details, dates, and column values.',
    icon: 'i-lucide-braces'
  },
  {
    title: 'Board Subscriptions',
    description: 'Subscribe users to daily or weekly board digest emails.',
    icon: 'i-lucide-rss'
  },
  {
    title: 'Delivery Tracking',
    description: 'Monitor sent, delivered, and bounced status for every email.',
    icon: 'i-lucide-check-check'
  }
]

const boardEvents = [
  {
    title: 'Task Changes',
    description: 'Created, updated, deleted, or moved between groups.',
    icon: 'i-lucide-file-edit'
  },
  {
    title: 'Status Updates',
    description: 'Any status column transition across all board items.',
    icon: 'i-lucide-toggle-right'
  },
  {
    title: 'Column Modifications',
    description: 'Value changes on any of the 20+ supported column types.',
    icon: 'i-lucide-table-2'
  }
]
</script>
