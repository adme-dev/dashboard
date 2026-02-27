<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e]">
    <MarketingNav active="features" />

    <!-- Hero -->
    <section class="pt-[52px]">
      <div class="max-w-[1200px] mx-auto px-6 pt-32 pb-16 md:pt-44 md:pb-24 text-center">
        <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/[0.08] mb-8">
          <div class="w-1.5 h-1.5 rounded-full bg-blue-500" />
          <span class="text-[13px] text-blue-600 font-medium">Ad Spend</span>
        </div>
        <h1 class="text-[clamp(36px,6vw,64px)] font-[450] text-[#121317] dark:text-white leading-[1.1] tracking-[-0.03em] mb-6 max-w-[800px] mx-auto">
          Track every dollar<br class="hidden sm:block">across platforms
        </h1>
        <p class="text-lg md:text-xl text-[#45474D] dark:text-white/60 max-w-[560px] mx-auto leading-relaxed">
          Meta and Google Ads in one place. OAuth connections, automated spend syncing, campaign breakdowns, and budget management with full audit trails.
        </p>
      </div>
    </section>

    <!-- Platform Cards -->
    <section class="pb-20 md:pb-28">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="grid md:grid-cols-2 gap-6">
          <!-- Meta Ads -->
          <div class="bg-[#f4f5f7] dark:bg-white/[0.03] rounded-2xl p-6 md:p-8">
            <div class="flex items-center gap-3 mb-6">
              <div class="w-11 h-11 rounded-xl bg-blue-100 flex items-center justify-center">
                <UIcon name="i-lucide-megaphone" class="w-5 h-5 text-blue-600" />
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
                <div class="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <UIcon name="i-lucide-check" class="w-3 h-3 text-blue-600" />
                </div>
                <span class="text-[14px] text-[#121317] dark:text-white">{{ feature }}</span>
              </div>
            </div>
          </div>

          <!-- Google Ads -->
          <div class="bg-[#f4f5f7] dark:bg-white/[0.03] rounded-2xl p-6 md:p-8">
            <div class="flex items-center gap-3 mb-6">
              <div class="w-11 h-11 rounded-xl bg-emerald-100 flex items-center justify-center">
                <UIcon name="i-lucide-bar-chart-3" class="w-5 h-5 text-emerald-600" />
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
                <div class="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <UIcon name="i-lucide-check" class="w-3 h-3 text-emerald-600" />
                </div>
                <span class="text-[14px] text-[#121317] dark:text-white">{{ feature }}</span>
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
            Cross-platform aggregation so you see the full picture. Compare Meta and Google side by side, spot trends, and catch overruns before they happen.
          </p>
        </div>
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <div
            v-for="feature in dashboardFeatures"
            :key="feature.title"
            class="rounded-2xl bg-white dark:bg-white/[0.03] p-6 flex flex-col gap-4 group hover:shadow-[0_2px_12px_rgba(0,0,0,0.04)] transition-shadow"
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
                <p class="text-[13px] text-[#45474D]/60 dark:text-white/40 dark:text-white/40 leading-relaxed">{{ alert.description }}</p>
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
          <div class="flex items-center gap-6 text-[13px] text-[#45474D]/60 dark:text-white/40 dark:text-white/40">
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

const dashboardFeatures = [
  {
    title: 'Daily Breakdowns',
    icon: 'i-lucide-calendar-days',
    description: 'See spend by day across both platforms. Spot trends, dips, and spikes at a glance.'
  },
  {
    title: 'Campaign Comparison',
    icon: 'i-lucide-columns-3',
    description: 'Compare Meta and Google campaigns side by side with unified metrics and terminology.'
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
    description: 'Split performance by Meta and Google. See which platform delivers better CPC, CPM, and ROAS.'
  },
]

const budgetAlerts = [
  {
    title: 'Per-client monthly budgets',
    description: 'Set a single budget cap per client that covers all their campaigns across both platforms.',
    icon: 'i-lucide-wallet',
    bg: 'bg-blue-100',
    color: 'text-blue-600'
  },
  {
    title: 'Per-campaign limits',
    description: 'Granular budget controls at the campaign level with automatic threshold monitoring.',
    icon: 'i-lucide-sliders-horizontal',
    bg: 'bg-emerald-100',
    color: 'text-emerald-600'
  },
  {
    title: 'Threshold alerts (75 / 90 / 100%)',
    description: 'Get notified as spend approaches the limit. Configurable thresholds per client.',
    icon: 'i-lucide-bell-ring',
    bg: 'bg-amber-100',
    color: 'text-amber-600'
  },
  {
    title: 'Immutable audit trail',
    description: 'Every budget change, alert, and adjustment is logged with timestamps and user attribution.',
    icon: 'i-lucide-shield-check',
    bg: 'bg-violet-100',
    color: 'text-violet-600'
  },
  {
    title: 'EOM reconciliation',
    description: 'End-of-month reports show budget vs actual with variance analysis per client and campaign.',
    icon: 'i-lucide-file-spreadsheet',
    bg: 'bg-rose-100',
    color: 'text-rose-600'
  },
]

const anomalyTypes = [
  {
    title: 'CPC Spike Detection',
    icon: 'i-lucide-trending-up',
    bg: 'bg-rose-50',
    color: 'text-rose-600',
    description: 'Flags campaigns where cost-per-click jumps significantly above the rolling average. Catch bidding wars early.'
  },
  {
    title: 'Budget Overrun Alerts',
    icon: 'i-lucide-alert-triangle',
    bg: 'bg-amber-50',
    color: 'text-amber-600',
    description: 'Detects campaigns on track to exceed monthly budgets based on current daily spend velocity.'
  },
  {
    title: 'Unusual Spend Patterns',
    icon: 'i-lucide-activity',
    bg: 'bg-violet-50',
    color: 'text-violet-600',
    description: 'Identifies spend anomalies — sudden drops, weekend spikes, or erratic daily fluctuations.'
  },
  {
    title: 'ROAS Degradation',
    icon: 'i-lucide-arrow-down-right',
    bg: 'bg-blue-50',
    color: 'text-blue-600',
    description: 'Monitors return on ad spend across campaigns. Alerts when ROAS drops below profitable thresholds.'
  },
  {
    title: 'Platform Imbalance',
    icon: 'i-lucide-scale',
    bg: 'bg-emerald-50',
    color: 'text-emerald-600',
    description: 'Detects when spend allocation between Meta and Google shifts significantly from the planned split.'
  },
  {
    title: 'Conversion Drop-off',
    icon: 'i-lucide-mouse-pointer-click',
    bg: 'bg-indigo-50',
    color: 'text-indigo-600',
    description: 'Flags campaigns where conversion rates decline while spend remains constant or increases.'
  },
]
</script>
