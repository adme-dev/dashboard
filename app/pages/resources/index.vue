<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e]">
    <MarketingNav active="resources" />

    <!-- Hero -->
    <section class="pt-[52px]">
      <div class="max-w-[1200px] mx-auto px-6 pt-32 pb-16 md:pt-44 md:pb-24 text-center">
        <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#121317]/[0.04] dark:bg-white/[0.06] mb-8">
          <div class="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span class="text-[13px] text-[#45474D] dark:text-white/60 font-medium">Learn & grow</span>
        </div>
        <h1 class="text-[clamp(36px,6vw,64px)] font-[450] text-[#121317] dark:text-white leading-[1.1] tracking-[-0.03em] mb-6 max-w-[800px] mx-auto">
          Resources for your<br class="hidden sm:block">agency team
        </h1>
        <p class="text-lg md:text-xl text-[#45474D] dark:text-white/60 max-w-[560px] mx-auto leading-relaxed">
          Guides, documentation, and best practices to get the most out of XeroFlow.
        </p>
      </div>
    </section>

    <!-- Resource Categories -->
    <section class="pb-20 md:pb-32">
      <div class="max-w-[1200px] mx-auto px-6">

        <!-- Getting Started -->
        <div class="mb-20">
          <h2 class="text-[clamp(24px,3vw,32px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-8">Getting Started</h2>
          <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <NuxtLink
              v-for="guide in gettingStarted"
              :key="guide.title"
              :to="guide.to"
              class="rounded-2xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-6 flex flex-col gap-4 hover:border-[#121317]/15 hover:bg-[#f4f5f7]/50 dark:hover:bg-white/[0.03] transition-all cursor-pointer group"
            >
              <div class="w-11 h-11 rounded-xl flex items-center justify-center" :class="guide.bg">
                <UIcon :name="guide.icon" class="w-5 h-5" :class="guide.color" />
              </div>
              <div>
                <h3 class="text-[16px] font-medium text-[#121317] dark:text-white mb-1.5">{{ guide.title }}</h3>
                <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">{{ guide.description }}</p>
              </div>
              <div class="flex items-center gap-1.5 text-[13px] text-[#121317]/50 dark:text-white/40 group-hover:text-[#121317] dark:group-hover:text-white transition-colors mt-auto">
                <span>Read guide</span>
                <UIcon name="i-lucide-arrow-right" class="w-3 h-3" />
              </div>
            </NuxtLink>
          </div>
        </div>

        <!-- Platform Guides -->
        <div class="mb-20">
          <h2 class="text-[clamp(24px,3vw,32px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-8">Platform Guides</h2>
          <div class="grid sm:grid-cols-2 gap-5">
            <NuxtLink
              v-for="guide in platformGuides"
              :key="guide.title"
              :to="guide.to"
              class="rounded-2xl bg-[#f4f5f7] dark:bg-white/[0.03] p-6 md:p-8 flex gap-5 hover:bg-[#eef0f3] dark:hover:bg-white/[0.05] transition-colors cursor-pointer group"
            >
              <div class="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" :class="guide.bg">
                <UIcon :name="guide.icon" class="w-6 h-6" :class="guide.color" />
              </div>
              <div class="flex-1">
                <h3 class="text-[18px] font-medium text-[#121317] dark:text-white mb-1.5">{{ guide.title }}</h3>
                <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed mb-3">{{ guide.description }}</p>
                <div class="flex items-center gap-4">
                  <span
                    v-for="tag in guide.tags"
                    :key="tag"
                    class="text-[12px] text-[#45474D]/50 dark:text-white/40 px-2.5 py-1 rounded-full bg-white dark:bg-white/[0.06]"
                  >{{ tag }}</span>
                </div>
              </div>
            </NuxtLink>
          </div>
        </div>

        <!-- Integration Docs -->
        <div class="mb-20">
          <h2 class="text-[clamp(24px,3vw,32px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-8">Integrations</h2>
          <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <NuxtLink
              v-for="integration in integrations"
              :key="integration.title"
              :to="integration.to"
              class="rounded-2xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-5 flex flex-col items-center text-center gap-3 hover:border-[#121317]/15 dark:hover:border-white/15 transition-colors cursor-pointer"
            >
              <div class="w-12 h-12 rounded-xl bg-[#f4f5f7] dark:bg-white/[0.06] flex items-center justify-center">
                <UIcon :name="integration.icon" class="w-6 h-6 text-[#121317] dark:text-white" />
              </div>
              <div>
                <h3 class="text-[15px] font-medium text-[#121317] dark:text-white mb-0.5">{{ integration.title }}</h3>
                <p class="text-[12px] text-[#45474D]/60 dark:text-white/40">{{ integration.status }}</p>
              </div>
            </NuxtLink>
          </div>
        </div>

        <!-- Support -->
        <div class="rounded-3xl bg-[#f4f5f7] dark:bg-white/[0.03] p-8 md:p-12 flex flex-col md:flex-row items-center gap-8">
          <div class="flex-1">
            <h2 class="text-[clamp(24px,3vw,32px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-3">Need help?</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed max-w-[440px]">
              Our support team is available to help you get set up, troubleshoot issues, or answer questions about XeroFlow.
            </p>
          </div>
          <div class="flex gap-3">
            <a href="mailto:support@xeroflow.io" class="inline-flex items-center gap-2 px-5 py-2.5 bg-[#121317] dark:bg-white text-white dark:text-[#121317] text-[14px] font-medium rounded-full hover:bg-[#2a2b30] dark:hover:bg-white/90 transition-colors">
              <UIcon name="i-lucide-mail" class="w-4 h-4" />
              Email Support
            </a>
            <NuxtLink to="/support" class="inline-flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-white/10 text-[#121317] dark:text-white text-[14px] font-medium rounded-full hover:bg-white/80 dark:hover:bg-white/15 transition-colors border border-[#121317]/10 dark:border-white/10">
              <UIcon name="i-lucide-message-circle" class="w-4 h-4" />
              Live Chat
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

useSeoMeta({
  title: 'Resources — XeroFlow',
  description: 'Guides, tutorials, and documentation for XeroFlow. Get started quickly, learn platform features, and explore integrations.',
  ogTitle: 'Resources — XeroFlow',
  ogDescription: 'Guides, tutorials, and documentation for XeroFlow. Get started quickly, learn platform features, and explore integrations.',
})

const gettingStarted = [
  {
    title: 'Quick Start Guide',
    description: 'Get your agency up and running in under 10 minutes. Create your first board, invite your team, and connect Xero.',
    icon: 'i-lucide-rocket',
    bg: 'bg-emerald-50 dark:bg-emerald-500/10',
    color: 'text-emerald-600 dark:text-emerald-400',
    to: '/resources/quick-start'
  },
  {
    title: 'Board Basics',
    description: 'Learn how to create boards, add columns, group tasks, and switch between Kanban, timeline, and calendar views.',
    icon: 'i-lucide-kanban',
    bg: 'bg-blue-50 dark:bg-blue-500/10',
    color: 'text-blue-600 dark:text-blue-400',
    to: '/resources/board-basics'
  },
  {
    title: 'Inviting Your Team',
    description: 'Add team members, set roles and permissions, and configure workspace access levels.',
    icon: 'i-lucide-users',
    bg: 'bg-violet-50 dark:bg-violet-500/10',
    color: 'text-violet-600 dark:text-violet-400',
    to: '/resources/inviting-team'
  },
  {
    title: 'Setting Up Clients',
    description: 'Create client records, link Xero contacts, configure portal access, and set up billing.',
    icon: 'i-lucide-building-2',
    bg: 'bg-amber-50 dark:bg-amber-500/10',
    color: 'text-amber-600 dark:text-amber-400',
    to: '/resources/setting-up-clients'
  },
  {
    title: 'Connecting Xero',
    description: 'OAuth setup, chart of accounts sync, invoice import, and two-way data flow configuration.',
    icon: 'i-lucide-link',
    bg: 'bg-teal-50 dark:bg-teal-500/10',
    color: 'text-teal-600 dark:text-teal-400',
    to: '/resources/connecting-xero'
  },
  {
    title: 'Your First Automation',
    description: 'Create trigger-action recipes to auto-notify on status changes, due dates, and assignments.',
    icon: 'i-lucide-zap',
    bg: 'bg-rose-50 dark:bg-rose-500/10',
    color: 'text-rose-600 dark:text-rose-400',
    to: '/resources/first-automation'
  },
]

const platformGuides = [
  {
    title: 'Work Management Deep Dive',
    description: 'Master boards, columns, formulas, subtasks, templates, and real-time collaboration features.',
    icon: 'i-lucide-kanban',
    bg: 'bg-blue-100 dark:bg-blue-500/15',
    color: 'text-blue-700 dark:text-blue-400',
    tags: ['Boards', 'Views', 'Columns'],
    to: '/resources/work-management'
  },
  {
    title: 'Financial Operations',
    description: 'Complete guide to Xero sync, EOM invoicing, ad spend tracking, P&L dashboards, and budget management.',
    icon: 'i-lucide-calculator',
    bg: 'bg-emerald-100 dark:bg-emerald-500/15',
    color: 'text-emerald-700 dark:text-emerald-400',
    tags: ['Xero', 'Invoicing', 'Ad Spend'],
    to: '/resources/financial-operations'
  },
  {
    title: 'AI & Automation',
    description: 'Using AI chat, @mentions, anomaly detection, semantic search, and building automation recipes.',
    icon: 'i-lucide-brain',
    bg: 'bg-amber-100 dark:bg-amber-500/15',
    color: 'text-amber-700 dark:text-amber-400',
    tags: ['AI Chat', 'Search', 'Automations'],
    to: '/resources/ai-automation'
  },
  {
    title: 'Client Portal Administration',
    description: 'Setting up client logins, configuring permissions, managing approvals, and customizing the portal experience.',
    icon: 'i-lucide-briefcase',
    bg: 'bg-rose-100 dark:bg-rose-500/15',
    color: 'text-rose-700 dark:text-rose-400',
    tags: ['Portal', 'Approvals', 'Permissions'],
    to: '/resources/client-portal-admin'
  },
  {
    title: 'Bulk Ad Launch Guide',
    description: 'Launch ads at scale — select creatives from Banner Studio, configure campaigns, write ad copy, and publish to Meta in bulk.',
    icon: 'i-lucide-rocket',
    bg: 'bg-rose-100 dark:bg-rose-500/15',
    color: 'text-rose-700 dark:text-rose-400',
    tags: ['Meta Ads', 'Creatives', 'Bulk Upload'],
    to: '/resources/bulk-ad-launch'
  },
  {
    title: 'Ad Platform Export Guide',
    description: 'Export HTML5 banners for 14 ad platforms with automatic clickTag injection, file size validation, and compliant ZIP download.',
    icon: 'i-lucide-download',
    bg: 'bg-violet-100 dark:bg-violet-500/15',
    color: 'text-violet-700 dark:text-violet-400',
    tags: ['HTML5', 'ClickTag', '14 Platforms'],
    to: '/resources/ad-platform-export'
  },
  {
    title: 'Roles & Permissions',
    description: 'Configure team access levels with 15 built-in roles, create custom roles, and understand 3-layer RBAC enforcement.',
    icon: 'i-lucide-shield',
    bg: 'bg-slate-100 dark:bg-slate-500/15',
    color: 'text-slate-700 dark:text-slate-400',
    tags: ['RBAC', 'Roles', 'Security'],
    to: '/resources/roles-permissions'
  },
  {
    title: 'Briefs & Proposals',
    description: 'Templates with 30+ field types, AI-powered scoring and generation, brief-to-quote pipeline, and analytics.',
    icon: 'i-lucide-file-text',
    bg: 'bg-orange-100 dark:bg-orange-500/15',
    color: 'text-orange-700 dark:text-orange-400',
    tags: ['Templates', 'AI Tools', 'Quotes'],
    to: '/resources/briefs-proposals'
  },
  {
    title: 'Time Tracking & Timesheets',
    description: 'Log time against tasks and projects, submit weekly timesheets for approval, and manage team utilisation.',
    icon: 'i-lucide-timer',
    bg: 'bg-cyan-100 dark:bg-cyan-500/15',
    color: 'text-cyan-700 dark:text-cyan-400',
    tags: ['Timesheets', 'Approvals', 'Tasks'],
    to: '/resources/time-tracking'
  },
]

const integrations = [
  { title: 'Xero', icon: 'i-lucide-calculator', status: 'Full sync', to: '/resources/integrations#xero' },
  { title: 'Meta Ads', icon: 'i-lucide-megaphone', status: 'OAuth connected', to: '/resources/integrations#meta-ads' },
  { title: 'Google Ads', icon: 'i-lucide-bar-chart-3', status: 'REST API', to: '/resources/integrations#google-ads' },
  { title: 'Resend', icon: 'i-lucide-mail', status: 'Transactional email', to: '/resources/integrations#resend' },
  { title: 'Cloudflare', icon: 'i-lucide-cloud', status: 'Full platform', to: '/resources/integrations#cloudflare' },
  { title: 'Monday.com', icon: 'i-lucide-kanban', status: 'Import', to: '/resources/integrations#monday' },
  { title: 'Groq', icon: 'i-lucide-brain', status: 'LLM inference', to: '/resources/integrations#groq' },
  { title: 'Vectorize', icon: 'i-lucide-search', status: 'Semantic search', to: '/resources/integrations#vectorize' },
]
</script>
