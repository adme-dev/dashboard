<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e]">
    <MarketingNav active="features" />

    <!-- Hero -->
    <section class="relative bg-[#0a0b0e] pt-[52px]">
      <MarketingHeroBackground theme="features" />
      <div class="relative max-w-[1200px] mx-auto px-6 pt-32 pb-16 md:pt-44 md:pb-24 text-center">
        <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.06] mb-8">
          <div class="w-1.5 h-1.5 rounded-full bg-blue-400" />
          <span class="text-[13px] text-white/60 font-medium">Everything you need</span>
        </div>
        <h1 class="text-[clamp(36px,6vw,64px)] font-[450] text-white leading-[1.1] tracking-[-0.03em] mb-6 max-w-[800px] mx-auto">
          One platform for<br class="hidden sm:block">your entire agency
        </h1>
        <p class="text-lg md:text-xl text-white/50 max-w-[560px] mx-auto leading-relaxed">
          From boards and briefs to invoices and AI — every tool your team needs, connected.
        </p>
      </div>
    </section>

    <!-- Feature Categories -->
    <section class="pb-20 md:pb-32">
      <div class="max-w-[1200px] mx-auto px-6">
        <div
          v-for="(category, ci) in categories"
          :key="category.title"
          class="mb-24 last:mb-0"
        >
          <!-- Category header -->
          <div class="flex items-center gap-3 mb-10">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center" :class="category.iconBg">
              <UIcon :name="category.icon" class="w-5 h-5" :class="category.iconColor" />
            </div>
            <div>
              <h2 class="text-[clamp(24px,3vw,32px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em]">{{ category.title }}</h2>
              <p class="text-[14px] text-[#45474D]/70 dark:text-white/40">{{ category.subtitle }}</p>
            </div>
          </div>

          <!-- Feature grid -->
          <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <NuxtLink
              v-for="feature in category.features"
              :key="feature.title"
              :to="`/features/${feature.slug}`"
              class="rounded-2xl bg-[#f4f5f7] dark:bg-white/[0.03] p-6 flex flex-col gap-4 group hover:bg-[#eef0f3] dark:hover:bg-white/[0.06] transition-colors"
            >
              <div class="w-11 h-11 rounded-xl bg-white dark:bg-white/[0.06] flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:shadow-none">
                <UIcon :name="feature.icon" class="w-5 h-5 text-[#121317] dark:text-white" />
              </div>
              <div>
                <h3 class="text-[16px] font-medium text-[#121317] dark:text-white mb-1.5">{{ feature.title }}</h3>
                <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">{{ feature.description }}</p>
              </div>
            </NuxtLink>
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
  title: 'Features — XeroFlow',
  description: 'Explore 37+ features across work management, financial operations, communication, AI intelligence, client portal, and time tracking.',
  ogTitle: 'Features — XeroFlow',
  ogDescription: 'Explore 37+ features across work management, financial operations, communication, AI intelligence, client portal, and time tracking.',
})

