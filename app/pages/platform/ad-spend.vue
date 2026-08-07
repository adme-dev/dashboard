<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e]">
    <MarketingNav active="features" />

    <!-- Hero -->
    <section class="relative bg-[#0a0b0e] pt-[52px]">
      <MarketingHeroBackground theme="ad-spend" />
      <div class="relative max-w-[1200px] mx-auto px-6 pt-32 pb-16 md:pt-44 md:pb-24 text-center">
        <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/[0.12] mb-8">
          <div class="w-1.5 h-1.5 rounded-full bg-blue-400" />
          <span class="text-[13px] text-blue-400 font-medium">Ad Spend</span>
        </div>
        <h1 class="text-[clamp(36px,6vw,64px)] font-[450] text-white leading-[1.1] tracking-[-0.03em] mb-6 max-w-[800px] mx-auto">
          Track every dollar<br class="hidden sm:block">across platforms
        </h1>
        <p class="text-lg md:text-xl text-white/50 max-w-[560px] mx-auto leading-relaxed">
          Meta, Google, TikTok, LinkedIn, Pinterest, Snapchat, X, and Microsoft — all in one place. OAuth connections, automated spend syncing, campaign breakdowns, and budget management with full audit trails.
        </p>
      </div>
    </section>

    <!-- Platform Cards -->
    <section class="pb-12 md:pb-16">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="grid md:grid-cols-3 gap-6">
          <!-- Meta Ads -->
          <div class="bg-[#f4f5f7] dark:bg-white/[0.03] rounded-2xl p-6 md:p-8">
            <div class="flex items-center gap-3 mb-6">
              <div class="w-11 h-11 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <UIcon name="i-lucide-facebook" class="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 class="text-[18px] font-medium text-[#121317] dark:text-white">Meta Ads</h3>
                <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Facebook & Instagram</p>
              </div>
            </div>
            <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed mb-6">
              Connect via OAuth and pull spend data automatically. Daily and campaign-level breakdowns with performance metrics your team actually uses.
            </p>
            <div class="flex flex-col gap-3">
              <div v-for="feature in metaFeatures" :key="feature" class="flex items-center gap-3">
                <div class="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
                  <UIcon name="i-lucide-check" class="w-3 h-3 text-blue-600 dark:text-blue-400" />
                </div>
                <span class="text-[14px] text-[#121317] dark:text-white">{{ feature }}</span>
              </div>
            </div>
          </div>

          <!-- Google Ads -->
          <div class="bg-[#f4f5f7] dark:bg-white/[0.03] rounded-2xl p-6 md:p-8">
            <div class="flex items-center gap-3 mb-6">
              <div class="w-11 h-11 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <UIcon name="i-lucide-chrome" class="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 class="text-[18px] font-medium text-[#121317] dark:text-white">Google Ads</h3>
                <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Search, Display & YouTube</p>
              </div>
            </div>
            <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed mb-6">
              REST API integration for real-time spend tracking. Campaign-level data, keyword performance, and conversion metrics synced daily.
            </p>
            <div class="flex flex-col gap-3">
              <div v-for="feature in googleFeatures" :key="feature" class="flex items-center gap-3">
                <div class="w-5 h-5 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center flex-shrink-0">
                  <UIcon name="i-lucide-check" class="w-3 h-3 text-red-500 dark:text-red-400" />
                </div>
                <span class="text-[14px] text-[#121317] dark:text-white">{{ feature }}</span>
              </div>
            </div>
          </div>

          <!-- TikTok Ads -->
          <div class="bg-[#f4f5f7] dark:bg-white/[0.03] rounded-2xl p-6 md:p-8">
            <div class="flex items-center gap-3 mb-6">
              <div class="w-11 h-11 rounded-xl bg-gray-100 dark:bg-gray-900/30 flex items-center justify-center">
                <UIcon name="i-lucide-music" class="w-5 h-5 text-gray-700 dark:text-gray-300" />
              </div>
              <div>
                <h3 class="text-[18px] font-medium text-[#121317] dark:text-white">TikTok Ads</h3>
                <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Short-form video</p>
              </div>
            </div>
            <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed mb-6">
              TikTok Business API integration for advertiser-level spend tracking. Campaign breakdowns with video-first performance metrics.
            </p>
            <div class="flex flex-col gap-3">
              <div v-for="feature in tiktokFeatures" :key="feature" class="flex items-center gap-3">
                <div class="w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-800/40 flex items-center justify-center flex-shrink-0">
                  <UIcon name="i-lucide-check" class="w-3 h-3 text-gray-600 dark:text-gray-400" />
                </div>
                <span class="text-[14px] text-[#121317] dark:text-white">{{ feature }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- More Platforms -->
    <section class="pb-20 md:pb-28">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="text-center mb-10">
          <h2 class="text-[clamp(22px,3vw,32px)] font-[450] text-[#121317] dark:text-white leading-[1.15] tracking-[-0.02em] mb-3">
            5 more platforms, fully integrated
          </h2>
          <p class="text-[15px] text-[#45474D] dark:text-white/60 max-w-[480px] mx-auto leading-relaxed">
            Every major ad platform connected with native OAuth integrations and automated daily syncing.
          </p>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <div
            v-for="p in morePlatforms"
            :key="p.name"
            class="flex flex-col items-center gap-3 rounded-2xl bg-[#f4f5f7] dark:bg-white/[0.03] p-5 text-center"
          >
            <div class="w-11 h-11 rounded-xl flex items-center justify-center" :class="p.bg">
              <UIcon :name="p.icon" class="w-5 h-5" :class="p.color" />
            </div>
            <div>
              <p class="text-[14px] font-medium text-[#121317] dark:text-white">{{ p.name }}</p>
              <p class="text-[12px] text-[#45474D]/60 dark:text-white/40 mt-0.5">{{ p.sub }}</p>
            </div>
          </div>
        </div>

        <!-- Universal Import Card -->
        <div class="bg-[#f4f5f7] dark:bg-white/[0.03] rounded-2xl p-6 md:p-8">
          <div class="flex flex-col md:flex-row md:items-center gap-6">
            <div class="flex items-center gap-3">
              <div class="w-11 h-11 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
                <UIcon name="i-lucide-file-spreadsheet" class="w-5 h-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <h3 class="text-[18px] font-medium text-[#121317] dark:text-white">Universal Import</h3>
                <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">CSV upload & manual entry</p>
              </div>
            </div>
            <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed flex-1">
              Import spend data from any platform via CSV bulk upload or manual single-entry form. Download a template, map columns, and track spend for platforms without a native integration.
            </p>
            <div class="flex flex-wrap gap-3">
              <div v-for="feat in importFeatures" :key="feat" class="flex items-center gap-2">
                <div class="w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center flex-shrink-0">
                  <UIcon name="i-lucide-check" class="w-3 h-3 text-violet-600 dark:text-violet-400" />
                </div>
                <span class="text-[13px] text-[#121317] dark:text-white">{{ feat }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- First-party Measurement -->
    <section
      id="measurement"
      aria-labelledby="measurement-title"
      class="scroll-mt-20 pb-20 md:pb-28"
    >
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="overflow-hidden rounded-[2rem] bg-[#0a0b0e] text-white border border-white/[0.08]">
          <div class="grid lg:grid-cols-[0.82fr_1.18fr]">
            <div class="p-7 sm:p-10 md:p-14 lg:p-16 border-b lg:border-b-0 lg:border-r border-white/[0.08]">
              <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-400/10 border border-emerald-300/15 mb-7">
                <UIcon name="i-lucide-activity" class="w-3.5 h-3.5 text-emerald-300" />
                <span class="text-[13px] font-medium text-emerald-200">First-party measurement</span>
              </div>

              <h2
                id="measurement-title"
                class="text-[clamp(30px,4.5vw,48px)] font-[450] leading-[1.08] tracking-[-0.03em] mb-5"
              >
                Measure outcomes, not just spend
              </h2>
              <p class="text-[16px] md:text-[17px] leading-relaxed text-white/65 mb-8">
                XeroFlow imports spend and performance data across connected platforms, then delivers only approved, consented conversion events to configured Google and Meta destinations.
              </p>

              <div class="flex items-start gap-3 rounded-xl bg-white/[0.04] border border-white/[0.08] p-4">
                <UIcon name="i-lucide-shield-check" class="w-5 h-5 text-emerald-300 flex-shrink-0 mt-0.5" />
                <p class="text-[13px] leading-relaxed text-white/60">
                  Reporting data and conversion delivery remain separate, governed flows for every client workspace.
                </p>
              </div>
            </div>

            <div class="relative p-7 sm:p-10 md:p-14 lg:p-16 bg-white/[0.025]">
              <div class="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
                <div class="absolute -top-24 -right-20 w-72 h-72 rounded-full bg-blue-400/[0.08] blur-3xl" />
                <div class="absolute -bottom-24 -left-20 w-72 h-72 rounded-full bg-emerald-400/[0.08] blur-3xl" />
              </div>

              <div class="relative">
                <ol class="grid md:grid-cols-3 gap-8 md:gap-8 items-stretch" aria-label="XeroFlow measurement data flow">
                  <li
                    v-for="(stage, index) in measurementFlow"
                    :key="stage.title"
                    class="relative rounded-2xl bg-white/[0.04] border border-white/[0.08] p-5"
                  >
                    <div class="w-10 h-10 rounded-xl flex items-center justify-center mb-5" :class="stage.iconBg">
                      <UIcon :name="stage.icon" class="w-5 h-5" :class="stage.iconColor" />
                    </div>
                    <p class="text-[11px] uppercase tracking-[0.14em] text-white/50 mb-2">
                      {{ stage.eyebrow }}
                    </p>
                    <h3 class="text-[15px] font-medium text-white mb-2">
                      {{ stage.title }}
                    </h3>
                    <p class="text-[12px] leading-relaxed text-white/60">
                      {{ stage.description }}
                    </p>

                    <UIcon
                      v-if="index < measurementFlow.length - 1"
                      name="i-lucide-arrow-down"
                      class="absolute -bottom-6 left-1/2 -translate-x-1/2 w-4 h-4 text-white/35 md:hidden"
                      aria-hidden="true"
                    />
                    <UIcon
                      v-if="index < measurementFlow.length - 1"
                      name="i-lucide-arrow-right"
                      class="hidden md:block absolute top-1/2 -right-6 -translate-y-1/2 w-4 h-4 text-white/35"
                      aria-hidden="true"
                    />
                  </li>
                </ol>

                <ul class="grid sm:grid-cols-2 gap-3 mt-6" aria-label="Measurement governance controls">
                  <li
                    v-for="control in measurementControls"
                    :key="control.title"
                    class="flex items-start gap-3 rounded-xl bg-white/[0.035] border border-white/[0.07] p-4"
                  >
                    <div class="w-8 h-8 rounded-lg bg-emerald-400/10 flex items-center justify-center flex-shrink-0">
                      <UIcon :name="control.icon" class="w-4 h-4 text-emerald-300" />
                    </div>
                    <div>
                      <h3 class="text-[13px] font-medium text-white mb-1">
                        {{ control.title }}
                      </h3>
                      <p class="text-[11px] leading-relaxed text-white/60">
                        {{ control.description }}
                      </p>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Unified Dashboard -->
    <section class="py-20 md:py-28 bg-[#f4f5f7] dark:bg-[#121317]">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="text-center mb-14">
          <h2 class="text-[clamp(28px,4vw,44px)] font-[450] text-[#121317] dark:text-white leading-[1.15] tracking-[-0.02em] mb-4">
            Unified spend dashboard
          </h2>
          <p class="text-[16px] text-[#45474D] dark:text-white/60 max-w-[520px] mx-auto leading-relaxed">
            Cross-platform aggregation so you see the full picture. Compare all platforms side by side, spot trends, and catch overruns before they happen.
          </p>
        </div>
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <div
            v-for="feature in dashboardFeatures"
            :key="feature.title"
            class="rounded-2xl bg-white dark:bg-white/[0.03] p-6 flex flex-col gap-4 group hover:shadow-[0_2px_12px_rgba(0,0,0,0.04)] dark:hover:shadow-[0_2px_12px_rgba(255,255,255,0.03)] transition-shadow"
          >
            <div class="w-11 h-11 rounded-xl bg-[#f4f5f7] dark:bg-white/[0.06] flex items-center justify-center">
              <UIcon :name="feature.icon" class="w-5 h-5 text-[#121317] dark:text-white" />
            </div>
            <div>
              <h3 class="text-[16px] font-medium text-[#121317] dark:text-white mb-1.5">{{ feature.title }}</h3>
              <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">{{ feature.description }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Budget Alerts -->
    <section class="py-20 md:py-28">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="grid md:grid-cols-2 gap-12 md:gap-16 items-center">
          <div>
            <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/[0.08] mb-6">
              <UIcon name="i-lucide-bell" class="w-3.5 h-3.5 text-amber-600" />
              <span class="text-[13px] text-amber-600 font-medium">Budget Alerts</span>
            </div>
            <h2 class="text-[clamp(28px,4vw,40px)] font-[450] text-[#121317] dark:text-white leading-[1.15] tracking-[-0.02em] mb-4">
              Set it once, stay informed always
            </h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-6">
              Configure monthly budgets per client and per campaign. Threshold alerts fire when spend crosses 75%, 90%, or 100% of the limit. Every change is logged in an immutable audit trail.
            </p>
            <p class="text-[14px] text-[#45474D]/60 dark:text-white/40 leading-relaxed">
              No more spreadsheets. No more end-of-month surprises. Your media buyers and account managers see the same numbers in real time.
            </p>
          </div>
          <div class="flex flex-col gap-4">
            <div
              v-for="alert in budgetAlerts"
              :key="alert.title"
              class="flex items-start gap-4 rounded-2xl bg-[#f4f5f7] dark:bg-white/[0.03] p-5"
            >
              <div class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" :class="alert.bg">
                <UIcon :name="alert.icon" class="w-4.5 h-4.5" :class="alert.color" />
              </div>
              <div>
                <h3 class="text-[15px] font-medium text-[#121317] dark:text-white mb-1">{{ alert.title }}</h3>
                <p class="text-[13px] text-[#45474D]/60 dark:text-white/40 leading-relaxed">{{ alert.description }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Anomaly Detection -->
    <section class="py-20 md:py-28 bg-[#f4f5f7] dark:bg-[#121317]">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="text-center mb-14">
          <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/[0.08] mb-6 mx-auto">
            <UIcon name="i-lucide-brain" class="w-3.5 h-3.5 text-violet-600" />
            <span class="text-[13px] text-violet-600 font-medium">AI-Powered</span>
          </div>
          <h2 class="text-[clamp(28px,4vw,44px)] font-[450] text-[#121317] dark:text-white leading-[1.15] tracking-[-0.02em] mb-4">
            Spend anomaly detection
          </h2>
          <p class="text-[16px] text-[#45474D] dark:text-white/60 max-w-[540px] mx-auto leading-relaxed">
            Proactive AI analyzers flag CPC spikes, budget overruns, and unusual spend patterns before they become problems. Alerts land in your dashboard, not buried in platform UIs.
          </p>
        </div>
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <div
            v-for="anomaly in anomalyTypes"
            :key="anomaly.title"
            class="rounded-2xl bg-white dark:bg-white/[0.03] p-6 flex flex-col gap-4"
          >
            <div class="w-11 h-11 rounded-xl flex items-center justify-center" :class="anomaly.bg">
              <UIcon :name="anomaly.icon" class="w-5 h-5" :class="anomaly.color" />
            </div>
            <div>
              <h3 class="text-[16px] font-medium text-[#121317] dark:text-white mb-1.5">{{ anomaly.title }}</h3>
              <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">{{ anomaly.description }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Dark CTA -->
    <section class="py-10 md:py-16">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="rounded-[2rem] bg-[#0a0b0e] py-24 md:py-32 text-center px-6">
          <h2 class="text-[clamp(28px,4vw,48px)] font-[450] text-white leading-[1.15] tracking-[-0.02em] mb-10">
            Never miss a budget<br class="hidden sm:block">issue again
          </h2>
          <NuxtLink
            to="/contact"
            class="inline-flex items-center gap-2 px-7 py-3.5 bg-white text-[#121317] text-[17.5px] font-medium rounded-full hover:bg-white/90 transition-colors"
          >
            Talk to us
          </NuxtLink>
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
  title: 'Ad Spend & First-Party Measurement | XeroFlow',
  description: 'Connect advertising accounts, unify spend reporting, and govern consent-gated server-side conversion delivery to Google and Meta with XeroFlow.',
  ogTitle: 'Ad Spend & First-Party Measurement | XeroFlow',
  ogDescription: 'Unify cross-platform spend with consent-gated first-party conversion measurement for Google and Meta.'
})

const metaFeatures = [
  'OAuth connection — one-click setup',
  'Daily spend syncing across all accounts',
  'Campaign-level breakdowns',
  'CPC, CPM, and ROAS metrics',
  'Ad set and ad-level granularity',
  'Historical data backfill',
]

const googleFeatures = [
  'REST API integration',
  'Spend tracking by campaign and ad group',
  'Campaign-level performance data',
  'Keyword performance metrics',
  'Conversion tracking and CPA',
  'Search, Display, and YouTube support',
]

const tiktokFeatures = [
  'OAuth connection via TikTok Business API',
  'Advertiser-level spend syncing',
  'Campaign-level breakdowns',
  'Video view and engagement metrics',
  'Campaign objective tracking',
]

const morePlatforms = [
  { name: 'LinkedIn', sub: 'B2B advertising', icon: 'i-lucide-linkedin', bg: 'bg-blue-50 dark:bg-blue-950', color: 'text-blue-600' },
  { name: 'Pinterest', sub: 'Visual discovery', icon: 'i-lucide-pin', bg: 'bg-red-50 dark:bg-red-950', color: 'text-red-600' },
  { name: 'Snapchat', sub: 'Snap & story ads', icon: 'i-lucide-ghost', bg: 'bg-yellow-50 dark:bg-yellow-950', color: 'text-yellow-600' },
  { name: 'X (Twitter)', sub: 'Promoted posts', icon: 'i-lucide-at-sign', bg: 'bg-gray-50 dark:bg-gray-950', color: 'text-gray-800 dark:text-gray-200' },
  { name: 'Microsoft', sub: 'Bing search ads', icon: 'i-lucide-search', bg: 'bg-cyan-50 dark:bg-cyan-950', color: 'text-cyan-600' },
]

const importFeatures = [
  'CSV bulk import',
  'Manual single entry',
  'Any platform',
  'Template download',
]

const measurementFlow = [
  {
    eyebrow: 'Reporting data in',
    title: 'Connected ad platforms',
    description: 'OAuth spend, campaign and performance data from every supported platform.',
    icon: 'i-lucide-panel-top-open',
    iconBg: 'bg-blue-400/10',
    iconColor: 'text-blue-300'
  },
  {
    eyebrow: 'Governed in XeroFlow',
    title: 'Client measurement policy',
    description: 'Consent, account mapping, destination validation and privacy approval.',
    icon: 'i-lucide-shield-check',
    iconBg: 'bg-amber-400/10',
    iconColor: 'text-amber-300'
  },
  {
    eyebrow: 'Approved signals out',
    title: 'Google & Meta delivery',
    description: 'Enhanced conversions and Conversions API events sent to configured destinations.',
    icon: 'i-lucide-send',
    iconBg: 'bg-emerald-400/10',
    iconColor: 'text-emerald-300'
  }
]

const measurementControls = [
  {
    title: 'Consent-aware collection',
    description: 'Only eligible first-party events enter the delivery pipeline.',
    icon: 'i-lucide-shield-check'
  },
  {
    title: 'Per-client destinations',
    description: 'Exact Google and Meta destinations are mapped for each client.',
    icon: 'i-lucide-route'
  },
  {
    title: 'Agency multi-account access',
    description: 'Separate provider identities and ad accounts stay clearly assigned.',
    icon: 'i-lucide-network'
  },
  {
    title: 'Approvals and evidence',
    description: 'Versioned configuration, validation evidence and auditable activation.',
    icon: 'i-lucide-file-check-2'
  }
]

const dashboardFeatures = [
  {
    title: 'Daily Breakdowns',
    icon: 'i-lucide-calendar-days',
    description: 'See spend by day across all platforms. Spot trends, dips, and spikes at a glance.'
  },
  {
    title: 'Campaign Comparison',
    icon: 'i-lucide-columns-3',
    description: 'Compare campaigns across all platforms side by side with unified metrics and terminology.'
  },
  {
    title: 'Budget vs Actual',
    icon: 'i-lucide-target',
    description: 'Set monthly budgets per client and campaign. Track actual spend against the plan in real time.'
  },
  {
    title: 'Spend Pacing',
    icon: 'i-lucide-gauge',
    description: 'Daily pacing indicators show whether spend is on track, under-delivering, or trending over budget.'
  },
  {
    title: 'Client Rollups',
    icon: 'i-lucide-building-2',
    description: 'Aggregate spend across all campaigns for a client. One number for total media investment.'
  },
  {
    title: 'Platform Performance',
    icon: 'i-lucide-bar-chart-3',
    description: 'Split performance by platform. See which delivers better CPC, CPM, and ROAS across Meta, Google, TikTok and more.'
  },
]

const budgetAlerts = [
  {
    title: 'Per-client monthly budgets',
    description: 'Set a single budget cap per client that covers all their campaigns across every connected platform.',
    icon: 'i-lucide-wallet',
    bg: 'bg-blue-100 dark:bg-blue-900/40',
    color: 'text-blue-600 dark:text-blue-400'
  },
  {
    title: 'Per-campaign limits',
    description: 'Granular budget controls at the campaign level with automatic threshold monitoring.',
    icon: 'i-lucide-sliders-horizontal',
    bg: 'bg-emerald-100 dark:bg-emerald-900/40',
    color: 'text-emerald-600 dark:text-emerald-400'
  },
  {
    title: 'Threshold alerts (75 / 90 / 100%)',
    description: 'Get notified as spend approaches the limit. Configurable thresholds per client.',
    icon: 'i-lucide-bell-ring',
    bg: 'bg-amber-100 dark:bg-amber-900/40',
    color: 'text-amber-600 dark:text-amber-400'
  },
  {
    title: 'Immutable audit trail',
    description: 'Every budget change, alert, and adjustment is logged with timestamps and user attribution.',
    icon: 'i-lucide-shield-check',
    bg: 'bg-violet-100 dark:bg-violet-900/40',
    color: 'text-violet-600 dark:text-violet-400'
  },
  {
    title: 'EOM reconciliation',
    description: 'End-of-month reports show budget vs actual with variance analysis per client and campaign.',
    icon: 'i-lucide-file-spreadsheet',
    bg: 'bg-rose-100 dark:bg-rose-900/40',
    color: 'text-rose-600 dark:text-rose-400'
  },
]

const anomalyTypes = [
  {
    title: 'CPC Spike Detection',
    icon: 'i-lucide-trending-up',
    bg: 'bg-rose-50 dark:bg-rose-900/30',
    color: 'text-rose-600 dark:text-rose-400',
    description: 'Flags campaigns where cost-per-click jumps significantly above the rolling average. Catch bidding wars early.'
  },
  {
    title: 'Budget Overrun Alerts',
    icon: 'i-lucide-alert-triangle',
    bg: 'bg-amber-50 dark:bg-amber-900/30',
    color: 'text-amber-600 dark:text-amber-400',
    description: 'Detects campaigns on track to exceed monthly budgets based on current daily spend velocity.'
  },
  {
    title: 'Unusual Spend Patterns',
    icon: 'i-lucide-activity',
    bg: 'bg-violet-50 dark:bg-violet-900/30',
    color: 'text-violet-600 dark:text-violet-400',
    description: 'Identifies spend anomalies — sudden drops, weekend spikes, or erratic daily fluctuations.'
  },
  {
    title: 'ROAS Degradation',
    icon: 'i-lucide-arrow-down-right',
    bg: 'bg-blue-50 dark:bg-blue-900/30',
    color: 'text-blue-600 dark:text-blue-400',
    description: 'Monitors return on ad spend across campaigns. Alerts when ROAS drops below profitable thresholds.'
  },
  {
    title: 'Platform Imbalance',
    icon: 'i-lucide-scale',
    bg: 'bg-emerald-50 dark:bg-emerald-900/30',
    color: 'text-emerald-600 dark:text-emerald-400',
    description: 'Detects when spend allocation across platforms shifts significantly from the planned split.'
  },
  {
    title: 'Conversion Drop-off',
    icon: 'i-lucide-mouse-pointer-click',
    bg: 'bg-indigo-50 dark:bg-indigo-900/30',
    color: 'text-indigo-600 dark:text-indigo-400',
    description: 'Flags campaigns where conversion rates decline while spend remains constant or increases.'
  },
]
</script>