const categories = [
  {
    title: 'Work Management',
    subtitle: 'Boards, tasks, and workflows',
    icon: 'i-lucide-kanban',
    iconBg: 'bg-blue-50 dark:bg-blue-500/10',
    iconColor: 'text-blue-600',
    features: [
      { title: 'Boards', slug: 'boards', icon: 'i-lucide-kanban', description: 'Monday-style boards with 20+ column types — status, people, date, numbers, formulas, and more.' },
      { title: 'Kanban View', slug: 'kanban-view', icon: 'i-lucide-columns-3', description: 'Drag-and-drop Kanban boards grouped by any status column with real-time updates.' },
      { title: 'Timeline View', slug: 'timeline-view', icon: 'i-lucide-gantt-chart', description: 'Gantt-style timeline with date range bars, drag-to-reschedule, and dependency tracking.' },
      { title: 'Calendar View', slug: 'calendar-view', icon: 'i-lucide-calendar', description: 'Monthly calendar with task cards, drag-to-reschedule, and date-based filtering.' },
      { title: 'Gallery View', slug: 'gallery-view', icon: 'i-lucide-layout-grid', description: 'Visual grid of tasks with file previews — perfect for creative review workflows.' },
      { title: 'Groups & Subtasks', slug: 'groups-subtasks', icon: 'i-lucide-list-tree', description: 'Organize tasks into collapsible groups with nested subtasks for complex projects.' },
      { title: 'Templates', slug: 'templates', icon: 'i-lucide-copy', description: 'Save board configurations as templates. Spin up new projects in seconds.' },
      { title: 'Real-Time SSE', slug: 'real-time-sse', icon: 'i-lucide-radio', description: 'Live updates via Server-Sent Events — see changes from teammates instantly.' },
      { title: 'Table View', slug: 'table-view', icon: 'i-lucide-table', description: 'Spreadsheet-style table with sortable columns, inline editing, and bulk actions.' },
    ]
  },
  {
    title: 'Financial Operations',
    subtitle: 'Invoicing, expenses, and ad spend',
    icon: 'i-lucide-calculator',
    iconBg: 'bg-emerald-50 dark:bg-emerald-500/10',
    iconColor: 'text-emerald-600',
    features: [
      { title: 'Xero Integration', slug: 'xero-integration', icon: 'i-lucide-link', description: 'Two-way sync with Xero for invoices, expenses, contacts, and chart of accounts.' },
      { title: 'EOM Engine', slug: 'eom-engine', icon: 'i-lucide-file-spreadsheet', description: 'End-of-month invoice generation with configurable line items, tax, and auto-upload to Xero.' },
      { title: 'Meta Ads Tracking', slug: 'meta-ads-tracking', icon: 'i-lucide-megaphone', description: 'OAuth-connected Meta Ads spend syncing with daily breakdowns and campaign-level budgets.' },
      { title: 'Google Ads Tracking', slug: 'google-ads-tracking', icon: 'i-lucide-bar-chart-3', description: 'Google Ads performance data with spend tracking, budget alerts, and audit trails.' },
      { title: 'Profit & Loss', slug: 'profit-loss', icon: 'i-lucide-trending-up', description: 'Real-time P&L dashboards with revenue, expenses, and margin analysis per client.' },
      { title: 'Budget Management', slug: 'budget-management', icon: 'i-lucide-wallet', description: 'Set monthly budgets per client and campaign. Get alerts when spend approaches limits.' },
    ]
  },
  {
    title: 'Communication & Creative',
    subtitle: 'Chat, notifications, email, and ad production',
    icon: 'i-lucide-message-circle',
    iconBg: 'bg-violet-50 dark:bg-violet-500/10',
    iconColor: 'text-violet-600',
    features: [
      { title: 'Real-Time Chat', slug: 'real-time-chat', icon: 'i-lucide-message-circle', description: 'Channels, DMs, group messages, threads, and file sharing — built on Durable Objects.' },
      { title: 'Board-Linked Channels', slug: 'board-linked-channels', icon: 'i-lucide-link-2', description: 'Auto-created channels for boards and tasks. Board events post directly to chat.' },
      { title: 'Rich Messages', slug: 'rich-messages', icon: 'i-lucide-image', description: 'File attachments, emoji reactions, message pinning, quoting, and forwarding.' },
      { title: 'Read Receipts', slug: 'read-receipts', icon: 'i-lucide-check-check', description: 'See who has read your messages with avatar indicators and reader lists.' },
      { title: 'Email Templates', slug: 'email-templates', icon: 'i-lucide-mail', description: 'Resend-powered email templates for notifications, invites, and client communications.' },
      { title: 'Automations', slug: 'automations', icon: 'i-lucide-zap', description: 'Trigger → action recipes. Auto-notify on status changes, assignments, and due dates.' },
      { title: 'Bulk Ad Launch', slug: 'bulk-ad-launch', icon: 'i-lucide-rocket', description: 'Select creatives from Banner Studio and launch dozens of ads to Meta in one click.' },
    ]
  },
  {
    title: 'AI & Intelligence',
    subtitle: 'Chat, analysis, and recommendations',
    icon: 'i-lucide-brain',
    iconBg: 'bg-amber-50 dark:bg-amber-500/10',
    iconColor: 'text-amber-600',
    features: [
      { title: 'AI Chat', slug: 'ai-chat', icon: 'i-lucide-bot', description: 'Groq-powered conversational AI with @entity mentions for clients, tasks, and projects.' },
      { title: 'Anomaly Detection', slug: 'anomaly-detection', icon: 'i-lucide-alert-triangle', description: '8 specialized analyzers that proactively flag spend anomalies, deadline risks, and budget issues.' },
      { title: 'Semantic Search', slug: 'semantic-search', icon: 'i-lucide-search', description: 'Vectorize-powered search across tasks, clients, briefs, and knowledge base entries.' },
      { title: 'Intent Classification', slug: 'intent-classification', icon: 'i-lucide-target', description: 'Edge-first intent classifier routes queries to the right data sources automatically.' },
      { title: 'AI Reports', slug: 'ai-reports', icon: 'i-lucide-file-text', description: 'Auto-generated reports with insights, trends, and recommendations for your agency.' },
      { title: 'LoRA Adapters', slug: 'lora-adapters', icon: 'i-lucide-cpu', description: 'Fine-tune AI models with your agency data. Custom adapters with traffic routing and A/B testing.' },
    ]
  },
  {
    title: 'Client Portal',
    subtitle: 'External access for your clients',
    icon: 'i-lucide-briefcase',
    iconBg: 'bg-rose-50 dark:bg-rose-500/10',
    iconColor: 'text-rose-600',
    features: [
      { title: 'Dedicated Login', slug: 'dedicated-login', icon: 'i-lucide-lock', description: 'Separate cookie-based auth system. Clients get their own login, scoped to their data.' },
      { title: 'Project Visibility', slug: 'project-visibility', icon: 'i-lucide-folder-open', description: 'Clients see their projects, tasks, and progress — no internal data leaks.' },
      { title: 'Approval Workflows', slug: 'approval-workflows', icon: 'i-lucide-check-circle', description: 'Upload deliverables for client review. Approve, revise, or comment — all tracked.' },
      { title: 'Invoice Access', slug: 'invoice-access', icon: 'i-lucide-receipt', description: 'Permission-gated invoice viewing so clients can check billing without emails.' },
      { title: 'Creative Gallery', slug: 'creative-gallery', icon: 'i-lucide-image', description: 'Browse all delivered assets in a visual gallery with download and preview.' },
      { title: 'Notifications', slug: 'notifications', icon: 'i-lucide-bell', description: 'Clients get notified when new deliverables, invoices, or updates are ready.' },
    ]
  },
  {
    title: 'Time & Capacity',
    subtitle: 'Tracking, timesheets, and utilization',
    icon: 'i-lucide-timer',
    iconBg: 'bg-indigo-50 dark:bg-indigo-500/10',
    iconColor: 'text-indigo-600',
    features: [
      { title: 'Time Tracking', slug: 'time-tracking', icon: 'i-lucide-clock', description: 'Log time against projects and tasks. Start/stop timers or enter manually.' },
      { title: 'Weekly Timesheets', slug: 'weekly-timesheets', icon: 'i-lucide-calendar-days', description: 'Weekly grid view with submit, approval, and rejection workflows.' },
      { title: 'Manager Approvals', slug: 'manager-approvals', icon: 'i-lucide-shield-check', description: 'Review and approve team timesheets. Bulk approve, reject with reason, and lock entries.' },
      { title: 'Task-Level Logging', slug: 'task-level-logging', icon: 'i-lucide-list-checks', description: 'Link time entries to specific tasks. See time spent per task with progress bars.' },
    ]
  },
]
</script>
